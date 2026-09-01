/*
 * PT_SP TOP3 calendar.
 *
 * Historical availability follows only PT_SP source truth.
 *
 * Current observed regime anchor:
 * 2026-08-01.
 *
 * This anchor is operational evidence only.
 * It is not a claim of the formal source transition date.
 */

export const PT_SP_ALL_SLOTS =
  Object.freeze([
    "08:00",
    "10:00",
    "12:00",
    "13:00",
    "15:00",
    "17:00",
    "19:00",
    "20:00",
  ]);

export const PT_SP_SOURCE_START_BY_SLOT =
  Object.freeze({
    "08:00": "2024-04-11",
    "10:00": "2022-07-07",
    "12:00": "2024-06-11",
    "13:00": "2022-07-06",
    "15:00": "2022-07-06",
    "17:00": "2023-06-03",
    "19:00": "2024-06-14",
    "20:00": "2022-07-06",
  });

export const PT_SP_CURRENT_REGIME_ANCHOR_YMD =
  "2026-08-01";

export const PT_SP_FORMAL_TRANSITION_DATE_CLAIMED =
  false;


function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || "")
  );
}


function getDow(ymd) {
  return new Date(
    `${ymd}T12:00:00Z`
  ).getUTCDay();
}


export function getPtSpScheduleForYmd(
  ymd
) {
  const y =
    String(ymd || "")
      .trim();

  if (
    !isYmd(y) ||
    y < "2022-07-06"
  ) {
    return [];
  }

  let schedule =
    PT_SP_ALL_SLOTS.filter(
      (hour) => {
        const sourceStart =
          PT_SP_SOURCE_START_BY_SLOT[
            hour
          ];

        return (
          !!sourceStart &&
          y >= sourceStart
        );
      }
    );

  if (
    y >=
    PT_SP_CURRENT_REGIME_ANCHOR_YMD
  ) {
    const dow =
      getDow(y);

    if (dow === 3) {
      schedule =
        schedule.filter(
          (hour) =>
            hour !== "20:00"
        );
    }

    if (dow === 6) {
      schedule =
        schedule.filter(
          (hour) =>
            hour !== "19:00"
        );
    }
  }

  return schedule;
}


export default {
  slots:
    PT_SP_ALL_SLOTS,

  sourceStartBySlot:
    PT_SP_SOURCE_START_BY_SLOT,

  currentRegimeAnchorYmd:
    PT_SP_CURRENT_REGIME_ANCHOR_YMD,

  formalTransitionDateClaimed:
    PT_SP_FORMAL_TRANSITION_DATE_CLAIMED,

  getPtSpScheduleForYmd,
};
