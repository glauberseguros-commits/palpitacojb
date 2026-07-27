"use strict";

const fs = require("fs");

const target = "src/pages/Top3/Top3View.jsx";

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo não encontrado: ${target}`);
}

const original = fs.readFileSync(target, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";

let content = original.replace(/\r\n/g, "\n");

function fail(message) {
  throw new Error(message);
}

function replaceRange(start, end, replacement) {
  content =
    content.slice(0, start) +
    replacement +
    content.slice(end);
}

function findUnique(label, needle) {
  const first = content.indexOf(needle);

  if (first < 0) {
    fail(`${label}: marcador não encontrado.`);
  }

  const second = content.indexOf(
    needle,
    first + needle.length
  );

  if (second >= 0) {
    fail(`${label}: marcador duplicado.`);
  }

  return first;
}

function replaceButtonByVisibleLabel(
  label,
  visibleText,
  replacement
) {
  const textIndex = findUnique(
    `${label} — texto`,
    visibleText
  );

  const buttonStart = content.lastIndexOf(
    "<button",
    textIndex
  );

  if (buttonStart < 0) {
    fail(`${label}: abertura <button não encontrada.`);
  }

  const buttonEndTag = content.indexOf(
    "</button>",
    textIndex
  );

  if (buttonEndTag < 0) {
    fail(`${label}: fechamento </button> não encontrado.`);
  }

  const buttonEnd =
    buttonEndTag + "</button>".length;

  const existingBlock = content.slice(
    buttonStart,
    buttonEnd
  );

  if (!existingBlock.includes(visibleText)) {
    fail(
      `${label}: o botão localizado não contém o texto esperado.`
    );
  }

  replaceRange(
    buttonStart,
    buttonEnd,
    replacement
  );
}

/*
 * 1. Substitui toda a lógica local do calendário.
 */

const calendarStartMarker =
  "  const todayForCalendar = todayYMDLocalView();";

const calendarEndMarker =
  "  return (\n";

const calendarStart = findUnique(
  "Início da lógica do calendário",
  calendarStartMarker
);

const calendarReturn = content.indexOf(
  calendarEndMarker,
  calendarStart
);

if (calendarReturn < 0) {
  fail(
    "Fim da lógica do calendário: marcador return não encontrado."
  );
}

const currentCalendarBlock = content.slice(
  calendarStart,
  calendarReturn
);

if (
  !currentCalendarBlock.includes(
    "const selectedHistoryYmd"
  ) ||
  !currentCalendarBlock.includes(
    "const goToHistoryDate = useCallback"
  )
) {
  fail(
    "O bloco localizado não corresponde à lógica esperada do calendário."
  );
}

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

      const hasAvailableResult =
        hasOfficialResult(slot) ||
        status === "validated";

      if (
        isYMD(targetYmd) &&
        targetYmd <= todayForCalendar &&
        hasAvailableResult
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
      let index =
        availableHistoryDates.length - 1;
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
  );

`;

replaceRange(
  calendarStart,
  calendarReturn,
  newCalendarLogic
);

/*
 * 2. Substitui o botão Dia anterior pelo texto visível.
 */

const newPreviousButton = `<button
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

replaceButtonByVisibleLabel(
  "Botão Dia anterior",
  "◀ Dia anterior",
  newPreviousButton
);

/*
 * 3. Substitui o botão Próximo dia pelo texto visível.
 */

const newNextButton = `<button
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

replaceButtonByVisibleLabel(
  "Botão Próximo dia",
  "Próximo dia ▶",
  newNextButton
);

/*
 * 4. Validações antes da gravação.
 */

const requiredFragments = [
  "const availableHistoryDates = useMemo(() => {",
  "const previousAvailableDate = useMemo(() => {",
  "const nextAvailableDate = useMemo(() => {",
  "const canGoPrevious =",
  "const canGoNext =",
  "disabled={!canGoPrevious}",
  "disabled={!canGoNext}",
  "goToHistoryDate(",
  "previousAvailableDate",
  "nextAvailableDate",
];

for (const fragment of requiredFragments) {
  if (!content.includes(fragment)) {
    fail(
      `Validação interna: trecho ausente: ${fragment}`
    );
  }
}

const forbiddenFragments = [
  "addDaysYMDLocal(selectedHistoryYmd, -1)",
  "addDaysYMDLocal(selectedHistoryYmd, 1)",
];

for (const fragment of forbiddenFragments) {
  if (content.includes(fragment)) {
    fail(
      `Validação interna: navegação antiga presente: ${fragment}`
    );
  }
}

const previousButtonCount =
  content.split("◀ Dia anterior").length - 1;

const nextButtonCount =
  content.split("Próximo dia ▶").length - 1;

if (previousButtonCount !== 1) {
  fail(
    `Quantidade inválida de botões anteriores: ${previousButtonCount}`
  );
}

if (nextButtonCount !== 1) {
  fail(
    `Quantidade inválida de botões seguintes: ${nextButtonCount}`
  );
}

fs.writeFileSync(
  target,
  content.replace(/\n/g, eol),
  "utf8"
);

console.log("");
console.log("TOP3-CALENDAR-01C — ALTERAÇÃO APLICADA");
console.log(`Arquivo: ${target}`);
console.log("");
console.log("Navegação configurada:");
console.log("- Dia anterior: data anterior disponível.");
console.log("- Próximo dia: data seguinte disponível.");
console.log("- Dias sem histórico ou resultado são ignorados.");
console.log("- Seleção manual pelo calendário permanece disponível.");
