const { getDb } = require("../backend/service/firebaseAdmin");

const RJ_LOTTERY_KEY = "PT_RIO";
const FEDERAL_KEYS = ["FEDERAL", "LOTERIA_FEDERAL", "LT_FEDERAL", "FED"];

const RJ_BASE_REQUIRED_HOURS = ["11:00", "14:00", "16:00"];

const RJ_EXCEPTION_DATES = new Set([
  "2022-10-02",
  "2022-11-02",
  "2022-12-24",
  "2022-12-25",
  "2022-12-31",
  "2023-01-01",
  "2023-04-07",
  "2023-11-02",
  "2023-12-25",
  "2024-01-01",
  "2024-03-29",
  "2024-10-06",
  "2024-12-25",
  "2025-01-01",
  "2025-12-25",
  "2026-01-01",
]);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToDateUTC(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function addDaysUTC(ymd, days) {
  const dt = ymdToDateUTC(ymd);
  if (!dt) throw new Error(`YMD inválido em addDaysUTC: ${ymd}`);
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function getWeekdayUTC(ymd) {
  const dt = ymdToDateUTC(ymd);
  if (!dt) throw new Error(`YMD inválido em getWeekdayUTC: ${ymd}`);
  return dt.getUTCDay(); // 0=domingo ... 6=sábado
}

function normalizeHourLike(v) {
  const s = String(v ?? "").trim().replace(/\s+/g, "");
  if (!s) return "";

  const m1 = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (m1) return `${pad2(m1[1])}:00`;

  const m2 = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (m2) return `${pad2(m2[1])}:${pad2(m2[2])}`;

  const m3 = s.match(/^(\d{3,4})$/);
  if (m3) {
    const raw = m3[1];
    const hh = raw.slice(0, -2);
    const mm = raw.slice(-2);
    if (/^\d{1,2}$/.test(hh) && /^\d{2}$/.test(mm)) {
      return `${pad2(hh)}:${mm}`;
    }
  }

  const m4 = s.match(/^(\d{1,2})$/);
  if (m4) return `${pad2(m4[1])}:00`;

  return "";
}

function countEmbeddedPrizes(d) {
  return Array.isArray(d?.prizes) ? d.prizes.length : 0;
}

function summarizeSlot(arr) {
  if (!arr || !arr.length) {
    return { status: "missing", note: "sem draw" };
  }

  if (arr.length > 1) {
    return { status: "duplicate", note: `duplicado (${arr.length})` };
  }

  const c = countEmbeddedPrizes(arr[0]);

  if (c > 0 && c < 7) {
    return { status: "partial", note: `draw parcial (${c} prizes)` };
  }

  return {
    status: "ok",
    note: c ? `${c} prizes` : "draw encontrado",
  };
}

function getHourFromDoc(d) {
  return normalizeHourLike(
    d?.close_hour ??
    d?.closeHour ??
    d?.hour ??
    d?.hora ??
    ""
  );
}

function yesterdayYmdSP() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")?.value || "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value || "1");
  const d = Number(parts.find((p) => p.type === "day")?.value || "1");

  const spMidnightUtc = new Date(Date.UTC(y, m - 1, d));
  spMidnightUtc.setUTCDate(spMidnightUtc.getUTCDate() - 1);

  return [
    spMidnightUtc.getUTCFullYear(),
    pad2(spMidnightUtc.getUTCMonth() + 1),
    pad2(spMidnightUtc.getUTCDate()),
  ].join("-");
}

