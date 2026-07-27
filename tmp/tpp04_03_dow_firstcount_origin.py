from pathlib import Path
import sys

sys.stdout.reconfigure(
    encoding="utf-8",
    errors="replace",
)

ROOT = Path(".")

OUTPUT = Path(
    "tmp/tpp04_03_dow_firstcount_origin.txt"
)

ALLOWED_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
}

EXCLUDED_PARTS = {
    "node_modules",
    "build",
    "dist",
    "coverage",
    "tmp",
    ".git",
    ".next",
    "__snapshots__",
}

SEARCH_TERMS = [
    "details.dow",
    "details[\"dow\"]",
    "details['dow']",
    "dow:",
    "weekday:",
    "firstCount",
    "top3Count",
    "top5Count",
    "explain:",
    "meta:",
    "detailMap",
    "buildDayContext",
    "buildConditionalLayerDistribution",
    "dowCounts",
    "weekdayCounts",
    "getDowKey",
]

HIGH_PRIORITY = {
    "details.dow",
    "details[\"dow\"]",
    "details['dow']",
    "firstCount",
    "top3Count",
    "dowCounts",
    "weekdayCounts",
}

def normalize_path(path: Path) -> str:
    return str(path).replace("\\", "/")

def is_allowed(path: Path) -> bool:
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False

    lowered_parts = {
        part.lower()
        for part in path.parts
    }

    return not any(
        excluded.lower() in lowered_parts
        for excluded in EXCLUDED_PARTS
    )

files = sorted(
    path
    for path in ROOT.rglob("*")
    if path.is_file() and is_allowed(path)
)

matches = []

for path in files:
    try:
        lines = path.read_text(
            encoding="utf-8",
            errors="replace",
        ).splitlines()
    except Exception:
        continue

    hits = []

    for line_number, line in enumerate(
        lines,
        start=1,
    ):
        lower = line.lower()

        found = [
            term
            for term in SEARCH_TERMS
            if term.lower() in lower
        ]

        if not found:
            continue

        priority = sum(
            10 if term in HIGH_PRIORITY else 1
            for term in found
        )

        normalized_path = normalize_path(path).lower()

        if "top3.engine" in normalized_path:
            priority += 20

        if "statssignals" in normalized_path:
            priority += 15

        if "top3" in normalized_path:
            priority += 8

        hits.append({
            "line": line_number,
            "text": line,
            "terms": found,
            "priority": priority,
        })

    if hits:
        matches.append({
            "path": path,
            "lines": lines,
            "hits": hits,
            "priority": max(
                hit["priority"]
                for hit in hits
            ),
        })

matches.sort(
    key=lambda item: (
        -item["priority"],
        normalize_path(item["path"]),
    )
)

report = []

report.append("=" * 116)
report.append(
    "TPP-04.03 - ORIGEM DE meta.explain.details.dow.firstCount"
)
report.append("=" * 116)
report.append("")
report.append(
    f"Arquivos examinados: {len(files)}"
)
report.append(
    f"Arquivos com ocorrências relevantes: {len(matches)}"
)
report.append("")

for item_index, item in enumerate(
    matches,
    start=1,
):
    path = item["path"]
    lines = item["lines"]
    hits = item["hits"]

    report.append("-" * 116)
    report.append(
        f"ARQUIVO {item_index}: {normalize_path(path)}"
    )
    report.append("-" * 116)

    unique_terms = sorted({
        term
        for hit in hits
        for term in hit["terms"]
    })

    report.append(
        "TERMOS LOCALIZADOS: " +
        ", ".join(unique_terms)
    )
    report.append("")

    ranges = []

    for hit in hits:
        before = 25
        after = 50

        if hit["priority"] >= 20:
            before = 50
            after = 90

        start = max(
            1,
            hit["line"] - before,
        )

        end = min(
            len(lines),
            hit["line"] + after,
        )

        ranges.append(
            [start, end]
        )

    merged = []

    for start, end in sorted(ranges):
        if not merged:
            merged.append(
                [start, end]
            )
            continue

        previous = merged[-1]

        if start <= previous[1] + 8:
            previous[1] = max(
                previous[1],
                end,
            )
        else:
            merged.append(
                [start, end]
            )

    for block_number, (
        start,
        end,
    ) in enumerate(
        merged,
        start=1,
    ):
        report.append(
            f"### BLOCO {block_number} — "
            f"LINHAS {start} A {end}"
        )

        hit_lines = {
            hit["line"]
            for hit in hits
        }

        for number in range(
            start,
            end + 1,
        ):
            marker = (
                ">>"
                if number in hit_lines
                else "  "
            )

            report.append(
                f"{marker} {number:5d} | "
                f"{lines[number - 1]}"
            )

        report.append("")

report.append("=" * 116)
report.append(
    "MAPA RESUMIDO DAS OCORRÊNCIAS"
)
report.append("=" * 116)
report.append("")

for term in SEARCH_TERMS:
    occurrences = []

    for item in matches:
        for hit in item["hits"]:
            if term in hit["terms"]:
                occurrences.append(
                    (
                        normalize_path(item["path"]),
                        hit["line"],
                        hit["text"].strip(),
                    )
                )

    if not occurrences:
        continue

    report.append(
        f"{term}: {len(occurrences)} ocorrência(s)"
    )

    for path, line_number, text in occurrences:
        report.append(
            f"  - {path}:{line_number}"
        )
        report.append(
            f"    {text}"
        )

    report.append("")

report.append("=" * 116)
report.append(
    "OBJETIVO DO PRÓXIMO DIAGNÓSTICO"
)
report.append("=" * 116)
report.append("")
report.append(
    "Confirmar:"
)
report.append(
    "1. Onde details.dow é criado."
)
report.append(
    "2. Qual histórico alimenta firstCount."
)
report.append(
    "3. Qual chave representa sábado."
)
report.append(
    "4. Se a contagem considera somente o 1º prêmio."
)
report.append(
    "5. Se existe filtro indevido de horário ou transição."
)
report.append(
    "6. Se o grupo é comparado como 8, 08 ou G08."
)
report.append(
    "7. Se o período usado é o histórico completo."
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
report.append("=" * 116)

content = "\n".join(report)

OUTPUT.write_text(
    content,
    encoding="utf-8",
)

print(content)
