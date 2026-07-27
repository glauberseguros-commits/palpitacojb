const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const HARNESS = path.resolve(
  ROOT,
  "backend/scripts/backtestTop3AblationExperimental.js"
);

const OFFICIAL_CANDIDATES = [
  path.resolve(ROOT, "backend/scripts/backtestTop3Official.js"),
  path.resolve(ROOT, "backend/scripts/backtestTop3.js"),
];

const VALIDATION_JSON = path.resolve(
  ROOT,
  "tmp/tpp01_04_harness_validation.json"
);

const OUTPUT_JSON = path.resolve(
  ROOT,
  "tmp/tpp03_01_case_payload_mapping.json"
);

const OUTPUT_TXT = path.resolve(
  ROOT,
  "tmp/tpp03_01_case_payload_mapping.txt"
);

function fail(message) {
  throw new Error(message);
}

function readText(file) {
  if (!fs.existsSync(file)) {
    fail(`Arquivo não encontrado: ${file}`);
  }

  return fs.readFileSync(file, "utf8");
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function valueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function summarizeValue(value, depth = 0, maxDepth = 6) {
  const type = valueType(value);

  if (depth >= maxDepth) {
    return {
      type,
      truncated: true,
    };
  }

  if (Array.isArray(value)) {
    const first = value.length > 0 ? value[0] : undefined;

    return {
      type: "array",
      length: value.length,
      firstItem:
        first === undefined
          ? null
          : summarizeValue(first, depth + 1, maxDepth),
    };
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const children = {};

    for (const [key, child] of entries) {
      children[key] = summarizeValue(
        child,
        depth + 1,
        maxDepth
      );
    }

    return {
      type: "object",
      keys: Object.keys(value),
      children,
    };
  }

  return {
    type,
    sample:
      typeof value === "string"
        ? value.slice(0, 160)
        : value,
  };
}

function walkArrays(value, currentPath = "$", found = []) {
  if (Array.isArray(value)) {
    found.push({
      path: currentPath,
      length: value.length,
      firstItemType:
        value.length > 0
          ? valueType(value[0])
          : "empty",
      firstItemKeys:
        value.length > 0 && isPlainObject(value[0])
          ? Object.keys(value[0])
          : [],
    });

    value.forEach((item, index) => {
      if (
        index < 2 &&
        (Array.isArray(item) || isPlainObject(item))
      ) {
        walkArrays(
          item,
          `${currentPath}[${index}]`,
          found
        );
      }
    });

    return found;
  }

  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) || isPlainObject(child)) {
        walkArrays(
          child,
          `${currentPath}.${key}`,
          found
        );
      }
    }
  }

  return found;
}

function findRelevantLines(source, terms) {
  const lines = source.split(/\r?\n/);
  const matches = [];

  lines.forEach((line, index) => {
    const normalized = line.toLowerCase();

    const matchedTerms = terms.filter((term) =>
      normalized.includes(term.toLowerCase())
    );

    if (matchedTerms.length > 0) {
      matches.push({
        lineNumber: index + 1,
        terms: matchedTerms,
        text: line,
      });
    }
  });

  return matches;
}

function extractRequireLines(source) {
  return source
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      text: line,
    }))
    .filter(({ text }) =>
      /\brequire\s*\(|\bimport\s+/.test(text)
    );
}

function extractExportLines(source) {
  return source
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      text: line,
    }))
    .filter(({ text }) =>
      /module\.exports|exports\.|export\s+/.test(text)
    );
}

const official = OFFICIAL_CANDIDATES.find((file) =>
  fs.existsSync(file)
);

if (!official) {
  fail(
    "Nenhum script oficial de backtest foi encontrado."
  );
}

const harnessSource = readText(HARNESS);
const officialSource = readText(official);

let validation;

try {
  validation = JSON.parse(
    readText(VALIDATION_JSON)
  );
} catch (error) {
  fail(
    `Falha ao interpretar ${VALIDATION_JSON}: ${error.message}`
  );
}

const terms = [
  "case",
  "cases",
  "detail",
  "details",
  "record",
  "records",
  "result",
  "results",
  "prediction",
  "predictions",
  "ranking",
  "rankings",
  "top1",
  "top3",
  "expected",
  "actual",
  "target",
  "hit",
  "hits",
  "evaluated",
  "global",
  "items",
  "samples",
  "rows",
  "draw",
  "draws",
  "date",
  "hour",
  "lottery",
  "return",
  "runOfficialBacktest",
];

const payloadArrays = walkArrays(validation);

const candidateCaseArrays = payloadArrays.filter((item) => {
  if (item.length >= 100) {
    return true;
  }

  const pathText = item.path.toLowerCase();

  return [
    "case",
    "detail",
    "record",
    "result",
    "prediction",
    "ranking",
    "sample",
    "row",
    "draw",
    "item",
  ].some((term) => pathText.includes(term));
});

