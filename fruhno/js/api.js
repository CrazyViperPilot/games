// Fruhno API client. Settings live in localStorage under the "fruhno:" prefix.
const DEFAULT_SERVER = 'https://phpexpert.de/games/fruhno/api.php';
// The backend moved from /vocs/ to /games/ (Nov 2026); saved settings with the old address are switched over.
const OLD_SERVERS = ['https://phpexpert.de/vocs/fruhno/api.php'];

const store = {
  get(k, d = '') { try { return localStorage.getItem('fruhno:' + k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fruhno:' + k, v); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem('fruhno:' + k); } catch (e) { /* ignore */ } },
};
if (OLD_SERVERS.includes(store.get('server'))) store.set('server', DEFAULT_SERVER);

async function apiCall(body) {
  const headers = {
    'X-Fruhno-Key': store.get('key'),
    'X-Fruhno-Name': store.get('name'),
    'X-Fruhno-Token': store.get('token'),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(store.get('server', DEFAULT_SERVER), {
      method: body ? 'POST' : 'GET',
      headers: body ? { ...headers, 'Content-Type': 'text/plain' } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok && !data.error) data.error = 'Serverfehler ' + res.status;
    if (data.token) store.set('token', data.token);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
