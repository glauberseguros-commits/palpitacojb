"use strict";

const fs = require("fs");

const viewPath = "src/pages/Top3/Top3View.jsx";
const hookPath = "src/pages/Top3/top3.hooks.js";

let view = fs.readFileSync(viewPath, "utf8");
let hook = fs.readFileSync(hookPath, "utf8");

function replaceOnce(source, before, after, label) {
  const occurrences = source.split(before).length - 1;

  if (occurrences !== 1) {
    throw new Error(
      `${label}: esperado exatamente 1 trecho, encontrados ${occurrences}`
    );
  }

  return source.replace(before, after);
}

/*
 * 1. Limpa imediatamente o estado da loteria/data anterior.
 * Isso impede que Carneiro ou qualquer resultado antigo seja reaproveitado
 * enquanto a nova consulta ainda está carregando.
 */
hook = replaceOnce(
  hook,
`    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };`,
`    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    // Nunca mantenha na tela dados pertencentes à loteria/data anterior.
    // A interface exibirá skeleton até a nova consulta ser concluída.
    setLoadedYmd("");
    setLastHourBucket("");
    setTargetHourBucket("");
    setTargetYmd("");
    setBaseDrawState(null);
    setLastInfo({
      lastYmd: "",
      lastHour: "",
      lastGrupo: null,
      lastAnimal: "",
    });
    setPrevInfo({
      prevYmd: "",
      prevHour: "",
      prevGrupo: null,
      prevAnimal: "",
      source: "none",
    });
    setRangeDraws([]);
    setTodayDraws([]);
    setRangeInfo({ from: "", to: "" });
    setPersistedTop3History([]);

    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };`,
  "limpeza do estado antes do carregamento"
);

/*
 * 2. Header protegido por loading.
 */
view = replaceOnce(
  view,
`  const headerBase = useMemo(() => meta.last || "—", [meta.last]);`,
`  const isRefreshing = Boolean(loading);

  const headerBase = useMemo(() => meta.last || "—", [meta.last]);`,
  "estado visual de carregamento"
);

view = replaceOnce(
  view,
`              <div><b>Base:</b> {headerBase}</div>
              <div><b>Previsão:</b> {headerForecast}</div>
              <div><b>Transição:</b> {headerTransition}</div>`,
`              <div>
                <b>Base:</b>{" "}
                {isRefreshing ? (
                  <span className="top3-skeleton top3-skeleton--text" />
                ) : (
                  headerBase
                )}
              </div>
              <div>
                <b>Previsão:</b>{" "}
                {isRefreshing ? (
                  <span className="top3-skeleton top3-skeleton--short" />
                ) : (
                  headerForecast
                )}
              </div>
              <div>
                <b>Transição:</b>{" "}
                {isRefreshing ? (
                  <span className="top3-skeleton top3-skeleton--short" />
                ) : (
                  headerTransition
                )}
              </div>`,
  "proteção do contexto do cabeçalho"
);

view = replaceOnce(
  view,
`            <div className="top3-helper">
              Previsão baseada na transição: <b>{meta.prev}</b> → <b>{meta.last}</b>
            </div>`,
`            <div className="top3-helper">
              {isRefreshing ? (
                <span className="top3-skeleton top3-skeleton--helper" />
              ) : (
                <>
                  Previsão baseada na transição: <b>{meta.prev}</b> →{" "}
                  <b>{meta.last}</b>
                </>
              )}
            </div>`,
  "proteção da descrição da transição"
);

view = replaceOnce(
  view,
`                <div className="top3-metaItem__value">{meta.last}</div>`,
`                <div className="top3-metaItem__value">
                  {isRefreshing ? (
                    <span className="top3-skeleton top3-skeleton--text" />
                  ) : (
                    meta.last
                  )}
                </div>`,
  "proteção do último resultado"
);

view = replaceOnce(
  view,
`                <div className="top3-metaItem__value">{meta.prev}</div>`,
`                <div className="top3-metaItem__value">
                  {isRefreshing ? (
                    <span className="top3-skeleton top3-skeleton--text" />
                  ) : (
                    meta.prev
                  )}
                </div>`,
  "proteção do resultado anterior"
);

/*
 * 3. Skeleton estrutural no lugar do texto solto “Carregando”.
 */
