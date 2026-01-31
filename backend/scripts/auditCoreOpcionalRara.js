"use strict";

const { getDb } = require("../service/firebaseAdmin");

(async () => {
  const lot = "PT_RIO";

  // Regra do projeto (pelo teu audit):
  // 09:00 só passa a valer a partir daqui (ajuste se mudar no futuro)
  const INCLUDE_09_FROM_YMD = "2024-01-05";

  const HOURS_BASE = ["11:00", "14:00", "16:00", "18:00", "21:00"];
  const HOURS_WITH_09 = ["09:00", ...HOURS_BASE];

  // thresholds:
  // CORE: >= 90% dos dias daquele (ano + dow)
  // OPCIONAL: >= 50% e < 90%
  // RARA: < 50%
  const CORE_MIN = 0.9;
  const OPT_MIN = 0.5;

  function isISODate(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
  }

  function isHHMM(s) {
    return /^\d{2}:\d{2}$/.test(String(s || "").trim());
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function normalizeHHMM(value) {
    const s = String(value ?? "").trim();
    if (!s) return "";
    if (isHHMM(s)) return s;

    const m1 = s.match(/^(\d{1,2})h$/i);
    if (m1) return `${pad2(m1[1])}:00`;

    const m2 = s.match(/^(\d{1,2})$/);
    if (m2) return `${pad2(m2[1])}:00`;

    const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (m3) return `${pad2(m3[1])}:${pad2(m3[2])}`;

    return "";
  }

  function upTrim(v) {
    return String(v ?? "").trim().toUpperCase();
  }

  function dowOf(ymd) {
    // 0=Dom..6=Sáb (UTC)
    return new Date(String(ymd) + "T00:00:00Z").getUTCDay();
  }

  function hoursForDay(ymd) {
    // 09:00 só entra após o marco
    return ymd >= INCLUDE_09_FROM_YMD ? HOURS_WITH_09 : HOURS_BASE;
  }

  function classify(p) {
    if (p >= CORE_MIN) return "CORE";
    if (p >= OPT_MIN) return "OPCIONAL";
    return "RARA";
  }

  const db = getDb();

  // 🔥 IMPORTANTE: aqui filtramos por lottery_key no Firestore,
  // mas ainda pode existir duplicidade RJ vs PT_RIO em uf.
  const snap = await db.collection("draws").where("lottery_key", "==", lot).get();

  // Dedup por (ymd + close_hour), preferindo uf=PT_RIO
  const bestByDayHour = new Map(); // key=ymd__HH:MM -> {ymd, h, uf, id}
  const daySet = new Set(); // todos os dias que aparecem em docs

  snap.forEach((doc) => {
    const d = doc.data() || {};
    const ymd = String(d.date || d.ymd || "").trim();
    const h = normalizeHHMM(d.close_hour);
    const uf = upTrim(d.uf || "");

    if (!isISODate(ymd) || !h) return;

    daySet.add(ymd);

    const key = `${ymd}__${h}`;
    const prev = bestByDayHour.get(key);

    // Preferência: uf=PT_RIO (porque teu exemplo mostra duplicados RJ vs PT_RIO)
    const prevScore = prev ? (prev.uf === "PT_RIO" ? 2 : 1) : 0;
    const curScore = uf === "PT_RIO" ? 2 : 1;

    if (!prev || curScore > prevScore) {
      bestByDayHour.set(key, { ymd, h, uf, id: doc.id });
    }
  });

  // Index por (year + dow): dias e horas presentes
  const byYDowDays = new Map(); // yd -> Set(ymd)
  const byYDowHourDays = new Map(); // yd__HH:MM -> Set(ymd)

  // Primeiro: registrar grupos de dias por ano+dow
  for (const ymd of daySet) {
    const y = ymd.slice(0, 4);
    const dow = String(dowOf(ymd));
    const yd = `${y}__${dow}`;
    if (!byYDowDays.has(yd)) byYDowDays.set(yd, new Set());
    byYDowDays.get(yd).add(ymd);
  }

  // Segundo: registrar ocorrências por hora, respeitando hoursForDay(ymd)
  for (const item of bestByDayHour.values()) {
    const { ymd, h } = item;
    const allowed = hoursForDay(ymd);
    if (!allowed.includes(h)) continue;

    const y = ymd.slice(0, 4);
    const dow = String(dowOf(ymd));
    const yd = `${y}__${dow}`;
    const key = `${yd}__${h}`;

    if (!byYDowHourDays.has(key)) byYDowHourDays.set(key, new Set());
    byYDowHourDays.get(key).add(ymd);
  }

  const ydKeys = [...byYDowDays.keys()].sort();

  // tabela detalhada
  const rows = [];
  for (const yd of ydKeys) {
    const daysSet = byYDowDays.get(yd) || new Set();
    const days = daysSet.size;
    if (!days) continue;

    const [year, dowStr] = yd.split("__");
    const dow = Number(dowStr);

    // Como HOURS muda ao longo do tempo (09 entra só depois),
    // a tabela detalhada vai listar sempre as 6 horas,
    // mas a presença de 09 antes do marco tende a ser 0 (e isso é ok).
    const allHours = HOURS_WITH_09;

    for (const h of allHours) {
      const key = `${yd}__${h}`;
      const occ = (byYDowHourDays.get(key) || new Set()).size;
      const p = occ / days;
      const pct = (p * 100).toFixed(1) + "%";

      rows.push({
        year,
        dow,
        close_hour: h,
        days_in_group: days,
        occurrences: occ,
        pct,
        class: classify(p),
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.year.localeCompare(b.year) ||
      a.dow - b.dow ||
      a.close_hour.localeCompare(b.close_hour)
  );

  console.table(rows);

  // resumo compacto por ano+dow (CORE/OPCIONAL/RARA)
  const summary = [];
  for (const yd of ydKeys) {
    const [year, dowStr] = yd.split("__");
    const dow = Number(dowStr);
    const days = (byYDowDays.get(yd) || new Set()).size;

    // Aqui o correto é: listar CORE/OPCIONAL/RARA só dentro do conjunto de horas
    // válido para aquele período. Como o grupo yd mistura dias do ano inteiro,
    // usamos a regra do ano: se year >= 2024 inclui 09, senão não.
    const hours = year >= "2024" ? HOURS_WITH_09 : HOURS_BASE;

    const core = [];
    const opt = [];
    const rare = [];

    for (const h of hours) {
      const key = `${yd}__${h}`;
      const occ = (byYDowHourDays.get(key) || new Set()).size;
      const p = days ? occ / days : 0;

      const cls = classify(p);
      if (cls === "CORE") core.push(h);
      else if (cls === "OPCIONAL") opt.push(h);
      else rare.push(h);
    }

    summary.push({
      year,
      dow,
      days,
      CORE: core.join(","),
      OPCIONAL: opt.join(","),
      RARA: rare.join(","),
    });
  }

  summary.sort((a, b) => a.year.localeCompare(b.year) || a.dow - b.dow);

  console.log("\n=== RESUMO (por Ano + DOW) ===");
  console.table(summary);

  process.exit(0);
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
