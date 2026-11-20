import React, { useMemo, useState } from "react";
import {
  calcularSobeDesceTransicoes,
  analisarCoincidencias
} from "./sobeDesceTransicoes.logic.mjs";
import AnaliseAmpliada from "./AnaliseAmpliada";
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

  const resultadosAgrupados = useMemo(() => {
    const porPremio = new Map();

    for (const item of coincidencias) {
      const chave = `${item.premio}:${item.anterior}`;

      if (!porPremio.has(chave)) {
        porPremio.set(chave, {
          premio: item.premio,
          anterior: item.anterior,
          candidatas: []
        });
      }

      const grupo = porPremio.get(chave);

      const existente = grupo.candidatas.find(
        (candidata) => candidata.candidata === item.candidata
      );

      if (existente) {
        existente.relacoes = [
          ...new Set([...existente.relacoes, ...item.relacoes])
        ];
      } else {
        grupo.candidatas.push({
          candidata: item.candidata,
          relacoes: [...new Set(item.relacoes)]
        });
      }
    }

    return [...porPremio.values()]
      .map((grupo) => ({
        ...grupo,
        candidatas: grupo.candidatas.sort((a, b) =>
          a.candidata.localeCompare(b.candidata)
        )
      }))
      .sort((a, b) => a.premio - b.premio);
  }, [coincidencias]);

  const candidatasDistintas = new Set(
    coincidencias.map((item) => item.candidata)
  ).size;

  const coincidenciasExibidas = verTodasRelacoes
    ? resultadosAgrupados
    : resultadosAgrupados.slice(0, 12);

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
              <span>Resultados informados</span>
            </div>

            <div>
              <strong>{resultadosAgrupados.length}</strong>
              <span>Prêmios com relações</span>
            </div>

            <div>
              <strong>{candidatasDistintas}</strong>
              <span>Milhares candidatas distintas</span>
            </div>

            <div>
              <strong>{coincidencias.length}</strong>
              <span>Relações individuais</span>
            </div>
          </div>

          {calculo && resultadosInformados > 0 ? (
            coincidencias.length > 0 ? (
              <>
                <div className="sdt-relacoes">
                  {coincidenciasExibidas.map((grupo) => (
                    <article
                      className="sdt-relacao sdt-relacao-agrupada"
                      key={`${grupo.premio}-${grupo.anterior}`}
                    >
                      <div className="sdt-transicao-top">
                        <div>
                          <small>
                            Resultado anterior · {grupo.premio}º prêmio
                          </small>
                          <strong>{grupo.anterior}</strong>
                        </div>

                        <span>
                          {grupo.candidatas.length}{" "}
                          {grupo.candidatas.length === 1
                            ? "milhar relacionada"
                            : "milhares relacionadas"}
                        </span>
                      </div>

                      <div className="sdt-transicao-grid">
                        {grupo.candidatas.map((item) => (
                          <div
                            className="sdt-transicao-candidata"
                            key={item.candidata}
                          >
                            <strong>{item.candidata}</strong>

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
                    </article>
                  ))}
                </div>
                {resultadosAgrupados.length > 12 && (
                  <button
                    className="sdt-expand"
                    type="button"
                    onClick={() =>
                      setVerTodasRelacoes((valor) => !valor)
                    }
                  >
                    {verTodasRelacoes
                      ? "Mostrar menos"
                      : `Ver todas (${resultadosAgrupados.length})`}
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

        <AnaliseAmpliada
          calculo={calculo}
          resultados={resultados}
        />

        <p className="sdt-status" role="status">
          {mensagem}
        </p>
      </div>
    </main>
  );
}
