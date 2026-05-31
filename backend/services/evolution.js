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

async function createInstance(instanceName) {
  const url = `${base()}/instance/create`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key() },
    body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }
  return res.json();
}

async function getQRCode(instanceName) {
  const url = `${base()}/instance/connect/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, { headers: { apikey: key() } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }
  return res.json();
}

async function getConnectionState(instanceName) {
  const url = `${base()}/instance/connectionState/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, { headers: { apikey: key() } });
  if (!res.ok) throw new Error(`Evolution API ${res.status}`);
  return res.json();
}

async function deleteInstance(instanceName) {
  const url = `${base()}/instance/delete/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, { method: 'DELETE', headers: { apikey: key() } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }
  return res.json();
}

async function setWebhook(instanceName, webhookUrl) {
  const url = `${base()}/webhook/set/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key() },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }
  return res.json();
}

module.exports = { sendText, fetchInstances, createInstance, getQRCode, getConnectionState, deleteInstance, setWebhook };
