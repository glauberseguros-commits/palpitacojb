"use strict";

const fs = require("fs");
const path = require("path");

let _cache = null;

const PT_RIO_18 = "18:00";

function safeStr(v) {
  return String(v ?? "").trim();
}

function isISODate(ymd) {
  const str = safeStr(ymd);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }

  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));

  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function ymdDow(ymd) {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeHHMM(v) {
  const s = safeStr(v);

  if (!s) {
    return null;
  }

  const hhmmss = s.match(
    /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/
  );

  if (hhmmss) {
    const hh = Number(hhmmss[1]);
    const mm = Number(hhmmss[2]);
    const ss = Number(hhmmss[3]);

    if (
      !Number.isInteger(hh) ||
      !Number.isInteger(mm) ||
      !Number.isInteger(ss) ||
      hh < 0 ||
      hh > 23 ||
      mm < 0 ||
      mm > 59 ||
      ss < 0 ||
      ss > 59
    ) {
      return null;
    }

    return `${pad2(hh)}:${pad2(mm)}`;
  }

  const hhmm = s.match(/^(\d{1,2}):(\d{1,2})$/);

  if (hhmm) {
    const hh = Number(hhmm[1]);
    const mm = Number(hhmm[2]);

    if (
      !Number.isInteger(hh) ||
      !Number.isInteger(mm) ||
      hh < 0 ||
      hh > 23 ||
      mm < 0 ||
      mm > 59
    ) {
      return null;
    }

    return `${pad2(hh)}:${pad2(mm)}`;
  }

  const hourOnly = s.match(
    /^(\d{1,2})(?:\s*h(?:s)?)?$/i
  );

  if (hourOnly) {
    const hh = Number(hourOnly[1]);

    if (
      !Number.isInteger(hh) ||
      hh < 0 ||
      hh > 23
    ) {
      return null;
    }

    return `${pad2(hh)}:00`;
  }

  // Compatibilidade com o comportamento anterior:
  // aceita textos legados que contenham uma hora.
  const embeddedHour = s.match(/(\d{1,2})/);

  if (embeddedHour) {
    const hh = Number(embeddedHour[1]);

    if (
      !Number.isInteger(hh) ||
      hh < 0 ||
      hh > 23
    ) {
      return null;
    }

    return `${pad2(hh)}:00`;
  }

  return null;
}

function uniqSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function normalizeSlots(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }

  return uniqSorted(
    arr
      .map(normalizeHHMM)
      .filter(
        (slot) =>
          typeof slot === "string" &&
          /^\d{2}:\d{2}$/.test(slot)
      )
  );
}

function removeSlot(slots, slot) {
  return normalizeSlots(slots).filter(
    (value) => value !== slot
  );
}

function normalizeOptions(options) {
  if (typeof options === "boolean") {
    return {
      federal20Exists: options,
    };
  }

  if (!options || typeof options !== "object") {
    return {
      federal20Exists: false,
    };
  }

  return {
    federal20Exists:
      options.federal20Exists === true ||
      options.hasFederal20 === true ||
      options.hasFederal === true,
  };
}

function loadRules() {
  if (_cache) {
    return _cache;
  }

  const file = path.join(
    __dirname,
    "..",
    "data",
    "pt_rio_calendar_rules.json"
  );

  if (!fs.existsSync(file)) {
    _cache = {
      ok: false,
      error: "RULES_FILE_NOT_FOUND",
      rules: [],
      map: new Map(),
      file,
    };

    return _cache;
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(file, "utf8")
    );

    const rules = Array.isArray(parsed?.rules)
      ? parsed.rules
      : [];

    const map = new Map();

    for (const rule of rules) {
      const year = Number(rule?.year);
      const dow = Number(rule?.dow);

      if (
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2100 ||
        !Number.isInteger(dow) ||
        dow < 0 ||
        dow > 6
      ) {
        continue;
      }

      map.set(`${year}:${dow}`, {
        CORE: normalizeSlots(rule?.CORE),
        OPCIONAL: normalizeSlots(rule?.OPCIONAL),
        RARA: normalizeSlots(rule?.RARA),
      });
    }

    _cache = {
      ok: true,
      rules,
      map,
      file,
    };

    return _cache;
  } catch (error) {
    _cache = {
      ok: false,
      error: "RULES_FILE_INVALID_JSON",
      rules: [],
      map: new Map(),
      file,
      message: error?.message || String(error),
    };

    return _cache;
  }
}

