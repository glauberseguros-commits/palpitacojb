"use strict";

const fs = require("fs");

const calendarFile =
  "backend/scripts/ptRioCalendar.js";

const importFile =
  "backend/scripts/autoImportToday.js";

const scheduleFile =
  "backend/data/slot_schedule/PT_RIO.json";

const testFile =
  "backend/scripts/ptRioSaturdayTransition.test.js";

function readText(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
}

function writeText(file, content) {
  fs.writeFileSync(
    file,
    String(content).replace(/\r\n/g, "\n"),
    "utf8"
  );
}

function replaceOnce(
  content,
  expected,
  replacement,
  label
) {
  const first = content.indexOf(expected);

  if (first < 0) {
    throw new Error(
      `Trecho não encontrado: ${label}`
    );
  }

  const second = content.indexOf(
    expected,
    first + expected.length
  );

  if (second >= 0) {
    throw new Error(
      `Trecho duplicado inesperadamente: ${label}`
    );
  }

  return (
    content.slice(0, first) +
    replacement +
    content.slice(first + expected.length)
  );
}

/* =========================
   ptRioCalendar.js
========================= */

let calendar = readText(calendarFile);

calendar = replaceOnce(
  calendar,
  'const PT_RIO_18 = "18:00";',
  `const PT_RIO_18 = "18:00";
const PT_RIO_19 = "19:00";
const PT_RIO_SATURDAY_19_START =
  "2026-07-18";`,
  "constantes PT Rio"
);

calendar = replaceOnce(
  calendar,
  `function uniqSorted(arr) {`,
  `function isPtRioSaturday19Expected(ymd) {
  const date = safeStr(ymd);

  return (
    isISODate(date) &&
    date >= PT_RIO_SATURDAY_19_START &&
    ymdDow(date) === 6
  );
}

function uniqSorted(arr) {`,
  "helper sábado 19h"
);

calendar = replaceOnce(
  calendar,
  `  const federal20Exists =
    normalizedOptions.federal20Exists === true;

  const result = {`,
  `  const federal20Exists =
    normalizedOptions.federal20Exists === true;

  const saturday19Expected =
    isPtRioSaturday19Expected(
      calendar?.date
    );

  const result = {`,
  "detecção da transição"
);

calendar = replaceOnce(
  calendar,
  `    federal20Exists,
    ptRio18Expected: true,
    operationalRulesApplied: [],`,
  `    federal20Exists,
    ptRio18Expected: !saturday19Expected,
    ptRioSaturday19Expected:
      saturday19Expected,
    operationalRulesApplied: [],`,
  "campos operacionais"
);

calendar = replaceOnce(
  calendar,
  `  if (!federal20Exists) {
    return result;
  }`,
  `  if (saturday19Expected) {
    result.core = uniqSorted([
      ...removeSlot(
        result.core,
        PT_RIO_18
      ),
      PT_RIO_19,
    ]);

    result.opcional = removeSlot(
      result.opcional,
      PT_RIO_18
    );

    result.rara = removeSlot(
      result.rara,
      PT_RIO_18
    );

    result.operationalRulesApplied.push(
      "SATURDAY_19_REPLACES_18_FROM_2026_07_18"
    );
  }

  if (!federal20Exists) {
    return result;
  }`,
  "aplicação da transição"
);

calendar = replaceOnce(
  calendar,
  `module.exports = {
  getPtRioSlotsByDate,
  isPtRio18Expected,
  normalizeHHMM,
  clearCache,
};`,
  `module.exports = {
  getPtRioSlotsByDate,
  isPtRio18Expected,
  isPtRioSaturday19Expected,
  normalizeHHMM,
  clearCache,
};`,
  "export do helper"
);

writeText(calendarFile, calendar);

/* =========================
   autoImportToday.js
========================= */

let autoImport = readText(importFile);

autoImport = replaceOnce(
  autoImport,
  `const { isPtRio18Expected } = require("./ptRioCalendar");`,
  `const {
  isPtRio18Expected,
  isPtRioSaturday19Expected,
} = require("./ptRioCalendar");`,
  "importação do calendário"
);

autoImport = replaceOnce(
  autoImport,
  `    { hour: "18:00", windowStart: "18:05", releaseAt: "18:29", windowEnd: "18:35" },
    // 21h: janela longa`,
  `    { hour: "18:00", windowStart: "18:05", releaseAt: "18:29", windowEnd: "18:35" },
    // Desde 18/07/2026, sábado: sorteio 19h, com publicação prevista a partir de 19h20.
    { hour: "19:00", windowStart: "19:20", releaseAt: "19:20", windowEnd: "19:50" },
    // 21h: janela longa`,
  "janela PT Rio 19h"
);

