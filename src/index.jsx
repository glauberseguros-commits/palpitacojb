// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Elemento #root não encontrado no DOM.");

const root = ReactDOM.createRoot(rootEl);

// ✅ StrictMode SOMENTE no DEV (recomendado).
// Se quiser desligar double-effects no DEV, troque STRICTMODE_DEV para false.
const STRICTMODE_DEV = true;

// ✅ Vite: flags oficiais
const isProd = import.meta.env.PROD;

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
