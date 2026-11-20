import React, { useMemo, useState } from "react";

import {
  gerarPorGruposECentenas,
  ANIMAIS_TRANSICOES,
  dezenasDoGrupo
} from "./geradorGruposCentenas.logic.mjs";

import "./SobeDesceTransicoes.css";
import "./GeradorGruposCentenas.css";

export default function SobeDesceTransicoes() {
  const [resultados, setResultados] = useState(
    Array(7).fill("")
  );

  const [mensagem, setMensagem] = useState("");

  const dados = useMemo(
    () => gerarPorGruposECentenas(resultados),
    [resultados]
  );

  function alterarResultado(indice, valor) {
    const limite = indice === 6 ? 3 : 4;

    const numero = valor
      .replace(/\D/g, "")
      .slice(0, limite);

    setResultados((anteriores) =>
      anteriores.map(
        (atual, posicao) =>
          indice === posicao ? numero : atual
      )
    );

    setMensagem("");
  }

  async function copiar(numeros) {
    if (!numeros.length) return;

    const lista = [...new Set(numeros)].sort();
    const texto = lista.join("\n");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        const campo = document.createElement("textarea");

        campo.value = texto;
        campo.style.position = "fixed";
        campo.style.opacity = "0";

        document.body.appendChild(campo);
        campo.select();

        const sucesso = document.execCommand("copy");
        campo.remove();

        if (!sucesso) {
          throw new Error("Copia indisponivel");
        }
      }

      setMensagem(
        `${lista.length} milhares copiadas.`
      );
    } catch {
      setMensagem("Não foi possível copiar os números.");
    }
  }

  return (
    <main className="sdt-page">
      <div className="sdt-shell sgc-shell">
        <section className="sdt-panel">
          <div className="sdt-section-heading">
            <h2>Grupos + Centenas</h2>
            <p>
              Formação experimental de milhares para
              o próximo sorteio, a partir do resultado anterior.
            </p>
          </div>

          <div className="sgc-section-caption">
            Resultados do sorteio anterior
          </div>

          <div className="sgc-input-grid">
            {resultados.map((numero, indice) => (
              <label
                key={indice}
                className="sgc-field"
              >
                <span>
                  {indice + 1}º prêmio
                </span>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={indice === 6 ? 3 : 4}
                  placeholder={indice === 6 ? "000" : "0000"}
                  value={numero}
                  onChange={(event) =>
                    alterarResultado(
                      indice,
                      event.target.value
                    )
                  }
                />

                <small>
                  {indice === 6 ? "Centena" : "Milhar"}
                </small>
              </label>
            ))}
          </div>

          <p className="sgc-help">
            Informe os sete resultados de um mesmo sorteio.
            Os grupos e as centenas serão extraídos
            automaticamente.
          </p>
        </section>

        {!dados ? (
          <section className="sdt-panel sgc-empty">
            Preencha os sete resultados para gerar
            as milhares experimentais.
          </section>
        ) : (
          <>
            <section className="sdt-panel">
              <div className="sdt-section-heading">
                <h2>Grupos e centenas identificados</h2>
                <p>
                  Informações extraídas dos resultados
                  anteriores, sem novos campos.
                </p>
              </div>

              <div className="sgc-extracao">
                {dados.centenas.map((centena, indice) => {
                  const grupo = dados.gruposAnteriores[indice];
                  const animal = ANIMAIS_TRANSICOES[grupo - 1];

                  return (
                    <div
                      className="sgc-extracao-item"
                      key={indice}
                    >
                      <small>{indice + 1}º prêmio</small>
                      <strong>{centena}</strong>
                      <span>
                        G{String(grupo).padStart(2, "0")}
                        {" · "}
                        {animal.nome}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="sdt-panel">
              <div className="sdt-section-heading">
                <h2>Formação das milhares</h2>
                <p>
                  Grupos convergentes cruzados com cabeças
                  extraídas das centenas anteriores.
                </p>
              </div>

              <div className="sgc-metrics">
                <div>
                  <strong>{dados.gruposCandidatos.length}</strong>
                  <span>Grupos convergentes</span>
                </div>

                <div>
                  <strong>{dados.cabecas.length}</strong>
                  <span>Cabeças distintas</span>
                </div>

                <div>
                  <strong>{dados.candidatas.length}</strong>
                  <span>Milhares formadas</span>
                </div>
              </div>

              <div className="sgc-subhead">
                Cabeças extraídas das centenas
              </div>

              <div className="sgc-heads">
                {dados.cabecas.map((item) => (
                  <div
                    className="sgc-head"
                    key={item.cabeca}
                  >
                    <strong>{item.cabeca}</strong>
                    <small>
                      {item.origens.join(" / ")}
                    </small>
                  </div>
                ))}
              </div>

              <div className="sgc-subhead">
                Grupos selecionados pelas convergências
              </div>

              {dados.gruposCandidatos.length === 0 ? (
                <div className="sgc-no-groups">
                  Nenhum grupo recebeu duas indicações
                  independentes neste cálculo.
                  Nenhuma milhar será forçada.
                </div>
              ) : (
                <>
                  <div className="sgc-toolbar">
                    <span>
                      {dados.candidatas.length} milhares distintas
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        copiar(
                          dados.candidatas.map(
                            (item) => item.numero
                          )
                        )
                      }
                    >
                      Copiar todas
                    </button>
                  </div>

                  <div className="sgc-animals">
                    {dados.gruposCandidatos.map((itemGrupo) => {
                      const animal =
                        ANIMAIS_TRANSICOES[itemGrupo.grupo - 1];

                      const itens = dados.candidatas.filter(
                        (item) =>
                          item.grupo === itemGrupo.grupo
                      );

                      return (
                        <article
                          className="sgc-animal"
                          key={itemGrupo.grupo}
                        >
                          <div className="sgc-animal-header">
                            <img
                              src={animal.imagem}
                              alt={animal.nome}
                              loading="lazy"
                            />

                            <div>
                              <strong>
                                {animal.nome}
                                {" · "}
                                G{String(itemGrupo.grupo).padStart(2, "0")}
                              </strong>

                              <small>
                                {itemGrupo.origens.join(" / ")}
                              </small>
                            </div>
                          </div>

                          <div className="sgc-tens">
                            {dezenasDoGrupo(itemGrupo.grupo).map(
                              (dezena) => (
                                <div
                                  className="sgc-ten"
                                  key={dezena}
                                >
                                  <div className="sgc-ten-head">
                                    Dezena {dezena}
                                  </div>

                                  {itens
                                    .filter(
                                      (item) =>
                                        item.numero.slice(-2) === dezena
                                    )
                                    .map((item) => (
                                      <div
                                        className="sgc-number"
                                        key={item.numero}
                                      >
                                        <strong>
                                          {item.numero}
                                        </strong>

                                        <small>
                                          {item.origensCabeca.join(" / ")}
                                        </small>
                                      </div>
                                    ))}
                                </div>
                              )
                            )}
                          </div>

                          <button
                            className="sgc-copy-animal"
                            type="button"
                            onClick={() =>
                              copiar(
                                itens.map((item) => item.numero)
                              )
                            }
                          >
                            Copiar {itens.length} milhares
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}

              <p className="sgc-help">
                Regra experimental: deslocamento de −5 nos
                cinco primeiros grupos, +1 no 6º e 7º;
                seleção de grupos com pelo menos duas
                indicações; cabeça formada pelo primeiro
                e último algarismos de cada centena.
                Esta regra ainda não demonstrou vantagem
                de acerto em testes históricos.
              </p>
            </section>

            <details className="sdt-panel sgc-reference">
              <summary>
                Consultar cálculo Sobe & Desce tradicional
              </summary>

              <p>
                Referência independente, calculada pelos
                grupos do 1º ao 5º prêmio anterior.
              </p>

              <div className="sgc-originals">
                {dados.calculoOriginal?.conjuntos.map(
                  (conjunto) => (
                    <div key={conjunto.posicao}>
                      <strong>{conjunto.milhar}</strong>
                      <small>
                        {conjunto.bases.join(" · ")}
                      </small>
                    </div>
                  )
                )}
              </div>
            </details>
          </>
        )}

        <p className="sgc-status" role="status">
          {mensagem}
        </p>
      </div>
    </main>
  );
}
