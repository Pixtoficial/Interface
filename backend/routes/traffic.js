const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

const META_APP_ID     = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL      = (process.env.APP_URL      || 'http://localhost:3001').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || APP_URL).replace(/\/$/, '');

// ── Helpers ───────────────────────────────────────────────
async function saveToken(uid, platform, data) {
  for (const [k, v] of Object.entries(data)) {
    const key = `${platform}_${k}`;
    await supabase.from('settings').upsert(
      { user_id: uid, agent_slug: '_oauth', key, value: String(v) },
      { onConflict: 'user_id,agent_slug,key' }
    );
  }
}

async function getTokenMap(uid, platform) {
  const { data } = await supabase.from('settings').select('key, value')
    .eq('user_id', uid).eq('agent_slug', '_oauth').like('key', `${platform}_%`);
  const out = {};
  for (const r of (data || [])) out[r.key.replace(`${platform}_`, '')] = r.value;
  return out;
}

function verifyQueryToken(req) {
  const raw = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!raw) throw new Error('Token ausente');
  return jwt.verify(raw, process.env.JWT_SECRET || 'pixt-secret-change-me');
}

// ─────────────────────────────────────────────────────────
// META ADS
// ─────────────────────────────────────────────────────────

router.get('/meta/auth', (req, res) => {
  let uid;
  try { uid = verifyQueryToken(req).uid || verifyQueryToken(req).id; } catch { return res.status(401).json({ error: 'Token inválido' }); }
  const state = jwt.sign({ uid }, process.env.JWT_SECRET || 'pixt-secret', { expiresIn: '10m' });
  const redirectUri = `${APP_URL}/api/traffic/meta/callback`;
  const scope = 'ads_read,read_insights,ads_management';
  const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;
  res.redirect(url);
});

router.get('/meta/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect(`${FRONTEND_URL}/?traffic_meta=error`);
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET || 'pixt-secret');
    const uid = decoded.uid;
    const redirectUri = `${APP_URL}/api/traffic/meta/callback`;

    // Troca código por token curto
    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);

    // Troca por token longo (60 dias)
    const longRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();
    const token = longData.access_token || tokenData.access_token;
    const expiresAt = longData.expires_in
      ? Date.now() + longData.expires_in * 1000
      : Date.now() + 60 * 24 * 3600 * 1000;

    await saveToken(uid, 'meta', { access_token: token, expires_at: String(expiresAt) });
    res.redirect(`${FRONTEND_URL}/?traffic_meta=ok`);
  } catch (e) {
    console.error('Meta OAuth:', e.message);
    res.redirect(`${FRONTEND_URL}/?traffic_meta=error`);
  }
});

router.get('/meta/accounts', authRequired, async (req, res) => {
  const t = await getTokenMap(req.user.uid, 'meta');
  if (!t.access_token) return res.status(401).json({ error: 'Meta não conectado' });
  const r = await fetch(
    `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status,currency&access_token=${t.access_token}`
  );
  const d = await r.json();
  if (d.error) return res.status(400).json({ error: d.error.message });
  res.json({ accounts: d.data || [] });
});

router.get('/meta/insights', authRequired, async (req, res) => {
  const t = await getTokenMap(req.user.uid, 'meta');
  if (!t.access_token) return res.status(401).json({ error: 'Meta não conectado' });

  const { account_id, since, until } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id obrigatório' });

  const fields = 'spend,impressions,clicks,reach,cpm,ctr,cpc,actions,cost_per_action_type,conversions';
  const timeRange = JSON.stringify({ since: since || '', until: until || '' });

  const [insRes, campRes] = await Promise.all([
    fetch(`https://graph.facebook.com/v18.0/${account_id}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&time_increment=1&access_token=${t.access_token}`),
    fetch(`https://graph.facebook.com/v18.0/${account_id}/campaigns?fields=id,name,status,spend_cap&limit=20&access_token=${t.access_token}`),
  ]);

  const [insData, campData] = await Promise.all([insRes.json(), campRes.json()]);
  if (insData.error) return res.status(400).json({ error: insData.error.message });

  res.json({ insights: insData.data || [], campaigns: campData.data || [] });
});

