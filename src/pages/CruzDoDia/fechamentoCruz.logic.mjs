// Fechamento das milhares por bicho.
// O calculo original da Cruz do Dia permanece inalterado.
export function fecharCruzDoDia(bichos = []) {
  const fechados = bichos.map((animal) => {
    const originais = [...new Set(animal.numeros)].sort();
    const conjuntoOriginal = new Set(originais);

    const cabecas = [
      ...new Set(
        originais.map((numero) => numero.slice(0, 2))
      )
    ].sort();

    const colunas = animal.colunas.map((coluna) => ({
      dezena: coluna.dezena,
      numeros: cabecas.map(
        (cabeca) => cabeca + coluna.dezena
      )
    }));

    const numeros = [
      ...new Set(
        colunas.flatMap((coluna) => coluna.numeros)
      )
    ].sort();

    const complementares = numeros.filter(
      (numero) => !conjuntoOriginal.has(numero)
    );

    return {
      ...animal,
      colunas,
      numeros,
      originais,
      complementares
    };
  });

  const unicos = (campo) => [
    ...new Set(
      fechados.flatMap((animal) => animal[campo])
    )
  ].sort();

  return {
    bichos: fechados,
    originais: unicos("originais"),
    complementares: unicos("complementares"),
    numeros: unicos("numeros")
  };
}
