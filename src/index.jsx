// src/index.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60 * 1000,
      gcTime: 60 * 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const AppTree = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>
);

root.render(
  !isProd && STRICTMODE_DEV ? (
    <React.StrictMode>{AppTree}</React.StrictMode>
  ) : (
    AppTree
  )
);