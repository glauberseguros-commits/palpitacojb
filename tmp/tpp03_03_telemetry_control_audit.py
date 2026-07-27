from pathlib import Path
import re

SOURCE = Path("backend/scripts/backtestTop3Official.js")
OUTPUT = Path("tmp/tpp03_03_telemetry_control_audit.txt")

text = SOURCE.read_text(
    encoding="utf-8",
    errors="replace",
)

lines = text.splitlines()

terms = [
    "telemetry",
    "telemetryCases",
    "schemaVersion",
    "cases:",
    "options.",
    "include",
    "enabled",
    "diagnostic",
    "debug",
    "trace",
    "caseNumber",
]

matching_lines = []

for index, line in enumerate(lines, start=1):
    normalized = line.lower()

    matched = [
        term
        for term in terms
        if term.lower() in normalized
    ]

    if matched:
        matching_lines.append(
            {
                "line": index,
                "text": line,
                "terms": matched,
            }
        )

ranges = []

for item in matching_lines:
    start = max(1, item["line"] - 12)
    end = min(len(lines), item["line"] + 18)

    ranges.append((start, end))

merged = []

for start, end in sorted(ranges):
    if not merged:
        merged.append([start, end])
        continue

    previous = merged[-1]

    if start <= previous[1] + 3:
        previous[1] = max(previous[1], end)
    else:
        merged.append([start, end])

option_candidates = []

patterns = [
    r"options\?\.([A-Za-z_$][A-Za-z0-9_$]*)",
    r"options\.([A-Za-z_$][A-Za-z0-9_$]*)",
    r"\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=",
]

for index, line in enumerate(lines, start=1):
    if "telemetr" not in line.lower():
        continue

    context_start = max(0, index - 15)
    context_end = min(len(lines), index + 15)

    context = "\n".join(
        lines[context_start:context_end]
    )

    for pattern in patterns:
        for match in re.finditer(pattern, context):
            option_candidates.append(
                match.group(1)
            )

option_candidates = sorted(
    set(option_candidates)
)

report = []

report.append(
    "=" * 110
)

report.append(
    "TPP-03.03 - AUDITORIA DO CONTROLE DE TELEMETRIA"
)

report.append(
    "=" * 110
)

report.append("")
report.append(f"Arquivo: {SOURCE.resolve()}")
report.append(f"Total de linhas: {len(lines)}")

report.append("")
report.append(
    "-" * 110
)

report.append(
    "POSSÍVEIS OPÇÕES LOCALIZADAS PRÓXIMAS À TELEMETRIA"
)

report.append(
    "-" * 110
)

if option_candidates:
    for candidate in option_candidates:
        report.append(f"- {candidate}")
else:
    report.append(
        "Nenhuma opção pôde ser inferida automaticamente."
    )

report.append("")
report.append(
    "-" * 110
)

report.append(
    "BLOCOS DE CÓDIGO RELACIONADOS À TELEMETRIA"
)

report.append(
    "-" * 110
)

for block_number, (start, end) in enumerate(
    merged,
    start=1,
):
    report.append("")
    report.append(
        f"### BLOCO {block_number} — LINHAS {start} A {end}"
    )

    for line_number in range(start, end + 1):
        report.append(
            f"{line_number:5d} | {lines[line_number - 1]}"
        )

report.append("")
report.append(
    "-" * 110
)

report.append(
    "LINHAS EXATAS COM TERMOS RELEVANTES"
)

report.append(
    "-" * 110
)

for item in matching_lines:
    report.append(
        f"{item['line']:5d} | {item['text']}"
    )

report.append("")
report.append(
    "-" * 110
)

report.append(
    "OBJETIVO DA PRÓXIMA ETAPA"
)

report.append(
    "-" * 110
)

report.append(
    "Identificar a opção oficial que ativa telemetry.cases, sem alterar o motor Top3."
)

report.append(
    "Depois disso, executar A00, A01 e A02 com telemetria habilitada e comparar os mesmos 500 casos."
)

report.append("")
report.append("Nenhuma alteração realizada.")
report.append("Nenhum commit.")
report.append("Nenhum deploy.")
report.append("Produção inalterada.")

report.append(
    "=" * 110
)

OUTPUT.write_text(
    "\n".join(report),
    encoding="utf-8",
)

print("\n".join(report))
