const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/:agent', authRequired, async (req, res) => {
  const agent = req.params.agent;
  const uid = req.user.uid;

  const [
    { data: leads },
    { count: convCount },
    { count: eventsCount },
  ] = await Promise.all([
    supabase.from('leads').select('stage, amount').eq('user_id', uid).eq('agent_slug', agent),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('agent_slug', agent),
    supabase.from('calendar_events').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('agent_slug', agent),
  ]);

  const leadCounts = {};
  let closedCount = 0;
  let closedTotal = 0;
  let totalLeads = 0;

  for (const l of (leads || [])) {
    totalLeads++;
    leadCounts[l.stage] = (leadCounts[l.stage] || 0) + 1;
    if (l.stage === 'closed') { closedCount++; closedTotal += Number(l.amount) || 0; }
  }

  // Contagem de mensagens (via conversas do usuário)
  const { data: convIds } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', uid)
    .eq('agent_slug', agent);

  let interactions = 0;
  if (convIds && convIds.length) {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convIds.map(c => c.id));
    interactions = count || 0;
  }

  const leadCountsArray = Object.entries(leadCounts).map(([stage, count]) => ({ stage, count }));
  const events = eventsCount || 0;
  const conv = convCount || 0;

  let hero = '—';
  let heroLabel = 'Métrica';
  if (agent === 'vendas') { hero = `R$ ${closedTotal.toLocaleString('pt-BR')}`; heroLabel = 'Receita Fechada'; }
  else if (agent === 'leadflow') { hero = `${totalLeads}`; heroLabel = 'Leads no CRM'; }
  else if (agent === 'booker') { hero = `${events}`; heroLabel = 'Eventos Sincronizados'; }
  else if (agent === 'pixt-bdr') {
    const { count: runsCount } = await supabase
      .from('scrapper_runs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);
    const { count: scLeadsCount } = await supabase
      .from('scrapper_leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);
    hero = `${scLeadsCount || 0}`; heroLabel = 'Leads Prospectados';
  } else if (agent === 'custom') {
    const { count: wfsCount } = await supabase
      .from('workflows')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);
    hero = `${wfsCount || 0}`; heroLabel = 'Workflows Ativos';
  }

  const conversionRate = totalLeads ? ((closedCount / totalLeads) * 100).toFixed(1) + '%' : '0%';
  const avgTicket = closedCount ? `R$ ${(closedTotal / closedCount).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'R$ 0';

  res.json({
    hero, heroLabel,
    cards: {
      interactions,
      conversations: conv,
      activeLeads: leadCounts['in_progress'] || 0,
      events,
    },
    extras: {
      conversionRate,
      avgTicket,
      leadCounts: leadCountsArray,
      closed: { c: closedCount, total: closedTotal },
    },
  });
});

module.exports = router;
