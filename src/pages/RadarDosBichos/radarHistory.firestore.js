import { getAuth as radarV25GetAuth } from 'firebase/auth';
import * as radarHistoryViewCore from './radarHistory';
import * as radarTopEngineView from './radarTop1Top7Engine';
import * as radarSourceHistoryView from './radarSource';
import { applyRadarCentenas24, loadRadarCentenas24Context } from './radarCentenas24';
import * as kingResultsHistoryView from '../../services/kingResultsService';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
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
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }

  const user = auth.currentUser;

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

  // Cria somente se nao existir.
  // O snapshot original nao pode ser sobrescrito.
  return runTransaction(db, async (tx) => {
    const current = await tx.get(ref);

    if (current.exists()) {
      return {
        saved: false,
        frozen: true,
        reason: "ALREADY_EXISTS",
        data: current.data(),
      };
    }

    if (!isRadarSlotOpenForSnapshot({ targetYmd, targetHour })) {
      return {
        saved: false,
        reason: "SLOT_CLOSED",
      };
    }

    tx.set(ref, payload);

    return {
      saved: true,
      frozen: true,
      data: payload,
    };
  });
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
  centenasContext = null,
  requireCentenasContext = false,
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

  const baseCards =
    radarTopEngineView
      .buildRadarCards({
        mode:
          normalizedMode,

        d1,
        d2,
        d3,
      });

  if (requireCentenasContext && !centenasContext?.valid) {
    return {
      ...base,
      status: 'source_unavailable',
      hitType: null,
    };
  }

  const cards = centenasContext?.valid
    ? applyRadarCentenas24(baseCards, centenasContext)
    : baseCards;

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

export async function radarLegacyHistoryViewDay({
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

  const centenasContexts = await Promise.allSettled(
    schedule.map((hour) =>
      loadRadarCentenas24Context({
        lotteryKey: lottery,
        targetDate: ymd,
        targetHour: hour,
      })
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

          centenasContext:
            centenasContexts[index]?.status === 'fulfilled'
              ? centenasContexts[index].value
              : null,

          requireCentenasContext: true,

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



// RADAR_HISTORY_VERIFIED_SERVER_V25
// Somente snapshots documentados antes do sorteio
// podem gerar acertos historicos confirmados.

function radarV25Decode(value) {
  if (!value || typeof value !== "object") return null;

  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    return (value.arrayValue?.values || []).map(radarV25Decode);
  }

  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue?.fields || {}).map(
        ([key, item]) => [key, radarV25Decode(item)]
      )
    );
  }

  return null;
}

async function radarV25ReadFromServer(ref) {
  const firebaseApp = ref.firestore.app;
  const projectId = firebaseApp.options.projectId;
  const readAuth = radarV25GetAuth(firebaseApp);

  if (typeof readAuth.authStateReady === "function") {
    await readAuth.authStateReady();
  }

  const user = readAuth.currentUser;

  if (!projectId || !user) {
    throw new Error("RADAR_V25_AUTH_REQUIRED");
  }

  const token = await user.getIdToken();
  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(projectId) +
    "/databases/(default)/documents/radar_predictions/" +
    encodeURIComponent(ref.id);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`RADAR_V25_READ_${response.status}`);
  }

  const document = await response.json();

  return {
    data: Object.fromEntries(
      Object.entries(document.fields || {}).map(
        ([key, value]) => [key, radarV25Decode(value)]
      )
    ),
    createdMs: Date.parse(document.createTime || ""),
    updatedMs: Date.parse(document.updateTime || ""),
  };
}

