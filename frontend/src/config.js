// In production (served via Nginx), API requests can be relative ('') or configured via VITE_API_BASE_URL
// In development with vite, it defaults to 'http://127.0.0.1:8000' or whatever is set in .env
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL !== undefined 
  ? import.meta.env.VITE_API_BASE_URL 
  : (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');