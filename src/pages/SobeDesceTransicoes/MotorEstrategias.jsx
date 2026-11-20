import React, { useMemo, useState } from "react";

import {
  calcularMotorEstrategias,
  ANIMAIS_TRANSICOES
} from "./motorEstrategias.logic.mjs";

import "./SobeDesceTransicoes.css";
import "./MotorEstrategias.css";

function CartaoAnimal({
  grupo,
  numeros,
  descricao,
  copiar
}) {
  const [expandido, setExpandido] = useState(false);

  const animal = ANIMAIS_TRANSICOES[grupo - 1];

  const exibidos = expandido
    ? numeros
    : numeros.slice(0, 12);

  return (
    <article className="me-animal">
      <header className="me-animal-top">
        <img
          src={animal.imagem}
          alt={animal.nome}
          loading="lazy"
        />

        <div>
          <strong>
            {animal.nome} · G
            {String(grupo).padStart(2, "0")}
          </strong>

          <small>{descricao}</small>
        </div>

        <span>{numeros.length}</span>
      </header>

      <div className="me-numeros">
        {exibidos.map((item) => (
          <div
            className="me-numero"
            key={item.numero}
            title={item.origens.join(" | ")}
          >
            <strong>{item.numero}</strong>
            <small>
              {item.origens.length > 1
                ? `${item.origens.length} origens`
                : "1 origem"}
            </small>
          </div>
        ))}
      </div>

      <footer className="me-acoes">
        {numeros.length > 12 && (
          <button
            type="button"
            onClick={() =>
              setExpandido((atual) => !atual)
            }
          >
            {expandido
              ? "Mostrar menos"
              : `Ver todas (${numeros.length})`}
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            copiar(numeros.map((item) => item.numero))
          }
        >
          Copiar {numeros.length}
        </button>
      </footer>
    </article>
  );
}

function ListaPorBicho({
  numeros,
  copiar
}) {
  const grupos = [
    ...new Set(numeros.map((item) => item.grupo))
  ].sort((a, b) => a - b);

  if (!numeros.length) {
    return (
      <div className="me-vazio">
        Nenhum número gerado por este método.
      </div>
    );
  }

  return (
    <div className="me-grade-animais">
      {grupos.map((grupo) => {
        const itens = numeros.filter(
          (item) => item.grupo === grupo
        );

        return (
          <CartaoAnimal
            key={grupo}
            grupo={grupo}
            numeros={itens}
            descricao="Milhares organizadas sem repetição"
            copiar={copiar}
          />
        );
      })}
    </div>
  );
}

export default function MotorEstrategias() {
  const [resultados, setResultados] = useState(
    ["", "", "", "", "", "", ""]
  );

  const [aviso, setAviso] = useState("");

  const dados = useMemo(
    () => calcularMotorEstrategias(resultados),
    [resultados]
  );

  function alterar(indice, valor) {
    const maximo = indice === 6 ? 3 : 4;
    const limpo = valor
      .replace(/\D/g, "")
      .slice(0, maximo);

    setResultados((anteriores) =>
      anteriores.map(
        (item, posicao) =>
          indice === posicao ? limpo : item
      )
    );

    setAviso("");
  }

  async function copiar(numeros) {
    const lista = [...new Set(numeros)].sort();

    if (!lista.length) return;

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

      setAviso(`${lista.length} milhares copiadas.`);
    } catch {
      setAviso("Não foi possível copiar as milhares.");
    }
  }

  return (
    <main className="sdt-page">
      <div className="sdt-shell me-shell">
        <section className="sdt-panel">
          <div className="sdt-section-heading">
            <h2>Motor de análise de transições</h2>
            <p>
              Métodos independentes para analisar grupos,
              centenas e milhares do sorteio anterior.
            </p>
          </div>

          <div className="me-entradas">
            {resultados.map((numero, indice) => (
              <label key={indice}>
                <span>{indice + 1}º prêmio</span>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={indice === 6 ? 3 : 4}
                  placeholder={indice === 6 ? "000" : "0000"}
                  value={numero}
                  onChange={(event) =>
                    alterar(indice, event.target.value)
                  }
                />

                <small>
                  {indice === 6 ? "Centena" : "Milhar"}
                </small>
              </label>
            ))}
          </div>

          <p className="me-nota">
            Os sete resultados devem pertencer ao mesmo
            sorteio. O sistema extrai grupos e centenas
            automaticamente.
          </p>
        </section>

        {!dados ? (
          <section className="sdt-panel me-vazio">
            Informe os sete resultados para executar
            os métodos de cálculo.
          </section>
        ) : (
          <>
            <section className="sdt-panel">
              <div className="sdt-section-heading">
                <h2>Resumo dos métodos</h2>
              </div>

              <div className="me-metricas">
                <div>
                  <strong>
                    {dados.basesTradicionais.length}
                  </strong>
                  <span>A · Milhares-base</span>
                </div>

                <div>
                  <strong>
                    {dados.cruzamentos.length}
                  </strong>
                  <span>C · Cabeças cruzadas</span>
                </div>

                <div>
                  <strong>
                    {dados.alternativas.length}
                  </strong>
                  <span>B · Transições</span>
                </div>

                <div>
                  <strong>
                    {dados.consolidadas.length}
                  </strong>
                  <span>D · Total sem repetição</span>
                </div>
              </div>

              <p className="me-nota">
                Os totais representam cobertura matemática,
                não uma classificação de probabilidade.
              </p>
            </section>

            <section className="sdt-panel">
              <div className="sdt-section-heading">
                <h2>Método A — Sobe & Desce tradicional</h2>
                <p>
                  Cinco milhares principais e suas
                  20 milhares-base, independentemente
                  das transições experimentais.
                </p>
              </div>

              <div className="me-principais">
                {dados.tradicional.conjuntos.map(
                  (conjunto) => (
                    <article key={conjunto.posicao}>
                      <small>
                        {conjunto.posicao}º grupo
                      </small>

                      <strong>{conjunto.milhar}</strong>

                      <span>
                        {conjunto.animal.nome}
                      </span>

                      <div className="me-bases">
                        {conjunto.bases.map(
                          (numero) => (
                            <b key={numero}>
                              {numero}
                            </b>
                          )
                        )}
                      </div>
                    </article>
                  )
                )}
              </div>

              <button
                className="me-copiar"
                type="button"
                onClick={() =>
                  copiar(
                    dados.basesTradicionais.map(
                      (item) => item.numero
                    )
                  )
                }
              >
                Copiar 20 milhares-base
              </button>
            </section>

            <section className="sdt-panel">
              <div className="sdt-section-heading">
                <h2>Método C — Formação de cabeças</h2>
                <p>
                  Cabeças formadas por duas transformações
                  explícitas dos resultados anteriores,
                  cruzadas com os grupos do método A.
                </p>
              </div>

              <div className="me-cabecas">
                {dados.cabecas.map((item) => (
                  <div
                    key={item.cabeca}
                    title={item.origens.join(" | ")}
                  >
                    <strong>{item.cabeca}</strong>
                    <small>
                      {item.origens.join(" / ")}
                    </small>
                  </div>
                ))}
              </div>

              <div className="me-barra">
                <span>
                  {dados.cruzamentos.length} milhares
                  distintas nesta hipótese
                </span>

                <button
                  type="button"
                  onClick={() =>
                    copiar(
                      dados.cruzamentos.map(
                        (item) => item.numero
                      )
                    )
                  }
                >
                  Copiar todas
                </button>
              </div>

              <ListaPorBicho
                numeros={dados.cruzamentos}
                copiar={copiar}
              />
            </section>

            <section className="sdt-panel">
              <div className="sdt-section-heading">
                <h2>Método B — Transições de grupos</h2>
                <p>
                  {dados.existeConvergencia
                    ? "Foram encontradas convergências. As respectivas milhares foram formadas pelas centenas anteriores."
                    : "Sem convergência múltipla. O método continua com as sete transições simples, sem atribuir maior confiança a elas."}
                </p>
              </div>

              <div className="me-barra">
                <span>
                  {dados.alternativas.length} milhares
                  alternativas
                </span>

                <button
                  type="button"
                  onClick={() =>
                    copiar(
                      dados.alternativas.map(
                        (item) => item.numero
                      )
                    )
                  }
                >
                  Copiar alternativas
                </button>
              </div>

              <ListaPorBicho
                numeros={dados.alternativas}
                copiar={copiar}
              />
            </section>

            <section className="sdt-panel">
              <div className="sdt-section-heading">
                <h2>Método D — Consolidação</h2>
                <p>
                  Reúne as candidatas sem duplicidade
                  e identifica números formados por
                  mais de um método.
                </p>
              </div>

              <div className="me-metricas me-metricas-dois">
                <div>
                  <strong>
                    {dados.consolidadas.length}
                  </strong>
                  <span>Milhares distintas</span>
                </div>

                <div>
                  <strong>
                    {dados.multimeto.length}
                  </strong>
                  <span>Presentes em 2+ métodos</span>
                </div>
              </div>

              <div className="me-barra">
                <span>Consolidação dos métodos A, B e C</span>

                <button
                  type="button"
                  onClick={() =>
                    copiar(
                      dados.consolidadas.map(
                        (item) => item.numero
                      )
                    )
                  }
                >
                  Copiar lista consolidada
                </button>
              </div>

              <details className="me-detalhes">
                <summary>
                  Ver milhares presentes em mais
                  de um método
                </summary>

                <div className="me-coincidentes">
                  {dados.multimeto.length ? (
                    dados.multimeto.map((item) => (
                      <div key={item.numero}>
                        <strong>{item.numero}</strong>
                        <small>
                          {item.metodos.join(" + ")}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p>Nenhuma sobreposição encontrada.</p>
                  )}
                </div>
              </details>

              <p className="me-nota">
                Uma candidata aparecer em vários métodos
                não demonstra maior probabilidade.
                As estratégias precisam ser comparadas
                em testes históricos cronológicos,
                especialmente no 1º prêmio.
              </p>
            </section>
          </>
        )}

        <p className="me-aviso" role="status">
          {aviso}
        </p>
      </div>
    </main>
  );
}
