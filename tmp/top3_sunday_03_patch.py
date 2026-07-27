from pathlib import Path
import sys

target = Path(r"src/pages/Top3/top3.engine.js")

content = target.read_text(encoding="utf-8")

old = '''export function getPtRioScheduleForYmd(
  ymd,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT
) {
  const dow = getDowKey(ymd);
  if (dow === 0) return PT_RIO_SCHEDULE_SUNDAY;
  if (dow === 3 || dow === 6) return PT_RIO_SCHEDULE_WED_SAT;
  return PT_RIO_SCHEDULE_NORMAL;
}'''

new = '''export function getPtRioScheduleForYmd(
  ymd,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT
) {
  const normalizedYmd = safeStr(ymd);
  const dow = getDowKey(normalizedYmd);

  if (dow === 0) {
    /*
     * Mudança oficial da grade dominical do PT_RIO:
     *
     * - até 18/07/2026: preserva a grade histórica
     *   09h, 11h, 14h e 16h;
     *
     * - a partir de 19/07/2026: somente 14h e 16h.
     *
     * A regra é aplicada por data para não invalidar sorteios,
     * previsões e estatísticas anteriores à mudança.
     */
    if (isYMD(normalizedYmd) && normalizedYmd >= "2026-07-19") {
      return ["14:00", "16:00"];
    }

    return PT_RIO_SCHEDULE_SUNDAY;
  }

  if (dow === 3 || dow === 6) return PT_RIO_SCHEDULE_WED_SAT;

  return PT_RIO_SCHEDULE_NORMAL;
}'''

count = content.count(old)

if count != 1:
    print(f"ERRO: bloco esperado encontrado {count} vez(es). Nenhum arquivo foi alterado.")
    sys.exit(1)

updated = content.replace(old, new, 1)

target.write_text(updated, encoding="utf-8", newline="\n")

checks = {
    "corte temporal": 'normalizedYmd >= "2026-07-19"' in updated,
    "domingo vigente 14h/16h": 'return ["14:00", "16:00"];' in updated,
    "agenda histórica preservada": "return PT_RIO_SCHEDULE_SUNDAY;" in updated,
    "quarta/sábado preservados": "return PT_RIO_SCHEDULE_WED_SAT;" in updated,
}

failed = [name for name, ok in checks.items() if not ok]

if failed:
    print("ERRO: validações internas falharam: " + ", ".join(failed))
    sys.exit(1)

print("PATCH_OK")
print("")
print("Validações:")
for name, ok in checks.items():
    print(f"- {name}: {'OK' if ok else 'FALHOU'}")
