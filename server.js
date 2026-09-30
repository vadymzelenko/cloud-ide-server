require('dotenv').config();
const fs = require('fs/promises'), fss = require('fs'), os = require('os'), path = require('path');
const http = require('http'), crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express'), multer = require('multer'), rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const { createProxyMiddleware } = require('http-proxy-middleware');
const chokidar = require('chokidar');
const pocket = require('./pocket');

const PORT = +process.env.PORT || 8080;
const TOKEN = process.env.AUTH_TOKEN || '';
if (TOKEN.length < 16) {
  console.error('Задайте AUTH_TOKEN (минимум 16 символов) в .env или в Codespaces secrets');
  process.exit(1);
}
const ROOT = path.resolve(process.env.WORKSPACE_DIR ||
  (fss.existsSync('/workspaces') ? '/workspaces' : path.join(os.homedir(), 'projects')));
fss.mkdirSync(ROOT, { recursive: true });
execFile('tmux', ['-V'], e => { if (e) { console.error('tmux не найден: sudo apt-get install -y tmux'); process.exit(1); } });

const IGNORE = new Set(['.git', 'node_modules', '.next', 'dist', '__pycache__']);
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });

// ---------- auth ----------
const ok = t => { const a = Buffer.from(String(t || '')), b = Buffer.from(TOKEN); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const bearer = req => (req.headers.authorization || '').replace(/^Bearer /, '');
const cookieTok = req => { const m = /(?:^|;\s*)pi_token=([^;]+)/.exec(req.headers.cookie || ''); try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; } };

// ---------- path safety ----------
const safe = p => {
  const r = path.resolve(ROOT, '.' + path.sep + String(p || ''));
  if (r !== ROOT && !r.startsWith(ROOT + path.sep)) throw httpErr(403, 'Путь вне рабочей папки');
  return r;
};
async function walk(dir, depth = 0) {
  const ents = (await fs.readdir(dir, { withFileTypes: true }))
    .filter(e => !IGNORE.has(e.name))
    .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  const out = [];
  for (const e of ents) {
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p);
    out.push(e.isDirectory()
      ? { name: e.name, path: rel, type: 'directory', children: depth < 8 ? await walk(p, depth + 1).catch(() => []) : [] }
      : { name: e.name, path: rel, type: 'file' });
  }
  return out;
}

// атомарная запись: tmp + fsync + rename — файл не останется «наполовину записанным»
async function writeAtomic(f, data) {
  const st = await fs.stat(f).catch(() => null), tmp = `${f}.pi-tmp-${process.pid}`;
  const fh = await fs.open(tmp, 'w', st ? st.mode & 0o777 : 0o644);
  try { await fh.writeFile(data); await fh.sync(); } finally { await fh.close(); }
  await fs.rename(tmp, f);
}

const app = express();
app.set('trust proxy', 1);

// ---------- reverse proxy для Preview: /proxy/:port/* ----------
const portOf = req => /^\/proxy\/(\d{2,5})(?:[/?]|$)/.exec(req.url)?.[1];
const proxy = createProxyMiddleware({
  router: req => `http://127.0.0.1:${portOf(req)}`,
  pathRewrite: p => p.replace(/^\/proxy\/\d+/, '').replace(/^(?!\/)/, '/'),
  changeOrigin: true,
  on: {
    error: (e, req, res) => {
      try {
        if (res.writeHead) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`Порт ${portOf(req)}: ничего не запущено`); }
        else res.destroy();
      } catch {}
    },
  },
});
app.use((req, res, next) => {
  if (!req.url.startsWith('/proxy/')) return next();
  if (!(ok(bearer(req)) || ok(cookieTok(req)))) return res.status(401).send('Unauthorized');
  proxy(req, res, next);
});

// ---------- REST API ----------
const api = express.Router();
api.use(rateLimit({ windowMs: 15 * 60_000, limit: 30, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false }));
api.use((req, res, next) => (ok(bearer(req)) ? next() : res.status(401).send('Unauthorized')));
api.use(express.json({ limit: '20mb' }));

