import axios from 'axios'

// All calls are same-origin and rely on the BFF session cookie.
// No tokens are ever handled in the browser.
export const api = axios.create({ baseURL: '/api', withCredentials: true })

export interface User {
  name: string
  email: string
  claims: { type: string; value: string }[]
}

/** Returns the logged-in user, or null if the session is not authenticated. */
export async function fetchUser(): Promise<User | null> {
  try {
    const res = await axios.get<User>('/bff/user', { withCredentials: true })
    return res.data
  } catch {
    return null // 401 = not logged in
  }
}

export function login(): void {
  window.location.assign('/bff/login?returnUrl=/')
}

export function logout(): void {
  window.location.assign('/bff/logout')
}
