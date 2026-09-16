import { use } from 'react'
import { api } from '../api'

export interface HelloResponse {
  message: string
}

let helloPromise: Promise<HelloResponse> | undefined

/** React 19 `use` hook. No token — the BFF cookie authenticates the proxied call. */
export function useHello(): HelloResponse {
  helloPromise ??= api.get<HelloResponse>('/hello').then((r) => r.data)
  return use(helloPromise)
}
