from pathlib import Path
import re
import sys

sys.stdout.reconfigure(
    encoding="utf-8",
    errors="replace",
)

ROOT = Path(".")
OUTPUT = Path(
    "tmp/tpp04_04b_layer_first_builder.txt"
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
    ".git",
    "build",
    "dist",
    "coverage",
    "tmp",
    ".next",
    "__snapshots__",
    "analise_concorrente_aps",
    "_BACKUPS_OLD",
}

PATTERNS = [
    (
        "layer.first",
        re.compile(
            r"\blayer\s*\.\s*first\b",
            re.IGNORECASE,
        ),
    ),
    (
        "first: new Map",
        re.compile(
            r"\bfirst\s*:\s*new\s+Map\s*\(",
            re.IGNORECASE,
        ),
    ),
    (
        "first.set",
        re.compile(
            r"\bfirst\s*\.\s*set\s*\(",
            re.IGNORECASE,
        ),
    ),
    (
        "first.get",
        re.compile(
            r"\bfirst\s*\.\s*get\s*\(",
            re.IGNORECASE,
        ),
    ),
    (
        "prizePresence",
        re.compile(
            r"\bprizePresence\b",
            re.IGNORECASE,
        ),
    ),
    (
        "layers.push",
        re.compile(
            r"\blayers\s*\.\s*push\s*\(",
            re.IGNORECASE,
        ),
    ),
    (
        "layers declaration",
        re.compile(
            r"\b(?:const|let|var)\s+layers\s*=",
            re.IGNORECASE,
        ),
    ),
    (
        "layer declaration",
        re.compile(
            r"\b(?:const|let|var)\s+layer\s*=",
            re.IGNORECASE,
        ),
    ),
    (
        "firstCount",
        re.compile(
            r"\bfirstCount\b",
            re.IGNORECASE,
        ),
    ),
]

PRIORITY_PATHS = (
    "src/pages/Top3/top3.engine.js",
    "src/services/statsSignals.js",
    "src/pages/Top3/modules/",
    "backend/engine/",
)

def normalize_path(path: Path) -> str:
    return str(path).replace("\\", "/")

def is_allowed(path: Path) -> bool:
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False

    lowered = {
        part.lower()
        for part in path.parts
    }

    return not any(
        excluded.lower() in lowered
        for excluded in EXCLUDED_PARTS
    )

files = sorted(
    path
    for path in ROOT.rglob("*")
    if path.is_file() and is_allowed(path)
)

results = []

for path in files:
    try:
        lines = path.read_text(
            encoding="utf-8",
            errors="replace",
        ).splitlines()
    except Exception:
        continue

    path_text = normalize_path(path)

    matches = []

    for index, line in enumerate(
        lines,
        start=1,
    ):
        found = [
            label
            for label, pattern in PATTERNS
            if pattern.search(line)
        ]

        if not found:
            continue

        priority = 0

        if any(
            path_text.startswith(prefix)
            for prefix in PRIORITY_PATHS
        ):
            priority += 100

        if "layer.first" in found:
            priority += 80

        if "first: new Map" in found:
            priority += 70

        if "first.set" in found:
            priority += 70

        if "prizePresence" in found:
            priority += 60

        if "layers.push" in found:
            priority += 40

        if "layer declaration" in found:
            priority += 30

        if "firstCount" in found:
            priority += 20

        matches.append({
            "line": index,
            "patterns": found,
            "priority": priority,
        })

    if not matches:
        continue

    results.append({
        "path": path,
        "path_text": path_text,
        "lines": lines,
        "matches": matches,
        "priority": max(
            item["priority"]
            for item in matches
        ),
    })

results.sort(
    key=lambda item: (
        -item["priority"],
        item["path_text"],
    )
)

report = []

report.append("=" * 118)
report.append(
    "TPP-04.04B - ORIGEM REAL DE layer.first"
)
report.append("=" * 118)
report.append("")
report.append(
    f"Arquivos examinados: {len(files)}"
)
report.append(
    f"Arquivos relevantes: {len(results)}"
)
report.append("")

for file_index, item in enumerate(
    results,
    start=1,
):
    lines = item["lines"]
    matches = item["matches"]

    report.append("-" * 118)
    report.append(
        f"ARQUIVO {file_index}: {item['path_text']}"
    )
    report.append("-" * 118)

    all_patterns = sorted({
        pattern
        for match in matches
        for pattern in match["patterns"]
    })

    report.append(
        "PADRÕES: " + ", ".join(all_patterns)
    )
    report.append("")

    ranges = []

    for match in matches:
        before = 20
        after = 35

        if match["priority"] >= 100:
            before = 45
            after = 80

        start = max(
            1,
            match["line"] - before,
        )

        end = min(
            len(lines),
            match["line"] + after,
        )

        ranges.append(
            [start, end]
        )

    merged_ranges = []

    for start, end in sorted(ranges):
        if not merged_ranges:
            merged_ranges.append(
                [start, end]
            )
            continue

        previous = merged_ranges[-1]

        if start <= previous[1] + 5:
            previous[1] = max(
                previous[1],
                end,
            )
        else:
            merged_ranges.append(
                [start, end]
            )

    hit_lines = {
        match["line"]
        for match in matches
    }

    for block_index, (
        start,
        end,
    ) in enumerate(
        merged_ranges,
        start=1,
    ):
        report.append(
            f"### BLOCO {block_index} — "
            f"LINHAS {start} A {end}"
        )

        for line_number in range(
            start,
            end + 1,
        ):
            marker = (
                ">>"
                if line_number in hit_lines
                else "  "
            )

            report.append(
                f"{marker} {line_number:5d} | "
                f"{lines[line_number - 1]}"
            )

        report.append("")

report.append("=" * 118)
report.append(
    "RESUMO DIRETO"
)
report.append("=" * 118)
report.append("")

for label, _ in PATTERNS:
    occurrences = []

    for item in results:
        for match in item["matches"]:
            if label not in match["patterns"]:
                continue

            occurrences.append(
                (
                    item["path_text"],
                    match["line"],
                    item["lines"][
                        match["line"] - 1
                    ].strip(),
                )
            )

    if not occurrences:
        continue

    report.append(
        f"{label}: {len(occurrences)} ocorrência(s)"
    )

    for path_text, line_number, line in occurrences:
        report.append(
            f"  - {path_text}:{line_number}"
        )
        report.append(
            f"    {line}"
        )

    report.append("")

report.append("=" * 118)
report.append(
    "CRITÉRIO DE CONCLUSÃO"
)
report.append("=" * 118)
report.append("")
report.append(
    "O relatório deve permitir identificar:"
)
report.append(
    "1. Onde a propriedade first é criada."
)
report.append(
    "2. Onde first.set(...) incrementa os grupos."
)
report.append(
    "3. Como a camada dow seleciona os registros históricos."
)
report.append(
    "4. Se há filtro simultâneo de horário."
)
report.append(
    "5. Se o grupo é normalizado corretamente."
)
report.append(
    "6. Por que o Camelo retorna zero no Top3."
)
report.append("")
report.append(
    "Nenhum arquivo funcional alterado."
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
report.append("=" * 118)

OUTPUT.write_text(
    "\n".join(report),
    encoding="utf-8",
)

print(
    f"Relatório gravado: {OUTPUT}"
)
print(
    f"Tamanho: {OUTPUT.stat().st_size} bytes"
)
print(
    f"Arquivos relevantes: {len(results)}"
)
