import * as radarHistoryViewCore from './radarHistory';
import * as radarTopEngineView from './radarTop1Top7Engine';
import * as radarSourceHistoryView from './radarSource';
import * as kingResultsHistoryView from '../../services/kingResultsService';
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

/*
 * RADAR_HISTORY_VIEW_V4
 *
 * Historico visual independente dos snapshots antigos.
 *
 * A grade oficial define TODAS as linhas.
 * Cada horario reconstrói sua propria previsao AS-OF.
 * TOP1 e TOP7 sao conferidos separadamente.
 *
 * Esta view e somente leitura.
 * Nao grava nem apaga documentos do Firestore.
 */

const RADAR_HISTORY_VIEW_HOURS = Object.freeze([
  '02:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '11:30',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '19:30',
  '20:00',
  '21:00',
  '23:00',
]);

function radarHistoryViewAddDays(
  ymd,
  amount
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      safeString(
        ymd
      )
    );

  if (!match) {
    return '';
  }

  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      )
    );

  date.setUTCDate(
    date.getUTCDate() +
      Number(amount || 0)
  );

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

function radarHistoryViewMode(
  mode
) {
  const value =
    safeString(
      mode
    ).toUpperCase();

  if (
    value !== 'TOP1' &&
    value !== 'TOP7'
  ) {
    throw new Error(
      `RADAR_HISTORY_VIEW_INVALID_MODE=${value || 'EMPTY'}`
    );
  }

  return value;
}

function radarHistoryViewMilhar(
  source,
  key
) {
  const direct =
    safeString(
      source?.[key]
    );

  if (
    /^\d{4}$/.test(
      direct
    )
  ) {
    return direct;
  }

  const nested =
    safeString(
      source?.days?.[key]?.milhar
    );

  if (
    /^\d{4}$/.test(
      nested
    )
  ) {
    return nested;
  }

  return '';
}

export function radarHistoryScheduleForView({
  lotteryKey,
  targetYmd,
} = {}) {
  return (
    RADAR_HISTORY_VIEW_HOURS
      .filter(
        (targetHour) => {
          try {
            return (
              isRadarHistoryScheduledSlot({
                lotteryKey,
                targetYmd,
                targetHour,
              }) === true
            );
          }
          catch {
            return false;
          }
        }
      )
  );
}

export function buildRadarHistoryViewEntry({
  lotteryKey,
  targetYmd,
  targetHour,
  mode,
  source,
  draw = null,
} = {}) {
  const normalizedMode =
    radarHistoryViewMode(
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

  const base = {
    id:
      [
        lottery,
        safeString(targetYmd),
        hour,
        normalizedMode,
        'VIEW_V4',
      ].join('__'),

    lotteryKey:
      lottery,

    targetYmd:
      safeString(
        targetYmd
      ),

    targetHour:
      hour,

    mode:
      normalizedMode,

    predictionType:
      'RADAR_VIEW_V4',
  };

  const d1 =
    radarHistoryViewMilhar(
      source,
      'd1'
    );

  const d2 =
    radarHistoryViewMilhar(
      source,
      'd2'
    );

  const d3 =
    radarHistoryViewMilhar(
      source,
      'd3'
    );

  if (
    !/^\d{4}$/.test(d1) ||
    !/^\d{4}$/.test(d2) ||
    !/^\d{4}$/.test(d3)
  ) {
    return {
      ...base,

      status:
        'source_unavailable',

      hitType:
        null,
    };
  }

  const cards =
    radarTopEngineView
      .buildRadarCards({
        mode:
          normalizedMode,

        d1,
        d2,
        d3,
      });

  const snapshot =
    radarHistoryViewCore
      .buildRadarPredictionSnapshot({
        mode:
          normalizedMode,

        cards,
      });

  if (
    !draw?.prizes?.length
  ) {
    return {
      ...base,

      status:
        'predicted',

      snapshot,

      hitType:
        null,
    };
  }


  /*
   * RADAR_HISTORY_PRIZE_SCOPE_V5
   *
   * TOP1:
   * compara somente o primeiro premio.
   *
   * TOP7:
   * compara os premios do primeiro ao setimo.
   *
   * A selecao de cards continua sendo definida
   * pelo motor de cada modo.
   */
  const prizesForMode =
    (
      Array.isArray(
        draw?.prizes
      )
        ? draw.prizes
        : []
    )
      .filter(
        (prize) => {
          const position =
            Number(
              prize?.position
            );

          if (
            normalizedMode ===
            'TOP1'
          ) {
            return (
              position === 1
            );
          }

          return (
            position >= 1 &&
            position <= 7
          );
        }
      );

  const analysis =
    radarHistoryViewCore
      .analyzeRadarPrediction({
        snapshot,

        prizes:
          prizesForMode,
      });

  return {
    ...base,

    status:
      'validated',

    snapshot,

    resultPrizes:
      prizesForMode,

    ...analysis,
  };
}

export async function loadRadarHistoryViewDay({
  lotteryKey,
  targetYmd,
  mode = null,
} = {}) {
  const normalizedMode =
    radarHistoryViewMode(
      mode
    );

  const lottery =
    lotteryKeyOf(
      lotteryKey
    );

  const ymd =
    safeString(
      targetYmd
    );

  const schedule =
    radarHistoryScheduleForView({
      lotteryKey:
        lottery,

      targetYmd:
        ymd,
    });

  const lookbackDays =
    Number(
      radarSourceHistoryView
        .RADAR_SOURCE_LOOKBACK_DAYS ||
      45
    );

  const dateFrom =
    radarHistoryViewAddDays(
      ymd,
      -lookbackDays
    );

  const [
    officialDraws,
    sourceDraws,
  ] =
    await Promise.all([
      loadOfficialDay({
        lotteryKey:
          lottery,

        targetYmd:
          ymd,
      }),

      kingResultsHistoryView
        .getKingResultsByRange({
          uf:
            lottery,

          dateFrom,

          dateTo:
            ymd,

          positions: [
            1,
          ],

          mode:
            'aggregated',
        }),
    ]);

  const byHour =
    new Map(
      (
        Array.isArray(
          officialDraws
        )
          ? officialDraws
          : []
      ).map(
        (draw) => [
          normalizeRadarHistoryHour(
            draw.hour
          ),

          draw,
        ]
      )
    );

  return schedule.map(
    (
      targetHour,
      index
    ) => {
      let source =
        null;

      try {
        source =
          radarSourceHistoryView
            .buildRadarHistorySource({
              lotteryKey:
                lottery,

              targetDate:
                ymd,

              targetHour,

              draws:
                sourceDraws,
            });
      }
      catch (error) {
        console.warn(
          '[RADAR_HISTORY_VIEW_V4_SOURCE]',
          lottery,
          ymd,
          targetHour,
          error
        );
      }

      return {
        ...buildRadarHistoryViewEntry({
          lotteryKey:
            lottery,

          targetYmd:
            ymd,

          targetHour,

          mode:
            normalizedMode,

          source,

          draw:
            byHour.get(
              targetHour
            ) ||
            null,
        }),

        schedulePosition:
          index + 1,
      };
    }
  );
}
