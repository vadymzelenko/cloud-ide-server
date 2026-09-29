import './globals.css';
import '@xterm/xterm/css/xterm.css';
export const metadata = {
  title: 'PocketIDE',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'PocketIDE', statusBarStyle: 'black-translucent' },
};
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#09090b' };
export default function RootLayout({ children }) {
  return <html lang="ru"><body>{children}</body></html>;
}
