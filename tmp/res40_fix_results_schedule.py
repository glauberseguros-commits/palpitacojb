from pathlib import Path
import sys

target = Path("src/pages/Results/Results.jsx")
text = target.read_text(encoding="utf-8")

old_constants = '''const RJ_09H_START_YMD = "2024-01-05";
const RJ_EXPECTED_HOURS_BASE_DESC = ["21:00", "18:00", "16:00", "14:00", "11:00"];'''

new_constants = '''const RJ_09H_START_YMD = "2024-01-05";
const RJ_SATURDAY_1920_START_YMD = "2026-07-18";

const RJ_EXPECTED_HOURS_REGULAR_DESC = [
  "21:00",
  "18:00",
  "16:00",
  "14:00",
  "11:00",
];

const RJ_EXPECTED_HOURS_WEDNESDAY_DESC = [
  "21:00",
  "16:00",
  "14:00",
  "11:00",
];

const RJ_EXPECTED_HOURS_SUNDAY_DESC = [
  "16:00",
  "14:00",
];'''

old_function = '''function getExpectedRjHoursDesc(ymd) {
  const d = ymdToDateLocal(ymd);
  const dow = d instanceof Date && !Number.isNaN(d.getTime()) ? d.getDay() : -1;

  const out =
    dow === 0
      ? ["16:00", "14:00", "11:00"]
      : [...RJ_EXPECTED_HOURS_BASE_DESC];

  if (isYMD(ymd) && ymd >= RJ_09H_START_YMD) {
    out.push("09:00");
  }

  return out;
}'''

new_function = '''function getExpectedRjHoursDesc(ymd) {
  const d = ymdToDateLocal(ymd);
  const dow =
    d instanceof Date && !Number.isNaN(d.getTime())
      ? d.getDay()
      : -1;

  let out;

  /*
   * Domingo:
   * a PT_RIO possui somente 14h e 16h.
   */
  if (dow === 0) {
    return [...RJ_EXPECTED_HOURS_SUNDAY_DESC];
  }

  /*
   * Quarta-feira:
   * não existe sorteio das 18h.
   */
  if (dow === 3) {
    out = [...RJ_EXPECTED_HOURS_WEDNESDAY_DESC];
  }
  /*
   * Sábado a partir de 18/07/2026:
   * 19:20 substitui o antigo horário das 18h.
   */
  else if (
    dow === 6 &&
    isYMD(ymd) &&
    ymd >= RJ_SATURDAY_1920_START_YMD
  ) {
    out = [
      "21:00",
      "19:20",
      "16:00",
      "14:00",
      "11:00",
    ];
  } else {
    out = [...RJ_EXPECTED_HOURS_REGULAR_DESC];
  }

  if (
    isYMD(ymd) &&
    ymd >= RJ_09H_START_YMD
  ) {
    out.push("09:00");
  }

  return out;
}'''

if text.count(old_constants) != 1:
    print(
        "ERRO: bloco exato das constantes do calendário RJ "
        f"localizado {text.count(old_constants)} vezes."
    )
    sys.exit(1)

if text.count(old_function) != 1:
    print(
        "ERRO: função getExpectedRjHoursDesc exata "
        f"localizada {text.count(old_function)} vezes."
    )
    sys.exit(1)

text = text.replace(
    old_constants,
    new_constants,
    1,
)

text = text.replace(
    old_function,
    new_function,
    1,
)

target.write_text(text, encoding="utf-8")

print("OK: calendário dinâmico da página Resultados corrigido.")
