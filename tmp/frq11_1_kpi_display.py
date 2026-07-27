from pathlib import Path

path = Path("src/pages/Statistics/Statistics.jsx")

text = (
    path.read_text(encoding="utf-8")
    .replace("\r\n", "\n")
)

def replace_once(old, new, label):
    global text

    count = text.count(old)

    if count != 1:
        raise SystemExit(
            f"{label}: trecho encontrado {count} vez(es). Esperado: 1."
        )

    text = text.replace(old, new, 1)


# ============================================================================
# 1. CRIA UM VALOR EXCLUSIVO PARA A APRESENTAÇÃO DO QUARTO CARD
# ============================================================================

anchor_old = '''  const fourthKpiValue = isUnseenView
    ? milharUniverse.length
    : mostFrequentLabel;

  const copyRanking = useCallback(async () => {'''

anchor_new = '''  const fourthKpiValue = isUnseenView
    ? milharUniverse.length
    : mostFrequentLabel;

  const fourthKpiDisplayValue = useMemo(() => {
    if (isUnseenView) {
      return formatInteger(fourthKpiValue);
    }

    const rawValue = String(fourthKpiValue);

    if (
      mode === "milhar" &&
      /^\\d{4}$/.test(rawValue) &&
      !rawValue.startsWith("0")
    ) {
      return formatInteger(rawValue);
    }

    return fourthKpiValue;
  }, [
    fourthKpiValue,
    isUnseenView,
    mode,
  ]);

  const copyRanking = useCallback(async () => {'''

replace_once(
    anchor_old,
    anchor_new,
    "Criação do valor de apresentação",
)


# ============================================================================
# 2. SUBSTITUI SOMENTE O CONTEÚDO DO QUARTO CARD
# ============================================================================

card_old = '''              {isUnseenView
                ? formatInteger(fourthKpiValue)
                : mode === "milhar" &&
                  /^\\d{4}$/.test(String(fourthKpiValue)) &&
                  !String(fourthKpiValue).startsWith("0")
                ? formatInteger(fourthKpiValue)
                : fourthKpiValue}'''

card_new = '''              {fourthKpiDisplayValue}'''

replace_once(
    card_old,
    card_new,
    "Renderização do quarto card",
)


path.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("OK - Apenas a apresentação do quarto card foi padronizada.")
