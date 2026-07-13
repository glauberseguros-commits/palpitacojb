import React, { useState } from "react";

import {
  getKingBoundsByUf,
  getKingResultsByRange,
} from "../../../../services/kingResultsService";

import { loadMilharEngineAudit } from "./engine.api";
import { ENGINE_INFO } from "./engine.info";

const LOTTERY_KEY = "PT_RIO";
const CHUNK_DAYS = 45;
const POSITIONS = [1, 2, 3, 4, 5, 6, 7];

let historicalCache = null;
let historicalPromise = null;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || "").trim()
  );
}

function ymdToUtc(value) {
  if (!isYmd(value)) return null;

  const [year, month, day] = value
    .split("-")
    .map(Number);

  return new Date(
    Date.UTC(year, month - 1, day)
  );
}

function addDays(value, amount) {
  const date = ymdToUtc(value);

  if (!date) return value;

  date.setUTCDate(
    date.getUTCDate() + Number(amount || 0)
  );

  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join("-");
}

function splitRange(dateFrom, dateTo) {
  const chunks = [];

  if (!isYmd(dateFrom) || !isYmd(dateTo)) {
    return chunks;
  }

  let cursor = dateFrom;

  while (cursor <= dateTo) {
    const candidateTo = addDays(
      cursor,
      CHUNK_DAYS - 1
    );

    const chunkTo =
      candidateTo > dateTo
        ? dateTo
        : candidateTo;

    chunks.push({
      from: cursor,
      to: chunkTo,
    });

    cursor = addDays(chunkTo, 1);
  }

  return chunks;
}

function firstValidYmd(...values) {
  for (const value of values) {
    const normalized = String(
      value || ""
    ).trim();

    if (isYmd(normalized)) {
      return normalized;
    }
  }

  return "";
}

function normalizeBounds(raw) {
  const source = raw?.data || raw || {};

  const minYmd = firstValidYmd(
    source.minYmd,
    source.minDate,
    source.dateFrom,
    source.min_date
  );

  const maxYmd = firstValidYmd(
    source.maxYmd,
    source.maxDate,
    source.dateTo,
    source.max_date
  );

  return {
    minYmd,
    maxYmd,
  };
}

function arrayFrom(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function normalizeDraws(raw) {
  const source = raw?.data || raw || {};

  return arrayFrom(
    source.draws,
    source.results,
    source.items,
    raw?.draws,
    raw?.results
  );
}

function normalizeFlatPrizes(raw) {
  const source = raw?.data || raw || {};

  return arrayFrom(
    source.prizesAllSorted,
    source.prizesAll,
    source.prizes,
    raw?.prizesAllSorted,
    raw?.prizesAll,
    raw?.prizes
  );
}

function collectPrizes(raw) {
  const flat = normalizeFlatPrizes(raw);

  if (flat.length) {
    return flat;
  }

  const output = [];

  for (const draw of normalizeDraws(raw)) {
    const prizes = Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

    for (const prize of prizes) {
      output.push(prize);
    }
  }

  return output;
}

function pickMilhar4(prize) {
  const candidates = [
    prize?.milhar,
    prize?.number,
    prize?.numero,
    prize?.value,
    prize?.result,
    prize?.resultado,
  ];

  for (const candidate of candidates) {
    const digits = String(candidate ?? "")
      .replace(/\D/g, "");

    if (!digits) continue;

    return digits
      .slice(-4)
      .padStart(4, "0");
  }

  return "";
}

function groupFromDezena(dezena) {
  const value = Number(dezena);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (value === 0) return 25;

  return Math.ceil(value / 4);
}

function groupFromCentena(centena) {
  const normalized = String(centena || "")
    .replace(/\D/g, "")
    .slice(-3)
    .padStart(3, "0");

  return groupFromDezena(
    normalized.slice(-2)
  );
}

function groupFromPrize(prize) {
  const explicitCandidates = [
    prize?.grupo,
    prize?.group,
    prize?.animalGroup,
    prize?.grupoNumero,
  ];

  for (const candidate of explicitCandidates) {
    const value = Number(candidate);

    if (
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 25
    ) {
      return value;
    }
  }

  const milhar = pickMilhar4(prize);

  if (!milhar) return null;

  return groupFromDezena(
    milhar.slice(-2)
  );
}

async function mapWithConcurrency(
  items,
  concurrency,
  worker
) {
  const output = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      output[index] = await worker(
        items[index],
        index
      );
    }
  }

  const runners = Array.from(
    {
      length: Math.max(
        1,
        Math.min(concurrency, items.length)
      ),
    },
    run
  );

  await Promise.all(runners);

  return output;
}

