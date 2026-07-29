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

function analyzeSnapshotHit(snapshot, officialPodium) {
  const top3 = Array.isArray(snapshot)
    ? snapshot.slice(0, 3)
    : [];

  const podium = Array.isArray(officialPodium)
    ? officialPodium.filter(Boolean).slice(0, 3)
    : [];

  const missResult = {
    hitType: "miss",
    hitScore: 0,
    hitPosition: -1,
    predictionPosition: -1,
    resultPosition: -1,
    podiumMedal: "",
    matchedValue: "",
    matchedGrupo: null,
    matchedMilhar: "",
    matchedAnimal: "",
  };

  if (!top3.length || !podium.length) {
    return missResult;
  }

  const hitPriority = {
    hit_exact: 4,
    hit_centena: 3,
    hit_dezena: 2,
    hit_grupo: 1,
    miss: 0,
  };

  let bestHit = null;
  let bestPriority = 0;

  for (const officialPrize of podium) {
    const resultGrupo = Number(
      officialPrize?.grupo
    );

    const resultMilhar = normalizeMilhar(
      officialPrize?.milhar
    );

    const resultCentena = resultMilhar
      ? resultMilhar.slice(-3)
      : "";

    const resultDezena = resultMilhar
      ? resultMilhar.slice(-2)
      : "";

    const resultPosition = Number(
      officialPrize?.position
    );

    for (
      let predictionIndex = 0;
      predictionIndex < top3.length;
      predictionIndex += 1
    ) {
      const prediction = top3[predictionIndex];

      const predictionGrupo = Number(
        prediction?.grupo
      );

      const milhares = (
        Array.isArray(prediction?.milhares24)
          ? prediction.milhares24
          : Array.isArray(prediction?.milhares20)
            ? prediction.milhares20
            : Array.isArray(prediction?.milhares)
              ? prediction.milhares
              : []
      )
        .map(normalizeMilhar)
        .filter(Boolean);

      const centenas = milhares.map(
        (value) => value.slice(-3)
      );

      const dezenas = milhares.map(
        (value) => value.slice(-2)
      );

      let hitType = "miss";
      let hitScore = 0;
      let matchedValue = "";

      if (
        resultMilhar &&
        milhares.includes(resultMilhar)
      ) {
        hitType = "hit_exact";
        hitScore = 100;
        matchedValue = resultMilhar;
      } else if (
        resultCentena &&
        centenas.includes(resultCentena)
      ) {
        hitType = "hit_centena";
        hitScore = 66.67;
        matchedValue = resultCentena;
      } else if (
        resultDezena &&
        dezenas.includes(resultDezena)
      ) {
        hitType = "hit_dezena";
        hitScore = 33.33;
        matchedValue = resultDezena;
      } else if (
        Number.isFinite(resultGrupo) &&
        predictionGrupo === resultGrupo
      ) {
        hitType = "hit_grupo";
        hitScore = 33.33;
        matchedValue = String(
          resultGrupo
        ).padStart(2, "0");
      }

      const candidatePriority =
        hitPriority[hitType] || 0;

      if (!candidatePriority) {
        continue;
      }

      const candidate = {
        hitType,
        hitScore,
        hitPosition: predictionIndex + 1,
        predictionPosition: predictionIndex + 1,
        resultPosition,
        podiumMedal:
          podiumMedalFromPosition(resultPosition),
        matchedValue,
        matchedGrupo: resultGrupo,
        matchedMilhar: resultMilhar,
        matchedAnimal: safeStr(
          officialPrize?.animal || ""
        ),
      };

      const shouldReplace =
        candidatePriority > bestPriority ||
        (
          candidatePriority === bestPriority &&
          (
            !bestHit ||
            resultPosition < bestHit.resultPosition ||
            (
              resultPosition === bestHit.resultPosition &&
              candidate.predictionPosition <
                bestHit.predictionPosition
            )
          )
        );

      if (shouldReplace) {
        bestHit = candidate;
        bestPriority = candidatePriority;
      }
    }
  }

  return bestHit || missResult;
}

export async function saveTop3PredictionSnapshot({
  lotteryKey,
  targetYmd,
  targetHour,
  picks,
  snapshot,
  engineVersion,
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
    matchedValue: "",
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
  });

  const result = await runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);

    if (current.exists()) {
      return {
        ok: true,
        created: false,
        existing: true,
      };
    }

    transaction.set(ref, payload);

    return {
      ok: true,
      created: true,
      existing: false,
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

  return snapshots
    .filter(Boolean)
    .sort((a, b) => {
      return normalizeHour(a?.targetHour).localeCompare(
        normalizeHour(b?.targetHour)
      );
    });
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

    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      officialPodium
    );

    const alreadyMatchesRealResult =
      entry?.status === "validated" &&
      savedLottery === lottery &&
      savedGrupo === resultGrupo &&
      savedMilhar === resultMilhar &&
      safeStr(entry?.hitType) === analysis.hitType &&
      Number(entry?.hitScore) === analysis.hitScore &&
      Number(entry?.hitPosition) === analysis.hitPosition &&
      Number(entry?.resultPosition ?? -1) ===
        Number(analysis.resultPosition ?? -1) &&
      safeStr(entry?.podiumMedal) ===
        safeStr(analysis.podiumMedal) &&
      safeStr(entry?.matchedValue) === analysis.matchedValue;

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
      resultTop3Groups: officialPodium.map(
        (item) => Number(item?.grupo) || null
      ),
      resultTop3Milhares: officialPodium.map(
        (item) => normalizeMilhar(item?.milhar)
      ),
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

