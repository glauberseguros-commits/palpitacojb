"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

// =====================
// Utils
// =====================
const LOG_DIR = path.join(__dirname, "..", "logs");
const DEFAULT_SCHEDULE_DIR = path.join(__dirname, "..", "data", "slot_schedule");

// ✅ NOVO: gaps de fonte (API_NO_SLOT)
const DEFAULT_GAPS_DIR = path.join(__dirname, "..", "data", "source_gaps");



// ✅ NOVO: no-draw days (holiday_no_draw/blocked)
const DEFAULT_NO_DRAW_DIR = path.join(__dirname, "..", "data", "no_draw_days");
function ensureDir(p) {
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function ensureLogDir() {
  ensureDir(LOG_DIR);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODate(s) {
  const str = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function ymdToDowSP(ymd) {
  // meio-dia para evitar edge de DST
  const d = new Date(`${ymd}T12:00:00-03:00`);
  return d.getDay();
}

function addDaysISO(ymd, days) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * ✅ Hora robusta:
 * aceita "11:09", "11:09:00", "11h", "11hs", "11", "09-09", "09hs", etc.
 * retorna "HH" (2 dígitos) ou null
 */
function hourFromCloseHour(closeHour) {
  const s0 = String(closeHour ?? "").trim();
  if (!s0) return null;

  const m = s0.match(/(\d{1,2})/);
  if (!m) return null;

  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;

  return pad2(hh);
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => String(x).startsWith(prefix));
  if (!a) return null;
  return String(a).slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function safeReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw || "{}");
    return j && typeof j === "object" ? j : fallback;
  } catch {
    return fallback;
  }
}

function printUsage() {
  console.log(
    `
Uso:
  node backend/scripts/auditDrawSlotsRange.js PT_RIO 2022-06-07 2026-01-21 [--details] [--limit=50]
    [--soft18WedSat] [--include09From=YYYY-MM-DD] [--scheduleFile=PATH] [--strictSchedule]
    [--gapsFile=PATH]

        [--today=YYYY-MM-DD]
    [--slotGraceMin=MIN]
    [--noCapToday]
[--noDrawFile=PATH]
Opções:
  --details                 informa que os detalhes completos estão no JSON
  --limit=N                 limita o print no console (padrão 50)
  --soft18WedSat            trata 18h de quarta/sábado como "soft missing" (fallback hardcoded)
  --include09From=YYYY-MM-DD
                            (fallback hardcoded) considera 09 como existente no calendário a partir desta data
                            default: 2024-01-05
  --scheduleFile=PATH
                            usa agenda de slots por período (se existir). default:
                            backend/data/slot_schedule/<LOTTERY>.json
  --strictSchedule
                            se agenda existir e não bater (sem range para a data), ERRA (ao invés de cair no fallback)
  --gapsFile=PATH
                            arquivo de gaps da fonte (API_NO_SLOT). default:
                            backend/data/source_gaps/<LOTTERY>.json


  
  --today=YYYY-MM-DD
                             força qual "dia atual" considerar (debug/replay). default: hoje (local)
  --slotGraceMin=MIN
                             tolerância (minutos) após a hora do slot para considerar "já publicado". default: 25
  --noCapToday
                             desativa o cap do dia atual (volta a esperar todos os slots do schedule)
--noDrawFile=PATH
                            arquivo de dias sem sorteio (holiday_no_draw/blocked). default:
                            backend/data/no_draw_days/<LOTTERY>.json
Saída:
  backend/logs/auditSlots-PT_RIO-<start>_to_<end>.json
`.trim()
  );
}

// =====================
// Fallback hardcoded (compat) — PT_RIO
// =====================
function shouldInclude09ForDate(ymd, include09FromYmd) {
  if (include09FromYmd && isISODate(include09FromYmd)) {
    return ymd >= include09FromYmd;
  }
  return false;
}

/**
 * Retorna:
 *  - expectedHard: horas que DEVEM existir (buraco real se faltar)
 *  - expectedSoft: horas opcionais/variáveis
 */