async function loadHistoricalPrizes(
  onProgress
) {
  if (historicalCache) {
    return historicalCache;
  }

  if (historicalPromise) {
    return historicalPromise;
  }

  historicalPromise = (async () => {
    const boundsRaw = await getKingBoundsByUf(
      LOTTERY_KEY
    );

    const bounds = normalizeBounds(boundsRaw);

    if (
      !isYmd(bounds.minYmd) ||
      !isYmd(bounds.maxYmd)
    ) {
      throw new Error(
        "Não foi possível identificar os limites da base histórica."
      );
    }

    const chunks = splitRange(
      bounds.minYmd,
      bounds.maxYmd
    );

    if (!chunks.length) {
      throw new Error(
        "A base histórica não gerou períodos válidos."
      );
    }

    let completed = 0;

    const results = await mapWithConcurrency(
      chunks,
      3,
      async (chunk) => {
        const response =
          await getKingResultsByRange({
            uf: LOTTERY_KEY,
            dateFrom: chunk.from,
            dateTo: chunk.to,
            closeHour: null,
            positions: POSITIONS,
            mode: "detailed",
          });

        const prizes = collectPrizes(response);

        completed += 1;

        onProgress?.({
          completed,
          total: chunks.length,
          label:
            `Carregando histórico ` +
            `(${completed}/${chunks.length})`,
        });

        return prizes;
      }
    );

    historicalCache = {
      prizes: results.flat(),
      minYmd: bounds.minYmd,
      maxYmd: bounds.maxYmd,
      chunks: chunks.length,
    };

    return historicalCache;
  })();

  try {
    return await historicalPromise;
  } finally {
    historicalPromise = null;
  }
}

function formatScore(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0,000";
  }

  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0,00%";
  }

  return (number * 100).toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ) + "%";
}

function EvidenceCell({
  value,
  normalized,
}) {
  return (
    <div className="milhar-audit-evidence">
      <strong>{Number(value || 0)}</strong>
      <small>
        {formatPercent(normalized)}
      </small>
    </div>
  );
}