const functionStart = autoImport.indexOf(
  "function buildTodaySlotStatusMapPT_RIO("
);

const functionEnd = autoImport.indexOf(
  "\n/**\n * Grade Federal",
  functionStart
);

if (
  functionStart < 0 ||
  functionEnd < 0 ||
  functionEnd <= functionStart
) {
  throw new Error(
    "Não foi possível localizar a função de agenda PT Rio."
  );
}

const newStatusFunction = `function buildTodaySlotStatusMapPT_RIO(
  dateYMD,
  dow,
  { federal20Exists = false } = {}
) {
  const map = new Map();

  const isSunday = dow === 0;
  const isWed = dow === 3;
  const isSat = dow === 6;

  const saturday19Expected =
    isPtRioSaturday19Expected(
      dateYMD
    );

  for (const sched of SCHEDULE) {
    const hh = sched.hour;

    if (isSunday) {
      if (
        hh === "18:00" ||
        hh === "19:00" ||
        hh === "21:00"
      ) {
        map.set(hh, "OFF");
      } else {
        map.set(hh, "HARD");
      }

      continue;
    }

    if (
      isSat &&
      saturday19Expected
    ) {
      if (hh === "18:00") {
        map.set(hh, "OFF");
      } else if (hh === "19:00") {
        map.set(hh, "HARD");
      } else {
        map.set(hh, "HARD");
      }

      continue;
    }

    if (isWed || isSat) {
      if (hh === "18:00") {
        map.set(hh, "SOFT");
      } else if (hh === "19:00") {
        map.set(hh, "OFF");
      } else {
        map.set(hh, "HARD");
      }

      continue;
    }

    if (hh === "19:00") {
      map.set(hh, "OFF");
    } else {
      map.set(hh, "HARD");
    }
  }

  const ptRio18Expected =
    isPtRio18Expected(
      dateYMD,
      { federal20Exists }
    );

  if (!ptRio18Expected) {
    map.set("18:00", "OFF");

    const reason =
      saturday19Expected
        ? "SATURDAY_19_REPLACES_18"
        : "FEDERAL_20_SCHEDULED";

    logLine(
      \`[CAL] PT_RIO 18:00 OFF: \` +
        \`date=\${dateYMD} \` +
        \`reason=\${reason}\`,
      "INFO"
    );
  }

  const hard = [];
  const soft = [];
  const off = [];

  for (const sched of SCHEDULE) {
    const status =
      map.get(sched.hour) || "OFF";

    if (status === "HARD") {
      hard.push(sched.hour);
    } else if (status === "SOFT") {
      soft.push(sched.hour);
    } else {
      off.push(sched.hour);
    }
  }

  logLine(
    \`[CAL] PT_RIO resolved: \` +
      \`date=\${dateYMD} \` +
      \`dow=\${dow} \` +
      \`saturday19=\${saturday19Expected ? "1" : "0"} \` +
      \`federal20=\${federal20Exists ? "1" : "0"} \` +
      \`HARD=[\${hard.join(",")}] \` +
      \`SOFT=[\${soft.join(",")}] \` +
      \`OFF=[\${off.join(",")}]\`,
    "INFO"
  );

  return map;
}
`;

autoImport =
  autoImport.slice(0, functionStart) +
  newStatusFunction +
  autoImport.slice(functionEnd);

writeText(importFile, autoImport);

/* =========================
   slot_schedule/PT_RIO.json
========================= */

const schedule = JSON.parse(
  readText(scheduleFile)
);

if (!Array.isArray(schedule.ranges)) {
  throw new Error(
    "PT_RIO.json não possui ranges."
  );
}

const rangeIndex = schedule.ranges.findIndex(
  (range) =>
    range?.from === "2024-01-05" &&
    range?.to === "2099-12-31"
);

if (rangeIndex < 0) {
  throw new Error(
    "Faixa operacional atual não encontrada."
  );
}

const oldRange =
  schedule.ranges[rangeIndex];

const futureRange =
  JSON.parse(JSON.stringify(oldRange));

oldRange.to = "2026-07-17";

futureRange.from = "2026-07-18";
futureRange.to = "2099-12-31";

const saturday =
  futureRange?.dow?.["6"];

