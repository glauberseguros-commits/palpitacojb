"use strict";

const {
  getDb,
} = require("../service/firebaseAdmin");

const ROOT_COLLECTION =
  "palpitaco_ranking";

const SNAPSHOTS_COLLECTION =
  "snapshots";

const METADATA_COLLECTION =
  "metadata";

const CURRENT_METADATA_DOC =
  "current";

const DEFAULT_SCOPE =
  "ranking_full";

const SCHEMA_VERSION = 1;

function normalizeLotteryKey(value) {
  const lotteryKey = String(
    value || "PT_RIO"
  )
    .trim()
    .toUpperCase();

  if (!lotteryKey) {
    throw new Error(
      "lotteryKey obrigatório."
    );
  }

  return lotteryKey;
}

function normalizeScope(value) {
  const scope = String(
    value || DEFAULT_SCOPE
  ).trim();

  if (!scope) {
    throw new Error(
      "scope obrigatório."
    );
  }

  if (
    !/^[a-zA-Z0-9_-]+$/.test(scope)
  ) {
    throw new Error(
      "scope inválido."
    );
  }

  return scope;
}

function resolveDb(dependencies = {}) {
  return dependencies.db || getDb();
}

function rankingRootRef(
  database,
  lotteryKey
) {
  return database
    .collection(ROOT_COLLECTION)
    .doc(
      normalizeLotteryKey(
        lotteryKey
      )
    );
}

function rankingSnapshotRef(
  database,
  lotteryKey,
  scope = DEFAULT_SCOPE
) {
  return rankingRootRef(
    database,
    lotteryKey
  )
    .collection(
      SNAPSHOTS_COLLECTION
    )
    .doc(
      normalizeScope(scope)
    );
}

function rankingMetadataRef(
  database,
  lotteryKey
) {
  return rankingRootRef(
    database,
    lotteryKey
  )
    .collection(
      METADATA_COLLECTION
    )
    .doc(
      CURRENT_METADATA_DOC
    );
}

async function readRankingSnapshot(
  lotteryKey,
  scope = DEFAULT_SCOPE,
  dependencies = {}
) {
  const database =
    resolveDb(dependencies);

  const key =
    normalizeLotteryKey(
      lotteryKey
    );

  const normalizedScope =
    normalizeScope(scope);

  const snap =
    await rankingSnapshotRef(
      database,
      key,
      normalizedScope
    ).get();

  return {
    exists: snap.exists,
    lotteryKey: key,
    scope: normalizedScope,
    data: snap.exists
      ? snap.data() || {}
      : null,
  };
}

async function writeRankingSnapshot(
  lotteryKey,
  scope = DEFAULT_SCOPE,
  data = {},
  dependencies = {}
) {
  const database =
    resolveDb(dependencies);

  const key =
    normalizeLotteryKey(
      lotteryKey
    );

  const normalizedScope =
    normalizeScope(scope);

  const payload = {
    ...data,
    schemaVersion:
      SCHEMA_VERSION,
    lotteryKey: key,
    scope: normalizedScope,
    updatedAt: new Date(),
  };

  await rankingSnapshotRef(
    database,
    key,
    normalizedScope
  ).set(
    payload,
    {
      merge: false,
    }
  );

  return payload;
}

async function readRankingMetadata(
  lotteryKey,
  dependencies = {}
) {
  const database =
    resolveDb(dependencies);

  const key =
    normalizeLotteryKey(
      lotteryKey
    );

  const snap =
    await rankingMetadataRef(
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

async function writeRankingMetadata(
  lotteryKey,
  metadata = {},
  dependencies = {}
) {
  const database =
    resolveDb(dependencies);

  const key =
    normalizeLotteryKey(
      lotteryKey
    );

  const payload = {
    ...metadata,
    schemaVersion:
      SCHEMA_VERSION,
    lotteryKey: key,
    updatedAt: new Date(),
  };

  await rankingMetadataRef(
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

async function markRankingSnapshotStale(
  lotteryKey,
  error,
  dependencies = {}
) {
  const staleReason = String(
    error?.message ||
    error ||
    "ranking_snapshot_failed"
  );

  return writeRankingMetadata(
    lotteryKey,
    {
      status: "stale",
      staleReason,
      staleAt:
        new Date().toISOString(),
    },
    dependencies
  );
}

module.exports = {
  ROOT_COLLECTION,
  SNAPSHOTS_COLLECTION,
  METADATA_COLLECTION,
  CURRENT_METADATA_DOC,
  DEFAULT_SCOPE,
  SCHEMA_VERSION,
  normalizeLotteryKey,
  normalizeScope,
  rankingRootRef,
  rankingSnapshotRef,
  rankingMetadataRef,
  readRankingSnapshot,
  writeRankingSnapshot,
  readRankingMetadata,
  writeRankingMetadata,
  markRankingSnapshotStale,
};