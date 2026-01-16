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

  console.log("Rodando auditoria RJ (bounds)...");

  const bounds = await getKingBoundsByUf({ uf: UF });

  // 🔍 LOG FORÇADO (evita Object colapsado no DevTools)
  console.log("BOUNDS RJ (raw):", bounds);
  console.log("BOUNDS RJ (json):", JSON.stringify(bounds, null, 2));

  return bounds;
}
