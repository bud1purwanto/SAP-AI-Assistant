import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.jsx'

// Registrasi Service Worker dengan auto-update berkala
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Versi baru terdeteksi dan diunduh, segera reload untuk menggunakan versi terbaru
    updateSW(true)
  },
  onOfflineReady() {
    // Siap digunakan secara offline
  },
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      // Periksa pembaruan ke server setiap 10 menit
      setInterval(() => {
        registration.update().catch(() => {})
      }, 10 * 60 * 1000)
    }
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

