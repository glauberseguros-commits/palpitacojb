"use strict";

const fs = require("fs");
const path = require("path");

let _cache = null;

function safeStr(v) {
  return String(v ?? "").trim();
}

function isISODate(ymd) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || "").trim());
}

function ymdDow(ymd) {
  // 0=Dom..6=Sáb (UTC) — consistente com seu gerador
  // Requer YYYY-MM-DD válido
  return new Date(String(ymd) + "T00:00:00Z").getUTCDay();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Normaliza horários para HH:MM (robusto)
 * Aceita: "11", "11h", "11hs", "11:09", "11:9", "11:09:00", etc.
 * Retorna "HH:MM" ou null
 */
function normalizeHHMM(v) {
  const s = safeStr(v);
  if (!s) return null;

  // já HH:MM
  const m0 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m0) {
    const hh = Number(m0[1]);
    const mm = Number(m0[2]);
    if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
    if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  // HH:MM:SS
  const m1 = s.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (m1) {
    const hh = Number(m1[1]);
    const mm = Number(m1[2]);
    if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
    if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  // "11h" / "11hs" / "11"
  const m2 = s.match(/^(\d{1,2})(?:\s*h(?:s)?)?$/i);
  if (m2) {
    const hh = Number(m2[1]);
    if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
    return `${pad2(hh)}:00`;
  }

  // fallback: pega o primeiro número como hora
  const m3 = s.match(/(\d{1,2})/);
  if (m3) {
    const hh = Number(m3[1]);
    if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
    return `${pad2(hh)}:00`;
  }

  return null;
}

function uniqSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function normalizeSlots(arr) {
  if (!Array.isArray(arr)) return [];
  return uniqSorted(
    arr
      .map((x) => normalizeHHMM(x))
      .filter((x) => typeof x === "string" && /^\d{2}:\d{2}$/.test(x))
  );
}

function loadRules() {
  if (_cache) return _cache;

  const p = path.join(__dirname, "..", "data", "pt_rio_calendar_rules.json");
  if (!fs.existsSync(p)) {
    _cache = {
      ok: false,
      error: "RULES_FILE_NOT_FOUND",
      rules: [],
      map: new Map(),
      file: p,
    };
    return _cache;
  }

  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const rules = Array.isArray(j?.rules) ? j.rules : [];

    // Index: "year:dow" -> {CORE, OPCIONAL, RARA}
    const map = new Map();
    for (const r of rules) {
      const year = Number(r?.year);
      const dow = Number(r?.dow);
      if (!Number.isFinite(year) || year < 2000 || year > 2100) continue;
      if (!Number.isFinite(dow) || dow < 0 || dow > 6) continue;

      map.set(`${year}:${dow}`, {
        CORE: normalizeSlots(r?.CORE),
        OPCIONAL: normalizeSlots(r?.OPCIONAL),
        RARA: normalizeSlots(r?.RARA),
      });
    }

    _cache = { ok: true, rules, map, file: p };
    return _cache;
  } catch (e) {
    _cache = {
      ok: false,
      error: "RULES_FILE_INVALID_JSON",
      rules: [],
      map: new Map(),
      file: p,
      message: e?.message || String(e),
    };
    return _cache;
  }
}

/**
 * Retorna classificação CORE/OPCIONAL/RARA para a data.
 * - Usa ano+dow (regra estatística) gerada do seu Firestore.
 * - Se não houver regra (ou data inválida), faz fallback conservador:
 *   - Core mínimo: 11,14,16
 *   - Opcional: 09
 *   - Rara: 18,21
 */
function getPtRioSlotsByDate(ymd) {
  const date = safeStr(ymd);

  // Se data inválida, não “chuta” dow/ano — cai no fallback, mas deixa explícito.
  if (!isISODate(date)) {
    return {
      ok: true,
      source: "fallback",
      date,
      year: null,
      dow: null,
      core: ["11:00", "14:00", "16:00"],
      opcional: ["09:00"],
      rara: ["18:00", "21:00"],
      note: "INVALID_YMD_FORMAT",
    };
  }

  const year = Number(date.slice(0, 4));
  const dow = ymdDow(date);

  if (!Number.isFinite(year) || !Number.isFinite(dow)) {
    return {
      ok: true,
      source: "fallback",
      date,
      year: Number.isFinite(year) ? year : null,
      dow: Number.isFinite(dow) ? dow : null,
      core: ["11:00", "14:00", "16:00"],
      opcional: ["09:00"],
      rara: ["18:00", "21:00"],
      note: "INVALID_YEAR_OR_DOW",
    };
  }

  const loaded = loadRules();
  if (loaded.ok && loaded.map) {
    const hit = loaded.map.get(`${year}:${dow}`);
    if (hit) {
      return {
        ok: true,
        source: "pt_rio_calendar_rules.json",
        date,
        year,
        dow,
        core: hit.CORE,
        opcional: hit.OPCIONAL,
        rara: hit.RARA,
      };
    }
  }

  return {
    ok: true,
    source: "fallback",
    date,
    year,
    dow,
    core: ["11:00", "14:00", "16:00"],
    opcional: ["09:00"],
    rara: ["18:00", "21:00"],
  };
}

module.exports = { getPtRioSlotsByDate };

/**
 * CLI helper:
 *   node backend/scripts/ptRioCalendar.js --date 2026-02-09
 *   node backend/scripts/ptRioCalendar.js 2026-02-09
 */
if (require.main === module) {
  const argv = process.argv.slice(2);
  const pick = (k) => {
    const i = argv.indexOf(k);
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
    return null;
  };
  const ymd = pick("--date") || argv.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ""))) || null;

  if (!ymd) {
    console.log("usage: node backend/scripts/ptRioCalendar.js --date YYYY-MM-DD");
    process.exit(2);
  }

  try {
    const out = module.exports.getPtRioSlotsByDate(ymd);
    console.log(JSON.stringify({ date: ymd, ...out }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  }
}
