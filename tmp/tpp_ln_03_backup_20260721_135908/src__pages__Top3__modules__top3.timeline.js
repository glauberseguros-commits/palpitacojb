import { safeStr, isYMD, toHourBucket } from "../top3.formatters";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "../top3.constants";

import {
  getScheduleForLottery,
  buildMilharesForGrupo,
  buildTimelineTop3,
  auditTop3Timeline,
} from "../top3.engine";

import { getAnimalLabel, getImgFromGrupo } from "../../../constants/bichoMap";

function clampProb(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function resolveProbValue(x) {
  return clampProb(x?.scoreProb ?? x?.prob ?? x?.probCond ?? 0);
}

function normalizeMilhar4(v) {
  const dig = String(v || "").replace(/\D+/g, "");
  if (!dig) return "";
  return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
}

function build4ColsFromEngineOut(out, expectedCols = 4, perCol = 5) {
  const dezenas = Array.isArray(out?.dezenas) ? out.dezenas : [];
  const slots = Array.isArray(out?.slots) ? out.slots : [];
  const cols = [];

  for (const dz of dezenas.slice(0, expectedCols)) {
    const items = slots
      .filter((s) => String(s?.dezena || "") === String(dz))
      .map((s) => normalizeMilhar4(s?.milhar))
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

function normalizeImgSrc(src, publicBase = "") {
  const s = String(src || "").trim();
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s)) return s;
  if (/^(data:|blob:)/i.test(s)) return s;

  const base = String(publicBase || "").trim().replace(/\/+$/, "");

  if (s.startsWith("/")) return `${base}${s}`;
  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;
  return `${base}/${s}`;
}

function buildResultStyleImgVariants(grupo, publicBase = "", size = 96) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const seeds = [getImgFromGrupo?.(g, size), getImgFromGrupo?.(g)]
    .map((x) => normalizeImgSrc(x, publicBase))
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

function top3ItemMatchesSlot(item, slot) {
  const targetY = safeStr(slot?.targetYmd || "");
  const targetH = toHourBucket(slot?.targetHour || "");

  const nextY = safeStr(item?.meta?.next?.ymd || "");
  const nextH = toHourBucket(item?.meta?.next?.hour || "");

  if (!isYMD(targetY) || !targetH) return false;
  if (!isYMD(nextY) || !nextH) return false;

  return nextY === targetY && nextH === targetH;
}

export function buildTop3TimelineViewModel({
  todayDraws,
  rangeDraws,
  lotteryKeySafe,
  ymdSafe,
  analysisYmd,
  publicBase = "",
}) {
  const day = Array.isArray(todayDraws) ? todayDraws : [];
  const range = Array.isArray(rangeDraws) ? rangeDraws : [];

  const safeAnalysisYmd = safeStr(analysisYmd || "");
  const safeYmd = safeStr(ymdSafe || "");
  const timelineYmd = isYMD(safeAnalysisYmd) ? safeAnalysisYmd : safeYmd;

  if (!isYMD(timelineYmd) || !range.length) return [];

  const rawTimeline = buildTimelineTop3({
    ymd: timelineYmd,
    drawsToday: day,
    drawsRange: range,
    lotteryKey: lotteryKeySafe,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const timelineAudit = auditTop3Timeline({
    timeline: rawTimeline,
    lotteryKey: lotteryKeySafe,
  });

  if (typeof window !== "undefined") {
    window.__TOP3_AUDIT__ = timelineAudit;

    console.groupCollapsed("[TOP3 AUDIT]");
    console.table([
      {
        Loteria: timelineAudit.lotteryKey,
        Previsoes: timelineAudit.total,
        "TOP1 %": timelineAudit.top1Rate,
        "TOP3 %": timelineAudit.top3Rate,
      },
    ]);

    console.log("Por horário");
    console.table(timelineAudit.byHour);

    console.log("Por data");
    console.table(timelineAudit.byDate);

    console.groupEnd();
  }


  const milharesCache = new Map();

  return (Array.isArray(rawTimeline) ? rawTimeline : []).map((slot) => {
    const arr = Array.isArray(slot?.top3) ? slot.top3 : [];

    const slotYmd = safeStr(slot?.targetYmd || "");
    const slotHour = toHourBucket(slot?.targetHour || "");

    const mappedTop3 = arr
      .filter((x) => {
        const g = Number(x?.grupo);
        return Number.isFinite(g) && g >= 1 && g <= 25;
      })
      .filter((x) => top3ItemMatchesSlot(x, slot))
      .slice(0, 3)
      .map((x) => {
        const g = Number(x?.grupo);
        const animal = safeStr(getAnimalLabel(g) || "");

        const cacheKey = [g, slotYmd, slotHour].join("|");

        let out = milharesCache.get(cacheKey);

        if (!out) {
          out = buildMilharesForGrupo({
            rangeDraws: range,
            analysisHourBucket: slotHour,
            schedule: getScheduleForLottery({
              lotteryKey: lotteryKeySafe,
              ymd: slotYmd,
              PT_RIO_SCHEDULE_NORMAL,
              PT_RIO_SCHEDULE_WED_SAT,
              FEDERAL_SCHEDULE,
            }),
            grupo2: g,
            count: 20,
            targetYmd: slotYmd,
          });

          milharesCache.set(cacheKey, out);
        }

        const milharesCols = build4ColsFromEngineOut(out, 4, 5);
        const milhares20 = milharesCols.flatMap((c) => c.items).slice(0, 20);

        const prob = resolveProbValue(x);

        const bgPrimary = normalizeImgSrc(
          safeStr(getImgFromGrupo?.(g, 512) || getImgFromGrupo?.(g) || ""),
          publicBase
        );

        return {
          ...x,
          animal,
          imgBg: bgPrimary ? [bgPrimary] : [],
          imgIcon: buildResultStyleImgVariants(g, publicBase, 96),
          prob,
          probPct: prob * 100,
          meta: x?.meta || null,
          milharesCols,
          milhares20,
        };
      });

    return {
      ...slot,
      top3: mappedTop3,
    };
  });
}