// src/index.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Elemento #root não encontrado no DOM.");

const root = ReactDOM.createRoot(rootEl);

// ✅ StrictMode SOMENTE no DEV.
// Para auditoria de bugs (efeitos duplicados), coloque false temporariamente.
const STRICTMODE_DEV = true;

// ✅ CRA (react-scripts): ambiente
const isProd = process.env.NODE_ENV === "production";

const AppTree = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

root.render(
  !isProd && STRICTMODE_DEV ? (
    <React.StrictMode>{AppTree}</React.StrictMode>
  ) : (
    AppTree
  )
);