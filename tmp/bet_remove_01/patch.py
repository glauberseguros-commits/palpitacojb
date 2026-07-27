from pathlib import Path
import sys

top3_path = Path(r"src/pages/Top3/Top3View.jsx")
centenas_path = Path(r"src/pages/Centenas/CentenasView.jsx")

top3 = top3_path.read_text(encoding="utf-8")
centenas = centenas_path.read_text(encoding="utf-8")

# ======================================================================================
# TOP3
# ======================================================================================

top3_old = '''        <div
          className="top3-card__actions"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div aria-hidden="true"></div>
          <div aria-hidden="true"></div>

          <button
            type="button"
            onClick={doCopyAll}
            className="pp-btn"
            title="Copiar as 20 milhares"
            style={{ width: "100%" }}
          >
            {copiedAllKey === key ? "✅ Copiado" : "📋 Copiar"}
          </button>

          <button
            type="button"
            className="pp-btn"
            title="Integração automática com banca (em desenvolvimento)"
            onClick={() => {
              alert("Em breve você poderá enviar automaticamente estas milhares para a banca.");
            }}
            style={{ width: "100%" }}
          >
            🎯 Apostar
          </button>
        </div>'''

top3_new = '''        <div
          className="top3-card__actions"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={doCopyAll}
            className="pp-btn"
            title="Copiar as 20 milhares"
          >
            {copiedAllKey === key ? "✅ Copiado" : "📋 Copiar"}
          </button>
        </div>'''

if top3.count(top3_old) != 1:
    raise SystemExit(
        f"ERRO TOP3: bloco Apostar encontrado {top3.count(top3_old)} vez(es); esperado=1."
    )

top3 = top3.replace(top3_old, top3_new, 1)

# ======================================================================================
# CENTENAS+
# ======================================================================================

king_helper_start = centenas.find("function buildKingGuessUrlFromPalpites(")
king_helper_end_marker = "\nexport default function CentenasView()"

if king_helper_start < 0:
    raise SystemExit("ERRO CENTENAS: buildKingGuessUrlFromPalpites não encontrada.")

king_helper_end = centenas.find(king_helper_end_marker, king_helper_start)

if king_helper_end < 0:
    raise SystemExit("ERRO CENTENAS: final do helper King não localizado.")

centenas = (
    centenas[:king_helper_start]
    + centenas[king_helper_end + 1:]
)

king_states = '''  const [kingModalOpen, setKingModalOpen] = useState(false);
  const [kingText, setKingText] = useState("");
  const [kingCopyOk, setKingCopyOk] = useState(false);
  const [kingUrl, setKingUrl] = useState("");

'''

if centenas.count(king_states) != 1:
    raise SystemExit(
        f"ERRO CENTENAS: estados do modal encontrados {centenas.count(king_states)} vez(es); esperado=1."
    )

centenas = centenas.replace(king_states, "", 1)

sending_state = '''  const [sendingKing, setSendingKing] = useState(false);
  const [copiedMilhares, setCopiedMilhares] = useState(false);
'''

sending_replacement = '''  const [copiedMilhares, setCopiedMilhares] = useState(false);
'''

if centenas.count(sending_state) != 1:
    raise SystemExit(
        f"ERRO CENTENAS: estado sendingKing encontrado {centenas.count(sending_state)} vez(es); esperado=1."
    )

centenas = centenas.replace(sending_state, sending_replacement, 1)

handler_start_marker = "  const handleEnviarKing = async () => {"
handler_end_marker = "  const progressPct = useMemo"

handler_start = centenas.find(handler_start_marker)
handler_end = centenas.find(handler_end_marker, handler_start)

if handler_start < 0 or handler_end < 0:
    raise SystemExit("ERRO CENTENAS: handleEnviarKing não foi localizado completamente.")

centenas = centenas[:handler_start] + centenas[handler_end:]

modal_start_marker = "      {kingModalOpen ? ("
modal_end_marker = '''      <div>
        <h1 className="cx0_title">CENTENAS +</h1>'''

modal_start = centenas.find(modal_start_marker)
modal_end = centenas.find(modal_end_marker, modal_start)

if modal_start < 0 or modal_end < 0:
    raise SystemExit("ERRO CENTENAS: modal da King não foi localizado completamente.")

centenas = centenas[:modal_start] + centenas[modal_end:]

centenas_button = '''                          <button
                            className="cx0_toggle"
                            type="button"
                            onClick={handleEnviarKing}
                            disabled={sendingKing}
                          >
                            {sendingKing ? "Enviando..." : "🎯 Apostar"}
                          </button>

'''

if centenas.count(centenas_button) != 1:
    raise SystemExit(
        f"ERRO CENTENAS: botão Apostar encontrado {centenas.count(centenas_button)} vez(es); esperado=1."
    )

centenas = centenas.replace(centenas_button, "", 1)

# ======================================================================================
# VALIDAÇÕES
# ======================================================================================

for label, content in [
    ("Top3View.jsx", top3),
    ("CentenasView.jsx", centenas),
]:
    forbidden = [
        "🎯 Apostar",
        "handleEnviarKing",
        "sendingKing",
        "kingModalOpen",
        "setKingModalOpen",
        "buildKingGuessUrlFromPalpites",
        "app.kingapostas.com/bet/guess",
    ]

    remaining = [token for token in forbidden if token in content]

    if remaining:
        raise SystemExit(
            f"ERRO {label}: referências remanescentes: {remaining}"
        )

top3_path.write_text(top3, encoding="utf-8", newline="")
centenas_path.write_text(centenas, encoding="utf-8", newline="")

print("PATCH_OK")
print("Top3: botão Apostar removido.")
print("Centenas+: botão, handler, estados, modal e helper King removidos.")
