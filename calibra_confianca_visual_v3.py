from pathlib import Path

p = Path("src/pages/Top3/top3.engine.js")
txt = p.read_text(encoding="utf-8")

v3_marker = "/* =========================\n   Motor principal V3"
v3_pos = txt.find(v3_marker)
if v3_pos < 0:
    raise SystemExit("Não encontrei o bloco V3.")

top_pos = txt.find("  const top = ranked.map((x, idx) => {", v3_pos)
if top_pos < 0:
    raise SystemExit("Não encontrei const top da V3.")

insert = '''
  const v3TopMaxScoreProb = Math.max(
    0,
    ...ranked.map((x) => Number(x?.scoreProb || 0))
  );

  function calibrateV3DisplayConfidence(rawScoreProb) {
    const raw = Math.max(0, Number(rawScoreProb || 0));
    const max = Math.max(0, Number(v3TopMaxScoreProb || 0));

    if (!Number.isFinite(raw) || raw <= 0 || !Number.isFinite(max) || max <= 0) {
      return 0;
    }

    const absoluteComponent = Math.min(1, raw);
    const relativeComponent = Math.sqrt(Math.max(0, Math.min(1, raw / max)));

    const display =
      (absoluteComponent * 0.35) +
      ((0.06 + (relativeComponent * 0.16)) * 0.65);

    return Math.max(0, Math.min(0.35, display));
  }

'''

if "calibrateV3DisplayConfidence" not in txt[v3_pos:top_pos]:
    txt = txt[:top_pos] + insert + txt[top_pos:]
else:
    print("calibrateV3DisplayConfidence já existe; não inseri novamente.")

v3_pos = txt.find(v3_marker)
top_pos = txt.find("  const top = ranked.map((x, idx) => {", v3_pos)

old = '''  const top = ranked.map((x, idx) => {
    const g2 = String(x.grupo).padStart(2, "0");
    const strongest = Object.values(x.details)'''

new = '''  const top = ranked.map((x, idx) => {
    const g2 = String(x.grupo).padStart(2, "0");
    const rawScoreProb = Number(x.scoreProb || 0);
    const displayScoreProb = calibrateV3DisplayConfidence(rawScoreProb);

    const strongest = Object.values(x.details)'''

if old not in txt[top_pos:]:
    raise SystemExit("Não encontrei abertura do map V3 para inserir displayScoreProb.")

txt = txt[:top_pos] + txt[top_pos:].replace(old, new, 1)

v3_pos = txt.find(v3_marker)
top_pos = txt.find("  const top = ranked.map((x, idx) => {", v3_pos)

old = '''      scoreProb: Number(x.scoreProb || 0),
      probCond: Number(x.details.transition?.probability || 0),'''

new = '''      scoreProb: Number(displayScoreProb || 0),
      rawScoreProb: Number(rawScoreProb || 0),
      probCond: Number(x.details.transition?.probability || 0),'''

if old not in txt[top_pos:]:
    raise SystemExit("Não encontrei scoreProb do retorno V3.")

txt = txt[:top_pos] + txt[top_pos:].replace(old, new, 1)

txt = txt.replace(
'''        `Score final G${g2}: ${(Number(x.scoreProb || 0) * 100).toFixed(2)}%`,''',
'''        `Confiança calibrada G${g2}: ${(Number(displayScoreProb || 0) * 100).toFixed(2)}%`,
        `Score estatístico bruto G${g2}: ${(Number(rawScoreProb || 0) * 100).toFixed(2)}%`,'''
)

p.write_text(txt, encoding="utf-8")
print("V3: confiança visual calibrada aplicada.")
