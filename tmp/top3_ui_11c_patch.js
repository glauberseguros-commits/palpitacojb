"use strict";

const fs = require("fs");

const target = "./src/pages/Top3/Top3View.jsx";

let content = fs.readFileSync(target, "utf8");
const original = content;
const eol = content.includes("\r\n") ? "\r\n" : "\n";

function normalizeBlock(value) {
  return value.replace(/\n/g, eol);
}

function replaceOnce(label, oldValue, newValue) {
  const oldBlock = normalizeBlock(oldValue);
  const newBlock = normalizeBlock(newValue);

  const first = content.indexOf(oldBlock);
  const last = content.lastIndexOf(oldBlock);

  if (first < 0) {
    throw new Error(`${label}: bloco não localizado.`);
  }

  if (first !== last) {
    throw new Error(`${label}: mais de uma ocorrência localizada.`);
  }

  content =
    content.slice(0, first) +
    newBlock +
    content.slice(first + oldBlock.length);
}

function replaceExactCount(label, oldValue, newValue, expected) {
  const oldBlock = normalizeBlock(oldValue);
  const newBlock = normalizeBlock(newValue);

  const parts = content.split(oldBlock);
  const count = parts.length - 1;

  if (count !== expected) {
    throw new Error(
      `${label}: esperadas ${expected} ocorrências; encontradas ${count}.`
    );
  }

  content = parts.join(newBlock);
}

/*
 * 1. A coluna ACERTO deixa de usar medalha.
 */
replaceOnce(
  "Título ACERTO",
  `                              {medal} ACERTO`,
  `                              ACERTO`
);

/*
 * 2. Inclui o grupo na discriminação do acerto.
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
                                {isHit
                                  ? \`G\${formatGrupo(
                                      resultGrupo
                                    )} ✓\`
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
 * 3. Remove borda e glow de premiação do Resultado Oficial.
 */
replaceOnce(
  "Cartão oficial neutro",
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
                            "rgba(255,255,255,0.02)",
                          boxShadow: "none",`
);

/*
 * 4. Foto oficial neutra e maior somente quando o acerto foi no 1º prêmio.
 */
replaceOnce(
  "Foto oficial",
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
  `                                size={
                                  isHit &&
                                  resultPosition === 1
                                    ? 58
                                    : 48
                                }
                                style={{
                                  borderRadius: 10,
                                  border:
                                    "1px solid rgba(201,168,62,0.36)",
                                  boxShadow: "none",
                                }}`
);

/*
 * 5. Remove a medalha colocada sobre o Resultado Oficial.
 */
replaceOnce(
  "Medalha oficial",
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
  ``
);

/*
 * 6. Remove as duas cores condicionais do Resultado Oficial:
 *    nome do animal e milhar oficial.
 */
replaceExactCount(
  "Cores oficiais",
  `                                  color: isHit
                                    ? prizeColor
                                    : "inherit",`,
  `                                  color: "inherit",`,
  2
);

if (content === original) {
  throw new Error("Nenhuma alteração foi produzida.");
}

fs.writeFileSync(target, content, "utf8");

console.log("PATCH_OK");
console.log("ARQUIVO=" + target);
