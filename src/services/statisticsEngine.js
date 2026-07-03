import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getKingResultsByRange } from "./kingResultsService";
import { buildRanking } from "../utils/buildRanking";
import { applyScoreEngine } from "../utils/scoreEngine";

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeUfKey(uf) {
  return String(uf || "PT_RIO").trim().toUpperCase() || "PT_RIO";
}

function snapshotDocRef(uf, scope = "dashboard_full") {
  const key = normalizeUfKey(uf);
  return doc(db, "statistics", key, "snapshots", scope);
}

export async function readStatisticsSnapshot({ uf, scope = "dashboard_full" } = {}) {
  const ref = snapshotDocRef(uf, scope);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return {
      exists: false,
      data: null,
    };
  }

  return {
    exists: true,
    data: snap.data(),
  };
}

export async function buildStatisticsSnapshot({
  uf = "PT_RIO",
  dateFrom,
  dateTo,
  scope = "dashboard_full",
  positions = null,
} = {}) {
  if (!dateFrom || !dateTo) {
    throw new Error("buildStatisticsSnapshot exige dateFrom e dateTo.");
  }

  const draws = await getKingResultsByRange({
    uf,
    dateFrom,
    dateTo,
    positions,
    mode: "detailed",
  });

  const built = buildRanking(draws);
  const ranking = safeArray(built?.ranking);
  const rankingScored = applyScoreEngine(ranking);

  const payload = {
    version: 1,
    scope,
    uf: normalizeUfKey(uf),
    from: dateFrom,
    to: dateTo,
    totalDraws: Number(built?.totalDraws || 0),
    uniqueDays: Number(built?.uniqueDays || 0),
    totalOcorrencias: Number(built?.totalOcorrencias || 0),
    ranking,
    rankingScored,
    top3: safeArray(rankingScored).slice(0, 3),
    integrityIssues: safeArray(built?.integrityIssues),
    countMode: built?.countMode || "byPrize",
    generatedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(snapshotDocRef(uf, scope), payload, { merge: true });

  return payload;
}

export async function ensureStatisticsSnapshot({
  uf = "PT_RIO",
  dateFrom,
  dateTo,
  scope = "dashboard_full",
  force = false,
  positions = null,
} = {}) {
  const current = await readStatisticsSnapshot({ uf, scope });

  if (!force && current.exists && current.data?.from === dateFrom && current.data?.to === dateTo) {
    return {
      source: "cache",
      data: current.data,
    };
  }

  const data = await buildStatisticsSnapshot({
    uf,
    dateFrom,
    dateTo,
    scope,
    positions,
  });

  return {
    source: "rebuilt",
    data,
  };
}
