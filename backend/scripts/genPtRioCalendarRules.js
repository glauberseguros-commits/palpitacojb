"use strict";

const fs = require("fs");
const path = require("path");
const { db } = require("../service/firebaseAdmin");

(async () => {
  const lot = "PT_RIO";
  const HOURS = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];

  const CORE_MIN = 0.90;
  const OPT_MIN = 0.50;

  // Para não poluir regra com amostra pequena (ex.: 2026 com poucos dias)
  const MIN_DAYS_PER_GROUP = 20;

  // ✅ Ano corrente: permite regra "operacional" (herdada) se tiver pouca amostra
  const CURRENT_YEAR = new Date().getUTCFullYear();

  // ✅ Se quiser permitir "estatística parcial" do ano corrente (sem herança),
  // ajuste este valor. Eu recomendo manter baixo, mas NÃO 1.
  const MIN_DAYS_CURRENT_YEAR = 3;

  const snap = await db.collection("draws").where("lottery_key", "==", lot).get();

  const byYDowDays = new Map(); // yd -> Set(dates)
  const byYDowHourDays = new Map(); // yd__HH:MM -> Set(dates)

  function dowOf(ymd) {
    return new Date(String(ymd) + "T00:00:00Z").getUTCDay(); // 0=Dom..6=Sáb
  }

  snap.forEach((doc) => {
    const d = doc.data() || {};
    const ymd = String(d.date || "").trim();
    const h = String(d.close_hour || "").trim();

    if (!ymd || ymd.length < 10 || !h) return;

    const y = ymd.slice(0, 4);
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
  const rulesStrong = []; // regras geradas com amostra suficiente
  const rules = []; // regras finais (fortes + herdadas para ano corrente)

  // 1) Gera regras fortes (somente quando days >= MIN_DAYS_PER_GROUP)
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

  // índice: por dow, últimas regras fortes (ano mais recente)
  const lastStrongByDow = new Map();
  for (const r of rulesStrong) {
    const prev = lastStrongByDow.get(r.dow);
    if (!prev || Number(r.year) > Number(prev.year)) lastStrongByDow.set(r.dow, r);
  }

  // 2) Empilha todas as regras fortes
  for (const r of rulesStrong) rules.push(r);

  // 3) Gera regras do ano corrente:
  //    - Se já existir forte para CURRENT_YEAR+dow, ok.
  //    - Se days do CURRENT_YEAR+dow >= MIN_DAYS_CURRENT_YEAR, pode gerar "parcial" (opcional).
  //    - Caso contrário, herda do último ano forte do mesmo dow.
  for (let dow = 0; dow <= 6; dow++) {
    const yd = `${CURRENT_YEAR}__${dow}`;
    const days = (byYDowDays.get(yd) || new Set()).size;

    const alreadyHas = rules.some((x) => Number(x.year) === CURRENT_YEAR && Number(x.dow) === dow);
    if (alreadyHas) continue;

    // Se tiver dias suficientes para um cálculo parcial (ano corrente), calcula.
    // Se não tiver, herda de lastStrongByDow.
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

    // Herança (recomendado): copia do último ano forte do mesmo dow
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
