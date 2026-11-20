export const ANIMAIS_TRANSICOES = [
  ["Avestruz", "avestruz"],
  ["Águia", "aguia"],
  ["Burro", "burro"],
  ["Borboleta", "borboleta"],
  ["Cachorro", "cachorro"],
  ["Cabra", "cabra"],
  ["Carneiro", "carneiro"],
  ["Camelo", "camelo"],
  ["Cobra", "cobra"],
  ["Coelho", "coelho"],
  ["Cavalo", "cavalo"],
  ["Elefante", "elefante"],
  ["Galo", "galo"],
  ["Gato", "gato"],
  ["Jacaré", "jacare"],
  ["Leão", "leao"],
  ["Macaco", "macaco"],
  ["Porco", "porco"],
  ["Pavão", "pavao"],
  ["Peru", "peru"],
  ["Touro", "touro"],
  ["Tigre", "tigre"],
  ["Urso", "urso"],
  ["Veado", "veado"],
  ["Vaca", "vaca"]
].map(([nome, slug], index) => {
  const grupo = index + 1;

  return {
    grupo,
    nome,
    imagem:
      "/assets/animals/animais_128_png/" +
      String(grupo).padStart(2, "0") +
      "_" + slug + ".png"
  };
});

export function grupoDaDezena(dezena) {
  const numero = Number(dezena);

  if (!Number.isInteger(numero) || numero < 0 || numero > 99) {
    return null;
  }

  return numero === 0 ? 25 : Math.ceil(numero / 4);
}

export function animalDaMilhar(milhar) {
  const numero = String(milhar);

  if (!/^\d{4}$/.test(numero)) return null;

  const grupo = grupoDaDezena(numero.slice(-2));

  return ANIMAIS_TRANSICOES[grupo - 1] || null;
}

export function dezenasDoGrupo(grupo) {
  if (!Number.isInteger(grupo) || grupo < 1 || grupo > 25) {
    return [];
  }

  if (grupo === 25) {
    return ["97", "98", "99", "00"];
  }

  return Array.from(
    { length: 4 },
    (_, i) => String((grupo - 1) * 4 + i + 1).padStart(2, "0")
  );
}

export function calcularSobeDesceTransicoes(grupos) {
  if (
    !Array.isArray(grupos) ||
    grupos.length !== 5 ||
    !grupos.every(
      (grupo) =>
        typeof grupo === "string" &&
        /^\d{2}$/.test(grupo) &&
        Number(grupo) >= 1 &&
        Number(grupo) <= 25
    )
  ) {
    return null;
  }

  // Cálculo circular original, reproduzido de maneira independente.
  const centenas = grupos.map(
    (grupo, i) => grupo + grupos[(i + 4) % 5].slice(-1)
  );

  const milhares = centenas.map(
    (centena, i) => centena + centenas[(i + 4) % 5].slice(-1)
  );

  const conjuntos = milhares.map((milhar, index) => {
    const animal = animalDaMilhar(milhar);
    const dezenas = dezenasDoGrupo(animal.grupo);

    return {
      posicao: index + 1,
      grupoInformado: grupos[index],
      centena: centenas[index],
      milhar,
      animal,
      bases: dezenas.map(
        (dezena) => milhar.slice(0, 2) + dezena
      )
    };
  });

  return {
    grupos: [...grupos],
    centenas,
    milhares,
    conjuntos,
    bases: conjuntos.flatMap((conjunto) => conjunto.bases)
  };
}

export function analisarCoincidencias(calculo, resultados) {
  if (!calculo || !Array.isArray(resultados)) return [];

  const coincidencias = [];

  for (const conjunto of calculo.conjuntos) {
    for (const candidata of conjunto.bases) {
      resultados.forEach((resultado, index) => {
        const anterior = String(resultado || "");
        const centena = index === 6;

        if (centena) {
          if (!/^\d{3}$/.test(anterior)) return;
        } else if (!/^\d{4}$/.test(anterior)) {
          return;
        }

        const relacoes = [];

        if (centena) {
          if (candidata.slice(-3) === anterior) {
            relacoes.push("Mesma centena");
          } else if (candidata.slice(-2) === anterior.slice(-2)) {
            relacoes.push("Mesma dezena");
          }
        } else {
          if (candidata === anterior) {
            relacoes.push("Milhar idêntica");
          } else {
            if (
              [...candidata].sort().join("") ===
              [...anterior].sort().join("")
            ) {
              relacoes.push("Permutação exata");
            }

            const iguaisNaPosicao = [...candidata].filter(
              (digito, i) => digito === anterior[i]
            ).length;

            if (iguaisNaPosicao === 3) {
              relacoes.push("Três posições iguais");
            }
          }

          if (candidata.slice(0, 2) === anterior.slice(0, 2)) {
            relacoes.push("Mesma cabeça");
          }

          if (candidata.slice(-3) === anterior.slice(-3)) {
            relacoes.push("Mesma centena");
          } else if (candidata.slice(-2) === anterior.slice(-2)) {
            relacoes.push("Mesma dezena");
          }
        }

        if (relacoes.length) {
          coincidencias.push({
            posicao: conjunto.posicao,
            candidata,
            premio: index + 1,
            anterior,
            relacoes
          });
        }
      });
    }
  }

  return coincidencias.sort(
    (a, b) =>
      a.posicao - b.posicao ||
      a.candidata.localeCompare(b.candidata) ||
      a.premio - b.premio
  );
}
