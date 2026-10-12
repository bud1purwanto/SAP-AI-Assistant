// Fallback untuk react-refresh jika preamble terlambat diinisialisasi
if (typeof window !== 'undefined') {
  window.$RefreshReg$ = window.$RefreshReg$ || (() => {});
  window.$RefreshSig$ = window.$RefreshSig$ || (() => (type) => type);
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.jsx'

// Registrasi Service Worker dengan auto-update berkala (hanya pada mode Production)
if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onOfflineReady() {},
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {})
        }, 10 * 60 * 1000)
      }
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