view = replaceOnce(
  view,
`        {loading ? (
          <div className="top3-empty">Carregando…</div>
        ) : error ? (`,
`        {loading ? (
          <section
            className="top3-stage top3-stage--loading"
            aria-label="Carregando previsões do TOP3"
            aria-busy="true"
          >
            {[0, 1, 2].map((item) => (
              <div className="top3-card top3-loadingCard" key={item}>
                <div className="top3-loadingCard__header">
                  <span className="top3-skeleton top3-skeleton--badge" />
                  <span className="top3-skeleton top3-skeleton--title" />
                </div>
                <div className="top3-loadingCard__identity">
                  <span className="top3-skeleton top3-skeleton--image" />
                  <div className="top3-loadingCard__lines">
                    <span className="top3-skeleton top3-skeleton--short" />
                    <span className="top3-skeleton top3-skeleton--animal" />
                  </div>
                </div>
                <span className="top3-skeleton top3-skeleton--block" />
                <span className="top3-skeleton top3-skeleton--block" />
              </div>
            ))}
          </section>
        ) : error ? (`,
  "skeleton principal"
);

/*
 * 4. Os três palpites passam a usar uma única grade responsiva.
 */
const oldCards = `          <section className="top3-stage">
            {heroItem ? (
              <div className="top3-heroWrap">
                <Top3Card
                  item={heroItem}
                  idx={0}
                  theme={t}
                  copiedAllKey={copiedAllKey}
                  copiedCellKey={copiedCellKey}
                  setCopiedAllKey={setCopiedAllKey}
                  setCopiedCellKey={setCopiedCellKey}
                  copyText={copyText}
                  build16={build16}
                  buildMilhares={buildMilhares}
                  build20={build20}
                />
              </div>
            ) : null}

            {secondaryItems.length ? (
              <div className="top3-secondaryRow">
                {secondaryItems.map((item, localIdx) => (
                  <Top3Card
                    key={\`\${String(item?.grupo ?? "g")}__\${String(item?.animal || "")}__\${localIdx + 1}\`}
                    item={item}
                    idx={localIdx + 1}
                    theme={t}
                    copiedAllKey={copiedAllKey}
                    copiedCellKey={copiedCellKey}
                    setCopiedAllKey={setCopiedAllKey}
                    setCopiedCellKey={setCopiedCellKey}
                    copyText={copyText}
                    build16={build16}
                    buildMilhares={buildMilhares}
                    build20={build20}
                  />
                ))}
              </div>
            ) : null}
          </section>`;

const newCards = `          <section className="top3-stage">
            {list.map((item, idx) => (
              <Top3Card
                key={\`\${String(item?.grupo ?? "g")}__\${String(item?.animal || "")}__\${idx}\`}
                item={item}
                idx={idx}
                theme={t}
                copiedAllKey={copiedAllKey}
                copiedCellKey={copiedCellKey}
                setCopiedAllKey={setCopiedAllKey}
                setCopiedCellKey={setCopiedCellKey}
                copyText={copyText}
                build16={build16}
                buildMilhares={buildMilhares}
                build20={build20}
              />
            ))}
          </section>`;

view = replaceOnce(
  view,
  oldCards,
  newCards,
  "grade unificada dos três palpites"
);

/*
 * 5. Histórico antigo não aparece durante a troca de loteria/data.
 */
view = replaceOnce(
  view,
`        <section className="top3-shell">
          <div className="top3-header__title">
            Histórico recente`,
`        {!loading ? (
        <section className="top3-shell">
          <div className="top3-header__title">
            Histórico recente`,
  "início da proteção do histórico"
);

view = replaceOnce(
  view,
`          </div>
        </section>
      </div>
    </div>`,
`          </div>
        </section>
        ) : null}
      </div>
    </div>`,
  "fim da proteção do histórico"
);

/*
 * 6. Distribuição premium, mantendo max-width de 1380px.
 */
view = replaceOnce(
  view,
`        .top3-stage{
          display: grid;
          gap: 16px;
        }

        .top3-heroWrap{
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
        }

        .top3-secondaryRow{
          width: 100%;
          max-width: 1120px;`,
`        .top3-stage{
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          align-items: stretch;
        }

        .top3-stage > .top3-card{
          height: 100%;
          min-width: 0;
        }

        .top3-heroWrap{
          width: 100%;
          max-width: none;
          margin: 0;
        }

        .top3-secondaryRow{
          width: 100%;
          max-width: none;`,
  "grade premium principal"
);

