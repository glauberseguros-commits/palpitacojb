from pathlib import Path

repo_path = Path("backend/engine/top3HistoryRepository.js")
sync_path = Path("backend/engine/top3HistorySync.js")

repo = repo_path.read_text(encoding="utf-8")
sync = sync_path.read_text(encoding="utf-8")

def replace_once(text, old, new, label):
    found = text.count(old)

    if found != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 bloco; encontrado {found}"
        )

    return text.replace(old, new, 1)


# =============================================================================
# REPOSITORY
# =============================================================================

repo = replace_once(
    repo,
    'const SCHEMA_VERSION = 1;\n',
    '''const SCHEMA_VERSION = 1;

const COMPACT_COLLECTION = "compact_years";
const COMPACT_MANIFEST_DOC = "__manifest";
const COMPACT_SCHEMA_VERSION = 1;
''',
    "repo/constants",
)

repo = replace_once(
    repo,
    '''function normalizeYmd(value) {
  const ymd = String(value || "").trim();

  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(ymd)) {
    return null;
  }

  return ymd;
}
''',
    '''function normalizeYmd(value) {
  const ymd = String(value || "").trim();

  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(ymd)) {
    return null;
  }

  return ymd;
}

function normalizeYear(value) {
  const year = String(value || "").trim();

  if (!/^\\d{4}$/.test(year)) {
    throw new Error(
      "year inválido. Utilize YYYY."
    );
  }

  return year;
}
''',
    "repo/normalizeYear",
)

repo = replace_once(
    repo,
    '''function metadataRef(
  database,
  lotteryKey
) {
  return historyRootRef(
    database,
    lotteryKey
  )
    .collection(METADATA_COLLECTION)
    .doc(CURRENT_METADATA_DOC);
}
''',
    '''function metadataRef(
  database,
  lotteryKey
) {
  return historyRootRef(
    database,
    lotteryKey
  )
    .collection(METADATA_COLLECTION)
    .doc(CURRENT_METADATA_DOC);
}

function compactCollectionRef(
  database,
  lotteryKey
) {
  return historyRootRef(
    database,
    lotteryKey
  ).collection(COMPACT_COLLECTION);
}

function compactYearRef(
  database,
  lotteryKey,
  year
) {
  return compactCollectionRef(
    database,
    lotteryKey
  ).doc(normalizeYear(year));
}

function compactManifestRef(
  database,
  lotteryKey
) {
  return compactCollectionRef(
    database,
    lotteryKey
  ).doc(COMPACT_MANIFEST_DOC);
}
''',
    "repo/compactRefs",
)

legacy_block = '''async function readFullHistory(
  lotteryKey,
  dependencies = {}
) {
  const months = await listHistoryMonths(
    lotteryKey,
    dependencies
  );

  const draws = [];

  for (const month of months) {
    draws.push(
      ...safeArray(month.draws)
    );
  }

  return deduplicateDraws(draws);
}
'''

