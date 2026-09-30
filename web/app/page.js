'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Code2, Terminal as TermIcon, Globe, Menu, Save, Plus, X, RotateCw, LogOut, Keyboard } from 'lucide-react';
import { api, getToken, setToken, clearToken } from '../lib/api';
import FileTree from '../components/FileTree';
import MouseKeys from '../components/MouseKeys';

const EditorView = dynamic(() => import('../components/EditorView'), { ssr: false });
const TerminalView = dynamic(() => import('../components/TerminalView'), { ssr: false });

const TABS = [['editor', 'Editor', Code2], ['terminal', 'Terminal', TermIcon], ['preview', 'Preview', Globe]];
const DOT = { online: 'bg-accent', connecting: 'bg-yellow-400', reconnecting: 'bg-yellow-400', offline: 'bg-red-500' };
const LABEL = { online: 'Online', connecting: 'Connecting', reconnecting: 'Reconnecting', offline: 'Offline' };

const HELP = [['Alt+1 / 2 / 3', 'Editor / Terminal / Preview'], ['Alt+0', 'Дерево файлов: ↑↓ ←→ Enter Delete'],
  ['Ctrl/Cmd+S', 'Сохранить'], ['Alt+Shift+F / D', 'Новый файл / папка'], ['Alt+Shift+T / W', 'Новый / закрыть терминал'],
  ['Alt+Shift+← →', 'Соседний терминал'], ['Alt+Shift+R', 'Перезагрузить Preview'], ['Alt+Shift+A', 'Скачать архив (выбранная папка или всё)'],
  ['Alt+Shift+M', 'Курсор-мышь на стрелках'], ['Alt+/ , Esc', 'Эта справка']];

function Login({ onDone }) {
  const [v, setV] = useState(''), [err, setErr] = useState('');
  const go = async e => {
    e.preventDefault();
    setToken(v.trim());
    try { await api('/ping'); onDone(); } catch { clearToken(); setErr('Неверный токен или сервер недоступен'); }
  };
  return (
    <form onSubmit={go} className="grid h-full place-items-center p-6">
      <div className="w-full max-w-xs space-y-3">
        <h1 className="text-xl font-semibold">PocketIDE</h1>
        <input autoFocus type="password" value={v} onChange={e => setV(e.target.value)} placeholder="AUTH_TOKEN"
          className="w-full rounded border border-line bg-panel px-3 py-2 text-base outline-none focus:border-accent" />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="w-full rounded bg-accent py-2 font-medium text-black">Войти</button>
      </div>
    </form>
  );
}

