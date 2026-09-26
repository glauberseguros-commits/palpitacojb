import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  buildRadarCards,
} from "./radarTop1Top7Engine";

import {
  radarHitLabel,
} from "./radarHistory";

import {
  saveRadarPredictionSnapshot,
  syncRadarPredictionDay,
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

function formatResult(
  entry
) {
  if (
    entry?.status !==
    "validated"
  ) {
    return "AGUARDANDO RESULTADO";
  }

  const label =
    radarHitLabel(
      entry?.hitType
    );

  if (
    entry?.hitType ===
    "miss"
  ) {
    return label;
  }

  const pieces = [
    label,
  ];

  if (
    entry?.matchedValue
  ) {
    pieces.push(
      entry.matchedValue
    );
  }

  if (
    Number.isInteger(
      Number(
        entry?.resultPosition
      )
    )
  ) {
    pieces.push(
      `P${Number(
        entry.resultPosition
      )}`
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
            await syncRadarPredictionDay({
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

        const count =
          (type) =>
            validated.filter(
              (entry) =>
                entry?.hitType ===
                type
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
            count(
              "hit_exact"
            ),

          centena:
            count(
              "hit_centena"
            ),

          dezena:
            count(
              "hit_dezena"
            ),

          grupo:
            count(
              "hit_grupo"
            ),

          erro:
            count(
              "miss"
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
                  <span
                    className={
                      hitClass(
                        entry.hitType
                      )
                    }
                  >
                    {formatResult(
                      entry
                    )}
                  </span>

                  <small>
                    {[
                      entryGroup(
                        entry
                      ),
                      cardPosition(
                        entry
                      ),
                    ]
                      .filter(
                        Boolean
                      )
                      .join(
                        " · "
                      )}
                  </small>
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