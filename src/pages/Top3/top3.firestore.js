/* eslint-disable no-unused-vars */
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { loginAnonymous } from "../../services/auth";

import {
  safeStr,
  isYMD,
  toHourBucket,
} from "./top3.formatters";

import {
  pickDrawYMD,
  pickDrawHour,
  pickPrize1GrupoFromDraw,
} from "./top3.engine";

import {
  analyzeTop3Hits,
} from "./top3.hit-analysis";

const COLLECTION = "top3_predictions";

function normalizeLotteryKey(value) {
  return safeStr(value).toUpperCase() || "PT_RIO";
}

function normalizeHour(value) {
  return toHourBucket(value) || "";
}

function hourCode(value) {
  return normalizeHour(value).replace(/\D/g, "").padStart(2, "0");
}

function makePredictionId({ lotteryKey, targetYmd, targetHour }) {
  const lottery = normalizeLotteryKey(lotteryKey);
  const ymd = safeStr(targetYmd);
  const hour = hourCode(targetHour);

  if (!lottery || !isYMD(ymd) || !hour) return "";

  return `${lottery}__${ymd}__${hour}`;
}

function predictionRef(params) {
  const id = makePredictionId(params);
  return id ? doc(db, COLLECTION, id) : null;
}

function cleanFirestoreValue(value) {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, current) => {
        if (current === undefined) return null;
        if (typeof current === "number" && !Number.isFinite(current)) {
          return null;
        }
        return current;
      })
    );
  } catch {
    return null;
  }
}

function normalizeMilhar(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-4).padStart(4, "0");
}

function extractPrize1(draw) {
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];

  return (
    prizes.find((item) => Number(item?.position) === 1) ||
    prizes[0] ||
    null
  );
}

function extractPrize1Milhar(draw) {
  const prize = extractPrize1(draw);

  return normalizeMilhar(
    prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.valor ??
      draw?.prize_1 ??
      ""
  );
}

function findDrawForTarget({
  draws,
  targetYmd,
  targetHour,
}) {
  const ymd = safeStr(targetYmd);
  const hour = normalizeHour(targetHour);

  if (!isYMD(ymd) || !hour) return null;

  return (
    (Array.isArray(draws) ? draws : []).find((draw) => {
      return (
        pickDrawYMD(draw) === ymd &&
        normalizeHour(pickDrawHour(draw)) === hour
      );
    }) || null
  );
}
function normalizeSnapshot(snapshot) {
  return (Array.isArray(snapshot) ? snapshot : [])
    .slice(0, 3)
    .map((item, index) => ({
      rank: Number(item?.rank || index + 1),
      grupo: Number(item?.grupo),
      animal: safeStr(item?.animal || ""),
      prob: Number(item?.prob || 0),
      probPct: Number(item?.probPct || 0),
      milhares24: (
        Array.isArray(item?.milhares24)
          ? item.milhares24
          : Array.isArray(item?.milhares20)
            ? item.milhares20
            : []
      )
        .map(normalizeMilhar)
        .filter(Boolean)
        .slice(0, 24),
      milharesCols: Array.isArray(item?.milharesCols)
        ? cleanFirestoreValue(item.milharesCols)
        : [],
      meta: cleanFirestoreValue(item?.meta || null),
    }))
    .filter((item) => {
      return (
        Number.isFinite(item.grupo) &&
        item.grupo >= 1 &&
        item.grupo <= 25
      );
    });
}

function extractPrizeGrupo(prize) {
  const direct = Number(
    prize?.grupo ??
      prize?.group ??
      prize?.animal_grupo ??
      prize?.grupo2
  );

  if (
    Number.isFinite(direct) &&
    direct >= 1 &&
    direct <= 25
  ) {
    return direct;
  }

  const milhar = normalizeMilhar(
    prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.valor ??
      ""
  );

  if (!milhar) return null;

  const dezena = Number(milhar.slice(-2));
  const normalizedDezena = dezena === 0 ? 100 : dezena;
  const grupo = Math.ceil(normalizedDezena / 4);

  return grupo >= 1 && grupo <= 25 ? grupo : null;
}

