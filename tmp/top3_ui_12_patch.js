"use strict";

const fs = require("fs");

const target = "./src/pages/Top3/Top3View.jsx";

let content = fs.readFileSync(target, "utf8");
const original = content;

const startAnchor = "              historyRows.map((item) => {";
const endAnchor = [
  "              })",
  "            )}",
  "          </div>",
  "        </section>",
].join("\n");

const startIndex = content.indexOf(startAnchor);
const endIndex = content.indexOf(
  endAnchor,
  startIndex
);

if (startIndex < 0) {
  throw new Error(
    "Início de historyRows.map não localizado."
  );
}

if (endIndex < 0) {
  throw new Error(
    "Final do Histórico recente não localizado."
  );
}

const sectionEnd =
  endIndex +
  [
    "              })",
    "            )}",
    "          </div>",
  ].join("\n").length;

let section = content.slice(
  startIndex,
  sectionEnd
);

function replaceOnce(label, oldValue, newValue) {
  const first = section.indexOf(oldValue);
  const last = section.lastIndexOf(oldValue);

  if (first < 0) {
    throw new Error(
      `${label}: bloco não localizado.`
    );
  }

  if (first !== last) {
    throw new Error(
      `${label}: mais de uma ocorrência localizada.`
    );
  }

  section =
    section.slice(0, first) +
    newValue +
    section.slice(first + oldValue.length);
}

/*
 * 1. Usa o prêmio realmente acertado para identificar:
 * grupo, dezena, centena e milhar.
 *
 * O resultado oficial permanece sendo o 1º prêmio.
 */
replaceOnce(
  "Cálculo dos valores acertados",
`                const hasExactHit =
                  hitType.includes("exact") ||
                  hitType.includes("milhar") ||
                  Boolean(
                    analysis?.exact ||
                    analysis?.exactHit ||
                    analysis?.milharHit ||
                    item?.exactHit
                  );

                const hasCentenaHit =
                  hasExactHit ||
                  hitType.includes("centena") ||
                  Boolean(
                    analysis?.centena ||
                    analysis?.centenaHit ||
                    item?.centenaHit
                  );

                const hasDezenaHit =
                  isHit ||
                  hasCentenaHit ||
                  hasExactHit ||
                  hitType.includes("grupo") ||
                  hitType.includes("dezena") ||
                  Boolean(
                    analysis?.group ||
                    analysis?.groupHit ||
                    analysis?.dezenaHit ||
                    item?.groupHit
                  );

                const hitDezena =
                  hasResult &&
                  hasDezenaHit
                    ? resultDezena
                    : "";

                const hitCentena =
                  hasResult &&
                  hasCentenaHit
                    ? resultCentena
                    : "";

                const hitMilhar =
                  hasResult &&
                  hasExactHit
                    ? resultMilhar
                    : "";`,
`                const matchedOfficialIndex =
                  resultPosition >= 1 &&
                  resultPosition <= 3
                    ? resultPosition - 1
                    : -1;

                const matchedResultGrupoRaw =
                  matchedOfficialIndex >= 0
                    ? Number(
                        item
                          ?.resultTop3Groups?.[
                            matchedOfficialIndex
                          ] ??
                          analysis?.matchedGrupo ??
                          NaN
                      )
                    : NaN;

                const matchedResultGrupo =
                  Number.isFinite(
                    matchedResultGrupoRaw
                  ) &&
                  matchedResultGrupoRaw >= 1 &&
                  matchedResultGrupoRaw <= 25
                    ? matchedResultGrupoRaw
                    : NaN;

                const matchedResultMilhar =
                  matchedOfficialIndex >= 0
                    ? normalizeMilharStr(
                        item
                          ?.resultTop3Milhares?.[
                            matchedOfficialIndex
                          ] ||
                          (
                            resultPosition === 1
                              ? resultMilhar
                              : ""
                          )
                      )
                    : "";

                const matchedResultCentena =
                  matchedResultMilhar
                    ? matchedResultMilhar.slice(-3)
                    : "";

                const matchedResultDezena =
                  matchedResultMilhar
                    ? matchedResultMilhar.slice(-2)
                    : "";

                const hasExactHit =
                  hitType === "hit_exact";

                const hasCentenaHit =
                  hitType === "hit_centena" ||
                  hasExactHit;

                const hasDezenaHit =
                  hitType === "hit_grupo" ||
                  hasCentenaHit ||
                  hasExactHit;

                const hitGrupo =
                  isHit &&
                  Number.isFinite(
                    matchedResultGrupo
                  )
                    ? formatGrupo(
                        matchedResultGrupo
                      )
                    : "";

                const hitDezena =
                  isHit &&
                  hasDezenaHit
                    ? matchedResultDezena
                    : "";

                const hitCentena =
                  isHit &&
                  hasCentenaHit
                    ? matchedResultCentena
                    : "";

                const hitMilhar =
                  isHit &&
                  hasExactHit
                    ? matchedResultMilhar
                    : "";`
);

