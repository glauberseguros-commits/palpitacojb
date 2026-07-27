from pathlib import Path
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path("src")

KEYWORDS = [
    "em 1º",
    "em 1°",
    "Dia da semana",
    "weekday",
    "weekDay",
    "diaSemana",
    "diaDaSemana",
    "weekdayHits",
    "weekdayEvidence",
    "buildContextEvidence",
    "buildFrequencyEvidence",
    "buildStatisticalEvidence",
]

report = []

report.append("=" * 100)
report.append("TPP-04.02 - ORIGEM DO CARD 'DIA DA SEMANA'")
report.append("=" * 100)

for file in ROOT.rglob("*"):
    if file.suffix.lower() not in (".js", ".jsx", ".ts", ".tsx"):
        continue

    try:
        lines = file.read_text(
            encoding="utf-8",
            errors="replace"
        ).splitlines()
    except Exception:
        continue

    hits = []

    for i, line in enumerate(lines, start=1):
        lower = line.lower()

        if any(k.lower() in lower for k in KEYWORDS):
            hits.append(i)

    if not hits:
        continue

    report.append("")
    report.append("-" * 100)
    report.append(str(file))
    report.append("-" * 100)

    merged = []

    for h in hits:
        start = max(1, h - 25)
        end = min(len(lines), h + 45)

        if merged and start <= merged[-1][1] + 5:
            merged[-1][1] = max(
                merged[-1][1],
                end
            )
        else:
            merged.append([start, end])

    for block, (start, end) in enumerate(merged, start=1):

        report.append("")
        report.append(
            f"BLOCO {block} ({start}-{end})"
        )

        for n in range(start, end + 1):
            prefix = ">>" if n in hits else "  "

            report.append(
                f"{prefix} {n:5d} | {lines[n-1]}"
            )

report.append("")
report.append("=" * 100)
report.append("FIM")
report.append("=" * 100)

text = "\n".join(report)

Path(
    "tmp/tpp04_02_weekday_card_origin.txt"
).write_text(
    text,
    encoding="utf-8"
)

print(text)
