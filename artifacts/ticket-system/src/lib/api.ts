export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export function getApiUrl(p: string): string { const path = p.startsWith("/")?p:`/${p}`; return API_BASE ? `${API_BASE}${path}` : path; }

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const token =
    localStorage.getItem("userToken") ||
    localStorage.getItem("auth_token") ||
    localStorage.getItem("token");

  return token ? { Authorization: `Bearer ${token}` } : {};
}
