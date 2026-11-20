import {
  ANIMAIS_TRANSICOES,
  grupoDaDezena
} from "./sobeDesceTransicoes.logic.mjs";

export function permutarMilharIndividual(milhar) {
  if (!/^\d{4}$/.test(milhar)) return [];

  const saida = new Set();
  const digitos = [...milhar];
  const usados = new Array(4).fill(false);

  function percorrer(parcial) {
    if (parcial.length === 4) {
      saida.add(parcial);
      return;
    }

    const vistos = new Set();

    digitos.forEach((digito, indice) => {
      if (usados[indice] || vistos.has(digito)) {
        return;
      }

      vistos.add(digito);
      usados[indice] = true;

      percorrer(parcial + digito);

      usados[indice] = false;
    });
  }

  percorrer("");

  return [...saida].sort();
}

function identificarRelacao(milhar, anterior, premio) {
  if (premio === 7) {
    if (milhar.slice(-3) === anterior) {
      return "Mesma centena (7º)";
    }

    if (milhar.slice(-2) === anterior.slice(-2)) {
      return "Mesma dezena (7º)";
    }

    return null;
  }

  if (milhar === anterior) {
    return "Milhar idêntica";
  }

  if (
    [...milhar].sort().join("") ===
    [...anterior].sort().join("")
  ) {
    return "Permutação exata";
  }

  if (milhar.slice(-3) === anterior.slice(-3)) {
    return "Mesma centena";
  }

  const iguais = [...milhar].filter(
    (digito, indice) => digito === anterior[indice]
  ).length;

  if (iguais === 3) {
    return "Três posições iguais";
  }

  if (milhar.slice(0, 2) === anterior.slice(0, 2)) {
    return "Mesma cabeça";
  }

  if (milhar.slice(-2) === anterior.slice(-2)) {
    return "Mesma dezena";
  }

  return null;
}

export function analisarPermutacoesETransicoes(
  calculo,
  resultados
) {
  const vazio = {
    universo: [],
    relacionadas: [],
    premiosInformados: 0
  };

  if (!calculo?.conjuntos) {
    return vazio;
  }

  const numeros = new Set();

  for (const conjunto of calculo.conjuntos) {
    for (const base of conjunto.bases) {
      for (
        const permutacao of permutarMilharIndividual(base)
      ) {
        numeros.add(permutacao);
      }
    }
  }

  const anteriores = (
    Array.isArray(resultados) ? resultados : []
  )
    .map((numero, indice) => ({
      premio: indice + 1,
      numero: String(numero ?? "")
    }))
    .filter(({ premio, numero }) =>
      premio === 7
        ? /^\d{3}$/.test(numero)
        : /^\d{4}$/.test(numero)
    );

  const universo = [...numeros]
    .sort()
    .map((numero) => {
      const grupo = grupoDaDezena(
        numero.slice(-2)
      );

      // Cada premio pode contribuir com uma
      // unica relacao por milhar candidata.
      const vinculos = anteriores.flatMap(
        ({ premio, numero: anterior }) => {
          const metodo = identificarRelacao(
            numero,
            anterior,
            premio
          );

          return metodo
            ? [{ premio, anterior, metodo }]
            : [];
        }
      );

      return {
        numero,
        grupo,
        animal: ANIMAIS_TRANSICOES[grupo - 1],
        vinculos
      };
    });

  return {
    universo,
    relacionadas: universo.filter(
      (item) => item.vinculos.length > 0
    ),
    premiosInformados: anteriores.length
  };
}
