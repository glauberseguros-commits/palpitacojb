from pathlib import Path
import sys

target = Path("src/pages/Results/Results.jsx")

source = target.read_text(encoding="utf-8")

old = '''  const result = visibleExpectedHours.map((hour) => {
    const found = byHour.get(hour);
    if (found) return found;

    return {
      __placeholder: true,
      __slotHour: hour,
      __placeholderKind: "compact",
      drawId: `placeholder_${scopeKey}_${hour}`,
      id: `placeholder_${scopeKey}_${hour}`,
      close_hour: hour,
      closeHour: hour,
      prizes: [],
    };
  });'''

new = '''  const result = visibleExpectedHours.flatMap((hour) => {
    const found = byHour.get(hour);

    /*
     * O horário das 18h continua pertencendo ao calendário histórico da PT_RIO.
     *
     * Entretanto, a auditoria oficial dos sábados confirmou que, quando não
     * existe resultado real às 18h, o card vazio representa uma ausência
     * legítima de sorteio e não uma falha de importação.
     *
     * Resultados reais continuam sendo exibidos porque a busca por `found`
     * acontece antes desta condição.
     */
    if (found) return [found];

    const selectedDate = ymdToDateLocal(ymd);
    const selectedDow =
      selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())
        ? selectedDate.getDay()
        : -1;

    const isConfirmedSaturday18Absence =
      scopeKey === SCOPE_RJ &&
      selectedDow === 6 &&
      hour === "18:00";

    if (isConfirmedSaturday18Absence) {
      return [];
    }

    return [
      {
        __placeholder: true,
        __slotHour: hour,
        __placeholderKind: "compact",
        drawId: `placeholder_${scopeKey}_${hour}`,
        id: `placeholder_${scopeKey}_${hour}`,
        close_hour: hour,
        closeHour: hour,
        prizes: [],
      },
    ];
  });'''

count = source.count(old)

if count != 1:
    print(
        f"ERRO: bloco esperado encontrado {count} vez(es); esperado: 1.",
        file=sys.stderr,
    )
    sys.exit(1)

updated = source.replace(old, new, 1)

target.write_text(updated, encoding="utf-8", newline="\n")

print("Correção aplicada com sucesso.")
