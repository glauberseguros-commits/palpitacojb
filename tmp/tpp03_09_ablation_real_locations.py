from pathlib import Path
import re

ROOT = Path(".")

OUTPUT = Path(
    "tmp/tpp03_09_ablation_real_locations.txt"
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
    "public",
}

SEARCH_TERMS = [
    "__TOP3_ABLATION__",
    "getTop3AblationVariant",
    "resolveScoreConfigForAblation",
    "SEM_FREQUENCY",
    "SEM_CONTEXT",
    "BASELINE_COMPLETO",
    "scoreRanking",
    "scoreItem",
    "collectEvidence",
]

FUNCTION_PATTERNS = [
    re.compile(
        r"\bfunction\s+"
        r"(getTop3AblationVariant|"
        r"resolveScoreConfigForAblation|"
        r"scoreRanking|"
        r"scoreItem|"
        r"collectEvidence)\b"
    ),
    re.compile(
        r"\bconst\s+"
        r"(getTop3AblationVariant|"
        r"resolveScoreConfigForAblation|"
        r"scoreRanking|"
        r"scoreItem|"
        r"collectEvidence)\s*="
    ),
    re.compile(
        r"\b(let|var)\s+"
        r"(getTop3AblationVariant|"
        r"resolveScoreConfigForAblation|"
        r"scoreRanking|"
        r"scoreItem|"
        r"collectEvidence)\s*="
    ),
]

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

    file_hits = []

    for number, line in enumerate(
        lines,
        start=1,
    ):
        matched_terms = [
            term
            for term in SEARCH_TERMS
            if term.lower() in line.lower()
        ]

        if matched_terms:
            file_hits.append({
                "line": number,
                "text": line,
                "terms": matched_terms,
            })

    if file_hits:
        matches.append({
            "path": path,
            "lines": lines,
            "hits": file_hits,
        })

report = []

report.append("=" * 110)
report.append(
    "TPP-03.09 - LOCALIZAÇÃO REAL DO CAMINHO DA ABLAÇÃO"
)
report.append("=" * 110)
report.append("")
report.append(
    f"Arquivos de código examinados: {len(files)}"
)
report.append(
    f"Arquivos com termos relevantes: {len(matches)}"
)
report.append("")

for item in matches:
    path = item["path"]
    lines = item["lines"]
    hits = item["hits"]

    report.append("-" * 110)
    report.append(f"ARQUIVO: {path}")
    report.append("-" * 110)

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
        start = max(
            1,
            hit["line"] - 12,
        )

        end = min(
            len(lines),
            hit["line"] + 20,
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

        if start <= previous[1] + 3:
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

        for number in range(
            start,
            end + 1,
        ):
            report.append(
                f"{number:5d} | "
                f"{lines[number - 1]}"
            )

        report.append("")

report.append("=" * 110)
report.append("RESUMO POR TERMO")
report.append("=" * 110)
report.append("")

for term in SEARCH_TERMS:
    occurrences = []

    for item in matches:
        for hit in item["hits"]:
            if term in hit["terms"]:
                occurrences.append(
                    (
                        str(item["path"]),
                        hit["line"],
                        hit["text"].strip(),
                    )
                )

    report.append(
        f"{term}: {len(occurrences)} ocorrência(s)"
    )

    for path, number, text in occurrences:
        report.append(
            f"  - {path}:{number}"
        )

        report.append(
            f"    {text}"
        )

    report.append("")

report.append("=" * 110)
report.append("DIAGNÓSTICO AUTOMÁTICO")
report.append("=" * 110)
report.append("")

term_locations = {}

for term in SEARCH_TERMS:
    term_locations[term] = []

    for item in matches:
        for hit in item["hits"]:
            if term in hit["terms"]:
                term_locations[term].append(
                    {
                        "path": str(item["path"]),
                        "line": hit["line"],
                    }
                )

critical_terms = [
    "__TOP3_ABLATION__",
    "getTop3AblationVariant",
    "resolveScoreConfigForAblation",
    "scoreRanking",
    "scoreItem",
    "collectEvidence",
]

missing = [
    term
    for term in critical_terms
    if not term_locations[term]
]

if missing:
    report.append(
        "STATUS: CAMINHO AINDA INCOMPLETO"
    )

    report.append(
        "Termos críticos não localizados:"
    )

    for term in missing:
        report.append(
            f"  - {term}"
        )
else:
    report.append(
        "STATUS: TODOS OS TERMOS CRÍTICOS FORAM LOCALIZADOS"
    )

    report.append(
        "Agora será possível auditar o encadeamento real entre os arquivos."
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

OUTPUT.write_text(
    content,
    encoding="utf-8",
)

print(content)
