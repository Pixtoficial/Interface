const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const { chat } = require('../services/ai');
const apify = require('../services/apify');

const router = express.Router();

async function getRepeatedPhones(uid, currentRunId, phones) {
  if (!phones.length) return new Set();
  const { data } = await supabase
    .from('scrapper_leads').select('phone')
    .eq('user_id', uid).neq('run_id', currentRunId)
    .in('phone', phones);
  return new Set((data || []).map(r => r.phone).filter(Boolean));
}

function buildStats(leads) {
  return {
    total:     leads.length,
    potential: leads.filter(l => (l.score || 0) >= 60).length,
    repeated:  leads.filter(l => l.is_repeated).length,
  };
}

/* ----------------------------------------------------------
   Start a scraping run
---------------------------------------------------------- */
router.post('/run', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const { search_term, location, max_results = 50, min_rating, max_rating, min_reviews, max_reviews } = req.body || {};
  if (!search_term) return res.status(400).json({ error: 'search_term obrigatório' });

  let apifyRunId = null;
  try {
    const runData = await apify.startRun({ searchTerm: search_term, location, maxResults: max_results, minRating: min_rating });
    apifyRunId = runData?.id;
  } catch (e) {
    return res.status(500).json({ error: `Erro ao iniciar scraping: ${e.message}` });
  }

  const { data: run, error } = await supabase.from('scrapper_runs').insert({
    user_id: uid,
    agent_slug: 'pixt-bdr',
    apify_run_id: apifyRunId,
    status: 'running',
    filters: { search_term, location, max_results, min_rating, max_rating, min_reviews, max_reviews },
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ run });
});

/* ----------------------------------------------------------
   List runs for the user
---------------------------------------------------------- */
router.get('/runs', authRequired, async (req, res) => {
  const { data: runs, error } = await supabase
    .from('scrapper_runs').select('*')
    .eq('user_id', req.user.uid)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ runs: runs || [] });
});

/* ----------------------------------------------------------
   Check run status (polls Apify if still running)
---------------------------------------------------------- */
router.get('/runs/:runId/status', authRequired, async (req, res) => {
  const { data: run, error: notFound } = await supabase
    .from('scrapper_runs').select('*').eq('id', req.params.runId).eq('user_id', req.user.uid).single();
  if (notFound || !run) return res.status(404).json({ error: 'Run não encontrado' });

  if (run.status === 'running' && run.apify_run_id) {
    try {
      const apifyRun = await apify.getRunStatus(run.apify_run_id);
      const s = apifyRun?.status;
      let newStatus = run.status;
      if (s === 'SUCCEEDED') newStatus = 'ready_to_analyze';
      else if (s === 'FAILED' || s === 'ABORTED' || s === 'TIMED-OUT') newStatus = 'failed';
      if (newStatus !== run.status) {
        await supabase.from('scrapper_runs').update({ status: newStatus }).eq('id', run.id);
        run.status = newStatus;
      }
    } catch {}
  }

  res.json({ run });
});

