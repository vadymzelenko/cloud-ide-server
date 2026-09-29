'use client';
import { useRef, useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FilePlus, FolderPlus, Trash2, Upload, Download, RefreshCw, X } from 'lucide-react';
import { api } from '../lib/api';

function Node({ n, depth, exp, sel, pick }) {
  const dir = n.type === 'directory', open = exp.has(n.path);
  return (
    <>
      <button onClick={() => pick(n)} style={{ paddingLeft: 8 + depth * 14 }}
        className={`flex h-9 w-full items-center gap-1.5 pr-2 text-left text-sm ${sel?.path === n.path ? 'bg-line' : ''}`}>
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
  const fileIn = useRef();
  const base = !sel ? '' : sel.type === 'directory' ? sel.path : sel.path.split('/').slice(0, -1).join('/');
  const err = e => alert(e.message);

  const pick = n => {
    setSel(n);
    if (n.type === 'directory') setExp(s => { const x = new Set(s); x.has(n.path) ? x.delete(n.path) : x.add(n.path); return x; });
    else onOpen(n.path);
  };
  const submit = async e => {
    e.preventDefault();
    try {
      if (modal.kind === 'delete') {
        await api('/fs/delete?path=' + encodeURIComponent(sel.path), { method: 'DELETE' });
        onDeleted(sel.path); setSel(null);
      } else {
        const p = modal.val.trim().replace(/^\/+/, '');
        if (!p) return;
        await api('/fs/create', { method: 'POST', body: { path: p, type: modal.kind } });
        if (base) setExp(s => new Set(s).add(base));
        if (modal.kind === 'file') onOpen(p);
      }
      setModal(null); onRefresh();
    } catch (x) { err(x); }
  };
  const upload = async e => {
    const fd = new FormData();
    [...e.target.files].forEach(f => fd.append('files', f));
    e.target.value = '';
    try { await api('/fs/upload?dir=' + encodeURIComponent(base), { method: 'POST', body: fd }); onRefresh(); } catch (x) { err(x); }
  };
  const download = async () => {
    try {
      const r = await api('/fs/download?path=' + encodeURIComponent(sel.path), { raw: true });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob()); a.download = sel.name; a.click();
    } catch (x) { err(x); }
  };
  const Btn = ({ icon: I, on, off, title }) => (
    <button title={title} disabled={off} onClick={on} className="grid h-9 w-9 place-items-center rounded disabled:opacity-30 active:bg-line"><I size={18} /></button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-0.5 border-b border-line p-1">
        <Btn icon={FilePlus} title="Новый файл" on={() => setModal({ kind: 'file', val: base ? base + '/' : '' })} />
        <Btn icon={FolderPlus} title="Новая папка" on={() => setModal({ kind: 'directory', val: base ? base + '/' : '' })} />
        <Btn icon={Upload} title="Загрузить" on={() => fileIn.current.click()} />
        <Btn icon={Download} title="Скачать" off={sel?.type !== 'file'} on={download} />
        <Btn icon={Trash2} title="Удалить" off={!sel} on={() => setModal({ kind: 'delete' })} />
        <Btn icon={RefreshCw} title="Обновить" on={onRefresh} />
        <span className="flex-1" />
        <button onClick={onClose} className="grid h-9 w-9 place-items-center lg:hidden"><X size={18} /></button>
        <input ref={fileIn} type="file" multiple hidden onChange={upload} />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length ? tree.map(n => <Node key={n.path} n={n} depth={0} exp={exp} sel={sel} pick={pick} />)
          : <p className="p-4 text-sm text-zinc-500">Папка пуста. Создайте файл или загрузите проект.</p>}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setModal(null)}>
          <form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-lg border border-line bg-panel p-4">
            {modal.kind === 'delete' ? (
              <p className="text-sm">Удалить <b className="break-all">{sel.path}</b>{sel.type === 'directory' && ' со всем содержимым'}?</p>
            ) : (
              <>
                <p className="text-sm">{modal.kind === 'file' ? 'Путь нового файла' : 'Путь новой папки'}</p>
                <input autoFocus value={modal.val} onChange={e => setModal({ ...modal, val: e.target.value })}
                  className="w-full rounded border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent" />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="rounded px-3 py-2 text-sm">Отмена</button>
              <button className={`rounded px-3 py-2 text-sm font-medium text-black ${modal.kind === 'delete' ? 'bg-red-400' : 'bg-accent'}`}>
                {modal.kind === 'delete' ? 'Удалить' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
