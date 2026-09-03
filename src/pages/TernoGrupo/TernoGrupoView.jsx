import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getAnimalLabel,
  getImgFromGrupo,
} from "../../constants/bichoMap";

import {
  buildAllTernosGrupoRepetition,
  TERNO_GRUPO_REPETITION_MAX_QUANTITY,
  TERNO_GRUPO_REPETITION_MIN_QUANTITY,
  validateTernoRepetitionQuantity,
} from "./modules/ternoGrupo.generator.repetition";

import "./TernoGrupo.css";

function formatGrupo(grupo) {
  const number = Number(grupo);

  if (
    !Number.isFinite(number) ||
    number < 1 ||
    number > 25
  ) {
    return "—";
  }

  return String(number).padStart(2, "0");
}

function formatDateBR(ymd) {
  const match = String(ymd || "").match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return "—";

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function resolveLotteryLabel(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase();

  if (key === "PT_RIO" || key === "RJ") {
    return "RJ";
  }

  if (key === "FEDERAL") {
    return "Federal";
  }

  if (key === "LOOK") {
    return "LOOK";
  }

  if (key === "NACIONAL") {
    return "Nacional";
  }

  if (key === "PT_SP") {
    return "São Paulo";
  }

  return key || "—";
}

function AnimalImage({
  grupo,
  animal,
}) {
  const source = getImgFromGrupo(
    Number(grupo),
    128
  );

  return (
    <div className="terno-grupo-animal__image">
      {source ? (
        <img
          src={source}
          alt={animal || `Grupo ${grupo}`}
        />
      ) : (
        <span>G{formatGrupo(grupo)}</span>
      )}
    </div>
  );
}

function TernoCard({
  terno,
}) {
  const strengthLabel =
    terno.scorePct >= 85
      ? "Muito forte"
      : terno.scorePct >= 70
        ? "Forte"
        : terno.scorePct >= 50
          ? "Moderado"
          : "Em análise";

  return (
    <article className="terno-grupo-card">
      <header className="terno-grupo-card__header">
        <div>
          <div className="terno-grupo-card__rank">
            {terno.rank}º TERNO
          </div>

          <div className="terno-grupo-card__strength">
            {strengthLabel}
          </div>
        </div>


      </header>

      <div className="terno-grupo-card__animals">
        {terno.grupos.map((grupo, groupIndex) => {
          const animal = String(
            getAnimalLabel(grupo) || ""
          ).trim();

          return (
            <div
              key={`${terno.key}-${grupo}-${groupIndex}`}
              className="terno-grupo-animal"
            >
              <AnimalImage
                grupo={grupo}
                animal={animal}
              />

              <div className="terno-grupo-animal__group">
                GRUPO {formatGrupo(grupo)}
              </div>

              <div className="terno-grupo-animal__name">
                {animal
                  ? animal.toUpperCase()
                  : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="terno-grupo-card__footer">
        <span>
          Grupos podem repetir
        </span>

        <span>
          Ordem irrelevante
        </span>

        <span>
          Acerto por quantidade no TOP5
        </span>
      </footer>
    </article>
  );
}

export default function TernoGrupoView(
  props
) {
  const {
    loading,
    error,
    analytics,
    top3,
    rangeDraws,
    todayDraws,
    LOTTERY_OPTIONS,
    lotteryKeySafe,
    setLotteryKey,
    ymdSafe,
    setYmd,
    analysisYmd,
    analysisHourBucket,
  } = props || {};
const [quantityInput, setQuantityInput] =
    useState("1");

  const [generatedQuantity, setGeneratedQuantity] =
    useState(1);

  const [quantityError, setQuantityError] =
    useState("");

  const [copyStatus, setCopyStatus] =
    useState("idle");
  const activeMinQuantity =
    TERNO_GRUPO_REPETITION_MIN_QUANTITY;

  const activeMaxQuantity =
    TERNO_GRUPO_REPETITION_MAX_QUANTITY;

  const activeQuantityValidator =
    validateTernoRepetitionQuantity;

  const activeEngineLabel =
    "Jogo completo";const lotOptions = useMemo(() => {
    const source = Array.isArray(
      LOTTERY_OPTIONS
    )
      ? LOTTERY_OPTIONS
      : [];

    const required = [
      {
        value: "PT_RIO",
        label: "RJ",
      },
      {
        value: "FEDERAL",
        label: "Federal",
      },
      {
        value: "LOOK",
        label: "LOOK",
      },
      {
        value: "NACIONAL",
        label: "Nacional",
      },
      {
        value: "PT_SP",
        label: "São Paulo",
      },
    ];

    const map = new Map();

    [...required, ...source].forEach(
      (option) => {
        const value = String(
          option?.value ??
            option?.key ??
            ""
        )
          .trim()
          .toUpperCase();

        if (!value || map.has(value)) {
          return;
        }

        map.set(value, {
          value,
          label:
            value === "PT_RIO"
              ? "RJ"
              : option?.label ||
                resolveLotteryLabel(value),
        });
      }
    );

    return Array.from(map.values());
  }, [LOTTERY_OPTIONS]);

  const allTernos = useMemo(() => {
    return buildAllTernosGrupoRepetition({
      analytics,
      seedGroups: top3,
      historicalDraws: [
        ...(Array.isArray(rangeDraws)
          ? rangeDraws
          : []),
        ...(Array.isArray(todayDraws)
          ? todayDraws
          : []),
      ],
      targetHour: analysisHourBucket,
    });
  }, [
    analytics,
    top3,
    rangeDraws,
    todayDraws,
    analysisHourBucket,
  ]);

  const visibleTernos = useMemo(
    () =>
      allTernos.slice(
        0,
        generatedQuantity
      ),
    [allTernos, generatedQuantity]
  );

  useEffect(() => {
    setQuantityInput("1");
    setGeneratedQuantity(1);
    setQuantityError("");
    setCopyStatus("idle");
  }, [
    lotteryKeySafe,
    analysisYmd,
    analysisHourBucket,
  ]);

  const updateQuantity = (
    nextValue
  ) => {
    const numeric = Math.max(
      activeMinQuantity,
      Math.min(
        activeMaxQuantity,
        Number(nextValue) || 1
      )
    );

    setQuantityInput(String(numeric));
    setQuantityError("");
  };

  const handleGenerate = () => {
    const validation =
      activeQuantityValidator(
        quantityInput
      );

    if (!validation.valid) {
      setQuantityError(
        validation.message
      );
      return;
    }

    setQuantityError("");
    setGeneratedQuantity(
      validation.quantity
    );
  };

  const currentQuantity =
    Number.parseInt(
      quantityInput,
      10
    ) || 0;

  const buildCopyText = () => {
    const lotteryLabel =
      resolveLotteryLabel(
        lotteryKeySafe
      );

    const predictionLabel = [
      formatDateBR(analysisYmd),
      analysisHourBucket || "",
    ]
      .filter(Boolean)
      .join(" • ");

    const quantityLabel =
      visibleTernos.length === 1
        ? "1 terno"
        : `${visibleTernos.length} ternos`;

    const header = [
      "TERNO DE GRUPO",
      `Loteria: ${lotteryLabel}`,
      `Previsão: ${predictionLabel}`,
      `Modo: ${activeEngineLabel}`,
      `Quantidade: ${quantityLabel}`,
    ];

    const blocks = visibleTernos.map(
      (terno) => {
const animals = (
          Array.isArray(terno?.grupos)
            ? terno.grupos
            : []
        ).map((grupo) => {
          const animal = String(
            getAnimalLabel(grupo) || "—"
          )
            .trim()
            .toUpperCase();

          return `${formatGrupo(
            grupo
          )} - ${animal}`;
        });

        return [
          `${terno.rank}º TERNO`,
          ...animals,
        ].join("\n");
      }
    );

    return [
      ...header,
      "",
      ...blocks.flatMap(
        (block, index) =>
          index === blocks.length - 1
            ? [block]
            : [block, ""]
      ),
    ].join("\n");
  };

  const copyTextFallback = (text) => {
    const textarea =
      document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute(
      "readonly",
      ""
    );

    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(
      textarea
    );

    textarea.select();
    textarea.setSelectionRange(
      0,
      textarea.value.length
    );

    const copied =
      document.execCommand("copy");

    document.body.removeChild(
      textarea
    );

    if (!copied) {
      throw new Error(
        "Falha ao copiar os ternos."
      );
    }
  };

  const handleCopyTernos = async () => {
    if (!visibleTernos.length) {
      return;
    }

    const text = buildCopyText();

    try {
      if (
        navigator?.clipboard &&
        window?.isSecureContext
      ) {
        await navigator.clipboard.writeText(
          text
        );
      } else {
        copyTextFallback(text);
      }

      setCopyStatus("copied");

      window.setTimeout(() => {
        setCopyStatus("idle");
      }, 1800);
    } catch {
      try {
        copyTextFallback(text);
        setCopyStatus("copied");

        window.setTimeout(() => {
          setCopyStatus("idle");
        }, 1800);
      } catch {
        setCopyStatus("error");

        window.setTimeout(() => {
          setCopyStatus("idle");
        }, 2200);
      }
    }
  };

  return (
    <main className="terno-grupo-page">
      <div className="terno-grupo-container">
        <section className="terno-grupo-hero">
          <div>
            <div className="terno-grupo-eyebrow">
              PALPITACO JB
            </div>

            <h1>Terno de Grupo</h1>

            <p>
              Gere combinações completas de três grupos, com grupos diferentes, duplicados ou triplicados, classificadas da maior para a menor força estatística.
            </p>
          </div>

          </section>

        <section className="terno-grupo-panel">
          <div className="terno-grupo-filters">
            <label>
              <span>Loteria</span>

              <select
                value={
                  lotteryKeySafe ||
                  "PT_RIO"
                }
                onChange={(event) =>
                  setLotteryKey?.(
                    event.target.value
                  )
                }
              >
                {lotOptions.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span>Data</span>

              <input
                type="date"
                value={ymdSafe || ""}
                onChange={(event) =>
                  setYmd?.(
                    event.target.value
                  )
                }
              />
            </label>

            <div className="terno-grupo-target">
              <span>Previsão</span>

              <strong>
                {formatDateBR(
                  analysisYmd
                )}
                {analysisHourBucket
                  ? ` • ${analysisHourBucket}`
                  : ""}
              </strong>
            </div>
          </div>

          <div className="terno-grupo-generator">
            <div className="terno-grupo-generator__copy">
              <h2>
                Quantos ternos deseja gerar?
              </h2>

              <p>
                Escolha de 1 a{" "}
                {activeMaxQuantity.toLocaleString(
                  "pt-BR"
                )}. O resultado será
                apresentado do mais forte
                para o mais fraco.
              </p>
            </div>

            <div className="terno-grupo-generator__controls">
              <div className="terno-grupo-stepper">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() =>
                    updateQuantity(
                      currentQuantity - 1
                    )
                  }
                  disabled={
                    currentQuantity <=
                    activeMinQuantity
                  }
                >
                  −
                </button>

                <input
                  type="text"
                  inputMode="numeric"
                  value={quantityInput}
                  aria-label="Quantidade de ternos"
                  onChange={(event) => {
                    const value =
                      event.target.value.replace(
                        /\D/g,
                        ""
                      );

                    setQuantityInput(
                      value
                    );

                    if (!value) {
                      setQuantityError("");
                      return;
                    }

                    const validation =
                      activeQuantityValidator(
                        value
                      );

                    setQuantityError(
                      validation.valid
                        ? ""
                        : validation.message
                    );
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter"
                    ) {
                      handleGenerate();
                    }
                  }}
                />

                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  onClick={() =>
                    updateQuantity(
                      currentQuantity + 1
                    )
                  }
                  disabled={
                    currentQuantity >=
                    activeMaxQuantity
                  }
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="terno-grupo-generate"
                onClick={handleGenerate}
                disabled={
                  loading ||
                  Boolean(quantityError) ||
                  !quantityInput
                }
              >
                {loading
                  ? "ANALISANDO..."
                  : "GERAR"}
              </button>
            </div>

            <div
              className={`terno-grupo-generator__message ${
                quantityError
                  ? "terno-grupo-generator__message--error"
                  : ""
              }`}
            >
              {quantityError ||
                `Quantidade máxima permitida: ${activeMaxQuantity.toLocaleString(
                  "pt-BR"
                )} ternos.`}
            </div>
          </div>
        </section>

        {error ? (
          <div className="terno-grupo-error">
            {String(error)}
          </div>
        ) : null}

        {!loading &&
        allTernos.length !==
          activeMaxQuantity ? (
          <div className="terno-grupo-error">
            O motor não conseguiu formar
            todas as{" "}
            {activeMaxQuantity.toLocaleString(
              "pt-BR"
            )} combinações.
          </div>
        ) : null}

        <section className="terno-grupo-results">
          <header className="terno-grupo-results__header">
            <div>
              <span>
                Resultado gerado • jogo completo
              </span>

              <strong>
                {visibleTernos.length}
                {visibleTernos.length === 1
                  ? " terno"
                  : " ternos"}
              </strong>
            </div>

            <div className="terno-grupo-results__actions">

              <button
                type="button"
                className={`terno-grupo-copy ${
                  copyStatus === "copied"
                    ? "terno-grupo-copy--copied"
                    : ""
                } ${
                  copyStatus === "error"
                    ? "terno-grupo-copy--error"
                    : ""
                }`}
                onClick={handleCopyTernos}
                disabled={
                  loading ||
                  !visibleTernos.length
                }
              >
                {copyStatus === "copied"
                  ? "COPIADO!"
                  : copyStatus === "error"
                    ? "ERRO AO COPIAR"
                    : "COPIAR TERNOS"}
              </button>
            </div>
          </header>

          {loading ? (
            <div className="terno-grupo-loading">
              Analisando a base estatística...
            </div>
          ) : visibleTernos.length ? (
            <div className="terno-grupo-list">
              {visibleTernos.map(
                (terno) => (
                  <TernoCard
                    key={terno.key}
                    terno={terno}
                  />
                )
              )}
            </div>
          ) : (
            <div className="terno-grupo-empty">
              Nenhum terno disponível para
              os filtros selecionados.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}



