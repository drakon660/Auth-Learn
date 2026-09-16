import { useEffect, useState } from 'react'
import axios from 'axios'
import { getToken } from '../auth/oauth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5111'

export interface SuperAdmin {
  user: string
  groups: string[]
}

interface UseSuperAdmin {
  data: SuperAdmin | null
  loading: boolean
  forbidden: boolean
  error: string | null
}

/** Auto-loads /superadmin on mount. `forbidden` = caller not in SuperAdmins group (403). */
export function useSuperAdmin(): UseSuperAdmin {
  const [data, setData] = useState<SuperAdmin | null>(null)
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
        const res = await axios.get<SuperAdmin>(`${API_URL}/superadmin`, {
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
