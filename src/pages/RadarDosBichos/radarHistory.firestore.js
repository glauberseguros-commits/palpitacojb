import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import {
  getAuth,
} from 'firebase/auth';

import app from '../../services/firebase';

import {
  getKingResultsByRange,
} from '../../services/kingResultsService';

import {
  analyzeRadarPrediction,
  buildRadarHistorySourceSnapshot,
  buildRadarPredictionSnapshot,
  isRadarSlotOpenForSnapshot,
  normalizeRadarHistoryHour,
  normalizeRadarHistoryMode,
  normalizeRadarPrize,
  radarPredictionId,
} from './radarHistory';

import {
  getRadarScheduleForDate,
} from './radarSchedule';

const db =
  getFirestore(
    app
  );

const auth =
  getAuth(
    app
  );

const COLLECTION =
  'radar_predictions';

function safeString(
  value
) {
  return String(
    value ?? ''
  ).trim();
}

function lotteryKeyOf(
  value
) {
  return safeString(
    value
  ).toUpperCase();
}

export function isRadarHistoryScheduledSlot({
  lotteryKey,
  targetYmd,
  targetHour,
} = {}) {
  const lottery =
    lotteryKeyOf(
      lotteryKey
    );

  const ymd =
    safeString(
      targetYmd
    );

  if (
    !lottery ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      ymd
    )
  ) {
    return false;
  }

  let hour =
    '';

  try {
    hour =
      normalizeRadarHistoryHour(
        targetHour
      );
  } catch {
    return false;
  }

  const schedule =
    getRadarScheduleForDate(
      lottery,
      ymd
    );

  const normalizedSchedule =
    (
      Array.isArray(schedule)
        ? schedule
        : []
    )
      .map(
        (item) => {
          try {
            return normalizeRadarHistoryHour(
              item
            );
          } catch {
            return '';
          }
        }
      )
      .filter(Boolean);

  return normalizedSchedule.includes(
    hour
  );
}

function drawYmd(
  draw
) {
  return safeString(
    draw?.ymd ??
    draw?.date ??
    draw?.draw_date
  );
}

function drawHour(
  draw
) {
  const raw =
    draw?.close_hour ??
    draw?.closeHour ??
    draw?.hour ??
    draw?.hora ??
    '';

  try {
    return (
      normalizeRadarHistoryHour(
        raw
      )
    );
  } catch {
    return '';
  }
}

export function normalizeRadarOfficialDraws(
  draws
) {
  return (
    Array.isArray(
      draws
    )
      ? draws
      : []
  )
    .map(
      (draw) => {
        const prizes =
          (
            Array.isArray(
              draw?.prizes
            )
              ? draw.prizes
              : []
          )
            .map(
              normalizeRadarPrize
            )
            .filter(Boolean);

        return {
          ymd:
            drawYmd(
              draw
            ),

          hour:
            drawHour(
              draw
            ),

          prizes,
        };
      }
    )
    .filter(
      (draw) =>
        draw.ymd &&
        draw.hour &&
        draw.prizes.length
    );
}

export function radarPredictionRef({
  lotteryKey,
  targetYmd,
  targetHour,
  mode,
} = {}) {
  return doc(
    db,
    COLLECTION,
    radarPredictionId({
      lotteryKey,
      targetYmd,
      targetHour,
      mode,
    })
  );
}

export async function saveRadarPredictionSnapshot({
  lotteryKey,
  targetYmd,
  targetHour,
  mode,
  cards,
  source,
  now = new Date(),
} = {}) {
  const user =
    auth.currentUser;

  if (!user?.uid) {
    return {
      saved:
        false,

      reason:
        'AUTH_REQUIRED',
    };
  }

  if (
    !isRadarHistoryScheduledSlot({
      lotteryKey,
      targetYmd,
      targetHour,
    })
  ) {
    return {
      saved:
        false,

      reason:
        'INVALID_SCHEDULE_SLOT',
    };
  }

  if (
    !isRadarSlotOpenForSnapshot({
      targetYmd,
      targetHour,
      now,
    })
  ) {
    return {
      saved:
        false,

      reason:
        'SLOT_CLOSED',
    };
  }

  const normalizedMode =
    normalizeRadarHistoryMode(
      mode
    );

  const lottery =
    lotteryKeyOf(
      lotteryKey
    );

  const hour =
    normalizeRadarHistoryHour(
      targetHour
    );

  const ref =
    radarPredictionRef({
      lotteryKey:
        lottery,

      targetYmd,

      targetHour:
        hour,

      mode:
        normalizedMode,
    });

  const existing =
    await getDoc(
      ref
    );

  if (
    existing.exists()
  ) {
    return {
      saved:
        false,

      frozen:
        true,

      reason:
        'ALREADY_EXISTS',

      data:
        existing.data(),
    };
  }

  const snapshot =
    buildRadarPredictionSnapshot({
      mode:
        normalizedMode,

      cards,
    });

  const sourceSnapshot =
    buildRadarHistorySourceSnapshot(
      source
    );

  const nowMs =
    Date.now();

  const payload = {
    id:
      ref.id,

    lotteryKey:
      lottery,

    targetYmd:
      safeString(
        targetYmd
      ),

    targetHour:
      hour,

    targetKey:
      `${safeString(targetYmd)}_${hour}`,

    predictionType:
      'RADAR',

    mode:
      normalizedMode,

    status:
      'predicted',

    source:
      sourceSnapshot,

    snapshot,

    createdBy:
      user.uid,

    createdAtMs:
      nowMs,

    updatedAtMs:
      nowMs,
  };

  await setDoc(
    ref,
    payload
  );

  return {
    saved:
      true,

    frozen:
      true,

    data:
      payload,
  };
}

