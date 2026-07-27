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
      milhares20: Array.isArray(item?.milhares20)
        ? item.milhares20.map(normalizeMilhar).filter(Boolean).slice(0, 20)
        : [],
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

function analyzeSnapshotHit(snapshot, resultGrupo, resultMilhar) {
  const top3 = Array.isArray(snapshot) ? snapshot.slice(0, 3) : [];
  const grupo = Number(resultGrupo);
  const milhar = normalizeMilhar(resultMilhar);
  const centena = milhar ? milhar.slice(-3) : "";

  let best = {
    hitType: "miss",
    hitScore: 0,
    hitPosition: -1,
    matchedValue: "",
  };

  top3.forEach((item, index) => {
    const itemGrupo = Number(item?.grupo);

    const milhares = (Array.isArray(item?.milhares20)
      ? item.milhares20
      : []
    )
      .map(normalizeMilhar)
      .filter(Boolean);

    const centenas = milhares.map((value) => value.slice(-3));

    if (milhar && milhares.includes(milhar)) {
      best = {
        hitType: "hit_exact",
        hitScore: 100,
        hitPosition: index + 1,
        matchedValue: milhar,
      };
      return;
    }

    if (
      best.hitScore < 66.67 &&
      centena &&
      centenas.includes(centena)
    ) {
      best = {
        hitType: "hit_centena",
        hitScore: 66.67,
        hitPosition: index + 1,
        matchedValue: centena,
      };
      return;
    }

    if (
      best.hitScore < 33.33 &&
      Number.isFinite(grupo) &&
      itemGrupo === grupo
    ) {
      best = {
        hitType: "hit_grupo",
        hitScore: 33.33,
        hitPosition: index + 1,
        matchedValue: milhar ? milhar.slice(-2) : "",
      };
    }
  });

  return best;
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

    const resultGrupo = Number(
      pickPrize1GrupoFromDraw(realDraw)
    );

    if (
      !Number.isFinite(resultGrupo) ||
      resultGrupo < 1 ||
      resultGrupo > 25
    ) {
      reconciledHistory.push(entry);
      continue;
    }

    const resultMilhar = extractPrize1Milhar(realDraw);
    const savedLottery = safeStr(
      entry?.resultLotteryKey
    ).toUpperCase();
    const savedGrupo = Number(entry?.resultGrupo);
    const savedMilhar = normalizeMilhar(entry?.resultMilhar);

    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      resultGrupo,
      resultMilhar
    );

    const alreadyMatchesRealResult =
      entry?.status === "validated" &&
      savedLottery === lottery &&
      savedGrupo === resultGrupo &&
      savedMilhar === resultMilhar &&
      safeStr(entry?.hitType) === analysis.hitType &&
      Number(entry?.hitScore) === analysis.hitScore &&
      Number(entry?.hitPosition) === analysis.hitPosition &&
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
        extractPrize1(realDraw)?.animal || ""
      ),
      hitType: analysis.hitType,
      hitScore: analysis.hitScore,
      hitPosition: analysis.hitPosition,
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