// RADAR_V28_ORIGINAL_ONLY
// Leitura de documento original. Nao grava e nao recalcula.
export async function loadRadarFrozenOriginal({
  lotteryKey,
  targetYmd,
  targetHour,
  mode,
} = {}) {
  const lottery = lotteryKeyOf(lotteryKey);
  const hour = normalizeRadarHistoryHour(targetHour);
  const selectedMode = radarHistoryViewMode(mode);

  const ref = radarPredictionRef({
    lotteryKey: lottery,
    targetYmd,
    targetHour: hour,
    mode: selectedMode,
  });

  const stored = await radarV25ReadFromServer(ref);

  if (!stored?.data) {
    return { status: "missing", cards: [] };
  }

  const record = stored.data;
  const cards = record.snapshot;
  const expected = selectedMode === "TOP1" ? 4 : 7;

  const cutoff = Date.parse(
    `${targetYmd}T${hour}:00-03:00`
  );

  const identityOk =
    record.lotteryKey === lottery &&
    record.targetYmd === targetYmd &&
    record.targetHour === hour &&
    record.mode === selectedMode;

  const timeOk =
    Number.isFinite(cutoff) &&
    Number.isFinite(stored.createdMs) &&
    stored.createdMs > 0 &&
    stored.createdMs < cutoff;

  const cardsOk =
    Array.isArray(cards) &&
    cards.length === expected &&
    cards.every((card) =>
      Array.isArray(card.rows) &&
      card.rows.length === 4 &&
      card.rows.every((row) =>
        Array.isArray(row.numbers) &&
        row.numbers.length === 6 &&
        row.numbers.every((item) =>
          /^\d{4}$/.test(String(item.milhar))
        )
      )
    );

  if (!identityOk || !timeOk || !cardsOk) {
    return {
      status: "unverified",
      cards: [],
      reason: !identityOk
        ? "IDENTITY"
        : !timeOk
          ? "TIME"
          : "FORMAT",
    };
  }

  return {
    status: "stored",
    cards,
    serverCreatedMs: stored.createdMs,
    serverUpdatedMs: stored.updatedMs,
  };
}

