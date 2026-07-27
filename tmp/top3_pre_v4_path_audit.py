from pathlib import Path
import re
import sys

PROJECT_ROOT = Path.cwd().resolve()
TMP_DIR = PROJECT_ROOT / "tmp"
OUTPUT = TMP_DIR / "TOP3_PRE_V4_PATH_AUDIT.txt"

FILES = {
    "backtest": (
        PROJECT_ROOT
        / "backend"
        / "scripts"
        / "backtestTop3Official.js"
    ),
    "unified": (
        PROJECT_ROOT
        / "backend"
        / "engine"
        / "scoreEngineUnified.js"
    ),
    "score_v2": (
        PROJECT_ROOT
        / "backend"
        / "engine"
        / "scoreEngineV2.js"
    ),
    "top3_engine": (
        PROJECT_ROOT
        / "src"
        / "pages"
        / "Top3"
        / "top3.engine.js"
    ),
    "public_api": (
        PROJECT_ROOT
        / "src"
        / "pages"
        / "Top3"
        / "top3.public-api.js"
    ),
}

def read_text(path: Path) -> str:
    return path.read_text(
        encoding="utf-8",
        errors="replace",
    )

def find_lines(text: str, patterns):
    found = []

    for line_number, line in enumerate(
        text.splitlines(),
        start=1,
    ):
        if any(
            re.search(pattern, line)
            for pattern in patterns
        ):
            found.append(
                (line_number, line.rstrip())
            )

    return found

def extract_commonjs_exports(text: str):
    exports = set()

    direct_patterns = [
        r"\bexports\.([A-Za-z_$][\w$]*)\s*=",
        r"\bmodule\.exports\.([A-Za-z_$][\w$]*)\s*=",
    ]

    for pattern in direct_patterns:
        for match in re.finditer(
            pattern,
            text,
        ):
            exports.add(match.group(1))

    object_match = re.search(
        r"module\.exports\s*=\s*\{(?P<body>.*?)\}",
        text,
        flags=re.DOTALL,
    )

    if object_match:
        body = object_match.group("body")

        for raw_item in body.split(","):
            item = raw_item.strip()

            if not item:
                continue

            item = re.sub(
                r"/\*.*?\*/",
                "",
                item,
                flags=re.DOTALL,
            ).strip()

            item = re.sub(
                r"//.*$",
                "",
                item,
            ).strip()

            if not item:
                continue

            key_match = re.match(
                r"([A-Za-z_$][\w$]*)",
                item,
            )

            if key_match:
                exports.add(key_match.group(1))

    return sorted(exports)

def section(title: str):
    return [
        "",
        "=" * 78,
        title,
        "=" * 78,
    ]

lines = []

lines.append(
    "AUDITORIA PRÉ-V4 — CAMINHOS E PONTOS DE INTEGRAÇÃO"
)
lines.append("")
lines.append(
    f"Raiz confirmada: {PROJECT_ROOT}"
)

lines.extend(
    section(
        "1. ARQUIVOS CONFIRMADOS"
    )
)

for name, path in FILES.items():
    exists = path.is_file()

    lines.append(
        f"{name:<16} | "
        f"{'OK' if exists else 'AUSENTE'} | "
        f"{path}"
    )

    if not exists:
        raise FileNotFoundError(
            f"Arquivo obrigatório ausente: {path}"
        )

contents = {
    name: read_text(path)
    for name, path in FILES.items()
}

lines.extend(
    section(
        "2. EXPORTS IDENTIFICADOS"
    )
)

for name, text in contents.items():
    exports = extract_commonjs_exports(text)

    lines.append("")
    lines.append(
        f"[{name}]"
    )

    if exports:
        for export_name in exports:
            lines.append(
                f"  - {export_name}"
            )
    else:
        lines.append(
            "  Nenhum export CommonJS simples identificado."
        )

lines.extend(
    section(
        "3. PONTO DE INJEÇÃO DO BACKTEST"
    )
)

backtest_patterns = [
    r"dependencies",
    r"computeTop3",
    r"computeStatisticalTop3V3",
    r"runOfficialBacktest",
    r"telemetry",
    r"telemetry\.cases",
]

