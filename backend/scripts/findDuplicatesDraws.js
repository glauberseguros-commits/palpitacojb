"use strict";

const fs = require("fs");
const path = require("path");

// ✅ usa o bootstrap oficial do seu projeto (service account / config já pronta)
const { admin, getDb } = require("../service/firebaseAdmin");

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

function isISODateStrict(s) {
  const str = String(s ?? "").trim();
  if (!str) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function normalizeLotteryKey(v, fallback = "") {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return fallback;

  if (s === "RJ" || s === "RIO" || s === "PT-RIO" || s === "PT_RIO") return "PT_RIO";
  if (s === "FED" || s === "FEDERAL") return "FEDERAL";

  return fallback;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normHourWithStatus(v) {
  const s0 = String(v ?? "").trim();
  if (!s0) return { close: "", status: "EMPTY" };

  const s = s0.replace(/\s+/g, "");

  let m = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (m) {
    const hh = Number(m[1]);
    if (Number.isFinite(hh) && hh >= 0 && hh <= 23) {
      return { close: `${pad2(hh)}:00`, status: "OK" };
    }
    return { close: "", status: "INVALID" };
  }

  m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (
      Number.isFinite(hh) &&
      Number.isFinite(mm) &&
      hh >= 0 &&
      hh <= 23 &&
      mm >= 0 &&
      mm <= 59
    ) {
      return { close: `${pad2(hh)}:${pad2(mm)}`, status: "OK" };
    }
    return { close: "", status: "INVALID" };
  }

  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const hh = Number(m[1]);
    if (Number.isFinite(hh) && hh >= 0 && hh <= 23) {
      return { close: `${pad2(hh)}:00`, status: "OK" };
    }
    return { close: "", status: "INVALID" };
  }

  return { close: "", status: "INVALID" };
}

function ymdInRange(ymd, from, to) {
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

function safeFilePart(s) {
  return String(s ?? "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

function resolveLogsDir() {
  const cwd = process.cwd();
  const base = path.basename(cwd).toLowerCase();
  if (base === "backend") return path.join(cwd, "logs");
  return path.join(cwd, "backend", "logs");
}

(async () => {
  try {
    const lottery = normalizeLotteryKey(arg("lottery", "PT_RIO"), "PT_RIO");
    const from = arg("from", null);
    const to = arg("to", null);

    if (from && !isISODateStrict(from)) throw new Error(`--from inválido (use YYYY-MM-DD): ${from}`);
    if (to && !isISODateStrict(to)) throw new Error(`--to inválido (use YYYY-MM-DD): ${to}`);
    if (from && to && from > to) throw new Error(`intervalo inválido: from (${from}) > to (${to})`);

    const db = getDb();
    const col = db.collection("draws");

    let scanned = 0;
    let lastYmd = null;
    let lastId = null;

    const buckets = new Map();

    while (true) {
      let q = col
        .orderBy("ymd")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(500);

      if (lastYmd !== null && lastId !== null) q = q.startAfter(lastYmd, lastId);

      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        scanned++;
        const d = doc.data() || {};

        const ymd = String(d.ymd || d.date || "").slice(0, 10);
        if (!ymdInRange(ymd, from, to)) continue;

        const lk = normalizeLotteryKey(d.lottery_key || d.lotteryKey || d.lottery || "", "");
        if (lk && lk !== lottery) continue;

        const { close, status: closeNormStatus } = normHourWithStatus(
          d.close_hour || d.closeHour || d.hour || d.hora || ""
        );

        const key = `${lk || lottery}__${ymd}__${close || "??"}`;

        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({
          id: doc.id,
          ymd,
          lottery_key: lk || lottery,
          close_hour: d.close_hour ?? d.closeHour ?? null,
          close_hour_raw: d.close_hour_raw ?? d.closeHourRaw ?? null,
          close_norm: close || null,
          close_norm_status: closeNormStatus,
          prizesCount: d.prizesCount ?? (Array.isArray(d.prizes) ? d.prizes.length : null),
          importedAt: d.importedAt ?? null,
          source: d.source ?? null,
        });
      }

      const lastDoc = snap.docs[snap.docs.length - 1];
      lastYmd = String((lastDoc.data() || {}).ymd || "");
      lastId = lastDoc.id;

      if (snap.size < 500) break;
    }

    const dups = [];
    for (const [key, arr] of buckets.entries()) {
      if (arr.length > 1) {
        arr.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        dups.push({ key, count: arr.length, docs: arr });
      }
    }

    dups.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

    const outDir = resolveLogsDir();
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outFile = path.join(
      outDir,
      `dups-${safeFilePart(lottery)}-${safeFilePart(from || "ALL")}_to_${safeFilePart(to || "ALL")}.json`
    );

    fs.writeFileSync(
      outFile,
      JSON.stringify({ lottery, from, to, scanned, duplicates: dups }, null, 2),
      "utf8"
    );

    console.log("OK ✅");
    console.log("Scanned docs:", scanned);
    console.log("Duplicate keys:", dups.length);
    console.log("Saved:", outFile);

    for (const x of dups.slice(0, 30)) {
      console.log(`\nDUP: ${x.key} (x${x.count})`);
      x.docs.forEach((d) =>
        console.log(
          " -",
          d.id,
          "| close:",
          d.close_hour,
          "| norm:",
          d.close_norm,
          "| status:",
          d.close_norm_status,
          "| raw:",
          d.close_hour_raw,
          "| prizes:",
          d.prizesCount,
          "| importedAt:",
          d.importedAt
        )
      );
    }
  } catch (e) {
    console.error("ERRO:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();