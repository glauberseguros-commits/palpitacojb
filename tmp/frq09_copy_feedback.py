from pathlib import Path
import re

path = Path("src/pages/Statistics/Statistics.jsx")
text = path.read_text(encoding="utf-8")

def replace_once(pattern, replacement, label, flags=0):
    global text

    new_text, count = re.subn(
        pattern,
        replacement,
        text,
        count=1,
        flags=flags,
    )

    if count != 1:
        raise SystemExit(
            f"{label}: encontrado {count} vez(es). Esperado: 1."
        )

    text = new_text


# ------------------------------------------------------------------
# Estado temporário do botão
# ------------------------------------------------------------------

state_anchor = (
    '  const [rankingView, setRankingView] = '
    'useState("frequentes");'
)

if 'const [copyFeedback, setCopyFeedback]' not in text:
    if state_anchor not in text:
        raise SystemExit(
            "Âncora rankingView não encontrada."
        )

    text = text.replace(
        state_anchor,
        state_anchor
        + '\n'
        + '  const [copyFeedback, setCopyFeedback] = '
        + 'useState(false);',
        1,
    )


# ------------------------------------------------------------------
# Remove o alert de sucesso
# ------------------------------------------------------------------

success_pattern = r'''alert\(\s*
    isUnseenView\s*
    \?\s*"[^"]*"\s*
    :\s*"Ranking copiado\."\s*
\);'''

success_replacement = '''setCopyFeedback(true);

      window.setTimeout(() => {
        setCopyFeedback(false);
      }, 2200);'''

replace_once(
    success_pattern,
    success_replacement,
    "Alert de sucesso",
    flags=re.VERBOSE,
)


# ------------------------------------------------------------------
# Troca o texto do botão Copiar
# ------------------------------------------------------------------

button_pattern = r'''(
    <button
    (?:
        (?!</button>)[\s\S]
    )*?
    onClick=\{copyRanking\}
    (?:
        (?!</button>)[\s\S]
    )*?
    >
)
\s*Copiar\s*
(</button>)'''

button_replacement = r'''\1
                {copyFeedback
                  ? "✓ Copiado"
                  : "Copiar"}
              \2'''

replace_once(
    button_pattern,
    button_replacement,
    "Botão Copiar",
    flags=re.VERBOSE,
)


path.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("OK - Feedback não bloqueante implementado.")
