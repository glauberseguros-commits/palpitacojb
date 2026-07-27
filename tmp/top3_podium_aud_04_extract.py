from pathlib import Path
import re
import sys
from datetime import datetime

OUT = Path(r"tmp/top3_podium_aud_04_compacto.txt")

FILES = [
    Path(r"src/pages/Top3/top3.firestore.js"),
    Path(r"src/pages/Top3/Top3View.jsx"),
    Path(r"src/pages/Top3/top3.engine.js"),
    Path(r"src/pages/Top3/top3.storage.js"),
    Path(r"src/pages/Top3/modules/top3.timeline.js"),
]

KEYWORDS = [
    "analyzeSnapshotHit",
    "analyzeTop3Hit",
    "extractPrize1",
    "extractPrize1Milhar",
    "extractResultMilhar",
    "getSlotResultGrupo",
    "hasOfficialResult",
    "reconcileTop3PredictionDay",
    "reconcilePendingTop3Log",
    "pickPrize1GrupoFromDraw",
    "loadTop3PredictionDay",
    "saveTop3PredictionSnapshot",
    "historySummary",
    "historyRows",
    "hitMark",
    "hitType",
    "hitScore",
    "hitPosition",
    "matchedValue",
    "resultGrupo",
    "resultMilhar",
    "resultAnimal",
]

FUNCTION_NAME_RE = re.compile(
    r"""
    (?:
        export\s+
    )?
    (?:
        async\s+
    )?
    function\s+
    (?P<name>[A-Za-z_$][A-Za-z0-9_$]*)
    \s*\(
    """,
    re.VERBOSE,
)

ARROW_NAME_RE = re.compile(
    r"""
    (?:
        const|let|var
    )
    \s+
    (?P<name>[A-Za-z_$][A-Za-z0-9_$]*)
    \s*=\s*
    (?:
        async\s*
    )?
    \(?
    [^=;\n]*?
    \)?
    \s*=>\s*\{
    """,
    re.VERBOSE,
)


def numbered(lines, start_line=1):
    width = len(str(start_line + len(lines)))
    return "\n".join(
        f"{start_line + i:>{width}} | {line}"
        for i, line in enumerate(lines)
    )


def find_matching_brace(text, opening_index):
    depth = 0
    quote = None
    escape = False
    template_expr_depth = 0
    i = opening_index

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif quote == "`" and ch == "$" and nxt == "{":
                template_expr_depth += 1
                i += 1
            elif quote == "`" and ch == "}" and template_expr_depth > 0:
                template_expr_depth -= 1
            elif ch == quote and template_expr_depth == 0:
                quote = None

            i += 1
            continue

        if ch in ("'", '"', "`"):
            quote = ch
            i += 1
            continue

        if ch == "/" and nxt == "/":
            newline = text.find("\n", i + 2)
            if newline == -1:
                return -1
            i = newline + 1
            continue

        if ch == "/" and nxt == "*":
            end = text.find("*/", i + 2)
            if end == -1:
                return -1
            i = end + 2
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1

            if depth == 0:
                return i

        i += 1

    return -1


def extract_named_blocks(path):
    text = path.read_text(encoding="utf-8")
    blocks = []
    seen_ranges = set()

    patterns = [FUNCTION_NAME_RE, ARROW_NAME_RE]

    for pattern in patterns:
        for match in pattern.finditer(text):
            name = match.group("name")

            if not any(
                keyword.lower() in name.lower()
                or name.lower() in keyword.lower()
                for keyword in KEYWORDS
            ):
                continue

            opening = text.find("{", match.start(), match.end() + 20)

            if opening == -1:
                continue

            closing = find_matching_brace(text, opening)

            if closing == -1:
                continue

            start = match.start()
            end = closing + 1
            key = (start, end)

            if key in seen_ranges:
                continue

            seen_ranges.add(key)

            start_line = text.count("\n", 0, start) + 1
            block_text = text[start:end]
            blocks.append((start_line, name, block_text))

    return sorted(blocks, key=lambda item: item[0])


def extract_contexts(path, radius=10):
    lines = path.read_text(encoding="utf-8").splitlines()
    ranges = []

    for index, line in enumerate(lines):
        if any(keyword.lower() in line.lower() for keyword in KEYWORDS):
            start = max(0, index - radius)
            end = min(len(lines), index + radius + 1)
            ranges.append((start, end))

    if not ranges:
        return []

    merged = []

    for start, end in sorted(ranges):
        if not merged or start > merged[-1][1] + 2:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)

    return [
        (
            start + 1,
            "\n".join(lines[start:end]),
        )
        for start, end in merged
    ]


def main():
    missing = [str(path) for path in FILES if not path.exists()]

    existing = [path for path in FILES if path.exists()]

    if not existing:
        raise RuntimeError(
            "Nenhum dos arquivos-alvo foi localizado."
        )

    output = []

    output.append(
        "=" * 100
    )
    output.append(
        "TOP3-PODIUM-AUD-04 — EXTRAÇÃO COMPACTA DOS BLOCOS REAIS"
    )
    output.append(
        "=" * 100
    )
    output.append(
        f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
    )
    output.append("")
    output.append(
        "Objetivo: obter os blocos reais necessários para corrigir a validação do pódio."
    )
    output.append(
        "Código alterado: NÃO"
    )

    if missing:
        output.append("")
        output.append("ARQUIVOS NÃO LOCALIZADOS:")
        for item in missing:
            output.append(f"- {item}")

    total_blocks = 0

    for path in existing:
        output.append("")
        output.append("=" * 100)
        output.append(f"ARQUIVO: {path}")
        output.append("=" * 100)

        blocks = extract_named_blocks(path)

        if blocks:
            output.append("")
            output.append("FUNÇÕES RELEVANTES COMPLETAS")
            output.append("-" * 100)

            for start_line, name, block_text in blocks:
                total_blocks += 1
                output.append("")
                output.append(
                    f"FUNÇÃO: {name} | LINHA INICIAL: {start_line}"
                )
                output.append("-" * 100)
                output.append(
                    numbered(
                        block_text.splitlines(),
                        start_line
                    )
                )
        else:
            output.append("")
            output.append(
                "Nenhuma função nomeada relevante foi encontrada automaticamente."
            )

        contexts = extract_contexts(path, radius=8)

        if contexts:
            output.append("")
            output.append("CONTEXTOS RELEVANTES")
            output.append("-" * 100)

            for start_line, context_text in contexts:
                output.append("")
                output.append(
                    f"CONTEXTO A PARTIR DA LINHA: {start_line}"
                )
                output.append("-" * 100)
                output.append(
                    numbered(
                        context_text.splitlines(),
                        start_line
                    )
                )

    output.append("")
    output.append("=" * 100)
    output.append("RESUMO")
    output.append("=" * 100)
    output.append(f"Arquivos analisados: {len(existing)}")
    output.append(f"Funções completas extraídas: {total_blocks}")
    output.append("Código alterado: NÃO")
    output.append("Status: OK")
    output.append("=" * 100)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "\n".join(output),
        encoding="utf-8"
    )

    print(f"STATUS=OK")
    print(f"ARQUIVOS_ANALISADOS={len(existing)}")
    print(f"FUNCOES_EXTRAIDAS={total_blocks}")
    print(f"RELATORIO={OUT}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"STATUS=ERRO")
        print(str(error))
        sys.exit(1)