function extractOfficialPodium(draw) {
  const prizes = Array.isArray(draw?.prizes)
    ? draw.prizes
    : [];

  return [1, 2, 3].map((position) => {
    const prize =
      prizes.find(
        (item) => Number(item?.position) === position
      ) ||
      prizes[position - 1] ||
      null;

    if (!prize) return null;

    const grupo = extractPrizeGrupo(prize);
    const milhar = normalizeMilhar(
      prize?.milhar ??
        prize?.numero ??
        prize?.number ??
        prize?.valor ??
        ""
    );

    if (
      !Number.isFinite(Number(grupo)) ||
      Number(grupo) < 1 ||
      Number(grupo) > 25
    ) {
      return null;
    }

    return {
      position,
      grupo: Number(grupo),
      milhar,
      animal: safeStr(prize?.animal || ""),
    };
  });
}

function podiumMedalFromPosition(position) {
  if (Number(position) === 1) return "gold";
  if (Number(position) === 2) return "silver";
  if (Number(position) === 3) return "bronze";
  return "";
}

function analyzeSnapshotHit(
  snapshot,
  officialPodium
) {
  return analyzeTop3Hits(
    snapshot,
    officialPodium
  );
}

export async function saveTop3PredictionSnapshot({
  lotteryKey,
  targetYmd,
  targetHour,
  picks,
  snapshot,
  engineVersion,
  replaceCurrentFutureSnapshot = false,
}) {
  let user = null;

  try {
    user = await loginAnonymous();
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: "AUTH_FAILED",
      error: String(error?.message || error || ""),
    };
  }

  if (!user?.uid) {
    return {
      ok: false,
      skipped: true,
      reason: "AUTH_REQUIRED",
    };
  }

  const lottery = normalizeLotteryKey(lotteryKey);
  const ymd = safeStr(targetYmd);
  const hour = normalizeHour(targetHour);
  const ref = predictionRef({
    lotteryKey: lottery,
    targetYmd: ymd,
    targetHour: hour,
  });

  if (!ref || !isYMD(ymd) || !hour) {
    return {
      ok: false,
      skipped: true,
      reason: "INVALID_TARGET",
    };
  }

  const normalizedSnapshot = normalizeSnapshot(snapshot);

  if (!normalizedSnapshot.length) {
    return {
      ok: false,
      skipped: true,
      reason: "EMPTY_SNAPSHOT",
    };
  }

  const normalizedPicks = Array.from(
    new Set(
      (Array.isArray(picks) ? picks : [])
        .map(Number)
        .filter((value) => value >= 1 && value <= 25)
    )
  ).slice(0, 3);

  const now = Date.now();

  const payload = cleanFirestoreValue({
    id: ref.id,
    lotteryKey: lottery,
    targetYmd: ymd,
    targetHour: hour,
    targetKey: `${ymd}_${hour}`,
    picks: normalizedPicks,
    snapshot: normalizedSnapshot,
    engineVersion: safeStr(engineVersion || "V3_STATISTICAL"),
    status: "predicted",
    resultGrupo: null,
    resultMilhar: "",
    resultAnimal: "",
    hitType: "",
    hitScore: 0,
    hitPosition: -1,
    predictionPosition: -1,
    resultPosition: -1,
    podiumMedal: "",
    matchedValue: "",
    matchedGrupo: null,
    matchedMilhar: "",
    matchedAnimal: "",
    hits: [],
    hitCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
  });

  const result = await runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);

    if (current.exists()) {
      /*
       * TOP3_CURRENT_MOTOR_AUTHORITY_V2
       *
       * O chamador somente envia replaceCurrentFutureSnapshot=true
       * para um target ainda futuro.
       *
       * Nesse caso, o calculo atual do motor substitui o snapshot
       * incorreto daquele MESMO lotteryKey + targetYmd + targetHour.
       *
       * Nenhum slot encerrado passa por esta regra.
       */
      if (replaceCurrentFutureSnapshot === true) {
        const previous = current.data() || {};

        const replacementPayload = {
          ...payload,

          /*
           * Mantem a data original de primeira criacao para auditoria,
           * mas registra updatedAt da sincronizacao correta.
           */
          createdAt:
            previous?.createdAt ||
            payload.createdAt ||
            now,

          updatedAt: now,
        };

        transaction.set(
          ref,
          replacementPayload
        );

        return {
          ok: true,
          created: false,
          existing: true,
          preserved: false,
          replaced: true,
          reason: "CURRENT_FUTURE_MOTOR_AUTHORITY",
          entry: {
            id: ref.id,
            ...replacementPayload,
          },
        };
      }

      /*
       * TOP3_FIRST_PUBLISHED_SNAPSHOT_IMMUTABLE_V1
       *
       * Para historico/slot encerrado, permanece exatamente
       * a regra de imutabilidade anterior.
       */
      return {
        ok: true,
        created: false,
        existing: true,
        preserved: true,
        replaced: false,
        reason: "FIRST_PUBLISHED_SNAPSHOT_IMMUTABLE",
        entry: {
          id: ref.id,
          ...current.data(),
        },
      };
    }

    transaction.set(ref, payload);

    return {
      ok: true,
      created: true,
      existing: false,
      entry: {
        id: ref.id,
        ...payload,
      },
    };
  });

  return result;
}

