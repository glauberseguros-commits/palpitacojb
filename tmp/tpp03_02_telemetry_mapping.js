const path = require("path");

const officialPath = path.resolve(
  __dirname,
  "../backend/scripts/backtestTop3Official.js"
);

const {
  runOfficialBacktest,
} = require(officialPath);

function inspect(
  obj,
  prefix = "",
  depth = 0,
  maxDepth = 6
) {
  if (
    depth > maxDepth ||
    obj == null
  ) {
    return;
  }

  if (Array.isArray(obj)) {
    console.log(
      `${prefix}[ARRAY length=${obj.length}]`
    );

    if (
      obj.length > 0 &&
      obj[0] &&
      typeof obj[0] === "object"
    ) {
      console.log(
        `${prefix}[0] keys: ${Object.keys(obj[0]).join(", ")}`
      );
    }

    return;
  }

  if (typeof obj !== "object") {
    console.log(
      `${prefix} = ${typeof obj}`
    );

    return;
  }

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (Array.isArray(value)) {
      console.log(
        `${prefix}${key}: ARRAY (${value.length})`
      );

      if (
        value.length > 0 &&
        value[0] &&
        typeof value[0] === "object"
      ) {
        console.log(
          `${prefix}${key}[0] => ${Object.keys(value[0]).join(", ")}`
        );
      }

      continue;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      console.log(
        `${prefix}${key}: OBJECT`
      );

      inspect(
        value,
        `${prefix}${key}.`,
        depth + 1,
        maxDepth
      );

      continue;
    }

    console.log(
      `${prefix}${key}: ${typeof value}`
    );
  }
}

(async () => {
  const result = await runOfficialBacktest({
    lotteryKey: "PT_RIO",
    limit: 5,
    minHistory: 100,
  });

  console.log(
    "=================================================="
  );

  console.log("MÓDULO CARREGADO");

  console.log(
    "=================================================="
  );

  console.log(`Arquivo: ${officialPath}`);

  console.log("");

  console.log(
    "=================================================="
  );

  console.log("TOP LEVEL");

  console.log(
    "=================================================="
  );

  inspect(result);

  console.log("");

  console.log(
    "=================================================="
  );

  console.log("TELEMETRIA");

  console.log(
    "=================================================="
  );

  if (result.telemetry) {
    inspect(result.telemetry);
  } else {
    console.log(
      "result.telemetry inexistente"
    );
  }

  console.log("");

  console.log(
    "=================================================="
  );

  console.log("CASOS INDIVIDUAIS");

  console.log(
    "=================================================="
  );

  const cases =
    result?.telemetry?.cases ||
    result?.telemetryCases ||
    result?.cases ||
    [];

  console.log(
    `Quantidade de casos: ${cases.length}`
  );

  if (cases.length > 0) {
    console.log(
      `Chaves do primeiro caso: ${Object.keys(cases[0]).join(", ")}`
    );

    console.log("");

    console.log(
      "Primeiro caso:"
    );

    console.log(
      JSON.stringify(
        cases[0],
        null,
        2
      )
    );
  }
})().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});
