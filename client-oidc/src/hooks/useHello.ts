import { use } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5111'

export interface HelloResponse {
  message: string
}

const cache = new Map<string, Promise<HelloResponse>>()

function fetchHello(token: string): Promise<HelloResponse> {
  return axios
    .get<HelloResponse>(`${API_URL}/hello`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then((res) => res.data)
}

/** React 19 `use` hook reading a cached, authenticated fetch promise. */
export function useHello(token: string): HelloResponse {
  let promise = cache.get(token)
  if (!promise) {
    promise = fetchHello(token)
    cache.set(token, promise)
  }
  return use(promise)
}
