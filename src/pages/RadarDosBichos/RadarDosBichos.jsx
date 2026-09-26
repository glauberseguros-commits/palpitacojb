import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  LOTTERY_CATALOG_DISPLAY_GLOBAL,
} from "../../constants/lotteryCatalog";

import {
  getRadarScheduleForDate,
} from "./radarSchedule";

import {
  getAnimalLabel,
  getImgFromGrupo,
} from "../../constants/bichoMap";

import {
  buildRadarCards,
} from "./radarTop1Top7Engine";

import {
  loadRadarHistorySource,
} from "./radarSource";

import "./RadarDosBichos.css";

const MODES = Object.freeze([
  {
    key: "TOP1",
    label: "TOP1",
  },
  {
    key: "TOP7",
    label: "TOP7",
  },
]);

function todayYmdLocal() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function hourToMinutes(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

  const match =
    text.match(
      /^(\d{1,2})(?::(\d{2}))?$/
    );

  if (!match) {
    return null;
  }

  const hour =
    Number(
      match[1]
    );

  const minute =
    Number(
      match[2] || 0
    );

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return (
    hour * 60 +
    minute
  );
}

function normalizeHourLabel(
  value
) {
  const minutes =
    hourToMinutes(
      value
    );

  if (minutes === null) {
    return String(
      value || ""
    );
  }

  const hour =
    Math.floor(
      minutes / 60
    );

  const minute =
    minutes % 60;

  return (
    String(hour)
      .padStart(
        2,
        "0"
      ) +
    ":" +
    String(minute)
      .padStart(
        2,
        "0"
      )
  );
}

function initialHourForSchedule(
  schedule
) {
  const list =
    Array.isArray(
      schedule
    )
      ? schedule
          .map(
            normalizeHourLabel
          )
          .filter(Boolean)
      : [];

  if (!list.length) {
    return "";
  }

  const now =
    new Date();

  const nowMinutes =
    now.getHours() *
      60 +
    now.getMinutes();

  const future =
    list.find(
      (hour) => {
        const minutes =
          hourToMinutes(
            hour
          );

        return (
          minutes !== null &&
          minutes >
            nowMinutes
        );
      }
    );

  return (
    future ||
    list[list.length - 1]
  );
}

