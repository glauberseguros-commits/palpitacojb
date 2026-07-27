from pathlib import Path

path = Path("src/pages/Statistics/Statistics.jsx")

text = (
    path.read_text(encoding="utf-8")
    .replace("\r\n", "\n")
)

def replace_exact(old, new, label):
    global text

    count = text.count(old)

    if count != 1:
        raise SystemExit(
            f"{label}: trecho encontrado {count} vez(es). Esperado: 1."
        )

    text = text.replace(old, new, 1)


# ============================================================================
# 1. ESTADO DO FEEDBACK
# ============================================================================

state_old = '''  const [rankingView, setRankingView] = useState("frequentes");'''

state_new = '''  const [rankingView, setRankingView] = useState("frequentes");
  const [copyFeedback, setCopyFeedback] = useState(false);'''

replace_exact(
    state_old,
    state_new,
    "Estado copyFeedback",
)


# ============================================================================
# 2. ALERT DE SUCESSO → FEEDBACK NÃO BLOQUEANTE
# ============================================================================

success_old = '''      alert(
        isUnseenView
          ? "Milhares inéditas copiadas."
          : "Ranking copiado."
      );'''

success_new = '''      setCopyFeedback(true);

      window.setTimeout(() => {
        setCopyFeedback(false);
      }, 2200);'''

replace_exact(
    success_old,
    success_new,
    "Substituição do alert de sucesso",
)


# ============================================================================
# 3. BOTÃO COPIAR → COPIADO
# ============================================================================

button_old = '''              <button
                type="button"
                className="ppStatsAnalyze"
                onClick={copyRanking}
              >
                Copiar
              </button>'''

button_new = '''              <button
                type="button"
                className="ppStatsAnalyze"
                onClick={copyRanking}
                aria-live="polite"
              >
                {copyFeedback
                  ? "✓ Copiado"
                  : "Copiar"}
              </button>'''

replace_exact(
    button_old,
    button_new,
    "Botão Copiar",
)


path.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("OK - Feedback de cópia implementado.")
