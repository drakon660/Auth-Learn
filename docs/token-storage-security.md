# Decreasing XSS Blast Radius for OAuth2 Tokens

**Blast radius** = what an attacker steals if XSS runs in your page. Ranked strongest first.

## 1. BFF (Backend-for-Frontend) — don't let the SPA hold the token

Token stays server-side. Browser gets only an `httpOnly`, `Secure`, `SameSite` cookie
session; JS can't read it. The .NET backend does the code exchange, keeps the
access/refresh tokens, and proxies API calls.

- Current IETF recommendation for browser apps (`draft-ietf-oauth-browser-based-apps`).
- Biggest win: XSS can't exfiltrate a token that JS never sees.

## 2. Pure SPA: keep token in memory only

Store the access token in a JS variable, **not** `localStorage` / `sessionStorage`.

- Not persisted — gone on reload, no cross-origin storage to dump.
- Refresh token lives in an `httpOnly` cookie; silent re-auth restores the access token on reload.
- XSS can still read the in-memory token *while running*, but the window is smaller and nothing survives.
- Cost: loses multi-tab sharing + persistence.

## 3. Sender-constrain the token — DPoP

- Keycloak supports it.
- Token bound to a key; a stolen token is useless without the private key.
- Turns "steal token = full access" into "token alone is worthless."

## 4. Shrink the window

- Short access-token TTL (~1–5 min).
- Refresh-token rotation: stolen token expires fast; reused refresh token detected + revoked.

## 5. Reduce XSS itself (root cause)

- Strict Content Security Policy (CSP).
- No `dangerouslySetInnerHTML` with untrusted input.
- Subresource Integrity (SRI) on CDN scripts.
- Audit dependencies.

## Recommendation for this stack

- Cleanest real-world path: **BFF in the .NET API** — httpOnly cookie session, backend does exchange + proxy.
- Middle ground: **in-memory token + refresh cookie**.

Current implementation uses `localStorage` (shared across tabs, persistent) — fine for a
learning app, weakest for blast radius.
