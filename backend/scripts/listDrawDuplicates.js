"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function arg(name, def=null){
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i+1]) return process.argv[i+1];
  return def;
}
function pad2(n){ return String(n).padStart(2,"0"); }
function normHour(v){
  const s0 = String(v ?? "").trim();
  if (!s0) return "";
  const s = s0.replace(/\s+/g,"");
  let m = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (m) return `${pad2(m[1])}:00`;
  m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return `${pad2(m[1])}:${pad2(m[2])}`;
  m = s.match(/^(\d{1,2})$/);
  if (m) return `${pad2(m[1])}:00`;
  return s0;
}
function ymdInRange(ymd, from, to){
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

(async () => {
  const lottery = arg("lottery", "PT_RIO");
  const from = arg("from", null);
  const to = arg("to", null);

  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const col = db.collection("draws");
  let last = null;
  let scanned = 0;

  // key => array de docs
  const buckets = new Map();

  while (true) {
    let q = col.orderBy("ymd").limit(500);
    if (last) q = q.startAfter(last);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      const d = doc.data() || {};

      const ymd = String(d.ymd || d.date || "").slice(0,10);
      if (!ymdInRange(ymd, from, to)) continue;

      const lk = String(d.lottery_key || d.lotteryKey || d.lottery || "").trim();
      if (lk && lk !== lottery) continue;

      const close = normHour(d.close_hour || d.closeHour || d.hour || d.hora || "");
      const key = `${lk || lottery}__${ymd}__${close || "??"}`;

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({
        id: doc.id,
        ymd,
        lottery_key: lk || lottery,
        close_hour: d.close_hour ?? d.closeHour ?? null,
        close_hour_raw: d.close_hour_raw ?? d.closeHourRaw ?? null,
        prizesCount: d.prizesCount ?? (Array.isArray(d.prizes) ? d.prizes.length : null),
        importedAt: d.importedAt ?? null,
        source: d.source ?? null,
      });
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }

  const dups = [];
  for (const [key, arr] of buckets.entries()) {
    if (arr.length > 1) {
      // ordena pra facilitar a leitura
      arr.sort((a,b) => String(a.id).localeCompare(String(b.id)));
      dups.push({ key, count: arr.length, docs: arr });
    }
  }

  dups.sort((a,b) => b.count - a.count || a.key.localeCompare(b.key));

  const outDir = path.join(process.cwd(), "backend", "logs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(
    outDir,
    `dups-${lottery}-${from || "ALL"}_to_${to || "ALL"}.json`
  );

  fs.writeFileSync(outFile, JSON.stringify({ lottery, from, to, scanned, duplicates: dups }, null, 2), "utf8");

  console.log("OK ✅");
  console.log("Scanned docs:", scanned);
  console.log("Duplicate keys:", dups.length);
  console.log("Saved:", outFile);

  // mostra um resumo no console
  for (const x of dups.slice(0, 30)) {
    console.log(`\nDUP: ${x.key} (x${x.count})`);
    x.docs.forEach(d => console.log(" -", d.id, "| close:", d.close_hour, "| raw:", d.close_hour_raw, "| prizes:", d.prizesCount, "| importedAt:", d.importedAt));
  }
})();
