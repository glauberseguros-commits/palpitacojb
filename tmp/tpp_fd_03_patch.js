"use strict";

const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(content, pattern, replacement, label) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : pattern.flags + "g";

  const matches =
    content.match(new RegExp(pattern.source, flags)) || [];

  if (matches.length !== 1) {
    throw new Error(
      `${label}: esperado 1 bloco, encontrados ${matches.length}`
    );
  }

  return content.replace(pattern, replacement);
}

const calendarPath =
  "backend/scripts/federalCalendar.js";

const testPath =
  "backend/scripts/federalCalendar.test.js";

const importerPath =
  "backend/scripts/importKingApostas.js";

const autoPath =
  "backend/scripts/autoImportToday.js";

const schedulePath =
  "backend/data/slot_schedule/FEDERAL.json";

const calendarSource = `"use strict";

const FEDERAL_SUNDAY_START_YMD = "2026-07-19";

function isYmd(value) {
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(
    String(value || "").trim()
  );
}

function dowFromYmd(ymd) {
  if (!isYmd(ymd)) {
    return null;
  }

  const [year, month, day] =
    ymd.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay();
}

function getFederalScheduleForDate(date) {
  const ymd = String(date || "").trim();
  const dow = dowFromYmd(ymd);

  if (dow === null) {
    return [];
  }

  if (ymd >= FEDERAL_SUNDAY_START_YMD) {
    if (dow === 0) {
      return ["11:00"];
    }

    if (dow === 3) {
      return ["20:00"];
    }

    return [];
  }

  if (dow === 3 || dow === 6) {
    return ["20:00"];
  }

  return [];
}

function normalizeFederalRequestedSlot(value) {
  const raw = String(value || "").trim();

  if (raw === "11:00") {
    return "11:00";
  }

  if (raw === "19:00" || raw === "20:00") {
    return "20:00";
  }

  return raw;
}

function normalizeFederalSourceSlot({
  date,
  rawSlot,
} = {}) {
  const official =
    getFederalScheduleForDate(date);

  if (official.length === 1) {
    return official[0];
  }

  return normalizeFederalRequestedSlot(rawSlot);
}

module.exports = {
  FEDERAL_SUNDAY_START_YMD,
  getFederalScheduleForDate,
  normalizeFederalRequestedSlot,
  normalizeFederalSourceSlot,
};
`;

const testSource = `"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFederalScheduleForDate,
  normalizeFederalRequestedSlot,
  normalizeFederalSourceSlot,
} = require("./federalCalendar");

const scheduleConfig =
  require("../data/slot_schedule/FEDERAL.json");

test("Federal historica: quarta 15/07/2026 as 20h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-15"),
    ["20:00"]
  );
});

test("Federal historica: sabado 18/07/2026 as 20h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-18"),
    ["20:00"]
  );
});

test("Federal nova: domingo 19/07/2026 as 11h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-19"),
    ["11:00"]
  );
});

test("Federal nova: quarta 22/07/2026 as 20h", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-22"),
    ["20:00"]
  );
});

test("Federal nova: sabado 25/07/2026 sem sorteio", () => {
  assert.deepEqual(
    getFederalScheduleForDate("2026-07-25"),
    []
  );
});

test("Fonte 20h de domingo vira slot oficial 11h", () => {
  assert.equal(
    normalizeFederalSourceSlot({
      date: "2026-07-19",
      rawSlot: "20:00",
    }),
    "11:00"
  );
});

test("Fonte 20h de quarta permanece 20h", () => {
  assert.equal(
    normalizeFederalSourceSlot({
      date: "2026-07-22",
      rawSlot: "20:00",
    }),
    "20:00"
  );
});

test("Pedido 11h permanece 11h e probe 19h vira 20h", () => {
  assert.equal(
    normalizeFederalRequestedSlot("11:00"),
    "11:00"
  );

  assert.equal(
    normalizeFederalRequestedSlot("19:00"),
    "20:00"
  );
});

test("Arquivo de grade preserva historia e nova regra", () => {
  const ranges = scheduleConfig.ranges || [];

  const historical = ranges.find(
    (range) =>
      range.from === "2022-06-08" &&
      range.to === "2026-07-18"
  );

  const current = ranges.find(
    (range) =>
      range.from === "2026-07-19" &&
      range.to === null
  );

  assert.ok(historical);
  assert.ok(current);

  assert.deepEqual(
    historical.dow["3"].hard,
    ["20"]
  );

  assert.deepEqual(
    historical.dow["6"].hard,
    ["20"]
  );

  assert.deepEqual(
    current.dow["0"].hard,
    ["11"]
  );

  assert.deepEqual(
    current.dow["3"].hard,
    ["20"]
  );
});
`;

