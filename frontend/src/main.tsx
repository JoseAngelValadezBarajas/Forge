import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./app/App";
import { DesktopStartupGate } from "./app/desktop/DesktopStartupGate";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopStartupGate>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </DesktopStartupGate>
  </StrictMode>,
);

