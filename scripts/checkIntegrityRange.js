const { getDb } = require("../backend/service/firebaseAdmin");

const RJ_LOTTERY_KEY = "PT_RIO";
const FEDERAL_KEYS = ["FEDERAL", "LOTERIA_FEDERAL", "LT_FEDERAL", "FED"];

// 11h / 14h / 16h sempre base do RJ, salvo datas excepcionais
const RJ_BASE_REQUIRED_HOURS = ["11:00", "14:00", "16:00"];

// Datas excepcionais conhecidas em que a grade obrigatória do RJ não deve ser cobrada.
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

function daysBetweenInclusiveUTC(a, b) {
  const da = ymdToDateUTC(a);
  const db = ymdToDateUTC(b);
  if (!da || !db) throw new Error(`Período inválido: ${a} .. ${b}`);
  return Math.floor((db - da) / 86400000) + 1;
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

function getHourFromDoc(d) {
  return normalizeHourLike(
    d?.close_hour ??
    d?.closeHour ??
    d?.hour ??
    d?.hora ??
    ""
  );
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

function getRJExpectedHoursForDate(ymd, firstRJ09Date) {
  const weekday = getWeekdayUTC(ymd);

  // Domingo
  if (weekday === 0) {
    return [...RJ_BASE_REQUIRED_HOURS];
  }

  const hours = [...RJ_BASE_REQUIRED_HOURS];

  // 09h existe a partir de 2024-01-05 e não deve ser cobrado no domingo
  if (firstRJ09Date && ymd >= firstRJ09Date) {
    hours.unshift("09:00");
  }

  // 18h: pela base, existe em SEG, TER, QUI, SEX
  if ([1, 2, 4, 5].includes(weekday)) {
    hours.push("18:00");
  }

  // 21h: esperado de segunda a sábado
  if ([1, 2, 3, 4, 5, 6].includes(weekday)) {
    hours.push("21:00");
  }

  return hours;
}

function getRJKnownHoursUniverse() {
  return ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
}

function pushRJRow(rows, ymd, hour, summary, expected, reasonIfNotExpected) {
  if (!expected) {
    rows.push({
      date: ymd,
      scope: "RJ",
      hour,
      key: `RJ ${hour}`,
      status: summary.status === "missing" ? "not_expected" : summary.status,
      note: summary.status === "missing" ? reasonIfNotExpected : summary.note,
      isRequired: false,
    });
    return;
  }

  rows.push({
    date: ymd,
    scope: "RJ",
    hour,
    key: `RJ ${hour}`,
    status: summary.status,
    note: summary.note,
    isRequired: true,
  });
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

function buildDayReport(all, ymd, firstRJ09Date) {
  const rj = all.filter(
    (d) => String(d?.lottery_key || "").trim().toUpperCase() === RJ_LOTTERY_KEY
  );

  const federal = all.filter(
    (d) => FEDERAL_KEYS.includes(String(d?.lottery_key || "").trim().toUpperCase())
  );

  const rjByHour = groupByHour(rj);
  const federalByHour = groupByHour(federal);

  const rows = [];
  const expectedRJHours = RJ_EXCEPTION_DATES.has(ymd)
    ? []
    : getRJExpectedHoursForDate(ymd, firstRJ09Date);

  for (const hour of getRJKnownHoursUniverse()) {
    const s = summarizeSlot(rjByHour.get(hour));
    const expected = expectedRJHours.includes(hour);
    const reason = getReasonIfRJHourNotExpected(ymd, hour, firstRJ09Date);

    pushRJRow(rows, ymd, hour, s, expected, reason);
  }

  const federal19 = summarizeSlot(federalByHour.get("19:00"));
  const federal20 = summarizeSlot(federalByHour.get("20:00"));

  const hasFederal19 = federal19.status !== "missing";
  const hasFederal20 = federal20.status !== "missing";
  const federalPresentDay = hasFederal19 || hasFederal20;

  rows.push({
    date: ymd,
    scope: "FEDERAL",
    hour: federalPresentDay
      ? hasFederal20
        ? "20:00"
        : "19:00"
      : "-",
    key: "FEDERAL DAY",
    status: federalPresentDay ? "federal_present_day" : "federal_absent_day",
    note: federalPresentDay
      ? hasFederal20
        ? "Federal presente no dia (20:00)"
        : "Federal presente no dia (19:00)"
      : "sem Federal no dia",
    isRequired: false,
  });

  return rows;
}

async function getMinMax(db) {
  const minSnap = await db.collection("draws")
    .orderBy("ymd", "asc")
    .limit(1)
    .get();

  const maxSnap = await db.collection("draws")
    .orderBy("ymd", "desc")
    .limit(1)
    .get();

  if (minSnap.empty || maxSnap.empty) {
    throw new Error("Coleção draws vazia ou sem ymd indexável.");
  }

  const min = String(minSnap.docs[0].get("ymd") || "").trim();
  const max = String(maxSnap.docs[0].get("ymd") || "").trim();

  if (!isYMD(min) || !isYMD(max)) {
    throw new Error(`DataMin/DataMax inválidos: min=${min} max=${max}`);
  }

  return { min, max };
}

async function detectFirstRJ09Date(db, start, end) {
  let cursor = start;

  while (cursor <= end) {
    const draws = await fetchDayDraws(db, cursor);

    const hasRJ09 = draws.some((d) => {
      const lotteryKey = String(d?.lottery_key || "").trim().toUpperCase();
      return lotteryKey === RJ_LOTTERY_KEY && getHourFromDoc(d) === "09:00";
    });

    if (hasRJ09) {
      return cursor;
    }

    cursor = addDaysUTC(cursor, 1);
  }

  return null;
}

async function main() {
  const db = getDb();
  const range = await getMinMax(db);

  const startArg = process.argv[2];
  const endArg = process.argv[3];

  const start = isYMD(startArg) ? startArg : range.min;
  const end = isYMD(endArg) ? endArg : range.max;

  if (start > end) {
    throw new Error(`Período inválido: ${start} > ${end}`);
  }

  console.log("");
  console.log(`Integrity check ${start} .. ${end}`);
  console.log("");

  const firstRJ09Date = await detectFirstRJ09Date(db, range.min, end);

  console.log(
    `RJ 09:00 primeiro dia detectado: ${firstRJ09Date || "não encontrado no histórico até o fim do range"}`
  );
  console.log("");

  const totals = {
    ok: 0,
    missing: 0,
    partial: 0,
    duplicate: 0,
    not_expected: 0,
    federal_present_day: 0,
    federal_absent_day: 0,
  };

  const missingByKey = new Map();
  const notExpectedByKey = new Map();
  const realMissingRows = [];

  let cursor = start;
  const days = daysBetweenInclusiveUTC(start, end);
  let i = 0;

  while (cursor <= end) {
    const draws = await fetchDayDraws(db, cursor);
    const rows = buildDayReport(draws, cursor, firstRJ09Date);

    for (const r of rows) {
      totals[r.status] = (totals[r.status] || 0) + 1;

      if (r.status === "missing") {
        missingByKey.set(r.key, (missingByKey.get(r.key) || 0) + 1);
        realMissingRows.push({
          date: r.date,
          scope: r.scope,
          hour: r.hour,
          key: r.key,
          note: r.note,
        });
      }

      if (r.status === "not_expected") {
        notExpectedByKey.set(r.key, (notExpectedByKey.get(r.key) || 0) + 1);
      }
    }

    i++;

    if (i % 50 === 0 || cursor === end) {
      console.log(`Processado ${i}/${days}  ${cursor}`);
    }

    cursor = addDaysUTC(cursor, 1);
  }

  console.log("");
  console.log("Resumo:");
  console.log(totals);
  console.log("");

  console.log("Missing reais por horário esperado:");
  const missingKeys = Array.from(missingByKey.keys()).sort();
  if (!missingKeys.length) {
    console.log("nenhum");
  } else {
    for (const k of missingKeys) {
      console.log(`${k}: ${missingByKey.get(k)}`);
    }
  }

  console.log("");
  console.log("Não esperados:");
  const notExpectedKeys = Array.from(notExpectedByKey.keys()).sort();
  if (!notExpectedKeys.length) {
    console.log("nenhum");
  } else {
    for (const k of notExpectedKeys) {
      console.log(`${k}: ${notExpectedByKey.get(k)}`);
    }
  }

  console.log("");
  console.log("Lista dos missing reais:");
  if (!realMissingRows.length) {
    console.log("nenhum");
  } else {
    for (const row of realMissingRows) {
      console.log(`${row.date}  ${row.scope} ${row.hour}  ${row.note}`);
    }
  }

  console.log("");

  if (
    (totals.missing || 0) > 0 ||
    (totals.partial || 0) > 0 ||
    (totals.duplicate || 0) > 0
  ) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("");
  console.error("Integrity check failed:");
  console.error(err);
  console.error("");
  process.exitCode = 1;
});