import React, { useMemo, useState } from "react";
import "./SobeDescePermutacoes.css";

const CATALOGO = [
  {
    "grupo": 1,
    "nome": "Avestruz",
    "emoji": "🪶",
    "imagem": "/assets/animals/animais_128_png/01_avestruz.png"
  },
  {
    "grupo": 2,
    "nome": "Águia",
    "emoji": "🦅",
    "imagem": "/assets/animals/animais_128_png/02_aguia.png"
  },
  {
    "grupo": 3,
    "nome": "Burro",
    "emoji": "🐴",
    "imagem": "/assets/animals/animais_128_png/03_burro.png"
  },
  {
    "grupo": 4,
    "nome": "Borboleta",
    "emoji": "🦋",
    "imagem": "/assets/animals/animais_128_png/04_borboleta.png"
  },
  {
    "grupo": 5,
    "nome": "Cachorro",
    "emoji": "🐕",
    "imagem": "/assets/animals/animais_128_png/05_cachorro.png"
  },
  {
    "grupo": 6,
    "nome": "Cabra",
    "emoji": "🐐",
    "imagem": "/assets/animals/animais_128_png/06_cabra.png"
  },
  {
    "grupo": 7,
    "nome": "Carneiro",
    "emoji": "🐏",
    "imagem": "/assets/animals/animais_128_png/07_carneiro.png"
  },
  {
    "grupo": 8,
    "nome": "Camelo",
    "emoji": "🐪",
    "imagem": "/assets/animals/animais_128_png/08_camelo.png"
  },
  {
    "grupo": 9,
    "nome": "Cobra",
    "emoji": "🐍",
    "imagem": "/assets/animals/animais_128_png/09_cobra.png"
  },
  {
    "grupo": 10,
    "nome": "Coelho",
    "emoji": "🐇",
    "imagem": "/assets/animals/animais_128_png/10_coelho.png"
  },
  {
    "grupo": 11,
    "nome": "Cavalo",
    "emoji": "🐎",
    "imagem": "/assets/animals/animais_128_png/11_cavalo.png"
  },
  {
    "grupo": 12,
    "nome": "Elefante",
    "emoji": "🐘",
    "imagem": "/assets/animals/animais_128_png/12_elefante.png"
  },
  {
    "grupo": 13,
    "nome": "Galo",
    "emoji": "🐓",
    "imagem": "/assets/animals/animais_128_png/13_galo.png"
  },
  {
    "grupo": 14,
    "nome": "Gato",
    "emoji": "🐈",
    "imagem": "/assets/animals/animais_128_png/14_gato.png"
  },
  {
    "grupo": 15,
    "nome": "Jacaré",
    "emoji": "🐊",
    "imagem": "/assets/animals/animais_128_png/15_jacare.png"
  },
  {
    "grupo": 16,
    "nome": "Leão",
    "emoji": "🦁",
    "imagem": "/assets/animals/animais_128_png/16_leao.png"
  },
  {
    "grupo": 17,
    "nome": "Macaco",
    "emoji": "🐒",
    "imagem": "/assets/animals/animais_128_png/17_macaco.png"
  },
  {
    "grupo": 18,
    "nome": "Porco",
    "emoji": "🐖",
    "imagem": "/assets/animals/animais_128_png/18_porco.png"
  },
  {
    "grupo": 19,
    "nome": "Pavão",
    "emoji": "🦚",
    "imagem": "/assets/animals/animais_128_png/19_pavao.png"
  },
  {
    "grupo": 20,
    "nome": "Peru",
    "emoji": "🦃",
    "imagem": "/assets/animals/animais_128_png/20_peru.png"
  },
  {
    "grupo": 21,
    "nome": "Touro",
    "emoji": "🐂",
    "imagem": "/assets/animals/animais_128_png/21_touro.png"
  },
  {
    "grupo": 22,
    "nome": "Tigre",
    "emoji": "🐅",
    "imagem": "/assets/animals/animais_128_png/22_tigre.png"
  },
  {
    "grupo": 23,
    "nome": "Urso",
    "emoji": "🐻",
    "imagem": "/assets/animals/animais_128_png/23_urso.png"
  },
  {
    "grupo": 24,
    "nome": "Veado",
    "emoji": "🦌",
    "imagem": "/assets/animals/animais_128_png/24_veado.png"
  },
  {
    "grupo": 25,
    "nome": "Vaca",
    "emoji": "🐄",
    "imagem": "/assets/animals/animais_128_png/25_vaca.png"
  }
];

