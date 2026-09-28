import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getAnimalLabel,
} from "../../constants/bichoMap";

import {
  buildRadarCards,
} from "./radarTop1Top7Engine";

import {
  radarHitCoverage,
  radarHitLabel,
} from "./radarHistory";

import {
  saveRadarPredictionSnapshot,
  loadRadarHistoryViewDay,
} from "./radarHistory.firestore";

function safeString(value) {
  return String(value ?? "").trim();
}

function sourceValue(
  source,
  key
) {
  return safeString(
    source?.[key] ??
      source?.days?.[key]?.milhar ??
      ""
  );
}

function hasCompleteSource(
  source
) {
  return (
    /^\d{4}$/.test(
      sourceValue(
        source,
        "d1"
      )
    ) &&
    /^\d{4}$/.test(
      sourceValue(
        source,
        "d2"
      )
    ) &&
    /^\d{4}$/.test(
      sourceValue(
        source,
        "d3"
      )
    )
  );
}

function buildBothModes(
  source
) {
  const d1 =
    sourceValue(
      source,
      "d1"
    );

  const d2 =
    sourceValue(
      source,
      "d2"
    );

  const d3 =
    sourceValue(
      source,
      "d3"
    );

  return {
    TOP1:
      buildRadarCards({
        mode:
          "TOP1",
        d1,
        d2,
        d3,
      }),

    TOP7:
      buildRadarCards({
        mode:
          "TOP7",
        d1,
        d2,
        d3,
      }),
  };
}

function hitClass(
  hitType
) {
  switch (
    safeString(
      hitType
    )
  ) {
    case "hit_exact":
      return "radar-history-hit-milhar";

    case "hit_centena":
      return "radar-history-hit-centena";

    case "hit_dezena":
      return "radar-history-hit-dezena";

    case "hit_grupo":
      return "radar-history-hit-grupo";

    case "miss":
      return "radar-history-hit-miss";

    default:
      return "radar-history-hit-pending";
  }
}

function hitMatchedValue(
  hit
) {
  const direct =
    safeString(
      hit?.matchedValue
    );

  if (direct) {
    return direct;
  }

  switch (
    safeString(
      hit?.hitType
    )
  ) {
    case "hit_exact":
      return safeString(
        hit?.matchedMilhar ||
          hit?.resultMilhar
      );

    case "hit_centena":
      return safeString(
        hit?.matchedCentena
      );

    case "hit_dezena":
      return safeString(
        hit?.matchedDezena
      );

    default:
      return "";
  }
}

function hitAnimal(
  hit
) {
  const group =
    Number(
      hit?.matchedGrupo
    );

  if (
    !Number.isInteger(group) ||
    group < 1 ||
    group > 25
  ) {
    return "";
  }

  return safeString(
    getAnimalLabel(
      group
    )
  ).toUpperCase();
}

function entryHits(
  entry
) {
  if (
    entry?.status !==
    "validated"
  ) {
    return [];
  }

  const persisted =
    Array.isArray(
      entry?.hits
    )
      ? entry.hits.filter(
          (hit) =>
            hit &&
            hit?.hitType !==
              "miss"
        )
      : [];

  const hits =
    persisted.length
      ? persisted
      : (
          entry?.hitType &&
          entry?.hitType !==
            "miss"
        )
        ? [
            entry,
          ]
        : [];

  return [
    ...hits,
  ].sort(
    (a, b) =>
      Number(
        a?.resultPosition ||
          999
      ) -
        Number(
          b?.resultPosition ||
            999
        ) ||
      Number(
        a?.predictionPosition ||
          999
      ) -
        Number(
          b?.predictionPosition ||
            999
        )
  );
}

