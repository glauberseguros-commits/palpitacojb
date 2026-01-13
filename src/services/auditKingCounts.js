// src/services/auditKingCounts.js
import {
  getBichoByGrupo as getBichoByGrupoFn,
  normalizeAnimal as normalizeAnimalFn,
} from "../constants/bichoMap";

function pad2(n) {
  return String(n).padStart(2, "0");
}

/* =========================
   SAFE WRAPPERS (não quebra se import vier diferente)
========================= */

function safeNormalizeAnimal(value) {
  try {
    if (typeof normalizeAnimalFn === "function") return normalizeAnimalFn(value);
  } catch {}
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeGetBichoByGrupo(grupoNum) {
  try {
    if (typeof getBichoByGrupoFn === "function") return getBichoByGrupoFn(grupoNum);
  } catch {}
  return null;
}

/* =========================
   FIELD EXTRACTORS (compat)
========================= */

/**
 * Pega a "data" do draw em múltiplos formatos/campos comuns do seu projeto.
 */
function extractRawDateFromDraw(d) {
  if (!d) return null;
  return (
    d.date ??
    d.ymd ??
    d.draw_date ??
    d.drawDate ??
    d.close_date ??
    d.closeDate ??
    d.data ??
    d.dt ??
    null
  );
}

/**
 * Pega a "hora de fechamento" do draw em múltiplos campos.
 */
function extractRawCloseHourFromDraw(d) {
  if (!d) return null;
  return d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? null;
}

/**
 * Identificadores extras (ajuda o dedupe, principalmente se misturar fontes/UF).
 */
function extractDrawScope(d) {
  if (!d) return { uf: "", lottery: "" };
  const uf = String(d.uf ?? d.UF ?? "").trim();
  const lottery = String(d.lottery_key ?? d.lotteryKey ?? d.lottery ?? "").trim();
  return { uf, lottery };
}

/**
 * Normaliza hora para comparação segura:
 * - "10h" -> "10:00"
 * - "10"  -> "10:00"
 * - "10:9" -> "10:09"
 * - "10:09" mantém
 */
function normalizeHourLike(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = String(m3[1]).padStart(2, "0");
    const mm = String(m3[2]).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return s;
}

/**
 * Valida se está em formato HH:MM (00..23:00..59)
 */
function isValidHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return (
    Number.isFinite(hh) &&
    Number.isFinite(mm) &&
    hh >= 0 &&
    hh <= 23 &&
    mm >= 0 &&
    mm <= 59
  );
}

/**
 * Normaliza "qualquer data" para YYYY-MM-DD (ou null).
 * Aceita:
 * - "YYYY-MM-DD"
 * - "DD/MM/YYYY"
 * - ISO "YYYY-MM-DDTHH:mm:ss..."
 * - Timestamp-like { seconds }
 * - Date
 * - Firestore Timestamp (toDate)
 */
