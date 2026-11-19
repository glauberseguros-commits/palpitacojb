import React, { useMemo, useState } from "react";
import "./SobeDesce.css";

const INITIAL = ["", "", "", "", ""];

export function calcularSobeDesce(grupos) {
  if (
    !Array.isArray(grupos) ||
    grupos.length !== 5 ||
    !grupos.every((g) => /^(0[1-9]|1[0-9]|2[0-5])$/.test(g))
  ) {
    return [];
  }

  const centenas = grupos.map((grupo, i) => {
    const anterior = grupos[(i + 4) % 5];
    return grupo + anterior.slice(-1);
  });

  return centenas.map((centena, i) => {
    const anterior = centenas[(i + 4) % 5];
    return centena + anterior.slice(-1);
  });
}

export default function SobeDesce() {
  const [grupos, setGrupos] = useState(INITIAL);
  const [mensagem, setMensagem] = useState("");

  const milhares = useMemo(
    () => calcularSobeDesce(grupos),
    [grupos]
  );

  const completos = grupos.every((g) => g.length === 2);
  const invalido = completos && milhares.length !== 5;

  function alterar(index, valor) {
    const limpo = String(valor).replace(/\D/g, "").slice(0, 2);
    setGrupos((anteriores) =>
      anteriores.map((g, i) => i === index ? limpo : g)
    );
    setMensagem("");
  }

  async function copiar() {
    if (milhares.length !== 5) return;

    const texto = milhares.join("\n");

    try {
      await navigator.clipboard.writeText(texto);
      setMensagem("Milhares copiadas!");
    } catch {
      const campo = document.createElement("textarea");
      campo.value = texto;
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      const copiado = document.execCommand("copy");
      document.body.removeChild(campo);
      setMensagem(copiado ? "Milhares copiadas!" : "Não foi possível copiar.");
    }
  }

  return (
    <main className="sd-page">
      <section className="sd-panel">
        <header className="sd-header">
          <div className="sd-brand">PALPITACO JB</div>
          <h1>Sobe &amp; Desce</h1>
        </header>

        <div className="sd-table">
          <div className="sd-column-title">GRUPOS</div>
          <div className="sd-column-title">MILHARES</div>

          {grupos.map((grupo, index) => (
            <React.Fragment key={index}>
              <label className="sd-group-field">
                <span>{index + 1}º</span>
                <input
                  aria-label={"Grupo " + (index + 1)}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  placeholder="00"
                  value={grupo}
                  onChange={(e) => alterar(index, e.target.value)}
                />
              </label>

              <div
                className="sd-result"
                aria-label={"Milhar " + (index + 1)}
              >
                {milhares[index] || "—"}
              </div>
            </React.Fragment>
          ))}
        </div>

        {invalido && (
          <p className="sd-error" role="alert">
            Informe grupos válidos de 01 a 25.
          </p>
        )}

        <div className="sd-actions">
          <button
            type="button"
            className="sd-copy"
            onClick={copiar}
            disabled={milhares.length !== 5}
          >
            Copiar milhares
          </button>

          <button
            type="button"
            className="sd-clear"
            onClick={() => {
              setGrupos(INITIAL);
              setMensagem("");
            }}
          >
            Limpar
          </button>
        </div>

        <div className="sd-message" role="status">
          {mensagem}
        </div>
      </section>
    </main>
  );
}
