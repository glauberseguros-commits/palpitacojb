import { safeStr, toHourBucket } from "../top3.formatters";
import { buildMilharesForGrupo } from "../top3.engine";
import { getAnimalLabel, getImgFromGrupo } from "../../../constants/bichoMap";

export function clampTop3Prob(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

export function resolveTop3ProbValue(x) {
  return clampTop3Prob(x?.scoreProb ?? x?.prob ?? x?.probCond ?? 0);
}

export function normalizeTop3Milhar4(v) {
  const dig = String(v || "").replace(/\D+/g, "");
  if (!dig) return "";
  return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
}

export function buildTop3MilharesCols(out, expectedCols = 4, perCol = 5) {
  const dezenas = Array.isArray(out?.dezenas) ? out.dezenas : [];
  const slots = Array.isArray(out?.slots) ? out.slots : [];
  const cols = [];

  for (const dz of dezenas.slice(0, expectedCols)) {
    const items = slots
      .filter((s) => String(s?.dezena || "") === String(dz))
      .map((s) => normalizeTop3Milhar4(s?.milhar))
      .map((m) => (/^\d{4}$/.test(m) ? m : ""))
      .slice(0, perCol);

    while (items.length < perCol) items.push("");
    cols.push({ dezena: dz, items });
  }

  while (cols.length < expectedCols) {
    cols.push({ dezena: "", items: Array(perCol).fill("") });
  }

  return cols.slice(0, expectedCols);
}

export function normalizeTop3ImgSrc(src, publicBase = "") {
  const s = String(src || "").trim();
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s)) return s;
  if (/^(data:|blob:)/i.test(s)) return s;

  const base = String(publicBase || "").trim().replace(/\/+$/, "");

  if (s.startsWith("/")) return `${base}${s}`;
  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;
  return `${base}/${s}`;
}

export function buildTop3ImgVariants(grupo, publicBase = "", size = 96) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const seeds = [getImgFromGrupo?.(g, size), getImgFromGrupo?.(g)]
    .map((x) => normalizeTop3ImgSrc(x, publicBase))
    .filter(Boolean);

  const out = [];

  for (const seed of seeds) {
    const clean = String(seed).split("?")[0];
    if (!clean) continue;

    out.push(clean);

    if (/\.png$/i.test(clean)) {
      out.push(clean.replace(/\.png$/i, ".jpg"));
      out.push(clean.replace(/\.png$/i, ".jpeg"));
      out.push(clean.replace(/\.png$/i, ".webp"));
    } else if (/\.jpg$/i.test(clean)) {
      out.push(clean.replace(/\.jpg$/i, ".png"));
      out.push(clean.replace(/\.jpg$/i, ".jpeg"));
      out.push(clean.replace(/\.jpg$/i, ".webp"));
    } else if (/\.jpeg$/i.test(clean)) {
      out.push(clean.replace(/\.jpeg$/i, ".png"));
      out.push(clean.replace(/\.jpeg$/i, ".jpg"));
      out.push(clean.replace(/\.jpeg$/i, ".webp"));
    } else if (/\.webp$/i.test(clean)) {
      out.push(clean.replace(/\.webp$/i, ".png"));
      out.push(clean.replace(/\.webp$/i, ".jpg"));
      out.push(clean.replace(/\.webp$/i, ".jpeg"));
    }
  }

  return Array.from(new Set(out.filter(Boolean)));
}

function isValidGrupo(g) {
  const n = Number(g);
  return Number.isFinite(n) && n >= 1 && n <= 25;
}

export function buildTop3CardViewModel({
  item,
  grupo,
  rangeDraws,
  analysisHourBucket,
  schedule,
  publicBase = "",
  milharesCache,
}) {
  const g = Number(grupo ?? item?.grupo);

  if (!isValidGrupo(g)) {
    return null;
  }

  const animal = safeStr(getAnimalLabel(g) || "");
  const nextY = safeStr(item?.meta?.next?.ymd || "");
  const nextH = toHourBucket(item?.meta?.next?.hour || "");
  const safeAnalysisHour = toHourBucket(analysisHourBucket || "");

  const cacheKey = `${g}|${nextY}|${nextH}|${safeAnalysisHour}`;

  let out = milharesCache?.get?.(cacheKey);

  if (!out) {
    out = buildMilharesForGrupo({
      rangeDraws,
      analysisHourBucket: safeAnalysisHour,
      schedule,
      grupo2: g,
      count: 20,
      targetYmd: nextY,
    });

    milharesCache?.set?.(cacheKey, out);
  }

  const milharesCols = buildTop3MilharesCols(out, 4, 5);
  const milhares20 = milharesCols.flatMap((c) => c.items).slice(0, 20);

  const prob = resolveTop3ProbValue(item);

  const bgPrimary = normalizeTop3ImgSrc(
    safeStr(getImgFromGrupo?.(g, 512) || getImgFromGrupo?.(g) || ""),
    publicBase
  );

  return {
    ...(item || {}),
    animal,
    imgBg: bgPrimary ? [bgPrimary] : [],
    imgIcon: buildTop3ImgVariants(g, publicBase, 96),
    prob,
    probPct: prob * 100,
    meta: item?.meta || null,
    milharesCols,
    milhares20,
  };
}