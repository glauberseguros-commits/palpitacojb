// src/config/apiBase.js

function stripTrailingSlashes(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

/**
 * ✅ Vite env reader SEM referenciar import.meta diretamente (CRA não reclama).
 * - Em Vite, import.meta.env existe.
 * - Em CRA, isso falha silenciosamente e seguimos com process.env / heurísticas.
 */
function readViteEnv(key) {
  try {
    // import.meta não pode aparecer no código do CRA
    // então acessamos via Function com string.
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "k",
      'try { return (typeof import !== "undefined" && import.meta && import.meta.env) ? import.meta.env[k] : undefined; } catch(e) { return undefined; }'
    );
    return fn(key);
  } catch {
    return undefined;
  }
}

function readEnvApiBase() {
  // CRA (preferencial)
  try {
    const v = stripTrailingSlashes(process?.env?.REACT_APP_API_BASE);
    if (v) return v;
  } catch {
    // ignore
  }

  // Vite (sem import.meta direto)
  try {
    const v = stripTrailingSlashes(readViteEnv("VITE_API_BASE"));
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

    // same-origin (reverse proxy / deploy monorepo)
    const sameOrigin = stripTrailingSlashes(origin);
    if (sameOrigin) {
      // Se quiser forçar /api no same-origin:
      // return `${sameOrigin}/api`;
      return sameOrigin;
    }

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