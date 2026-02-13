"use strict";

const { getDb } = require("../service/firebaseAdmin");

function hh(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.includes(":")) return s.slice(0, 5);
  return s.length === 2 ? `${s}:00` : s;
}

(async () => {
  const db = getDb();
  const snap = await db.collection("draws")
    .where("lottery_key", "==", "FEDERAL")
    .get();

  let first20 = null;
  let last19 = null;

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const ymd = String(d.ymd || d.date || "").slice(0, 10);
    const ch = hh(d.close_hour || d.close || d.close_hour_raw);

    if (ymd && ch === "20:00") {
      if (!first20 || ymd < first20) first20 = ymd;
    }
    if (ymd && ch === "19:00") {
      if (!last19 || ymd > last19) last19 = ymd;
    }
  }

  console.log(JSON.stringify({ first20, last19, total: snap.size }, null, 2));
})();
