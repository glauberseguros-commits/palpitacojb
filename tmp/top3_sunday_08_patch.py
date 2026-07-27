from pathlib import Path
import re
import sys

target = Path(r"src/pages/Top3/Top3View.jsx")
content = target.read_text(encoding="utf-8")

old_pattern = re.compile(
    r'''const timeline = \(Array\.isArray\(timelineTop3\) \? timelineTop3 : \[\]\)\s*
\s*\.slice\(\)\s*
\s*\.sort\(\(a, b\) => \{''',
    re.MULTILINE
)

replacement = '''const timeline = (Array.isArray(timelineTop3) ? timelineTop3 : [])
  .filter((slot) => {
    /*
     * Proteção final da grade dominical do PT_RIO.
     *
     * A partir de 19/07/2026, domingo possui somente 14h e 16h.
     * Remove 09h e 11h mesmo quando documentos antigos ainda
     * estiverem persistidos no histórico/timeline.
     */
    if (String(lotteryKeySafe || "").trim().toUpperCase() !== "PT_RIO") {
      return true;
    }

    const targetYmd = String(slot?.targetYmd || "").trim();
    const targetHour = String(slot?.targetHour || "")
      .trim()
      .replace(/^([0-9]{1,2})$/, "$1:00")
      .padStart(5, "0");

    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(targetYmd)) {
      return true;
    }

    const date = new Date(`${targetYmd}T12:00:00`);
    const isSunday =
      Number.isFinite(date.getTime()) &&
      date.getDay() === 0;

    const isReducedSunday =
      isSunday &&
      targetYmd >= "2026-07-19";

    if (
      isReducedSunday &&
      (targetHour === "09:00" || targetHour === "11:00")
    ) {
      return false;
    }

    return true;
  })
  .slice()
  .sort((a, b) => {'''

updated, count = old_pattern.subn(replacement, content, count=1)

if count != 1:
    print(
        "ERRO: o bloco 'const timeline' não foi localizado "
        f"de forma única. Ocorrências alteradas: {count}"
    )
    sys.exit(1)

checks = {
    "filtro PT_RIO": '!== "PT_RIO"' in updated,
    "corte 19/07/2026": 'targetYmd >= "2026-07-19"' in updated,
    "remove 09h": 'targetHour === "09:00"' in updated,
    "remove 11h": 'targetHour === "11:00"' in updated,
    "somente domingo": "date.getDay() === 0" in updated,
}

failed = [name for name, ok in checks.items() if not ok]

if failed:
    print("ERRO: validações falharam: " + ", ".join(failed))
    sys.exit(1)

target.write_text(updated, encoding="utf-8", newline="\n")

print("PATCH_OK")
for name, ok in checks.items():
    print(f"- {name}: {'OK' if ok else 'FALHOU'}")
