import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PublicLandingApp } from "./landing-pages/PublicLandingApp";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.pathname.startsWith("/imob/") ? <PublicLandingApp /> : <App />}
  </StrictMode>,
);
