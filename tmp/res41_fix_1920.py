from pathlib import Path
import sys

target = Path("src/pages/Results/Results.jsx")
text = target.read_text(encoding="utf-8")

old_normalize = '''  const mISO = s.match(/^(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?$/);
  if (mISO) {
    return `${pad2(mISO[1])}:00`;
  }'''

new_normalize = '''  const mISO = s.match(/^(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?$/);
  if (mISO) {
    return `${pad2(mISO[1])}:${pad2(mISO[2])}`;
  }'''

old_badge = '''const hs = displayHour
  ? `${displayHour.slice(0,2)}HS`
  : "—";'''

new_badge = '''const hs = displayHour
  ? displayHour.endsWith(":00")
    ? `${displayHour.slice(0, 2)}HS`
    : `${displayHour.slice(0, 2)}H${displayHour.slice(3, 5)}`
  : "—";'''

if text.count(old_normalize) != 1:
    print(
        "ERRO: bloco de normalizeHourLike localizado "
        f"{text.count(old_normalize)} vezes."
    )
    sys.exit(1)

if text.count(old_badge) != 1:
    print(
        "ERRO: bloco do selo de horário localizado "
        f"{text.count(old_badge)} vezes."
    )
    sys.exit(1)

text = text.replace(
    old_normalize,
    new_normalize,
    1,
)

text = text.replace(
    old_badge,
    new_badge,
    1,
)

target.write_text(text, encoding="utf-8")

print("OK: minutos preservados e selo 19H20 configurado.")
