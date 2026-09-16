import { useEffect, useState } from 'react'
import axios from 'axios'
import { api } from '../api'

interface UseProtected<T> {
  data: T | null
  loading: boolean
  forbidden: boolean
  error: string | null
}

/** Auto-GETs a protected /api path via the BFF. `forbidden` = 403. */
export function useProtected<T>(path: string): UseProtected<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .get<T>(path)
      .then((res) => active && setData(res.data))
      .catch((err) => {
        if (!active) return
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        if (status === 403) setForbidden(true)
        else if (status === 401) setError('Session expired — please log in again.')
        else if (status) setError(`Request failed: ${status}`)
        else setError('Network error — is the BFF running?')
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [path])

  return { data, loading, forbidden, error }
}
