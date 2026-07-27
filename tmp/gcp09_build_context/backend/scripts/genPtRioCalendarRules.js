"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

(async () => {
  const lot = "PT_RIO";
  const HOURS = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];

  const CORE_MIN = 0.90;
  const OPT_MIN = 0.50;

  // Para não poluir regra com amostra pequena (ex.: ano com poucos dias)
  const MIN_DAYS_PER_GROUP = 20;

  // Ano corrente (UTC)
  const CURRENT_YEAR = new Date().getUTCFullYear();

  // Se quiser permitir "estatística parcial" do ano corrente (sem herança),
  // ajuste este valor. Recomendo manter baixo, mas NÃO 1.
  const MIN_DAYS_CURRENT_YEAR = 3;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isISODateStrict(s) {
    const str = String(s || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }

  function isHHMM(s) {
    return /^\d{2}:\d{2}$/.test(String(s || "").trim());
  }

  function normalizeHHMM(value) {
    const s = String(value ?? "").trim();
    if (!s) return "";

    if (isHHMM(s)) return s;

    // "10h" => "10:00"
    const m1 = s.match(/^(\d{1,2})h$/i);
    if (m1) return `${pad2(m1[1])}:00`;

    // "10" => "10:00"
    const m2 = s.match(/^(\d{1,2})$/);
    if (m2) return `${pad2(m2[1])}:00`;

    // "10:9" => "10:09"
    const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (m3) return `${pad2(m3[1])}:${pad2(m3[2])}`;

    return "";
  }

  function normalizeYMD(v) {
    const s = String(v ?? "").trim();
    if (isISODateStrict(s)) return s;
    return "";
  }

  function dowOf(ymd) {
    // 0=Dom..6=Sáb
    return new Date(String(ymd) + "T00:00:00Z").getUTCDay();
  }

  const db = getDb();

  // SELECT reduz leitura/custo/memória (traz só o necessário)
  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", lot)
    .select("ymd", "date", "close_hour")
    .get();

  const byYDowDays = new Map(); // yd -> Set(ymd)
  const byYDowHourDays = new Map(); // yd__HH:MM -> Set(ymd)

  snap.forEach((doc) => {
    const d = doc.data() || {};

    // usa ymd preferencialmente, com fallback em date
    const ymd = normalizeYMD(d.ymd) || normalizeYMD(d.date);
    const h = normalizeHHMM(d.close_hour);

    if (!ymd || !h) return;

    // filtra apenas horários do calendário
    if (!HOURS.includes(h)) {
      // mesmo assim conta o "dia" para o grupo (ano+dow), pois o dia existiu
      const y = ymd.slice(0, 4);
      const dow = String(dowOf(ymd));
      const yd = y + "__" + dow;

      if (!byYDowDays.has(yd)) byYDowDays.set(yd, new Set());
      byYDowDays.get(yd).add(ymd);
      return;
    }

    const y = ymd.slice(0, 4);
    const dow = String(dowOf(ymd));
    const yd = y + "__" + dow;

    if (!byYDowDays.has(yd)) byYDowDays.set(yd, new Set());
    byYDowDays.get(yd).add(ymd);

    const key = yd + "__" + h;
    if (!byYDowHourDays.has(key)) byYDowHourDays.set(key, new Set());
    byYDowHourDays.get(key).add(ymd);
  });

  const ydKeys = [...byYDowDays.keys()].sort();
  const rulesStrong = []; // regras com amostra suficiente
  const rules = []; // finais (fortes + parcial/herdada pro ano corrente)

  // 1) Regras fortes (somente quando days >= MIN_DAYS_PER_GROUP)
  for (const yd of ydKeys) {
    const days = (byYDowDays.get(yd) || new Set()).size;
    if (!days || days < MIN_DAYS_PER_GROUP) continue;

    const [year, dowStr] = yd.split("__");
    const dow = Number(dowStr);

    const core = [];
    const optional = [];
    const rare = [];

    for (const h of HOURS) {
      const key = yd + "__" + h;
      const occ = (byYDowHourDays.get(key) || new Set()).size;
      const p = days ? occ / days : 0;

      if (p >= CORE_MIN) core.push(h);
      else if (p >= OPT_MIN) optional.push(h);
      else rare.push(h);
    }

    rulesStrong.push({
      lottery_key: lot,
      year: Number(year),
      dow,
      days,
      CORE: core,
      OPCIONAL: optional,
      RARA: rare,
      thresholds: { CORE_MIN, OPT_MIN, MIN_DAYS_PER_GROUP },
      generatedAt: new Date().toISOString(),
    });
  }

  // índice: por dow, última regra forte (ano mais recente)
  const lastStrongByDow = new Map();
  for (const r of rulesStrong) {
    const prev = lastStrongByDow.get(r.dow);
    if (!prev || Number(r.year) > Number(prev.year)) lastStrongByDow.set(r.dow, r);
  }

  // 2) Empilha regras fortes
  for (const r of rulesStrong) rules.push(r);

  // 3) Regras do ano corrente (parcial ou herdada)
  for (let dow = 0; dow <= 6; dow++) {
    const yd = `${CURRENT_YEAR}__${dow}`;
    const days = (byYDowDays.get(yd) || new Set()).size;

    const alreadyHas = rules.some(
      (x) => Number(x.year) === CURRENT_YEAR && Number(x.dow) === dow
    );
    if (alreadyHas) continue;

    // Se tiver dias suficientes, calcula parcial do ano corrente
    if (days >= MIN_DAYS_CURRENT_YEAR) {
      const core = [];
      const optional = [];
      const rare = [];

      for (const h of HOURS) {
        const key = yd + "__" + h;
        const occ = (byYDowHourDays.get(key) || new Set()).size;
        const p = days ? occ / days : 0;

        if (p >= CORE_MIN) core.push(h);
        else if (p >= OPT_MIN) optional.push(h);
        else rare.push(h);
      }

      rules.push({
        lottery_key: lot,
        year: CURRENT_YEAR,
        dow,
        days,
        CORE: core,
        OPCIONAL: optional,
        RARA: rare,
        thresholds: {
          CORE_MIN,
          OPT_MIN,
          MIN_DAYS_PER_GROUP,
          MIN_DAYS_CURRENT_YEAR,
        },
        generatedAt: new Date().toISOString(),
        note: `PARTIAL_CURRENT_YEAR (days>=${MIN_DAYS_CURRENT_YEAR})`,
      });
      continue;
    }

    // Herança do último ano forte do mesmo dow
    const base = lastStrongByDow.get(dow);
    if (base) {
      rules.push({
        lottery_key: lot,
        year: CURRENT_YEAR,
        dow,
        days,
        CORE: Array.isArray(base.CORE) ? [...base.CORE] : [],
        OPCIONAL: Array.isArray(base.OPCIONAL) ? [...base.OPCIONAL] : [],
        RARA: Array.isArray(base.RARA) ? [...base.RARA] : [],
        thresholds: {
          CORE_MIN,
          OPT_MIN,
          MIN_DAYS_PER_GROUP,
          MIN_DAYS_CURRENT_YEAR,
        },
        generatedAt: new Date().toISOString(),
        inheritedFromYear: Number(base.year),
        note: `INHERITED_FROM_${base.year} (insufficient days=${days})`,
      });
    }
  }

  rules.sort((a, b) => a.year - b.year || a.dow - b.dow);

  const outPath = path.join(__dirname, "..", "data", "pt_rio_calendar_rules.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ ok: true, lot, rules }, null, 2), "utf8");

  console.log("✅ wrote:", outPath);
  console.log("rules:", rules.length);
  console.log(
    "years:",
    [...new Set(rules.map((r) => r.year))].sort((x, y) => x - y)
  );

  process.exit(0);
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});