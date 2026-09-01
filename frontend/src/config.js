// Di production (Nginx) maupun development (Vite reverse proxy),
// request API selalu menggunakan path relatif ('') sehingga browser klien
// tidak perlu mengakses port backend secara langsung atau terhalang firewall/CORS.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';