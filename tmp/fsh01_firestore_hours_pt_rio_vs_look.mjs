import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT =
  "tmp/fsh01_firestore_hours_pt_rio_vs_look.txt";

const LOTTERIES = [
  "PT_RIO",
  "LOOK",
];

const DATE_FROM = "2026-06-01";
const DATE_TO = "2026-07-22";
const MAX_DOCS_PER_QUERY = 5000;

function walk(dir) {
  const result = [];

  if (!fs.existsSync(dir)) {
    return result;
  }

  for (const entry of fs.readdirSync(
    dir,
    {
      withFileTypes: true,
    }
  )) {
    const full =
      path.join(
        dir,
        entry.name
      );

    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "build" ||
      entry.name === "dist" ||
      entry.name === "coverage" ||
      entry.name === "tmp"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      result.push(...walk(full));
      continue;
    }

    if (
      entry.isFile() &&
      /\.(js|mjs|cjs)$/i.test(entry.name)
    ) {
      result.push(full);
    }
  }

  return result;
}

function normalizeHourLike(value) {
  const raw =
    String(
      value ?? ""
    ).trim();

  if (!raw) {
    return "";
  }

  const compact =
    raw.replace(
      /\s+/g,
      ""
    );

  let match =
    compact.match(
      /^(\d{1,2})(?:h|hs|hr|hrs)$/i
    );

  if (match) {
    return `${String(
      Number(match[1])
    ).padStart(
      2,
      "0"
    )}:00`;
  }

  match =
    compact.match(
      /^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/
    );

  if (match) {
    return `${String(
      Number(match[1])
    ).padStart(
      2,
      "0"
    )}:${String(
      Number(match[2])
    ).padStart(
      2,
      "0"
    )}`;
  }

  match =
    compact.match(
      /^(\d{1,2})$/
    );

  if (match) {
    return `${String(
      Number(match[1])
    ).padStart(
      2,
      "0"
    )}:00`;
  }

  match =
    compact.match(
      /^(\d{3,4})$/
    );

  if (match) {
    const digits =
      String(
        match[1]
      ).padStart(
        4,
        "0"
      );

    return `${digits.slice(
      0,
      2
    )}:${digits.slice(
      2
    )}`;
  }

  return raw;
}

function hourBucket(value) {
  const normalized =
    normalizeHourLike(
      value
    );

  const match =
    normalized.match(
      /^(\d{2}):/
    );

  return match
    ? `${match[1]}:00`
    : "";
}

function getYmd(data) {
  const candidates = [
    data?.ymd,
    data?.date_ymd,
    data?.drawYmd,
    data?.draw_ymd,
    data?.date,
    data?.data,
  ];

  for (const candidate of candidates) {
    const text =
      String(
        candidate ?? ""
      ).trim();

    const match =
      text.match(
        /^(\d{4}-\d{2}-\d{2})/
      );

    if (match) {
      return match[1];
    }

    const br =
      text.match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
      );

    if (br) {
      return `${br[3]}-${br[2]}-${br[1]}`;
    }
  }

  return "";
}

function getRawHour(data) {
  const fields = [
    ["close_hour", data?.close_hour],
    ["closeHour", data?.closeHour],
    ["hour", data?.hour],
    ["hora", data?.hora],
    ["horario", data?.horario],
    ["drawHour", data?.drawHour],
    ["draw_hour", data?.draw_hour],
  ];

  for (const [
    field,
    value,
  ] of fields) {
    const text =
      String(
        value ?? ""
      ).trim();

    if (text) {
      return {
        field,
        value: text,
      };
    }
  }

  return {
    field: "",
    value: "",
  };
}

function weekdayFromYmd(ymd) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      ymd
    )
  ) {
    return "";
  }

  const [
    year,
    month,
    day,
  ] =
    ymd.split(
      "-"
    ).map(Number);

  const names = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];

  return names[
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    ).getUTCDay()
  ];
}

function increment(
  map,
  key
) {
  map.set(
    key,
    (
      map.get(
        key
      ) || 0
    ) + 1
  );
}

function sortedEntries(map) {
  return [
    ...map.entries(),
  ].sort(
    (
      [a],
      [b]
    ) =>
      String(
        a
      ).localeCompare(
        String(
          b
        )
      )
  );
}

