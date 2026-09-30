'use client';
import { useEffect, useState } from 'react';

// «Мышь на стрелках»: курсор двигается стрелками, Enter/Space = клик, PgUp/PgDn = прокрутка
export default function MouseKeys({ on, onExit }) {
  const [p, setP] = useState({ x: 100, y: 100 });
  useEffect(() => {
    if (!on) return;
    setP({ x: innerWidth / 2, y: innerHeight / 2 });
    let pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const scrollable = el => { for (; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el; };
    const h = e => {
      const step = e.shiftKey ? 64 : 16, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      const el = document.elementFromPoint(pos.x, pos.y);
      if (d) { pos = { x: Math.max(0, Math.min(innerWidth - 1, pos.x + d[0] * step)), y: Math.max(0, Math.min(innerHeight - 1, pos.y + d[1] * step)) }; setP(pos); }
      else if (e.key === 'Enter' || e.key === ' ') {
        if (el) {
          el.focus?.();
          const o = { bubbles: true, cancelable: true, clientX: pos.x, clientY: pos.y, view: window, button: 0 };
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(new (t.startsWith('p') ? PointerEvent : MouseEvent)(t, o)));
        }
      } else if (e.key === 'PageDown' || e.key === 'PageUp') scrollable(el)?.scrollBy(0, e.key === 'PageDown' ? 240 : -240);
      else if (e.key === 'Escape') onExit();
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [on]);
  if (!on) return null;
  return (
    <>
      <div className="pointer-events-none fixed z-[100] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/30" style={{ left: p.x, top: p.y }} />
      <div className="pointer-events-none fixed bottom-2 left-1/2 z-[100] -translate-x-1/2 rounded bg-black/80 px-3 py-1 text-xs">
        ←↑↓→ двигать · Shift быстро · Enter клик · PgUp/PgDn прокрутка · Esc выход
      </div>
    </>
  );
}
