import React, { useMemo, useState } from "react";
import {
  calcularCruzDoDia
} from "./cruzDoDia.logic.mjs";
import { fecharCruzDoDia } from "./fechamentoCruz.logic.mjs";
import "./CruzDoDia.css";

function dataLocalAtual() {
  const hoje = new Date();

  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function FotoBicho({ animal }) {
  const [falha, setFalha] = useState(false);

  if (falha) {
    return (
      <div className="sd-foto sd-foto-fallback">
        {animal.emoji}
      </div>
    );
  }

  return (
    <img
      className="sd-foto"
      src={animal.imagem}
      alt={animal.nome}
      loading="lazy"
      onError={() => setFalha(true)}
    />
  );
}

export default function CruzDoDia() {
  const [data, setData] = useState(dataLocalAtual);
  const [mensagem, setMensagem] = useState("");

  const calculo = useMemo(
    () => calcularCruzDoDia(data),
    [data]
  );

  const {
    sequencia,
    digitos,
    milhares,
    bichos
  } = calculo;

  const fechamento = useMemo(
    () => fecharCruzDoDia(bichos),
    [bichos]
  );

  async function copiar(numeros) {
    if (!numeros.length) return;

    const texto = numeros.join("\n");

    try {
      await navigator.clipboard.writeText(texto);
      setMensagem(`${numeros.length} milhares copiadas.`);
    } catch {
      try {
        const campo = document.createElement("textarea");
        campo.value = texto;
        campo.style.position = "fixed";
        campo.style.opacity = "0";
        document.body.appendChild(campo);
        campo.select();

        const sucesso = document.execCommand("copy");
        campo.remove();

        setMensagem(
          sucesso
            ? `${numeros.length} milhares copiadas.`
            : "Não foi possível copiar."
        );
      } catch {
        setMensagem("Não foi possível copiar.");
      }
    }
  }

  return (
    <main className="sd-page sdp-page cdd-page">

      <section className="sdp-panel cdd-intro">
        <div className="cdd-cross-section">
          <label className="cdd-date-field cdd-date-centered">
            <span className="cdd-visually-hidden">
              Selecione a data
            </span>

            <input
              type="date"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                setMensagem("");
              }}
              aria-label="Selecionar data da Cruz do Dia"
            />
          </label>

          {sequencia.length === 4 ? (
            <div className="cdd-cross">
              {digitos.map((digito, i) => (
                <div className="cdd-cross-cell" key={i}>
                  {digito}
                </div>
              ))}
            </div>
          ) : (
            <p className="cdd-empty">
              Selecione uma data válida.
            </p>
          )}
        </div>
      </section>

      <section className="sdp-panel">
        <div className="sdp-section-header">
          <div>
            <span className="sdp-eyebrow">CRUZ DO DIA</span>
</div>
        </div>

        <div className="sdp-stats cdd-stats">
          <div className="sdp-stat">
            <strong>{fechamento.originais.length}</strong>
            <span>Milhares da Cruz</span>
          </div>

          <div className="sdp-stat">
            <strong>{fechamento.complementares.length}</strong>
            <span>Complementares</span>
          </div>

          <div className="sdp-stat">
            <strong>{fechamento.numeros.length}</strong>
            <span>Total do fechamento</span>
          </div>

          <div className="sdp-stat">
            <strong>{fechamento.bichos.length}</strong>
            <span>Bichos identificados</span>
          </div>
        </div>

        <div className="sdp-toolbar cdd-toolbar cdd-summary-actions">
          <button
            className="sdp-card-copy"
            type="button"
            disabled={!fechamento.originais.length}
            onClick={() => copiar(fechamento.originais)}
          >
            Copiar Cruz original ({fechamento.originais.length})
          </button>

          <button
            className="sdp-card-copy"
            type="button"
            disabled={!fechamento.complementares.length}
            onClick={() => copiar(fechamento.complementares)}
          >
            Copiar complemento ({fechamento.complementares.length})
          </button>

          <button
            className="sdp-button-gold"
            type="button"
            disabled={!fechamento.numeros.length}
            onClick={() => copiar(fechamento.numeros)}
          >
            Copiar fechamento completo ({fechamento.numeros.length})
          </button>
        </div>

        {milhares.length > 0 && (
          <div className="cdd-legend">
            <span className="cdd-legend-original">Milhar original da Cruz</span>
            <span className="cdd-legend-extra">Milhar complementar</span>
          </div>
        )}

        {milhares.length > 0 ? (
          <div className="sdp-animals-grid">
            {fechamento.bichos.map((animal) => (
              <article
                className="sdp-animal-card"
                key={animal.grupo}
              >
                <header className="sdp-animal-header">
                  <FotoBicho animal={animal} />

                  <div className="sdp-animal-info">
                    <strong>{animal.nome}</strong>
                    <span>
                      Grupo {String(animal.grupo).padStart(2, "0")}
                    </span>
                  </div>

                  <span className="sdp-animal-count">
                    {animal.originais.length} Cruz + {animal.complementares.length} complementares
                  </span>
                </header>

                <div className="sdp-dezenas-grade">
                  {animal.colunas.map((coluna) => (
                    <div
                      className="sdp-dezena-coluna"
                      key={coluna.dezena}
                    >
                      <div className="sdp-dezena-cabecalho">
                        <strong>{coluna.dezena}</strong>
                        <small>{coluna.numeros.length}</small>
                      </div>

                      <div className="sdp-dezena-lista">
                        {coluna.numeros.length ? (
                          coluna.numeros.map((numero) => (
                            <span
                              className={
                                animal.originais.includes(numero)
                                  ? "sdp-number cdd-number-original"
                                  : "sdp-number cdd-number-complement"
                              }
                              key={numero}
                            >
                              {numero}
                            </span>
                          ))
                        ) : (
                          <span className="sdp-dezena-vazia">
                            —
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sdp-card-actions cdd-card-actions">
                  <button
                    type="button"
                    className="sdp-card-copy"
                    onClick={() => copiar(animal.originais)}
                  >
                    Cruz {animal.originais.length}
                  </button>

                  <button
                    type="button"
                    className="sdp-card-copy"
                    disabled={!animal.complementares.length}
                    onClick={() => copiar(animal.complementares)}
                  >
                    Complemento {animal.complementares.length}
                  </button>

                  <button
                    type="button"
                    className="sdp-card-copy cdd-copy-completo"
                    onClick={() => copiar(animal.numeros)}
                  >
                    Fechamento {animal.numeros.length}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="sdp-placeholder">
            Selecione uma data para calcular as milhares.
          </div>
        )}

        <div className="sd-message" role="status">
          {mensagem}
        </div>
      </section>
    </main>
  );
}
