// Local dev server for the /api functions, so `ng serve` can proxy to them.
// In production these run as Vercel serverless functions (the api/ folder).
//
//   npm run dev        → runs this + `ng serve` together
//   npm run dev:api     → runs only this (port 3001)
const http = require('http');
const { resolve } = require('path');

try {
  require('dotenv').config({ path: resolve(__dirname, '../.env') });
} catch {
  /* dotenv missing — rely on the ambient environment */
}

const PORT = Number(process.env.DEV_API_PORT || 3001);

const routes = {
  '/api/low-stock-alert': require('../api/low-stock-alert.js'),
};

const server = http.createServer(async (req, res) => {
  const path = (req.url || '').split('?')[0];
  const handler = routes[path];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Not found' }));
  }
  try {
    await handler(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e && e.message ? e.message : 'Internal error' }));
  }
});

server.listen(PORT, () => {
  console.log(`▶  dev-api escuchando en http://localhost:${PORT}`);
  for (const p of Object.keys(routes)) console.log(`   ${p}`);
});
