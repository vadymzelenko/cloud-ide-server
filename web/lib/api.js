export const getToken = () => localStorage.getItem('pi_token') || '';
export const setToken = t => {
  localStorage.setItem('pi_token', t);
  // cookie нужен только для iframe-превью (/proxy/*)
  document.cookie = `pi_token=${encodeURIComponent(t)}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
};
export const clearToken = () => {
  localStorage.removeItem('pi_token');
  document.cookie = 'pi_token=; path=/; max-age=0';
};
export async function api(path, { method = 'GET', body, raw } = {}) {
  const form = body instanceof FormData;
  const r = await fetch('/api' + path, {
    method,
    headers: { Authorization: 'Bearer ' + getToken(), ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined || form ? body : JSON.stringify(body),
  });
  if (!r.ok) throw Object.assign(new Error((await r.text()) || r.statusText), { status: r.status });
  if (raw) return r;
  return (r.headers.get('content-type') || '').includes('json') ? r.json() : r.text();
}
