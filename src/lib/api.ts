/** Appels à l'API protégée (cookie de session HttpOnly envoyé automatiquement). */

export class AuthError extends Error {}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') throw new AuthError(j?.error || 'Session expirée');
  if (!r.ok) throw new Error(j?.error || `Erreur ${r.status}`);
  return j as T;
}

export const getSession = () => call<{ authenticated: boolean; configured: boolean; error?: string; sheet: boolean }>('GET', '/api/session');
export const login = (password: string) => call<{ ok: true }>('POST', '/api/login', { password });
export const logout = () => call<{ ok: true }>('POST', '/api/logout', {});
export const getSheet = () => call<{ sheet: string; values: string[][]; prefs: unknown }>('GET', '/api/sheet');
export const putPrefs = (prefs: unknown) => call<{ ok: true }>('PUT', '/api/prefs', prefs);
