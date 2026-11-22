const GRUPO_VALIDO = /^(0[1-9]|1\d|2[0-5])$/;

export function extrairGruposSorteio(sorteio) {
  if (
    !sorteio ||
    sorteio.__placeholder ||
    !Array.isArray(sorteio.prizes)
  ) return null;

  const grupos = Array(5).fill(null);

  for (const premio of sorteio.prizes) {
    const posicao = Number(
      premio?.position ?? premio?.posicao
    );

    if (
      !Number.isInteger(posicao) ||
      posicao < 1 ||
      posicao > 5
    ) continue;

    const bruto = premio?.grupo;

    if (
      bruto === null ||
      bruto === undefined ||
      String(bruto).trim() === ""
    ) return null;

    const numero = Number(bruto);

    if (
      !Number.isInteger(numero) ||
      numero < 1 ||
      numero > 25
    ) return null;

    const grupo = String(numero).padStart(2, "0");
    const indice = posicao - 1;

    if (grupos[indice] !== null) {
      if (grupos[indice] !== grupo) return null;
      continue;
    }

    grupos[indice] = grupo;
  }

  return grupos.every(
    (grupo) =>
      typeof grupo === "string" &&
      GRUPO_VALIDO.test(grupo)
  ) ? grupos : null;
}

export function minutosSorteio(sorteio) {
  const bruto = String(
    sorteio?.close_hour ??
    sorteio?.closeHour ??
    sorteio?.hour ??
    sorteio?.hora ??
    ""
  );

  const partes = bruto.match(/\d+/g);
  if (!partes?.length) return -1;

  let horas = 0;
  let minutos = 0;

  if (partes.length >= 2) {
    horas = Number(partes[0]);
    minutos = Number(partes[1]);
  } else if (partes[0].length <= 2) {
    horas = Number(partes[0]);
  } else if (partes[0].length <= 4) {
    horas = Number(partes[0].slice(0, -2));
    minutos = Number(partes[0].slice(-2));
  } else {
    return -1;
  }

  if (
    !Number.isInteger(horas) ||
    !Number.isInteger(minutos) ||
    horas < 0 || horas > 23 ||
    minutos < 0 || minutos > 59
  ) return -1;

  return horas * 60 + minutos;
}

export function selecionarUltimoCompleto(draws, dia) {
  if (!Array.isArray(draws)) return null;

  const validos = draws
    .filter((sorteio) => {
      if (!extrairGruposSorteio(sorteio)) {
        return false;
      }

      const data = String(
        sorteio?.ymd || sorteio?.date || ""
      ).slice(0, 10);

      return !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
        data === dia;
    })
    .sort(
      (a, b) =>
        minutosSorteio(b) - minutosSorteio(a)
    );

  if (!validos.length) return null;

  return {
    grupos: extrairGruposSorteio(validos[0]),
    minutos: minutosSorteio(validos[0]),
    data: dia
  };
}

export function dataHojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const pegar = (tipo) =>
    partes.find((p) => p.type === tipo)?.value;

  return [
    pegar("year"),
    pegar("month"),
    pegar("day")
  ].join("-");
}

export function deslocarDia(ymd, dias) {
  const [ano, mes, dia] = ymd.split("-").map(Number);
  return new Date(
    Date.UTC(ano, mes - 1, dia + dias)
  ).toISOString().slice(0, 10);
}

export function formatarOrigemSorteio(resultado) {
  const [ano, mes, dia] = resultado.data.split("-");
  const minutos = resultado.minutos;

  const horario = minutos >= 0
    ? ` às ${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`
    : " (horário não informado)";

  return `${dia}/${mes}/${ano}${horario}`;
}