view = replaceOnce(
  view,
`        .top3-empty{
          color: var(--top3-muted);
          padding: 6px 0;
        }`,
`        .top3-empty{
          color: var(--top3-muted);
          padding: 6px 0;
        }

        .top3-skeleton{
          display: inline-block;
          overflow: hidden;
          position: relative;
          max-width: 100%;
          border-radius: 999px;
          vertical-align: middle;
          background: rgba(255,255,255,0.075);
        }

        .top3-skeleton::after{
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(201,168,62,0.18),
            transparent
          );
          animation: top3Skeleton 1.25s infinite;
        }

        @keyframes top3Skeleton{
          100%{
            transform: translateX(100%);
          }
        }

        .top3-skeleton--text{
          width: min(230px, 72%);
          height: 14px;
        }

        .top3-skeleton--short{
          width: min(128px, 52%);
          height: 14px;
        }

        .top3-skeleton--helper{
          width: min(520px, 88%);
          height: 14px;
        }

        .top3-skeleton--badge{
          width: 30px;
          height: 30px;
          border-radius: 10px;
          flex: 0 0 auto;
        }

        .top3-skeleton--title{
          width: 118px;
          height: 14px;
        }

        .top3-skeleton--image{
          width: 62px;
          height: 62px;
          border-radius: 16px;
          flex: 0 0 auto;
        }

        .top3-skeleton--animal{
          width: min(180px, 82%);
          height: 24px;
        }

        .top3-skeleton--block{
          width: 100%;
          height: 76px;
          border-radius: 14px;
        }

        .top3-loadingCard{
          min-height: 330px;
          align-content: start;
        }

        .top3-loadingCard__header,
        .top3-loadingCard__identity{
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .top3-loadingCard__lines{
          min-width: 0;
          flex: 1;
          display: grid;
          gap: 10px;
        }

        @media (prefers-reduced-motion: reduce){
          .top3-skeleton::after{
            animation: none;
          }
        }`,
  "estilos do skeleton"
);

/*
 * 7. Ajustes de tablet: três colunas no desktop, duas no tablet.
 */
view = replaceOnce(
  view,
`        @media (max-width: 1180px){
          .top3-secondaryRow{
            max-width: 980px;
          }

          .timeline-slot__cards{`,
`        @media (max-width: 1180px){
          .top3-stage{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .top3-stage > .top3-card:first-child{
            grid-column: 1 / -1;
          }

          .top3-secondaryRow{
            max-width: none;
          }

          .timeline-slot__cards{`,
  "distribuição para tablet"
);

/*
 * Não desmontar cedo demais o conteúdo interno dos cards.
 */
view = replaceOnce(
  view,
`          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .top3-card__confidence{
            justify-self: stretch;
            text-align: left;
            max-width: none;
          }

          .top3-card__confidenceValue{
            font-size: 28px;
          }

          .top3-card__actions{
            align-items: stretch;
            flex-direction: column;
          }

          .pp-btn{
            width: 100%;
          }`,
`          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: minmax(0, 1fr) 150px;
            gap: 12px;
          }

          .top3-card__confidence{
            justify-self: end;
            text-align: right;
            max-width: 150px;
          }

          .top3-card__confidenceValue{
            font-size: 26px;
          }

          .top3-card__actions{
            align-items: center;
            flex-direction: row;
            flex-wrap: wrap;
          }

          .pp-btn{
            width: auto;
          }`,
  "distribuição interna para tablet"
);

/*
 * 8. Celular: uma coluna, conteúdo interno bem organizado.
 */
view = replaceOnce(
  view,
`        @media (max-width: 640px){
          .timeline-compact__pick{`,
`        @media (max-width: 640px){
          .top3-stage{
            grid-template-columns: 1fr;
          }

          .top3-stage > .top3-card:first-child{
            grid-column: auto;
          }

          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: minmax(0, 1fr) 112px;
            gap: 10px;
          }

          .top3-card__confidence{
            justify-self: end;
            text-align: right;
            max-width: 112px;
          }

          .top3-card__actions{
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: stretch;
          }

          .top3-card__actions .pp-btn{
            width: 100%;
          }

          .timeline-compact__pick{`,
  "composição específica para celular"
);

view = replaceOnce(
  view,
`          .top3-metaGrid,
          .timeline-slot__metaGrid{
            grid-template-columns: 1fr;
          }`,
`          .top3-metaGrid{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .timeline-slot__metaGrid{
            grid-template-columns: 1fr;
          }`,
  "último e anterior lado a lado no celular"
);

/*
 * Telas realmente estreitas podem empilhar sem causar corte.
 */
view = replaceOnce(
  view,
`        @media (max-width: 420px){
          .top3-shell{`,
`        @media (max-width: 420px){
          .top3-metaGrid{
            grid-template-columns: 1fr;
          }

          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: 1fr;
          }

          .top3-card__confidence{
            justify-self: stretch;
            text-align: left;
            max-width: none;
          }

          .top3-card__actions{
            grid-template-columns: 1fr;
          }

          .top3-shell{`,
  "proteção para telas estreitas"
);

fs.writeFileSync(viewPath, view, "utf8");
fs.writeFileSync(hookPath, hook, "utf8");

console.log("Patch aplicado com sucesso:");
console.log(`- ${viewPath}`);
console.log(`- ${hookPath}`);