function expectedHoursPT_RIO_FALLBACK(ymd, dow, include09FromYmd, soft18WedSat) {
  const has09 = shouldInclude09ForDate(ymd, include09FromYmd);

  const hardWeek = ["11", "14", "16", "18", "21"];
  const hardSun = ["11", "14", "16"];

  const expectedHard = [];
  const expectedSoft = [];

  if (dow === 0) {
    expectedHard.push(...hardSun);
    if (has09) expectedSoft.push("09"); // domingo 09 variável
    return { expectedHard, expectedSoft, mode: "fallback" };
  }

  if (has09) expectedHard.push("09");
  expectedHard.push(...hardWeek);

  if (soft18WedSat && (dow === 3 || dow === 6)) {
    const idx = expectedHard.indexOf("18");
    if (idx >= 0) expectedHard.splice(idx, 1);
    expectedSoft.push("18");
  }

  return { expectedHard, expectedSoft, mode: "fallback" };
}

// =====================
// Schedule (slot_schedule) — fonte da verdade quando existe
// =====================
function normalizeHourList(arr) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const m = String(v ?? "").match(/\d{1,2}/);
    if (!m) continue;
    const hh = pad2(Number(m[0]));
    if (hh === "NaN") continue;
    const n = Number(hh);
    if (!Number.isFinite(n) || n < 0 || n > 23) continue;
    if (!seen.has(hh)) {
      seen.add(hh);
      out.push(hh);
    }
  }
  return out;
}

