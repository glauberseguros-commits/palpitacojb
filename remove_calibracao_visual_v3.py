from pathlib import Path
import re

p = Path("src/pages/Top3/top3.engine.js")
txt = p.read_text(encoding="utf-8")

txt = re.sub(
r'''
\s*const v3TopMaxScoreProb = Math\.max\(
\s*0,
\s*\.\.\.ranked\.map\(\(x\) => Number\(x\?\.scoreProb \|\| 0\)\)
\s*\);

\s*function calibrateV3DisplayConfidence\(rawScoreProb\) \{
[\s\S]*?
\s*return Math\.max\(0, Math\.min\(0\.35, display\)\);
\s*\}
''',
"",
txt,
count=1,
flags=re.MULTILINE,
)

txt = txt.replace(
'''    const rawScoreProb = Number(x.scoreProb || 0);
    const displayScoreProb = calibrateV3DisplayConfidence(rawScoreProb);

    const strongest = Object.values(x.details)''',
'''    const rawScoreProb = Number(x.scoreProb || 0);

    const strongest = Object.values(x.details)'''
)

txt = txt.replace(
'''      scoreProb: Number(displayScoreProb || 0),
      rawScoreProb: Number(rawScoreProb || 0),''',
'''      scoreProb: Number(rawScoreProb || 0),
      rawScoreProb: Number(rawScoreProb || 0),'''
)

txt = txt.replace(
'''        `Confiança calibrada G${g2}: ${(Number(displayScoreProb || 0) * 100).toFixed(2)}%`,
        `Score estatístico bruto G${g2}: ${(Number(rawScoreProb || 0) * 100).toFixed(2)}%`,''',
'''        `Probabilidade final G${g2}: ${(Number(rawScoreProb || 0) * 100).toFixed(2)}%`,'''
)

p.write_text(txt, encoding="utf-8")
print("Removida calibração artificial da confiança V3.")
