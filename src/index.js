// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Elemento #root não encontrado no DOM.");

const root = ReactDOM.createRoot(rootEl);

// ✅ Mantemos StrictMode no DEV (é o padrão e ajuda a pegar bugs)
// Se você quiser DESLIGAR StrictMode no DEV por causa de double-effects,
// troque STRICTMODE_DEV para false.
const STRICTMODE_DEV = true;

const isProd = process.env.NODE_ENV === "production";

root.render(
  (isProd || STRICTMODE_DEV) ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  )
);