compact_block = '''function encodeCompactPrize(prize = {}) {
  const normalized = normalizePrize(prize);

  if (!normalized) {
    return null;
  }

  return [
    normalized.id,
    normalized.position,
    normalized.grupo,
    normalized.milhar,
    normalized.centena,
    normalized.dezena,
  ];
}

function decodeCompactPrize(row) {
  if (!Array.isArray(row)) {
    return null;
  }

  return normalizePrize({
    id: row[0],
    position: row[1],
    grupo: row[2],
    milhar: row[3],
    centena: row[4],
    dezena: row[5],
  });
}

function encodeCompactDraw(draw = {}) {
  const normalized = normalizeDraw(draw);

  if (!normalized) {
    return null;
  }

  return [
    normalized.drawId,
    normalized.ymd,
    normalized.closeHour,
    normalized.lotteryKey,
    normalized.lotteryCode,
    safeArray(normalized.prizes)
      .map(encodeCompactPrize)
      .filter(Boolean),
  ];
}

function decodeCompactDraw(row) {
  if (!Array.isArray(row)) {
    return null;
  }

  return normalizeDraw({
    drawId: row[0],
    id: row[0],
    ymd: row[1],
    closeHour: row[2],
    lotteryKey: row[3],
    lotteryCode: row[4],
    prizes: safeArray(row[5])
      .map(decodeCompactPrize)
      .filter(Boolean),
  });
}

async function readCompactManifest(
  lotteryKey,
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);

  const snap = await compactManifestRef(
    database,
    key
  ).get();

  return {
    exists: snap.exists,
    lotteryKey: key,
    data: snap.exists
      ? snap.data() || {}
      : null,
  };
}

async function writeCompactManifest(
  lotteryKey,
  metadata = {},
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);

  const payload = {
    ...metadata,
    schemaVersion: COMPACT_SCHEMA_VERSION,
    lotteryKey: key,
    updatedAt: new Date(),
  };

  await compactManifestRef(
    database,
    key
  ).set(
    payload,
    {
      merge: true,
    }
  );

  return payload;
}

async function readCompactHistoryYear(
  lotteryKey,
  year,
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);
  const normalizedYear = normalizeYear(year);

  const snap = await compactYearRef(
    database,
    key,
    normalizedYear
  ).get();

  if (!snap.exists) {
    return {
      exists: false,
      lotteryKey: key,
      year: normalizedYear,
      draws: [],
      data: null,
    };
  }

  const data = snap.data() || {};

  return {
    exists: true,
    lotteryKey: key,
    year: normalizedYear,
    draws: deduplicateDraws(
      safeArray(data.rows)
        .map(decodeCompactDraw)
        .filter(Boolean)
    ),
    data,
  };
}

async function writeCompactHistoryYear(
  lotteryKey,
  year,
  draws,
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);
  const normalizedYear = normalizeYear(year);

  const normalizedDraws = deduplicateDraws(
    draws
  ).filter(
    (draw) =>
      draw.ymd.slice(0, 4) === normalizedYear
  );

  const first =
    normalizedDraws[0] || null;

  const last =
    normalizedDraws[
      normalizedDraws.length - 1
    ] || null;

  const payload = {
    schemaVersion: COMPACT_SCHEMA_VERSION,
    lotteryKey: key,
    year: normalizedYear,
    drawCount: normalizedDraws.length,
    firstYmd: first?.ymd || null,
    lastYmd: last?.ymd || null,
    firstDrawId:
      first?.drawId || null,
    lastDrawId:
      last?.drawId || null,
    rows: normalizedDraws
      .map(encodeCompactDraw)
      .filter(Boolean),
    updatedAt: new Date(),
  };

  await compactYearRef(
    database,
    key,
    normalizedYear
  ).set(
    payload,
    {
      merge: false,
    }
  );

  return payload;
}

async function upsertCompactHistoryYear(
  lotteryKey,
  year,
  newDraws,
  dependencies = {}
) {
  const current =
    await readCompactHistoryYear(
      lotteryKey,
      year,
      dependencies
    );

  const merged = deduplicateDraws([
    ...current.draws,
    ...safeArray(newDraws),
  ]);

  const payload =
    await writeCompactHistoryYear(
      lotteryKey,
      year,
      merged,
      dependencies
    );

  return {
    ...payload,
    previousDrawCount:
      current.draws.length,
  };
}

async function readCompactFullHistory(
  lotteryKey,
  dependencies = {}
) {
  const key = normalizeLotteryKey(lotteryKey);

  const manifestResult =
    await readCompactManifest(
      key,
      dependencies
    );

  const manifest =
    manifestResult?.data || null;

  if (
    manifestResult?.exists !== true ||
    manifest?.status !== "complete"
  ) {
    return [];
  }

  const years = safeArray(
    manifest.years
  )
    .map((year) =>
      String(year || "").trim()
    )
    .filter(
      (year) =>
        /^\\d{4}$/.test(year)
    )
    .sort();

  if (!years.length) {
    return [];
  }

  const yearlyResults =
    await Promise.all(
      years.map(
        (year) =>
          readCompactHistoryYear(
            key,
            year,
            dependencies
          )
      )
    );

  if (
    yearlyResults.some(
      (result) =>
        result.exists !== true
    )
  ) {
    throw new Error(
      "Snapshot compacto possui ano ausente."
    );
  }

  const draws = deduplicateDraws(
    yearlyResults.flatMap(
      (result) =>
        result.draws
    )
  );

  const expectedTotal = Number(
    manifest.totalDraws || 0
  );

  if (
    expectedTotal > 0 &&
    draws.length !== expectedTotal
  ) {
    throw new Error(
      "Snapshot compacto inconsistente: " +
      `esperado=${expectedTotal}; ` +
      `carregado=${draws.length}.`
    );
  }

  return draws;
}

async function readLegacyFullHistory(
  lotteryKey,
  dependencies = {}
) {
  const months = await listHistoryMonths(
    lotteryKey,
    dependencies
  );

  const draws = [];

  for (const month of months) {
    draws.push(
      ...safeArray(month.draws)
    );
  }

  return deduplicateDraws(draws);
}

async function readFullHistory(
  lotteryKey,
  dependencies = {}
) {
  if (
    dependencies.forceLegacy !== true
  ) {
    try {
      const compact =
        await readCompactFullHistory(
          lotteryKey,
          dependencies
        );

      if (compact.length) {
        return compact;
      }
    } catch (error) {
      console.warn(
        "[TOP3-HISTORY] Snapshot compacto indisponível; " +
        "usando histórico mensal:",
        error?.message || error
      );
    }
  }

  return readLegacyFullHistory(
    lotteryKey,
    dependencies
  );
}
'''