function loadScheduleOrNull(lotteryKey, scheduleFileArg) {
  const scheduleFile =
    String(scheduleFileArg || "").trim() ||
    path.join(DEFAULT_SCHEDULE_DIR, `${lotteryKey}.json`);

  if (!fs.existsSync(scheduleFile)) return { schedule: null, scheduleFile };

  const schedule = safeReadJson(scheduleFile, null);
  if (!schedule || typeof schedule !== "object") return { schedule: null, scheduleFile };

  const lk = String(schedule.lotteryKey || "").trim().toUpperCase();
  if (lk && lk !== lotteryKey) {
    return { schedule: null, scheduleFile };
  }

  const ranges = Array.isArray(schedule.ranges) ? schedule.ranges : [];
  schedule.lotteryKey = lotteryKey;
  schedule.ranges = ranges
    .filter((r) => r && typeof r === "object" && isISODate(r.from))
    .map((r) => ({
      from: String(r.from).trim(),
      to: r.to == null || r.to === "" ? null : String(r.to).trim(),
      dow: r.dow && typeof r.dow === "object" ? r.dow : {},
    }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  return { schedule, scheduleFile };
}

function pickRangeForDate(schedule, ymd) {
  if (!schedule || !Array.isArray(schedule.ranges)) return null;
  let picked = null;
  for (const r of schedule.ranges) {
    if (!r || !r.from) continue;
    if (r.from <= ymd && (r.to == null || ymd <= r.to)) {
      picked = r;
    }
  }
  return picked;
}

function expectedHoursFromSchedule(schedule, ymd, dow) {
  const r = pickRangeForDate(schedule, ymd);
  if (!r) return null;

  const dd = String(dow);
  const rule = r.dow?.[dd] || r.dow?.[Number(dd)] || null;

  if (!rule || typeof rule !== "object") {
    return {
      expectedHard: [],
      expectedSoft: [],
      mode: "schedule",
      range: { from: r.from, to: r.to },
    };
  }

  const expectedHard = normalizeHourList(rule.hard);
  const expectedSoft = normalizeHourList(rule.soft);

  return {
    expectedHard,
    expectedSoft,
    mode: "schedule",
    range: { from: r.from, to: r.to },
  };
}

// =====================
// ✅ GAPS (API_NO_SLOT)
// =====================
function loadGapsOrNull(lotteryKey, gapsFileArg) {
  const gapsFile =
    String(gapsFileArg || "").trim() ||
    path.join(DEFAULT_GAPS_DIR, `${lotteryKey}.json`);

  if (!fs.existsSync(gapsFile)) return { gaps: null, gapsFile };

  const gaps = safeReadJson(gapsFile, null);
  if (!gaps || typeof gaps !== "object") return { gaps: null, gapsFile };

  const lk = String(gaps.lotteryKey || "").trim().toUpperCase();
  if (lk && lk !== lotteryKey) return { gaps: null, gapsFile };

  const gapsByDay =
    gaps.gapsByDay && typeof gaps.gapsByDay === "object" ? gaps.gapsByDay : {};

  gaps.lotteryKey = lotteryKey;
  gaps.gapsByDay = gapsByDay;

  return { gaps, gapsFile };
}

function gapSetForDate(gaps, ymd) {
  if (!gaps || !gaps.gapsByDay) return null;
  const arr = gaps.gapsByDay?.[ymd];
  if (!Array.isArray(arr) || !arr.length) return null;

  const set = new Set();
  for (const h of arr) {
    const m = String(h ?? "").match(/\d{1,2}/);
    if (!m) continue;
    const hh = pad2(Number(m[0]));
    if (/^\d{2}$/.test(hh)) set.add(hh);
  }
  return set.size ? set : null;
}

function removeGaps(expectedHard, expectedSoft, gapSet) {
  if (!gapSet) return { expectedHard, expectedSoft, removedHard: 0, removedSoft: 0 };

  const hard2 = [];
  let removedHard = 0;
  for (const hh of expectedHard) {
    if (gapSet.has(hh)) removedHard += 1;
    else hard2.push(hh);
  }

  const soft2 = [];
  let removedSoft = 0;
  for (const hh of expectedSoft) {
    if (gapSet.has(hh)) removedSoft += 1;
    else soft2.push(hh);
  }

  return { expectedHard: hard2, expectedSoft: soft2, removedHard, removedSoft };
}

// =====================
// ✅ NO_DRAW (holiday_no_draw / blocked)
// =====================
function loadNoDrawOrNull(lotteryKey, noDrawFileArg) {
  const noDrawFile =
    String(noDrawFileArg || "").trim() ||
    path.join(DEFAULT_NO_DRAW_DIR, `${lotteryKey}.json`);

  if (!fs.existsSync(noDrawFile)) return { noDraw: null, noDrawFile };

  const noDraw = safeReadJson(noDrawFile, null);
  if (!noDraw || typeof noDraw !== "object") return { noDraw: null, noDrawFile };

  const lk = String(noDraw.lotteryKey || "").trim().toUpperCase();
  if (lk && lk !== lotteryKey) return { noDraw: null, noDrawFile };

  const daysArr = Array.isArray(noDraw.days) ? noDraw.days : [];
  const set = new Set();
  for (const d of daysArr) {
    const ymd = String(d || "").trim();
    if (isISODate(ymd)) set.add(ymd);
  }

  noDraw.lotteryKey = lotteryKey;
  noDraw.days = Array.from(set).sort();

  return { noDraw: { daysSet: set, days: noDraw.days }, noDrawFile };
}

function noDrawSetHas(noDraw, ymd) {
  if (!noDraw || !noDraw.daysSet) return false;
  return noDraw.daysSet.has(ymd);
}

// =====================
 // Time helpers (local)
 // =====================
 function pad2(n) { return String(n).padStart(2, "0"); }
 function getLocalYmd(d) {
   const x = d ? new Date(d) : new Date();
   return `${x.getFullYear()}-${pad2(x.getMonth()+1)}-${pad2(x.getDate())}`;
 }
 function getLocalNowMinutes(d) {
   const x = d ? new Date(d) : new Date();
   return (x.getHours() * 60) + x.getMinutes();
 }
 function hourToMinutes(h) {
   const n = Number(h);
   return Number.isFinite(n) ? (n * 60) : NaN;
 }

// =====================
// Main
// =====================
async function main() {
  const lotteryKey = String(process.argv[2] || "PT_RIO").trim().toUpperCase() || "PT_RIO";
  const startYmd = String(process.argv[3] || "2022-06-07").trim();
  const endYmd = String(process.argv[4] || "2026-01-21").trim();

  if (hasFlag("help") || hasFlag("h")) {
    printUsage();
    return;
  }

  if (!isISODate(startYmd) || !isISODate(endYmd) || startYmd > endYmd) {
    throw new Error(
      `Intervalo inválido. Use: YYYY-MM-DD YYYY-MM-DD. Recebido: ${startYmd}..${endYmd}`
    );
  }

  const details = hasFlag("details");
  const limitPrint = Math.max(1, Number(parseArg("limit") || 50));
  const soft18WedSat = hasFlag("soft18WedSat");
  const include09FromYmd = String(parseArg("include09From") || "2024-01-05").trim();

  const scheduleFileArg = parseArg("scheduleFile");
  const strictSchedule = hasFlag("strictSchedule");

  
  
  // ✅ cap do DIA ATUAL até o último horário que já deveria estar publicado
  const todayYmd = String(parseArg("today") || "").trim() || getLocalYmd();
  const slotGraceMin = Number(parseArg("slotGraceMin") || 25);
  const capToday = !hasFlag("noCapToday");
  const nowMinLocal = getLocalNowMinutes();
const noDrawFileArg = parseArg("noDrawFile");
const gapsFileArg = parseArg("gapsFile");

  ensureLogDir();
  const db = getDb();

  const { schedule, scheduleFile } = loadScheduleOrNull(lotteryKey, scheduleFileArg);
  const scheduleOn = !!schedule;

  const { gaps, gapsFile } = loadGapsOrNull(lotteryKey, gapsFileArg);
  const gapsOn = !!gaps;

  

  const { noDraw, noDrawFile } = loadNoDrawOrNull(lotteryKey, noDrawFileArg);
  const noDrawOn = !!noDraw;
console.log("==================================");
  console.log(`[AUDIT-SLOTS] lottery_key=${lotteryKey}`);
  console.log(`range: ${startYmd} -> ${endYmd}`);
  console.log(
    `schedule: ${scheduleOn ? "ON" : "OFF"} file=${scheduleFile} strict=${strictSchedule ? "YES" : "NO"}`
  );
  console.log(`gaps: ${gapsOn ? "ON" : "OFF"} file=${gapsFile}`);
  
  console.log(`noDraw: ${noDrawOn ? "ON" : "OFF"} file=${noDrawFile}`);
console.log(
    `fallbackFlags: soft18WedSat=${soft18WedSat ? "YES" : "NO"} include09From=${include09FromYmd}`
  );
  console.log("==================================");

  let scannedDocs = 0;
  let totalDays = 0;

  let expectedHardSlotsTotal = 0;
  let expectedSoftSlotsTotal = 0;

  let foundHardSlotsTotal = 0;
  let foundSoftSlotsTotal = 0;

  let missingHardSlotsTotal = 0;
  let missingSoftSlotsTotal = 0;

  let duplicateExtraDocsExpected = 0;

  let unexpectedHoursTotal = 0;
  let unexpectedDocsTotal = 0;
  let daysWithUnexpected = 0;

  // ✅ gaps stats
  let daysWithGapsApplied = 0;
  let gapsRemovedHardTotal = 0;
  let gapsRemovedSoftTotal = 0;

  

  // ✅ no-draw stats
  let noDrawDaysCount = 0;
const missingHardByDay = [];
  const missingSoftByDay = [];
  const dupByDay = [];
  const unexpectedByDay = [];

  const scheduleMissByDay = [];
  const scheduleRangeByDay = [];

  const progressEvery = 30;

  for (let ymd = startYmd; ymd <= endYmd; ymd = addDaysISO(ymd, 1)) {
    totalDays += 1;
    const dow = ymdToDowSP(ymd);

    // 1) schedule (se existir)
    let expected = null;

    if (scheduleOn) {
      expected = expectedHoursFromSchedule(schedule, ymd, dow);

      if (!expected) {
        if (strictSchedule) {
          scheduleMissByDay.push({ ymd, dow });
          continue;
        }
        expected = expectedHoursPT_RIO_FALLBACK(ymd, dow, include09FromYmd, soft18WedSat);
      } else {
        scheduleRangeByDay.push({ ymd, dow, range: expected.range });
      }
    } else {
      expected = expectedHoursPT_RIO_FALLBACK(ymd, dow, include09FromYmd, soft18WedSat);
    }

    // IMPORTANT: let, porque vamos aplicar gaps
    let expectedHard = expected.expectedHard || [];
    let expectedSoft = expected.expectedSoft || [];

    // ✅ aplica gaps da fonte (API_NO_SLOT): remove horas "esperadas" daquele dia
    const gset = gapsOn ? gapSetForDate(gaps, ymd) : null;
    if (gset) {
      const r = removeGaps(expectedHard, expectedSoft, gset);
      expectedHard = r.expectedHard;
      expectedSoft = r.expectedSoft;

      if (r.removedHard || r.removedSoft) {
        daysWithGapsApplied += 1;
        gapsRemovedHardTotal += r.removedHard;
        gapsRemovedSoftTotal += r.removedSoft;
      }
    }


    // ✅ aplica no-draw (holiday_no_draw/blocked): não espera slots
    if (noDrawOn && noDrawSetHas(noDraw, ymd)) {
      if (expectedHard.length || expectedSoft.length) noDrawDaysCount += 1;
      expectedHard = [];
      expectedSoft = [];
    }


    // ✅ cap do DIA ATUAL: só espera slots cujo horário já deveria ter saído (agora + grace)
    if (capToday && ymd === todayYmd) {
      const grace = Number.isFinite(slotGraceMin) ? slotGraceMin : 25;
      const allow = (h) => {
        const hm = hourToMinutes(h);
        if (!Number.isFinite(hm)) return false;
        return nowMinLocal >= (hm + grace);
      };
      expectedHard = Array.isArray(expectedHard) ? expectedHard.filter(allow) : [];
      expectedSoft = Array.isArray(expectedSoft) ? expectedSoft.filter(allow) : [];
    }

    expectedHardSlotsTotal += expectedHard.length;
    expectedSoftSlotsTotal += expectedSoft.length;

    const expectedAllSet = new Set([...expectedHard, ...expectedSoft]);

    // Firestore: filtra por ymd + lottery_key
    const snap = await db
      .collection("draws")
      .where("ymd", "==", ymd)
      .where("lottery_key", "==", lotteryKey)
      .get();

    const dayMap = new Map(); // hh -> countDocs

    for (const doc of snap.docs) {
      scannedDocs += 1;
      const d = doc.data() || {};

      const hh = hourFromCloseHour(
        d.close_hour ??
          d.closeHour ??
          d.close_hour_raw ??
          d.close_hourRaw ??
          d.hour ??
          d.hora
      );

      if (!hh) continue;
      dayMap.set(hh, (dayMap.get(hh) || 0) + 1);
    }

    const missingHard = [];
    const missingSoft = [];
    const dup = [];

    for (const hh of expectedHard) {
      const c = dayMap.get(hh) || 0;
      if (c > 0) foundHardSlotsTotal += 1;
      if (c <= 0) {
        missingHard.push(hh);
        missingHardSlotsTotal += 1;
      }
      if (c > 1) {
        dup.push({ hh, count: c });
        duplicateExtraDocsExpected += c - 1;
      }
    }

    for (const hh of expectedSoft) {
      const c = dayMap.get(hh) || 0;
      if (c > 0) foundSoftSlotsTotal += 1;
      if (c <= 0) {
        missingSoft.push(hh);
        missingSoftSlotsTotal += 1;
      }
      if (c > 1) {
        dup.push({ hh, count: c });
        duplicateExtraDocsExpected += c - 1;
      }
    }

    const unexpected = [];
    for (const [hh, c] of dayMap.entries()) {
      if (!expectedAllSet.has(hh)) {
        unexpected.push({ hh, count: c });
        unexpectedHoursTotal += 1;
        unexpectedDocsTotal += c;
      }
    }
    if (unexpected.length) daysWithUnexpected += 1;

    if (missingHard.length) missingHardByDay.push({ ymd, dow, missing: missingHard });
    if (missingSoft.length) missingSoftByDay.push({ ymd, dow, missing: missingSoft });
    if (dup.length) dupByDay.push({ ymd, dow, dup });
    if (unexpected.length) unexpectedByDay.push({ ymd, dow, unexpected });

    if (totalDays % progressEvery === 0) {
      console.log(`[PROGRESS] days=${totalDays} scannedDocs=${scannedDocs}`);
    }
  }

  const report = {
    lotteryKey,
    startYmd,
    endYmd,
    scannedDocs,
    totalDays,

    schedule: {
      enabled: scheduleOn,
      scheduleFile,
      strictSchedule,
      missingDaysNoRange: scheduleMissByDay.length,
    },

    gaps: {
      enabled: gapsOn,
      gapsFile,
      daysWithGapsApplied,
      removedHardSlots: gapsRemovedHardTotal,
      removedSoftSlots: gapsRemovedSoftTotal,
    },

    fallbackFlags: { soft18WedSat, include09FromYmd },

    expectedHardSlotsTotal,
    expectedSoftSlotsTotal,
    foundHardSlotsTotal,
    foundSoftSlotsTotal,
    missingHardSlotsTotal,
    missingSoftSlotsTotal,

    duplicateExtraDocsExpected,

    unexpectedHoursTotal,
    unexpectedDocsTotal,
    daysWithUnexpected,

    daysWithMissingHard: missingHardByDay.length,
    daysWithMissingSoft: missingSoftByDay.length,
    daysWithDuplicates: dupByDay.length,

    scheduleMissByDay,
    scheduleRangeByDay: details ? scheduleRangeByDay : undefined,

    missingHardByDay,
    missingSoftByDay,
    dupByDay,
    unexpectedByDay,

    generatedAt: new Date().toISOString(),
  };

  const outFile = path.join(LOG_DIR, `auditSlots-${lotteryKey}-${startYmd}_to_${endYmd}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log("==================================");
  console.log(`[RESULT] scannedDocs=${scannedDocs}`);
  console.log(
    `[RESULT] days=${totalDays} expectedHard=${expectedHardSlotsTotal} expectedSoft=${expectedSoftSlotsTotal}`
  );
  console.log(`[RESULT] foundHard=${foundHardSlotsTotal} foundSoft=${foundSoftSlotsTotal}`);
  console.log(
    `[RESULT] missingHardSlots=${missingHardSlotsTotal} daysWithMissingHard=${missingHardByDay.length}`
  );
  console.log(
    `[RESULT] missingSoftSlots=${missingSoftSlotsTotal} daysWithMissingSoft=${missingSoftByDay.length}`
  );
  console.log(
    `[RESULT] duplicateExtraDocs(expected)=${duplicateExtraDocsExpected} daysWithDup=${dupByDay.length}`
  );
  console.log(
    `[RESULT] unexpectedSlots(hours)=${unexpectedHoursTotal} unexpectedDocs=${unexpectedDocsTotal} daysWithUnexpected=${daysWithUnexpected}`
  );

  if (scheduleOn) {
    console.log(
      `[SCHEDULE] strict=${strictSchedule ? "YES" : "NO"} missingNoRangeDays=${scheduleMissByDay.length}`
    );
  }
  if (gapsOn) {
    console.log(
      `[GAPS] daysWithGapsApplied=${daysWithGapsApplied} removedHard=${gapsRemovedHardTotal} removedSoft=${gapsRemovedSoftTotal}`
    );
  }

  
  if (noDrawOn) {
    console.log(`[NO-DRAW] daysIgnored=${noDrawDaysCount} listed=${noDraw.days.length}`);
  }console.log(`[OUTPUT] ${outFile}`);
  console.log("==================================");

  if (scheduleMissByDay.length) {
    console.log(
      `\n[SCHEDULE-MISS] primeiros ${Math.min(limitPrint, scheduleMissByDay.length)} dias sem range:`
    );
    for (const r of scheduleMissByDay.slice(0, limitPrint)) {
      console.log(`- ${r.ymd} dow=${r.dow}`);
    }
  }

  if (missingHardByDay.length) {
    console.log(
      `\n[MISSING-HARD] primeiros ${Math.min(limitPrint, missingHardByDay.length)} dias:`
    );
    for (const r of missingHardByDay.slice(0, limitPrint)) {
      console.log(`- ${r.ymd} missingHard: ${r.missing.join(", ")}`);
    }
  } else {
    console.log("\n[MISSING-HARD] nenhum buraco duro detectado no intervalo.");
  }

  if (missingSoftByDay.length) {
    console.log(
      `\n[MISSING-SOFT] primeiros ${Math.min(limitPrint, missingSoftByDay.length)} dias:`
    );
    for (const r of missingSoftByDay.slice(0, limitPrint)) {
      console.log(`- ${r.ymd} missingSoft: ${r.missing.join(", ")}`);
    }
  } else {
    console.log("\n[MISSING-SOFT] nenhum buraco soft detectado no intervalo.");
  }

  if (dupByDay.length) {
    console.log(`\n[DUP] primeiros ${Math.min(limitPrint, dupByDay.length)} dias:`);
    for (const r of dupByDay.slice(0, limitPrint)) {
      const s = r.dup.map((x) => `${x.hh}(${x.count})`).join(", ");
      console.log(`- ${r.ymd} dup: ${s}`);
    }
  } else {
    console.log("\n[DUP] nenhuma duplicidade detectada no intervalo.");
  }

  if (unexpectedByDay.length) {
    console.log(
      `\n[UNEXPECTED] primeiros ${Math.min(limitPrint, unexpectedByDay.length)} dias:`
    );
    for (const r of unexpectedByDay.slice(0, limitPrint)) {
      const s = r.unexpected.map((x) => `${x.hh}(${x.count})`).join(", ");
      console.log(`- ${r.ymd} unexpected: ${s}`);
    }
  } else {
    console.log("\n[UNEXPECTED] nenhum slot inesperado detectado no intervalo.");
  }

  if (details) console.log("\n[DETAILS] detalhes completos estão no JSON.");
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});



