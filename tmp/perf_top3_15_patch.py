from pathlib import Path

repo_path = Path("backend/engine/top3HistoryRepository.js")
sync_path = Path("backend/engine/top3HistorySync.js")

repo = repo_path.read_text(encoding="utf-8")
sync = sync_path.read_text(encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: esperado 1 bloco, encontrado {count}"
        )

    return text.replace(old, new, 1)


# =============================================================================
# top3HistoryRepository.js
# =============================================================================

repo = replace_once(
    repo,
    '''const SCHEMA_VERSION = 1;
''',
    '''const SCHEMA_VERSION = 1;

const COMPACT_COLLECTION = "compact_years";
const COMPACT_MANIFEST_DOC = "__manifest";
const COMPACT_SCHEMA_VERSION = 1;
''',
    "repository/constants",
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
    "repository/normalizeYear",
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
    "repository/compactRefs",
)

insert_before = '''async function readFullHistory(
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

compact_code = r'''function encodeCompactPrize(prize = {}) {
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

function decodeCompactPrize(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  return normalizePrize({
    id: value[0] ?? null,
    position: value[1],
    grupo: value[2],
    milhar: value[3],
    centena: value[4],
    dezena: value[5],
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

function decodeCompactDraw(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  return normalizeDraw({
    drawId: value[0],
    id: value[0],
    ymd: value[1],
    closeHour: value[2],
    lotteryKey: value[3],
    lotteryCode: value[4],
    prizes: safeArray(value[5])
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
  manifest = {},
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);

  const payload = {
    ...manifest,
    schemaVersion: COMPACT_SCHEMA_VERSION,
    lotteryKey: key,
    updatedAt: new Date(),
  };

  await compactManifestRef(
    database,
    key
  ).set(
    payload,
    { merge: true }
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

  const draws = safeArray(data.rows)
    .map(decodeCompactDraw)
    .filter(Boolean);

  return {
    exists: true,
    lotteryKey: key,
    year: normalizedYear,
    draws: deduplicateDraws(draws),
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

  const rows = normalizedDraws
    .map(encodeCompactDraw)
    .filter(Boolean);

  const first = normalizedDraws[0] || null;
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
    rows,
    updatedAt: new Date(),
  };

  await compactYearRef(
    database,
    key,
    normalizedYear
  ).set(
    payload,
    { merge: false }
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

async function listCompactHistoryYears(
  lotteryKey,
  dependencies = {}
) {
  const database = resolveDb(dependencies);
  const key = normalizeLotteryKey(lotteryKey);

  const snap = await compactCollectionRef(
    database,
    key
  ).get();

  return snap.docs
    .filter(
      (doc) =>
        doc.id !== COMPACT_MANIFEST_DOC
    )
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() || {}),
    }))
    .sort(
      (a, b) =>
        String(a.year || a.id)
          .localeCompare(
            String(b.year || b.id)
          )
    );
}

async function readCompactFullHistory(
  lotteryKey,
  dependencies = {}
) {
  const key = normalizeLotteryKey(lotteryKey);

  const [
    manifestResult,
    years,
  ] = await Promise.all([
    readCompactManifest(
      key,
      dependencies
    ),
    listCompactHistoryYears(
      key,
      dependencies
    ),
  ]);

  const manifest =
    manifestResult?.data || null;

  if (
    manifestResult?.exists !== true ||
    manifest?.status !== "complete"
  ) {
    return [];
  }

  const draws = deduplicateDraws(
    years.flatMap(
      (year) =>
        safeArray(year.rows)
          .map(decodeCompactDraw)
          .filter(Boolean)
    )
  );

  const expectedTotal = Number(
    manifest?.totalDraws || 0
  );

  if (
    expectedTotal > 0 &&
    draws.length !== expectedTotal
  ) {
    throw new Error(
      "Snapshot compacto TOP3 inconsistente: " +
      `manifest.totalDraws=${expectedTotal}, ` +
      `carregados=${draws.length}.`
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
    insert_before,
    compact_code,
    "repository/readFullHistory",
)

repo = replace_once(
    repo,
    '''  SCHEMA_VERSION,
''',
    '''  SCHEMA_VERSION,
  COMPACT_COLLECTION,
  COMPACT_MANIFEST_DOC,
  COMPACT_SCHEMA_VERSION,
''',
    "repository/exports_constants",
)

repo = replace_once(
    repo,
    '''  normalizeYearMonth,
''',
    '''  normalizeYearMonth,
  normalizeYear,
''',
    "repository/exports_normalizeYear",
)

repo = replace_once(
    repo,
    '''  listHistoryMonths,
  readFullHistory,
};
''',
    '''  listHistoryMonths,
  encodeCompactPrize,
  decodeCompactPrize,
  encodeCompactDraw,
  decodeCompactDraw,
  readCompactManifest,
  writeCompactManifest,
  readCompactHistoryYear,
  writeCompactHistoryYear,
  upsertCompactHistoryYear,
  listCompactHistoryYears,
  readCompactFullHistory,
  readLegacyFullHistory,
  readFullHistory,
};
''',
    "repository/exports_compact",
)


# =============================================================================
# top3HistorySync.js
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
    '''    const saveMetadata =
      dependencies.writeMetadata ||
      writeMetadata;

    try {
''',
    '''    const saveMetadata =
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
    "sync/compactManifest",
)

sync = replace_once(
    sync,
    '''    const updatedMonths = [];

    for (
''',
    '''    const updatedMonths = [];

    for (
''',
    "sync/updatedMonths_anchor",
)

sync = replace_once(
    sync,
    '''    const metadataMonths = safeArray(
      metadata?.months
    )
''',
    '''    const updatedCompactYears = [];

    if (compactReady) {
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
        const compactPayload =
          await saveCompactYear(
            lotteryKey,
            year,
            yearDraws,
            dependencies.repositoryDependencies || {}
          );

        updatedCompactYears.push({
          year,
          drawCount:
            Number(
              compactPayload?.drawCount || 0
            ),
          previousDrawCount:
            Number(
              compactPayload?.previousDrawCount || 0
            ),
        });
      }
    }

    const metadataMonths = safeArray(
      metadata?.months
    )
''',
    "sync/updateCompactYears",
)

sync = replace_once(
    sync,
    '''    await saveMetadata(
      lotteryKey,
      {
''',
    '''    if (compactReady) {
      await saveCompactManifest(
        lotteryKey,
        {
          status: "complete",
          totalDraws:
            summary.totalDraws,
          yearCount:
            new Set(
              orderedMonths.map(
                (month) =>
                  String(month).slice(0, 4)
              )
            ).size,
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
        },
        dependencies.repositoryDependencies || {}
      );
    }

    await saveMetadata(
      lotteryKey,
      {
''',
    "sync/saveCompactManifest",
)

sync = replace_once(
    sync,
    '''      updatedMonths,
      ...summary,
    };
''',
    '''      updatedMonths,
      updatedCompactYears,
      compactUpdated:
        compactReady,
      ...summary,
    };
''',
    "sync/returnCompact",
)

repo_path.write_text(repo, encoding="utf-8", newline="\n")
sync_path.write_text(sync, encoding="utf-8", newline="\n")

print("PATCH_OK")