function Ide({ onLogout }) {
  const [tab, setTab] = useState('editor');
  const [tree, setTree] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [path, setPath] = useState(null);
  const [doc, setDoc] = useState('');
  const [dirty, setDirty] = useState(false);
  const [terms, setTerms] = useState([1]);
  const [at, setAt] = useState(1);
  const [st, setSt] = useState({});
  const [port, setPort] = useState(3000);
  const [pk, setPk] = useState(0);
  const S = useRef({});
  S.current = { path, doc, dirty };
  const touch = useRef(null);
  const [help, setHelp] = useState(false);
  const [mk, setMk] = useState(false);
  const A = useRef({});

  const onStatus = useCallback((id, s) => setSt(x => ({ ...x, [id]: s })), []);
  const refresh = useCallback(() => api('/fs/tree').then(setTree).catch(e => e.status === 401 && onLogout()), [onLogout]);
  useEffect(() => {
    refresh();
    api('/term').then(l => { if (l.length) { l.sort((a, b) => a - b); setTerms(l); setAt(l[0]); } }).catch(() => {});
  }, []);

  // iOS: подгоняем высоту под экранную клавиатуру
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const h = () => { document.documentElement.style.setProperty('--app-h', vv.height + 'px'); window.scrollTo(0, 0); };
    h(); vv.addEventListener('resize', h); vv.addEventListener('scroll', h);
    return () => { vv.removeEventListener('resize', h); vv.removeEventListener('scroll', h); };
  }, []);

  const save = useCallback(async () => {
    const { path, doc, dirty } = S.current;
    if (!path || !dirty) return;
    try {
      await api('/fs/write', { method: 'POST', body: { path, content: doc } });
      if (S.current.doc === doc) setDirty(false);
    } catch (e) { alert(e.message); }
  }, []);
  useEffect(() => {
    const h = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save]);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, 1000);
    return () => clearTimeout(t);
  }, [doc, dirty, save]);

  const open = async (p, byKey) => {
    await save();
    try {
      const t = await api('/fs/read?path=' + encodeURIComponent(p));
      setPath(p); setDoc(t); setDirty(false); setDrawer(false); setTab('editor');
      if (byKey) focusPane('editor');
    } catch (e) { alert(e.message); }
  };
  const onDeleted = p => { if (path && (path === p || path.startsWith(p + '/'))) { setPath(null); setDirty(false); } };
  const addTerm = () => { const n = Math.max(0, ...terms) + 1; setTerms([...terms, n]); setAt(n); };
  const closeTerm = id => {
    if (terms.length < 2) return;
    const rest = terms.filter(x => x !== id);
    setTerms(rest); if (at === id) setAt(rest[0]);
    api('/term/' + id, { method: 'DELETE' }).catch(() => {});
  };

  const focusPane = t => setTimeout(() => {
    if (t === 'editor') document.querySelector('.cm-content')?.focus();
    else if (t === 'terminal') [...document.querySelectorAll('.xterm-helper-textarea')].find(x => x.offsetParent)?.focus();
    else document.getElementById('port')?.focus();
  }, 60);
  const goTab = t => { setTab(t); setDrawer(false); focusPane(t); };
  A.current = { goTab, addTerm, closeTerm, terms, at, setAt, setPk, setDrawer, setHelp, setMk };

  // дерево обновляется само: сервер шлёт событие при любых изменениях файлов (в т.ч. из терминала)
  useEffect(() => {
    const es = new EventSource('/events?token=' + encodeURIComponent(getToken()));
    es.onopen = es.onmessage = () => refresh();
    return () => es.close();
  }, [refresh]);
  // надёжность: сохраняем при сворачивании вкладки и предупреждаем о закрытии с несохранённым
  useEffect(() => {
    const v = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, [save]);
  useEffect(() => {
    if (!dirty) return;
    const h = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  // горячие клавиши (по e.code — работают и на Mac с Option); capture, чтобы не уходили в терминал
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape' && help) return setHelp(false);
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const a = A.current, c = e.code, sh = e.shiftKey, ev = (n, d) => () => window.dispatchEvent(new CustomEvent(n, { detail: d }));
      const tabs = { Digit1: 'editor', Digit2: 'terminal', Digit3: 'preview' };
      let run;
      if (!sh && tabs[c]) run = () => a.goTab(tabs[c]);
      else if (!sh && c === 'Digit0') run = () => { a.setDrawer(true); setTimeout(() => document.getElementById('tree')?.focus(), 60); };
      else if (!sh && c === 'Slash') run = () => a.setHelp(v => !v);
      else if (sh && c === 'KeyF') run = ev('pi:new', 'file');
      else if (sh && c === 'KeyD') run = ev('pi:new', 'directory');
      else if (sh && c === 'KeyA') run = ev('pi:archive');
      else if (sh && c === 'KeyT') run = () => { a.addTerm(); a.goTab('terminal'); };
      else if (sh && c === 'KeyW') run = () => a.closeTerm(a.at);
      else if (sh && (c === 'ArrowLeft' || c === 'ArrowRight')) run = () => { const i = a.terms.indexOf(a.at); a.setAt(a.terms[(i + (c === 'ArrowRight' ? 1 : a.terms.length - 1)) % a.terms.length]); };
      else if (sh && c === 'KeyR') run = () => a.setPk(k => k + 1);
      else if (sh && c === 'KeyM') run = () => a.setMk(v => !v);
      if (run) { e.preventDefault(); e.stopPropagation(); run(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [help]);

  const pane = 'min-h-0 flex-col';
  const status = st[at] || 'connecting';
  return (
    <div className="flex flex-col bg-bg" style={{ height: 'var(--app-h, 100dvh)', paddingTop: 'env(safe-area-inset-top)' }}
      onTouchStart={e => (touch.current = e.touches[0].clientX < 24 ? e.touches[0].clientX : null)}
      onTouchEnd={e => { if (touch.current !== null && e.changedTouches[0].clientX - touch.current > 60) setDrawer(true); touch.current = null; }}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <button onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center lg:hidden"><Menu size={20} /></button>
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} title={LABEL[status]} />
        <span className="hidden text-xs text-zinc-400 sm:block">{LABEL[status]}</span>
        <span className="flex-1 truncate text-sm">{path || 'Файл не выбран'}</span>
        <div className="hidden gap-1 lg:flex">
          {['editor', 'preview'].map(k => (
            <button key={k} onClick={() => setTab(k)} className={`rounded px-3 py-1 text-sm ${tab === k || (k === 'editor' && tab === 'terminal') ? 'bg-line' : ''}`}>{k === 'editor' ? 'Editor' : 'Preview'}</button>
          ))}
        </div>
        <button onClick={save} disabled={!path} className="flex h-9 items-center gap-1.5 rounded px-2 text-sm disabled:opacity-40 active:bg-line">
          <Save size={18} />
          <span className={`h-2 w-2 rounded-full ${dirty ? 'bg-yellow-400' : 'bg-accent'}`} title={dirty ? 'Не сохранено' : 'Сохранено'} />
        </button>
        <button onClick={() => setHelp(true)} title="Горячие клавиши (Alt+/)" className="grid h-9 w-9 place-items-center text-zinc-400"><Keyboard size={18} /></button>
        <button onClick={onLogout} title="Выйти" className="grid h-9 w-9 place-items-center text-zinc-400"><LogOut size={18} /></button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {drawer && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setDrawer(false)} />}
        <aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-line bg-panel pt-[env(safe-area-inset-top)] transition-transform lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:pt-0 ${drawer ? 'translate-x-0' : '-translate-x-full'}`}>
          <FileTree tree={tree} onOpen={open} onRefresh={refresh} onDeleted={onDeleted} onClose={() => setDrawer(false)} />
        </aside>

        <main className="min-w-0 flex-1 lg:grid lg:grid-cols-2">
          <section className={`${pane} ${tab === 'editor' ? 'flex' : 'hidden'} ${tab !== 'preview' ? 'lg:flex' : 'lg:hidden'} lg:border-r lg:border-line`}>
            {path ? <div className="min-h-0 flex-1"><EditorView path={path} value={doc} onChange={v => { setDoc(v); setDirty(true); }} /></div>
              : <p className="p-6 text-sm text-zinc-500">Откройте файл из меню слева или создайте новый.</p>}
          </section>

          <section className={`${pane} ${tab === 'preview' ? 'flex' : 'hidden'} lg:${tab === 'preview' ? 'flex' : 'hidden'} lg:border-r lg:border-line`}>
            <div className="flex shrink-0 items-center gap-1 border-b border-line p-1">
              <input id="port" type="number" value={port} onChange={e => setPort(+e.target.value || 0)} onKeyDown={e => e.key === 'Enter' && setPk(k => k + 1)} className="h-9 w-20 rounded border border-line bg-bg px-2 text-base outline-none" />
              {[3000, 8000, 5173].map(p => <button key={p} onClick={() => { setPort(p); setPk(k => k + 1); }} className="h-9 rounded bg-line px-2 text-sm">{p}</button>)}
              <button onClick={() => setPk(k => k + 1)} className="grid h-9 w-9 place-items-center"><RotateCw size={16} /></button>
            </div>
            {tab === 'preview' && port > 0 && <iframe key={pk + ':' + port} src={`/proxy/${port}/`} className="min-h-0 flex-1 bg-white" />}
          </section>

          <section className={`${pane} ${tab === 'terminal' ? 'flex' : 'hidden'} lg:flex`}>
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line p-1">
              {terms.map(id => (
                <div key={id} className={`flex shrink-0 items-center rounded text-sm ${id === at ? 'bg-line' : ''}`}>
                  <button onClick={() => setAt(id)} className="px-3 py-1.5">#{id}</button>
                  {terms.length > 1 && <button onClick={() => closeTerm(id)} className="pr-2 text-zinc-500"><X size={14} /></button>}
                </div>
              ))}
              <button onClick={addTerm} className="grid h-8 w-8 shrink-0 place-items-center"><Plus size={16} /></button>
            </div>
            {terms.map(id => <TerminalView key={id} id={id} active={id === at} onStatus={onStatus} />)}
          </section>
        </main>
      </div>

      <nav className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden">
        {TABS.map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${tab === k ? 'text-accent' : 'text-zinc-400'}`}>
            <I size={20} />{l}
          </button>
        ))}
      </nav>
      <MouseKeys on={mk} onExit={() => setMk(false)} />
      {help && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setHelp(false)}>
          <div tabIndex={-1} ref={el => el?.focus()} onClick={e => e.stopPropagation()} className="w-full max-w-md space-y-1 rounded-lg border border-line bg-panel p-4 text-sm outline-none">
            <h2 className="mb-2 font-semibold">Горячие клавиши</h2>
            {HELP.map(([k, d]) => <div key={k} className="flex justify-between gap-4"><kbd className="whitespace-nowrap text-accent">{k}</kbd><span className="text-right text-zinc-300">{d}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [auth, setAuth] = useState(null);
  useEffect(() => {
    if (!getToken()) return setAuth(false);
    api('/ping').then(() => setAuth(true)).catch(() => setAuth(false));
  }, []);
  if (auth === null) return <div className="h-full" />;
  return auth ? <Ide onLogout={() => { clearToken(); setAuth(false); }} /> : <Login onDone={() => setAuth(true)} />;
}