api.get('/ping', (q, r) => r.json({ ok: true, root: ROOT }));
api.get('/fs/tree', async (q, r) => r.json(await walk(ROOT)));
api.get('/fs/read', async (q, r) => {
  const f = safe(q.query.path), st = await fs.stat(f);
  if (!st.isFile() || st.size > 5e6) throw httpErr(413, 'Это не файл или он больше 5 МБ');
  const buf = await fs.readFile(f);
  if (buf.includes(0)) throw httpErr(415, 'Бинарный файл нельзя открыть в редакторе');
  r.type('text/plain; charset=utf-8').send(buf.toString('utf8'));
});
api.post('/fs/write', async (q, r) => {
  const f = safe(q.body.path);
  if (f === ROOT || typeof q.body.content !== 'string') throw httpErr(400, 'Некорректный запрос');
  await fs.mkdir(path.dirname(f), { recursive: true });
  await writeAtomic(f, q.body.content);
  r.json({ ok: true });
});
api.post('/fs/create', async (q, r) => {
  const f = safe(q.body.path);
  if (f === ROOT) throw httpErr(400, 'Пустой путь');
  if (q.body.type === 'directory') await fs.mkdir(f, { recursive: true });
  else { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, '', { flag: 'wx' }); }
  r.json({ ok: true });
});
api.delete('/fs/delete', async (q, r) => {
  const f = safe(q.query.path);
  if (f === ROOT) throw httpErr(403, 'Нельзя удалить корень');
  await fs.rm(f, { recursive: true, force: true });
  r.json({ ok: true });
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
api.post('/fs/upload', upload.array('files'), async (q, r) => {
  const dir = safe(q.query.dir);
  await fs.mkdir(dir, { recursive: true });
  for (const f of q.files || []) {
    const name = path.basename(Buffer.from(f.originalname, 'latin1').toString('utf8'));
    await fs.writeFile(path.join(dir, name), f.buffer);
  }
  r.json({ ok: true, count: (q.files || []).length });
});
api.get('/fs/download', async (q, r) => {
  const f = safe(q.query.path);
  if (!(await fs.stat(f)).isFile()) throw httpErr(400, 'Это не файл');
  r.download(f, path.basename(f), { dotfiles: 'allow' });
});

// ---------- турбоархив: весь проект (или папка) в одном JSON.gz ----------
api.get('/archive', async (q, r) => {
  const dir = safe(q.query.dir), plain = q.query.plain === '1';
  r.type(plain ? 'application/json' : 'application/gzip');
  try { await pocket.pack(r, dir, { name: path.basename(dir), gzip: !plain }); } catch (e) { r.destroy(e); }
});
api.post('/archive/import', upload.single('file'), async (q, r) => {
  if (!q.file) throw httpErr(400, 'Нет файла');
  try { r.json(await pocket.unpack(q.file.buffer, safe(q.query.dir))); } catch (e) { throw httpErr(400, e.message); }
});

const tmux = (...a) => new Promise(res => execFile('tmux', a, (e, out) => res(e ? '' : out)));
api.get('/term', async (q, r) =>
  r.json((await tmux('ls', '-F', '#{session_name}')).split('\n').filter(s => /^pocketide-\d+$/.test(s)).map(s => +s.slice(10))));
api.delete('/term/:id', async (q, r) => {
  if (!/^\d+$/.test(q.params.id)) throw httpErr(400, 'id');
  await tmux('kill-session', '-t', `=pocketide-${q.params.id}`);
  r.json({ ok: true });
});
app.use('/api', api);

// ---------- автообновление дерева: watcher -> SSE ----------
const sse = new Set();
let bumpT;
const bump = () => { clearTimeout(bumpT); bumpT = setTimeout(() => sse.forEach(r => r.write('data: tree\n\n')), 300); };
chokidar.watch(ROOT, {
  ignoreInitial: true, followSymlinks: false,
  ignored: p => { const rel = path.relative(ROOT, p); return rel.split(path.sep).some(s => IGNORE.has(s)) || rel.includes('.pi-tmp-'); },
}).on('all', ev => /^(add|unlink)(Dir)?$/.test(ev) && bump()).on('error', () => {});
app.get('/events', (q, r) => {
  if (!ok(q.query.token)) return r.status(401).end();
  r.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  r.flushHeaders();
  r.write('retry: 3000\n\n');
  sse.add(r);
  const ka = setInterval(() => r.write(': ka\n\n'), 25_000);
  q.on('close', () => { clearInterval(ka); sse.delete(r); });
});

// ---------- статика (Next.js export) ----------
app.use(express.static(path.join(__dirname, 'web', 'out')));
app.use((e, q, r, n) => r.status(e.status || 500).send(e.message || 'Error'));

// ---------- WebSocket: терминал (tmux) ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, sock, head) => {
  const u = new URL(req.url, 'http://x');
  const deny = () => { sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); sock.destroy(); };
  if (u.pathname === '/ws') {
    if (!ok(u.searchParams.get('token'))) return deny();
    wss.handleUpgrade(req, sock, head, ws => wss.emit('connection', ws, u));
  } else if (u.pathname.startsWith('/proxy/')) {
    if (!(ok(cookieTok(req)) || ok(bearer(req)))) return deny();
    proxy.upgrade(req, sock, head);
  } else sock.destroy();
});

wss.on('connection', (ws, u) => {
  const s = u.searchParams.get('s');
  const id = /^\d{1,4}$/.test(s) ? s : '1';
  const cols = +u.searchParams.get('cols') || 80, rows = +u.searchParams.get('rows') || 24;
  // Клиент tmux умирает вместе с сокетом, но сама сессия tmux живёт в фоне и подхватывается при реконнекте.
  const p = pty.spawn('tmux', ['new-session', '-A', '-s', `pocketide-${id}`, ';', 'set', '-g', 'mouse', 'on'], {
    name: 'xterm-256color', cols, rows, cwd: ROOT, env: { ...process.env, TERM: 'xterm-256color' },
  });
  p.onData(d => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'output', data: d })));
  p.onExit(() => ws.close());
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'input' && typeof m.data === 'string') p.write(m.data);
    else if (m.type === 'resize') p.resize(Math.max(2, m.cols | 0), Math.max(2, m.rows | 0));
  });
  ws.on('close', () => { try { p.kill(); } catch {} });
});
// iOS «усыпляет» сокеты без close — вычищаем мёртвые, чтобы не копились клиенты tmux
setInterval(() => wss.clients.forEach(c => { if (!c.alive) return c.terminate(); c.alive = false; c.ping(); }), 30_000);

server.listen(PORT, '0.0.0.0', () => console.log(`PocketIDE: http://localhost:${PORT}  (workspace: ${ROOT})`));
