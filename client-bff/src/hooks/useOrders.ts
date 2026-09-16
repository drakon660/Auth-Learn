import { useCallback, useState } from 'react'
import axios from 'axios'
import { api } from '../api'

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
  if (status === 401) return 'Session expired — please log in again.'
  if (status === 403) return 'Forbidden — you cannot edit this order.'
  if (status === 404) return 'Order not found.'
  if (status) return `Request failed: ${status}`
  return 'Network error — is the BFF running?'
}

export function useOrders(): UseOrders {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<Order[]>('/orders')
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
      const res = await api.put<Order>(`/orders/${id}`, patch)
      setOrders((prev) => (prev ? prev.map((o) => (o.id === id ? res.data : o)) : prev))
      return { ok: true }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      return { ok: false, message: messageForStatus(status) }
    }
  }, [])

  return { orders, loading, error, load, update }
}
