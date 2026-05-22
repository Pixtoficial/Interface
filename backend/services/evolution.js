const base = () => (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const key  = () => process.env.EVOLUTION_API_KEY || '';

async function sendText(instance, number, text) {
  const url = `${base()}/message/sendText/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key() },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchInstances() {
  const url = `${base()}/instance/fetchInstances`;
  const res = await fetch(url, { headers: { apikey: key() } });
  if (!res.ok) throw new Error(`Evolution API ${res.status}`);
  return res.json();
}

module.exports = { sendText, fetchInstances };
