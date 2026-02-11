export function getApiBase() {
  // 1) CRA env
  const env = typeof process !== "undefined" ? process.env?.REACT_APP_API_BASE : undefined;
  const v = String(env || "").trim();
  if (v) return v.replace(/\/+$/, "");

  // 2) browser runtime
  if (typeof window !== "undefined") {
    const host = String(window.location.host || "");
    // dev local
    if (/localhost|127\.0\.0\.1/i.test(host)) return "";
    // produção: mesma origem (Vercel rewrites -> api.palpitacojb.com.br)
    return window.location.origin;
  }

  // 3) fallback (build/server)
  return "https://api.palpitacojb.com.br";
}

export default getApiBase;

