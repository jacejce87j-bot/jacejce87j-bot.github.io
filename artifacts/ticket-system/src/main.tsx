import { createRoot } from "react-dom/client";
import { clearNativeApiTransport } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { getApiUrl } from "@/lib/api";

// Clear any mobile API configuration
clearNativeApiTransport();

// --- FIX: redirect ALL /api/* calls to Render, even if file still says /api ---
const _origFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    input = getApiUrl(input);
  } else if (input instanceof Request && input.url.includes('/api/') && new URL(input.url, window.location.origin).pathname.startsWith('/api/')) {
    // handle Request objects with relative /api
    const url = input.url.startsWith('/api/') ? getApiUrl(input.url) : input.url;
    input = new Request(url, input);
  }
  return _origFetch(input as any, init);
}) as any;

createRoot(document.getElementById("root")!).render(<App />);