export async function loadRadarHistoryViewDay({
  lotteryKey,
  targetYmd,
  mode = null,
} = {}) {
  const lottery = lotteryKeyOf(lotteryKey);
  const ymd = safeString(targetYmd);
  const selectedMode = radarHistoryViewMode(mode);

  const schedule = radarHistoryScheduleForView({
    lotteryKey: lottery,
    targetYmd: ymd,
  });

  const draws = await loadOfficialDay({
    lotteryKey: lottery,
    targetYmd: ymd,
  });

  const byHour = new Map(
    (Array.isArray(draws) ? draws : []).map((draw) => [
      normalizeRadarHistoryHour(draw.hour),
      draw,
    ])
  );

  const records = await Promise.all(
    schedule.map(async (hour) => {
      const ref = radarPredictionRef({
        lotteryKey: lottery,
        targetYmd: ymd,
        targetHour: hour,
        mode: selectedMode,
      });

      try {
        return {
          hour,
          id: ref.id,
          stored: await radarV25ReadFromServer(ref),
          error: null,
        };
      } catch (error) {
        console.warn(
          "[RADAR_V25_SNAPSHOT]",
          lottery,
          ymd,
          hour,
          error
        );

        return {
          hour,
          id: ref.id,
          stored: null,
          error: "SNAPSHOT_READ_FAILED",
        };
      }
    })
  );

  const entries = records.map(({ hour, id, stored, error }) => {
    const draw = byHour.get(hour) || null;
    const record = stored?.data || null;
    const snapshot = record?.snapshot;

    const base = {
      id,
      lotteryKey: lottery,
      targetYmd: ymd,
      targetHour: hour,
      mode: selectedMode,
      predictionType: "RADAR",
    };

    const cutoff = /^\d{2}:\d{2}$/.test(hour)
      ? Date.parse(`${ymd}T${hour}:00-03:00`)
      : NaN;

    const correctIdentity =
      record?.lotteryKey === lottery &&
      record?.targetYmd === ymd &&
      record?.targetHour === hour &&
      record?.mode === selectedMode;

    const originalBeforeDraw =
      Number.isFinite(cutoff) &&
      Number.isFinite(stored?.createdMs) &&
      stored.createdMs > 0 &&
      stored.createdMs < cutoff;

    const expectedCards = selectedMode === "TOP1" ? 4 : 7;

    const validCards =
      Array.isArray(snapshot) &&
      snapshot.length === expectedCards &&
      snapshot.every((card) => {
        const legacyValid =
          Array.isArray(card?.milhares) &&
          card.milhares.length > 0 &&
          card.milhares.every((value) =>
            /^\d{4}$/.test(String(value))
          ) &&
          (
            ymd < "2026-10-15" ||
            card.milhares.length === 24
          );

        const rowsValid =
          Array.isArray(card?.rows) &&
          card.rows.length === 4 &&
          card.rows.every((row) =>
            Array.isArray(row?.numbers) &&
            row.numbers.length === 6 &&
            row.numbers.every((item) =>
              /^\d{4}$/.test(String(item?.milhar))
            )
          );

        return legacyValid || rowsValid;
      });
    const verified =
      !error &&
      correctIdentity &&
      originalBeforeDraw &&
      validCards;

    const reason = error ||
      (!record
        ? "NO_STORED_SNAPSHOT"
        : !correctIdentity
          ? "SNAPSHOT_IDENTITY_MISMATCH"
          : !originalBeforeDraw
            ? "SNAPSHOT_TIME_NOT_VERIFIED"
            : !validCards
              ? "SNAPSHOT_FORMAT_INVALID"
              : null);

    if (!verified) {
      return {
        ...base,
        status: draw?.prizes?.length
          ? "unverified"
          : "predicted",
        snapshot: Array.isArray(snapshot) ? snapshot : [],
        hitType: null,
        hitCount: 0,
        hits: [],
        verificationReason: reason,
        serverCreatedMs: stored?.createdMs ?? null,
        serverUpdatedMs: stored?.updatedMs ?? null,
      };
    }

    const prizes = (
      Array.isArray(draw?.prizes) ? draw.prizes : []
    ).filter((prize) => {
      const position = Number(prize?.position);
      return selectedMode === "TOP1"
        ? position === 1
        : position >= 1 && position <= 7;
    });

    if (!prizes.length) {
      return {
        ...base,
        ...record,
        status: "predicted",
        snapshot,
        hitType: null,
        hitCount: 0,
        hits: [],
      };
    }

    const analysis =
      radarHistoryViewCore.analyzeRadarPrediction({
        snapshot,
        prizes,
      });

    return {
      ...record,
      ...base,
      status: "validated",
      snapshot,
      resultPrizes: prizes,
      verificationSource: "SERVER_PRE_DRAW_SNAPSHOT",
      serverCreatedMs: stored.createdMs,
      serverUpdatedMs: stored.updatedMs,
      ...analysis,
    };
  });

  // RADAR_RETROSPECTIVE_FALLBACK_V1
  const missing = entries.some(
    (entry) =>
      entry.status === "unverified" &&
      entry.verificationReason === "NO_STORED_SNAPSHOT"
  );

  if (!missing) return entries;

  let reconstructed;

  try {
    reconstructed = await radarLegacyHistoryViewDay({
      lotteryKey: lottery,
      targetYmd: ymd,
      mode: selectedMode,
    });
  } catch (error) {
    console.warn("[RADAR_RETROSPECTIVE]", error);
    return entries;
  }

  const retrospectiveByHour = new Map(
    (Array.isArray(reconstructed) ? reconstructed : []).map(
      (entry) => [entry.targetHour, entry]
    )
  );

  return entries.map((entry) => {
    if (
      entry.status !== "unverified" ||
      entry.verificationReason !== "NO_STORED_SNAPSHOT"
    ) return entry;

    const simulated = retrospectiveByHour.get(entry.targetHour);

    if (simulated?.status !== "validated") return entry;

    return {
      ...entry,
      status: "retrospective",
      snapshot: simulated.snapshot,
      hitType: simulated.hitType,
      hitScore: simulated.hitScore,
      hitCount: simulated.hitCount,
      hits: simulated.hits,
      predictionPosition: simulated.predictionPosition,
      predictionRank: simulated.predictionRank,
      resultPosition: simulated.resultPosition,
      matchedGrupo: simulated.matchedGrupo,
      matchedMilhar: simulated.matchedMilhar,
      matchedCentena: simulated.matchedCentena,
      matchedDezena: simulated.matchedDezena,
      matchedValue: simulated.matchedValue,
      resultPrizes: simulated.resultPrizes,
      verificationSource: "RETROSPECTIVE_RECONSTRUCTION",
    };
  });
}