const VAZIOS = ["", "", "", "", ""];

export function gerarPermutacoesIndividuais(milhar) {
  if (!/^\d{4}$/.test(milhar || "")) return [];

  const resultados = new Set();

  function visitar(formada, restantes) {
    if (restantes.length === 0) {
      resultados.add(formada);
      return;
    }

    const usadosNesteNivel = new Set();

    for (let i = 0; i < restantes.length; i += 1) {
      const algarismo = restantes[i];

      if (usadosNesteNivel.has(algarismo)) continue;

      usadosNesteNivel.add(algarismo);

      const proxima = restantes.slice();
      proxima.splice(i, 1);

      visitar(formada + algarismo, proxima);
    }
  }

  visitar("", milhar.split(""));

  return Array.from(resultados).sort();
}

export function classificarPermutacoes(resultados) {
  const milharesUnicas = new Set();

  // Cada milhar-base é processada isoladamente.
  // Nunca utilizamos algarismos de outra milhar.
  resultados.forEach((resultado) => {
    resultado.conjunto.forEach((base) => {
      gerarPermutacoesIndividuais(base).forEach((numero) => {
        milharesUnicas.add(numero);
      });
    });
  });

  const numerosPorGrupo = Array.from(
    { length: 25 },
    () => []
  );

  milharesUnicas.forEach((numero) => {
    const dezena = Number(numero.slice(-2));
    const grupo = dezena === 0 ? 25 : Math.ceil(dezena / 4);

    numerosPorGrupo[grupo - 1].push(numero);
  });

  return CATALOGO.map((animal) => ({
    ...animal,
    milhares: numerosPorGrupo[animal.grupo - 1].sort()
  })).filter((animal) => animal.milhares.length > 0);
}


export function calcularSobeDesce(grupos) {
  if (
    !Array.isArray(grupos) ||
    grupos.length !== 5 ||
    !grupos.every((g) => /^(0[1-9]|1[0-9]|2[0-5])$/.test(g))
  ) return [];

  const centenas = grupos.map(
    (g, i) => g + grupos[(i + 4) % 5].slice(-1)
  );

  return centenas.map(
    (c, i) => c + centenas[(i + 4) % 5].slice(-1)
  );
}

export function detalharMilhar(milhar) {
  if (!/^\d{4}$/.test(milhar || "")) return null;

  const prefixo = milhar.slice(0, 2);
  const dezena = Number(milhar.slice(-2));

  const grupo = dezena === 0 ? 25 : Math.ceil(dezena / 4);
  const animal = CATALOGO[grupo - 1];

  if (!animal) return null;

  const dezenas = grupo === 25
    ? [97, 98, 99, 0]
    : Array.from({ length: 4 }, (_, i) => (grupo - 1) * 4 + i + 1);

  const conjunto = dezenas.map(
    (d) => prefixo + String(d).padStart(2, "0")
  );

  return { ...animal, milhar, conjunto };
}

function FotoBicho({ animal }) {
  const [falha, setFalha] = useState(false);

  if (!animal.imagem || falha) {
    return (
      <div className="sd-foto sd-foto-fallback"
        title={animal.nome} aria-label={animal.nome}>
        {animal.emoji}
      </div>
    );
  }

  return (
    <img
      key={animal.imagem}
      className="sd-foto"
      src={animal.imagem}
      alt={animal.nome}
      loading="lazy"
      onError={() => setFalha(true)}
    />
  );
}

