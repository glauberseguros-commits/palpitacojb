/*
 * PALPITACO JB
 * LOTERIA NACIONAL
 *
 * NACIONAL_MASTER56_PRODUCTION_V1
 *
 * Matriz final:
 * - 56 contextos dia x horario
 * - 18 R1_CALIBRATED
 * - 38 CURRENT_NACIONAL
 *
 * Contrato R1:
 * - selecao por DOW x horario nominal;
 * - janela aplicada antes do V3;
 * - somente historia estritamente anterior ao alvo;
 * - score = soma de contributionBeforeScene das camadas selecionadas;
 * - desempate = score exato, depois grupo crescente;
 * - sem segunda renormalizacao;
 * - scene nao participa do score R1;
 * - 20h legado e 21h atual permanecem distintos.
 *
 * Este modulo nao acessa Firestore.
 */

export const NACIONAL_MASTER56_PRODUCTION_VERSION =
  "NACIONAL_MASTER56_PRODUCTION_V1";

export const NACIONAL_MASTER56_MATRIX_CERTIFICATE_SHA256 =
  "7A1EF247751276F01EB72DC3872A63BB7AD7CDD6ADB0EC54D2F64E3DEE1DEF83";

const R1_CONTEXTS =
  Object.freeze(
{
  "0|02h": {
    "day": "DOMINGO",
    "dow": 0,
    "hour": "02h",
    "window": "CAL_MONTH",
    "profile": "HOUR+DAY_MONTH+TRANSITION+RECENT",
    "layers": [
      "hour",
      "dayMonth",
      "transition",
      "recent"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "0|10h": {
    "day": "DOMINGO",
    "dow": 0,
    "hour": "10h",
    "window": "FULL",
    "profile": "HOUR+DAY_MONTH+RECENT",
    "layers": [
      "hour",
      "dayMonth",
      "recent"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "1|10h": {
    "day": "SEGUNDA",
    "dow": 1,
    "hour": "10h",
    "window": "ROLL_180D",
    "profile": "HOUR+DAY_MONTH+RECENT",
    "layers": [
      "hour",
      "dayMonth",
      "recent"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "1|12h": {
    "day": "SEGUNDA",
    "dow": 1,
    "hour": "12h",
    "window": "ROLL_365D",
    "profile": "HOUR+DAY_MONTH",
    "layers": [
      "hour",
      "dayMonth"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "1|21h": {
    "day": "SEGUNDA",
    "dow": 1,
    "hour": "21h",
    "window": "ROLL_365D",
    "profile": "HOUR+DAY_MONTH+TRANSITION+RECENT",
    "layers": [
      "hour",
      "dayMonth",
      "transition",
      "recent"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_LOW_N_EXCEPTION",
    "independentHoldout": "YES"
  },
  "2|08h": {
    "day": "TERCA",
    "dow": 2,
    "hour": "08h",
    "window": "ROLL_180D",
    "profile": "HOUR+DOW_HOUR+TRANSITION+RECENT",
    "layers": [
      "hour",
      "dowHour",
      "transition",
      "recent"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "2|10h": {
    "day": "TERCA",
    "dow": 2,
    "hour": "10h",
    "window": "ROLL_30D",
    "profile": "DAY_MONTH",
    "layers": [
      "dayMonth"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "3|10h": {
    "day": "QUARTA",
    "dow": 3,
    "hour": "10h",
    "window": "CAL_YEAR",
    "profile": "DAY_MONTH+TRANSITION",
    "layers": [
      "dayMonth",
      "transition"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "3|15h": {
    "day": "QUARTA",
    "dow": 3,
    "hour": "15h",
    "window": "CAL_QUARTER",
    "profile": "DAY_MONTH",
    "layers": [
      "dayMonth"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "3|21h": {
    "day": "QUARTA",
    "dow": 3,
    "hour": "21h",
    "window": "FULL",
    "profile": "DAY_MONTH+TRANSITION",
    "layers": [
      "dayMonth",
      "transition"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_LOW_N_EXCEPTION",
    "independentHoldout": "YES"
  },
  "4|08h": {
    "day": "QUINTA",
    "dow": 4,
    "hour": "08h",
    "window": "ROLL_7D",
    "profile": "HOUR+DAY_MONTH+TRANSITION+RECENT",
    "layers": [
      "hour",
      "dayMonth",
      "transition",
      "recent"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "4|15h": {
    "day": "QUINTA",
    "dow": 4,
    "hour": "15h",
    "window": "ROLL_30D",
    "profile": "DAY_MONTH+TRANSITION",
    "layers": [
      "dayMonth",
      "transition"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "4|17h": {
    "day": "QUINTA",
    "dow": 4,
    "hour": "17h",
    "window": "CAL_SEMESTER",
    "profile": "HOUR+DAY_MONTH+TRANSITION",
    "layers": [
      "hour",
      "dayMonth",
      "transition"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "4|23h": {
    "day": "QUINTA",
    "dow": 4,
    "hour": "23h",
    "window": "ROLL_7D",
    "profile": "HOUR",
    "layers": [
      "hour"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "5|23h": {
    "day": "SEXTA",
    "dow": 5,
    "hour": "23h",
    "window": "FULL",
    "profile": "DAY_MONTH",
    "layers": [
      "dayMonth"
    ],
    "evidenceTier": "SUN_FRI_PREDECLARED_HOLDOUT_STANDARD",
    "independentHoldout": "YES"
  },
  "6|02h": {
    "day": "SABADO",
    "dow": 6,
    "hour": "02h",
    "window": "ROLL_730D",
    "profile": "HOUR+DOW_HOUR+RECENT",
    "layers": [
      "hour",
      "dowHour",
      "recent"
    ],
    "evidenceTier": "SATURDAY_SEPARATE_EVIDENCE_TRACK",
    "independentHoldout": "NO_STRICT_SELECTION_CLAIM"
  },
  "6|10h": {
    "day": "SABADO",
    "dow": 6,
    "hour": "10h",
    "window": "ROLL_365D",
    "profile": "DAY_MONTH",
    "layers": [
      "dayMonth"
    ],
    "evidenceTier": "SATURDAY_SEPARATE_EVIDENCE_TRACK",
    "independentHoldout": "NO_STRICT_SELECTION_CLAIM"
  },
  "6|23h": {
    "day": "SABADO",
    "dow": 6,
    "hour": "23h",
    "window": "ROLL_90D",
    "profile": "DAY_MONTH+RECENT",
    "layers": [
      "dayMonth",
      "recent"
    ],
    "evidenceTier": "SATURDAY_SEPARATE_EVIDENCE_TRACK",
    "independentHoldout": "NO_STRICT_SELECTION_CLAIM"
  }
}
  );

const MASTER56_CONTEXT_COUNT = 56;
const MASTER56_R1_COUNT = 18;
const MASTER56_CURRENT_COUNT = 38;

function normalizeLotteryKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isYmd(value) {
  const text = String(value || "").trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text)
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] = text
    .split("-")
    .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeHour(value) {
  const text =
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");

  const match =
    text.match(
      /^(\d{1,2})(?::?(\d{2}))?h?$/
    );

  if (!match) {
    return "";
  }

  const hh =
    Number(match[1]);

  const mm =
    Number(
      match[2] ?? 0
    );

  if (
    !Number.isFinite(hh) ||
    !Number.isFinite(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm !== 0
  ) {
    return "";
  }

  return (
    String(hh).padStart(2, "0") +
    "h"
  );
}

function toCloseHour(value) {
  const hour =
    normalizeHour(value);

  if (!hour) {
    return "";
  }

  return (
    hour.slice(0, 2) +
    ":00"
  );
}

function exactRawNominalHour(value) {
  const text =
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");

  const match =
    text.match(
      /^(\d{1,2})(?::00)?h?$/
    );

  if (!match) {
    return "";
  }

  const hh =
    Number(match[1]);

  if (
    !Number.isFinite(hh) ||
    hh < 0 ||
    hh > 23
  ) {
    return "";
  }

  return (
    String(hh).padStart(2, "0") +
    "h"
  );
}

function getDow(ymd) {
  if (!isYmd(ymd)) {
    return NaN;
  }

  const [
    year,
    month,
    day,
  ] =
    String(ymd)
      .split("-")
      .map(Number);

  return (
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    ).getUTCDay()
  );
}

function ymdHourToTs(
  ymd,
  hour
) {
  if (!isYmd(ymd)) {
    return Number.POSITIVE_INFINITY;
  }

  const normalized =
    normalizeHour(hour);

  if (!normalized) {
    return Number.POSITIVE_INFINITY;
  }

  const [
    year,
    month,
    day,
  ] =
    String(ymd)
      .split("-")
      .map(Number);

  const hh =
    Number(
      normalized.slice(0, 2)
    );

  return Date.UTC(
    year,
    month - 1,
    day,
    hh,
    0,
    0,
    0
  );
}

function addDaysYmd(
  ymd,
  delta
) {
  if (!isYmd(ymd)) {
    return "";
  }

  const [
    year,
    month,
    day,
  ] =
    String(ymd)
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + Number(delta || 0)
      )
    );

  return [
    String(
      date.getUTCFullYear()
    ).padStart(4, "0"),

    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getUTCDate()
    ).padStart(2, "0"),
  ].join("-");
}

function isoWeekKey(ymd) {
  if (!isYmd(ymd)) {
    return "";
  }

  const [
    year,
    month,
    day,
  ] =
    String(ymd)
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  const dayNumber =
    date.getUTCDay() || 7;

  date.setUTCDate(
    date.getUTCDate() +
    4 -
    dayNumber
  );

  const isoYear =
    date.getUTCFullYear();

  const yearStart =
    new Date(
      Date.UTC(
        isoYear,
        0,
        1
      )
    );

  const week =
    Math.ceil(
      (
        (
          date -
          yearStart
        ) /
          86400000 +
        1
      ) /
        7
    );

  return (
    String(isoYear) +
    "-W" +
    String(week).padStart(2, "0")
  );
}

function documentaryText(draw) {
  return [
    draw?.lottery_name,
    draw?.lotteryName,
    draw?.name,
    draw?.title,
    draw?.label,
    draw?.lotteryLabel,
    draw?.loteriaName,
    draw?.loteriaLabel,
  ]
    .filter(
      value =>
        value !== null &&
        value !== undefined &&
        String(value).trim()
    )
    .map(
      value =>
        String(value)
          .trim()
          .toUpperCase()
    )
    .join(" | ");
}

function documentaryHourFromName(draw) {
  const joined =
    documentaryText(draw);

  if (
    !joined ||
    !/\bNACIONAL\b/.test(joined)
  ) {
    return "";
  }

  const match =
    joined.match(
      /\bNACIONAL\s*(02|08|10|12|15|17|20|21|23)\s*H(?:S)?\b/
    );

  if (!match) {
    return "";
  }

  return (
    String(match[1]).padStart(2, "0") +
    "h"
  );
}

function explicitlyNacional(draw) {
  const keys = [
    draw?.lottery_key,
    draw?.lotteryKey,
    draw?.lottery,
    draw?.loteria,
    draw?.uf,
  ];

  if (
    keys.some(
      value =>
        normalizeLotteryKey(value) ===
        "NACIONAL"
    )
  ) {
    return true;
  }

  return (
    /\bNACIONAL\b/.test(
      documentaryText(draw)
    )
  );
}

function canonicalHour(
  draw,
  helpers
) {
  /*
   * Autoridade nominal NACIONAL:
   * 1. UUID documental canonico;
   * 2. lottery_name documental;
   * 3. raw hour somente como fallback exato.
   *
   * 20h legado e 21h atual permanecem separados.
   */
  if (
    typeof
      helpers
        ?.nacionalTop3CanonicalSlotFromDraw ===
    "function"
  ) {
    const byUuid =
      normalizeHour(
        helpers
          .nacionalTop3CanonicalSlotFromDraw(
            draw
          )
      );

    if (byUuid) {
      return byUuid;
    }
  }

  const byName =
    documentaryHourFromName(
      draw
    );

  if (byName) {
    return byName;
  }

  if (
    !explicitlyNacional(draw)
  ) {
    return "";
  }

  const primaryRaw =
    draw?.close_hour ??
    draw?.closeHour ??
    draw?.close ??
    null;

  if (
    primaryRaw !== null &&
    primaryRaw !== undefined &&
    String(primaryRaw).trim()
  ) {
    const exact =
      exactRawNominalHour(
        primaryRaw
      );

    if (!exact) {
      throw new Error(
        "NACIONAL_MASTER56_AMBIGUOUS_RAW_CLOSE_HOUR=" +
        String(primaryRaw)
      );
    }

    return exact;
  }

  const secondaryRaw =
    draw?.hour ??
    draw?.hora ??
    null;

  if (
    secondaryRaw !== null &&
    secondaryRaw !== undefined &&
    String(secondaryRaw).trim()
  ) {
    const exact =
      exactRawNominalHour(
        secondaryRaw
      );

    if (!exact) {
      throw new Error(
        "NACIONAL_MASTER56_AMBIGUOUS_RAW_HOUR=" +
        String(secondaryRaw)
      );
    }

    return exact;
  }

  throw new Error(
    "NACIONAL_MASTER56_NOMINAL_HOUR_UNRESOLVED"
  );
}

function canonicalizeHistory({
  draws,
  targetTs,
  helpers,
}) {
  const source =
    Array.isArray(draws)
      ? draws
      : [];

  const bySlot =
    new Map();

  for (const draw of source) {
    if (!draw) {
      continue;
    }

    const ymd =
      String(
        helpers?.pickDrawYMD?.(draw) ||
        ""
      ).trim();

    if (!isYmd(ymd)) {
      continue;
    }

    let hour = "";

    try {
      hour =
        canonicalHour(
          draw,
          helpers
        );
    }
    catch (error) {
      if (
        explicitlyNacional(draw)
      ) {
        throw error;
      }

      continue;
    }

    if (!hour) {
      continue;
    }

    const ts =
      ymdHourToTs(
        ymd,
        hour
      );

    if (
      !Number.isFinite(ts) ||
      ts >= targetTs
    ) {
      continue;
    }

    const closeHour =
      toCloseHour(
        hour
      );

    const canonical =
      {
        ...draw,

        ymd,

        close_hour:
          closeHour,

        closeHour:
          closeHour,

        close:
          closeHour,

        hour:
          closeHour,
      };

    const key =
      ymd +
      "|" +
      hour;

    const previous =
      bySlot.get(
        key
      );

    if (!previous) {
      bySlot.set(
        key,
        canonical
      );

      continue;
    }

    const previousPrizeCount =
      Array.isArray(
        previous?.prizes
      )
        ? previous.prizes.length
        : 0;

    const currentPrizeCount =
      Array.isArray(
        canonical?.prizes
      )
        ? canonical.prizes.length
        : 0;

    if (
      currentPrizeCount >
      previousPrizeCount
    ) {
      bySlot.set(
        key,
        canonical
      );
    }
  }

  return Array.from(
    bySlot.values()
  )
    .sort(
      (a, b) => {
        const aTs =
          ymdHourToTs(
            helpers?.pickDrawYMD?.(a),
            canonicalHour(
              a,
              helpers
            )
          );

        const bTs =
          ymdHourToTs(
            helpers?.pickDrawYMD?.(b),
            canonicalHour(
              b,
              helpers
            )
          );

        return (
          aTs - bTs
        );
      }
    );
}

function applyWindow({
  history,
  targetYmd,
  windowName,
  helpers,
}) {
  const list =
    Array.isArray(history)
      ? history
      : [];

  if (
    windowName === "FULL"
  ) {
    return [
      ...list,
    ];
  }

  const rolling =
    String(windowName || "")
      .match(
        /^ROLL_(\d+)D$/
      );

  if (rolling) {
    const days =
      Number(
        rolling[1]
      );

    const minYmd =
      addDaysYmd(
        targetYmd,
        -days
      );

    return list.filter(
      draw => {
        const ymd =
          String(
            helpers?.pickDrawYMD?.(draw) ||
            ""
          ).trim();

        return (
          isYmd(ymd) &&
          ymd >= minYmd
        );
      }
    );
  }

  if (
    windowName ===
    "CAL_YEAR"
  ) {
    const year =
      String(targetYmd)
        .slice(0, 4);

    return list.filter(
      draw =>
        String(
          helpers?.pickDrawYMD?.(draw) ||
          ""
        ).slice(0, 4) ===
        year
    );
  }

  if (
    windowName ===
    "CAL_SEMESTER"
  ) {
    const year =
      Number(
        String(targetYmd)
          .slice(0, 4)
      );

    const month =
      Number(
        String(targetYmd)
          .slice(5, 7)
      );

    const semester =
      month <= 6
        ? 1
        : 2;

    return list.filter(
      draw => {
        const ymd =
          String(
            helpers?.pickDrawYMD?.(draw) ||
            ""
          );

        if (!isYmd(ymd)) {
          return false;
        }

        const y =
          Number(
            ymd.slice(0, 4)
          );

        const m =
          Number(
            ymd.slice(5, 7)
          );

        return (
          y === year &&
          (
            m <= 6
              ? 1
              : 2
          ) === semester
        );
      }
    );
  }

  if (
    windowName ===
    "CAL_QUARTER"
  ) {
    const year =
      Number(
        String(targetYmd)
          .slice(0, 4)
      );

    const month =
      Number(
        String(targetYmd)
          .slice(5, 7)
      );

    const quarter =
      Math.floor(
        (month - 1) / 3
      ) + 1;

    return list.filter(
      draw => {
        const ymd =
          String(
            helpers?.pickDrawYMD?.(draw) ||
            ""
          );

        if (!isYmd(ymd)) {
          return false;
        }

        const y =
          Number(
            ymd.slice(0, 4)
          );

        const m =
          Number(
            ymd.slice(5, 7)
          );

        const q =
          Math.floor(
            (m - 1) / 3
          ) + 1;

        return (
          y === year &&
          q === quarter
        );
      }
    );
  }

  if (
    windowName ===
    "CAL_MONTH"
  ) {
    const monthKey =
      String(targetYmd)
        .slice(0, 7);

    return list.filter(
      draw =>
        String(
          helpers?.pickDrawYMD?.(draw) ||
          ""
        ).slice(0, 7) ===
        monthKey
    );
  }

  if (
    windowName ===
    "CAL_WEEK"
  ) {
    const weekKey =
      isoWeekKey(
        targetYmd
      );

    return list.filter(
      draw =>
        isoWeekKey(
          String(
            helpers?.pickDrawYMD?.(draw) ||
            ""
          )
        ) ===
        weekKey
    );
  }

  throw new Error(
    "NACIONAL_MASTER56_UNKNOWN_WINDOW=" +
    String(windowName || "")
  );
}

function buildR1Ranking({
  computed,
  profile,
}) {
  const candidates =
    Array.isArray(
      computed?.top
    )
      ? computed.top
      : [];

  if (
    candidates.length !== 25
  ) {
    throw new Error(
      "NACIONAL_MASTER56_CANDIDATE_COUNT=" +
      String(candidates.length) +
      "|EXPECTED=25"
    );
  }

  const groups =
    new Set();

  const scored =
    candidates.map(
      candidate => {
        const grupo =
          Number(
            candidate?.grupo
          );

        if (
          !Number.isInteger(grupo) ||
          grupo < 1 ||
          grupo > 25
        ) {
          throw new Error(
            "NACIONAL_MASTER56_INVALID_GROUP=" +
            String(candidate?.grupo)
          );
        }

        if (
          groups.has(grupo)
        ) {
          throw new Error(
            "NACIONAL_MASTER56_DUPLICATE_GROUP=" +
            String(grupo)
          );
        }

        groups.add(grupo);

        const details =
          candidate
            ?.meta
            ?.explain
            ?.details ||
          candidate
            ?.details ||
          null;

        if (!details) {
          throw new Error(
            "NACIONAL_MASTER56_DETAILS_MISSING_G" +
            String(grupo)
          );
        }

        let score = 0;
        let informative = false;

        for (
          const layerKey
          of profile.layers
        ) {
          const layer =
            details?.[
              layerKey
            ];

          if (!layer) {
            throw new Error(
              "NACIONAL_MASTER56_LAYER_MISSING=" +
              layerKey +
              "|G=" +
              String(grupo)
            );
          }

          const contribution =
            Number(
              layer
                ?.contributionBeforeScene
            );

          if (
            !Number.isFinite(
              contribution
            )
          ) {
            throw new Error(
              "NACIONAL_MASTER56_INVALID_CONTRIBUTION=" +
              layerKey +
              "|G=" +
              String(grupo)
            );
          }

          score +=
            contribution;

          if (
            Number(
              layer?.weight || 0
            ) > 0
          ) {
            informative =
              true;
          }
        }

        return {
          grupo,
          score,
          informative,
          candidate,
        };
      }
    );

  if (
    scored.length !== 25 ||
    groups.size !== 25
  ) {
    throw new Error(
      "NACIONAL_MASTER56_GROUP_UNIVERSE_INVALID"
    );
  }

  if (
    !scored.some(
      row =>
        row.informative
    )
  ) {
    throw new Error(
      "NACIONAL_MASTER56_PROFILE_NOT_INFORMATIVE"
    );
  }

  scored.sort(
    (a, b) => {
      if (
        b.score !==
        a.score
      ) {
        return (
          b.score -
          a.score
        );
      }

      return (
        a.grupo -
        b.grupo
      );
    }
  );

  return scored;
}

function titleForRank(index) {
  if (index === 0) {
    return "Mais provável";
  }

  if (index === 1) {
    return "2º mais provável";
  }

  return "3º mais provável";
}

function master56Top3({
  ranked,
  profile,
  targetYmd,
  targetHour,
  historyCount,
  windowCount,
}) {
  return ranked
    .slice(0, 3)
    .map(
      (row, index) => {
        const source =
          row.candidate ||
          {};

        const sourceMeta =
          source?.meta ||
          {};

        const sourceExplain =
          sourceMeta
            ?.explain ||
          {};

        const reasons =
          Array.isArray(
            source?.reasons
          )
            ? source.reasons
            : [];

        return {
          ...source,

          rank:
            index + 1,

          title:
            titleForRank(
              index
            ),

          scoreProb:
            Number(
              row.score
            ),

          score:
            Number(
              row.score
            ) * 1000,

          reasons: [
            "MASTER56: " +
              profile.window +
              " | " +
              profile.profile,

            "MASTER56 score: soma de contributionBeforeScene sem segunda renormalização.",

            ...reasons,
          ],

          meta: {
            ...sourceMeta,

            next: {
              ymd:
                targetYmd,

              hour:
                toCloseHour(
                  targetHour
                ),
            },

            scenario:
              NACIONAL_MASTER56_PRODUCTION_VERSION,

            explain: {
              ...sourceExplain,

              engine:
                NACIONAL_MASTER56_PRODUCTION_VERSION,

              baselineEngine:
                "V3_STATISTICAL",

              master56: {
                mode:
                  "R1_CALIBRATED",

                window:
                  profile.window,

                profile:
                  profile.profile,

                layers: [
                  ...profile.layers,
                ],

                score:
                  Number(
                    row.score
                  ),

                formula:
                  "SUM_CONTRIBUTION_BEFORE_SCENE",

                tieBreak:
                  "EXACT_SCORE_THEN_GROUP_ASC",

                secondRenormalization:
                  false,

                strictlyPriorHistory:
                  true,

                historyCount:
                  Number(
                    historyCount
                  ),

                windowHistoryCount:
                  Number(
                    windowCount
                  ),

                nominalHourAuthority:
                  "DOCUMENTARY_UUID_THEN_LOTTERY_NAME",

                rawCloseHourRole:
                  "EXACT_FALLBACK_ONLY",

                legacy20MergedInto21:
                  false,

                matrixCertificateSha256:
                  NACIONAL_MASTER56_MATRIX_CERTIFICATE_SHA256,
              },
            },
          },
        };
      }
    );
}

export function computeNacionalMaster56Top3({
  input = {},
  baseCompute,
  currentCompute,
  helpers = {},
}) {
  if (
    typeof currentCompute !==
    "function"
  ) {
    throw new Error(
      "NACIONAL_MASTER56_CURRENT_COMPUTE_REQUIRED"
    );
  }

  const current =
    currentCompute(
      input
    );

  if (
    normalizeLotteryKey(
      input?.lotteryKey
    ) !== "NACIONAL"
  ) {
    return current;
  }

  const forcedYmd =
    isYmd(
      input?.targetYmdOverride
    )
      ? String(
          input.targetYmdOverride
        ).trim()
      : "";

  const forcedHour =
    normalizeHour(
      input?.targetHourOverride
    );

  const useForcedTarget =
    Boolean(
      forcedYmd &&
      forcedHour
    );

  const targetYmd =
    useForcedTarget
      ? forcedYmd
      : String(
          current
            ?.meta
            ?.next
            ?.ymd ||
          ""
        ).trim();

  const targetHour =
    useForcedTarget
      ? forcedHour
      : normalizeHour(
          current
            ?.meta
            ?.next
            ?.hour
        );

  if (
    !isYmd(targetYmd) ||
    !targetHour
  ) {
    return current;
  }

  const dow =
    getDow(
      targetYmd
    );

  if (
    !Number.isFinite(dow)
  ) {
    return current;
  }

  const contextKey =
    String(dow) +
    "|" +
    targetHour;

  const profile =
    R1_CONTEXTS[
      contextKey
    ] ||
    null;

  /*
   * A ausencia na tabela R1 significa, por contrato,
   * CURRENT_NACIONAL. Nenhum recalculo alternativo.
   */
  if (!profile) {
    return current;
  }

  try {
    if (
      typeof baseCompute !==
      "function"
    ) {
      throw new Error(
        "NACIONAL_MASTER56_BASE_COMPUTE_REQUIRED"
      );
    }

    const targetTs =
      ymdHourToTs(
        targetYmd,
        targetHour
      );

    if (
      !Number.isFinite(
        targetTs
      )
    ) {
      throw new Error(
        "NACIONAL_MASTER56_TARGET_TS_INVALID"
      );
    }

    const sourceHistory = [
      ...(
        Array.isArray(
          input?.drawsRange
        )
          ? input.drawsRange
          : []
      ),
    ];

    if (input?.drawLast) {
      sourceHistory.push(
        input.drawLast
      );
    }

    const history =
      canonicalizeHistory({
        draws:
          sourceHistory,

        targetTs,

        helpers,
      });

    if (
      history.length < 1
    ) {
      throw new Error(
        "NACIONAL_MASTER56_CAUSAL_HISTORY_EMPTY"
      );
    }

    const windowHistory =
      applyWindow({
        history,
        targetYmd,
        windowName:
          profile.window,
        helpers,
      });

    if (
      windowHistory.length < 1
    ) {
      throw new Error(
        "NACIONAL_MASTER56_WINDOW_HISTORY_EMPTY=" +
        String(profile.window)
      );
    }

    const windowBase =
      windowHistory[
        windowHistory.length -
        1
      ];

    const computed =
      baseCompute({
        ...input,

        lotteryKey:
          "NACIONAL",

        drawsRange:
          windowHistory,

        drawLast:
          windowBase,

        topN:
          25,

        targetYmdOverride:
          targetYmd,

        targetHourOverride:
          toCloseHour(
            targetHour
          ),

        drawsAlreadySorted:
          true,
      });

    const computedTargetYmd =
      String(
        computed
          ?.meta
          ?.next
          ?.ymd ||
        ""
      ).trim();

    const computedTargetHour =
      normalizeHour(
        computed
          ?.meta
          ?.next
          ?.hour
      );

    if (
      computedTargetYmd !==
        targetYmd ||
      computedTargetHour !==
        targetHour
    ) {
      throw new Error(
        "NACIONAL_MASTER56_TARGET_PARITY_FAIL=" +
        computedTargetYmd +
        "|" +
        computedTargetHour +
        "|EXPECTED=" +
        targetYmd +
        "|" +
        targetHour
      );
    }

    const ranked =
      buildR1Ranking({
        computed,
        profile,
      });

    const top =
      master56Top3({
        ranked,
        profile,
        targetYmd,
        targetHour,
        historyCount:
          history.length,
        windowCount:
          windowHistory.length,
      });

    if (
      top.length !== 3
    ) {
      throw new Error(
        "NACIONAL_MASTER56_TOP3_COUNT=" +
        String(top.length)
      );
    }

    return {
      ...computed,

      top,

      meta: {
        ...(
          computed?.meta ||
          {}
        ),

        next: {
          ymd:
            targetYmd,

          hour:
            toCloseHour(
              targetHour
            ),
        },

        scenario:
          NACIONAL_MASTER56_PRODUCTION_VERSION,

        explain: {
          ...(
            computed
              ?.meta
              ?.explain ||
            {}
          ),

          engine:
            NACIONAL_MASTER56_PRODUCTION_VERSION,

          baselineEngine:
            "V3_STATISTICAL",

          master56: {
            mode:
              "R1_CALIBRATED",

            contextKey,

            dow:
              Number(dow),

            targetYmd,

            targetHour,

            window:
              profile.window,

            profile:
              profile.profile,

            layers: [
              ...profile.layers,
            ],

            formula:
              "SUM_CONTRIBUTION_BEFORE_SCENE",

            tieBreak:
              "EXACT_SCORE_THEN_GROUP_ASC",

            secondRenormalization:
              false,

            strictlyPriorHistory:
              true,

            historyCount:
              history.length,

            windowHistoryCount:
              windowHistory.length,

            matrixContexts:
              MASTER56_CONTEXT_COUNT,

            r1Contexts:
              MASTER56_R1_COUNT,

            currentContexts:
              MASTER56_CURRENT_COUNT,

            nominalHourAuthority:
              "DOCUMENTARY_UUID_THEN_LOTTERY_NAME",

            rawCloseHourRole:
              "EXACT_FALLBACK_ONLY",

            legacy20MergedInto21:
              false,

            matrixCertificateSha256:
              NACIONAL_MASTER56_MATRIX_CERTIFICATE_SHA256,
          },
        },
      },
    };
  }
  catch (error) {
    /*
     * Fail-safe:
     * se o caminho calibrado nao puder provar sua
     * identidade/causalidade, preserva CURRENT_NACIONAL.
     */
    try {
      console.warn(
        "[NACIONAL MASTER56] R1 fallback -> CURRENT_NACIONAL",
        {
          targetYmd,
          targetHour,
          contextKey,
          error:
            String(
              error?.message ||
              error
            ),
        }
      );
    }
    catch {
      // sem efeito funcional
    }

    return current;
  }
}