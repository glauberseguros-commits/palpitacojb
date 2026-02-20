// src/config/apiBase.js
export function getApiBase() {
  // 1) CRA env (preferencial)
  const env = typeof process !== "undefined" ? process.env?.REACT_APP_API_BASE : undefined;
  const v = String(env || "").trim();
  if (v) return v.replace(/\/+$/, "");

  // 2) browser runtime
  if (typeof window !== "undefined") {
    const host = String(window.location?.hostname || "").toLowerCase();

    // dev local
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://127.0.0.1:3333";
    }

    // produção atual: backend está no Render
    return "https://palpitacojb.onrender.com";
  }

  // 3) fallback (build/server)
  return "https://palpitacojb.onrender.com";
}

export function apiUrl(pathname) {
  const base = getApiBase();
  const p = String(pathname || "");
  if (!p) return base;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("/")) return `${base}${p}`;
  return `${base}/${p}`;
}

export default getApiBase;