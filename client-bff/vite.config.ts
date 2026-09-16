import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Everything the browser needs is same-origin (localhost:5176) and proxied to the
// BFF (localhost:5080). X-Forwarded-* let the BFF build redirect URIs on 5176.
const toBff = {
  target: 'http://localhost:5080',
  changeOrigin: true,
  headers: {
    'X-Forwarded-Host': 'localhost:5176',
    'X-Forwarded-Proto': 'http',
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    proxy: {
      '/bff': toBff,
      '/api': toBff,
      '/signin-oidc': toBff,
      '/signout-callback-oidc': toBff,
    },
  },
})
