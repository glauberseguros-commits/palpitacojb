import {
  getScheduleByLottery,
} from "../../constants/schedule";

/*
 * PALPITACO_RADAR_DATE_AWARE_SCHEDULE_V1
 *
 * Calendario exclusivo da pagina Radar dos Bichos.
 *
 * Nao importa nem depende do motor TOP3.
 *
 * Para loterias sem excecao historica conhecida,
 * utiliza a grade oficial central do Palpitaco.
 *
 * Excecoes atualmente necessarias:
 * - PT_RIO
 * - FEDERAL
 * - PT_SP em 02/09/2026
 */

function safeString(value) {
  return String(
    value ?? ""
  ).trim();
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    safeString(value)
  );
}

function normalizeHour(value) {
  const raw =
    safeString(value)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/hs?$/, "");

  const match =
    raw.match(
      /^(\d{1,2})(?::(\d{2}))?$/
    );

  if (!match) {
    return "";
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(match[2] || 0);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}

function normalizeList(values) {
  return Array.from(
    new Set(
      (
        Array.isArray(values)
          ? values
          : []
      )
        .map(normalizeHour)
        .filter(Boolean)
    )
  ).sort(
    (a, b) => {
      const [
        ah,
        am,
      ] =
        a.split(":").map(Number);

      const [
        bh,
        bm,
      ] =
        b.split(":").map(Number);

      return (
        ah * 60 +
        am -
        (
          bh * 60 +
          bm
        )
      );
    }
  );
}

function dayOfWeek(ymd) {
  if (!isYmd(ymd)) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    ymd
      .split("-")
      .map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).getUTCDay();
}

function ptRioSchedule(ymd) {
  if (!isYmd(ymd)) {
    return normalizeList(
      getScheduleByLottery(
        "PT_RIO"
      )
    );
  }

  const dow =
    dayOfWeek(ymd);

  let normal = [
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
  ];

  /*
   * O sorteio das 09h passou a integrar
   * a grade em 05/01/2024.
   */
  if (
    ymd <
    "2024-01-05"
  ) {
    normal =
      normal.filter(
        (hour) =>
          hour !==
          "09:00"
      );
  }

  /*
   * Domingo reduzido desde 19/07/2026.
   */
  if (
    dow === 0 &&
    ymd >=
      "2026-07-19"
  ) {
    return [
      "14:00",
      "16:00",
    ];
  }

  /*
   * Quarta-feira sem 18h.
   */
  if (dow === 3) {
    return normal.filter(
      (hour) =>
        hour !==
        "18:00"
    );
  }

  /*
   * Sabado:
   * desde 18/07/2026,
   * 19:30 substitui 18:00.
   */
  if (
    dow === 6 &&
    ymd >=
      "2026-07-18"
  ) {
    return normalizeList([
      ...normal.filter(
        (hour) =>
          hour !==
          "18:00"
      ),
      "19:30",
    ]);
  }

  return normalizeList(
    normal
  );
}

function federalSchedule(ymd) {
  if (!isYmd(ymd)) {
    return normalizeList(
      getScheduleByLottery(
        "FEDERAL"
      )
    );
  }

  const dow =
    dayOfWeek(ymd);

  /*
   * Desde 19/07/2026:
   * domingo 11:30
   * quarta 20:00
   * sabado sem Federal
   */
  if (
    ymd >=
    "2026-07-19"
  ) {
    if (dow === 0) {
      return [
        "11:30",
      ];
    }

    if (dow === 3) {
      return [
        "20:00",
      ];
    }

    return [];
  }

  /*
   * 05/11/2025 ate 18/07/2026:
   * quarta e sabado 20:00.
   */
  if (
    ymd >=
    "2025-11-05"
  ) {
    return (
      dow === 3 ||
      dow === 6
    )
      ? [
          "20:00",
        ]
      : [];
  }

  /*
   * Historico anterior:
   * quarta e sabado 19:00.
   * 19h e 20h permanecem identidades distintas.
   */
  return (
    dow === 3 ||
    dow === 6
  )
    ? [
        "19:00",
      ]
    : [];
}

function ptSpSchedule(ymd) {
  const base =
    normalizeList(
      getScheduleByLottery(
        "PT_SP"
      )
    );

  /*
   * 02/09/2026:
   * nao houve sorteio das 20h.
   */
  if (
    ymd ===
    "2026-09-02"
  ) {
    return base.filter(
      (hour) =>
        hour !==
        "20:00"
    );
  }

  return base;
}

export function getRadarScheduleForDate(
  lotteryKey,
  ymd
) {
  const key =
    safeString(
      lotteryKey
    ).toUpperCase();

  const date =
    safeString(
      ymd
    );

  if (key === "PT_RIO") {
    return ptRioSchedule(
      date
    );
  }

  if (key === "FEDERAL") {
    return federalSchedule(
      date
    );
  }

  if (key === "PT_SP") {
    return ptSpSchedule(
      date
    );
  }

  return normalizeList(
    getScheduleByLottery(
      key
    )
  );
}

const radarSchedule = {
  getRadarScheduleForDate,
};

export default radarSchedule;