write(calendarPath, calendarSource);
write(testPath, testSource);

let importer = read(importerPath);

importer = replaceOnce(
  importer,
  /const axios = require\("axios"\);/,
  `const axios = require("axios");
const {
  normalizeFederalRequestedSlot,
  normalizeFederalSourceSlot,
} = require("./federalCalendar");`,
  "require federalCalendar no importador"
);

importer = replaceOnce(
  importer,
  /  \/\/ ✅ FEDERAL: slot de negócio é sempre 20:00, mas preserva o raw\n  if \(lk === "FEDERAL"\) \{\n    return \{ raw: raw0, slot: "20:00" \};\n  \}/,
  `  // Federal: 11h e o novo slot oficial de domingo.
  // A marcacao antecipada de 19h continua pertencendo ao slot 20h.
  if (lk === "FEDERAL") {
    return {
      raw: raw0,
      slot: normalizeFederalRequestedSlot(raw0),
    };
  }`,
  "normalizacao Federal antiga"
);

importer = replaceOnce(
  importer,
  /  const lk = String\(lotteryKey \|\| ""\)\.trim\(\)\.toUpperCase\(\);\n\n  if \(lk !== "NACIONAL"\) \{/,
  `  const lk = String(lotteryKey || "").trim().toUpperCase();

  if (lk === "FEDERAL") {
    return {
      raw: base.raw,
      slot: normalizeFederalSourceSlot({
        date: draw?.date || draw?.ymd || "",
        rawSlot: base.raw || base.slot,
      }),
    };
  }

  if (lk !== "NACIONAL") {`,
  "normalizacao do draw Federal"
);

importer = replaceOnce(
  importer,
  /  \/\/ FEDERAL: slot único 20:00 \(não fingir que o usuário pediu 20:00\)\n  if \(lk === "FEDERAL"\) \{\n    const slot = "20:00";\n    const note = requested !== slot \? `FEDERAL_slot_fixed\(\$\{requested\}->\$\{slot\}\)` : null;\n    return \{ requested, slot, note \};\n  \}/,
  `  if (lk === "FEDERAL") {
    const slot =
      normalizeFederalRequestedSlot(requested);

    const note =
      requested !== slot
        ? \`FEDERAL_slot_normalized(\${requested}->\${slot})\`
        : null;

    return { requested, slot, note };
  }`,
  "normalizacao do horario solicitado"
);

importer = replaceOnce(
  importer,
  /  FEDERAL: \[\],/,
  `  FEDERAL: [
    "9519c673-c3b8-4cb9-bcfe-9ddece3b03f3",
  ],`,
  "UUID Federal"
);

importer = replaceOnce(
  importer,
  /  \/\/ ✅ ID por SLOT\n  const drawId = `\$\{safeIdPart\(lotteryKey\)\}__\$\{date\}__\$\{safeIdPart\(\n    closeSlot\n  \)\}__\$\{lotteryIdPart\}`;/,
  `  // A fonte manteve o identificador 20h no domingo.
  // Reutilizamos o mesmo documento e corrigimos apenas o slot
  // operacional, preservando o resultado e todos os premios.
  const drawIdSlot =
    String(lotteryKey || "").trim().toUpperCase() === "FEDERAL" &&
    closeRaw
      ? normalizeCloseHourForLottery(
          closeRaw,
          "FEDERAL"
        ).slot
      : closeSlot;

  const drawId = \`\${safeIdPart(lotteryKey)}__\${date}__\${safeIdPart(
    drawIdSlot
  )}__\${lotteryIdPart}\`;`,
  "preservacao do documento Federal"
);

write(importerPath, importer);

let autoImport = read(autoPath);

autoImport = replaceOnce(
  autoImport,
  /const \{ runImport \} = require\("\.\/importKingApostas"\);/,
  `const { runImport } = require("./importKingApostas");
const {
  getFederalScheduleForDate,
} = require("./federalCalendar");`,
  "require federalCalendar na automacao"
);

autoImport = replaceOnce(
  autoImport,
  /  \/\/ FEDERAL\n  \/\/ - 19:00 = PROBE \(SOFT\)\n  \/\/ - 20:00 = HARD \(padrão\)\n  FEDERAL: \[\n    \{ hour: "19:00", windowStart: "18:50", releaseAt: "19:00", windowEnd: "19:20" \}, \/\/ PROBE \(SOFT\)\n    \{ hour: "20:00", windowStart: "19:50", releaseAt: "20:00", windowEnd: "20:20" \}, \/\/ HARD\n  \],/,
  `  // FEDERAL:
  // - domingo, desde 19/07/2026: 11h;
  // - quarta-feira: 20h;
  // - ate 18/07/2026, sabado tambem era 20h.
  FEDERAL: [
    { hour: "11:00", windowStart: "11:05", releaseAt: "11:05", windowEnd: "11:35" },
    { hour: "19:00", windowStart: "18:50", releaseAt: "19:00", windowEnd: "19:20" },
    { hour: "20:00", windowStart: "19:50", releaseAt: "20:00", windowEnd: "20:20" },
  ],`,
  "grade Federal da automacao"
);

autoImport = replaceOnce(
  autoImport,
  /\/\*\*\n \* FEDERAL \(robusto \/ independente de expectedHard do backend\):[\s\S]*?function buildTodaySlotStatusMapFEDERAL\(\{ dateYMD, dow, ds \}\) \{[\s\S]*?\n  return map;\n\}/,
  `/**
 * Grade Federal oficial com preservacao historica.
 * A fonte ainda publica domingo como Federal 20H,
 * mas o slot operacional desde 19/07/2026 e 11h.
 */
function buildTodaySlotStatusMapFEDERAL({
  dateYMD,
  dow,
  ds,
}) {
  const map = new Map();

  const official = new Set(
    getFederalScheduleForDate(dateYMD)
  );

  const expectedHard =
    Array.isArray(ds?.expectedHard)
      ? ds.expectedHard.map(String)
      : [];

  const expectedSoft =
    Array.isArray(ds?.expectedSoft)
      ? ds.expectedSoft.map(String)
      : [];

  for (const sched of SCHEDULE) {
    if (official.has(sched.hour)) {
      map.set(sched.hour, "HARD");
      continue;
    }

    if (
      sched.hour === "19:00" &&
      official.has("20:00")
    ) {
      map.set(sched.hour, "SOFT");
      continue;
    }

    map.set(sched.hour, "OFF");
  }

  logLine(
    \`[CAL] FEDERAL official: date=\${dateYMD} dow=\${dow} hard=[\${Array.from(
      official
    ).join(",")}] | backend expectedHard=[\${expectedHard.join(
      ","
    )}] expectedSoft=[\${expectedSoft.join(",")}]\`,
    "INFO"
  );

  return map;
}`,
  "calendario Federal da automacao"
);

autoImport = replaceOnce(
  autoImport,
  /slot\.naReason = LOTTERY === "FEDERAL" && dow === 0 \? "FEDERAL_DOMINGO_OFF" : "NAO_APLICA";/,
  `slot.naReason =
          LOTTERY === "FEDERAL"
            ? "FEDERAL_FORA_DA_GRADE"
            : "NAO_APLICA";`,
  "motivo de slot Federal OFF"
);

write(autoPath, autoImport);

const schedule =
  JSON.parse(read(schedulePath));

const ranges =
  Array.isArray(schedule.ranges)
    ? schedule.ranges
    : [];

const historical = ranges.find(
  (range) =>
    range.from === "2022-06-08" &&
    range.to === null
);

if (!historical) {
  throw new Error(
    "Faixa historica Federal principal nao encontrada."
  );
}

historical.to = "2026-07-18";

const existingCurrent = ranges.find(
  (range) =>
    range.from === "2026-07-19"
);

if (existingCurrent) {
  throw new Error(
    "Faixa Federal desde 19/07/2026 ja existe."
  );
}

ranges.push({
  from: "2026-07-19",
  to: null,
  dow: {
    "0": {
      hard: ["11"],
      soft: [],
    },
    "3": {
      hard: ["20"],
      soft: [],
    },
  },
});

schedule.ranges = ranges;

write(
  schedulePath,
  JSON.stringify(schedule, null, 2) + "\n"
);

console.log("Patch Federal aplicado com sucesso.");
