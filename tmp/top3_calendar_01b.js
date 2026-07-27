"use strict";

const fs = require("fs");

const target = "src/pages/Top3/Top3View.jsx";

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo não encontrado: ${target}`);
}

const original = fs.readFileSync(target, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";

let content = original.replace(/\r\n/g, "\n");

function replaceByRegex(label, regex, replacement) {
  const matches = content.match(regex);

  if (!matches || matches.length !== 1) {
    throw new Error(
      `${label}: esperado exatamente 1 bloco, encontrado ${
        matches ? matches.length : 0
      }.`
    );
  }

  content = content.replace(regex, replacement);
}

const calendarLogicRegex =
  /  const todayForCalendar = todayYMDLocalView\(\);[\s\S]*?  const goToHistoryDate = useCallback\([\s\S]*?    \[setYmd\]\n  \);/g;

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
      const targetYmd = String(
        entry?.targetYmd || ""
      ).trim();

      if (
        isYMD(targetYmd) &&
        targetYmd <= todayForCalendar
      ) {
        dates.add(targetYmd);
      }
    });

    (
      Array.isArray(timeline)
        ? timeline
        : []
    ).forEach((slot) => {
      const targetYmd = String(
        slot?.targetYmd || ""
      ).trim();

      const status = String(
        slot?.status || ""
      )
        .trim()
        .toLowerCase();

      const available =
        hasOfficialResult(slot) ||
        status === "validated";

      if (
        isYMD(targetYmd) &&
        targetYmd <= todayForCalendar &&
        available
      ) {
        dates.add(targetYmd);
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

replaceByRegex(
  "Lógica do calendário",
  calendarLogicRegex,
  newCalendarLogic
);

const previousButtonRegex =
  /            <button\n              type="button"\n              className="pp-btn"\n              onClick=\{\(\) =>\n                goToHistoryDate\(\n                  addDaysYMDLocal\(selectedHistoryYmd, -1\)\n                \)\n              \}\n            >\n              ◀ Dia anterior\n            <\/button>/g;

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

replaceByRegex(
  "Botão Dia anterior",
  previousButtonRegex,
  newPreviousButton
);

const nextButtonRegex =
  /            <button\n              type="button"\n              className="pp-btn"\n              disabled=\{!canGoNext\}\n              onClick=\{\(\) => \{\n                if \(!canGoNext\) return;\n\n                goToHistoryDate\(\n                  addDaysYMDLocal\(selectedHistoryYmd, 1\)\n                \);\n              \}\}\n              style=\{\{\n                opacity: canGoNext \? 1 : 0\.45,\n                cursor: canGoNext \? "pointer" : "not-allowed",\n              \}\}\n            >\n              Próximo dia ▶\n            <\/button>/g;

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

replaceByRegex(
  "Botão Próximo dia",
  nextButtonRegex,
  newNextButton
);

const requiredFragments = [
  "const availableHistoryDates = useMemo(() => {",
  "const previousAvailableDate = useMemo(() => {",
  "const nextAvailableDate = useMemo(() => {",
  "const canGoPrevious =",
  "disabled={!canGoPrevious}",
  "goToHistoryDate(",
  "previousAvailableDate",
  "nextAvailableDate",
];

for (const fragment of requiredFragments) {
  if (!content.includes(fragment)) {
    throw new Error(
      `Validação falhou. Trecho ausente: ${fragment}`
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
      `Navegação antiga ainda presente: ${fragment}`
    );
  }
}

fs.writeFileSync(
  target,
  content.replace(/\n/g, eol),
  "utf8"
);

console.log("");
console.log("TOP3-CALENDAR-01B — ALTERAÇÃO APLICADA");
console.log(`Arquivo: ${target}`);
console.log("");
console.log("Dia anterior:");
console.log("- abre a data anterior existente no histórico.");
console.log("");
console.log("Próximo dia:");
console.log("- abre a próxima data existente no histórico.");
console.log("");
console.log("Dias sem sorteio deixam de ser percorridos.");