function formatHit(
  hit
) {
  const label =
    radarHitLabel(
      hit?.hitType
    );

  const value =
    hitMatchedValue(
      hit
    );

  const animal =
    hitAnimal(
      hit
    );

  const pieces = [];

  if (animal) {
    pieces.push(
      animal
    );
  }

  pieces.push(
    value
      ? `${label} ${value}`
      : label
  );

  const position =
    Number(
      hit?.resultPosition
    );

  if (
    Number.isInteger(
      position
    ) &&
    position > 0
  ) {
    pieces.push(
      `P${position}`
    );
  }

  return pieces.join(
    " · "
  );
}

function entryGroup(
  entry
) {
  const group =
    Number(
      entry?.matchedGrupo
    );

  if (
    !Number.isInteger(group) ||
    group < 1 ||
    group > 25
  ) {
    return "";
  }

  return (
    `G${String(group).padStart(
      2,
      "0"
    )}`
  );
}

function cardPosition(
  entry
) {
  const position =
    Number(
      entry?.predictionPosition
    );

  if (
    !Number.isInteger(
      position
    ) ||
    position < 1
  ) {
    return "";
  }

  return (
    `CARD ${position}`
  );
}

function HistoryHitDetails({
  entry,
}) {
  if (
    entry?.status !==
    "validated"
  ) {
    return (
      <span className="radar-history-hit-pending">
        AGUARDANDO RESULTADO
      </span>
    );
  }

  const hits =
    entryHits(
      entry
    );

  if (!hits.length) {
    return (
      <>
        <span className="radar-history-hit-count">
          0 ACERTOS
        </span>

        <span className="radar-history-hit-miss">
          ERRO
        </span>
      </>
    );
  }

  return (
    <>
      <span className="radar-history-hit-count">
        {hits.length}
        {" "}
        {hits.length === 1
          ? "ACERTO"
          : "ACERTOS"}
      </span>

      <div className="radar-history-hit-list">
        {hits.map(
          (
            hit,
            index
          ) => (
            <div
              className="radar-history-hit-item"
              key={[
                entry?.id,
                hit?.resultPosition,
                hit?.predictionPosition,
                hit?.hitType,
                index,
              ].join("-")}
            >
              <span
                className={[
                  "radar-history-hit-main",
                  hitClass(
                    hit?.hitType
                  ),
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {formatHit(
                  hit
                )}
              </span>

              <small className="radar-history-hit-meta">
                {[
                  entryGroup(
                    hit
                  ),
                  cardPosition(
                    hit
                  ),
                ]
                  .filter(Boolean)
                  .join(
                    " · "
                  )}
              </small>
            </div>
          )
        )}
      </div>
    </>
  );
}

export default function RadarHistoryPanel({
  lotteryKey,
  targetYmd,
  targetHour,
  mode,
  source,
}) {
  const [
    entries,
    setEntries,
  ] =
    useState([]);

  const [
    state,
    setState,
  ] =
    useState(
      "loading"
    );

  const [
    message,
    setMessage,
  ] =
    useState("");

  useEffect(
    () => {
      let cancelled =
        false;

      async function run() {
        if (
          !lotteryKey ||
          !targetYmd ||
          !targetHour ||
          !hasCompleteSource(
            source
          )
        ) {
          if (
            !cancelled
          ) {
            setEntries([]);
            setState(
              "idle"
            );
            setMessage("");
          }

          return;
        }

        setState(
          "loading"
        );
        setMessage("");

        try {
          /*
           * RADAR_HISTORY_DUAL_FREEZE_V1
           *
           * Uma visita ao slot congela os dois modos.
           * TOP1 e TOP7 possuem IDs independentes.
           */
          const cardsByMode =
            buildBothModes(
              source
            );

          await Promise.all(
            [
              "TOP1",
              "TOP7",
            ].map(
              (
                historyMode
              ) =>
                saveRadarPredictionSnapshot({
                  lotteryKey,
                  targetYmd,
                  targetHour,
                  mode:
                    historyMode,
                  cards:
                    cardsByMode[
                      historyMode
                    ],
                  source,
                })
            )
          );

          /*
           * Sincroniza somente o modo atualmente exibido.
           * Os dois snapshots permanecem congelados.
           */
          const resolved =
            await loadRadarHistoryViewDay({
              lotteryKey,
              targetYmd,
              mode,
            });

          if (
            cancelled
          ) {
            return;
          }

          setEntries(
            Array.isArray(
              resolved
            )
              ? resolved
              : []
          );

          setState(
            "ready"
          );
        } catch (error) {
          if (
            cancelled
          ) {
            return;
          }

          console.warn(
            "[radar-history]",
            error
          );

          setEntries([]);
          setState(
            "error"
          );
          setMessage(
            "Histórico temporariamente indisponível."
          );
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
      targetYmd,
      targetHour,
      mode,
      source,
    ]
  );

  const summary =
    useMemo(
      () => {
        const rows =
          Array.isArray(
            entries
          )
            ? entries
            : [];

        const validated =
          rows.filter(
            (entry) =>
              entry?.status ===
              "validated"
          );

        const coverageCount =
          (level) =>
            validated.filter(
              (entry) =>
                Boolean(
                  radarHitCoverage(
                    entry?.hitType
                  )?.[level]
                )
            ).length;

        return {
          total:
            rows.length,

          validated:
            validated.length,

          pending:
            Math.max(
              0,
              rows.length -
                validated.length
            ),

          milhar:
            coverageCount(
              "milhar"
            ),

          centena:
            coverageCount(
              "centena"
            ),

          dezena:
            coverageCount(
              "dezena"
            ),

          grupo:
            coverageCount(
              "grupo"
            ),

          erro:
            coverageCount(
              "erro"
            ),
        };
      },
      [
        entries,
      ]
    );

  return (
    <section
      className="radar-history"
      data-radar-history="persisted-v1"
    >
      <div className="radar-history-heading">
        <div>
          <span>
            CONFERÊNCIA
          </span>

          <h2>
            Histórico do Radar
          </h2>
        </div>

        <strong>
          {mode}
        </strong>
      </div>

      <div className="radar-history-summary">
        <div>
          <span>
            REGISTROS
          </span>
          <b>
            {summary.total}
          </b>
        </div>

        <div>
          <span>
            MILHAR
          </span>
          <b>
            {summary.milhar}
          </b>
        </div>

        <div>
          <span>
            CENTENA
          </span>
          <b>
            {summary.centena}
          </b>
        </div>

        <div>
          <span>
            DEZENA
          </span>
          <b>
            {summary.dezena}
          </b>
        </div>

        <div>
          <span>
            GRUPO
          </span>
          <b>
            {summary.grupo}
          </b>
        </div>

        <div>
          <span>
            ERRO
          </span>
          <b>
            {summary.erro}
          </b>
        </div>
      </div>

      {state ===
      "loading" ? (
        <div className="radar-history-empty">
          Carregando histórico...
        </div>
      ) : state ===
        "error" ? (
        <div className="radar-history-empty">
          {message}
        </div>
      ) : entries.length ===
        0 ? (
        <div className="radar-history-empty">
          Nenhuma previsão congelada para esta data e modo.
        </div>
      ) : (
        <div className="radar-history-list">
          {entries.map(
            (entry) => (
              <article
                className="radar-history-row"
                key={
                  entry.id
                }
              >
                <div className="radar-history-time">
                  <span>
                    HORÁRIO
                  </span>

                  <strong>
                    {entry.targetHour}
                  </strong>
                </div>

                <div className="radar-history-detail">
                  <HistoryHitDetails
                    entry={
                      entry
                    }
                  />
                </div>

                <div className="radar-history-mode">
                  {entry.mode}
                </div>
              </article>
            )
          )}
        </div>
      )}

      <div className="radar-history-footnote">
        <span>
          Validados:
          {" "}
          {summary.validated}
        </span>

        <span>
          Pendentes:
          {" "}
          {summary.pending}
        </span>
      </div>
    </section>
  );
}