repo = replace_once(
    repo,
    legacy_block,
    compact_block,
    "repo/readFullHistory",
)

repo = replace_once(
    repo,
    '''  SCHEMA_VERSION,
  normalizeLotteryKey,
  normalizeYearMonth,
''',
    '''  SCHEMA_VERSION,
  COMPACT_COLLECTION,
  COMPACT_MANIFEST_DOC,
  COMPACT_SCHEMA_VERSION,
  normalizeLotteryKey,
  normalizeYearMonth,
  normalizeYear,
''',
    "repo/exports-header",
)

repo = replace_once(
    repo,
    '''  writeMetadata,
  listHistoryMonths,
  readFullHistory,
};
''',
    '''  writeMetadata,
  listHistoryMonths,
  encodeCompactPrize,
  decodeCompactPrize,
  encodeCompactDraw,
  decodeCompactDraw,
  readCompactManifest,
  writeCompactManifest,
  readCompactHistoryYear,
  writeCompactHistoryYear,
  upsertCompactHistoryYear,
  readCompactFullHistory,
  readLegacyFullHistory,
  readFullHistory,
};
''',
    "repo/exports-footer",
)


# =============================================================================
# SYNC
# =============================================================================

sync = replace_once(
    sync,
    '''  upsertHistoryMonth,
  deduplicateDraws,
} = require("./top3HistoryRepository");
''',
    '''  upsertHistoryMonth,
  deduplicateDraws,
  readCompactManifest,
  writeCompactManifest,
  upsertCompactHistoryYear,
} = require("./top3HistoryRepository");
''',
    "sync/imports",
)

sync = replace_once(
    sync,
    '''async function syncImportedResultToTop3History(
  importResult = {},
  dependencies = {}
) {
  const lotteryKey = normalizeLotteryKey(
    importResult.lotteryKey
  );

  const loadMetadata =
    dependencies.readMetadata ||
    readMetadata;

  const saveMonth =
    dependencies.upsertHistoryMonth ||
    upsertHistoryMonth;

  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  try {
''',
    '''async function syncImportedResultToTop3History(
  importResult = {},
  dependencies = {}
) {
  const lotteryKey = normalizeLotteryKey(
    importResult.lotteryKey
  );

  const loadMetadata =
    dependencies.readMetadata ||
    readMetadata;

  const saveMonth =
    dependencies.upsertHistoryMonth ||
    upsertHistoryMonth;

  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  const loadCompactManifest =
    dependencies.readCompactManifest ||
    readCompactManifest;

  const saveCompactManifest =
    dependencies.writeCompactManifest ||
    writeCompactManifest;

  const saveCompactYear =
    dependencies.upsertCompactHistoryYear ||
    upsertCompactHistoryYear;

  try {
''',
    "sync/dependencies",
)

