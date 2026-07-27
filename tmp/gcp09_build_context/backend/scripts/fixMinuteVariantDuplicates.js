"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

function safeFilePart(s) {
  return String(s ?? "").replace(/[^\w.\-]+/g, "_");
}

function parseDocId(id) {
  const s = String(id || "");
  const m = s.match(/^([A-Z_]+)__(\d{4}-\d{2}-\d{2})__(\d{2}-\d{2})__(.+)$/);
  if (!m) return null;
  return { lottery: m[1], ymd: m[2], hhmmDash: m[3], suffix: m[4] };
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function pageScanByYmd(col, from, to, onDoc) {
  let lastYmd = null;
  let lastId = null;
  while (true) {
    let q = col
      .orderBy("ymd")
      .orderBy("__name__")
      .limit(500);

    if (lastYmd !== null && lastId !== null) q = q.startAfter(lastYmd, lastId);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const ymd = String(d.ymd || "").slice(0, 10);
      if (!ymd) continue;
      if (ymd < from) continue;
      if (ymd > to) continue;

      await onDoc(doc, d);
    }

    const lastDoc = snap.docs[snap.docs.length - 1];
    lastYmd = String((lastDoc.data() || {}).ymd || "");
    lastId = lastDoc.id;

    if (snap.size < 500) break;
  }
}

(async () => {
  try {
    const lottery = String(arg("lottery", "")).trim().toUpperCase();
    const from = arg("from");
    const to = arg("to");
    const apply = arg("apply") === "1";
    const dryRun = !apply;

    if (!lottery) throw new Error("Informe --lottery (PT_RIO|FEDERAL)");
    if (!from || !to) throw new Error("Informe --from e --to (YYYY-MM-DD)");

    const db = getDb();
    const col = db.collection("draws");

    console.log("Mode:", dryRun ? "DRY-RUN (não apaga)" : "APPLY (apagando)");
    console.log("Filter:", { lottery, from, to });

    const toDelete = [];
    const reasons = [];
    let scanned = 0;

    // Build an idSet for quick sibling checks (within range + lottery)
    const idSet = new Set();

    await pageScanByYmd(col, from, to, async (doc, d) => {
      scanned++;
      const lk = String(d.lottery_key || d.lotteryKey || d.lottery || "").toUpperCase();
      if (lk && lk !== lottery) return;
      idSet.add(doc.id);
    });

    // Second pass: decide deletions
    await pageScanByYmd(col, from, to, async (doc, d) => {
      const lk = String(d.lottery_key || d.lotteryKey || d.lottery || "").toUpperCase();
      if (lk && lk !== lottery) return;

      const id = doc.id;
      const p = parseDocId(id);
      if (!p) return;
      if (p.lottery !== lottery) return;

      // ---- PT_RIO rule: delete HH-10 LT_PT_RIO_HHHS if HH-00 sibling exists ----
      if (lottery === "PT_RIO") {
        const m = p.suffix.match(/^LT_PT_RIO_(\d{2})HS$/);
        if (m && p.hhmmDash.endsWith("-10")) {
          const hh = m[1]; // e.g. "11"
          const siblingId = `${p.lottery}__${p.ymd}__${hh}-00__${p.suffix}`;
          if (idSet.has(siblingId)) {
            toDelete.push(id);
            reasons.push({ id, rule: "PT_RIO minute-variant", keep: siblingId });
          }
        }
        return;
      }

      // ---- FEDERAL rule: delete non-20-00 LT_FEDERAL_20HS if any 20-00 sibling exists ----
      if (lottery === "FEDERAL") {
        if (p.suffix === "LT_FEDERAL_20HS" && p.hhmmDash !== "20-00") {
          const prefix = `${p.lottery}__${p.ymd}__20-00__`;
          let hasSibling = false;
          for (const otherId of idSet) {
            if (otherId.startsWith(prefix) && otherId !== id) { hasSibling = true; break; }
          }
          if (hasSibling) {
            toDelete.push(id);
            reasons.push({ id, rule: "FEDERAL minute-variant", keepPrefix: prefix });
          }
        }
      }
    });

    console.log("Scanned docs (range):", scanned);
    console.log("Candidates to delete:", toDelete.length);

    const logDir = path.join(process.cwd(), "logs");
    ensureDir(logDir);

    const logFile = path.join(
      logDir,
      `removed-minute-variants-${safeFilePart(lottery)}-${safeFilePart(from)}_to_${safeFilePart(to)}-${Date.now()}.json`
    );

    if (!dryRun && toDelete.length) {
      let idx = 0;
      while (idx < toDelete.length) {
        const chunk = toDelete.slice(idx, idx + 450);
        const batch = db.batch();
        chunk.forEach(id => batch.delete(col.doc(id)));
        await batch.commit();
        idx += chunk.length;
      }
      console.log("Deleted:", toDelete.length);
    }

    fs.writeFileSync(
      logFile,
      JSON.stringify({ lottery, from, to, apply, scanned, count: toDelete.length, toDelete, reasons }, null, 2),
      "utf8"
    );

    console.log("Log saved:", logFile);

    if (dryRun && toDelete.length) {
      console.log("\nSample (up to 10):");
      toDelete.slice(0, 10).forEach(x => console.log(" -", x));
    }

  } catch (e) {
    console.error("ERRO:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
