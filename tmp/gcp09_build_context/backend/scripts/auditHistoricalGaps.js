"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

const START = "2022-06-07";
const TARGET_LOTTERY = "PT_RIO";

function todayYMDInSaoPaulo() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const y = parts.find((p) => p.type === "year")?.value || "1970";
    const m = parts.find((p) => p.type === "month")?.value || "01";
    const d = parts.find((p) => p.type === "day")?.value || "01";

    return `${y}-${m}-${d}`;
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
}

const END = todayYMDInSaoPaulo();

function pad2(n) {
  return String(n).padStart(2, "0");
}

function nextDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isISODate(s) {
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

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeHourList(arr) {
  const out = [];
  const seen = new Set();

  for (const v of Array.isArray(arr) ? arr : []) {
    const m = String(v ?? "").match(/\d{1,2}/);
    if (!m) continue;

    const hh = pad2(Number(m[0]));
    const n = Number(hh);
    if (!Number.isFinite(n) || n < 0 || n > 23) continue;

    if (!seen.has(hh)) {
      seen.add(hh);
      out.push(hh);
    }
  }

  return out.sort();
}

function uniqSorted(arr) {
  return Array.from(new Set(Array.isArray(arr) ? arr : [])).sort();
}

function pickRangeForDate(ranges, ymd) {
  for (const r of Array.isArray(ranges) ? ranges : []) {
    const from0 = String(r?.from || "").trim();
    const to0 = String(r?.to || "").trim();

    const hasFrom = isISODate(from0);
    const hasTo = isISODate(to0);

    if (!hasFrom && !hasTo) return r;
    if (!hasFrom && hasTo && ymd <= to0) return r;
    if (hasFrom && !hasTo && ymd >= from0) return r;
    if (hasFrom && hasTo && ymd >= from0 && ymd <= to0) return r;
  }

  return null;
}

function readSlotSchedule() {
  const p = path.join(__dirname, "..", "data", "slot_schedule", `${TARGET_LOTTERY}.json`);
  return safeReadJson(p, null);
}

function readSourceGaps() {
  const p = path.join(__dirname, "..", "data", "source_gaps", `${TARGET_LOTTERY}.json`);
  return safeReadJson(p, { gapsByDay: {} });
}

function readNoDrawDays() {
  const p = path.join(__dirname, "..", "data", "no_draw_days", `${TARGET_LOTTERY}.json`);
  return safeReadJson(p, { days: [] });
}

function getExpectedForDate(ymd, slotSchedule) {
  const ranges = Array.isArray(slotSchedule) ? slotSchedule : slotSchedule?.ranges;
  const r = pickRangeForDate(ranges, ymd);

  if (!r || !r.dow || typeof r.dow !== "object") {
    return { hard: [], soft: [], source: "none" };
  }

  const d = new Date(`${ymd}T12:00:00-03:00`);
  const dow = String(d.getDay());
  const block = r.dow[dow] || r.dow[Number(dow)] || null;

  if (!block) {
    return { hard: [], soft: [], source: "none" };
  }

  return {
    hard: normalizeHourList(block.hard || []),
    soft: normalizeHourList(block.soft || []),
    source: "slot_schedule",
  };
}

function getGapsForDate(ymd, sourceGaps) {
  const entry = sourceGaps?.gapsByDay?.[ymd] ?? sourceGaps?.[ymd] ?? null;
  if (!entry) return { removedHard: [], removedSoft: [] };

  return {
    removedHard: normalizeHourList(entry.removedHard || entry.hard || []),
    removedSoft: normalizeHourList(entry.removedSoft || entry.soft || []),
  };
}

function isNoDrawDay(ymd, noDrawDays) {
  const set = new Set(Array.isArray(noDrawDays?.days) ? noDrawDays.days : []);
  return set.has(ymd);
}

function normalizeSlot(close) {
  if (!close) return null;

  const m = String(close).match(/(\d{1,2})/);
  if (!m) return null;

  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;

  return pad2(hh);
}

function isTargetLottery(draw) {
  const lk1 = String(draw?.lottery_key || "").trim().toUpperCase();
  const lk2 = String(draw?.lotteryKey || "").trim().toUpperCase();
  return lk1 === TARGET_LOTTERY || lk2 === TARGET_LOTTERY;
}

async function fetchDay(db, ymd) {
  const [s1, s2] = await Promise.all([
    db.collection("draws").where("date", "==", ymd).get(),
    db.collection("draws").where("ymd", "==", ymd).get(),
  ]);

  const map = new Map();
  for (const d of s1.docs) map.set(d.id, d);
  for (const d of s2.docs) map.set(d.id, d);

  return Array.from(map.values());
}

async function run() {
  const db = getDb();
  const slotSchedule = readSlotSchedule();
  const sourceGaps = readSourceGaps();
  const noDrawDays = readNoDrawDays();

  let date = START;

  const report = {
    days: 0,
    daysWithError: [],
    blockedNoDraw: [],
    missingHard: [],
    missingSoft: [],
    duplicates: [],
    unexpected: [],
    noDocsButExpected: [],
  };

  while (date <= END) {
    report.days++;

    if (report.days % 25 === 0 || date === START || date === END) {
      console.log(`Scanning: ${date} | dias=${report.days}`);
    }

    try {
      if (isNoDrawDay(date, noDrawDays)) {
        report.blockedNoDraw.push({ date, reason: "no_draw_days" });
        date = nextDay(date);
        continue;
      }

      const expectedBase = getExpectedForDate(date, slotSchedule);
      const gaps = getGapsForDate(date, sourceGaps);

      const expectedHard = expectedBase.hard.filter((h) => !gaps.removedHard.includes(h));
      const expectedSoft = expectedBase.soft.filter((h) => !gaps.removedSoft.includes(h));
      const expectedAll = uniqSorted([...expectedHard, ...expectedSoft]);

      const docs = await fetchDay(db, date);

      const draws = docs
        .map((d) => d.data())
        .filter((d) => isTargetLottery(d));

      const present = [];

      for (const d of draws) {
        const slot = normalizeSlot(
          d.close_hour ||
            d.close ||
            d.close_hour_raw ||
            d.hour ||
            d.horario
        );

        if (slot) present.push(slot);
      }

      const presentSet = new Set(present);

      if (!draws.length && expectedAll.length) {
        report.noDocsButExpected.push({
          date,
          expectedHard,
          expectedSoft,
        });
      }

      for (const h of expectedHard) {
        if (!presentSet.has(h)) {
          report.missingHard.push({ date, h });
        }
      }

      for (const h of expectedSoft) {
        if (!presentSet.has(h)) {
          report.missingSoft.push({ date, h });
        }
      }

      const seen = new Set();

      for (const h of present) {
        if (seen.has(h)) {
          report.duplicates.push({ date, h });
        }
        seen.add(h);

        if (!expectedAll.includes(h)) {
          report.unexpected.push({ date, h });
        }
      }
    } catch (e) {
      report.daysWithError.push({
        date,
        error: String(e?.message || e),
      });
    }

    date = nextDay(date);
  }

  console.log("\n===== AUDITORIA HISTÓRICA REAL =====\n");
  console.log("Loteria:", TARGET_LOTTERY);
  console.log("Período:", `${START} até ${END}`);
  console.log("Dias analisados:", report.days);

  console.log("\nDias bloqueados (no_draw_days):", report.blockedNoDraw.length);
  console.log("Dias com erro:", report.daysWithError.length);
  console.log("Dias sem docs mas com horários esperados:", report.noDocsButExpected.length);

  console.log("\nMissing HARD:", report.missingHard.length);
  console.log("Missing SOFT:", report.missingSoft.length);
  console.log("Duplicados:", report.duplicates.length);
  console.log("Unexpected:", report.unexpected.length);

  console.log("\n--- DIAS BLOQUEADOS ---");
  console.table(report.blockedNoDraw.slice(0, 50));

  console.log("\n--- HARD ---");
  console.table(report.missingHard.slice(0, 50));

  console.log("\n--- SOFT ---");
  console.table(report.missingSoft.slice(0, 50));

  console.log("\n--- DIAS SEM DOCS MAS COM EXPECTATIVA ---");
  console.table(report.noDocsButExpected.slice(0, 50));

  console.log("\n--- DUPLICADOS ---");
  console.table(report.duplicates.slice(0, 50));

  console.log("\n--- UNEXPECTED ---");
  console.table(report.unexpected.slice(0, 50));

  console.log("\n--- DIAS COM ERRO ---");
  console.table(report.daysWithError.slice(0, 50));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});