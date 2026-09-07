// POST /api/low-stock-alert
// Sends a low-stock warning email through Resend. Runs server-side only, so the
// Resend API key and recipient address never reach the browser bundle.
//
// Body: { product: { name, sku, stock_current, stock_minimum, unit }, movement?: { type, quantity }, actor?: string }
//
// Env vars:
//   RESEND_API_KEY         (required)  Resend API token
//   LOW_STOCK_ALERT_EMAIL  (required)  recipient of the alerts
//   RESEND_FROM            (optional)  sender, defaults to onboarding@resend.dev
//   SUPABASE_URL / SUPABASE_ANON_KEY  (optional) — when both are set the caller
//                          must present a valid Supabase user token.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Multiservicios J. Nieto <onboarding@resend.dev>';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel pre-parsed
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function verifyCaller(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return true; // auth check disabled

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;

  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LOW_STOCK_ALERT_EMAIL;
  const from = process.env.RESEND_FROM || DEFAULT_FROM;

  if (!apiKey || !to) {
    return json(res, 500, {
      error: 'Faltan variables de entorno: RESEND_API_KEY y/o LOW_STOCK_ALERT_EMAIL',
    });
  }

  if (!(await verifyCaller(req))) {
    return json(res, 401, { error: 'No autorizado' });
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    return json(res, 400, { error: 'JSON inválido' });
  }

  const product = payload.product || {};
  if (!product.name) return json(res, 400, { error: 'Falta product.name' });

  const current = Number(product.stock_current ?? 0);
  const min = Number(product.stock_minimum ?? 0);
  const unit = product.unit ? ` ${product.unit}` : '';
  const sku = product.sku ? String(product.sku) : '—';
  const isOut = current <= 0;
  const subject = isOut
    ? `⛔ Sin stock: ${product.name}`
    : `⚠️ Stock bajo: ${product.name}`;

  const actor = payload.actor ? ` · Registrado por ${escapeHtml(payload.actor)}` : '';
  const movement = payload.movement
    ? `<p style="margin:0 0 4px;color:#5f6368;font-size:13px">Movimiento: ${escapeHtml(payload.movement.type)} de ${escapeHtml(payload.movement.quantity)}${actor}</p>`
    : '';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:12px">
      <h2 style="margin:0 0 4px;color:#055845;font-size:18px">Multiservicios J. Nieto</h2>
      <p style="margin:0 0 16px;color:#80868b;font-size:13px">Aviso automático de inventario</p>
      <div style="padding:16px;border-radius:8px;background:${isOut ? '#fce8e6' : '#fef7e0'}">
        <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#202124">
          ${isOut ? 'Producto sin stock' : 'Producto con stock bajo'}
        </p>
        <p style="margin:0;font-size:14px;color:#202124">${escapeHtml(product.name)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#5f6368">SKU ${escapeHtml(sku)}</p>
      </div>
      <table style="margin:16px 0 0;font-size:14px;color:#202124;border-collapse:collapse">
        <tr><td style="padding:2px 12px 2px 0;color:#5f6368">Stock actual</td><td style="font-weight:600">${current}${unit}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5f6368">Stock mínimo</td><td style="font-weight:600">${min}${unit}</td></tr>
      </table>
      ${movement}
      <p style="margin:16px 0 0;font-size:12px;color:#80868b">Reabastece este producto para restablecer el nivel de inventario.</p>
    </div>`;

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return json(res, r.status, { error: data.message || data.name || 'Error de Resend', detail: data });
    }
    return json(res, 200, { id: data.id, to });
  } catch (e) {
    return json(res, 502, { error: e.message || 'No se pudo contactar a Resend' });
  }
};
