import { useCallback, useState } from 'react'
import axios from 'axios'
import { getToken } from '../auth/oauth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5111'

export interface Order {
  id: number
  product: string
  quantity: number
  total: number
  status: string
  department: string
}

export type OrderPatch = Partial<Pick<Order, 'product' | 'quantity' | 'status'>>

export interface UpdateResult {
  ok: boolean
  message?: string
}

interface UseOrders {
  orders: Order[] | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
  update: (id: number, patch: OrderPatch) => Promise<UpdateResult>
}

function messageForStatus(status: number | undefined): string {
  if (status === 401) return 'Unauthorized — token missing, expired, or invalid.'
  if (status === 403) return 'Forbidden — you cannot edit this order.'
  if (status === 404) return 'Order not found.'
  if (status) return `Request failed: ${status}`
  return 'Network error — is the API running?'
}

/** Imperative orders hook: load() fetches, update() PUTs a single order. */
export function useOrders(): UseOrders {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      if (!token) {
        setError('Not logged in — please log in first.')
        return
      }
      const res = await axios.get<Order[]>(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setOrders(res.data)
    } catch (err) {
      setOrders(null)
      setError(axios.isAxiosError(err) ? messageForStatus(err.response?.status) : 'Unexpected error.')
    } finally {
      setLoading(false)
    }
  }, [])

  const update = useCallback(async (id: number, patch: OrderPatch): Promise<UpdateResult> => {
    try {
      const token = getToken()
      if (!token) return { ok: false, message: 'Not logged in.' }
      const res = await axios.put<Order>(`${API_URL}/orders/${id}`, patch, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setOrders((prev) => (prev ? prev.map((o) => (o.id === id ? res.data : o)) : prev))
      return { ok: true }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      return { ok: false, message: messageForStatus(status) }
    }
  }, [])

  return { orders, loading, error, load, update }
}
