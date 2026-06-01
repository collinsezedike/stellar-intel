const STORAGE_PREFIX = 'si_jwt_'

export function generateNonce(): string {
  return crypto.randomUUID()
}

function isJwtExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1])) as Record<string, unknown>
    return typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp
  } catch {
    return false
  }
}

export function saveJwtToSession(nonce: string, jwt: string): void {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${nonce}`, jwt)
  } catch {
    // sessionStorage unavailable (e.g. private browsing quota exceeded) — fail silently
  }
}

export function loadJwtFromSession(nonce: string): string | null {
  try {
    const jwt = sessionStorage.getItem(`${STORAGE_PREFIX}${nonce}`)
    if (!jwt) return null
    if (isJwtExpired(jwt)) {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${nonce}`)
      return null
    }
    return jwt
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