export async function loadTop3PredictionDay({
  lotteryKey,
  targetYmd,
  schedule,
}) {
  const lottery = normalizeLotteryKey(lotteryKey);
  const ymd = safeStr(targetYmd);

  if (!isYMD(ymd)) return [];

  const hours = Array.from(
    new Set(
      (Array.isArray(schedule) ? schedule : [])
        .map(normalizeHour)
        .filter(Boolean)
    )
  );

  
/*
 * TOP3_SNAPSHOT_SOURCE_TRACE_V1
 */
if (typeof window !== "undefined") {

  window.__TOP3_SNAPSHOT_SOURCE_TRACE__ = [];

  const __tracePush = (entry) => {
    try {
      window.__TOP3_SNAPSHOT_SOURCE_TRACE__.push(entry);
    } catch {}
  };

}
const snapshots = await Promise.all(
    hours.map(async (hour) => {
      const ref = predictionRef({
        lotteryKey: lottery,
        targetYmd: ymd,
        targetHour: hour,
      });

      if (!ref) return null;

      try {
        const snap = await getDoc(ref);

        if (typeof window !== "undefined") {

          console.log("[TOP3 GETDOC]",{
            requestedHour: hour,
            requestedId: ref.id,
            exists: snap.exists(),
            firestoreId: snap.id,
            dataTargetHour: snap.data()?.targetHour,
            dataTargetYmd: snap.data()?.targetYmd,
            dataTargetKey: snap.data()?.targetKey,
            snapshotLength: Array.isArray(snap.data()?.snapshot)
              ? snap.data().snapshot.length
              : 0
          });

        }

        if (!snap.exists()) return null;

        return {
          id: snap.id,
          ...snap.data(),
        };
      } catch {
        return null;
      }
    })
  );

  /*
 * TOP3_FIRESTORE_FILTER_TRACE_V1
 */

if (typeof window !== "undefined") {

  try {

    console.groupCollapsed(
      "[TOP3 FIRESTORE FILTER TRACE]"
    );

    snapshots.forEach((doc,index)=>{

      console.log({

        index,

        id: doc?.id,

        targetYmd: doc?.targetYmd,

        targetHour: doc?.targetHour,

        targetKey: doc?.targetKey,

        exists: !!doc,

        status: doc?.status,

        snapshotLength:
          Array.isArray(doc?.snapshot)
            ? doc.snapshot.length
            : 0,

        snapshotExists:
          Array.isArray(doc?.snapshot),

        engineVersion:
          doc?.engineVersion,

        predictionVersion:
          doc?.predictionVersion,

        createdAt:
          doc?.createdAt,

        updatedAt:
          doc?.updatedAt

      });

    });

    console.groupEnd();

  } catch {}

}

const resolvedSnapshots = snapshots
    .filter(Boolean)
    .sort((a, b) => {
      return normalizeHour(a?.targetHour).localeCompare(
        normalizeHour(b?.targetHour)
      );
    });

  /*
   * TOP3_HISTORY_RUNTIME_LOAD_TRACE_V1
   *
   * Instrumentação temporária.
   * Não altera documentos, snapshots ou ordem dos registros.
   */
  if (typeof window !== "undefined") {
    const diagnostic = {
      at: new Date().toISOString(),
      lotteryKey: lottery,
      targetYmd: ymd,
      requestedHours: hours,
      requestedIds: hours.map((hour) =>
        makePredictionId({
          lotteryKey: lottery,
          targetYmd: ymd,
          targetHour: hour,
        })
      ),
      returnedCount: resolvedSnapshots.length,
      returnedEntries: resolvedSnapshots.map((entry) => ({
        id: safeStr(entry?.id),
        lotteryKey: safeStr(entry?.lotteryKey),
        targetYmd: safeStr(entry?.targetYmd),
        targetHour: normalizeHour(entry?.targetHour),
        targetKey: safeStr(entry?.targetKey),
        status: safeStr(entry?.status),
        engineVersion: safeStr(entry?.engineVersion),
        snapshotLength: Array.isArray(entry?.snapshot)
          ? entry.snapshot.length
          : 0,
        grupos: (Array.isArray(entry?.snapshot)
          ? entry.snapshot
          : []
        )
          .slice(0, 3)
          .map((item) => Number(item?.grupo) || null),
      })),
    };

    const previous = Array.isArray(
      window.__TOP3_HISTORY_RUNTIME_LOAD_TRACE__
    )
      ? window.__TOP3_HISTORY_RUNTIME_LOAD_TRACE__
      : [];

    window.__TOP3_HISTORY_RUNTIME_LOAD_TRACE__ = [
      ...previous.slice(-49),
      diagnostic,
    ];

    try {
      window.localStorage.setItem(
        "top3_history_runtime_load_trace_last",
        JSON.stringify(diagnostic)
      );
    } catch {}

    console.info(
      "[TOP3 HISTORY RUNTIME LOAD TRACE]",
      diagnostic
    );
  }

  return resolvedSnapshots;
}

