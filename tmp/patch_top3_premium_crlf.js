"use strict";

const fs = require("fs");

const viewPath = "src/pages/Top3/Top3View.jsx";
const hookPath = "src/pages/Top3/top3.hooks.js";

function readNormalized(path) {
  const original = fs.readFileSync(path, "utf8");

  return {
    text: original.replace(/\r\n/g, "\n"),
    eol: original.includes("\r\n") ? "\r\n" : "\n",
  };
}

function writePreservingEol(path, text, eol) {
  const output = eol === "\r\n"
    ? text.replace(/\n/g, "\r\n")
    : text;

  fs.writeFileSync(path, output, "utf8");
}

function occurrences(source, search) {
  return source.split(search).length - 1;
}

function replaceOnce(source, before, after, label) {
  const found = occurrences(source, before);

  if (found !== 1) {
    throw new Error(
      `${label}: esperado 1 trecho; encontrados ${found}.`
    );
  }

  return source.replace(before, after);
}

const viewFile = readNormalized(viewPath);
const hookFile = readNormalized(hookPath);

let view = viewFile.text;
let hook = hookFile.text;

if (
  view.includes("TOP3 PREMIUM CRLF") ||
  view.includes("visibleTop3.map")
) {
  throw new Error(
    "A implementação parece já existir. Operação interrompida."
  );
}

/*
 * 1. Limpa resultados da consulta anterior ao iniciar o carregamento.
 */
hook = replaceOnce(
  hook,
`    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };

    const currentRequestId = ++requestIdRef.current;`,
`    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    // Impede exibir resultados pertencentes à consulta anterior.
    resetStateForNoData();

    const currentRequestId = ++requestIdRef.current;`,
  "início do carregamento"
);

/*
 * 2. Usa uma lista única para os três palpites.
 */
view = replaceOnce(
  view,
`  const heroItem = list[0] || null;
  const secondaryItems = list.slice(1, 3);`,
`  const visibleTop3 = list.slice(0, 3);`,
  "variáveis dos palpites"
);

/*
 * 3. Substitui o texto simples por skeleton.
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
  "carregamento principal"
);

/*
 * 4. Substitui hero + linha secundária por três cards equivalentes.
 */
const oldCards =
`          <section className="top3-stage">
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

const newCards =
`          <section className="top3-stage top3-stage--predictions">
            {visibleTop3.map((item, idx) => (
              <Top3Card
                key={\`\${String(item?.grupo ?? "g")}__\${String(
                  item?.animal || ""
                )}__\${idx}\`}
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
  "estrutura dos três cards"
);

/*
 * 5. Adiciona CSS sem substituir as regras responsivas existentes.
 */
const styleEnd = "      `}</style>";

if (occurrences(view, styleEnd) !== 1) {
  throw new Error(
    `Fechamento dos estilos: encontrados ${occurrences(view, styleEnd)}.`
  );
}

const css = `
        /* TOP3 PREMIUM CRLF */
        .top3-stage--predictions,
        .top3-stage--loading{
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: stretch;
        }

        .top3-stage--predictions > .top3-card,
        .top3-stage--loading > .top3-card{
          width: 100%;
          min-width: 0;
          height: 100%;
        }

        .top3-loadingCard{
          display: grid;
          align-content: start;
          gap: 16px;
          min-height: 330px;
        }

        .top3-loadingCard__header,
        .top3-loadingCard__identity{
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .top3-loadingCard__lines{
          display: grid;
          flex: 1;
          min-width: 0;
          gap: 10px;
        }

        .top3-skeleton{
          position: relative;
          display: block;
          overflow: hidden;
          max-width: 100%;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
        }

        .top3-skeleton::after{
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(201,168,62,0.22),
            transparent
          );
          animation: top3PremiumSkeleton 1.2s infinite;
        }

        .top3-skeleton--badge{
          width: 30px;
          height: 30px;
          flex: 0 0 auto;
          border-radius: 9px;
        }

        .top3-skeleton--title{
          width: 120px;
          height: 14px;
        }

        .top3-skeleton--image{
          width: 62px;
          height: 62px;
          flex: 0 0 auto;
          border-radius: 16px;
        }

        .top3-skeleton--short{
          width: min(125px, 55%);
          height: 13px;
        }

        .top3-skeleton--animal{
          width: min(185px, 82%);
          height: 24px;
        }

        .top3-skeleton--block{
          width: 100%;
          height: 76px;
          border-radius: 14px;
        }

        @keyframes top3PremiumSkeleton{
          100%{
            transform: translateX(100%);
          }
        }

        @media (max-width: 980px){
          .top3-stage--predictions,
          .top3-stage--loading{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .top3-stage--predictions > .top3-card:first-child{
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 640px){
          .top3-stage--predictions,
          .top3-stage--loading{
            grid-template-columns: 1fr;
          }

          .top3-stage--predictions > .top3-card:first-child{
            grid-column: auto;
          }

          .top3-card__actions{
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .top3-card__actions .pp-btn{
            width: 100%;
            min-width: 0;
          }

          .top3-metaGrid{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .timeline-slot__metaGrid{
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 420px){
          .top3-card__actions,
          .top3-metaGrid{
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce){
          .top3-skeleton::after{
            animation: none;
          }
        }

`;

view = view.replace(styleEnd, css + styleEnd);

/*
 * 6. Valida tudo antes de gravar.
 */
const checks = [
  [hook, "resetStateForNoData();", "limpeza inicial"],
  [view, "visibleTop3.map", "três cards equivalentes"],
  [view, "top3-stage--loading", "skeleton"],
  [view, "TOP3 PREMIUM CRLF", "CSS responsivo"],
  [view, "max-width: 1380px", "largura máxima preservada"],
];

for (const [source, search, label] of checks) {
  if (!source.includes(search)) {
    throw new Error(`Validação final falhou: ${label}.`);
  }
}

if (
  view.includes('<div className="top3-empty">Carregando…</div>') ||
  view.includes("secondaryItems.map") ||
  view.includes("{heroItem ? (")
) {
  throw new Error("A estrutura antiga ainda está presente.");
}

writePreservingEol(viewPath, view, viewFile.eol);
writePreservingEol(hookPath, hook, hookFile.eol);

console.log("Patch aplicado com preservação de CRLF.");
console.log(`- ${viewPath}`);
console.log(`- ${hookPath}`);
