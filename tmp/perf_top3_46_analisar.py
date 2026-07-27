from pathlib import Path
import json
import re
import statistics

work_dir = Path(r"tmp/perf_top3_46_work")
report_path = Path(r"tmp/perf_top3_46_benchmark_original_x_otimizado.txt")

expected = {
    "PT_RIO": "02DFCACF1A50F59DD064246DFC179D12A9C22958990B84D9C38356424C9FBD35",
    "FEDERAL": "5F4267C52469CB43729C63D594A00B0624332B866A0C1A5F0D29DA983B7431A2",
    "LOOK": "D11B6930450A23CECD8F8322D0C9D948396A9F6A7349CB892929C863B200ECAA",
    "NACIONAL": "9F675860326EC008E84D2A1DDE2D48DB99A26EB4BD25383DE4D93A96C1F5463D",
}

def append(text=""):
    with report_path.open("a", encoding="utf-8") as f:
        f.write(str(text) + "\n")

def parse_key_values(path):
    values = {}

    for line in path.read_text(
        encoding="utf-8-sig"
    ).splitlines():
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

    return values

def read_times(version):
    values = []

    for run in range(1, 4):
        timing = work_dir / f"{version}_run_{run}_timing.txt"
        data = parse_key_values(timing)
        values.append(int(data["elapsed_ms"]))

    return values

def parse_signatures(console_path):
    text = console_path.read_text(
        encoding="utf-8-sig",
        errors="replace"
    )

    signatures = {}
    current = None

    for line in text.splitlines():
        heading = re.match(
            r"^===== (PT_RIO|FEDERAL|LOOK|NACIONAL) =====$",
            line.strip()
        )

        if heading:
            current = heading.group(1)
            continue

        signature = re.match(
            r"^Assinatura:\s*([A-Fa-f0-9]{64})$",
            line.strip()
        )

        if signature and current:
            signatures[current] = signature.group(1).upper()
            current = None

    return signatures

original_times = read_times("original")
optimized_times = read_times("optimized")

original_mean = statistics.mean(original_times)
optimized_mean = statistics.mean(optimized_times)

original_median = statistics.median(original_times)
optimized_median = statistics.median(optimized_times)

gain_ms = original_mean - optimized_mean
gain_percent = (
    (gain_ms / original_mean) * 100
    if original_mean
    else 0
)

append("")
append("=" * 100)
append("3. TEMPOS MEDIDOS")
append("=" * 100)

append(
    "Original — execuções: " +
    ", ".join(f"{value} ms" for value in original_times)
)
append(f"Original — média: {original_mean:.2f} ms")
append(f"Original — mediana: {original_median:.2f} ms")
append("")

append(
    "Otimizado — execuções: " +
    ", ".join(f"{value} ms" for value in optimized_times)
)
append(f"Otimizado — média: {optimized_mean:.2f} ms")
append(f"Otimizado — mediana: {optimized_median:.2f} ms")
append("")

append(f"Ganho médio absoluto: {gain_ms:.2f} ms")
append(f"Ganho médio percentual: {gain_percent:.2f}%")

append("")
append("=" * 100)
append("4. VALIDAÇÃO DAS ASSINATURAS")
append("=" * 100)

all_valid = True
all_equal = True

for run in range(1, 4):
    original_log = (
        work_dir /
        f"original_run_{run}_console.txt"
    )

    optimized_log = (
        work_dir /
        f"optimized_run_{run}_console.txt"
    )

    original_signatures = parse_signatures(original_log)
    optimized_signatures = parse_signatures(optimized_log)

    append(f"EXECUÇÃO {run}")

    for lottery in [
        "PT_RIO",
        "FEDERAL",
        "LOOK",
        "NACIONAL",
    ]:
        original = original_signatures.get(lottery)
        optimized = optimized_signatures.get(lottery)
        expected_signature = expected[lottery]

        original_ok = original == expected_signature
        optimized_ok = optimized == expected_signature
        equal = original == optimized

        if not original_ok or not optimized_ok:
            all_valid = False

        if not equal:
            all_equal = False

        append(
            f"{lottery}: "
            f"original={original or 'AUSENTE'} | "
            f"otimizado={optimized or 'AUSENTE'} | "
            f"esperada={'OK' if original_ok and optimized_ok else 'FALHA'} | "
            f"igual={'SIM' if equal else 'NÃO'}"
        )

    append("")

append("=" * 100)
append("5. DECISÃO TÉCNICA")
append("=" * 100)

if not all_valid:
    append(
        "REPROVADO: pelo menos uma assinatura não correspondeu "
        "ao valor determinístico esperado."
    )
elif not all_equal:
    append(
        "REPROVADO: houve divergência entre motor original "
        "e motor otimizado."
    )
elif gain_percent <= 0:
    append(
        "SEM GANHO: as assinaturas são idênticas, mas a versão "
        "otimizada não reduziu o tempo médio."
    )
elif gain_percent < 3:
    append(
        "GANHO PEQUENO: assinaturas idênticas, porém melhoria "
        "inferior a 3%."
    )
else:
    append(
        "APROVADO PARA IMPLANTAÇÃO: assinaturas idênticas e "
        "ganho de desempenho mensurável."
    )

append("")
append(f"Assinaturas válidas: {'SIM' if all_valid else 'NÃO'}")
append(f"Original e otimizado idênticos: {'SIM' if all_equal else 'NÃO'}")
append(f"Ganho médio: {gain_percent:.2f}%")
append("")
append("Motor original restaurado: SIM")
append("Commit criado: NÃO")
append("Push executado: NÃO")
append("Deploy executado: NÃO")
append("Firestore alterado: NÃO")
append("=" * 100)

print("ANALISE_OK")
