"use strict";

const { runImport } = require("./importKingApostas");
const { getDb } = require("../service/firebaseAdmin");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayYMDLocal() {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
}

function normalizeHHMM(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;
  return "";
}

function getDowLocal(ymd) {
  return new Date(`${ymd}T12:00:00`).getDay();
}

function getExpectedPtRioHours(ymd, hasFederal) {
  const dow = getDowLocal(ymd);

  if (dow === 0) return ["09:00", "11:00", "14:00", "16:00"];

  const expected = ["09:00", "11:00", "14:00", "16:00", "21:00"];
  if (!hasFederal) expected.push("18:00");
  return expected.sort();
}

async function loadDay(ymd) {
  const db = getDb();
  const snap = await db.collection("draws").where("ymd", "==", ymd).get();

  const rows = snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      lottery_key: String(d.lottery_key || "").trim().toUpperCase(),
      close_hour: normalizeHHMM(d.close_hour || d.close || d.hour || ""),
    };
  });

  const pt = Array.from(new Set(rows.filter(x => x.lottery_key === "PT_RIO").map(x => x.close_hour).filter(Boolean))).sort();
  const fed = Array.from(new Set(rows.filter(x => x.lottery_key === "FEDERAL").map(x => x.close_hour).filter(Boolean))).sort();

  return { pt, fed };
}


function nowHHMMLocal() {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return fmt.format(new Date()).replace(".", ":");
  } catch {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
}

function addMinutesToHHMM(hhmm, minutes) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  const total = (h * 60) + m + Number(minutes || 0);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function getDuePtRioHours(ymd, hasFederal) {
  const expected = getExpectedPtRioHours(ymd, hasFederal);
  const today = todayYMDLocal();

  if (ymd < today) return expected;
  if (ymd > today) return [];

  const now = nowHHMMLocal();
  const toleranceMin = 10;

  return expected.filter(h => addMinutesToHHMM(h, toleranceMin) <= now);
}

async function main() {
  const ymd = String(process.argv[2] || todayYMDLocal()).trim();
  const { pt, fed } = await loadDay(ymd);

  const expected = getDuePtRioHours(ymd, fed.length > 0);
  const missing = expected.filter(h => !pt.includes(h));

  console.log(`[AUDIT] ${ymd} present=[${pt.join(", ")}] expected=[${expected.join(", ")}] missing=[${missing.join(", ")}]`);

  if (!missing.length) {
    console.log("[OK] Nenhum gap HARD/CORE hoje.");
    process.exit(0);
  }

  for (const hour of missing) {
    console.log(`\n[REPAIR] ${ymd} ${hour}`);
    try {
      const r = await runImport({
        date: ymd,
        lotteryKey: "PT_RIO",
        closeHour: hour,
      });

      console.log(
        `[RESULT] blocked=${!!r?.blocked} reason=${r?.blockedReason || "-"} captured=${!!r?.captured} writeCount=${r?.writeCount ?? "-"} savedCount=${r?.savedCount ?? "-"}`
      );
    } catch (e) {
      console.error(`[ERR] ${ymd} ${hour} -> ${String(e?.message || e || "unknown")}`);
    }
  }
}

main().catch((e) => {
  console.error("ERRO FATAL:", e?.message || e);
  process.exit(1);
});



