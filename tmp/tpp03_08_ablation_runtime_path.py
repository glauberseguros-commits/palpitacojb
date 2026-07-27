from pathlib import Path

targets = [
    Path("backend/services/top3.scoreEngineV2.js"),
    Path("backend/services/top3.engine.js"),
    Path("backend/scripts/backtestTop3AblationExperimental.js"),
]

terms = [
    "__TOP3_ABLATION__",
    "getTop3AblationVariant",
    "resolveScoreConfigForAblation",
    "SEM_FREQUENCY",
    "SEM_CONTEXT",
    "BASELINE_COMPLETO",
    "frequency",
    "context",
    "scoreItem",
    "scoreRanking",
    "collectEvidence",
]

report = []

report.append("=" * 110)
report.append("TPP-03.08 - AUDITORIA DO CAMINHO RUNTIME DA ABLAÇÃO")
report.append("=" * 110)

for target in targets:
    report.append("")
    report.append("-" * 110)
    report.append(f"ARQUIVO: {target}")
    report.append("-" * 110)

    if not target.exists():
        report.append("ARQUIVO NÃO ENCONTRADO")
        continue

    lines = target.read_text(
        encoding="utf-8",
        errors="replace",
    ).splitlines()

    hits = []

    for number, line in enumerate(lines, start=1):
        if any(
            term.lower() in line.lower()
            for term in terms
        ):
            hits.append(number)

    if not hits:
        report.append("Nenhum termo relevante localizado.")
        continue

    ranges = []

    for line_number in hits:
        start = max(1, line_number - 15)
        end = min(len(lines), line_number + 25)
        ranges.append((start, end))

    merged = []

    for start, end in sorted(ranges):
        if not merged:
            merged.append([start, end])
            continue

        previous = merged[-1]

        if start <= previous[1] + 3:
            previous[1] = max(
                previous[1],
                end,
            )
        else:
            merged.append([start, end])

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
report.append("-" * 110)
report.append("OBJETIVO")
report.append("-" * 110)
report.append(
    "Confirmar o caminho completo:"
)
report.append(
    "globalThis.__TOP3_ABLATION__ -> getTop3AblationVariant -> "
    "resolveScoreConfigForAblation -> scoreRanking -> scoreItem."
)
report.append("")
report.append(
    "Nenhuma alteração realizada."
)
report.append(
    "Nenhum commit."
)
report.append(
    "Nenhum deploy."
)
report.append(
    "Produção inalterada."
)
report.append("=" * 110)

content = "\n".join(report)

Path(
    "tmp/tpp03_08_ablation_runtime_path.txt"
).write_text(
    content,
    encoding="utf-8",
)

print(content)
