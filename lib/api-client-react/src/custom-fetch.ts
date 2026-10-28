/**
 * Custom fetch wrapper for generated API hooks.
 * Automatically injects internal JWT tokens and resolves base URLs for Web and Mobile builds.
 */
export type ErrorType<T> = Error | T;
export type BodyType<T = unknown> = T;

export type ApiFallbackEndpoints = {
  primaryApi: string;
  backupApi: string;
};

let configuredBackupBaseUrl: string | undefined;

const resolveApiUrl = (baseUrl: string, path: string) => {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
};

export const fetchWithFallback = async (
  path: string,
  options: RequestInit = {},
  endpoints: ApiFallbackEndpoints,
): Promise<Response> => {
  const targetPath = /^https?:\/\//i.test(path)
    ? `${new URL(path).pathname}${new URL(path).search}${new URL(path).hash}`
    : path;
  const primaryUrl = resolveApiUrl(endpoints.primaryApi, targetPath);
  const backupUrl = resolveApiUrl(endpoints.backupApi, targetPath);
  let primaryResponse: Response | undefined;
  let primaryError: unknown;

  try {
    primaryResponse = await fetch(primaryUrl, options);
    if (primaryResponse.status < 500) {
      console.info("[API] Request served by primary endpoint");
      return primaryResponse;
    }
    console.warn(`[API] Primary endpoint returned HTTP ${primaryResponse.status}; retrying via backup`);
  } catch (error) {
    primaryError = error;
    console.warn("[API] Primary endpoint was unreachable; retrying via backup");
  }

  try {
    const backupResponse = await fetch(backupUrl, options);
    if (backupResponse.status < 500) {
      console.info("[API] Request served by Tailscale backup endpoint");
    } else {
      console.warn(`[API] Tailscale backup endpoint returned HTTP ${backupResponse.status}`);
    }
    return backupResponse;
  } catch (backupError) {
    const primaryFailure = primaryResponse
      ? `Primary endpoint returned HTTP ${primaryResponse.status}`
      : primaryError instanceof Error
        ? primaryError.message
        : "Primary endpoint failed";
    const backupFailure = backupError instanceof Error ? backupError.message : "Backup endpoint failed";
    throw new Error(`API request failed on both endpoints. ${primaryFailure}; ${backupFailure}`);
  }
};

export const configureNativeApiTransport = (baseUrl: string, token?: string, backupBaseUrl?: string) => {
  configuredBackupBaseUrl = backupBaseUrl?.replace(/\/+$/, "");

  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      window.localStorage.setItem("api_base_url", baseUrl);
      if (configuredBackupBaseUrl) {
        window.localStorage.setItem("api_backup_base_url", configuredBackupBaseUrl);
      } else {
        window.localStorage.removeItem("api_backup_base_url");
      }
      if (token) window.localStorage.setItem("auth_token", token);
    } catch (e) {
      // ignore
    }
  }

  try {
    (globalThis as any).__API_BASE_URL__ = baseUrl;
    (globalThis as any).__API_BACKUP_BASE_URL__ = configuredBackupBaseUrl;
    if (token) (globalThis as any).__AUTH_TOKEN__ = token;
  } catch (e) {
    // ignore
  }
};

export const clearNativeApiTransport = () => {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    window.localStorage.removeItem("api_base_url");
    window.localStorage.removeItem("api_backup_base_url");
    window.localStorage.removeItem("auth_token");
  }
  try {
    if ((globalThis as any).__API_BASE_URL__) delete (globalThis as any).__API_BASE_URL__;
    if ((globalThis as any).__API_BACKUP_BASE_URL__) delete (globalThis as any).__API_BACKUP_BASE_URL__;
    if ((globalThis as any).__AUTH_TOKEN__) delete (globalThis as any).__AUTH_TOKEN__;
    configuredBackupBaseUrl = undefined;
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

  const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";

  if (!url.startsWith("http") && !isBrowser) {
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
    ? localStorage.getItem("userToken") ||
      localStorage.getItem("auth_token") ||
      localStorage.getItem("token")
    : null;
  const nativeToken = (globalThis as any).__AUTH_TOKEN__;
  const token = webToken || nativeToken;

  console.log("[customFetch] Token present:", !!token);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    // set the authorization header correctly
    headers["Authorization"] = `Bearer ${token}`;
    console.log("[customFetch] Authorization header added");
  }

  console.log("[customFetch] Sending request...");
  const requestOptions = {
    ...options,
    headers,
  };
  const backupBaseUrl =
    configuredBackupBaseUrl ||
    (globalThis as any).__API_BACKUP_BASE_URL__ ||
    (typeof window !== "undefined" && typeof window.localStorage !== "undefined"
      ? window.localStorage.getItem("api_backup_base_url")
      : undefined);
  const primaryBaseUrl =
    (globalThis as any).__API_BASE_URL__ ||
    (typeof window !== "undefined" && typeof window.localStorage !== "undefined"
      ? window.localStorage.getItem("api_base_url")
      : undefined);
  const response = backupBaseUrl && primaryBaseUrl
    ? await fetchWithFallback(fullUrl, requestOptions, {
        primaryApi: primaryBaseUrl,
        backupApi: backupBaseUrl,
      })
    : await fetch(fullUrl, requestOptions);
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
