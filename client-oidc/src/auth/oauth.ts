// OpenID Connect: Authorization Code + PKCE WITH the `openid` scope.
// Difference vs pure OAuth2: Keycloak also returns an id_token (a signed JWT
// describing WHO logged in). That gives the SPA identity, not just access.
import axios from 'axios'

const KEYCLOAK = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080'
const REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'auth-learn'
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'spa-oidc'
const REDIRECT_URI = 'http://localhost:5175/'

const AUTH_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/auth`
const TOKEN_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/token`
const LOGOUT_URL = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/logout`

const TOKEN_KEY = 'access_token'
const ID_TOKEN_KEY = 'id_token'
const VERIFIER_KEY = 'pkce_verifier'
const STATE_KEY = 'oauth_state'

export interface IdClaims {
  sub: string
  name?: string
  preferred_username?: string
  email?: string
  [k: string]: unknown
}

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

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/**
 * Decode the id_token payload for display. NOTE: this only base64-decodes —
 * it does NOT verify the signature. Trust it for UI only; the backend must
 * verify tokens it receives.
 */
export function getUser(): IdClaims | null {
  const idToken = sessionStorage.getItem(ID_TOKEN_KEY)
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as IdClaims
  } catch {
    return null
  }
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
    scope: 'openid profile email', // <-- OIDC: triggers id_token + profile claims
  })
  window.location.assign(`${AUTH_URL}?${params}`)
}

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

  const res = await axios.post<{ access_token: string; id_token: string }>(
    TOKEN_URL,
    body,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  sessionStorage.setItem(TOKEN_KEY, res.data.access_token)
  sessionStorage.setItem(ID_TOKEN_KEY, res.data.id_token)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)

  window.history.replaceState({}, '', REDIRECT_URI)
  return res.data.access_token
}

export function logout(): void {
  const idToken = sessionStorage.getItem(ID_TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(ID_TOKEN_KEY)

  // OIDC RP-initiated logout: id_token_hint lets Keycloak skip the confirm prompt.
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: REDIRECT_URI,
  })
  if (idToken) params.set('id_token_hint', idToken)
  window.location.assign(`${LOGOUT_URL}?${params}`)
}
