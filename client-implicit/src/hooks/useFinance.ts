import { useEffect, useState } from 'react'
import axios from 'axios'
import { getToken } from '../auth/oauth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5111'

export interface Finance {
  user: string
  department: string
  roles: string[]
}

interface UseFinance {
  data: Finance | null
  loading: boolean
  forbidden: boolean
  error: string | null
}

/** Auto-loads /finance/orders. `forbidden` = missing role orders.write or department!=finance (403). */
export function useFinance(): UseFinance {
  const [data, setData] = useState<Finance | null>(null)
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
        const res = await axios.get<Finance>(`${API_URL}/finance/orders`, {
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