export default function MilharEnginePage() {
  const [centena, setCentena] =
    useState("225");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [audit, setAudit] =
    useState(null);

  const [dataset, setDataset] =
    useState(null);

  const [progress, setProgress] =
    useState({
      completed: 0,
      total: 0,
      label: "",
    });

  const handleCentenaChange = (event) => {
    const digits = String(
      event?.target?.value || ""
    )
      .replace(/\D/g, "")
      .slice(-3);

    setCentena(digits);
  };

  const handleAudit = async () => {
    const normalized = String(centena || "")
      .replace(/\D/g, "")
      .slice(-3)
      .padStart(3, "0");

    if (!/^\d{3}$/.test(normalized)) {
      setError(
        "Informe uma centena válida com três dígitos."
      );
      return;
    }

    setLoading(true);
    setError("");
    setAudit(null);

    try {
      const historical =
        await loadHistoricalPrizes(
          setProgress
        );

      const targetGroup =
        groupFromCentena(normalized);

      const groupPrizes =
        historical.prizes.filter(
          (prize) =>
            groupFromPrize(prize) ===
            targetGroup
        );

      const result =
        loadMilharEngineAudit({
          centena: normalized,
          prizes: groupPrizes,
        });

      setDataset({
        minYmd: historical.minYmd,
        maxYmd: historical.maxYmd,
        totalPrizes:
          historical.prizes.length,
        groupPrizes:
          groupPrizes.length,
        group: targetGroup,
      });

      setAudit(result);
    } catch (err) {
      console.error(err);

      setError(
        String(
          err?.message ||
          "Falha ao executar a auditoria."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="milhar-engine-page">
      <section className="admin-panel">
        <div className="admin-panel__header milhar-engine-header">
          <div>
            <span className="admin-panel__eyebrow">
              ENGINE · USO INTERNO
            </span>

            <h2>{ENGINE_INFO.title}</h2>

            <p>
              {ENGINE_INFO.description}
            </p>
          </div>

          <div className="milhar-engine-version">
            {ENGINE_INFO.version}
          </div>
        </div>

        <div className="admin-panel__body">
          <div className="milhar-engine-form">
            <label htmlFor="milhar-engine-centena">
              Centena auditada
            </label>

            <div className="milhar-engine-form__row">
              <input
                id="milhar-engine-centena"
                value={centena}
                onChange={handleCentenaChange}
                inputMode="numeric"
                maxLength={3}
                placeholder="225"
                disabled={loading}
              />

              <button
                type="button"
                onClick={handleAudit}
                disabled={loading}
              >
                {loading
                  ? "Processando..."
                  : "Executar auditoria"}
              </button>
            </div>

            {loading && progress.total > 0 ? (
              <div className="milhar-engine-progress">
                <div>
                  <span>
                    {progress.label}
                  </span>

                  <strong>
                    {Math.round(
                      (
                        progress.completed /
                        progress.total
                      ) * 100
                    )}
                    %
                  </strong>
                </div>

                <div className="milhar-engine-progress__track">
                  <span
                    style={{
                      width:
                        `${Math.min(
                          100,
                          (
                            progress.completed /
                            progress.total
                          ) * 100
                        )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="milhar-engine-error">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {audit ? (
        <>
          <section className="milhar-audit-summary">
            <article>
              <span>Milhar vencedora</span>
              <strong>
                {audit.milhar || "—"}
              </strong>
            </article>

            <article>
              <span>Prefixo vencedor</span>
              <strong>
                {audit.prefixo ?? "—"}
              </strong>
            </article>

            <article>
              <span>Score</span>
              <strong>
                {formatScore(audit.score)}
              </strong>
            </article>

            <article>
              <span>Amostra do grupo</span>
              <strong>
                {audit.sample?.size || 0}
              </strong>
            </article>
          </section>

          <section className="admin-panel">
            <div className="admin-panel__header">
              <div>
                <span className="admin-panel__eyebrow">
                  BASE UTILIZADA
                </span>

                <h2>Contexto da auditoria</h2>
              </div>
            </div>

            <div className="admin-panel__body">
              <div className="milhar-audit-dataset">
                <div>
                  <span>Período</span>
                  <strong>
                    {dataset?.minYmd || "—"}
                    {" → "}
                    {dataset?.maxYmd || "—"}
                  </strong>
                </div>

                <div>
                  <span>Grupo</span>
                  <strong>
                    {dataset?.group || "—"}
                  </strong>
                </div>

                <div>
                  <span>Prêmios totais</span>
                  <strong>
                    {dataset?.totalPrizes || 0}
                  </strong>
                </div>

                <div>
                  <span>Prêmios do grupo</span>
                  <strong>
                    {dataset?.groupPrizes || 0}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel__header">
              <div>
                <span className="admin-panel__eyebrow">
                  RANKING INTERNO
                </span>

                <h2>
                  Prefixos candidatos
                </h2>
              </div>
            </div>

            <div className="admin-panel__body">
              <div className="milhar-audit-table-wrap">
                <table className="milhar-audit-table">
                  <thead>
                    <tr>
                      <th>Pos.</th>
                      <th>Milhar</th>
                      <th>Prefixo</th>
                      <th>Score</th>
                      <th>Frequência exata</th>
                      <th>Prefixo/dezena</th>
                      <th>Prefixo geral</th>
                      <th>Recência</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(audit.ranking || []).map(
                      (item) => (
                        <tr
                          key={item.milhar}
                          className={
                            item.position === 1
                              ? "milhar-audit-table__winner"
                              : ""
                          }
                        >
                          <td>
                            {item.position}º
                          </td>

                          <td>
                            <strong>
                              {item.milhar}
                            </strong>
                          </td>

                          <td>
                            {item.prefixo}
                          </td>

                          <td>
                            {formatScore(
                              item.score
                            )}
                          </td>

                          <td>
                            <EvidenceCell
                              value={
                                item.evidence
                                  ?.exactFrequency
                                  ?.count
                              }
                              normalized={
                                item.evidence
                                  ?.exactFrequency
                                  ?.normalized
                              }
                            />
                          </td>

                          <td>
                            <EvidenceCell
                              value={
                                item.evidence
                                  ?.prefixSameDezena
                                  ?.count
                              }
                              normalized={
                                item.evidence
                                  ?.prefixSameDezena
                                  ?.normalized
                              }
                            />
                          </td>

                          <td>
                            <EvidenceCell
                              value={
                                item.evidence
                                  ?.prefixOverall
                                  ?.count
                              }
                              normalized={
                                item.evidence
                                  ?.prefixOverall
                                  ?.normalized
                              }
                            />
                          </td>

                          <td>
                            <EvidenceCell
                              value={
                                item.evidence
                                  ?.exactRecency
                                  ?.lastSeen
                              }
                              normalized={
                                item.evidence
                                  ?.exactRecency
                                  ?.normalized
                              }
                            />
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel__header">
              <div>
                <span className="admin-panel__eyebrow">
                  CONFIGURAÇÃO
                </span>

                <h2>Pesos do modelo</h2>
              </div>
            </div>

            <div className="admin-panel__body">
              <div className="milhar-audit-weights">
                {Object.entries(
                  audit.weights || {}
                ).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>
                      {formatScore(value)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