/*
 * 2. Remove a medalha duplicada do título ACERTO.
 * A medalha permanece somente sobre o palpite vencedor.
 */
replaceOnce(
  "Título ACERTO",
  "                              {medal} ACERTO",
  "                              ACERTO"
);

/*
 * 3. Inclui o grupo realmente acertado.
 */
replaceOnce(
  "Grupo na coluna ACERTO",
`                              <span>Dezena</span>
                              <strong>
                                {hitDezena
                                  ? \`\${hitDezena} ✓\`
                                  : "—"}
                              </strong>

                              <span>Centena</span>`,
`                              <span>Grupo</span>
                              <strong>
                                {hitGrupo
                                  ? \`G\${hitGrupo} ✓\`
                                  : "—"}
                              </strong>

                              <span>Dezena</span>
                              <strong>
                                {hitDezena
                                  ? \`\${hitDezena} ✓\`
                                  : "—"}
                              </strong>

                              <span>Centena</span>`
);

/*
 * 4. Resultado Oficial neutro.
 */
replaceOnce(
  "Estilo do Resultado Oficial",
`                          border: isHit
                            ? \`4px solid \${prizeColor}\`
                            : "1px solid rgba(255,255,255,0.14)",
                          background: isHit
                            ? \`linear-gradient(180deg, \${prizeGlow}, rgba(0,0,0,0.22))\`
                            : "rgba(255,255,255,0.02)",
                          boxShadow: isHit
                            ? \`0 0 18px \${prizeGlow}\`
                            : "none",`,
`                          border:
                            "1px solid rgba(255,255,255,0.14)",
                          background:
                            "rgba(255,255,255,0.025)",
                          boxShadow:
                            "inset 0 0 0 1px rgba(255,255,255,0.025)",`
);

/*
 * 5. Foto oficial maior, sem borda de premiação.
 * O animal oficial é sempre o sorteado em 1º.
 */
replaceOnce(
  "Imagem do Resultado Oficial",
`                                size={48}
                                style={{
                                  borderRadius: 10,
                                  border: isHit
                                    ? \`4px solid \${prizeColor}\`
                                    : "1px solid rgba(201,168,62,0.36)",
                                  boxShadow: isHit
                                    ? \`0 0 16px \${prizeGlow}\`
                                    : "none",
                                }}`,
`                                size={56}
                                style={{
                                  borderRadius: 11,
                                  border:
                                    "1px solid rgba(201,168,62,0.42)",
                                  boxShadow:
                                    "0 7px 18px rgba(0,0,0,0.34)",
                                }}`
);

/*
 * 6. Remove medalha da foto oficial.
 */
replaceOnce(
  "Medalha do Resultado Oficial",
`
                              {isHit &&
                              medal ? (
                                <span
                                  aria-label="Resultado oficial premiado"
                                  style={{
                                    position:
                                      "absolute",
                                    top: -15,
                                    right: -18,
                                    zIndex: 3,
                                    fontSize: 27,
                                    lineHeight: 1,
                                    filter:
                                      "drop-shadow(0 2px 4px rgba(0,0,0,0.95))",
                                  }}
                                >
                                  {medal}
                                </span>
                              ) : null}`,
  ""
);

/*
 * 7. Remove as duas cores de prêmio do resultado oficial:
 * nome do animal e milhar oficial.
 */
const officialColorOld =
`                                  color: isHit
                                    ? prizeColor
                                    : "inherit",`;

const officialColorNew =
`                                  color: "inherit",`;

const colorOccurrences =
  section.split(officialColorOld).length - 1;

if (colorOccurrences !== 2) {
  throw new Error(
    `Cores do resultado oficial: esperadas 2 ocorrências; encontradas ${colorOccurrences}.`
  );
}

section = section
  .split(officialColorOld)
  .join(officialColorNew);

/*
 * 8. Ajusta o espaço da foto oficial de 56px.
 */
replaceOnce(
  "Colunas do Resultado Oficial",
`                          gridTemplateColumns:
                            "52px minmax(0, 1fr)",`,
`                          gridTemplateColumns:
                            "60px minmax(0, 1fr)",`
);

content =
  content.slice(0, startIndex) +
  section +
  content.slice(sectionEnd);

if (content === original) {
  throw new Error(
    "Nenhuma alteração foi produzida."
  );
}

fs.writeFileSync(
  target,
  content,
  "utf8"
);

console.log("PATCH_OK");
console.log("ARQUIVO=" + target);
