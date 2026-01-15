// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Elemento #root não encontrado no DOM.");

const root = ReactDOM.createRoot(rootEl);

// ✅ StrictMode SOMENTE no DEV (recomendado).
// Se quiser desligar double-effects no DEV, troque STRICTMODE_DEV para false.
const STRICTMODE_DEV = true;

const isProd = process.env.NODE_ENV === "production";

root.render(
  !isProd && STRICTMODE_DEV ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  )
);
