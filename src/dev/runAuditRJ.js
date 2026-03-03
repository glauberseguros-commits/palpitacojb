// src/dev/runAuditRJ.js
import { getKingBoundsByUf } from "../services/kingResultsService";

/**
 * Auditoria inicial RJ
 * - valida limites reais da base
 * - prepara motor estatístico
 * - LOG controlável (debug)
 */
function isYmdStrict(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function shouldDebug() {
  // CRA: REACT_APP_DEBUG_AUDIT=1
  // Vite: VITE_DEBUG_AUDIT=1
  try {
    const cra = String(process?.env?.REACT_APP_DEBUG_AUDIT || "").trim();
    if (cra) return cra === "1" || cra.toLowerCase() === "true";
  } catch {}

  // Vite (sem warning no CRA: acesso direto)
  try {
    // eslint-disable-next-line no-undef
    const vite = String(import.meta.env.VITE_DEBUG_AUDIT || "").trim();
    if (vite) return vite === "1" || vite.toLowerCase() === "true";
  } catch {}

  return false;
}

export async function runAuditRJ() {
  const UF = "RJ";
  const DEBUG = shouldDebug();

  console.log("[AUDIT][RJ] Rodando auditoria (bounds)...");

  try {
    const bounds = await getKingBoundsByUf({ uf: UF });

    if (DEBUG) {
      console.log("[AUDIT][RJ] BOUNDS (raw):", bounds);
      console.log("[AUDIT][RJ] BOUNDS (json):", JSON.stringify(bounds, null, 2));
    } else {
      console.log("[AUDIT][RJ] bounds recebido.");
    }

    if (!bounds || typeof bounds !== "object") {
      console.warn("[AUDIT][RJ] bounds inválido (não é objeto):", bounds);
      return bounds;
    }

    const { minDate, maxDate, days, uf } = bounds;

    if (uf && String(uf).toUpperCase() !== UF) {
      console.warn("[AUDIT][RJ] UF retornada diferente:", uf);
    }

    if (!minDate || !maxDate) {
      console.warn("[AUDIT][RJ] minDate/maxDate ausentes:", { minDate, maxDate });
    } else {
      if (!isYmdStrict(minDate) || !isYmdStrict(maxDate)) {
        console.warn(
          "[AUDIT][RJ] minDate/maxDate não estão em YYYY-MM-DD estrito:",
          { minDate, maxDate }
        );
      }
    }

    if (days != null) {
      const n = Number(days);
      if (!Number.isFinite(n) || n <= 0) {
        console.warn("[AUDIT][RJ] days suspeito:", days);
      }
    }

    return bounds;
  } catch (err) {
    console.error("[AUDIT][RJ] Falha ao buscar bounds:", err);
    return null;
  }
}