export async function loadRadarPredictionDay({
  lotteryKey,
  targetYmd,
  mode = null,
} = {}) {
  const user =
    auth.currentUser;

  if (!user?.uid) {
    return [];
  }

  const ymd =
    safeString(
      targetYmd
    );

  const lottery =
    lotteryKeyOf(
      lotteryKey
    );

  const normalizedMode =
    mode
      ? normalizeRadarHistoryMode(
          mode
        )
      : null;

  const snap =
    await getDocs(
      query(
        collection(
          db,
          COLLECTION
        ),
        where(
          'targetYmd',
          '==',
          ymd
        )
      )
    );

  return snap.docs
    .map(
      (item) => ({
        id:
          item.id,

        ...item.data(),
      })
    )
    .filter(
      (item) =>
        lotteryKeyOf(
          item?.lotteryKey
        ) === lottery &&
        (
          !normalizedMode ||
          safeString(
            item?.mode
          ).toUpperCase() ===
            normalizedMode
        )
    )
    .filter(
      (item) =>
        isRadarHistoryScheduledSlot({
          lotteryKey:
            item?.lotteryKey,

          targetYmd:
            item?.targetYmd,

          targetHour:
            item?.targetHour,
        })
    )
    .sort(
      (a, b) =>
        safeString(
          a?.targetHour
        ).localeCompare(
          safeString(
            b?.targetHour
          )
        )
    );
}

async function loadOfficialDay({
  lotteryKey,
  targetYmd,
} = {}) {
  const lottery =
    lotteryKeyOf(
      lotteryKey
    );

  const draws =
    await getKingResultsByRange({
      uf:
        lottery,

      dateFrom:
        targetYmd,

      dateTo:
        targetYmd,

      positions:
        [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
        ],

      mode:
        'detailed',

      bypassCache:
        true,
    });

  return (
    normalizeRadarOfficialDraws(
      draws
    )
  );
}

export async function validateRadarPrediction({
  entry,
  prizes,
} = {}) {
  const user =
    auth.currentUser;

  if (
    !user?.uid ||
    !entry?.id
  ) {
    return {
      updated:
        false,

      reason:
        'AUTH_REQUIRED',
    };
  }

  if (
    safeString(
      entry?.status
    ) ===
    'validated'
  ) {
    return {
      updated:
        false,

      reason:
        'ALREADY_VALIDATED',

      data:
        entry,
    };
  }

  const analysis =
    analyzeRadarPrediction({
      snapshot:
        entry?.snapshot,

      prizes,
    });

  const normalizedPrizes =
    (
      Array.isArray(
        prizes
      )
        ? prizes
        : []
    )
      .map(
        normalizeRadarPrize
      )
      .filter(Boolean);

  if (
    !normalizedPrizes.length
  ) {
    return {
      updated:
        false,

      reason:
        'RESULT_NOT_AVAILABLE',
    };
  }

  const nowMs =
    Date.now();

  const payload = {
    resultPrizes:
      normalizedPrizes,

    hitType:
      analysis.hitType,

    hitScore:
      analysis.hitScore,

    hitPosition:
      analysis.hitPosition,

    predictionPosition:
      analysis.predictionPosition,

    predictionRank:
      analysis.predictionRank,

    resultPosition:
      analysis.resultPosition,

    matchedGrupo:
      analysis.matchedGrupo,

    matchedMilhar:
      analysis.matchedMilhar,

    matchedCentena:
      analysis.matchedCentena,

    matchedDezena:
      analysis.matchedDezena,

    matchedValue:
      analysis.matchedValue,

    hits:
      analysis.hits,

    hitCount:
      analysis.hitCount,

    validatedAtMs:
      nowMs,

    validatedBy:
      user.uid,

    updatedAtMs:
      nowMs,

    status:
      'validated',
  };

  await updateDoc(
    doc(
      db,
      COLLECTION,
      entry.id
    ),
    payload
  );

  return {
    updated:
      true,

    data: {
      ...entry,
      ...payload,
    },
  };
}

export async function syncRadarPredictionDay({
  lotteryKey,
  targetYmd,
  mode = null,
} = {}) {
  const entries =
    await loadRadarPredictionDay({
      lotteryKey,
      targetYmd,
      mode,
    });

  if (!entries.length) {
    return [];
  }

  const draws =
    await loadOfficialDay({
      lotteryKey,
      targetYmd,
    });

  const byHour =
    new Map(
      draws.map(
        (draw) => [
          draw.hour,
          draw,
        ]
      )
    );

  const resolved = [];

  for (
    const entry
    of entries
  ) {
    const hour =
      normalizeRadarHistoryHour(
        entry.targetHour
      );

    const draw =
      byHour.get(
        hour
      );

    if (
      !draw?.prizes?.length
    ) {
      resolved.push(
        entry
      );

      continue;
    }

    const result =
      await validateRadarPrediction({
        entry,
        prizes:
          draw.prizes,
      });

    resolved.push(
      result.data ||
      entry
    );
  }

  return resolved;
}