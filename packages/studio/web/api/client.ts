// Fetch wrapper: JSON in and out, the X-MDL header the server requires on changes, readable errors.
import { t } from '../i18n'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T
  let code = 'http', message = t('The server answered {status}.', { status: res.status })
  try { const body = await res.json() as { error?: { code: string; message: string } }; if (body.error) ({ code, message } = body.error) } catch { /* not JSON */ }
  // the server's fixed messages are translated here (test/i18n.test.ts checks them); messages naming a file stay as sent
  throw new ApiError(res.status, code, t(message))
}
export const api = {
  get: async <T>(path: string, init?: RequestInit) => parse<T>(await fetch(path, { ...init, headers: { accept: 'application/json', ...init?.headers } })),
  post: async <T>(path: string, body: unknown) => parse<T>(await fetch(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-mdl': '1' } })),
  upload: async <T>(path: string, form: FormData) => parse<T>(await fetch(path, { method: 'POST', body: form, headers: { 'x-mdl': '1' } })),
}
export const qs = (params: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