const report = {
  generatedAt: new Date().toISOString(),

  files: {
    harness: HARNESS,
    official,
    validationJson: VALIDATION_JSON,
  },

  validationPayload: {
    topLevelKeys: Object.keys(validation),
    structure: summarizeValue(validation),
    arrays: payloadArrays,
    candidateCaseArrays,
  },

  harnessSource: {
    requiresAndImports: extractRequireLines(harnessSource),
    exports: extractExportLines(harnessSource),
    relevantLines: findRelevantLines(
      harnessSource,
      terms
    ),
  },

  officialSource: {
    requiresAndImports: extractRequireLines(officialSource),
    exports: extractExportLines(officialSource),
    relevantLines: findRelevantLines(
      officialSource,
      terms
    ),
  },

  conclusion: {
    hasCandidateCaseArray:
      candidateCaseArrays.length > 0,

    nextAction:
      candidateCaseArrays.length > 0
        ? "O payload já contém registros candidatos. Criar comparador A00/A01/A02 por chave de caso."
        : "O payload atual parece conter apenas métricas agregadas. Ampliar a telemetria experimental para preservar os casos, rankings e acertos.",
  },
};

fs.writeFileSync(
  OUTPUT_JSON,
  JSON.stringify(report, null, 2),
  "utf8"
);

const text = [];

text.push(
  "========================================================================================================================"
);

text.push(
  "TPP-03.01 - MAPEAMENTO DO PAYLOAD CASO A CASO"
);

text.push(
  "========================================================================================================================"
);

text.push("");
text.push(`Harness: ${HARNESS}`);
text.push(`Backtest oficial: ${official}`);
text.push(`JSON analisado: ${VALIDATION_JSON}`);

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("CHAVES DO JSON DE VALIDAÇÃO");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

for (const key of Object.keys(validation)) {
  text.push(`- ${key}: ${valueType(validation[key])}`);
}

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("ARRAYS LOCALIZADOS NO PAYLOAD");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

if (payloadArrays.length === 0) {
  text.push("Nenhum array localizado.");
} else {
  for (const item of payloadArrays) {
    text.push(
      [
        `Caminho: ${item.path}`,
        `Tamanho: ${item.length}`,
        `Tipo inicial: ${item.firstItemType}`,
        `Chaves iniciais: ${
          item.firstItemKeys.length > 0
            ? item.firstItemKeys.join(", ")
            : "(nenhuma)"
        }`,
      ].join(" | ")
    );
  }
}

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("CANDIDATOS A REGISTROS CASO A CASO");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

if (candidateCaseArrays.length === 0) {
  text.push(
    "Nenhum array candidato foi confirmado no JSON atual."
  );
} else {
  for (const item of candidateCaseArrays) {
    text.push(
      `${item.path} | tamanho=${item.length} | chaves=${item.firstItemKeys.join(", ")}`
    );
  }
}

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("IMPORTS/REQUIRES DO HARNESS");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

for (const item of report.harnessSource.requiresAndImports) {
  text.push(
    `${String(item.lineNumber).padStart(5, " ")} | ${item.text}`
  );
}

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("EXPORTS DO BACKTEST OFICIAL");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

if (report.officialSource.exports.length === 0) {
  text.push("Nenhum export explícito localizado.");
} else {
  for (const item of report.officialSource.exports) {
    text.push(
      `${String(item.lineNumber).padStart(5, " ")} | ${item.text}`
    );
  }
}

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("LINHAS RELEVANTES DO HARNESS");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

for (const item of report.harnessSource.relevantLines) {
  text.push(
    `${String(item.lineNumber).padStart(5, " ")} | ${item.text}`
  );
}

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("LINHAS RELEVANTES DO BACKTEST OFICIAL");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

for (const item of report.officialSource.relevantLines) {
  text.push(
    `${String(item.lineNumber).padStart(5, " ")} | ${item.text}`
  );
}

text.push("");
text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push("CONCLUSÃO AUTOMÁTICA");

text.push(
  "------------------------------------------------------------------------------------------------------------------------"
);

text.push(
  `Há array candidato a casos individuais: ${
    report.conclusion.hasCandidateCaseArray
      ? "SIM"
      : "NÃO"
  }`
);

text.push(report.conclusion.nextAction);

text.push("");
text.push(
  "Nenhuma alteração em produção."
);

text.push("Nenhum commit.");
text.push("Nenhum deploy.");

text.push(
  "========================================================================================================================"
);

fs.writeFileSync(
  OUTPUT_TXT,
  text.join("\n"),
  "utf8"
);

console.log(text.join("\n"));
console.log("");
console.log(`JSON: ${OUTPUT_JSON}`);
console.log(`TXT : ${OUTPUT_TXT}`);
