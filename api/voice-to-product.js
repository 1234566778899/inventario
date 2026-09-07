// POST /api/voice-to-product
// Turns a dictated sentence into structured product fields using Gemini.
// Runs server-side only, so GEMINI_API_KEY never reaches the browser bundle.
//
// Body: {
//   text: string,                          // the transcript
//   categories?: [{ id, name }],           // to map onto real ids
//   suppliers?:  [{ id, name }],
//   units?: string[]                       // allowed unit values
// }
// Returns: { product: { …fields… } }
//
// Env vars:
//   GEMINI_API_KEY  (required)
//   GEMINI_MODEL    (optional, defaults to gemini-3.6-flash)
//   SUPABASE_URL / SUPABASE_ANON_KEY  (optional) — when both are set the caller
//                   must present a valid Supabase user token.

const DEFAULT_MODEL = 'gemini-3.6-flash';
const GEMINI_HOST = 'https://generativelanguage.googleapis.com/v1beta/models';

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

/** Only the fields the form can actually take, so Gemini cannot invent columns. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sku: { type: 'STRING', description: 'Código SKU si se dictó. Cadena vacía si no.' },
    name: { type: 'STRING', description: 'Nombre corto y comercial del producto.' },
    description: { type: 'STRING', description: 'Detalle adicional. Cadena vacía si no aplica.' },
    unit: { type: 'STRING', description: 'Unidad de medida en singular.' },
    price: { type: 'NUMBER', description: 'Precio de venta. 0 si no se dictó.' },
    cost: { type: 'NUMBER', description: 'Costo de compra. 0 si no se dictó.' },
    stock_current: { type: 'INTEGER', description: 'Stock actual. 0 si no se dictó.' },
    stock_minimum: { type: 'INTEGER', description: 'Stock mínimo. 0 si no se dictó.' },
    location: { type: 'STRING', description: 'Ubicación en bodega. Cadena vacía si no.' },
    category_id: { type: 'STRING', description: 'Id EXACTO de la lista de categorías, o cadena vacía.' },
    supplier_id: { type: 'STRING', description: 'Id EXACTO de la lista de proveedores, o cadena vacía.' },
  },
  required: ['name'],
};

function buildPrompt({ text, categories, suppliers, units }) {
  const list = (items) =>
    items.length ? items.map((i) => `- ${i.id} = ${i.name}`).join('\n') : '(ninguna)';

  return [
    'Texto dictado por el encargado de la ferretería:',
    `"""${text}"""`,
    '',
    'Categorías disponibles (usa el id EXACTO, o cadena vacía si ninguna encaja):',
    list(categories),
    '',
    'Proveedores disponibles (usa el id EXACTO, o cadena vacía si ninguno encaja):',
    list(suppliers),
    '',
    `Unidades de medida válidas: ${units.length ? units.join(', ') : 'unidad'}`,
  ].join('\n');
}

const SYSTEM_INSTRUCTION = [
  'Eres un asistente que registra productos en el inventario de una ferretería peruana.',
  'A partir de una frase dictada en español, extraes los campos del producto.',
  'Reglas:',
  '- Los montos están en soles (S/). Devuelve solo el número, sin símbolo.',
  '- "precio" es precio de venta; "costo" es lo que se paga al proveedor.',
  '- Si un dato no se dictó, devuelve 0 para números y cadena vacía para texto. NUNCA inventes.',
  '- El nombre debe ser comercial y legible, con mayúscula inicial. No repitas ahí el precio ni el stock.',
  '- La unidad va en singular y debe salir de la lista de unidades válidas.',
  '- Para categoría y proveedor devuelve el id exacto de la lista; si dudas, cadena vacía.',
].join('\n');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(res, 500, { error: 'Falta la variable de entorno GEMINI_API_KEY' });

  if (!(await verifyCaller(req))) return json(res, 401, { error: 'No autorizado' });

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    return json(res, 400, { error: 'JSON inválido' });
  }

  const text = String(payload.text ?? '').trim();
  if (!text) return json(res, 400, { error: 'Falta el texto dictado' });

  const categories = Array.isArray(payload.categories) ? payload.categories : [];
  const suppliers = Array.isArray(payload.suppliers) ? payload.suppliers : [];
  const units = Array.isArray(payload.units) ? payload.units : [];

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    const r = await fetch(`${GEMINI_HOST}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: buildPrompt({ text, categories, suppliers, units }) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return json(res, r.status, { error: data.error?.message || 'Error de Gemini' });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return json(res, 502, { error: 'Gemini no devolvió contenido' });

    let product;
    try {
      product = JSON.parse(raw);
    } catch {
      return json(res, 502, { error: 'Gemini devolvió un JSON inválido' });
    }

    // The model can still hallucinate an id — only let through ones that exist.
    const validId = (id, items) => (items.some((i) => i.id === id) ? id : '');
    product.category_id = validId(product.category_id, categories);
    product.supplier_id = validId(product.supplier_id, suppliers);

    return json(res, 200, { product });
  } catch (e) {
    return json(res, 502, { error: e.message || 'No se pudo contactar a Gemini' });
  }
};