/* ----------------------------------------------------------
   Analyze results with Claude AI
---------------------------------------------------------- */
router.post('/runs/:runId/analyze', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const { data: run, error: notFound } = await supabase
    .from('scrapper_runs').select('*').eq('id', req.params.runId).eq('user_id', uid).single();
  if (notFound || !run) return res.status(404).json({ error: 'Run não encontrado' });

  if (!['ready_to_analyze', 'done'].includes(run.status)) {
    return res.status(400).json({ error: 'Run ainda não finalizado pelo Apify' });
  }

  if (run.analyzed) {
    const { data: leads } = await supabase.from('scrapper_leads').select('*').eq('run_id', run.id).order('score', { ascending: false });
    const phones = (leads || []).map(l => l.phone).filter(Boolean);
    const repeatedPhones = await getRepeatedPhones(uid, run.id, phones);
    const leadsOut = (leads || []).map(l => ({ ...l, is_repeated: l.phone ? repeatedPhones.has(l.phone) : false }));
    return res.json({ leads: leadsOut, stats: buildStats(leadsOut), already_analyzed: true });
  }

  // Fetch raw items from Apify
  let items = [];
  try {
    items = await apify.getRunItems(run.apify_run_id, 200);
  } catch (e) {
    return res.status(500).json({ error: `Erro ao buscar resultados do Apify: ${e.message}` });
  }

  // Filtro por review_count (tamanho da empresa)
  const runFilters = run.filters || {};
  const minReviews = parseInt(runFilters.min_reviews || '0') || 0;
  const maxReviews = parseInt(runFilters.max_reviews || '0') || 0;
  if (minReviews || maxReviews) {
    items = items.filter(item => {
      const rc = parseInt(item.reviewsCount || item.reviewCount || 0);
      if (minReviews && rc < minReviews) return false;
      if (maxReviews && rc > maxReviews) return false;
      return true;
    });
  }

  // Filtro por rating máximo (Apify só suporta min natively)
  const maxRating = parseFloat(runFilters.max_rating || '0') || 0;
  if (maxRating) {
    items = items.filter(item => {
      const r = parseFloat(item.totalScore || item.rating || 0);
      return !r || r <= maxRating;
    });
  }

  // Deduplicate by phone (within this run)
  const seenPhones = new Set();
  const unique = [];
  for (const item of items) {
    const raw = item.phone || item.phoneNumber || '';
    const phone = raw.replace(/\D/g, '');
    if (phone && seenPhones.has(phone)) continue;
    if (phone) seenPhones.add(phone);
    unique.push(item);
  }

  // Analyze each item with Claude (batch up to 80)
  const toAnalyze = unique.slice(0, 80);
  const rows = [];

  for (const item of toAnalyze) {
    let analysis = { score: 50, revenue_estimate: 'Não estimado', company_size: 'micro', insight: 'Análise indisponível' };
    try {
      const prompt = `Analise este negócio e retorne um JSON:
Nome: ${item.title || item.name || 'N/A'}
Categoria: ${Array.isArray(item.categories) ? item.categories.join(', ') : (item.category || 'N/A')}
Avaliação: ${item.totalScore || item.rating || 'N/A'} (${item.reviewsCount || item.reviewCount || 0} avaliações)
Endereço: ${item.address || 'N/A'}
Cidade: ${item.city || 'N/A'}
Telefone: ${item.phone || item.phoneNumber || 'N/A'}
Site: ${item.website || 'N/A'}

Retorne APENAS o JSON válido (sem markdown):
{"score":0-100,"revenue_estimate":"ex: R$50k-R$200k/mês","company_size":"micro|pequena|media|grande","insight":"uma frase sobre por que é um bom ou mau lead"}`;

      const text = await chat({
        system: 'Você analisa leads de negócios para prospecção comercial. Responda apenas com JSON válido.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 150,
      });

      const cleaned = text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
      try { analysis = JSON.parse(cleaned); } catch {}
    } catch {}

    rows.push({
      run_id: run.id,
      user_id: uid,
      name: item.title || item.name || 'Sem nome',
      category: Array.isArray(item.categories) ? item.categories.slice(0, 2).join(', ') : (item.category || null),
      phone: (item.phone || item.phoneNumber || '').replace(/\D/g, '') || null,
      address: item.address || null,
      city: item.city || null,
      rating: item.totalScore || item.rating || null,
      review_count: parseInt(item.reviewsCount || item.reviewCount || 0),
      website: item.website || null,
      score: typeof analysis.score === 'number' ? Math.max(0, Math.min(100, analysis.score)) : 50,
      revenue_estimate: analysis.revenue_estimate || null,
      company_size: analysis.company_size || 'micro',
      insight: analysis.insight || null,
    });
  }

  if (rows.length) await supabase.from('scrapper_leads').insert(rows);
  await supabase.from('scrapper_runs').update({ status: 'done', analyzed: true, results_count: rows.length }).eq('id', run.id);

  const { data: leads } = await supabase.from('scrapper_leads').select('*').eq('run_id', run.id).order('score', { ascending: false });
  const phones = (leads || []).map(l => l.phone).filter(Boolean);
  const repeatedPhones = await getRepeatedPhones(uid, run.id, phones);
  const leadsOut = (leads || []).map(l => ({ ...l, is_repeated: l.phone ? repeatedPhones.has(l.phone) : false }));
  res.json({ leads: leadsOut, stats: buildStats(leadsOut) });
});

