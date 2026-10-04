const rawBase = (import.meta.env.VITE_API_URL as string) || "";
export const API_BASE = rawBase.replace(/\/$/, "");

export function getApiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return p;
  return `${API_BASE}${p}`;
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(getApiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}