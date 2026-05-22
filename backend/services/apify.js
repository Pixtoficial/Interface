const APIFY_KEY = process.env.APIFY_API_KEY;
const BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'nwua9Gu5YrADL7ZDj'; // compass/google-maps-scraper

async function startRun({ searchTerm, location, maxResults = 50, minRating }) {
  const query = location ? `${searchTerm} ${location}` : searchTerm;
  const input = {
    searchStringsArray: [query],
    maxCrawledPlacesPerSearch: Math.min(parseInt(maxResults) || 50, 200),
    language: 'pt',
    exportPlaceUrls: true,
    includeHistogram: false,
    includeOpeningHours: false,
    includePeopleAlsoSearch: false,
  };
  if (minRating) input.minStarRating = parseFloat(minRating);

  const r = await fetch(`${BASE}/acts/${ACTOR_ID}/runs?token=${APIFY_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Apify error ${r.status}: ${txt}`);
  }
  const data = await r.json();
  return data.data; // { id, status, defaultDatasetId, ... }
}

async function getRunStatus(apifyRunId) {
  const r = await fetch(`${BASE}/actor-runs/${apifyRunId}?token=${APIFY_KEY}`);
  if (!r.ok) throw new Error(`Apify status error ${r.status}`);
  const data = await r.json();
  return data.data; // { id, status, ... }
}

async function getRunItems(apifyRunId, limit = 200) {
  const r = await fetch(`${BASE}/actor-runs/${apifyRunId}/dataset/items?token=${APIFY_KEY}&limit=${limit}&format=json`);
  if (!r.ok) throw new Error(`Apify items error ${r.status}`);
  const items = await r.json();
  return Array.isArray(items) ? items : (items.items || []);
}

module.exports = { startRun, getRunStatus, getRunItems };
