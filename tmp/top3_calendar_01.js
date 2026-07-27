"use strict";

const fs = require("fs");

const target = "src/pages/Top3/Top3View.jsx";

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo não encontrado: ${target}`);
}

const original = fs.readFileSync(target, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";

let content = original.replace(/\r\n/g, "\n");

function replaceOnce(label, before, after) {
  const count = content.split(before).length - 1;

  if (count !== 1) {
    throw new Error(
      `${label}: esperado 1 bloco, encontrado ${count}. Nenhuma alteração foi gravada.`
    );
  }

  content = content.replace(before, after);
}

replaceOnce(
  "Estado e datas disponíveis",
`  const todayForCalendar = todayYMDLocalView();
  const selectedHistoryYmd = isYMD(ymdSafe)
    ? ymdSafe
    : todayForCalendar;

  const canGoNext =
    isYMD(selectedHistoryYmd) &&
    selectedHistoryYmd < todayForCalendar;`,
`  const todayForCalendar = todayYMDLocalView();
  const selectedHistoryYmd = isYMD(ymdSafe)
    ? ymdSafe
    : todayForCalendar;

  const availableHistoryDates = useMemo(() => {
    const dates = new Set();

    (Array.isArray(timeline) ? timeline : []).forEach(
      (slot) => {
        const ymd = String(
          slot?.targetYmd || ""
        ).trim();

        if (isYMD(ymd) && ymd <= todayForCalendar) {
          dates.add(ymd);
        }
      }
    );

    (
      Array.isArray(persistedTop3History)
        ? persistedTop3History
        : []
    ).forEach((entry) => {
      const ymd = String(
        entry?.targetYmd || ""
      ).trim();

      if (isYMD(ymd) && ymd <= todayForCalendar) {
        dates.add(ymd);
      }
    });

    return Array.from(dates).sort();
  }, [
    timeline,
    persistedTop3History,
    todayForCalendar,
  ]);

  const previousAvailableDate = useMemo(() => {
    for (
      let index = availableHistoryDates.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (
        availableHistoryDates[index] <
        selectedHistoryYmd
      ) {
        return availableHistoryDates[index];
      }
    }

    return "";
  }, [
    availableHistoryDates,
    selectedHistoryYmd,
  ]);

  const nextAvailableDate = useMemo(() => {
    return (
      availableHistoryDates.find(
        (date) => date > selectedHistoryYmd
      ) || ""
    );
  }, [
    availableHistoryDates,
    selectedHistoryYmd,
  ]);

  const canGoPrevious =
    isYMD(previousAvailableDate);

  const canGoNext =
    isYMD(nextAvailableDate);`
);

replaceOnce(
  "Botão Dia anterior",
`            <button
              type="button"
              className="pp-btn"
              onClick={() =>
                goToHistoryDate(
                  addDaysYMDLocal(selectedHistoryYmd, -1)
                )
              }
            >
              ◀ Dia anterior
            </button>`,
`            <button
              type="button"
              className="pp-btn"
              disabled={!canGoPrevious}
              onClick={() => {
                if (!canGoPrevious) return;
                goToHistoryDate(previousAvailableDate);
              }}
              style={{
                opacity: canGoPrevious ? 1 : 0.45,
                cursor: canGoPrevious
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              ◀ Dia anterior
            </button>`
);

replaceOnce(
  "Botão Próximo dia",
`            <button
              type="button"
              className="pp-btn"
              disabled={!canGoNext}
              onClick={() => {
                if (!canGoNext) return;

                goToHistoryDate(
                  addDaysYMDLocal(selectedHistoryYmd, 1)
                );
              }}
              style={{
                opacity: canGoNext ? 1 : 0.45,
                cursor: canGoNext ? "pointer" : "not-allowed",
              }}
            >
              Próximo dia ▶
            </button>`,
`            <button
              type="button"
              className="pp-btn"
              disabled={!canGoNext}
              onClick={() => {
                if (!canGoNext) return;
                goToHistoryDate(nextAvailableDate);
              }}
              style={{
                opacity: canGoNext ? 1 : 0.45,
                cursor: canGoNext
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              Próximo dia ▶
            </button>`
);

const requiredChecks = [
  "const availableHistoryDates = useMemo(() => {",
  "const previousAvailableDate = useMemo(() => {",
  "const nextAvailableDate = useMemo(() => {",
  "goToHistoryDate(previousAvailableDate);",
  "goToHistoryDate(nextAvailableDate);",
  "disabled={!canGoPrevious}",
  "disabled={!canGoNext}",
];

for (const check of requiredChecks) {
  if (!content.includes(check)) {
    throw new Error(
      `Validação interna falhou. Trecho ausente: ${check}`
    );
  }
}

if (
  content.includes(
    "addDaysYMDLocal(selectedHistoryYmd, -1)"
  ) ||
  content.includes(
    "addDaysYMDLocal(selectedHistoryYmd, 1)"
  )
) {
  throw new Error(
    "A navegação antiga de +1/-1 dia ainda está presente."
  );
}

fs.writeFileSync(
  target,
  content.replace(/\n/g, eol),
  "utf8"
);

console.log("ALTERAÇÃO APLICADA COM SUCESSO");
console.log(`Arquivo: ${target}`);
console.log(
  "Navegação anterior: última data real disponível."
);
console.log(
  "Navegação seguinte: próxima data real disponível."
);
