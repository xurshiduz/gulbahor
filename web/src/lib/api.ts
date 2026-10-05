/**
 * The one way the web talks to the server. Cookies carry the session, so
 * there is no token to hold here. When the short-lived access cookie has
 * expired, the request renews it once and tries again; several requests
 * failing together share a single renewal.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
  }

  get isAuth(): boolean {
    return this.status === 401
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

interface RequestOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
}

let renewal: Promise<boolean> | null = null
let onSignedOut: (() => void) | null = null

/** Called once by the app: what to do when the session is gone for good. */
export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler
}

async function renew(): Promise<boolean> {
  renewal ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      renewal = null
    })
  return renewal
}

/** Renews the access cookie; the socket uses this when its own sign-in expires. */
export function renewSession(): Promise<boolean> {
  return renew()
}

async function send(method: string, path: string, options: RequestOptions, retried = false): Promise<Response> {
  const url = `/api${path}${toQueryString(options.query)}`
  const response = await fetch(url, {
    method,
    credentials: 'include',
    signal: options.signal,
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (response.status === 401 && !retried && !path.startsWith('/auth/login')) {
    const error = await readError(response.clone())
    if (error.code === 'TOKEN_EXPIRED' && (await renew())) {
      return send(method, path, options, true)
    }
  }
  return response
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await send(method, path, options)
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error
    }
    throw new ApiError(0, 'NETWORK', 'Server bilan aloqa yo‘q. Internetni tekshiring')
  }

  if (!response.ok) {
    const error = await readError(response)
    if (error.isAuth && !path.startsWith('/auth/login') && !path.startsWith('/auth/unlock')) {
      onSignedOut?.()
    }
    throw error
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const { error } = (await response.json()) as { error: { code: string; message: string; fields?: Record<string, string> } }
    return new ApiError(response.status, error.code, error.message, error.fields)
  } catch {
    return new ApiError(response.status, 'ERROR', 'Xatolik yuz berdi')
  }
}

function toQueryString(query: Query | undefined): string {
  if (!query) {
    return ''
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T = void>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T = void>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T = void>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
}
