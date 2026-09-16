// Minimal OAuth2 Authorization Code + PKCE flow against Keycloak.
// No `openid` scope requested, so no id_token / OIDC login — pure OAuth2 access token.
import axios from 'axios'

const KEYCLOAK = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080'
const REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'auth-learn'
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'spa-client'
const REDIRECT_URI = 'http://localhost:5173/'

// Keycloak names these endpoints "openid-connect" regardless; omitting the
// `openid` scope keeps this a plain OAuth2 exchange (access token only).
const AUTH_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/auth`
const TOKEN_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/token`
const LOGOUT_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/logout`

const TOKEN_KEY = 'access_token'
const VERIFIER_KEY = 'pkce_verifier'
const STATE_KEY = 'oauth_state'

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLen = 64): string {
  const a = new Uint8Array(byteLen)
  crypto.getRandomValues(a)
  return base64url(a)
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64url(new Uint8Array(hash))
}

// Token in localStorage: shared across all tabs of this origin.
// PKCE verifier + state stay in sessionStorage: per-tab, per-login-flow.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/**
 * Fire `cb` when the token changes in another tab (login or logout there).
 * Returns an unsubscribe function.
 */
export function onTokenChange(cb: (token: string | null) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY) cb(e.newValue)
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export async function login(): Promise<void> {
  const verifier = randomString()
  const challenge = await sha256(verifier)
  const state = randomString(16)

  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  window.location.assign(`${AUTH_URL}?${params}`)
}

/**
 * If the current URL is an OAuth redirect (?code=...), exchange the code for an
 * access token. Returns the token, or null if there is nothing to handle.
 * Cleans the query string from the URL on success.
 *
 * Deduped: an auth code is single-use, and React StrictMode invokes effects
 * twice in dev — without this the second call would POST the used code and 400.
 */
let redirectPromise: Promise<string | null> | undefined
export function handleRedirect(): Promise<string | null> {
  redirectPromise ??= exchangeCode()
  return redirectPromise
}

async function exchangeCode(): Promise<string | null> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code) return getToken()

  const expectedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier || state !== expectedState) {
    throw new Error('OAuth state mismatch')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })

  const res = await axios.post<{ access_token: string }>(TOKEN_URL, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  const token = res.data
  localStorage.setItem(TOKEN_KEY, token.access_token)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)

  // Strip ?code&state from the address bar.
  window.history.replaceState({}, '', REDIRECT_URI)
  return token.access_token
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  // End the Keycloak SSO session too, otherwise re-login is silent.
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: REDIRECT_URI,
  })
  window.location.assign(`${LOGOUT_URL}?${params}`)
}
