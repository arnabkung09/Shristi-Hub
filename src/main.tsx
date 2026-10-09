import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerAppServiceWorker } from "./lib/firebase-client";

// Eagerly pre-warm Service Worker registration for instant mobile notifications
void registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
