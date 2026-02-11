// src/dev/runAuditRJ.js
import { getKingBoundsByUf } from "../services/kingResultsService";

/**
 * Auditoria inicial RJ
 * - valida limites reais da base
 * - prepara motor estatístico
 * - LOG EXPLÍCITO (debug controlado)
 */
export async function runAuditRJ() {
  const UF = "RJ";

  console.log("[AUDIT][RJ] Rodando auditoria (bounds)...");

  try {
    const bounds = await getKingBoundsByUf({ uf: UF });

    // 🔍 LOG FORÇADO (evita Object colapsado no DevTools)
    console.log("[AUDIT][RJ] BOUNDS (raw):", bounds);
    console.log("[AUDIT][RJ] BOUNDS (json):", JSON.stringify(bounds, null, 2));

    // validação mínima (não quebra fluxo; só alerta)
    if (!bounds || typeof bounds !== "object") {
      console.warn("[AUDIT][RJ] bounds inválido (não é objeto):", bounds);
      return bounds;
    }

    const { minDate, maxDate, days, uf } = bounds;

    if (uf && String(uf).toUpperCase() !== UF) {
      console.warn("[AUDIT][RJ] UF retornada diferente:", uf);
    }

    // checks “soft” (pra detectar range quebrado sem travar)
    if (!minDate || !maxDate) {
      console.warn("[AUDIT][RJ] minDate/maxDate ausentes:", { minDate, maxDate });
    }

    if (days != null && (!Number.isFinite(Number(days)) || Number(days) <= 0)) {
      console.warn("[AUDIT][RJ] days suspeito:", days);
    }

    return bounds;
  } catch (err) {
    console.error("[AUDIT][RJ] Falha ao buscar bounds:", err);
    // mantém contrato: retorna null em erro
    return null;
  }
}