function applyOperationalRules(calendar, options) {
  const normalizedOptions = normalizeOptions(options);
  const federal20Exists =
    normalizedOptions.federal20Exists === true;

  const result = {
    ...calendar,
    core: normalizeSlots(calendar?.core),
    opcional: normalizeSlots(calendar?.opcional),
    rara: normalizeSlots(calendar?.rara),
    federal20Exists,
    ptRio18Expected: true,
    operationalRulesApplied: [],
  };

  if (!federal20Exists) {
    return result;
  }

  result.core = removeSlot(result.core, PT_RIO_18);
  result.opcional = removeSlot(
    result.opcional,
    PT_RIO_18
  );
  result.rara = removeSlot(result.rara, PT_RIO_18);

  result.ptRio18Expected = false;
  result.operationalRulesApplied.push(
    "FEDERAL_20_REMOVES_PT_RIO_18"
  );

  return result;
}

function fallbackCalendar({
  date,
  year = null,
  dow = null,
  note = null,
}) {
  return {
    ok: true,
    source: "fallback",
    date,
    year,
    dow,
    core: ["11:00", "14:00", "16:00"],
    opcional: ["09:00"],
    rara: ["18:00", "21:00"],
    ...(note ? { note } : {}),
  };
}

/**
 * Fonte oficial do calendário operacional do PT_RIO.
 *
 * @param {string} ymd Data no formato YYYY-MM-DD.
 * @param {object|boolean} options
 * @param {boolean} options.federal20Exists
 *   true quando existir sorteio FEDERAL às 20:00
 *   no mesmo dia.
 */
function getPtRioSlotsByDate(ymd, options = {}) {
  const date = safeStr(ymd);

  if (!isISODate(date)) {
    return applyOperationalRules(
      fallbackCalendar({
        date,
        note: "INVALID_YMD_FORMAT",
      }),
      options
    );
  }

  const year = Number(date.slice(0, 4));
  const dow = ymdDow(date);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(dow)
  ) {
    return applyOperationalRules(
      fallbackCalendar({
        date,
        year: Number.isInteger(year)
          ? year
          : null,
        dow: Number.isInteger(dow)
          ? dow
          : null,
        note: "INVALID_YEAR_OR_DOW",
      }),
      options
    );
  }

  const loaded = loadRules();

  if (loaded.ok && loaded.map) {
    const rule = loaded.map.get(`${year}:${dow}`);

    if (rule) {
      return applyOperationalRules(
        {
          ok: true,
          source:
            "pt_rio_calendar_rules.json",
          date,
          year,
          dow,
          core: rule.CORE,
          opcional: rule.OPCIONAL,
          rara: rule.RARA,
        },
        options
      );
    }
  }

  return applyOperationalRules(
    fallbackCalendar({
      date,
      year,
      dow,
    }),
    options
  );
}

function isPtRio18Expected(
  ymd,
  options = {}
) {
  return (
    getPtRioSlotsByDate(ymd, options)
      .ptRio18Expected === true
  );
}

function clearCache() {
  _cache = null;
}

module.exports = {
  getPtRioSlotsByDate,
  isPtRio18Expected,
  normalizeHHMM,
  clearCache,
};

if (require.main === module) {
  const argv = process.argv.slice(2);

  const pick = (key) => {
    const index = argv.indexOf(key);

    if (
      index >= 0 &&
      argv[index + 1]
    ) {
      return argv[index + 1];
    }

    return null;
  };

  const ymd =
    pick("--date") ||
    argv.find((value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(
        safeStr(value)
      )
    ) ||
    null;

  const federal20Exists =
    argv.includes("--federal20") ||
    argv.includes("--has-federal20");

  if (!ymd) {
    console.log(
      "usage: node backend/scripts/ptRioCalendar.js --date YYYY-MM-DD [--federal20]"
    );
    process.exit(2);
  }

  try {
    const result = getPtRioSlotsByDate(
      ymd,
      { federal20Exists }
    );

    console.log(
      JSON.stringify(result, null, 2)
    );

    process.exit(0);
  } catch (error) {
    console.error(
      error?.stack || error
    );

    process.exit(1);
  }
}
