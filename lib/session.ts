const STORAGE_PREFIX = 'si_jwt_'

export function generateNonce(): string {
  return crypto.randomUUID()
}

function readJwtExp(jwt: string): number | null {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1])) as Record<string, unknown>
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function saveJwtToSession(nonce: string, jwt: string): void {
  try {
    const entry = { jwt, exp: readJwtExp(jwt) }
    sessionStorage.setItem(`${STORAGE_PREFIX}${nonce}`, JSON.stringify(entry))
  } catch {
    // sessionStorage unavailable (e.g. private browsing quota exceeded) — fail silently
  }
}

export function loadJwtFromSession(nonce: string): string | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${nonce}`)
    if (!raw) return null
    const entry = JSON.parse(raw) as { jwt: string; exp: number | null }
    if (entry.exp !== null && Date.now() / 1000 > entry.exp) {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${nonce}`)
      return null
    }
    return entry.jwt
  } catch {
    return null
  }
}

export function clearJwtFromSession(nonce: string): void {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${nonce}`)
  } catch {
    // ignore
  }
}

export interface TrackingParams {
  transactionId: string
  transferServer: string
  nonce: string
}

export function buildTrackingSearch(params: TrackingParams): string {
  const sp = new URLSearchParams({
    tx: params.transactionId,
    server: params.transferServer,
    nonce: params.nonce,
  })
  return sp.toString()
}

export function parseTrackingParams(search: string): TrackingParams | null {
  const sp = new URLSearchParams(search)
  const transactionId = sp.get('tx')
  const transferServer = sp.get('server')
  const nonce = sp.get('nonce')
  if (!transactionId || !transferServer || !nonce) return null
  return { transactionId, transferServer, nonce }
}
