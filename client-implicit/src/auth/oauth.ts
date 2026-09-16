// LEGACY OAuth2 Implicit flow against Keycloak (response_type=token).
// Deprecated in practice — token is returned in the URL fragment, exposed to
// history / logs / referer. Kept here to contrast with Authorization Code + PKCE.

const KEYCLOAK = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080'
const REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'auth-learn'
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'spa-implicit'
const REDIRECT_URI = 'http://localhost:5174/'

const AUTH_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/auth`
const LOGOUT_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/logout`

const TOKEN_KEY = 'access_token'
const STATE_KEY = 'oauth_state'

function randomString(byteLen = 16): string {
  const a = new Uint8Array(byteLen)
  crypto.getRandomValues(a)
  let s = ''
  for (const b of a) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function login(): void {
  const state = randomString()
  sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    response_type: 'token', // <-- implicit: ask for the token directly, no code
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
  })
  window.location.assign(`${AUTH_URL}?${params}`)
}

/**
 * On redirect back, Keycloak puts the token in the URL FRAGMENT:
 *   http://localhost:5174/#access_token=...&state=...&expires_in=...
 * Parse it from location.hash. No back-channel exchange.
 */
export function handleRedirect(): string | null {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : ''
  if (!hash) return getToken()

  const p = new URLSearchParams(hash)
  const token = p.get('access_token')
  const state = p.get('state')
  const error = p.get('error')

  if (error) {
    throw new Error(`${error}: ${p.get('error_description') ?? ''}`)
  }
  if (!token) return getToken()

  if (state !== sessionStorage.getItem(STATE_KEY)) {
    throw new Error('OAuth state mismatch')
  }

  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.removeItem(STATE_KEY)

  // Strip the token out of the address bar / history.
  window.history.replaceState({}, '', REDIRECT_URI)
  return token
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: REDIRECT_URI,
  })
  window.location.assign(`${LOGOUT_URL}?${params}`)
}