function findFirestoreObject(value) {
  if (
    value &&
    typeof value.collection === "function"
  ) {
    return value;
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  for (const candidate of [
    value.db,
    value.firestore,
    value.adminDb,
    value.firestoreDb,
    value.default,
  ]) {
    if (
      candidate &&
      typeof candidate.collection === "function"
    ) {
      return candidate;
    }
  }

  return null;
}

async function locateFirestore() {
  const files =
    walk(
      "backend"
    );

  const candidates =
    files.filter(
      (file) => {
        try {
          const source =
            fs.readFileSync(
              file,
              "utf8"
            );

          return (
            /firebase-admin/i.test(
              source
            ) ||
            /getFirestore\s*\(/i.test(
              source
            ) ||
            /admin\.firestore\s*\(/i.test(
              source
            )
          );
        } catch {
          return false;
        }
      }
    );

  const errors = [];

  for (const file of candidates) {
    try {
      const imported =
        await import(
          pathToFileURL(
            path.resolve(
              file
            )
          ).href
        );

      const db =
        findFirestoreObject(
          imported
        );

      if (db) {
        return {
          db,
          source:
            file,
          errors,
        };
      }
    } catch (error) {
      errors.push(
        `${file}: ${String(
          error?.message ||
          error
        )}`
      );
    }
  }

  try {
    const {
      getApps,
      initializeApp,
      applicationDefault,
    } =
      await import(
        "firebase-admin/app"
      );

    const {
      getFirestore,
    } =
      await import(
        "firebase-admin/firestore"
      );

    if (
      !getApps().length
    ) {
      initializeApp({
        credential:
          applicationDefault(),
      });
    }

    return {
      db:
        getFirestore(),
      source:
        "firebase-admin/applicationDefault",
      errors,
    };
  } catch (error) {
    errors.push(
      `applicationDefault: ${String(
        error?.message ||
        error
      )}`
    );
  }

  throw new Error(
    [
      "Não foi possível localizar uma instância Firestore Admin.",
      "",
      ...errors.slice(
        0,
        20
      ),
    ].join(
      "\n"
    )
  );
}

async function queryByField(
  db,
  field,
  value
) {
  const snapshot =
    await db
      .collection(
        "draws"
      )
      .where(
        field,
        "==",
        value
      )
      .limit(
        MAX_DOCS_PER_QUERY
      )
      .get();

  return snapshot.docs;
}

async function loadLotteryDocs(
  db,
  lottery
) {
  const attempts = [];

  for (const field of [
    "lottery_key",
    "uf",
  ]) {
    try {
      const docs =
        await queryByField(
          db,
          field,
          lottery
        );

      attempts.push({
        field,
        count:
          docs.length,
        error:
          null,
      });

      if (
        docs.length
      ) {
        return {
          docs,
          usedField:
            field,
          attempts,
        };
      }
    } catch (error) {
      attempts.push({
        field,
        count:
          0,
        error:
          String(
            error?.message ||
            error
          ),
      });
    }
  }

  return {
    docs: [],
    usedField:
      "",
    attempts,
  };
}

function summarizeDocs(
  docs,
  lottery
) {
  const rawHourCounts =
    new Map();

  const normalizedCounts =
    new Map();

  const bucketCounts =
    new Map();

  const weekdayBucketCounts =
    new Map();

  const missingHourDocs = [];
  const sample11h = [];
  const sampleAll = [];

  let withinRange = 0;
  let wednesdayCount = 0;
  let wednesday11hCount = 0;

  for (const doc of docs) {
    const data =
      doc.data() || {};

    const ymd =
      getYmd(
        data
      );

    if (
      !ymd ||
      ymd < DATE_FROM ||
      ymd > DATE_TO
    ) {
      continue;
    }

    withinRange += 1;

    const raw =
      getRawHour(
        data
      );

    const normalized =
      normalizeHourLike(
        raw.value
      );

    const bucket =
      hourBucket(
        raw.value
      );

    const weekday =
      weekdayFromYmd(
        ymd
      );

    increment(
      rawHourCounts,
      raw.value
        ? `${raw.field}=${raw.value}`
        : "[SEM HORÁRIO]"
    );

    increment(
      normalizedCounts,
      normalized ||
        "[SEM HORÁRIO NORMALIZADO]"
    );

    increment(
      bucketCounts,
      bucket ||
        "[SEM BUCKET]"
    );

    increment(
      weekdayBucketCounts,
      `${weekday || "?"} | ${
        bucket ||
        "[SEM BUCKET]"
      }`
    );

    const sample = {
      id:
        doc.id,
      ymd,
      weekday,
      lottery_key:
        data?.lottery_key ??
        data?.lotteryKey ??
        "",
      uf:
        data?.uf ??
        "",
      lottery_code:
        data?.lottery_code ??
        data?.lotteryCode ??
        "",
      rawField:
        raw.field,
      rawHour:
        raw.value,
      normalized,
      bucket,
      prizesCount:
        Array.isArray(
          data?.prizes
        )
          ? data.prizes.length
          : data?.prizesCount ??
            null,
    };

    if (
      sampleAll.length <
      30
    ) {
      sampleAll.push(
        sample
      );
    }

    if (!bucket) {
      if (
        missingHourDocs.length <
        50
      ) {
        missingHourDocs.push(
          sample
        );
      }
    }

    if (
      weekday ===
      "Quarta"
    ) {
      wednesdayCount += 1;

      if (
        bucket ===
        "11:00"
      ) {
        wednesday11hCount += 1;
      }
    }

    if (
      bucket ===
        "11:00" &&
      sample11h.length <
        50
    ) {
      sample11h.push(
        sample
      );
    }
  }

  return {
    lottery,
    totalQueried:
      docs.length,
    withinRange,
    wednesdayCount,
    wednesday11hCount,
    rawHourCounts,
    normalizedCounts,
    bucketCounts,
    weekdayBucketCounts,
    missingHourDocs,
    sample11h,
    sampleAll,
  };
}

function writeMap(
  lines,
  title,
  map
) {
  lines.push(
    "",
    title,
    "-".repeat(
      90
    )
  );

  for (const [
    key,
    count,
  ] of sortedEntries(
    map
  )) {
    lines.push(
      `${String(
        count
      ).padStart(
        6,
        " "
      )}  ${key}`
    );
  }
}

function writeSamples(
  lines,
  title,
  samples
) {
  lines.push(
    "",
    title,
    "-".repeat(
      90
    )
  );

  if (!samples.length) {
    lines.push(
      "[NENHUM REGISTRO]"
    );

    return;
  }

  for (const sample of samples) {
    lines.push(
      JSON.stringify(
        sample
      )
    );
  }
}

async function main() {
  const lines = [];

  lines.push(
    "=".repeat(
      100
    ),
    "AUDITORIA DE HORÁRIOS REAIS NO FIRESTORE",
    "=".repeat(
      100
    ),
    `Período analisado: ${DATE_FROM} até ${DATE_TO}`,
    `Limite por consulta: ${MAX_DOCS_PER_QUERY}`,
    ""
  );

  const {
    db,
    source,
    errors,
  } =
    await locateFirestore();

  lines.push(
    `Firestore carregado por: ${source}`
  );

  if (
    errors.length
  ) {
    lines.push(
      "",
      "Falhas ignoradas durante a detecção:",
      ...errors.slice(
        0,
        10
      )
    );
  }

  for (const lottery of LOTTERIES) {
    lines.push(
      "",
      "",
      "=".repeat(
        100
      ),
      `LOTERIA: ${lottery}`,
      "=".repeat(
        100
      )
    );

    const loaded =
      await loadLotteryDocs(
        db,
        lottery
      );

    lines.push(
      `Campo utilizado na consulta: ${
        loaded.usedField ||
        "[NENHUM]"
      }`,
      "",
      "Tentativas de consulta:"
    );

    for (const attempt of loaded.attempts) {
      lines.push(
        JSON.stringify(
          attempt
        )
      );
    }

    const summary =
      summarizeDocs(
        loaded.docs,
        lottery
      );

    lines.push(
      "",
      `Documentos retornados: ${summary.totalQueried}`,
      `Documentos no período: ${summary.withinRange}`,
      `Documentos de quarta-feira: ${summary.wednesdayCount}`,
      `Documentos de quarta-feira no bucket 11:00: ${summary.wednesday11hCount}`
    );

    writeMap(
      lines,
      "VALORES BRUTOS DE HORÁRIO",
      summary.rawHourCounts
    );

    writeMap(
      lines,
      "HORÁRIOS NORMALIZADOS",
      summary.normalizedCounts
    );

    writeMap(
      lines,
      "BUCKETS HH:00",
      summary.bucketCounts
    );

    writeMap(
      lines,
      "DIA DA SEMANA x BUCKET",
      summary.weekdayBucketCounts
    );

    writeSamples(
      lines,
      "AMOSTRAS DO BUCKET 11:00",
      summary.sample11h
    );

    writeSamples(
      lines,
      "DOCUMENTOS SEM HORÁRIO RECONHECIDO",
      summary.missingHourDocs
    );

    writeSamples(
      lines,
      "AMOSTRA GERAL",
      summary.sampleAll
    );
  }

  fs.writeFileSync(
    OUTPUT,
    lines.join(
      "\n"
    ),
    "utf8"
  );

  console.log(
    `Relatório criado: ${OUTPUT}`
  );
}

main().catch(
  (error) => {
    const message =
      [
        "=".repeat(
          100
        ),
        "ERRO NA AUDITORIA",
        "=".repeat(
          100
        ),
        String(
          error?.stack ||
          error?.message ||
          error
        ),
      ].join(
        "\n"
      );

    fs.writeFileSync(
      OUTPUT,
      message,
      "utf8"
    );

    console.error(
      message
    );

    process.exitCode =
      1;
  }
);
