'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronDown, File, Folder, FilePlus, FolderPlus, Trash2, Upload, Download, RefreshCw, X, Archive, ArchiveRestore } from 'lucide-react';
import { api } from '../lib/api';

const enc = encodeURIComponent;
const err = e => alert(e.message);
const Btn = ({ icon: I, on, off, title }) => (
  <button title={title} disabled={off} onClick={on} className="grid h-9 w-9 place-items-center rounded disabled:opacity-30 active:bg-line"><I size={18} /></button>
);

function Node({ n, depth, exp, sel, pick }) {
  const dir = n.type === 'directory', open = exp.has(n.path), on = sel?.path === n.path;
  return (
    <>
      <button tabIndex={-1} data-sel={on} onClick={() => pick(n)} style={{ paddingLeft: 8 + depth * 14 }}
        className={`flex h-9 w-full items-center gap-1.5 border-l-2 pr-2 text-left text-sm ${on ? 'border-accent bg-line' : 'border-transparent'}`}>
        {dir ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
        {dir ? <Folder size={15} className="text-accent" /> : <File size={15} className="text-zinc-400" />}
        <span className="truncate">{n.name}</span>
      </button>
      {dir && open && n.children.map(c => <Node key={c.path} n={c} depth={depth + 1} exp={exp} sel={sel} pick={pick} />)}
    </>
  );
}

export default function FileTree({ tree, onOpen, onRefresh, onDeleted, onClose }) {
  const [exp, setExp] = useState(new Set());
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null); // {kind:'file'|'directory'|'delete', val}
  const fileIn = useRef(), zipIn = useRef();
  const base = !sel ? '' : sel.type === 'directory' ? sel.path : sel.path.split('/').slice(0, -1).join('/');
  const dirSel = sel?.type === 'directory' ? sel.path : '';

  const flat = useMemo(() => {
    const out = [];
    const rec = (ns, parent) => ns.forEach(n => { out.push({ n, parent }); if (n.type === 'directory' && exp.has(n.path)) rec(n.children, n); });
    rec(tree, null);
    return out;
  }, [tree, exp]);

  useEffect(() => { document.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const focusTree = () => setTimeout(() => document.getElementById('tree')?.focus(), 30);
  const closeModal = () => { setModal(null); focusTree(); };
  const toggle = (p, force) => setExp(s => { const x = new Set(s), want = force ?? !x.has(p); want ? x.add(p) : x.delete(p); return x; });
  const pick = (n, byKey) => { setSel(n); if (n.type === 'directory') toggle(n.path); else onOpen(n.path, byKey); };

  const onKey = e => {
    const i = flat.findIndex(x => x.n.path === sel?.path), cur = flat[i];
    const go = j => { const t = flat[Math.max(0, Math.min(flat.length - 1, j))]; if (t) setSel(t.n); };
    const isDir = cur?.n.type === 'directory';
    const map = {
      ArrowDown: () => go(i + 1), ArrowUp: () => go(i < 0 ? 0 : i - 1), Home: () => go(0), End: () => go(flat.length),
      ArrowRight: () => isDir && (exp.has(cur.n.path) ? go(i + 1) : toggle(cur.n.path, true)),
      ArrowLeft: () => (isDir && exp.has(cur.n.path) ? toggle(cur.n.path, false) : cur?.parent && setSel(cur.parent)),
      Enter: () => cur && pick(cur.n, true), ' ': () => cur && pick(cur.n, true),
      Delete: () => cur && setModal({ kind: 'delete' }), Escape: onClose,
    };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  };

  const exportArchive = async () => {
    try {
      const r = await api('/archive?dir=' + enc(dirSel), { raw: true });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = `${dirSel ? dirSel.split('/').pop() : 'workspace'}-${new Date().toISOString().slice(0, 10)}.pocket.json.gz`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (x) { err(x); }
  };
  const importArchive = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    try {
      const r = await api('/archive/import?dir=' + enc(dirSel), { method: 'POST', body: fd });
      alert(`Восстановлено файлов: ${r.files} из ${r.total}` + (r.bad.length ? `\nПовреждены (sha256): ${r.bad.join(', ')}` : ''));
      onRefresh();
    } catch (x) { err(x); }
  };
  // события от глобальных горячих клавиш
  useEffect(() => {
    const nw = e => setModal({ kind: e.detail, val: base ? base + '/' : '' });
    window.addEventListener('pi:new', nw); window.addEventListener('pi:archive', exportArchive);
    return () => { window.removeEventListener('pi:new', nw); window.removeEventListener('pi:archive', exportArchive); };
  });

  const submit = async e => {
    e.preventDefault();
    try {
      if (modal.kind === 'delete') {
        await api('/fs/delete?path=' + enc(sel.path), { method: 'DELETE' });
        onDeleted(sel.path); setSel(null);
      } else {
        const p = modal.val.trim().replace(/^\/+/, '');
        if (!p) return;
        await api('/fs/create', { method: 'POST', body: { path: p, type: modal.kind } });
        if (base) toggle(base, true);
        if (modal.kind === 'file') onOpen(p, true);
      }
      closeModal(); onRefresh();
    } catch (x) { err(x); }
  };
  const upload = async e => {
    const fd = new FormData();
    [...e.target.files].forEach(f => fd.append('files', f));
    e.target.value = '';
    try { await api('/fs/upload?dir=' + enc(base), { method: 'POST', body: fd }); onRefresh(); } catch (x) { err(x); }
  };
  const download = async () => {
    try {
      const r = await api('/fs/download?path=' + enc(sel.path), { raw: true });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob()); a.download = sel.name; a.click();
    } catch (x) { err(x); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line p-1">
        <Btn icon={FilePlus} title="Новый файл (Alt+Shift+F)" on={() => setModal({ kind: 'file', val: base ? base + '/' : '' })} />
        <Btn icon={FolderPlus} title="Новая папка (Alt+Shift+D)" on={() => setModal({ kind: 'directory', val: base ? base + '/' : '' })} />
        <Btn icon={Upload} title="Загрузить файлы" on={() => fileIn.current.click()} />
        <Btn icon={Download} title="Скачать файл" off={sel?.type !== 'file'} on={download} />
        <Btn icon={Trash2} title="Удалить (Delete)" off={!sel} on={() => setModal({ kind: 'delete' })} />
        <Btn icon={RefreshCw} title="Обновить" on={onRefresh} />
        <Btn icon={Archive} title="Скачать турбоархив (Alt+Shift+A)" on={exportArchive} />
        <Btn icon={ArchiveRestore} title="Восстановить из архива" on={() => zipIn.current.click()} />
        <span className="flex-1" />
        <button onClick={onClose} className="grid h-9 w-9 place-items-center lg:hidden"><X size={18} /></button>
        <input ref={fileIn} type="file" multiple hidden onChange={upload} />
        <input ref={zipIn} type="file" accept=".gz,.json" hidden onChange={importArchive} />
      </div>
      <div id="tree" tabIndex={0} onKeyDown={onKey} className="flex-1 overflow-y-auto py-1 outline-none focus-visible:bg-white/[0.02]">
        {tree.length ? tree.map(n => <Node key={n.path} n={n} depth={0} exp={exp} sel={sel} pick={pick} />)
          : <p className="p-4 text-sm text-zinc-500">Папка пуста. Создайте файл или загрузите проект.</p>}
      </div>
      {modal && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={closeModal}>
          <form onSubmit={submit} onClick={e => e.stopPropagation()} onKeyDown={e => e.key === 'Escape' && closeModal()}
            className="w-full max-w-sm space-y-3 rounded-lg border border-line bg-panel p-4">
            {modal.kind === 'delete' ? (
              <p className="text-sm">Удалить <b className="break-all">{sel?.path}</b>{sel?.type === 'directory' && ' со всем содержимым'}?</p>
            ) : (
              <>
                <p className="text-sm">{modal.kind === 'file' ? 'Путь нового файла' : 'Путь новой папки'}</p>
                <input autoFocus value={modal.val} onChange={e => setModal({ ...modal, val: e.target.value })}
                  className="w-full rounded border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent" />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeModal} className="rounded px-3 py-2 text-sm">Отмена</button>
              <button autoFocus={modal.kind === 'delete'} className={`rounded px-3 py-2 text-sm font-medium text-black ${modal.kind === 'delete' ? 'bg-red-400' : 'bg-accent'}`}>
                {modal.kind === 'delete' ? 'Удалить' : 'Создать'}
              </button>
            </div>
          </form>
        </div>, document.body)}
    </div>
  );
}