/* ----------------------------------------------------------
   Get results of an already-analyzed run
---------------------------------------------------------- */
router.get('/runs/:runId/results', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const { data: run } = await supabase.from('scrapper_runs').select('*').eq('id', req.params.runId).eq('user_id', uid).single();
  if (!run) return res.status(404).json({ error: 'Run não encontrado' });
  const { data: leads } = await supabase.from('scrapper_leads').select('*').eq('run_id', run.id).order('score', { ascending: false });
  res.json({ run, leads: leads || [] });
});

/* ----------------------------------------------------------
   Import selected leads to pipeline
---------------------------------------------------------- */
router.post('/runs/:runId/import', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const { lead_ids } = req.body || {};
  if (!Array.isArray(lead_ids) || !lead_ids.length) return res.status(400).json({ error: 'lead_ids obrigatório' });

  const { data: scLeads } = await supabase.from('scrapper_leads').select('*').in('id', lead_ids).eq('user_id', uid);
  if (!scLeads?.length) return res.status(404).json({ error: 'Leads não encontrados' });

  const pipelineRows = scLeads.map(l => ({
    user_id: uid,
    agent_slug: 'pixt-bdr',
    name: l.name,
    company: l.name,
    score: l.score || 0,
    tag: l.category || null,
    stage: 'new',
    position: 0,
    color_type: 'default',
  }));

  await supabase.from('leads').insert(pipelineRows);
  await supabase.from('scrapper_leads').update({ imported: true }).in('id', lead_ids);

  res.json({ ok: true, count: pipelineRows.length });
});

/* ----------------------------------------------------------
   Send prospecting WhatsApp messages
---------------------------------------------------------- */
router.post('/prospect', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const { lead_ids, template, instance } = req.body || {};
  if (!Array.isArray(lead_ids) || !lead_ids.length) return res.status(400).json({ error: 'lead_ids obrigatório' });
  if (!template) return res.status(400).json({ error: 'template obrigatório' });

  const { data: scLeads } = await supabase.from('scrapper_leads').select('*').in('id', lead_ids).eq('user_id', uid);
  if (!scLeads?.length) return res.status(404).json({ error: 'Leads não encontrados' });

  const { data: settingsRows } = await supabase.from('settings').select('key, value').eq('user_id', uid).eq('agent_slug', 'pixt-bdr');
  const settings = {};
  for (const r of (settingsRows || [])) settings[r.key] = r.value;

  const instanceName = instance || settings.evolution_instance || 'caio';
  const delayMs = parseInt(settings.prospect_delay_seconds || '10') * 1000;
  const { sendText } = require('../services/evolution');

  let sent = 0;
  const errors = [];

  for (const lead of scLeads) {
    if (!lead.phone) { errors.push({ name: lead.name, error: 'Sem telefone' }); continue; }

    const msg = template
      .replace(/\{\{nome\}\}/gi, lead.name)
      .replace(/\{\{categoria\}\}/gi, lead.category || '')
      .replace(/\{\{cidade\}\}/gi, lead.city || '')
      .replace(/\{\{score\}\}/gi, String(lead.score || 0));

    try {
      await sendText({ instance: instanceName, phone: lead.phone, text: msg });
      sent++;
    } catch (e) {
      errors.push({ name: lead.name, error: e.message });
    }

    if (delayMs > 0 && scLeads.indexOf(lead) < scLeads.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  res.json({ sent, errors, total: scLeads.length });
});

/* ----------------------------------------------------------
   Todos os leads importados do usuário (tabela geral)
---------------------------------------------------------- */
router.get('/leads', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const page = Math.max(0, parseInt(req.query.page || '0'));
  const limit = Math.min(500, parseInt(req.query.limit || '200'));
  const search = (req.query.search || '').trim();

  let query = supabase
    .from('scrapper_leads')
    .select('id, name, phone, website, score, category, city, rating, review_count, insight, revenue_estimate, company_size, imported, created_at', { count: 'exact' })
    .eq('user_id', uid)
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (search) query = query.ilike('name', `%${search}%`);

  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ leads: data || [], total: count || 0 });
});

module.exports = router;
