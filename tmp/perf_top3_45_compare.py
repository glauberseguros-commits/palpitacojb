from pathlib import Path
import json
import sys
import math

original_dir = Path(r"tmp/perf_top3_45_original")
optimized_dir = Path(r"tmp/perf_top3_45_otimizado")
report_path = Path(r"tmp/perf_top3_45_primeira_divergencia_nacional.txt")

def append(text):
    with report_path.open("a", encoding="utf-8") as f:
        f.write(text + "\n")

def json_files(root):
    return {
        p.relative_to(root).as_posix(): p
        for p in root.rglob("*.json")
    }

def contains_nacional(value):
    if isinstance(value, dict):
        for k, v in value.items():
            if "NACIONAL" in str(k).upper():
                return True
            if contains_nacional(v):
                return True
        return False

    if isinstance(value, list):
        return any(contains_nacional(v) for v in value)

    return "NACIONAL" in str(value).upper()

def equal_numbers(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b

    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if math.isnan(a) and math.isnan(b):
            return True
        return a == b

    return False

def first_diff(a, b, path="$"):
    if type(a) is not type(b):
        if equal_numbers(a, b):
            return None

        return {
            "path": path,
            "reason": "TIPO_DIFERENTE",
            "original_type": type(a).__name__,
            "optimized_type": type(b).__name__,
            "original": a,
            "optimized": b,
        }

    if isinstance(a, dict):
        keys = list(dict.fromkeys([*a.keys(), *b.keys()]))

        for key in keys:
            next_path = f"{path}.{key}"

            if key not in a:
                return {
                    "path": next_path,
                    "reason": "CHAVE_SOMENTE_NO_OTIMIZADO",
                    "original": None,
                    "optimized": b[key],
                }

            if key not in b:
                return {
                    "path": next_path,
                    "reason": "CHAVE_SOMENTE_NO_ORIGINAL",
                    "original": a[key],
                    "optimized": None,
                }

            diff = first_diff(a[key], b[key], next_path)

            if diff:
                return diff

        return None

    if isinstance(a, list):
        if len(a) != len(b):
            return {
                "path": path,
                "reason": "TAMANHO_DIFERENTE",
                "original_length": len(a),
                "optimized_length": len(b),
            }

        for index, (item_a, item_b) in enumerate(zip(a, b)):
            diff = first_diff(
                item_a,
                item_b,
                f"{path}[{index}]"
            )

            if diff:
                return diff

        return None

    if a != b:
        return {
            "path": path,
            "reason": "VALOR_DIFERENTE",
            "original": a,
            "optimized": b,
        }

    return None

original_files = json_files(original_dir)
optimized_files = json_files(optimized_dir)

all_names = sorted(
    set(original_files.keys()) |
    set(optimized_files.keys())
)

append("")
append("=" * 100)
append("2. ARQUIVOS JSON GERADOS")
append("=" * 100)

for name in all_names:
    append(
        f"{name} | original={'SIM' if name in original_files else 'NÃO'} "
        f"| otimizado={'SIM' if name in optimized_files else 'NÃO'}"
    )

candidates = []

for name in all_names:
    if name not in original_files or name not in optimized_files:
        continue

    try:
        original_data = json.loads(
            original_files[name].read_text(encoding="utf-8-sig")
        )

        optimized_data = json.loads(
            optimized_files[name].read_text(encoding="utf-8-sig")
        )
    except Exception as exc:
        append(f"ERRO AO LER {name}: {exc}")
        continue

    if (
        "NACIONAL" in name.upper() or
        contains_nacional(original_data) or
        contains_nacional(optimized_data)
    ):
        candidates.append(
            (name, original_data, optimized_data)
        )

append("")
append("=" * 100)
append("3. PRIMEIRA DIVERGÊNCIA DA NACIONAL")
append("=" * 100)

found = False

for name, original_data, optimized_data in candidates:
    diff = first_diff(
        original_data,
        optimized_data
    )

    if not diff:
        append(f"{name}: IDÊNTICO")
        continue

    found = True

    append(f"ARQUIVO: {name}")
    append(
        json.dumps(
            diff,
            ensure_ascii=False,
            indent=2,
            default=str
        )
    )

    path = diff.get("path", "")

    append("")
    append("CONTEXTO:")
    append(
        "A primeira diferença estrutural foi encontrada no "
        f"caminho JSON: {path}"
    )
    append("")
    break

if not found:
    append(
        "Nenhuma diferença foi localizada nos JSONs identificados "
        "como pertencentes à NACIONAL."
    )
    append(
        "Nesse caso, a assinatura pode estar sendo calculada a partir "
        "de dados não persistidos nos arquivos individuais."
    )

append("")
append("=" * 100)
append("4. RESULTADO OPERACIONAL")
append("=" * 100)
append("Motor original restaurado: SIM")
append("Commit criado: NÃO")
append("Push executado: NÃO")
append("Firestore alterado: NÃO")
append("=" * 100)

print("COMPARACAO_OK")
