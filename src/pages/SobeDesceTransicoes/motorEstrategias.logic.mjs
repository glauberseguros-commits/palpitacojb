import {
  ANIMAIS_TRANSICOES,
  grupoDaDezena,
  dezenasDoGrupo,
  calcularSobeDesceTransicoes
} from "./sobeDesceTransicoes.logic.mjs";

import {
  gerarPorGruposECentenas
} from "./geradorGruposCentenas.logic.mjs";

function grupoCircular(grupo, deslocamento) {
  return ((grupo - 1 + deslocamento + 25) % 25) + 1;
}

function registrar(mapa, numero, origem) {
  if (!mapa.has(numero)) {
    mapa.set(numero, {
      numero,
      grupo: grupoDaDezena(numero.slice(-2)),
      origens: []
    });
  }

  const item = mapa.get(numero);

  if (!item.origens.includes(origem)) {
    item.origens.push(origem);
  }
}

function ordenar(mapa) {
  return [...mapa.values()].sort((a, b) =>
    a.numero.localeCompare(b.numero)
  );
}

export function calcularMotorEstrategias(resultados) {
  if (
    !Array.isArray(resultados) ||
    resultados.length !== 7 ||
    !resultados.every((numero, indice) =>
      typeof numero === "string" &&
      (
        indice === 6
          ? /^\d{3}$/.test(numero)
          : /^\d{4}$/.test(numero)
      )
    )
  ) {
    return null;
  }

  const centenas = resultados.map(
    (numero) => numero.slice(-3)
  );

  const grupos = resultados.map(
    (numero) => grupoDaDezena(numero.slice(-2))
  );

  // METODO A
  // Preserva integralmente o calculo Sobe & Desce.
  const tradicional = calcularSobeDesceTransicoes(
    grupos.slice(0, 5).map(
      (grupo) => String(grupo).padStart(2, "0")
    )
  );

  const mapaA = new Map();

  for (const conjunto of tradicional.conjuntos) {
    for (const numero of conjunto.bases) {
      registrar(
        mapaA,
        numero,
        `Sobe & Desce - ${conjunto.posicao}º grupo`
      );
    }
  }

  const basesTradicionais = ordenar(mapaA);

  // METODO C
  // Duas hipoteses independentes de formacao
  // de cabecas, sem usar resultados futuros.
  const mapaCabecas = new Map();

  function registrarCabeca(cabeca, origem, metodo) {
    if (!mapaCabecas.has(cabeca)) {
      mapaCabecas.set(cabeca, {
        cabeca,
        origens: [],
        metodos: []
      });
    }

    const item = mapaCabecas.get(cabeca);

    if (!item.origens.includes(origem)) {
      item.origens.push(origem);
    }

    if (!item.metodos.includes(metodo)) {
      item.metodos.push(metodo);
    }
  }

  centenas.forEach((centena, indice) => {
    // Ex.: 566 -> 56 -> 65
    const cabecaInvertida = centena[1] + centena[0];

    registrarCabeca(
      cabecaInvertida,
      `${indice + 1}º: ${centena} -> ${cabecaInvertida}`,
      "Inversao dos dois primeiros digitos da centena"
    );

    if (indice < 6) {
      // Ex.: 3074 -> 3 e 7 -> 37
      const milhar = resultados[indice];
      const cabecaPosicional = milhar[0] + milhar[2];

      registrarCabeca(
        cabecaPosicional,
        `${indice + 1}º: ${milhar} -> ${cabecaPosicional}`,
        "Primeiro e terceiro digitos da milhar"
      );
    }
  });

  const cabecas = [...mapaCabecas.values()]
    .sort((a, b) => a.cabeca.localeCompare(b.cabeca));

  // Cruzamento C + A:
  // Cabecas alternativas com os grupos tradicionais.
  const mapaC = new Map();

  for (const conjunto of tradicional.conjuntos) {
    const grupo = conjunto.animal.grupo;

    for (const cabeca of cabecas) {
      for (const dezena of dezenasDoGrupo(grupo)) {
        registrar(
          mapaC,
          cabeca.cabeca + dezena,
          `${conjunto.animal.nome} - ${cabeca.origens.join(" / ")}`
        );
      }
    }
  }

  const cruzamentos = ordenar(mapaC);

  // METODO B
  // Mantem a hipotese anterior de convergencia.
  // Na ausencia de convergencia, apresenta
  // transicoes simples, sem classifica-las
  // como previsoes estatisticamente superiores.
  const hipoteseAnterior = gerarPorGruposECentenas(
    resultados
  );

  const existeConvergencia =
    hipoteseAnterior.gruposCandidatos.length > 0;

  const mapaB = new Map();
  const transicoes = [];

  if (existeConvergencia) {
    for (const item of hipoteseAnterior.candidatas) {
      registrar(
        mapaB,
        item.numero,
        `Convergencia G${String(item.grupo).padStart(2, "0")}`
      );
    }
  } else {
    grupos.forEach((grupo, indice) => {
      const deslocamento = indice < 5 ? -5 : 1;
      const destino = grupoCircular(
        grupo,
        deslocamento
      );

      const centena = centenas[indice];
      const cabeca = centena[0] + centena[2];

      transicoes.push({
        premio: indice + 1,
        origem: grupo,
        destino,
        deslocamento,
        cabeca
      });

      for (const dezena of dezenasDoGrupo(destino)) {
        registrar(
          mapaB,
          cabeca + dezena,
          `${indice + 1}º premio: G${grupo} -> G${destino}, cabeca ${cabeca}`
        );
      }
    });
  }

  const alternativas = ordenar(mapaB);

  // METODO D
  // Consolida sem duplicar milhares.
  // Registra todos os metodos participantes.
  const mapaConsolidado = new Map();

  function incorporar(lista, metodo) {
    for (const item of lista) {
      if (!mapaConsolidado.has(item.numero)) {
        mapaConsolidado.set(item.numero, {
          numero: item.numero,
          grupo: item.grupo,
          metodos: [],
          origens: []
        });
      }

      const destino = mapaConsolidado.get(item.numero);

      if (!destino.metodos.includes(metodo)) {
        destino.metodos.push(metodo);
      }

      for (const origem of item.origens) {
        const descricao = `${metodo}: ${origem}`;

        if (!destino.origens.includes(descricao)) {
          destino.origens.push(descricao);
        }
      }
    }
  }

  incorporar(basesTradicionais, "A");
  incorporar(cruzamentos, "C");
  incorporar(alternativas, "B");

  const consolidadas = [...mapaConsolidado.values()]
    .sort((a, b) => a.numero.localeCompare(b.numero));

  const multimeto = consolidadas.filter(
    (item) => item.metodos.length >= 2
  );

  return {
    resultados,
    centenas,
    grupos,
    tradicional,
    basesTradicionais,
    cabecas,
    cruzamentos,
    alternativas,
    existeConvergencia,
    transicoes,
    consolidadas,
    multimeto
  };
}

export { ANIMAIS_TRANSICOES, dezenasDoGrupo };
