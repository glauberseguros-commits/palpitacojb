import React, { useMemo, useState } from "react";
import {
  calcularSobeDesceTransicoes,
  analisarCoincidencias
} from "./sobeDesceTransicoes.logic.mjs";
import "./SobeDesceTransicoes.css";

function FotoAnimal({ animal }) {
  const [falhou, setFalhou] = useState(false);

  if (!animal) return null;

  return falhou ? (
    <span className="sdt-photo-fallback">
      {animal.nome.slice(0, 1)}
    </span>
  ) : (
    <img
      src={animal.imagem}
      alt={animal.nome}
      className="sdt-photo"
      loading="lazy"
      onError={() => setFalhou(true)}
    />
  );
}

export default function SobeDesceTransicoes() {
  const [grupos, setGrupos] = useState(
    ["", "", "", "", ""]
  );

  const [resultados, setResultados] = useState(
    ["", "", "", "", "", "", ""]
  );

  const [mensagem, setMensagem] = useState("");
  const [verTodasRelacoes, setVerTodasRelacoes] = useState(false);

  const calculo = useMemo(
    () => calcularSobeDesceTransicoes(grupos),
    [grupos]
  );

  const coincidencias = useMemo(
    () => analisarCoincidencias(calculo, resultados),
    [calculo, resultados]
  );

  const resultadosInformados = resultados.filter(
    (numero, index) =>
      index === 6
        ? /^\d{3}$/.test(numero)
        : /^\d{4}$/.test(numero)
  ).length;

  const coincidenciasExibidas = verTodasRelacoes
    ? coincidencias
    : coincidencias.slice(0, 12);

  function alterarGrupo(index, valor) {
    const somenteDigitos = valor.replace(/\D/g, "").slice(0, 2);

    setGrupos((atuais) =>
      atuais.map((grupo, i) =>
        i === index ? somenteDigitos : grupo
      )
    );

    setMensagem("");
  }

  function alterarResultado(index, valor) {
    const limite = index === 6 ? 3 : 4;
    const numero = valor.replace(/\D/g, "").slice(0, limite);

    setResultados((atuais) =>
      atuais.map((atual, i) =>
        i === index ? numero : atual
      )
    );

    setMensagem("");
  }

  async function copiarNumeros(numeros) {
    const texto = numeros.join("\n");

    if (!texto) return;

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

        const ok = document.execCommand("copy");
        campo.remove();

        if (!ok) throw new Error("Cópia indisponível");
      }

      setMensagem(`${numeros.length} milhares copiadas.`);
    } catch {
      setMensagem("Não foi possível copiar os números.");
    }
  }

  return (
    <main className="sdt-page">
      <div className="sdt-shell">
        <section className="sdt-panel">
          <div className="sdt-section-heading">
            <h2>Grupos do Sobe & Desce</h2>
            <p>Entrada principal do cálculo.</p>
          </div>

          <div className="sdt-groups">
            {grupos.map((grupo, i) => (
              <label key={i}>
                <span>{i + 1}º grupo</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  value={grupo}
                  placeholder="00"
                  onChange={(e) =>
                    alterarGrupo(i, e.target.value)
                  }
                  aria-label={`${i + 1}º grupo`}
                />
              </label>
            ))}
          </div>

          <p className="sdt-hint">
            Informe cinco grupos de 01 a 25.
            Eles determinam o cálculo original.
          </p>
        </section>

        <section className="sdt-panel">
          <div className="sdt-section-heading">
            <h2>Milhares do sorteio anterior</h2>
            <p>
              Entrada complementar. Não modifica os cinco grupos.
            </p>
          </div>

          <div className="sdt-prizes">
            {resultados.map((numero, i) => (
              <label key={i}>
                <span>{i + 1}º prêmio</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={numero}
                  maxLength={i === 6 ? 3 : 4}
                  placeholder={i === 6 ? "000" : "0000"}
                  onChange={(e) =>
                    alterarResultado(i, e.target.value)
                  }
                  aria-label={
                    i === 6
                      ? "7º prêmio, centena"
                      : `${i + 1}º prêmio, milhar`
                  }
                />
                <small>
                  {i === 6 ? "Centena" : "Milhar"}
                </small>
              </label>
            ))}
          </div>
        </section>

        <section className="sdt-panel">
          <div className="sdt-section-heading">
            <h2>Milhares calculadas</h2>
            <p>
              Resultado original, sem influência das milhares
              informadas na análise complementar.
            </p>
          </div>

          {calculo ? (
            <>
              <div className="sdt-summary">
                <div>
                  <strong>5</strong>
                  <span>Milhares principais</span>
                </div>
                <div>
                  <strong>20</strong>
                  <span>Milhares-base</span>
                </div>
              </div>

              <div className="sdt-conjuntos">
                {calculo.conjuntos.map((conjunto) => (
                  <article
                    className="sdt-conjunto"
                    key={conjunto.posicao}
                  >
                    <div className="sdt-conjunto-head">
                      <FotoAnimal animal={conjunto.animal} />

                      <div>
                        <small>
                          {conjunto.posicao}º · Grupo informado{" "}
                          {conjunto.grupoInformado}
                        </small>
                        <strong>{conjunto.milhar}</strong>
                        <span>
                          {conjunto.animal.nome} · G
                          {String(
                            conjunto.animal.grupo
                          ).padStart(2, "0")}
                        </span>
                      </div>
                    </div>

                    <div className="sdt-bases">
                      {conjunto.bases.map((numero) => (
                        <span
                          key={numero}
                          className={
                            numero === conjunto.milhar
                              ? "sdt-original"
                              : ""
                          }
                        >
                          {numero}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="sdt-copy-small"
                      onClick={() =>
                        copiarNumeros(conjunto.bases)
                      }
                    >
                      Copiar 4
                    </button>
                  </article>
                ))}
              </div>

              <div className="sdt-copy-actions">
                <button
                  type="button"
                  onClick={() =>
                    copiarNumeros(calculo.milhares)
                  }
                >
                  Copiar 5 milhares
                </button>

                <button
                  type="button"
                  onClick={() =>
                    copiarNumeros(calculo.bases)
                  }
                >
                  Copiar 20 milhares-base
                </button>
              </div>
            </>
          ) : (
            <div className="sdt-empty">
              Informe os cinco grupos para gerar o Sobe & Desce.
            </div>
          )}
        </section>

        <section className="sdt-panel">
          <div className="sdt-section-heading">
            <h2>Análise complementar</h2>
            <p>
              Relações numéricas entre os resultados anteriores
              e as milhares-base calculadas.
            </p>
          </div>

          <div className="sdt-summary">
            <div>
              <strong>{resultadosInformados}</strong>
              <span>Resultados completos</span>
            </div>

            <div>
              <strong>{coincidencias.length}</strong>
              <span>Relações encontradas</span>
            </div>
          </div>

          {calculo && resultadosInformados > 0 ? (
            coincidencias.length > 0 ? (
              <>
                <div className="sdt-relacoes">
                  {coincidenciasExibidas.map((item, i) => (
                    <div
                      className="sdt-relacao"
                      key={
                        item.posicao + "-" +
                        item.candidata + "-" +
                        item.premio + "-" + i
                      }
                    >
                      <div>
                        <small>
                          Resultado anterior · {item.premio}º
                        </small>
                        <strong>{item.anterior}</strong>
                      </div>

                      <span className="sdt-relation-arrow">
                        ⇄
                      </span>

                      <div>
                        <small>Sobe & Desce</small>
                        <strong>{item.candidata}</strong>
                      </div>

                      <div className="sdt-relation-tags">
                        {item.relacoes.map((relacao) => (
                          <span key={relacao}>
                            {relacao}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {coincidencias.length > 12 && (
                  <button
                    className="sdt-expand"
                    type="button"
                    onClick={() =>
                      setVerTodasRelacoes((valor) => !valor)
                    }
                  >
                    {verTodasRelacoes
                      ? "Mostrar menos"
                      : `Ver todas (${coincidencias.length})`}
                  </button>
                )}
              </>
            ) : (
              <div className="sdt-empty">
                Nenhuma relação dos tipos analisados foi
                encontrada neste conjunto.
              </div>
            )
          ) : (
            <div className="sdt-empty">
              Informe os grupos e os resultados anteriores
              para realizar a comparação.
            </div>
          )}

          <p className="sdt-disclaimer">
            Estas relações são observações matemáticas.
            Não representam previsão de acerto.
            A validação por horário dependerá de testes históricos.
          </p>
        </section>

        <p className="sdt-status" role="status">
          {mensagem}
        </p>
      </div>
    </main>
  );
}