export async function reconcileTop3PredictionDay({
  lotteryKey,
  targetYmd,
  schedule,
  draws,
}) {
  let user = null;

  try {
    user = await loginAnonymous();
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: "AUTH_FAILED",
      error: String(error?.message || error || ""),
    };
  }

  if (!user?.uid) {
    return {
      ok: false,
      skipped: true,
      reason: "AUTH_REQUIRED",
    };
  }

  const history = await loadTop3PredictionDay({
    lotteryKey,
    targetYmd,
    schedule,
  });

  const lottery = normalizeLotteryKey(lotteryKey);
  let updated = 0;
  const reconciledHistory = [];

  for (const entry of history) {
    if (!entry) continue;

    const realDraw = findDrawForTarget({
      draws,
      targetYmd: entry?.targetYmd,
      targetHour: entry?.targetHour,
    });

    if (!realDraw) {
      reconciledHistory.push(entry);
      continue;
    }

    const officialPodium =
      extractOfficialPodium(realDraw);

    const firstOfficialPrize =
      officialPodium.find(
        (item) => Number(item?.position) === 1
      ) || null;

    const resultGrupo = Number(
      firstOfficialPrize?.grupo
    );

    if (
      !Number.isFinite(resultGrupo) ||
      resultGrupo < 1 ||
      resultGrupo > 25
    ) {
      reconciledHistory.push(entry);
      continue;
    }

    const resultMilhar = normalizeMilhar(
      firstOfficialPrize?.milhar
    );
    const savedLottery = safeStr(
      entry?.resultLotteryKey
    ).toUpperCase();
    const savedGrupo = Number(entry?.resultGrupo);
    const savedMilhar = normalizeMilhar(entry?.resultMilhar);

    const officialTop3Groups =
      officialPodium.map(
        (item) => Number(item?.grupo) || null
      );

    const officialTop3Milhares =
      officialPodium.map(
        (item) => normalizeMilhar(item?.milhar)
      );

    const savedTop3Groups = (
      Array.isArray(entry?.resultTop3Groups)
        ? entry.resultTop3Groups
        : []
    )
      .slice(0, 3)
      .map(
        (value) => Number(value) || null
      );

    const savedTop3Milhares = (
      Array.isArray(entry?.resultTop3Milhares)
        ? entry.resultTop3Milhares
        : []
    )
      .slice(0, 3)
      .map(normalizeMilhar);

    const officialPodiumSignature =
      JSON.stringify({
        groups: officialTop3Groups,
        milhares: officialTop3Milhares,
      });

    const savedPodiumSignature =
      JSON.stringify({
        groups: savedTop3Groups,
        milhares: savedTop3Milhares,
      });

    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      officialPodium
    );

    const savedHitsSignature =
      JSON.stringify(
        Array.isArray(entry?.hits)
          ? entry.hits
          : []
      );

    const analysisHitsSignature =
      JSON.stringify(
        Array.isArray(analysis?.hits)
          ? analysis.hits
          : []
      );

    const alreadyMatchesRealResult =
      entry?.status === "validated" &&
      savedLottery === lottery &&
      savedGrupo === resultGrupo &&
      savedMilhar === resultMilhar &&
      savedPodiumSignature ===
        officialPodiumSignature &&
      safeStr(entry?.hitType) === analysis.hitType &&
      Number(entry?.hitScore) === analysis.hitScore &&
      Number(entry?.hitPosition) === analysis.hitPosition &&
      Number(entry?.resultPosition ?? -1) ===
        Number(analysis.resultPosition ?? -1) &&
      safeStr(entry?.podiumMedal) ===
        safeStr(analysis.podiumMedal) &&
      safeStr(entry?.matchedValue) ===
        analysis.matchedValue &&
      savedHitsSignature ===
        analysisHitsSignature;

    if (alreadyMatchesRealResult) {
      reconciledHistory.push(entry);
      continue;
    }

    const ref = doc(db, COLLECTION, entry.id);
    const now = Date.now();

    const validationPayload = {
      resultGrupo,
      resultMilhar,
      resultLotteryKey: lottery,
      resultAnimal: safeStr(
        firstOfficialPrize?.animal ||
          extractPrize1(realDraw)?.animal ||
          ""
      ),
      resultTop3Groups:
        officialTop3Groups,
      resultTop3Milhares:
        officialTop3Milhares,
      hitType: analysis.hitType,
      hitScore: analysis.hitScore,
      hitPosition: analysis.hitPosition,
      predictionPosition: analysis.predictionPosition,
      resultPosition: analysis.resultPosition,
      podiumMedal: analysis.podiumMedal,
      matchedGrupo: analysis.matchedGrupo,
      matchedMilhar: analysis.matchedMilhar,
      matchedAnimal: analysis.matchedAnimal,
      matchedValue: analysis.matchedValue,

      hits: Array.isArray(analysis.hits)
        ? analysis.hits
        : [],

      hitCount: Array.isArray(
        analysis.hits
      )
        ? analysis.hits.length
        : 0,

      matchedPredictions: Number(
        analysis.matchedPredictions || 0
      ),

      matchedPrizePositions: Number(
        analysis.matchedPrizePositions || 0
      ),
      validatedAt: now,
      validatedBy: user.uid,
      updatedAt: now,
      status: "validated",
    };

    await setDoc(
      ref,
      validationPayload,
      { merge: true }
    );

    reconciledHistory.push({
      ...entry,
      ...validationPayload,
    });

    updated += 1;
  }

  return {
    ok: true,
    updated,
    history: reconciledHistory,
  };
}
