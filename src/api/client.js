// In dev, Vite proxies '/api' to http://localhost:5000 (see vite.config.js),
// so we never hardcode the backend origin here. In production, build your
// Express server to also serve this app, or set VITE_API_URL and use that instead.
const BASE = '/api';

async function request(path, { method = 'GET', body, token, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  // The Express backend's auth middleware reads the token from 'x-auth-token'
  // (not the standard 'Authorization' header) — match that here.
  if (token) headers['x-auth-token'] = token;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const apiClient = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
  // Multipart helpers — pass a FormData instance as `body`.
  postForm: (path, body, opts) => request(path, { ...opts, method: 'POST', body, isForm: true }),
  putForm: (path, body, opts) => request(path, { ...opts, method: 'PUT', body, isForm: true }),
};
