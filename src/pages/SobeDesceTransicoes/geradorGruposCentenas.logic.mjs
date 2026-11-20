import {
  ANIMAIS_TRANSICOES,
  grupoDaDezena,
  dezenasDoGrupo,
  calcularSobeDesceTransicoes
} from "./sobeDesceTransicoes.logic.mjs";

function deslocarGrupo(grupo, passos) {
  return ((grupo - 1 + passos + 25) % 25) + 1;
}

export function gerarPorGruposECentenas(resultados) {
  if (
    !Array.isArray(resultados) ||
    resultados.length !== 7 ||
    !resultados.every((valor, indice) =>
      typeof valor === "string" &&
      (
        indice === 6
          ? /^\d{3}$/.test(valor)
          : /^\d{4}$/.test(valor)
      )
    )
  ) {
    return null;
  }

  const centenas = resultados.map(
    (valor) => valor.slice(-3)
  );

  const gruposAnteriores = resultados.map(
    (valor) => grupoDaDezena(valor.slice(-2))
  );

  const votos = new Map();

  function registrar(grupo, origem) {
    if (!votos.has(grupo)) {
      votos.set(grupo, {
        grupo,
        origens: []
      });
    }

    votos.get(grupo).origens.push(origem);
  }

  gruposAnteriores.forEach((grupo, indice) => {
    const deslocamento = indice < 5 ? -5 : 1;

    const candidato = deslocarGrupo(
      grupo,
      deslocamento
    );

    const origem =
      `${indice + 1}º grupo ` +
      `${String(grupo).padStart(2, "0")} ` +
      `${deslocamento < 0 ? "−" : "+"} ` +
      `${Math.abs(deslocamento)}`;

    registrar(candidato, origem);
  });

  // Só considerar grupos indicados por
  // duas ou mais posições anteriores.
  const gruposCandidatos = [...votos.values()]
    .filter((item) => item.origens.length >= 2)
    .sort(
      (a, b) =>
        b.origens.length - a.origens.length ||
        a.grupo - b.grupo
    );

  // Cada cabeça vem de uma única centena:
  // primeiro e terceiro algarismos.
  const mapaCabecas = new Map();

  centenas.forEach((centena, indice) => {
    const cabeca = centena[0] + centena[2];

    if (!mapaCabecas.has(cabeca)) {
      mapaCabecas.set(cabeca, {
        cabeca,
        origens: []
      });
    }

    mapaCabecas.get(cabeca).origens.push(
      `${indice + 1}º · ${centena}`
    );
  });

  const cabecas = [...mapaCabecas.values()]
    .sort((a, b) =>
      a.cabeca.localeCompare(b.cabeca)
    );

  const candidatas = [];

  for (const grupo of gruposCandidatos) {
    for (const cabeca of cabecas) {
      for (const dezena of dezenasDoGrupo(grupo.grupo)) {
        candidatas.push({
          numero: cabeca.cabeca + dezena,
          grupo: grupo.grupo,
          origensGrupo: grupo.origens,
          origensCabeca: cabeca.origens
        });
      }
    }
  }

  candidatas.sort(
    (a, b) => a.numero.localeCompare(b.numero)
  );

  const calculoOriginal = calcularSobeDesceTransicoes(
    gruposAnteriores
      .slice(0, 5)
      .map((grupo) =>
        String(grupo).padStart(2, "0")
      )
  );

  return {
    resultados,
    centenas,
    gruposAnteriores,
    gruposCandidatos,
    cabecas,
    candidatas,
    calculoOriginal
  };
}

export { ANIMAIS_TRANSICOES, dezenasDoGrupo };
