from pathlib import Path
import sys

p = Path(r"src/pages/Top3/Top3View.jsx")
txt = p.read_text(encoding="utf-8")

old = """const timeline = (Array.isArray(timelineTop3) ? timelineTop3 : [])
  .slice()
  .sort((a, b) => {"""

new = """const timeline = (Array.isArray(timelineTop3) ? timelineTop3 : [])
  .filter((slot) => {
    const ymd = String(slot?.targetYmd || "");
    const hour = String(slot?.targetHour || "");

    if (ymd >= "2026-07-19") {
      const d = new Date(ymd + "T12:00:00");
      if (d.getDay() === 0 && (hour === "09:00" || hour === "11:00")) {
        return false;
      }
    }

    return true;
  })
  .slice()
  .sort((a, b) => {"""

if old not in txt:
    print("ERRO: trecho esperado não encontrado.")
    sys.exit(1)

txt = txt.replace(old, new, 1)

p.write_text(txt, encoding="utf-8", newline="\n")

print("PATCH_OK")
