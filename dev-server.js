// Local dev server — mimics Vercel serverless functions
// Usage: node dev-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load .env manually
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim();
  });
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.json': 'application/json',
};

function makeRes(res) {
  const headers = {};
  return {
    setHeader: (k, v) => { headers[k] = v; res.setHeader(k, v); },
    status: (code) => ({
      json: (body) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); },
      end: () => { res.writeHead(code, headers); res.end(); },
    }),
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    const name = pathname.replace('/api/', '').replace(/\/$/, '');
    const handlerPath = path.join(__dirname, 'api', `${name}.js`);
    if (!fs.existsSync(handlerPath)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    // Clear require cache so changes are picked up
    delete require.cache[require.resolve(handlerPath)];
    const handler = require(handlerPath);
    const body = await new Promise(resolve => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    const mockReq = { method: req.method, query: parsed.query, body };
    try { await handler(mockReq, makeRes(res)); } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Serve static files from /public
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(3001, () => console.log('Dev server running at http://localhost:3000'));
