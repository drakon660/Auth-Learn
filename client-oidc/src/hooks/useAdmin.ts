import { useEffect, useState } from 'react'
import axios from 'axios'
import { getToken } from '../auth/oauth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5111'

export interface AdminClaims {
  user: string
  claims: { type: string; value: string }[]
}

interface UseAdmin {
  data: AdminClaims | null
  loading: boolean
  forbidden: boolean
  error: string | null
}

/** Auto-loads /admin/claims on mount. `forbidden` = caller lacks the admin role (403). */
export function useAdmin(): UseAdmin {
  const [data, setData] = useState<AdminClaims | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const token = getToken()
        if (!token) {
          setError('Not logged in.')
          return
        }
        const res = await axios.get<AdminClaims>(`${API_URL}/admin/claims`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (active) setData(res.data)
      } catch (err) {
        if (!active) return
        if (axios.isAxiosError(err)) {
          const status = err.response?.status
          if (status === 403) setForbidden(true)
          else if (status === 401) setError('Unauthorized — token missing or expired.')
          else if (status) setError(`Request failed: ${status}`)
          else setError('Network error — is the API running?')
        } else {
          setError('Unexpected error.')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return { data, loading, forbidden, error }
}
