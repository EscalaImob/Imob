import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import escalaImobFaviconUrl from "../assets/brand/escala-imob-icon-original.svg";
import { App } from "./App";
import "./app.css";

function ensureAppFavicon() {
  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.type = "image/svg+xml";
  favicon.href = escalaImobFaviconUrl;
}

ensureAppFavicon();

createRoot(document.getElementById("app-root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