function formatDateBR(
  ymd
) {
  const match =
    String(
      ymd || ""
    ).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return ymd;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function animalName(
  group
) {
  try {
    const label =
      getAnimalLabel(
        Number(group)
      );

    if (label) {
      return String(label);
    }
  }
  catch {}

  return `Grupo ${String(group).padStart(2, "0")}`;
}

function animalImage(
  group
) {
  try {
    return (
      getImgFromGrupo(
        Number(group),
        192
      ) ||
      getImgFromGrupo(
        Number(group),
        128
      ) ||
      getImgFromGrupo(
        Number(group)
      ) ||
      ""
    );
  }
  catch {
    return "";
  }
}

function buildClipboardText(
  card
) {
  const name =
    animalName(
      card.group
    );

  const lines = [
    `${name} — G${String(card.group).padStart(2, "0")}`,
    "",
  ];

  for (
    const row
    of card.rows || []
  ) {
    lines.push(
      `${row.dezena}: ${(row.numbers || [])
        .map(
          (item) =>
            item.milhar
        )
        .join(" ")}`
    );
  }

  return lines.join(
    "\n"
  );
}

export default function RadarDosBichos() {
  const lotteries =
    LOTTERY_CATALOG_DISPLAY_GLOBAL;

  const [
    lotteryKey,
    setLotteryKey,
  ] =
    useState(
      "PT_RIO"
    );

  const [
    mode,
    setMode,
  ] =
    useState(
      "TOP1"
    );

  const [
    targetDate,
    setTargetDate,
  ] =
    useState(
      todayYmdLocal
    );

  const schedule =
    useMemo(
      () => {
        const raw =
          getRadarScheduleForDate(
            lotteryKey,
            targetDate
          );

        return (
          Array.isArray(raw)
            ? raw
                .map(
                  normalizeHourLabel
                )
                .filter(Boolean)
            : []
        );
      },
      [
        lotteryKey,
        targetDate,
      ]
    );

  const [
    targetHour,
    setTargetHour,
  ] =
    useState(
      () =>
        initialHourForSchedule(
          getRadarScheduleForDate(
            "PT_RIO",
            todayYmdLocal()
          )
        )
    );

  const [
    sourceData,
    setSourceData,
  ] =
    useState(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    copiedGroup,
    setCopiedGroup,
  ] =
    useState(
      null
    );

  useEffect(
    () => {
      if (!schedule.length) {
        setTargetHour(
          ""
        );

        return;
      }

      if (
        schedule.includes(
          targetHour
        )
      ) {
        return;
      }

      setTargetHour(
        targetDate ===
          todayYmdLocal()
          ? initialHourForSchedule(
              schedule
            )
          : schedule[0]
      );
    },
    [
      schedule,
      targetDate,
      targetHour,
    ]
  );

  useEffect(
    () => {
      if (
        !lotteryKey ||
        !targetDate ||
        !targetHour
      ) {
        setSourceData(
          null
        );

        return;
      }

      let cancelled =
        false;

      async function run() {
        setLoading(
          true
        );

        setError(
          ""
        );

        try {
          const out =
            await loadRadarHistorySource({
              lotteryKey,
              targetDate,
              targetHour,
            });

          if (!cancelled) {
            setSourceData(
              out
            );
          }
        }
        catch (err) {
          if (!cancelled) {
            setSourceData(
              null
            );

            const code =
              String(
                err?.message ||
                err ||
                ""
              );

            if (
              code.includes(
                "RADAR_SOURCE_HISTORY_INSUFFICIENT"
              )
            ) {
              setError(
                "Ainda não existem três resultados anteriores válidos para formar este Radar."
              );
            }
            else {
              setError(
                "Não foi possível carregar a base histórica deste Radar."
              );
            }
          }
        }
        finally {
          if (!cancelled) {
            setLoading(
              false
            );
          }
        }
      }

      run();

      return () => {
        cancelled =
          true;
      };
    },
    [
      lotteryKey,
      targetDate,
      targetHour,
    ]
  );

  const cards =
    useMemo(
      () => {
        if (
          !sourceData?.days?.d1?.milhar ||
          !sourceData?.days?.d2?.milhar ||
          !sourceData?.days?.d3?.milhar
        ) {
          return [];
        }

        try {
          return buildRadarCards({
            mode,

            d1:
              sourceData.days.d1.milhar,

            d2:
              sourceData.days.d2.milhar,

            d3:
              sourceData.days.d3.milhar,
          });
        }
        catch {
          return [];
        }
      },
      [
        mode,
        sourceData,
      ]
    );

  const selectedLottery =
    useMemo(
      () =>
        lotteries.find(
          (item) =>
            item.key ===
            lotteryKey
        ) || null,
      [
        lotteries,
        lotteryKey,
      ]
    );

  async function copyCard(
    card
  ) {
    const text =
      buildClipboardText(
        card
      );

    try {
      await navigator.clipboard.writeText(
        text
      );

      setCopiedGroup(
        card.group
      );

      window.setTimeout(
        () => {
          setCopiedGroup(
            null
          );
        },
        1500
      );
    }
    catch {
      setCopiedGroup(
        null
      );
    }
  }

  return (
    <main
      className="radar-bichos-page"
    >
      <section className="radar-bichos-hero">
        <h1>
          RADAR DOS BICHOS
        </h1>
      </section>

      <section className="radar-bichos-filters">
        <div className="radar-bichos-field">
          <label htmlFor="radar-lottery">
            LOTERIA
          </label>

          <select
            id="radar-lottery"
            value={lotteryKey}
            onChange={
              (event) =>
                setLotteryKey(
                  event.target.value
                )
            }
          >
            {lotteries.map(
              (lottery) => (
                <option
                  key={lottery.key}
                  value={lottery.key}
                >
                  {lottery.label}
                </option>
              )
            )}
          </select>
        </div>

        <div className="radar-bichos-field">
          <label htmlFor="radar-mode">
            MODO
          </label>

          <select
            id="radar-mode"
            value={mode}
            onChange={
              (event) =>
                setMode(
                  event.target.value
                )
            }
          >
            {MODES.map(
              (item) => (
                <option
                  key={item.key}
                  value={item.key}
                >
                  {item.label}
                </option>
              )
            )}
          </select>
        </div>

        <div className="radar-bichos-field">
          <label htmlFor="radar-hour">
            HORÁRIO
          </label>

          <select
            id="radar-hour"
            value={targetHour}
            disabled={
              !schedule.length
            }
            onChange={
              (event) =>
                setTargetHour(
                  event.target.value
                )
            }
          >
            {!schedule.length && (
              <option value="">
                Sem horários
              </option>
            )}

            {schedule.map(
              (hour) => (
                <option
                  key={hour}
                  value={hour}
                >
                  {hour}
                </option>
              )
            )}
          </select>
        </div>

        <div className="radar-bichos-field">
          <label htmlFor="radar-date">
            DATA
          </label>

          <input
            id="radar-date"
            type="date"
            value={targetDate}
            onChange={
              (event) =>
                setTargetDate(
                  event.target.value
                )
            }
          />
        </div>
      </section>


      {loading && (
        <section className="radar-bichos-state">
          <div className="radar-bichos-spinner" />

          <strong>
            Calculando Radar...
          </strong>
        </section>
      )}

      {!loading &&
        error && (
          <section className="radar-bichos-state radar-bichos-state-error">
            <strong>
              Radar indisponível para este contexto
            </strong>

            <p>
              {error}
            </p>
          </section>
        )}

      {!loading &&
        !error &&
        cards.length > 0 && (
          <>
            <div className="radar-bichos-result-heading">
              <div>
                <span>
                  RESULTADO DO RADAR
                </span>
              </div>

              <small>
                {selectedLottery?.label ||
                  lotteryKey}
                {" • "}
                {targetHour}
                {" • "}
                {formatDateBR(
                  targetDate
                )}
              </small>
            </div>

            <section
              className={`radar-bichos-grid radar-bichos-grid-${mode.toLowerCase()}`}
            >
              {cards.map(
                (card) => {
                  const image =
                    animalImage(
                      card.group
                    );

                  const name =
                    animalName(
                      card.group
                    );

                  return (
                    <article
                      className="radar-bichos-card"
                      key={`${mode}-${card.group}-${card.rank}`}
                    >
                      <div className="radar-bichos-animal">
                        <div className="radar-bichos-image-frame">
                          {image ? (
                            <img
                              src={image}
                              alt={name}
                              loading="lazy"
                            />
                          ) : (
                            <div className="radar-bichos-image-fallback">
                              G{String(card.group).padStart(2, "0")}
                            </div>
                          )}
                        </div>

                        <div className="radar-bichos-animal-title">
                          <strong>
                            {name}
                          </strong>

                          <span>
                            G{String(card.group).padStart(2, "0")}
                          </span>
                        </div>
                      </div>

                      <div className="radar-bichos-number-matrix">
                        <div className="radar-bichos-dezena-chip-row">
                          {(card.rows || []).map(
                            (row) => (
                              <div
                                className="radar-bichos-dezena-chip"
                                key={`dz-${card.group}-${row.dezena}`}
                              >
                                {row.dezena}
                              </div>
                            )
                          )}
                        </div>

                        <div className="radar-bichos-milhar-grid">
                          {Array.from(
                            {
                              length: 4,
                            },
                            (
                              _,
                              numberIndex
                            ) =>
                              (card.rows || []).map(
                                (row) => {
                                  const item =
                                    (row.numbers || [])[
                                      numberIndex
                                    ];

                                  return (
                                    <div
                                      className="radar-bichos-milhar-pill"
                                      key={`m-${card.group}-${row.dezena}-${numberIndex}`}
                                    >
                                      {item?.milhar || "—"}
                                    </div>
                                  );
                                }
                              )
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="radar-bichos-copy"
                        onClick={
                          () =>
                            copyCard(
                              card
                            )
                        }
                      >
                        {copiedGroup ===
                        card.group
                          ? "COPIADO"
                          : "COPIAR MILHARES"}
                      </button>
                    </article>
                  );
                }
              )}
            </section>
          </>
        )}
    </main>
  );
}
