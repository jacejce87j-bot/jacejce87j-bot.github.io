import { createRoot } from "react-dom/client";
import { clearNativeApiTransport } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Clear any mobile API configuration for web app (uses Vite proxy instead)
clearNativeApiTransport();

createRoot(document.getElementById("root")!).render(<App />);
