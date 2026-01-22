"use strict";

const { db } = require("../service/firebaseAdmin");

(async () => {
  const lot = "PT_RIO";
  const HOURS = ["09:00","11:00","14:00","16:00","18:00","21:00"];

  // thresholds:
  // CORE: >= 90% dos dias daquele (ano + dow)
  // OPCIONAL: >= 50% e < 90%
  // RARA: < 50%
  const CORE_MIN = 0.90;
  const OPT_MIN  = 0.50;

  const snap = await db.collection("draws").where("lottery_key","==",lot).get();

  const byYDowDays = new Map();       // yd -> Set(dates)
  const byYDowHourDays = new Map();   // yd__HH:MM -> Set(dates)

  function dowOf(ymd){
    return new Date(String(ymd) + "T00:00:00Z").getUTCDay(); // 0=Dom..6=Sáb
  }

  snap.forEach((doc) => {
    const d = doc.data() || {};
    const ymd = String(d.date || "").trim();
    const h   = String(d.close_hour || "").trim();

    if (!ymd || ymd.length < 10 || !h) return;

    const y = ymd.slice(0,4);
    const dow = String(dowOf(ymd));
    const yd = y + "__" + dow;

    if (!byYDowDays.has(yd)) byYDowDays.set(yd, new Set());
    byYDowDays.get(yd).add(ymd);

    if (HOURS.includes(h)) {
      const key = yd + "__" + h;
      if (!byYDowHourDays.has(key)) byYDowHourDays.set(key, new Set());
      byYDowHourDays.get(key).add(ymd);
    }
  });

  const ydKeys = [...byYDowDays.keys()].sort();

  // tabela detalhada
  const rows = [];
  for (const yd of ydKeys) {
    const daysSet = byYDowDays.get(yd) || new Set();
    const days = daysSet.size;
    if (!days) continue;

    const [year, dow] = yd.split("__");

    for (const h of HOURS) {
      const key = yd + "__" + h;
      const hs = byYDowHourDays.get(key) || new Set();
      const occ = hs.size;
      const p = occ / days;
      const pct = (p * 100).toFixed(1) + "%";

      let cls = "RARA";
      if (p >= CORE_MIN) cls = "CORE";
      else if (p >= OPT_MIN) cls = "OPCIONAL";

      rows.push({
        year,
        dow: Number(dow),
        close_hour: h,
        days_in_group: days,
        occurrences: occ,
        pct,
        class: cls,
      });
    }
  }

  rows.sort(
    (a,b) =>
      a.year.localeCompare(b.year) ||
      (a.dow - b.dow) ||
      a.close_hour.localeCompare(b.close_hour)
  );

  console.table(rows);

  // resumo compacto por ano+dow
  const summary = [];
  for (const yd of ydKeys) {
    const [year, dow] = yd.split("__");
    const days = (byYDowDays.get(yd) || new Set()).size;

    const core = [];
    const opt  = [];
    const rare = [];

    for (const h of HOURS) {
      const key = yd + "__" + h;
      const occ = (byYDowHourDays.get(key) || new Set()).size;
      const p = days ? (occ / days) : 0;

      if (p >= CORE_MIN) core.push(h);
      else if (p >= OPT_MIN) opt.push(h);
      else rare.push(h);
    }

    summary.push({
      year,
      dow: Number(dow),
      days,
      CORE: core.join(","),
      OPCIONAL: opt.join(","),
      RARA: rare.join(","),
    });
  }

  summary.sort((a,b)=> a.year.localeCompare(b.year) || (a.dow-b.dow));

  console.log("\n=== RESUMO (por Ano + DOW) ===");
  console.table(summary);

  process.exit(0);
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
