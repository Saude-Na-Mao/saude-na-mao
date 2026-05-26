import React from "react";
import ReactDOM from "react-dom/client";
import { validateEnv } from "./config/env";
import Logger from "./utils/logger";
import AccessibilityProvider from "./components/AccessibilityProvider";
import App from "./App";
import "./index.css";

const logger = new Logger("Main");

try {
  validateEnv();
  logger.info("Application starting...");
} catch (error) {
  logger.error("Failed to start application", error);
  document.body.innerHTML = `<pre style="color:red;padding:20px;">Erro ao iniciar aplicação:\n\n${error.message}</pre>`;
  process.exit(1);
}

// Evita bundle antigo do PWA atrapalhar testes locais de login/rotas.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.hostname === "localhost"
) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((r) => r.unregister());
    })
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AccessibilityProvider>
      <App />
    </AccessibilityProvider>
  </React.StrictMode>,
);
