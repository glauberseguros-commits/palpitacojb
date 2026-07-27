from pathlib import Path
import re

ROOT = Path(".")

OUTPUT = Path(
    "tmp/tpp04_01_camelo_weekday_divergence.txt"
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

PREFERRED_PREFIXES = (
    "src/",
    "backend/",
)

SEARCH_TERMS = [
    # Textos visíveis no Top3
    "DIA DA SEMANA",
    "Dia da semana",
    "em 1º",
    "em 1°",
    "em 1:",
    "0x",

    # Evidência/contexto
    "weekday",
    "dayOfWeek",
    "diaSemana",
    "diaDaSemana",
    "getDowKey",
    "dowKey",
    "weekdayEvidence",
    "buildWeekday",
    "weekDay",

    # Posição e prêmio
    "position",
    "posição",
    "posicao",
    "prizePos",
    "guessPrizePos",
    "pickPrize1Grupo",
    "primeiroPremio",
    "firstPrize",

    # Grupo/animal
    "actualGroup",
    "previousGroup",
    "targetGroup",
    "grupo",
    "animal",

    # Dashboard
    "Quantidade de Aparições",
    "Aparições por Posição",
    "Qtde de Apar",
    "filterWeekday",
    "selectedWeekday",
    "selectedAnimal",
    "selectedPosition",

    # Sábado
    "Sábado",
    "Sabado",
    "Saturday",
]

HIGH_PRIORITY_TERMS = {
    "DIA DA SEMANA",
    "Dia da semana",
    "em 1º",
    "em 1°",
    "Quantidade de Aparições",
    "Aparições por Posição",
    "selectedWeekday",
    "selectedAnimal",
    "selectedPosition",
    "weekdayEvidence",
    "buildWeekday",
}

def normalize_path(path: Path) -> str:
    return str(path).replace("\\", "/")

def allowed(path: Path) -> bool:
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False

    lowered_parts = {
        part.lower()
        for part in path.parts
    }

    if any(
        excluded.lower() in lowered_parts
        for excluded in EXCLUDED_PARTS
    ):
        return False

    normalized = normalize_path(path)

    return normalized.startswith(
        PREFERRED_PREFIXES
    )

files = sorted(
    path
    for path in ROOT.rglob("*")
    if path.is_file() and allowed(path)
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

    for number, line in enumerate(
        lines,
        start=1,
    ):
        lowered = line.lower()

        found = [
            term
            for term in SEARCH_TERMS
            if term.lower() in lowered
        ]

        if not found:
            continue

        priority = sum(
            10 if term in HIGH_PRIORITY_TERMS else 1
            for term in found
        )

        path_text = normalize_path(path).lower()

        if "top3" in path_text:
            priority += 8

        if any(
            token in path_text
            for token in (
                "dashboard",
                "home",
                "estat",
                "stat",
                "ranking",
            )
        ):
            priority += 8

        hits.append({
            "line": number,
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

report.append("=" * 118)
report.append(
    "TPP-04.01 - AUDITORIA DA DIVERGÊNCIA CAMELO / SÁBADO / 1º PRÊMIO"
)
report.append("=" * 118)
report.append("")
report.append(
    "DIVERGÊNCIA OBSERVADA"
)
report.append("-" * 118)
report.append(
    "Dashboard: PT_RIO + Sábado + Camelo + posição 1º = 51 ocorrências."
)
report.append(
    "Top3:     PT_RIO + Sábado + Camelo + posição 1º = 0 ocorrências."
)
report.append("")
report.append(
    f"Arquivos examinados: {len(files)}"
)
report.append(
    f"Arquivos relevantes: {len(matches)}"
)
report.append("")

for item_index, item in enumerate(
    matches,
    start=1,
):
    path = item["path"]
    lines = item["lines"]
    hits = item["hits"]

    report.append("-" * 118)
    report.append(
        f"ARQUIVO {item_index}: {normalize_path(path)}"
    )
    report.append("-" * 118)

    unique_terms = sorted({
        term
        for hit in hits
        for term in hit["terms"]
    })

    report.append(
        "TERMOS: " + ", ".join(unique_terms)
    )
    report.append("")

    ranges = []

    for hit in hits:
        context_before = 18
        context_after = 32

        if hit["priority"] >= 10:
            context_before = 30
            context_after = 55

        start = max(
            1,
            hit["line"] - context_before,
        )

        end = min(
            len(lines),
            hit["line"] + context_after,
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

        if start <= previous[1] + 5:
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
            f"### BLOCO {block_number} — LINHAS {start} A {end}"
        )

        for number in range(
            start,
            end + 1,
        ):
            marker = "  "

            if any(
                hit["line"] == number
                for hit in hits
            ):
                marker = ">>"

            report.append(
                f"{marker} {number:5d} | {lines[number - 1]}"
            )

        report.append("")

report.append("=" * 118)
report.append(
    "MAPA DE OCORRÊNCIAS POR TERMO"
)
report.append("=" * 118)
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

    for path, number, text in occurrences:
        report.append(
            f"  - {path}:{number}"
        )
        report.append(
            f"    {text}"
        )

    report.append("")

report.append("=" * 118)
report.append(
    "PONTOS QUE DEVEM SER CONFIRMADOS NO PRÓXIMO PASSO"
)
report.append("=" * 118)
report.append("")
report.append(
    "1. Função exata que monta o texto 'CAMELO (G08) em 1º: 0x'."
)
report.append(
    "2. Campo usado pelo Top3 para identificar sábado."
)
report.append(
    "3. Campo usado pelo Dashboard para identificar sábado."
)
report.append(
    "4. Se ambos usam somente o primeiro prêmio."
)
report.append(
    "5. Se o grupo é comparado como 8, 08, G08 ou nome do animal."
)
report.append(
    "6. Se o histórico usado nas duas páginas possui o mesmo período e quantidade de sorteios."
)
report.append(
    "7. Se o Top3 está recebendo histórico completo ou somente uma janela reduzida."
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
report.append("=" * 118)

content = "\n".join(report)

OUTPUT.write_text(
    content,
    encoding="utf-8",
)

print(content)
