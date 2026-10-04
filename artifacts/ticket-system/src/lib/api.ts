export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export function getApiUrl(p){ const path = p.startsWith("/")?p:`/${p}`; return API_BASE ? `${API_BASE}${path}` : path; }