// ─────────────────────────────────────────────────────────
// GOOGLE (GA4 + Calendar)
// ─────────────────────────────────────────────────────────

router.get('/google/auth', (req, res) => {
  let uid;
  try { uid = verifyQueryToken(req).uid || verifyQueryToken(req).id; } catch { return res.status(401).json({ error: 'Token inválido' }); }
  const state = jwt.sign({ uid }, process.env.JWT_SECRET || 'pixt-secret', { expiresIn: '10m' });
  const redirectUri = `${APP_URL}/api/traffic/google/callback`;
  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' ');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&access_type=offline&response_type=code&prompt=consent&state=${encodeURIComponent(state)}`;
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect(`${FRONTEND_URL}/?traffic_google=error`);
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET || 'pixt-secret');
    const uid = decoded.uid;
    const redirectUri = `${APP_URL}/api/traffic/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    await saveToken(uid, 'google', {
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token || '',
      expires_at:    String(Date.now() + (tokenData.expires_in || 3600) * 1000),
    });
    res.redirect(`${FRONTEND_URL}/?traffic_google=ok`);
  } catch (e) {
    console.error('Google OAuth:', e.message);
    res.redirect(`${FRONTEND_URL}/?traffic_google=error`);
  }
});

async function refreshGoogleToken(uid) {
  const t = await getTokenMap(uid, 'google');
  if (!t.refresh_token) throw new Error('Google não conectado');
  if (t.access_token && t.expires_at && Date.now() < parseInt(t.expires_at) - 60_000) return t.access_token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: t.refresh_token, client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error_description || d.error);
  await saveToken(uid, 'google', {
    access_token: d.access_token,
    expires_at:   String(Date.now() + (d.expires_in || 3600) * 1000),
  });
  return d.access_token;
}

router.get('/ga4/properties', authRequired, async (req, res) => {
  try {
    const token = await refreshGoogleToken(req.user.uid);
    const r = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    const props = [];
    for (const acc of (d.accountSummaries || [])) {
      for (const p of (acc.propertySummaries || [])) {
        props.push({ id: p.property, name: p.displayName, account: acc.displayName });
      }
    }
    res.json({ properties: props });
  } catch (e) { res.status(401).json({ error: e.message }); }
});

router.get('/ga4/metrics', authRequired, async (req, res) => {
  try {
    const token = await refreshGoogleToken(req.user.uid);
    const { property_id, since, until } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id obrigatório' });
    const body = {
      dateRanges: [{ startDate: since || '30daysAgo', endDate: until || 'today' }],
      metrics: [
        { name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' },
        { name: 'engagementRate' }, { name: 'screenPageViews' }, { name: 'conversions' },
        { name: 'bounceRate' }, { name: 'averageSessionDuration' },
      ],
      dimensions: [{ name: 'date' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    };
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property_id}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    res.json(d);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// ── Google Calendar ───────────────────────────────────────

router.get('/calendar/events', authRequired, async (req, res) => {
  try {
    const token = await refreshGoogleToken(req.user.uid);
    const { timeMin, timeMax } = req.query;
    const params = new URLSearchParams({
      orderBy: 'startTime', singleEvents: 'true',
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      maxResults: '50',
    });
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    res.json({ events: d.items || [] });
  } catch (e) { res.status(401).json({ error: e.message }); }
});

router.post('/calendar/events', authRequired, async (req, res) => {
  try {
    const token = await refreshGoogleToken(req.user.uid);
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    res.json(d);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// ── Status & Disconnect ───────────────────────────────────

router.get('/status', authRequired, async (req, res) => {
  const { data } = await supabase.from('settings').select('key')
    .eq('user_id', req.user.uid).eq('agent_slug', '_oauth');
  const keys = new Set((data || []).map(r => r.key));
  res.json({ meta: keys.has('meta_access_token'), google: keys.has('google_refresh_token') });
});

router.delete('/disconnect/:platform', authRequired, async (req, res) => {
  await supabase.from('settings').delete()
    .eq('user_id', req.user.uid).eq('agent_slug', '_oauth')
    .like('key', `${req.params.platform}_%`);
  res.json({ ok: true });
});

module.exports = router;