async function fetchDayDraws(db, ymd) {
  const snap = await db.collection("draws").where("ymd", "==", ymd).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

function groupByHour(draws) {
  const map = new Map();

  for (const d of draws) {
    const hour = getHourFromDoc(d);
    if (!hour) continue;

    if (!map.has(hour)) {
      map.set(hour, []);
    }

    map.get(hour).push(d);
  }

  return map;
}

function getRJExpectedHoursForDate(ymd, firstRJ09Date) {
  if (RJ_EXCEPTION_DATES.has(ymd)) return [];

  const weekday = getWeekdayUTC(ymd);

  // Domingo
  if (weekday === 0) {
    return [...RJ_BASE_REQUIRED_HOURS];
  }

  const hours = [...RJ_BASE_REQUIRED_HOURS];

  // 09h a partir da implantação, exceto domingo
  if (firstRJ09Date && ymd >= firstRJ09Date) {
    hours.unshift("09:00");
  }

  // 18h: SEG, TER, QUI, SEX
  if ([1, 2, 4, 5].includes(weekday)) {
    hours.push("18:00");
  }

  // 21h: SEG a SÁB
  if ([1, 2, 3, 4, 5, 6].includes(weekday)) {
    hours.push("21:00");
  }

  return hours;
}

function getRJKnownHoursUniverse() {
  return ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
}

function getReasonIfRJHourNotExpected(ymd, hour, firstRJ09Date) {
  if (RJ_EXCEPTION_DATES.has(ymd)) {
    return "data excepcional — horário obrigatório não cobrado";
  }

  const weekday = getWeekdayUTC(ymd);

  if (hour === "09:00") {
    if (!firstRJ09Date || ymd < firstRJ09Date) {
      return "09:00 ainda não implantado no período";
    }
    if (weekday === 0) {
      return "domingo — horário não esperado";
    }
  }

  if (hour === "18:00") {
    if (weekday === 0) return "domingo — horário não esperado";
    if (weekday === 3) return "quarta-feira — horário não esperado";
    if (weekday === 6) return "sábado — horário não esperado";
  }

  if (hour === "21:00") {
    if (weekday === 0) return "domingo — horário não esperado";
  }

  return "horário não esperado";
}

function buildDailyReport(all, ymd, firstRJ09Date) {
  const rj = all.filter(
    (d) => String(d?.lottery_key || "").trim().toUpperCase() === RJ_LOTTERY_KEY
  );

  const federal = all.filter(
    (d) => FEDERAL_KEYS.includes(String(d?.lottery_key || "").trim().toUpperCase())
  );

  const rjByHour = groupByHour(rj);
  const federalByHour = groupByHour(federal);

  const federal19 = summarizeSlot(federalByHour.get("19:00"));
  const federal20 = summarizeSlot(federalByHour.get("20:00"));

  const hasFederal19 = federal19.status !== "missing";
  const hasFederal20 = federal20.status !== "missing";
  const federalPresentDay = hasFederal19 || hasFederal20;

  const rows = [];
  const expectedRJHours = getRJExpectedHoursForDate(ymd, firstRJ09Date);

  for (const hour of getRJKnownHoursUniverse()) {
    const s = summarizeSlot(rjByHour.get(hour));
    const expected = expectedRJHours.includes(hour);

    if (expected) {
      rows.push({
        date: ymd,
        scope: "RJ",
        hour,
        status: s.status,
        note: s.note,
        severity:
          s.status === "ok"
            ? "ok"
            : s.status === "partial" || s.status === "duplicate"
              ? "hard_fail"
              : "hard_fail",
      });
    } else {
      rows.push({
        date: ymd,
        scope: "RJ",
        hour,
        status: s.status === "missing" ? "not_expected" : s.status,
        note: s.status === "missing"
          ? getReasonIfRJHourNotExpected(ymd, hour, firstRJ09Date)
          : s.note,
        severity:
          s.status === "ok"
            ? "ok"
            : s.status === "partial" || s.status === "duplicate"
              ? "warn"
              : "info",
      });
    }
  }

  rows.push({
    date: ymd,
    scope: "FEDERAL",
    hour: federalPresentDay
      ? hasFederal20
        ? "20:00"
        : "19:00"
      : "-",
    status: federalPresentDay ? "federal_present_day" : "federal_absent_day",
    note: federalPresentDay
      ? hasFederal20
        ? "Federal presente no dia (20:00)"
        : "Federal presente no dia (19:00)"
      : "sem Federal no dia",
    severity: federalPresentDay ? "ok" : "info",
  });

  return rows;
}

function getStatusIcon(status) {
  if (status === "ok") return "✔";
  if (status === "missing") return "❌";
  if (status === "partial") return "⚠";
  if (status === "duplicate") return "⚠";
  if (status === "not_expected") return "•";
  if (status === "federal_present_day") return "✔";
  if (status === "federal_absent_day") return "•";
  return "?";
}

async function detectFirstRJ09Date(db, startYmd, endYmd) {
  let cursor = startYmd;

  while (cursor <= endYmd) {
    const draws = await fetchDayDraws(db, cursor);

    const hasRJ09 = draws.some((d) => {
      const lotteryKey = String(d?.lottery_key || "").trim().toUpperCase();
      return lotteryKey === RJ_LOTTERY_KEY && getHourFromDoc(d) === "09:00";
    });

    if (hasRJ09) return cursor;
    cursor = addDaysUTC(cursor, 1);
  }

  return null;
}

async function main() {
  const ymd = process.argv[2] || yesterdayYmdSP();
  if (!isYMD(ymd)) {
    throw new Error(`YMD inválido: ${ymd}`);
  }

  const db = getDb();

  console.log("");
  console.log(`Yesterday integrity check — ${ymd}`);
  console.log("");

  const firstRJ09Date = await detectFirstRJ09Date(db, "2022-06-07", ymd);
  const all = await fetchDayDraws(db, ymd);
  const report = buildDailyReport(all, ymd, firstRJ09Date);

  for (const row of report) {
    console.log(
      `${row.scope} ${row.hour} ${getStatusIcon(row.status)} ${row.status.toUpperCase()} — ${row.note}`
    );
  }

  const totals = {
    ok: 0,
    missing: 0,
    partial: 0,
    duplicate: 0,
    not_expected: 0,
    federal_present_day: 0,
    federal_absent_day: 0,
  };

  for (const row of report) {
    totals[row.status] = (totals[row.status] || 0) + 1;
  }

  const hardFails = report.filter(
    (r) => r.status === "missing" || r.status === "partial" || r.status === "duplicate"
  );

  console.log("");
  console.log("Resumo:");
  console.log(totals);
  console.log("");

  if (hardFails.length) {
    console.log("Falhas reais:");
    for (const row of hardFails) {
      console.log(`${row.date}  ${row.scope} ${row.hour}  ${row.note}`);
    }
    console.log("");
    process.exitCode = 2;
    return;
  }

  console.log("Nenhuma falha real nos horários esperados.");
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error("Yesterday integrity check failed:");
  console.error(err);
  console.error("");
  process.exitCode = 1;
});