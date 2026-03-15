const { getDb } = require("../backend/service/firebaseAdmin");

const RJ_LOTTERY_KEY = "PT_RIO";
const FEDERAL_KEYS = ["FEDERAL", "LOTERIA_FEDERAL", "LT_FEDERAL", "FED"];
const RJ_BASE_HOURS = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
const FEDERAL_HOURS = ["19:00", "20:00"];

const VALID_MODES = new Set(["daily", "after20", "recheck"]);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayYmdSP() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function isYMD(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function normalizeHourLike(value) {
  const s0 = String(value ?? "").trim();
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const mHm = s.match(/^(\d{3,4})$/);
  if (mHm) {
    const hh = String(mHm[1]).slice(0, -2);
    const mm = String(mHm[1]).slice(-2);
    if (/^\d{1,2}$/.test(hh) && /^\d{2}$/.test(mm)) {
      return `${pad2(hh)}:${mm}`;
    }
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return "";
}

function getHourFromDoc(d) {
  return normalizeHourLike(
    d?.close_hour ?? d?.closeHour ?? d?.hour ?? d?.hora ?? ""
  );
}

function countEmbeddedPrizes(d) {
  return Array.isArray(d?.prizes) ? d.prizes.length : 0;
}

function getStatusIcon(status) {
  if (status === "ok") return "✔";
  if (status === "missing") return "❌";
  if (status === "not_applicable") return "•";
  if (status === "partial") return "⚠";
  if (status === "duplicate") return "⚠";
  if (status === "alert") return "⏳";
  if (status === "resolved_by_federal") return "➜";
  if (status === "suspect") return "⚠";
  if (status === "confirmed_gap") return "❌";
  return "?";
}

function shouldFailStatus(status) {
  return (
    status === "missing" ||
    status === "partial" ||
    status === "duplicate" ||
    status === "suspect" ||
    status === "confirmed_gap"
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
    if (!map.has(hour)) map.set(hour, []);
    map.get(hour).push(d);
  }
  return map;
}

function summarizeSlot(drawsAtHour) {
  const arr = Array.isArray(drawsAtHour) ? drawsAtHour : [];

  if (!arr.length) {
    return { status: "missing", note: "sem draw", draws: [] };
  }

  if (arr.length > 1) {
    return {
      status: "duplicate",
      note: `duplicado (${arr.length})`,
      draws: arr,
    };
  }

  const d = arr[0];
  const embeddedCount = countEmbeddedPrizes(d);

  if (embeddedCount > 0 && embeddedCount < 7) {
    return {
      status: "partial",
      note: `draw parcial (${embeddedCount} prizes)`,
      draws: arr,
    };
  }

  return {
    status: "ok",
    note: embeddedCount ? `${embeddedCount} prizes` : "draw encontrado",
    draws: arr,
  };
}

function classifyRj18({ mode, rj18Summary, federal20Summary, federal19Summary }) {
  const hasFederal20 = federal20Summary.status !== "missing";
  const hasFederal19 = federal19Summary.status !== "missing";
  const hasAnyFederal = hasFederal19 || hasFederal20;

  if (rj18Summary.status === "ok") {
    return {
      status: "ok",
      note: rj18Summary.note,
    };
  }

  if (rj18Summary.status === "partial") {
    return {
      status: "partial",
      note: rj18Summary.note,
    };
  }

  if (rj18Summary.status === "duplicate") {
    return {
      status: "duplicate",
      note: rj18Summary.note,
    };
  }

  if (hasAnyFederal) {
    return {
      status: "resolved_by_federal",
      note: hasFederal20
        ? "RJ 18h ausente, resolvido por Federal 20h"
        : "RJ 18h ausente, resolvido por Federal 19h",
    };
  }

  if (mode === "daily") {
    return {
      status: "alert",
      note: "RJ 18h ausente; aguardar janela/resultado da Federal",
    };
  }

  if (mode === "after20") {
    return {
      status: "suspect",
      note: "sem RJ 18h e sem Federal 19h/20h após a janela da Federal",
    };
  }

  return {
    status: "confirmed_gap",
    note: "sem RJ 18h e sem Federal 19h/20h também no recheck diário",
  };
}

function buildReport(all, mode) {
  const rjDraws = all.filter(
    (d) => String(d?.lottery_key || "").trim().toUpperCase() === RJ_LOTTERY_KEY
  );

  const federalDraws = all.filter((d) =>
    FEDERAL_KEYS.includes(String(d?.lottery_key || "").trim().toUpperCase())
  );

  const rjByHour = groupByHour(rjDraws);
  const federalByHour = groupByHour(federalDraws);

  const federal19Summary = summarizeSlot(federalByHour.get("19:00"));
  const federal20Summary = summarizeSlot(federalByHour.get("20:00"));

  const report = [];

  for (const hour of RJ_BASE_HOURS) {
    if (hour === "18:00") {
      const rj18Summary = summarizeSlot(rjByHour.get("18:00"));
      const result18 = classifyRj18({
        mode,
        rj18Summary,
        federal20Summary,
        federal19Summary,
      });

      report.push({
        scope: "RJ",
        hour: "18:00",
        status: result18.status,
        note: result18.note,
      });
      continue;
    }

    const summary = summarizeSlot(rjByHour.get(hour));
    report.push({
      scope: "RJ",
      hour,
      status: summary.status,
      note: summary.note,
    });
  }

  report.push({
    scope: "FEDERAL",
    hour: "19:00",
    status: federal19Summary.status,
    note: federal19Summary.note,
  });

  report.push({
    scope: "FEDERAL",
    hour: "20:00",
    status: federal20Summary.status,
    note: federal20Summary.note,
  });

  return report;
}

function printUsageAndExit() {
  console.log("");
  console.log("Uso:");
  console.log("  node script.js [YYYY-MM-DD] [daily|after20|recheck]");
  console.log("");
  console.log("Exemplos:");
  console.log("  node script.js");
  console.log("  node script.js 2026-03-15");
  console.log("  node script.js 2026-03-15 after20");
  console.log("  node script.js 2026-03-15 recheck");
  console.log("");
  process.exitCode = 1;
}

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  let ymd = todayYmdSP();
  let mode = "daily";

  if (arg1 && isYMD(arg1)) {
    ymd = arg1;
    if (arg2) mode = String(arg2).trim().toLowerCase();
  } else if (arg1) {
    mode = String(arg1).trim().toLowerCase();
  }

  if (!VALID_MODES.has(mode)) {
    printUsageAndExit();
    return;
  }

  const db = getDb();

  console.log("");
  console.log(`Integrity check — ${ymd} — mode=${mode}`);
  console.log("");

  const all = await fetchDayDraws(db, ymd);
  const report = buildReport(all, mode);

  for (const row of report) {
    const icon = getStatusIcon(row.status);
    console.log(
      `${row.scope} ${row.hour} ${icon} ${row.status.toUpperCase()}${row.note ? ` — ${row.note}` : ""}`
    );
  }

  const totals = report.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    {
      ok: 0,
      missing: 0,
      partial: 0,
      duplicate: 0,
      not_applicable: 0,
      alert: 0,
      resolved_by_federal: 0,
      suspect: 0,
      confirmed_gap: 0,
    }
  );

  console.log("");
  console.log("Resumo:");
  console.log(`ok: ${totals.ok || 0}`);
  console.log(`missing: ${totals.missing || 0}`);
  console.log(`partial: ${totals.partial || 0}`);
  console.log(`duplicate: ${totals.duplicate || 0}`);
  console.log(`not_applicable: ${totals.not_applicable || 0}`);
  console.log(`alert: ${totals.alert || 0}`);
  console.log(`resolved_by_federal: ${totals.resolved_by_federal || 0}`);
  console.log(`suspect: ${totals.suspect || 0}`);
  console.log(`confirmed_gap: ${totals.confirmed_gap || 0}`);
  console.log("");

  const hasFailure = report.some((row) => shouldFailStatus(row.status));
  if (hasFailure) {
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