function normalizeToYMD(input) {
  if (!input) return null;

  // Firestore Timestamp com toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) || Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);

    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  // Date
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(
      input.getDate()
    )}`;
  }

  const s = String(input).trim();
  if (!s) return null;

  // YYYY-MM-DD...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

/* =========================
   ✅ DEDUPE (blindagem anti-duplicidade)
   - usa id/drawId quando existir
   - fallback: uf/lottery + ymd + close_hour_norm
   - se nada existir, NÃO elimina (evita colisão massiva)
========================= */

function dedupeDraws(drawsRaw) {
  const arr = Array.isArray(drawsRaw) ? drawsRaw : [];
  if (!arr.length) return arr;

  const seen = new Set();
  const out = [];

  for (let i = 0; i < arr.length; i += 1) {
    const d = arr[i];

    const ymd = normalizeToYMD(extractRawDateFromDraw(d)) || "";
    const hh = normalizeHourLike(extractRawCloseHourFromDraw(d)) || "";

    const { uf, lottery } = extractDrawScope(d);

    const idLike =
      (d?.drawId != null && String(d.drawId)) ||
      (d?.id != null && String(d.id)) ||
      "";

    let key = idLike;

    if (!key) {
      // chave composta (mais segura do que só ymd+hora)
      const scope = `${uf || ""}__${lottery || ""}`.trim();
      const core = `${ymd}__${hh}`.trim();
      key = `${scope}__${core}`.replace(/^__+|__+$/g, "");
    }

    // Se ainda assim está “vazia” (sem info), não deduplica para evitar apagar tudo
    if (!key || key === "__" || key === "____") {
      out.push(d);
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }

  return out;
}

/**
 * draws: [
 *  { date|ymd|..., close_hour|..., prizes: [{ grupo, animal, position? }] }
 * ]
 *
 * options:
 *  - position: 1|2|3|4|5 (opcional)
 *  - hour: "11:00" | "11h" | "11" (opcional)
 *  - matchHourOnly: boolean (opcional)
 */
export function auditCountsByGrupo(drawsRaw, options = {}) {
  // ✅ blindagem: evita inflação por draw duplicado
  const draws = dedupeDraws(drawsRaw);

  const posOpt = options?.position;
  const positionFilter =
    posOpt === null || posOpt === undefined || posOpt === ""
      ? null
      : Number(posOpt);

  const matchHourOnly = Boolean(options?.matchHourOnly); // default: false

  // normaliza filtro de hora; se inválido, ignora para não "zerar" por engano
  const rawHourFilter = normalizeHourLike(options?.hour);
  let hourFilter = rawHourFilter;

  if (hourFilter != null) {
    if (matchHourOnly) {
      const hh = String(hourFilter).slice(0, 2);
      if (!/^\d{2}$/.test(hh)) hourFilter = null;
    } else {
      if (!isValidHHMM(hourFilter)) hourFilter = null;
    }
  }

  const counts = new Map(); // "01" -> count
  const integrityIssues = [];
  let totalOcorrencias = 0;

  for (const d of draws || []) {
    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];

    // normaliza close_hour do draw (se existir)
    const drawHour = normalizeHourLike(extractRawCloseHourFromDraw(d));

    for (const p of prizes) {
      const gNum = Number(p?.grupo ?? p?.group);
      if (!Number.isFinite(gNum) || gNum < 1 || gNum > 25) continue;

      // filtro por posição (se aplicado)
      if (positionFilter != null) {
        const pos = Number(p?.posicao ?? p?.position ?? 0);
        if (!Number.isFinite(pos) || pos !== positionFilter) continue;
      }

      // filtro por horário (se aplicado e válido)
      if (hourFilter != null) {
        if (!drawHour) continue;

        if (matchHourOnly) {
          const hhDraw = String(drawHour).slice(0, 2);
          const hhFilter = String(hourFilter).slice(0, 2);
          if (hhDraw !== hhFilter) continue;
        } else {
          if (drawHour !== hourFilter) continue;
        }
      }

      const g = pad2(gNum);

      // integridade: grupo deve bater com animal oficial (quando animal existir no dado)
      const bicho = safeGetBichoByGrupo(gNum);
      const animalBase = bicho ? safeNormalizeAnimal(bicho.animal) : "";
      const animalFromData = safeNormalizeAnimal(p?.animal);

      if (animalFromData && animalBase && animalFromData !== animalBase) {
        integrityIssues.push({
          date: extractRawDateFromDraw(d) || null,
          date_ymd: normalizeToYMD(extractRawDateFromDraw(d)),
          close_hour: extractRawCloseHourFromDraw(d) || null,
          close_hour_norm: drawHour,
          grupo: g,
          animal_no_dado: p?.animal || "",
          animal_oficial: bicho?.animal || "",
          position: p?.posicao ?? p?.position ?? null,
        });
      }

      counts.set(g, (counts.get(g) || 0) + 1);
      totalOcorrencias += 1;
    }
  }

  // 01..25 sem sort (auditoria “linha a linha”)
  const rowsByGrupo = Array.from({ length: 25 }, (_, i) => {
    const grupo = pad2(i + 1);
    const val = counts.get(grupo) || 0;
    const bicho = safeGetBichoByGrupo(i + 1);

    return {
      grupo,
      animal: bicho?.animal || "",
      apar: val,
      share: totalOcorrencias
        ? `${Number((val / totalOcorrencias) * 100).toFixed(2)}%`
        : "0.00%",
    };
  });

  // ranking desc (para UI)
  const rowsSorted = [...rowsByGrupo].sort((a, b) => b.apar - a.apar);

  return {
    rows: rowsSorted, // compat (UI)
    rowsByGrupo, // auditoria 01..25
    totalOcorrencias,
    integrityIssues,
    appliedFilters: {
      position:
        positionFilter != null && Number.isFinite(positionFilter)
          ? positionFilter
          : null,
      hour: hourFilter,
      matchHourOnly,
    },
  };
}

/**
 * Calcula totais básicos:
 * - draws: quantidade de draws (sorteios)
 * - uniqueDays: quantidade de dias únicos (com base em draw.date|ymd|...)
 *
 * ✅ Correção:
 * - dedupe de draws para não inflar
 */
export function computeDrawTotals(drawsRaw) {
  const list = dedupeDraws(drawsRaw);

  const unique = new Set();
  for (const d of list) {
    const ymd = normalizeToYMD(extractRawDateFromDraw(d));
    if (ymd) unique.add(ymd);
  }

  return {
    draws: list.length,
    uniqueDays: unique.size,
  };
}

/**
 * AUDIT MASTER (resumo de integridade)
 */
export function auditDatasetSummary(drawsRaw, options = {}) {
  const draws = dedupeDraws(drawsRaw);
  const sampleLimit = Number(options?.sampleLimit ?? 20);

  let drawsWithPrizes = 0;
  let drawsWithoutPrizes = 0;

  let prizesTotal = 0;

  let invalidDateCount = 0;
  let invalidCloseHourCount = 0;

  let invalidGrupoCount = 0;
  let missingGrupoCount = 0;

  let missingPositionCount = 0;
  let invalidPositionCount = 0;

  for (const d of draws) {
    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];

    if (prizes.length) drawsWithPrizes += 1;
    else drawsWithoutPrizes += 1;

    const ymd = normalizeToYMD(extractRawDateFromDraw(d));
    if (!ymd) invalidDateCount += 1;

    const hhmm = normalizeHourLike(extractRawCloseHourFromDraw(d));
    if (!hhmm || !isValidHHMM(hhmm)) invalidCloseHourCount += 1;

    prizesTotal += prizes.length;

    for (const p of prizes) {
      const gNum = Number(p?.grupo ?? p?.group);
      if (!Number.isFinite(gNum)) {
        missingGrupoCount += 1;
      } else if (gNum < 1 || gNum > 25) {
        invalidGrupoCount += 1;
      }

      const posRaw = p?.posicao ?? p?.position;
      if (posRaw === null || posRaw === undefined || posRaw === "") {
        missingPositionCount += 1;
      } else {
        const pos = Number(posRaw);
        if (!Number.isFinite(pos) || pos < 1 || pos > 10) {
          invalidPositionCount += 1;
        }
      }
    }
  }

  const byGrupo = auditCountsByGrupo(draws, {
    position: options?.position ?? null,
    hour: options?.hour ?? null,
    matchHourOnly: options?.matchHourOnly ?? false,
  });

  const animalMismatchCount = byGrupo.integrityIssues.length;
  const integrityIssuesSample = byGrupo.integrityIssues.slice(
    0,
    Math.max(0, Number.isFinite(sampleLimit) ? sampleLimit : 20)
  );

  const totals = computeDrawTotals(draws);

  return {
    totals: {
      draws: draws.length,
      uniqueDays: totals.uniqueDays,
      drawsWithPrizes,
      drawsWithoutPrizes,
      prizesTotal,
    },
    issues: {
      invalidDateCount,
      invalidCloseHourCount,
      missingGrupoCount,
      invalidGrupoCount,
      missingPositionCount,
      invalidPositionCount,
      animalMismatchCount,
    },
    byGrupo: {
      rowsByGrupo: byGrupo.rowsByGrupo,
      rowsSorted: byGrupo.rows,
      totalOcorrencias: byGrupo.totalOcorrencias,
      appliedFilters: byGrupo.appliedFilters,
    },
    integrityIssuesSample,
    auditOptions: {
      position: options?.position ?? null,
      hour: options?.hour ?? null,
      matchHourOnly: Boolean(options?.matchHourOnly),
      sampleLimit: Number.isFinite(sampleLimit) ? sampleLimit : 20,
    },
  };
}
