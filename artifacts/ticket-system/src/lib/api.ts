const rawBase = (import.meta.env.VITE_API_URL as string) || "";
export const API_BASE = rawBase.replace(/\/$/, "");
export function getApiUrl(path: string) {
  const p = path.startsWith("/") ? path : /;
  if (!API_BASE) return p;
  return ${API_BASE};
}
