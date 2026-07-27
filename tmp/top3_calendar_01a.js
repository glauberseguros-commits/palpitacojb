"use strict";

const fs = require("fs");

const target = "src/pages/Top3/Top3View.jsx";

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo não encontrado: ${target}`);
}

const original = fs.readFileSync(target, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";

let content = original.replace(/\r\n/g, "\n");

function countOccurrences(source, search) {
  return source.split(search).length - 1;
}

function replaceExactlyOnce(label, before, after) {
  const count = countOccurrences(content, before);

  if (count !== 1) {
    throw new Error(
      `${label}: esperado exatamente 1 bloco, encontrado ${count}.`
    );
  }

  content = content.replace(before, after);
}

const oldCalendarLogic = `  const todayForCalendar = todayYMDLocalView();
  const selectedHistoryYmd = isYMD(ymdSafe)
    ? ymdSafe
    : todayForCalendar;

  const canGoNext =
    isYMD(selectedHistoryYmd) &&
    selectedHistoryYmd < todayForCalendar;

  const goToHistoryDate = useCallback(
    (nextYmd) => {
      if (!isYMD(nextYmd)) return;
      if (typeof setYmd !== "function") return;
      setYmd(nextYmd);
    },
    [setYmd]
  );`;

const newCalendarLogic = `  const todayForCalendar = todayYMDLocalView();
  const selectedHistoryYmd = isYMD(ymdSafe)
    ? ymdSafe
    : todayForCalendar;

  const availableHistoryDates = useMemo(() => {
    const dates = new Set();

    (
      Array.isArray(persistedTop3History)
        ? persistedTop3History
        : []
    ).forEach((entry) => {
      const ymd = String(
        entry?.targetYmd || ""
      ).trim();

      if (
        isYMD(ymd) &&
        ymd <= todayForCalendar
      ) {
        dates.add(ymd);
      }
    });

    (
      Array.isArray(timeline)
        ? timeline
        : []
    ).forEach((slot) => {
      const ymd = String(
        slot?.targetYmd || ""
      ).trim();

      const hasResult =
        hasOfficialResult(slot) ||
        String(slot?.status || "")
          .trim()
          .toLowerCase() === "validated";

      if (
        isYMD(ymd) &&
        ymd <= todayForCalendar &&
        hasResult
      ) {
        dates.add(ymd);
      }
    });

    return Array.from(dates).sort();
  }, [
    persistedTop3History,
    timeline,
    todayForCalendar,
  ]);

  const previousAvailableDate = useMemo(() => {
    for (
      let index = availableHistoryDates.length - 1;
      index >= 0;
      index -= 1
    ) {
      const candidate =
        availableHistoryDates[index];

      if (candidate < selectedHistoryYmd) {
        return candidate;
      }
    }

    return "";
  }, [
    availableHistoryDates,
    selectedHistoryYmd,
  ]);

  const nextAvailableDate = useMemo(() => {
    for (
      let index = 0;
      index < availableHistoryDates.length;
      index += 1
    ) {
      const candidate =
        availableHistoryDates[index];

      if (candidate > selectedHistoryYmd) {
        return candidate;
      }
    }

    return "";
  }, [
    availableHistoryDates,
    selectedHistoryYmd,
  ]);

  const canGoPrevious =
    isYMD(previousAvailableDate);

  const canGoNext =
    isYMD(nextAvailableDate);

  const goToHistoryDate = useCallback(
    (nextYmd) => {
      if (!isYMD(nextYmd)) return;
      if (typeof setYmd !== "function") return;
      setYmd(nextYmd);
    },
    [setYmd]
  );`;

replaceExactlyOnce(
  "Lógica do calendário",
  oldCalendarLogic,
  newCalendarLogic
);

const oldPreviousButton = `            <button
              type="button"
              className="pp-btn"
              onClick={() =>
                goToHistoryDate(
                  addDaysYMDLocal(selectedHistoryYmd, -1)
                )
              }
            >
              ◀ Dia anterior
            </button>`;

const newPreviousButton = `            <button
              type="button"
              className="pp-btn"
              disabled={!canGoPrevious}
              onClick={() => {
                if (!canGoPrevious) return;

                goToHistoryDate(
                  previousAvailableDate
                );
              }}
              style={{
                opacity: canGoPrevious
                  ? 1
                  : 0.45,
                cursor: canGoPrevious
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              ◀ Dia anterior
            </button>`;

replaceExactlyOnce(
  "Botão Dia anterior",
  oldPreviousButton,
  newPreviousButton
);

const oldNextButton = `            <button
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
            </button>`;

const newNextButton = `            <button
              type="button"
              className="pp-btn"
              disabled={!canGoNext}
              onClick={() => {
                if (!canGoNext) return;

                goToHistoryDate(
                  nextAvailableDate
                );
              }}
              style={{
                opacity: canGoNext
                  ? 1
                  : 0.45,
                cursor: canGoNext
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              Próximo dia ▶
            </button>`;

replaceExactlyOnce(
  "Botão Próximo dia",
  oldNextButton,
  newNextButton
);

const requiredFragments = [
  "const availableHistoryDates = useMemo(() => {",
  "const previousAvailableDate = useMemo(() => {",
  "const nextAvailableDate = useMemo(() => {",
  "const canGoPrevious =",
  "goToHistoryDate(",
  "previousAvailableDate",
  "nextAvailableDate",
  "disabled={!canGoPrevious}",
  "disabled={!canGoNext}",
];

for (const fragment of requiredFragments) {
  if (!content.includes(fragment)) {
    throw new Error(
      `Validação interna falhou. Trecho ausente: ${fragment}`
    );
  }
}

const forbiddenFragments = [
  "addDaysYMDLocal(selectedHistoryYmd, -1)",
  "addDaysYMDLocal(selectedHistoryYmd, 1)",
];

for (const fragment of forbiddenFragments) {
  if (content.includes(fragment)) {
    throw new Error(
      `A navegação antiga ainda está presente: ${fragment}`
    );
  }
}

fs.writeFileSync(
  target,
  content.replace(/\n/g, eol),
  "utf8"
);

console.log("");
console.log("TOP3-CALENDAR-01A — ALTERAÇÃO APLICADA");
console.log(`Arquivo: ${target}`);
console.log("");
console.log("Comportamento:");
console.log("- Dia anterior: data real anterior com histórico/sorteio.");
console.log("- Próximo dia: data real seguinte com histórico/sorteio.");
console.log("- Dias vazios deixam de ser percorridos pelos botões.");
console.log("- Campo de data continua permitindo seleção manual.");
