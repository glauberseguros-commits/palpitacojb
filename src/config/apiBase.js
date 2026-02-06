export function getApiBase() {
  // produção: usa API do Render direto
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = String(window.location.hostname).toLowerCase();
    if (host === "palpitacojb.com.br" || host === "www.palpitacojb.com.br") {
      return "https://api.palpitacojb.com.br";
    }
  }

  // dev/local: usa backend local se existir, senão fallback no Render
  return process.env.REACT_APP_API_BASE || "http://127.0.0.1:3333";
}
