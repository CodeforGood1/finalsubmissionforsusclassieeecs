// API Configuration
// In production (Docker), frontend is served from the same origin as the API
// In development, we use the Vite proxy or localhost:5000

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Named export for compatibility with NotificationBell
export const API_URL = API_BASE_URL;

export default API_BASE_URL;
