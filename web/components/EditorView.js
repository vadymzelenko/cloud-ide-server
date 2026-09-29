'use client';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView as CMView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';

const LANG = {
  js: () => javascript(), mjs: () => javascript(), cjs: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }), tsx: () => javascript({ typescript: true, jsx: true }),
  py: () => python(), html: () => html(), htm: () => html(), css: () => css(), json: () => json(),
};
const theme = CMView.theme({
  '&': { backgroundColor: '#09090b', height: '100%' },
  '.cm-gutters': { backgroundColor: '#09090b', border: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' },
});

export default function EditorView({ path, value, onChange }) {
  const ext = path.split('.').pop().toLowerCase();
  const extensions = [CMView.lineWrapping, theme, ...(LANG[ext] ? [LANG[ext]()] : [])];
  return (
    <CodeMirror key={path} value={value} height="100%" className="h-full" theme={oneDark}
      extensions={extensions} onChange={onChange} basicSetup={{ foldGutter: false }} />
  );
}