if (
  !saturday ||
  !Array.isArray(saturday.hard) ||
  !Array.isArray(saturday.soft)
) {
  throw new Error(
    "Agenda de sábado não encontrada."
  );
}

saturday.hard = Array.from(
  new Set(
    saturday.hard
      .filter((hour) => String(hour) !== "18")
      .concat("19")
  )
).sort(
  (a, b) => Number(a) - Number(b)
);

saturday.soft = saturday.soft.filter(
  (hour) => String(hour) !== "18"
);

schedule.ranges.splice(
  rangeIndex + 1,
  0,
  futureRange
);

writeText(
  scheduleFile,
  JSON.stringify(schedule, null, 2) + "\n"
);

/* =========================
   Teste novo
========================= */

const testContent = `"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getPtRioSlotsByDate,
  isPtRio18Expected,
  isPtRioSaturday19Expected,
  clearCache,
} = require("./ptRioCalendar");

function allSlots(calendar) {
  return [
    ...(calendar.core || []),
    ...(calendar.opcional || []),
    ...(calendar.rara || []),
  ];
}

clearCache();

const oldSaturday =
  getPtRioSlotsByDate("2026-07-11");

assert.equal(
  isPtRioSaturday19Expected("2026-07-11"),
  false
);

assert.equal(
  isPtRio18Expected("2026-07-11"),
  true
);

assert.ok(
  allSlots(oldSaturday).includes("18:00"),
  "Sábado histórico deve preservar 18h."
);

assert.ok(
  !allSlots(oldSaturday).includes("19:00"),
  "Sábado histórico não deve receber 19h."
);

const transitionSaturday =
  getPtRioSlotsByDate("2026-07-18");

assert.equal(
  isPtRioSaturday19Expected("2026-07-18"),
  true
);

assert.equal(
  isPtRio18Expected("2026-07-18"),
  false
);

assert.ok(
  transitionSaturday.core.includes("19:00"),
  "Novo sábado deve conter 19h HARD."
);

assert.ok(
  !allSlots(transitionSaturday).includes("18:00"),
  "Novo sábado não deve esperar 18h."
);

assert.ok(
  transitionSaturday.operationalRulesApplied.includes(
    "SATURDAY_19_REPLACES_18_FROM_2026_07_18"
  )
);

const nextSaturday =
  getPtRioSlotsByDate("2026-07-25");

assert.ok(
  nextSaturday.core.includes("19:00")
);

assert.ok(
  !allSlots(nextSaturday).includes("18:00")
);

const weekday =
  getPtRioSlotsByDate("2026-07-17");

assert.ok(
  allSlots(weekday).includes("18:00"),
  "Sexta-feira deve continuar com 18h."
);

assert.ok(
  !allSlots(weekday).includes("19:00"),
  "19h deve ser exclusivo do novo sábado."
);

const schedulePath = path.join(
  __dirname,
  "..",
  "data",
  "slot_schedule",
  "PT_RIO.json"
);

const schedule = JSON.parse(
  fs.readFileSync(schedulePath, "utf8")
);

const historicalRange =
  schedule.ranges.find(
    (range) =>
      range.from === "2024-01-05" &&
      range.to === "2026-07-17"
  );

const futureRange =
  schedule.ranges.find(
    (range) =>
      range.from === "2026-07-18" &&
      range.to === "2099-12-31"
  );

assert.ok(historicalRange);
assert.ok(futureRange);

assert.ok(
  historicalRange.dow["6"].soft.includes("18"),
  "Histórico precisa preservar 18h."
);

assert.ok(
  futureRange.dow["6"].hard.includes("19"),
  "Agenda futura precisa conter 19h."
);

assert.ok(
  !futureRange.dow["6"].hard.includes("18")
);

assert.ok(
  !futureRange.dow["6"].soft.includes("18")
);

const autoImportSource = fs.readFileSync(
  path.join(__dirname, "autoImportToday.js"),
  "utf8"
);

assert.match(
  autoImportSource,
  /hour:\\s*"19:00"[\\s\\S]{0,160}releaseAt:\\s*"19:20"/
);

assert.ok(
  autoImportSource.includes(
    "isPtRioSaturday19Expected"
  )
);

console.log(
  "OK: sábado PT Rio usa 19h desde 18/07/2026 e preserva o histórico de 18h."
);
`;

writeText(testFile, testContent);

console.log(
  "Correção PT Rio sábado 19h aplicada."
);