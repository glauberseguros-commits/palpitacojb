"use strict";

const fs = require("fs");
const path = require("path");

const { runImport } = require("./importKingApostas");
const { getDb } = require("../service/firebaseAdmin");

const LOG_DIR = path.join(process.cwd(), "backend", "logs");
const LOCK_FILE = path.join(LOG_DIR, "autoRepairToday.lock");
const LOCK_MAX_AGE_MS = 1000 * 60 * 20; // 20 min
const TOLERANCE_MINUTES = 10;

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

function normalizeHHMM(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  if (/^\d{2}:\d{2}$/.test(s)) return s;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    return `${String(m3[1]).padStart(2, "0")}:${String(m3[2]).padStart(2, "0")}`;
  }

  return "";
}

function getDowLocal(ymd) {
  return new Date(`${ymd}T12:00:00`).getDay(); // 0 = domingo
}

function addMinutesToHHMM(hhmm, minutes) {
  const [h, m] = String(hhmm || "00:00")
    .split(":")
    .map((x) => Number(x));

  const total = h * 60 + m + Number(minutes || 0);
  const hh = Math.floor(total / 60);
  const mm = total % 60;

  return `${pad2(hh)}:${pad2(mm)}`;
}

function getExpectedPtRioHours(ymd, hasFederal) {
  const dow = getDowLocal(ymd);

  if (dow === 0) {
    return ["09:00", "11:00", "14:00", "16:00"];
  }

  const expected = ["09:00", "11:00", "14:00", "16:00", "21:00"];

  if (!hasFederal) {
    expected.push("18:00");
  }

  return expected.sort();
}

function getDuePtRioHours(ymd, hasFederal) {
  const expected = getExpectedPtRioHours(ymd, hasFederal);
  const today = todayYMDLocal();

  if (ymd < today) return expected;
  if (ymd > today) return [];

  const now = nowHHMMLocal();
  return expected.filter((h) => addMinutesToHHMM(h, TOLERANCE_MINUTES) <= now);
}

function getExpectedFederalHours(ymd) {
  const dow = getDowLocal(ymd);

  if (dow !== 3 && dow !== 6) return [];

  return ymd >= "2025-11-03" ? ["20:00"] : ["19:00"];
}

function getDueFederalHours(ymd) {
  const expected = getExpectedFederalHours(ymd);
  const today = todayYMDLocal();

  if (ymd < today) return expected;
  if (ymd > today) return [];

  const now = nowHHMMLocal();
  return expected.filter((h) => addMinutesToHHMM(h, TOLERANCE_MINUTES) <= now);
}

async function loadDay(ymd) {
  const db = getDb();
  const snap = await db.collection("draws").where("ymd", "==", ymd).get();

  const rows = snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      lottery_key: String(d.lottery_key || d.lotteryKey || "")
        .trim()
        .toUpperCase(),
      close_hour: normalizeHHMM(d.close_hour || d.close || d.hour || ""),
    };
  });

  const pt = Array.from(
    new Set(
      rows
        .filter((x) => x.lottery_key === "PT_RIO")
        .map((x) => x.close_hour)
        .filter(Boolean)
    )
  ).sort();

  const fed = Array.from(
    new Set(
      rows
        .filter((x) => x.lottery_key === "FEDERAL")
        .map((x) => x.close_hour)
        .filter(Boolean)
    )
  ).sort();

  return { pt, fed };
}

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function acquireLock() {
  ensureLogDir();

  if (fs.existsSync(LOCK_FILE)) {
    const stale = readJsonSafe(LOCK_FILE);
    const ts = Number(stale?.ts || 0);
    const age = Date.now() - ts;

    if (ts && age > LOCK_MAX_AGE_MS) {
      try {
        fs.unlinkSync(LOCK_FILE);
        console.warn(`[LOCK] stale removido ageMs=${age}`);
      } catch {
        // segue
      }
    }
  }

  try {
    const fd = fs.openSync(LOCK_FILE, "wx");

    const payload = {
      pid: process.pid,
      ts: Date.now(),
      ymd: todayYMDLocal(),
      now: nowHHMMLocal(),
    };

    fs.writeFileSync(fd, JSON.stringify(payload, null, 2), "utf8");
    fs.closeSync(fd);

    return true;
  } catch {
    const current = readJsonSafe(LOCK_FILE);
    console.warn(
      `[LOCK] execução já em andamento pid=${current?.pid || "?"} ts=${current?.ts || "?"}`
    );
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // silencioso
  }
}

async function repairLottery({ ymd, lotteryKey, present, expected }) {
  const missing = expected.filter((h) => !present.includes(h));

  console.log(
    `[AUDIT:${lotteryKey}] ${ymd} present=[${present.join(", ")}] expected=[${expected.join(", ")}] missing=[${missing.join(", ")}]`
  );

  if (!missing.length) {
    console.log(`[OK:${lotteryKey}] Nenhum gap vencido.`);
    return [];
  }

  const results = [];

  for (const hour of missing) {
    console.log(`\n[REPAIR:${lotteryKey}] ${ymd} ${hour}`);

    try {
      const r = await runImport({
        date: ymd,
        lotteryKey,
        closeHour: hour,
      });

      const row = {
        lotteryKey,
        date: ymd,
        hour,
        blocked: !!r?.blocked,
        blockedReason: r?.blockedReason || null,
        captured: !!r?.captured,
        writeCount: r?.writeCount ?? null,
        savedCount: r?.savedCount ?? null,
      };

      results.push(row);

      console.log(
        `[RESULT:${lotteryKey}] blocked=${row.blocked} reason=${row.blockedReason || "-"} captured=${row.captured} writeCount=${row.writeCount ?? "-"} savedCount=${row.savedCount ?? "-"}`
      );
    } catch (e) {
      const row = {
        lotteryKey,
        date: ymd,
        hour,
        blocked: null,
        blockedReason: "exception",
        captured: false,
        writeCount: null,
        savedCount: null,
        error: String(e?.message || e || "unknown"),
      };

      results.push(row);
      console.error(`[ERR:${lotteryKey}] ${ymd} ${hour} -> ${row.error}`);
    }
  }

  return results;
}

async function main() {
  if (!acquireLock()) {
    process.exit(0);
  }

  try {
    const ymd = String(process.argv[2] || todayYMDLocal()).trim();
    const { pt, fed } = await loadDay(ymd);

    const ptExpected = getDuePtRioHours(ymd, fed.length > 0);
    const fedExpected = getDueFederalHours(ymd);

    const summary = [];

    summary.push(
      ...(await repairLottery({
        ymd,
        lotteryKey: "PT_RIO",
        present: pt,
        expected: ptExpected,
      }))
    );

    summary.push(
      ...(await repairLottery({
        ymd,
        lotteryKey: "FEDERAL",
        present: fed,
        expected: fedExpected,
      }))
    );

    if (summary.length) {
      console.log("\n===== AUTO REPAIR SUMMARY =====");
      console.table(summary);
    } else {
      console.log("\n[OK] Nada para reparar nesta execução.");
    }
  } finally {
    releaseLock();
  }
}

main().catch((e) => {
  console.error("ERRO FATAL:", e?.message || e);
  process.exit(1);
});
