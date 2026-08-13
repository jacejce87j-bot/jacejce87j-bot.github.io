/**
 * Custom fetch wrapper for generated API hooks.
 * Automatically injects internal JWT tokens and resolves base URLs for Web and Mobile builds.
 */
export type ErrorType<T> = Error | T;
export type BodyType<T = unknown> = T;

export const configureNativeApiTransport = (baseUrl: string, token?: string) => {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      window.localStorage.setItem("api_base_url", baseUrl);
      if (token) window.localStorage.setItem("auth_token", token);
    } catch (e) {
      // ignore
    }
  }

  try {
    (globalThis as any).__API_BASE_URL__ = baseUrl;
    if (token) (globalThis as any).__AUTH_TOKEN__ = token;
  } catch (e) {
    // ignore
  }
};

export const clearNativeApiTransport = () => {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    window.localStorage.removeItem("api_base_url");
    window.localStorage.removeItem("auth_token");
  }
  try {
    if ((globalThis as any).__API_BASE_URL__) delete (globalThis as any).__API_BASE_URL__;
    if ((globalThis as any).__AUTH_TOKEN__) delete (globalThis as any).__AUTH_TOKEN__;
  } catch (e) {
    // ignore
  }
};

export const customFetch = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  console.log("[customFetch] Called with URL:", url);

  let fullUrl = url;

  if (!url.startsWith("http")) {
    const storedBaseUrl =
      (globalThis as any).__API_BASE_URL__ ||
      (typeof window !== "undefined" && typeof window.localStorage !== "undefined" && window.localStorage.getItem("api_base_url")) ||
      "";

    let viteApiUrl: string | undefined;
    try {
      // @ts-ignore
      if (typeof import.meta !== "undefined" && import.meta.env) {
        // @ts-ignore
        viteApiUrl = import.meta.env.VITE_API_URL;
      }
    } catch (e) {
      // ignore
    }

    const envBaseUrl =
      (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL) ||
      viteApiUrl ||
      "http://10.0.2.2:5000";

    const baseToUse = storedBaseUrl || envBaseUrl;

    if (baseToUse) {
      const cleanBase = baseToUse.replace(/\/$/, "");
      const cleanPath = url.startsWith("/") ? url : `/${url}`;
      fullUrl = `${cleanBase}${cleanPath}`;
      console.log("[customFetch] Resolved full URL:", fullUrl);
    } else {
      console.log("[customFetch] Using relative URL for API route");
    }
  }

  // Retrieve token safely across both Web (localStorage) and React Native (globalThis)
  const webToken = typeof window !== "undefined" && typeof window.localStorage !== "undefined" 
    ? localStorage.getItem("auth_token") 
    : null;
  const nativeToken = (globalThis as any).__AUTH_TOKEN__;
  const token = webToken || nativeToken;

  console.log("[customFetch] Token present:", !!token);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    console.log("[customFetch] Authorization header added");
  }

  console.log("[customFetch] Sending request...");
  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });
  console.log("[customFetch] Response status:", response.status);

  if (response.status === 401) {
    clearNativeApiTransport();
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
};

export default customFetch;