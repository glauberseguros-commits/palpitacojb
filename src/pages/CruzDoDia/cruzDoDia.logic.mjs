const ANIMAIS = [
  ["Avestruz", "avestruz", "🪶"],
  ["Águia", "aguia", "🦅"],
  ["Burro", "burro", "🐴"],
  ["Borboleta", "borboleta", "🦋"],
  ["Cachorro", "cachorro", "🐕"],
  ["Cabra", "cabra", "🐐"],
  ["Carneiro", "carneiro", "🐏"],
  ["Camelo", "camelo", "🐪"],
  ["Cobra", "cobra", "🐍"],
  ["Coelho", "coelho", "🐇"],
  ["Cavalo", "cavalo", "🐎"],
  ["Elefante", "elefante", "🐘"],
  ["Galo", "galo", "🐓"],
  ["Gato", "gato", "🐈"],
  ["Jacaré", "jacare", "🐊"],
  ["Leão", "leao", "🦁"],
  ["Macaco", "macaco", "🐒"],
  ["Porco", "porco", "🐖"],
  ["Pavão", "pavao", "🦚"],
  ["Peru", "peru", "🦃"],
  ["Touro", "touro", "🐂"],
  ["Tigre", "tigre", "🐅"],
  ["Urso", "urso", "🐻"],
  ["Veado", "veado", "🦌"],
  ["Vaca", "vaca", "🐄"]
];

export const CATALOGO_CRUZ = ANIMAIS.map(
  ([nome, slug, emoji], index) => {
    const grupo = index + 1;
    const numero = String(grupo).padStart(2, "0");

    return {
      grupo,
      nome,
      emoji,
      imagem:
        "/assets/animals/animais_128_png/" +
        numero + "_" + slug + ".png"
    };
  }
);

export function permutarAlgarismos(digitos) {
  if (!Array.isArray(digitos) || digitos.length !== 4) {
    return [];
  }

  if (!digitos.every((d) => /^[0-9]$/.test(String(d)))) {
    return [];
  }

  const unicas = new Set();

  function formar(parcial, restantes) {
    if (restantes.length === 0) {
      unicas.add(parcial);
      return;
    }

    const utilizados = new Set();

    for (let i = 0; i < restantes.length; i += 1) {
      const atual = String(restantes[i]);

      if (utilizados.has(atual)) continue;
      utilizados.add(atual);

      const proximos = restantes.slice();
      proximos.splice(i, 1);

      formar(parcial + atual, proximos);
    }
  }

  formar("", digitos);

  return [...unicas].sort();
}

export function calcularCruzDoDia(dataISO) {
  const vazio = {
    sequencia: [],
    digitos: [],
    milhares: [],
    bichos: []
  };

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(dataISO || "")
  );

  if (!match) return vazio;

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);

  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return vazio;
  }

  // O cálculo utiliza somente o DIA da data selecionada.
  // Soma 3 sucessivamente, formando quatro valores.
  const sequencia = Array.from(
    { length: 4 },
    (_, i) => dia + i * 3
  );

  const digitos = sequencia.map(
    (numero) => String(numero % 10)
  );

  const milhares = permutarAlgarismos(digitos);

  const bichos = CATALOGO_CRUZ.map((animal) => {
    const dezenas = animal.grupo === 25
      ? [97, 98, 99, 0]
      : Array.from(
          { length: 4 },
          (_, i) => (animal.grupo - 1) * 4 + i + 1
        );

    const colunas = dezenas.map((dezena) => ({
      dezena: String(dezena).padStart(2, "0"),
      numeros: milhares.filter(
        (milhar) => Number(milhar.slice(-2)) === dezena
      )
    }));

    const numeros = colunas.flatMap(
      (coluna) => coluna.numeros
    );

    return { ...animal, colunas, numeros };
  }).filter((animal) => animal.numeros.length > 0);

  return { sequencia, digitos, milhares, bichos };
}