// In production (served via Nginx), API requests can be relative ('') or configured via VITE_API_BASE_URL
// In development with vite, dynamically use the current browser hostname so accessing via IP (e.g. 192.168.x.x) connects to the matching backend IP
const devApiUrl = typeof window !== 'undefined' && window.location?.hostname
  ? `http://${window.location.hostname}:8000`
  : 'http://127.0.0.1:8000';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL !== undefined 
  ? import.meta.env.VITE_API_BASE_URL 
  : (import.meta.env.DEV ? devApiUrl : '');