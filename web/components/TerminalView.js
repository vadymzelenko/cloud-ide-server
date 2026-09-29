'use client';
import { useEffect, useRef } from 'react';
import { getToken } from '../lib/api';

const KEYS = [['Esc', '\x1b'], ['Tab', '\t'], ['^C', '\x03'], ['^Z', '\x1a'], ['^D', '\x04'], ['^B', '\x02'],
  ['~', '~'], ['/', '/'], ['|', '|'], ['-', '-'], ['_', '_'], ['$', '$'], ['=', '='], ['>', '>'], ['<', '<'],
  ['←', '\x1b[D'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['→', '\x1b[C']];
const DELAYS = [1000, 2000, 5000];

export default function TerminalView({ id, active, onStatus }) {
  const box = useRef();
  const R = useRef({});

  useEffect(() => {
    let dead = false, ws, term, ro, timer, retry = 0;
    const send = o => ws?.readyState === 1 && ws.send(JSON.stringify(o));
    R.current.send = d => send({ type: 'input', data: d });
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (dead) return;
      term = new Terminal({ fontSize: 14, cursorBlink: true, scrollback: 5000, theme: { background: '#09090b', foreground: '#e4e4e7' } });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(box.current);
      R.current.term = term;
      term.onData(d => send({ type: 'input', data: d }));
      const doFit = () => { if (box.current.clientWidth > 0) { fit.fit(); send({ type: 'resize', cols: term.cols, rows: term.rows }); } };
      ro = new ResizeObserver(doFit);
      ro.observe(box.current);
      const connect = () => {
        if (dead) return;
        onStatus(id, retry ? 'reconnecting' : 'connecting');
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(getToken())}&s=${id}&cols=${term.cols}&rows=${term.rows}`);
        ws.onopen = () => { retry = 0; term.reset(); onStatus(id, 'online'); doFit(); };
        ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === 'output') term.write(m.data); } catch {} };
        ws.onclose = () => { if (dead) return; onStatus(id, 'offline'); timer = setTimeout(connect, DELAYS[Math.min(retry++, 2)]); };
      };
      R.current.reconnect = () => { if (!dead && (!ws || ws.readyState > 1)) { clearTimeout(timer); connect(); } };
      doFit();
      connect();
    })();
    const vis = () => document.visibilityState === 'visible' && R.current.reconnect?.();
    document.addEventListener('visibilitychange', vis);
    return () => {
      dead = true; clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
      ro?.disconnect(); ws?.close(); term?.dispose();
    };
  }, [id]);

  useEffect(() => { if (active) R.current.term?.focus(); }, [active]);

  return (
    <div className={`${active ? 'flex' : 'hidden'} flex-1 min-h-0 flex-col`}>
      <div ref={box} className="flex-1 min-h-0 overflow-hidden p-1" />
      <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-panel p-1">
        {KEYS.map(([l, k]) => (
          <button key={l} onPointerDown={e => { e.preventDefault(); R.current.send?.(k); }}
            className="h-9 min-w-10 shrink-0 rounded bg-line px-2 text-sm active:bg-accent active:text-black">{l}</button>
        ))}
      </div>
    </div>
  );
}
