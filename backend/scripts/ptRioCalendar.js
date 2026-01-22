"use strict";

const fs = require("fs");
const path = require("path");

let _cache = null;

function safeStr(v) {
  return String(v ?? "").trim();
}

function ymdDow(ymd) {
  // 0=Dom..6=Sáb (UTC) — consistente com seu gerador
  return new Date(String(ymd) + "T00:00:00Z").getUTCDay();
}

function loadRules() {
  if (_cache) return _cache;

  const p = path.join(__dirname, "..", "data", "pt_rio_calendar_rules.json");
  if (!fs.existsSync(p)) {
    _cache = { ok: false, error: "RULES_FILE_NOT_FOUND", rules: [] };
    return _cache;
  }

  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const rules = Array.isArray(j?.rules) ? j.rules : [];
  _cache = { ok: true, rules };
  return _cache;
}

/**
 * Retorna classificação CORE/OPCIONAL/RARA para a data.
 * - Usa ano+dow (regra estatística) gerada do seu Firestore.
 * - Se não houver regra, faz fallback conservador:
 *   - Core mínimo: 11,14,16
 *   - Opcional: 09
 *   - Rara: 18,21
 */
function getPtRioSlotsByDate(ymd) {
  const date = safeStr(ymd);
  const year = Number(date.slice(0, 4));
  const dow = ymdDow(date);

  const { ok, rules } = loadRules();
  if (ok) {
    const r = rules.find((x) => Number(x.year) === year && Number(x.dow) === dow);
    if (r) {
      return {
        ok: true,
        source: "pt_rio_calendar_rules.json",
        date,
        year,
        dow,
        core: Array.isArray(r.CORE) ? r.CORE : [],
        opcional: Array.isArray(r.OPCIONAL) ? r.OPCIONAL : [],
        rara: Array.isArray(r.RARA) ? r.RARA : [],
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
