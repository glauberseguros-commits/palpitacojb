import React, { useMemo, useState } from "react";

import {
  ANIMAIS_TRANSICOES,
  dezenasDoGrupo
} from "./sobeDesceTransicoes.logic.mjs";

import {
  analisarPermutacoesETransicoes
} from "./analiseAmpliada.logic.mjs";

import "./AnaliseAmpliada.css";

export default function AnaliseAmpliada({
  calculo,
  resultados
}) {
  const [minimo, setMinimo] = useState(2);
  const [grupo, setGrupo] = useState("todos");
  const [abertos, setAbertos] = useState({});
  const [conferir, setConferir] = useState("");
  const [aviso, setAviso] = useState("");

  const analise = useMemo(
    () => analisarPermutacoesETransicoes(
      calculo,
      resultados
    ),
    [calculo, resultados]
  );

  const qualificadas = analise.relacionadas.filter(
    (item) => item.vinculos.length >= minimo
  );

  const exibidas = qualificadas.filter(
    (item) =>
      grupo === "todos" ||
      item.grupo === Number(grupo)
  );

  const animaisExibidos = [
    ...new Set(exibidas.map((item) => item.grupo))
  ].sort((a, b) => a - b);

  const auditada = /^\d{4}$/.test(conferir);

  const noUniverso = auditada &&
    analise.universo.some(
      (item) => item.numero === conferir
    );

  const nasFiltradas = auditada &&
    exibidas.some(
      (item) => item.numero === conferir
    );

  async function copiar(lista) {
    if (!lista.length) return;

    const texto = [...new Set(lista)]
      .sort()
      .join("\n");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        const campo = document.createElement(
          "textarea"
        );

        campo.value = texto;
        campo.style.position = "fixed";
        campo.style.opacity = "0";

        document.body.appendChild(campo);
        campo.select();

        const ok = document.execCommand("copy");
        campo.remove();

        if (!ok) {
          throw new Error("Copia indisponivel");
        }
      }

      setAviso(
        `${lista.length} milhares copiadas.`
      );
    } catch {
      setAviso(
        "Não foi possível copiar. Verifique a permissão do navegador."
      );
    }
  }

  return (
    <section className="sdt-panel sdt-av">
      <div className="sdt-section-heading">
        <h2>Permutações e transições</h2>
        <p>
          Milhares geradas individualmente a partir das
          20 bases; coincidências identificadas por
          prêmio anterior.
        </p>
      </div>

      <div className="sdt-av-stats">
        <div>
          <strong>{analise.universo.length}</strong>
          <span>Milhares distintas</span>
        </div>

        <div>
          <strong>{analise.relacionadas.length}</strong>
          <span>Com alguma relação</span>
        </div>

        <div>
          <strong>{qualificadas.length}</strong>
          <span>Com o suporte selecionado</span>
        </div>
      </div>

      <div className="sdt-av-filtros">
        <label>
          <span>
            Quantidade de prêmios anteriores relacionados
          </span>

          <select
            value={minimo}
            onChange={(event) => {
              setMinimo(Number(event.target.value));
              setAbertos({});
            }}
          >
            <option value={2}>
              2 ou mais prêmios
            </option>
            <option value={1}>
              1 ou mais prêmios
            </option>
          </select>
        </label>

        <label>
          <span>Filtrar por bicho</span>

          <select
            value={grupo}
            onChange={(event) =>
              setGrupo(event.target.value)
            }
          >
            <option value="todos">
              Todos os bichos
            </option>

            {ANIMAIS_TRANSICOES.map((animal) => (
              <option
                key={animal.grupo}
                value={animal.grupo}
              >
                G{String(animal.grupo).padStart(2, "0")}
                {" · "}
                {animal.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sdt-av-barra">
        <span>
          {exibidas.length} milhares na seleção atual
        </span>

        <button
          type="button"
          disabled={!exibidas.length}
          onClick={() =>
            copiar(
              exibidas.map((item) => item.numero)
            )
          }
        >
          Copiar {exibidas.length} milhares
        </button>
      </div>

      {!calculo ? (
        <div className="sdt-empty">
          Informe os cinco grupos para gerar
          as permutações.
        </div>
      ) : analise.premiosInformados === 0 ? (
        <div className="sdt-empty">
          Informe os resultados anteriores para
          identificar as relações.
        </div>
      ) : !exibidas.length ? (
        <div className="sdt-empty">
          Nenhuma milhar atende aos filtros.
          Experimente selecionar 1 ou mais prêmios.
        </div>
      ) : (
        <div className="sdt-av-grid">
          {animaisExibidos.map((numeroGrupo) => {
            const animal =
              ANIMAIS_TRANSICOES[numeroGrupo - 1];

            const itens = exibidas.filter(
              (item) => item.grupo === numeroGrupo
            );

            const verTodos = Boolean(
              abertos[numeroGrupo]
            );

            const colunas = dezenasDoGrupo(
              numeroGrupo
            ).map((dezena) => ({
              dezena,
              numeros: itens.filter(
                (item) =>
                  item.numero.slice(-2) === dezena
              )
            }));

            const podeExpandir = colunas.some(
              (coluna) => coluna.numeros.length > 6
            );

            return (
              <article
                className="sdt-av-card"
                key={numeroGrupo}
              >
                <header className="sdt-av-card-top">
                  <img
                    src={animal.imagem}
                    alt={animal.nome}
                    loading="lazy"
                  />

                  <div>
                    <strong>{animal.nome}</strong>
                    <small>
                      Grupo{" "}
                      {String(numeroGrupo).padStart(2, "0")}
                    </small>
                  </div>

                  <b>{itens.length} milhares</b>
                </header>

                <div className="sdt-av-dezenas">
                  {colunas.map(
                    ({ dezena, numeros }) => (
                      <div
                        className="sdt-av-coluna"
                        key={dezena}
                      >
                        <div className="sdt-av-coluna-top">
                          <strong>{dezena}</strong>
                          <small>{numeros.length}</small>
                        </div>

                        {numeros.length === 0 ? (
                          <span className="sdt-av-vazia">
                            —
                          </span>
                        ) : (
                          (
                            verTodos
                              ? numeros
                              : numeros.slice(0, 6)
                          ).map((item) => (
                            <div
                              className="sdt-av-numero"
                              key={item.numero}
                              title={item.vinculos.map(
                                (v) =>
                                  `${v.premio}º: ${v.metodo}`
                              ).join(" | ")}
                            >
                              <strong>
                                {item.numero}
                              </strong>

                              <small>
                                {item.vinculos.map(
                                  (v) => `${v.premio}º`
                                ).join(" · ")}
                              </small>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  )}
                </div>

                <footer className="sdt-av-card-actions">
                  {podeExpandir && (
                    <button
                      type="button"
                      onClick={() =>
                        setAbertos((atual) => ({
                          ...atual,
                          [numeroGrupo]:
                            !atual[numeroGrupo]
                        }))
                      }
                    >
                      {verTodos
                        ? "Mostrar menos"
                        : `Ver todas (${itens.length})`}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      copiar(
                        itens.map(
                          (item) => item.numero
                        )
                      )
                    }
                  >
                    Copiar {itens.length}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <div className="sdt-av-auditoria">
        <h3>Conferir o 1º prêmio</h3>

        <p>
          Após o sorteio, digite a milhar para verificar
          a cobertura. Esse resultado não influencia
          a geração ou a seleção.
        </p>

        <label>
          <span>Milhar sorteada</span>

          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            value={conferir}
            onChange={(event) =>
              setConferir(
                event.target.value
                  .replace(/\D/g, "")
                  .slice(0, 4)
              )
            }
          />
        </label>

        {auditada && (
          <div className="sdt-av-audit-result">
            <strong>
              {noUniverso
                ? `${conferir} pertence às permutações geradas.`
                : `${conferir} está fora das permutações geradas.`}
            </strong>

            <span>
              {noUniverso
                ? (
                    nasFiltradas
                      ? "Também está na seleção filtrada atual."
                      : "Não está na seleção filtrada atual."
                  )
                : "Este conjunto de 20 milhares-base não poderia cobrir esse resultado."}
            </span>
          </div>
        )}
      </div>

      <p className="sdt-av-nota">
        Coincidência numérica não demonstra aumento
        de probabilidade. A eficácia da seleção exige
        validação histórica fora da amostra.
      </p>

      <p
        className="sdt-av-aviso"
        role="status"
      >
        {aviso}
      </p>
    </section>
  );
}
