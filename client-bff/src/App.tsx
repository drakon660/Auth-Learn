import { Suspense, useEffect, useState } from 'react'
import { fetchUser, login, logout } from './api'
import type { User } from './api'
import { useHello } from './hooks/useHello'
import { useOrders } from './hooks/useOrders'
import type { Order, OrderPatch, UpdateResult } from './hooks/useOrders'
import { useProtected } from './hooks/useProtected'
import './App.css'

function Hello() {
  const data = useHello()
  return <p className="hello">{data.message}</p>
}

function OrderRow({
  order,
  onSave,
}: {
  order: Order
  onSave: (id: number, patch: OrderPatch) => Promise<UpdateResult>
}) {
  const [status, setStatus] = useState(order.status)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const dirty = status !== order.status

  async function save() {
    setSaving(true)
    setMsg(null)
    const res = await onSave(order.id, { status })
    setMsg(res.ok ? 'Saved ✓' : (res.message ?? 'Failed'))
    setSaving(false)
  }

  return (
    <li>
      #{order.id} — {order.product} ×{order.quantity} — ${order.total} — [
      {order.department}]{' '}
      <input value={status} onChange={(e) => setStatus(e.target.value)} />{' '}
      <button type="button" onClick={save} disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {msg && <span className="msg"> {msg}</span>}
    </li>
  )
}

function Orders() {
  const { orders, loading, error, load, update } = useOrders()
  return (
    <div className="orders">
      <button type="button" onClick={load} disabled={loading}>
        {loading ? 'Loading…' : 'Load orders'}
      </button>
      {error && <p className="error">{error}</p>}
      {orders && (
        <ul>
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} onSave={update} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AdminCard() {
  const { data, loading, forbidden, error } = useProtected<{ user: string; claims: unknown[] }>(
    '/admin/claims',
  )
  return (
    <div className="card admin-card">
      <h2>Admin module (realm role)</h2>
      {loading && <p>Loading…</p>}
      {forbidden && <p className="muted">Not an admin — denied.</p>}
      {error && <p className="error">{error}</p>}
      {data && <p className="hello">Admin ✓ — {data.user} · {data.claims.length} claims</p>}
    </div>
  )
}

function SuperAdminCard() {
  const { data, loading, forbidden, error } = useProtected<{ user: string; groups: string[] }>(
    '/superadmin',
  )
  return (
    <div className="card admin-card">
      <h2>SuperAdmin module (group)</h2>
      {loading && <p>Loading…</p>}
      {forbidden && <p className="muted">Not a SuperAdmin — denied.</p>}
      {error && <p className="error">{error}</p>}
      {data && <p className="hello">SuperAdmin ✓ — {data.user} · groups: {data.groups.join(', ')}</p>}
    </div>
  )
}

function FinanceCard() {
  const { data, loading, forbidden, error } = useProtected<{
    user: string
    department: string
    roles: string[]
  }>('/finance/orders')
  return (
    <div className="card admin-card">
      <h2>Finance module (role + claim)</h2>
      {loading && <p>Loading…</p>}
      {forbidden && <p className="muted">Denied — needs orders.write AND department=finance.</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <p className="hello">
          Finance ✓ — {data.user} · dept: {data.department} · roles: {data.roles.join(', ')}
        </p>
      )}
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetchUser()
      .then(setUser)
      .finally(() => setReady(true))
  }, [])

  if (!ready) return <p>Loading…</p>

  return (
    <section id="center">
      <h1>Auth-Learn — BFF (tokens stay server-side)</h1>
      {user ? (
        <>
          <p className="hello">
            Logged in as {user.name} ({user.email})
          </p>
          <Suspense fallback={<p>Loading…</p>}>
            <Hello />
          </Suspense>
          <Orders />
          <AdminCard />
          <SuperAdminCard />
          <FinanceCard />
          <button type="button" onClick={logout}>
            Logout
          </button>
        </>
      ) : (
        <button type="button" onClick={login}>
          Login with Keycloak (via BFF)
        </button>
      )}
    </section>
  )
}

export default App
