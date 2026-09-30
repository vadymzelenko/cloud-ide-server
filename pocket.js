#!/usr/bin/env node
// PocketIDE turbo-archive: весь проект в одном JSON (+gzip). Работает без зависимостей, скопируйте этот файл на ПК.
//   node pocket.js pack   <папка> [архив.pocket.json.gz] [--plain]
//   node pocket.js unpack <архив> [папка]
//   node pocket.js list   <архив>
const fs = require('fs'), fsp = fs.promises, path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { PassThrough } = require('stream'), { finished } = require('stream/promises');
const FORMAT = 'pocketide-archive', MAX_FILE = 50 * 1024 * 1024;
const IGNORE = new Set(['.git', 'node_modules', '.next', 'dist', '__pycache__']);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const isText = b => !b.includes(0) && Buffer.from(b.toString('utf8'), 'utf8').equals(b);

async function* walk(root, rel = '') {
  const ents = (await fsp.readdir(path.join(root, rel), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of ents) {
    if (IGNORE.has(e.name) || e.name.includes('.pi-tmp-') || e.isSymbolicLink()) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { yield { dir: r }; yield* walk(root, r); } else if (e.isFile()) yield { file: r };
  }
}

async function pack(out, root, { name, gzip = true } = {}) {
  root = path.resolve(root);
  const gz = gzip ? zlib.createGzip({ level: 9 }) : new PassThrough();
  gz.pipe(out);
  const write = s => gz.write(s) || new Promise(r => gz.once('drain', r));
  await write(`{"format":"${FORMAT}","version":1,"created":${JSON.stringify(new Date().toISOString())},"name":${JSON.stringify(name || path.basename(root))},"files":[`);
  const dirs = [], skipped = [];
  let n = 0;
  for await (const e of walk(root)) {
    if (e.dir) { dirs.push(e.dir); continue; }
    try {
      const abs = path.join(root, e.file), st = await fsp.stat(abs);
      if (st.size > MAX_FILE) { skipped.push(e.file); continue; }
      const buf = await fsp.readFile(abs), text = isText(buf);
      await write((n++ ? ',\n' : '\n') + JSON.stringify({
        path: e.file, enc: text ? 'utf8' : 'base64', size: buf.length, mode: st.mode & 0o777,
        mtime: Math.round(st.mtimeMs), sha256: sha(buf), content: buf.toString(text ? 'utf8' : 'base64'),
      }));
    } catch { skipped.push(e.file); }
  }
  await write(`\n],"dirs":${JSON.stringify(dirs)},"skipped":${JSON.stringify(skipped)}}\n`);
  gz.end();
  await finished(out);
  return { files: n, skipped };
}

function parse(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const a = JSON.parse(buf.toString('utf8'));
  if (a.format !== FORMAT || !Array.isArray(a.files)) throw new Error('Это не архив PocketIDE');
  return a;
}

async function unpack(buf, outDir) {
  const a = parse(buf);
  outDir = path.resolve(outDir);
  const inside = rel => {
    const p = path.resolve(outDir, rel);
    if (p !== outDir && !p.startsWith(outDir + path.sep)) throw new Error('Небезопасный путь в архиве: ' + rel);
    return p;
  };
  await fsp.mkdir(outDir, { recursive: true });
  for (const d of a.dirs || []) await fsp.mkdir(inside(d), { recursive: true });
  const bad = [];
  let files = 0;
  for (const f of a.files) {
    const p = inside(f.path), data = Buffer.from(f.content, f.enc === 'base64' ? 'base64' : 'utf8');
    if (f.sha256 && sha(data) !== f.sha256) { bad.push(f.path); continue; }
    await fsp.mkdir(path.dirname(p), { recursive: true });
    const tmp = p + '.pi-tmp-' + process.pid;
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, p);
    if (f.mode) await fsp.chmod(p, f.mode).catch(() => {});
    if (f.mtime) await fsp.utimes(p, f.mtime / 1000, f.mtime / 1000).catch(() => {});
    files++;
  }
  return { files, total: a.files.length, bad, name: a.name, created: a.created, skipped: a.skipped || [] };
}

module.exports = { pack, unpack, parse };

if (require.main === module) (async () => {
  const [cmd, ...rest] = process.argv.slice(2), args = rest.filter(x => !x.startsWith('--')), plain = rest.includes('--plain');
  const die = m => { console.error(m); process.exit(1); };
  if (cmd === 'pack') {
    const dir = args[0] || '.', name = path.basename(path.resolve(dir));
    const outFile = args[1] || `${name}-${new Date().toISOString().slice(0, 10)}.pocket.json${plain ? '' : '.gz'}`;
    const r = await pack(fs.createWriteStream(outFile), dir, { gzip: !plain });
    console.log(`Готово: ${outFile} — файлов ${r.files}${r.skipped.length ? `, пропущено ${r.skipped.length}` : ''}`);
  } else if (cmd === 'unpack' && args[0]) {
    const buf = fs.readFileSync(args[0]), out = args[1] || parse(buf).name || 'unpacked';
    const r = await unpack(buf, out);
    console.log(`Распаковано в ${path.resolve(out)}: ${r.files}/${r.total} файлов`);
    if (r.bad.length) die('Повреждены (sha256 не совпал):\n  ' + r.bad.join('\n  '));
  } else if (cmd === 'list' && args[0]) {
    const a = parse(fs.readFileSync(args[0]));
    console.log(`${a.name} · ${a.created} · файлов ${a.files.length}`);
    a.files.forEach(f => console.log(String(f.size).padStart(10), f.path));
  } else die('Использование:\n  node pocket.js pack <папка> [архив] [--plain]\n  node pocket.js unpack <архив> [папка]\n  node pocket.js list <архив>');
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
