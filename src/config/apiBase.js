// src/config/apiBase.js

function stripTrailingSlashes(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

function readEnvApiBase() {
  // CRA
  try {
    const v = stripTrailingSlashes(process?.env?.REACT_APP_API_BASE);
    if (v) return v;
  } catch {
    // ignore
  }

  // Vite (sem warning no CRA: acesso direto)
  try {
    // eslint-disable-next-line no-undef
    const v = stripTrailingSlashes((process.env.VITE_API_BASE || ""));
    if (v) return v;
  } catch {
    // ignore
  }

  // fallback "genérico" (se algum bundle injeta)
  try {
    const v = stripTrailingSlashes(
      process?.env?.API_BASE || process?.env?.PITACO_API_BASE
    );
    if (v) return v;
  } catch {
    // ignore
  }

  return "";
}

export function getApiBase() {
  // 0) runtime override (sem rebuild)
  if (typeof window !== "undefined") {
    const runtime = stripTrailingSlashes(window.__API_BASE__);
    if (runtime) return runtime;
  }

  // 1) env (preferencial)
  const fromEnv = readEnvApiBase();
  if (fromEnv) return fromEnv;

  // 2) browser runtime (heurísticas)
  if (typeof window !== "undefined") {
    const { hostname, origin, protocol } = window.location || {};
    const host = String(hostname || "").toLowerCase();

    // dev local
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://127.0.0.1:3333";
    }

    // same-origin
    const sameOrigin = stripTrailingSlashes(origin);
    if (sameOrigin) return sameOrigin;

    // fallback seguro
    const proto = String(protocol || "https:").startsWith("http")
      ? protocol
      : "https:";
    return `${proto}//${host}`;
  }

  // 3) fallback (SSR/build)
  return "https://palpitacojb.onrender.com";
}

export function apiUrl(pathname) {
  const base = getApiBase();
  const p = String(pathname || "").trim();

  if (!p) return base;
  if (/^https?:\/\//i.test(p)) return p;

  const cleanBase = stripTrailingSlashes(base);

  if (p.startsWith("/")) return `${cleanBase}${p}`;
  return `${cleanBase}/${p}`;
}

export default getApiBase;