export default function SobeDescePermutacoes() {
  const [grupos, setGrupos] = useState(VAZIOS);
  const [mensagem, setMensagem] = useState("");
  const [filtroBicho, setFiltroBicho] = useState("todos");
  const [expandidos, setExpandidos] = useState({});

  const milhares = useMemo(
    () => calcularSobeDesce(grupos), [grupos]
  );

  const resultados = useMemo(
    () => milhares.map(detalharMilhar),
    [milhares]
  );

  const pronto = resultados.length === 5 &&
    resultados.every(Boolean);

  const invalidos = grupos.some(
    (g) => g.length === 2 &&
      !/^(0[1-9]|1[0-9]|2[0-5])$/.test(g)
  );

  const milharesBase = useMemo(
    () => pronto
      ? resultados.flatMap((resultado) => resultado.conjunto)
      : [],
    [pronto, resultados]
  );

  const baseOriginal = useMemo(
    () => new Set(milharesBase),
    [milharesBase]
  );

  const bichosClassificados = useMemo(
    () => pronto ? classificarPermutacoes(resultados) : [],
    [pronto, resultados]
  );

  const quantidadeUnicas = useMemo(
    () => bichosClassificados.reduce(
      (total, animal) => total + animal.milhares.length,
      0
    ),
    [bichosClassificados]
  );

  const bichosExibidos = useMemo(
    () => filtroBicho === "todos"
      ? bichosClassificados
      : bichosClassificados.filter(
          (animal) => String(animal.grupo) === filtroBicho
        ),
    [bichosClassificados, filtroBicho]
  );

  function alternarExpansao(grupo) {
    setExpandidos((atual) => ({
      ...atual,
      [grupo]: !atual[grupo]
    }));
  }

  function copiarTodasPermutacoes() {
    if (!pronto) return;

    copiar(
      bichosClassificados
        .flatMap((animal) => animal.milhares)
        .join("\n")
    );
  }
  function atualizar(i, valor) {
    const v = String(valor).replace(/\D/g, "").slice(0, 2);
    setGrupos((atual) => atual.map((g, j) => j === i ? v : g));
    setMensagem("");
    setFiltroBicho("todos");
    setExpandidos({});
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      setMensagem("Copiado com sucesso!");
    } catch {
      try {
        const campo = document.createElement("textarea");
        campo.value = texto;
        campo.style.position = "fixed";
        campo.style.opacity = "0";
        document.body.appendChild(campo);
        campo.select();
        const ok = document.execCommand("copy");
        campo.remove();
        setMensagem(ok ? "Copiado com sucesso!" : "Falha ao copiar.");
      } catch {
        setMensagem("Não foi possível copiar.");
      }
    }
  }

  function copiarPrincipais() {
    if (!pronto) return;
    copiar(milhares.join("\n"));
  }

  function copiarConjuntos() {
    if (!pronto) return;
    copiar(resultados.map((r) => r.conjunto.join("\n")).join("\n"));
  }

  return (
    <main className="sd-page sdp-page">
      <section className="sd-panel">
        <div className="sd-grid">
          <div className="sd-heading">GRUPOS</div>
          <div className="sd-heading">MILHARES E BICHOS</div>

          {grupos.map((grupo, i) => {
            const resultado = resultados[i];

            return (
              <React.Fragment key={i}>
                <label className="sd-input-wrap">
                  <span>{i + 1}º</span>
                  <input
                    aria-label={"Grupo " + (i + 1)}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    autoComplete="off"
                    placeholder="00"
                    value={grupo}
                    onChange={(e) => atualizar(i, e.target.value)}
                  />
                </label>

                <article className="sd-card">
                  {resultado ? (
                    <>
                      <div className="sd-card-top">
                        <FotoBicho animal={resultado} />
                        <div className="sd-info">
                          <div className="sd-animal">
                            {resultado.nome} · G{String(
                              resultado.grupo
                            ).padStart(2, "0")}
                          </div>
                          <strong className="sd-principal">
                            {resultado.milhar}
                          </strong>
                        </div>
                      </div>

                      <div className="sd-conjunto">
                        {resultado.conjunto.map((numero) => (
                          <span
                            key={numero}
                            className={
                              "sd-numero" +
                              (numero === resultado.milhar
                                ? " sd-numero-ativo" : "")
                            }
                          >
                            {numero}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="sd-empty">—</div>
                  )}
                </article>
              </React.Fragment>
            );
          })}
        </div>

        {invalidos && (
          <p className="sd-error" role="alert">
            Informe grupos de 01 a 25.
          </p>
        )}

        <div className="sd-actions">
          <button
            className="sd-copy"
            disabled={!pronto}
            onClick={copiarConjuntos}
            type="button"
          >
            Copiar conjuntos
          </button>

          <button
            className="sd-secondary"
            disabled={!pronto}
            onClick={copiarPrincipais}
            type="button"
          >
            Copiar 5 milhares
          </button>

          <button
            className="sd-clear"
            onClick={() => {
              setGrupos(VAZIOS);
              setMensagem("");
              setFiltroBicho("todos");
              setExpandidos({});
            }}
            type="button"
          >
            Limpar
          </button>
        </div>

        <div className="sd-message" role="status">
          {mensagem}
        </div>
      </section>

      <section className="sdp-panel">
        <div className="sdp-section-header">
          <div>
            <span className="sdp-eyebrow">NOVO PROCESSAMENTO</span>
            <h2>Milhares por bicho</h2>
            <p>
              Permutações individuais das milhares-base,
              classificadas por grupo.
            </p>
          </div>

          <span className="sdp-chip">Sem duplicatas</span>
        </div>

        <div className="sdp-stats">
          <div className="sdp-stat">
            <strong>{milharesBase.length}</strong>
            <span>Milhares-base</span>
          </div>

          <div className="sdp-stat">
            <strong>{quantidadeUnicas}</strong>
            <span>Milhares únicas</span>
          </div>

          <div className="sdp-stat">
            <strong>{bichosClassificados.length}</strong>
            <span>Bichos</span>
          </div>
        </div>

        <div className="sdp-toolbar">
          <label className="sdp-select-wrap">
            <span>Filtrar por bicho</span>
            <select
              value={filtroBicho}
              onChange={(e) => setFiltroBicho(e.target.value)}
              disabled={!pronto}
            >
              <option value="todos">Todos os bichos</option>

              {bichosClassificados.map((animal) => (
                <option
                  key={animal.grupo}
                  value={String(animal.grupo)}
                >
                  G{String(animal.grupo).padStart(2, "0")}
                  {" · "}
                  {animal.nome}
                  {" ("}
                  {animal.milhares.length}
                  {")"}
                </option>
              ))}
            </select>
          </label>

          <button
            className="sdp-button-gold"
            type="button"
            disabled={!pronto}
            onClick={copiarTodasPermutacoes}
          >
            Copiar todas as milhares
          </button>
        </div>

        {pronto ? (
          <div className="sdp-animals-grid">
            {bichosExibidos.map((animal) => {
              const aberto = Boolean(expandidos[animal.grupo]);

              const numeros = aberto
                ? animal.milhares
                : animal.milhares.slice(0, 8);

              return (
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
                      {animal.milhares.length} milhares
                    </span>
                  </header>

                  <div className="sdp-numbers">
                    {numeros.map((numero) => (
                      <span
                        key={numero}
                        className={
                          "sdp-number" +
                          (baseOriginal.has(numero)
                            ? " sdp-number-original"
                            : "")
                        }
                      >
                        {numero}
                      </span>
                    ))}
                  </div>

                  <div className="sdp-card-actions">
                    {animal.milhares.length > 8 ? (
                      <button
                        type="button"
                        onClick={() => alternarExpansao(animal.grupo)}
                      >
                        {aberto
                          ? "Mostrar menos"
                          : "Ver todas (" + animal.milhares.length + ")"}
                      </button>
                    ) : (
                      <span className="sdp-card-hint">
                        Todas exibidas
                      </span>
                    )}

                    <button
                      type="button"
                      className="sdp-card-copy"
                      onClick={() => copiar(animal.milhares.join("\n"))}
                    >
                      Copiar {animal.milhares.length}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="sdp-placeholder">
            Informe os cinco grupos para gerar
            e classificar todas as permutações.
          </div>
        )}

        <p className="sdp-footer-note">
          As milhares destacadas em dourado pertencem
          aos conjuntos originais do Sobe &amp; Desce.
          Cada milhar é permutada individualmente.
        </p>
      </section>
    </main>
  );
}