sync = replace_once(
    sync,
    '''    const metadata =
      metadataResult?.data || null;

    if (
''',
    '''    const metadata =
      metadataResult?.data || null;

    const compactManifestResult =
      await loadCompactManifest(
        lotteryKey,
        dependencies.repositoryDependencies || {}
      );

    const compactManifest =
      compactManifestResult?.data || null;

    const compactReady =
      compactManifestResult?.exists === true &&
      compactManifest?.status === "complete";

    if (
''',
    "sync/load-manifest",
)

sync_function_marker = (
    "async function syncImportedResultToTop3History("
)

if sync_function_marker not in sync:
    raise RuntimeError(
        "sync/compact-update: função principal não encontrada"
    )

sync_prefix, sync_function_body = sync.split(
    sync_function_marker,
    1,
)

sync_function_body = replace_once(
    sync_function_body,
    '''    await saveMetadata(
      lotteryKey,
      {
''',
    '''    let compactUpdated = false;
    let compactError = null;
    const updatedCompactYears = [];

    if (compactReady) {
      try {
        const byYear = new Map();

        for (const draw of draws) {
          const year = draw.ymd.slice(0, 4);

          if (!byYear.has(year)) {
            byYear.set(year, []);
          }

          byYear.get(year).push(draw);
        }

        for (
          const [year, yearDraws]
          of byYear.entries()
        ) {
          const payload =
            await saveCompactYear(
              lotteryKey,
              year,
              yearDraws,
              dependencies.repositoryDependencies || {}
            );

          updatedCompactYears.push({
            year,
            drawCount:
              Number(payload?.drawCount || 0),
            previousDrawCount:
              Number(
                payload?.previousDrawCount || 0
              ),
          });
        }

        const compactYears = Array.from(
          new Set(
            orderedMonths.map(
              (month) =>
                String(month).slice(0, 4)
            )
          )
        ).sort();

        await saveCompactManifest(
          lotteryKey,
          {
            status: "complete",
            totalDraws:
              summary.totalDraws,
            yearCount:
              compactYears.length,
            years:
              compactYears,
            firstYmd:
              summary.firstYmd,
            lastYmd:
              summary.lastYmd,
            firstDrawId:
              summary.firstDrawId,
            lastDrawId:
              summary.lastDrawId,
            source:
              "bootstrap_plus_incremental",
            incrementalUpdatedAt:
              new Date().toISOString(),
            staleReason: null,
            staleAt: null,
          },
          dependencies.repositoryDependencies || {}
        );

        compactUpdated = true;
      } catch (error) {
        compactError = String(
          error?.message ||
          error ||
          "compact_incremental_failed"
        );

        console.warn(
          "[TOP3-HISTORY] Compacto incremental falhou; " +
          "a leitura mensal continuará disponível:",
          compactError
        );

        try {
          await saveCompactManifest(
            lotteryKey,
            {
              status: "stale",
              staleReason:
                compactError,
              staleAt:
                new Date().toISOString(),
            },
            dependencies.repositoryDependencies || {}
          );
        } catch (manifestError) {
          console.warn(
            "[TOP3-HISTORY] Falha ao marcar compacto como stale:",
            manifestError?.message ||
            manifestError
          );
        }
      }
    }

    await saveMetadata(
      lotteryKey,
      {
''',
    "sync/compact-update/function-scope",
)

sync = (
    sync_prefix +
    sync_function_marker +
    sync_function_body
)

sync = replace_once(
    sync,
    '''      importedDraws: draws.length,
      updatedMonths,
      ...summary,
''',
    '''      importedDraws: draws.length,
      updatedMonths,
      compactReady,
      compactUpdated,
      compactError,
      updatedCompactYears,
      ...summary,
''',
    "sync/return",
)

repo_path.write_text(
    repo,
    encoding="utf-8",
    newline="\n"
)

sync_path.write_text(
    sync,
    encoding="utf-8",
    newline="\n"
)

print("PATCH_OK")
