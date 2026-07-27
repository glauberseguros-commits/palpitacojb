"use strict";

const fs = require("fs");

const viewPath = "src/pages/Top3/Top3View.jsx";
const hookPath = "src/pages/Top3/top3.hooks.js";

let view = fs.readFileSync(viewPath, "utf8");
let hook = fs.readFileSync(hookPath, "utf8");

function count(source, search) {
  return source.split(search).length - 1;
}

function replaceExactlyOnce(source, before, after, label) {
  const found = count(source, before);

  if (found !== 1) {
    throw new Error(
      `${label}: esperado 1 trecho, encontrados ${found}. Nenhum arquivo foi gravado.`
    );
  }

  return source.replace(before, after);
}

/*
 * Validação preventiva.
 */
const requiredChecks = [
  [hook, "const resetStateForNoData = useCallback(() => {", "resetStateForNoData"],
  [hook, "    setLoading(true);", "início do carregamento"],
  [view, '<div className="top3-empty">Carregando…</div>', "Carregando antigo"],
  [view, 'const heroItem = list[0] || null;', "heroItem"],
  [view, 'const secondaryItems = list.slice(1, 3);', "secondaryItems"],
  [view, '.top3-stage{', "estilo top3-stage"],
  [view, '@media (max-width: 640px){', "media query celular"],
];

for (const [source, search, label] of requiredChecks) {
  if (!source.includes(search)) {
    throw new Error(
      `Pré-validação falhou em "${label}". Nenhum arquivo foi gravado.`
    );
  }
}

/*
 * 1. Limpa o resultado anterior assim que uma nova consulta começa.
 */
hook = replaceExactlyOnce(
  hook,
`    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };`,
`    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    // Evita exibir dados pertencentes à loteria ou data anterior.
    resetStateForNoData();

    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };`,
  "limpeza do estado anterior"
);

/*
 * 2. Remove variáveis que deixam o primeiro palpite isolado.
 */
view = replaceExactlyOnce(
  view,
`  const heroItem = list[0] || null;
  const secondaryItems = list.slice(1, 3);`,
`  const visibleTop3 = list.slice(0, 3);`,
  "lista unificada do Top3"
);

/*
 * 3. Skeleton estrutural no carregamento.
 */
view = replaceExactlyOnce(
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
  "skeleton de carregamento"
);

/*
 * 4. Substitui o bloco primeiro + secundários por uma grade única.
 */
const cardsStart =
`          <section className="top3-stage">
            {heroItem ? (`;

const cardsEnd =
`            ) : null}
          </section>
        )}`;

const startIndex = view.indexOf(cardsStart);

if (startIndex < 0) {
  throw new Error(
    'Início do bloco de palpites não encontrado. Nenhum arquivo foi gravado.'
  );
}

const endIndex = view.indexOf(cardsEnd, startIndex);

if (endIndex < 0) {
  throw new Error(
    'Fim do bloco de palpites não encontrado. Nenhum arquivo foi gravado.'
  );
}

const oldCardsBlock = view.slice(
  startIndex,
  endIndex + cardsEnd.length
);

if (
  !oldCardsBlock.includes("heroItem") ||
  !oldCardsBlock.includes("secondaryItems.map")
) {
  throw new Error(
    'O bloco de palpites atual não possui a estrutura esperada. Nenhum arquivo foi gravado.'
  );
}

const newCardsBlock =
`          <section className="top3-stage">
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
          </section>
        )}`;

view =
  view.slice(0, startIndex) +
  newCardsBlock +
  view.slice(endIndex + cardsEnd.length);

/*
 * 5. Acrescenta os ajustes ao fim da folha de estilos embutida.
 * As regras novas têm prioridade sem alterar max-width: 1380px.
 */
const styleEnd = "      `}</style>";

if (count(view, styleEnd) !== 1) {
  throw new Error(
    `Fechamento da folha de estilos: esperado 1, encontrados ${count(
      view,
      styleEnd
    )}. Nenhum arquivo foi gravado.`
  );
}

const responsiveCss = `
        /* TOP3 Premium V2 — distribuição e carregamento */
        .top3-stage{
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: stretch;
        }

        .top3-stage > .top3-card{
          width: 100%;
          min-width: 0;
          height: 100%;
        }

        .top3-skeleton{
          display: inline-block;
          position: relative;
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

        @keyframes top3PremiumSkeleton{
          100%{
            transform: translateX(100%);
          }
        }

        .top3-stage--loading{
          min-height: 330px;
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

        @media (max-width: 1180px){
          .top3-stage{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .top3-stage:not(.top3-stage--loading) > .top3-card:first-child{
            grid-column: 1 / -1;
          }

          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: minmax(0, 1fr) 150px;
            gap: 12px;
          }

          .top3-card__confidence{
            justify-self: end;
            max-width: 150px;
            text-align: right;
          }

          .top3-card__actions{
            flex-flow: row wrap;
            align-items: center;
          }

          .top3-card__actions .pp-btn{
            width: auto;
          }
        }

        @media (max-width: 640px){
          .top3-stage{
            grid-template-columns: 1fr;
          }

          .top3-stage:not(.top3-stage--loading) > .top3-card:first-child{
            grid-column: auto;
          }

          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: minmax(0, 1fr) 112px;
            gap: 10px;
          }

          .top3-card__confidence{
            justify-self: end;
            max-width: 112px;
            text-align: right;
          }

          .top3-card__actions{
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: stretch;
          }

          .top3-card__actions .pp-btn{
            width: 100%;
          }

          .top3-metaGrid{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .timeline-slot__metaGrid{
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 420px){
          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: 1fr;
          }

          .top3-card__confidence{
            justify-self: stretch;
            max-width: none;
            text-align: left;
          }

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

view = view.replace(styleEnd, responsiveCss + styleEnd);

/*
 * Validação do resultado em memória.
 */
const finalChecks = [
  [hook, "resetStateForNoData();", "limpeza durante carregamento"],
  [view, "visibleTop3.map", "grade unificada"],
  [view, "top3-stage--loading", "skeleton"],
  [view, "TOP3 Premium V2", "CSS responsivo"],
];

for (const [source, search, label] of finalChecks) {
  if (!source.includes(search)) {
    throw new Error(`Validação final falhou em "${label}".`);
  }
}

if (view.includes('<div className="top3-empty">Carregando…</div>')) {
  throw new Error("O carregamento antigo ainda está presente.");
}

if (view.includes("secondaryItems.map") || view.includes("{heroItem ? (")) {
  throw new Error("A distribuição antiga dos cards ainda está presente.");
}

/*
 * Somente agora grava os dois arquivos.
 */
fs.writeFileSync(viewPath, view, "utf8");
fs.writeFileSync(hookPath, hook, "utf8");

console.log("Patch aplicado e validado em memória.");
console.log(`- ${viewPath}`);
console.log(`- ${hookPath}`);