backtest_hits = find_lines(
    contents["backtest"],
    backtest_patterns,
)

if backtest_hits:
    for line_number, line in backtest_hits:
        lines.append(
            f"{line_number:>5}: {line}"
        )
else:
    lines.append(
        "Nenhum ponto de injeção foi localizado."
    )

lines.extend(
    section(
        "4. FUNÇÕES CENTRAIS DO V3"
    )
)

engine_patterns = [
    r"function\s+computeStatisticalTop3V3",
    r"const\s+computeStatisticalTop3V3",
    r"function\s+scoreRanking",
    r"const\s+scoreRanking",
    r"function\s+scoreItem",
    r"const\s+scoreItem",
    r"function\s+collectEvidence",
    r"const\s+collectEvidence",
    r"module\.exports",
]

for file_key in (
    "unified",
    "top3_engine",
    "public_api",
):
    lines.append("")
    lines.append(
        f"[{file_key}]"
    )

    hits = find_lines(
        contents[file_key],
        engine_patterns,
    )

    if hits:
        for line_number, line in hits:
            lines.append(
                f"{line_number:>5}: {line}"
            )
    else:
        lines.append(
            "  Nenhuma assinatura central localizada."
        )

lines.extend(
    section(
        "5. TELEMETRIA DISPONÍVEL"
    )
)

telemetry_patterns = [
    r"schemaVersion",
    r"telemetry",
    r"cases\.push",
    r"telemetry\.cases",
    r"prediction",
    r"actual",
    r"candidates",
]

telemetry_hits = find_lines(
    contents["backtest"],
    telemetry_patterns,
)

if telemetry_hits:
    for line_number, line in telemetry_hits:
        lines.append(
            f"{line_number:>5}: {line}"
        )
else:
    lines.append(
        "Nenhuma estrutura de telemetria localizada."
    )

lines.extend(
    section(
        "6. POSSÍVEIS NOMES DE ARQUIVO PARA O V4"
    )
)

candidate_paths = [
    (
        PROJECT_ROOT
        / "backend"
        / "engine"
        / "scoreEngineV4Experimental.js"
    ),
    (
        PROJECT_ROOT
        / "backend"
        / "engine"
        / "scoreEngineExperimental.js"
    ),
    (
        PROJECT_ROOT
        / "backend"
        / "engine"
        / "top3V4Experimental.js"
    ),
]

for candidate in candidate_paths:
    relative = candidate.relative_to(
        PROJECT_ROOT
    )

    status = (
        "JÁ EXISTE"
        if candidate.exists()
        else "LIVRE"
    )

    lines.append(
        f"{status:<10} | {relative}"
    )

lines.extend(
    section(
        "7. CONCLUSÃO TÉCNICA"
    )
)

injection_confirmed = bool(
    re.search(
        r"dependencies\.computeTop3",
        contents["backtest"],
    )
    or re.search(
        r"dependencies\s*\.\s*computeTop3",
        contents["backtest"],
    )
    or (
        "dependencies.computeTop3"
        in contents["backtest"]
    )
)

v3_exported = (
    "computeStatisticalTop3V3"
    in extract_commonjs_exports(
        contents["unified"]
    )
)

lines.append(
    "Ponto de injeção localizado: "
    + (
        "SIM"
        if injection_confirmed
        else "REVISAR"
    )
)

lines.append(
    "V3 exportado pelo motor unificado: "
    + (
        "SIM"
        if v3_exported
        else "REVISAR"
    )
)

lines.append(
    "Arquivos obrigatórios confirmados: SIM"
)

lines.append("")
lines.append(
    "Próxima ação permitida após esta auditoria:"
)
lines.append(
    "criar o motor V4 experimental em arquivo isolado,"
)
lines.append(
    "sem substituir ou modificar o V3 oficial."
)

OUTPUT.write_text(
    "\n".join(lines),
    encoding="utf-8",
)

print(
    "\n".join(lines)
)
print("")
print(
    f"Relatório salvo em: {OUTPUT}"
)
