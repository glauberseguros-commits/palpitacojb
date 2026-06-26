// src/services/king/king.normalize.js
// Responsável por normalização, ordenação, dedupe, horários, posições e prizes.
// Migração controlada: as funções serão movidas gradualmente do kingResultsService.js para cá.

export const KING_NORMALIZE_MODULE_READY = true;

export function normalizePositions(positions) {
  const arr =
    Array.isArray(positions) && positions.length
      ? positions
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0)
      : null;

  if (!arr || !arr.length) return null;
  return Array.from(new Set(arr)).sort((a, b) => a - b);
}

export function isValidGrupo(n) {
  return Number.isFinite(Number(n)) && Number(n) >= 1 && Number(n) <= 25;
}

export function isValidPosition(n) {
  return Number.isFinite(Number(n)) && Number(n) >= 1 && Number(n) <= 10;
}

export function extractIntInRange(value, min, max) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n >= min && n <= max ? n : null;
  }

  const s = String(value).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }

  const m = s.match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function normalizeDigitsOnly(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(/\D+/g, "");
}

export function prizeWidthByPosition(position) {
  return Number(position) === 7 ? 3 : 4;
}

export function toPrizeDigitsByPosition(input, position) {
  const digits = normalizeDigitsOnly(input);
  if (!digits) return null;

  const w = prizeWidthByPosition(position);

  if (w === 3) {
    const last3 = digits.slice(-3).padStart(3, "0");
    return /^\d{3}$/.test(last3) ? last3 : null;
  }

  const last4 = digits.slice(-4).padStart(4, "0");
  return /^\d{4}$/.test(last4) ? last4 : null;
}

export function digitsToDezena2(numStr) {
  const s = String(numStr || "");
  if (!/^\d{2,4}$/.test(s)) return null;
  return s.slice(-2);
}

export function digitsToCentena3(numStr) {
  const s = String(numStr || "");
  if (!/^\d{3,4}$/.test(s)) return null;
  return s.slice(-3);
}

export function normalizePrize(p, prizeId) {
  const rawGrupo =
    p?.grupo ??
    p?.group ??
    p?.grupo2 ??
    p?.group2 ??
    p?.animal_grupo ??
    p?.g ??
    p?.grupo_animal ??
    p?.grupoAnimal ??
    null;

  const rawPos =
    p?.position ??
    p?.posicao ??
    p?.pos ??
    p?.colocacao ??
    p?.place ??
    p?.premio ??
    p?.prize ??
    p?.p ??
    null;

  const rawMilhar =
    p?.milhar ??
    p?.milhar4 ??
    p?.numero ??
    p?.number ??
    p?.num ??
    p?.valor ??
    p?.n ??
    null;

  const grupo = extractIntInRange(rawGrupo, 1, 25);
  const position = extractIntInRange(rawPos, 1, 10);

  const numero = toPrizeDigitsByPosition(rawMilhar, position);
  const digitsLen = numero ? numero.length : null;

  const dezena2 = numero ? digitsToDezena2(numero) : null;
  const centena3 = numero ? digitsToCentena3(numero) : null;

  const milhar4 = numero && numero.length === 4 ? numero : null;

  return {
    prizeId: prizeId ?? p?.prizeId ?? null,
    ...p,

    grupo,
    position,

    numero: numero || null,
    digitsLen,

    milhar4: milhar4 || null,
    milhar: numero || p?.milhar || null,

    dezena2: dezena2 || null,
    centena3: centena3 || null,

    animal: p?.animal ?? p?.label ?? "",
  };
}

export function sortPrizesByPosition(prizes) {
  return [...(prizes || [])].sort((a, b) => {
    const pa = Number.isFinite(Number(a?.position)) ? Number(a.position) : 999;
    const pb = Number.isFinite(Number(b?.position)) ? Number(b.position) : 999;
    return pa - pb;
  });
}

export function filterPrizesByPositions(prizesAllSorted, positionsArr) {
  if (!positionsArr || !positionsArr.length) return prizesAllSorted;
  const set = new Set(positionsArr.map(Number));
  return prizesAllSorted.filter((p) => set.has(Number(p.position)));
}

export function normalizeEmbeddedPrizesForAggregated(embeddedPrizes) {
  const arr = Array.isArray(embeddedPrizes) ? embeddedPrizes : [];
  if (!arr.length) return [];

  const normalized = arr.map((p, idx) =>
    normalizePrize(p, p?.prizeId ?? `emb_${idx}`)
  );

  return sortPrizesByPosition(
    normalized.filter(
      (x) =>
        isValidPosition(x?.position) &&
        (
          isValidGrupo(x?.grupo) ||
          x?.numero ||
          x?.milhar ||
          x?.milhar4 ||
          x?.dezena2 ||
          x?.centena3
        )
    )
  );
}
