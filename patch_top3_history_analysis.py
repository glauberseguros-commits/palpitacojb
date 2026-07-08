from pathlib import Path

p = Path("src/pages/Top3/Top3View.jsx")
txt = p.read_text(encoding="utf-8")

old = """      return {
        targetKey: `${String(slot?.targetYmd || "")}__${String(slot?.targetHour || "")}`,
        target: {
          ymd: String(slot?.targetYmd || ""),
          hour: String(slot?.targetHour || ""),
        },
        picks: slotTop3.map((t) => Number(t?.grupo)).filter((g) => Number.isFinite(g)),
        top3: slotTop3,
        result: hasResult ? Number(resultGrupo) : null,
        grupo: hasResult ? Number(resultGrupo) : null,
        animal: hasResult ? getAnimalLabel(resultGrupo) : "",
        hit: analysis.type !== "miss" && analysis.type !== "none",
      };"""

new = """      return {
        targetKey: `${String(slot?.targetYmd || "")}__${String(slot?.targetHour || "")}`,
        target: {
          ymd: String(slot?.targetYmd || ""),
          hour: String(slot?.targetHour || ""),
        },
        picks: slotTop3.map((t) => Number(t?.grupo)).filter((g) => Number.isFinite(g)),
        top3: slotTop3,

        result: hasResult ? Number(resultGrupo) : null,
        grupo: hasResult ? Number(resultGrupo) : null,
        animal: hasResult ? getAnimalLabel(resultGrupo) : "",

        resultMilhar: extractResultMilhar(slot),

        analysis,

        hit: analysis.type !== "miss" && analysis.type !== "none",
        hitType: analysis.type,
        hitScore: Number(analysis.score || 0),
        hitPosition: Number(analysis.position ?? -1),
      };"""

if old not in txt:
    raise SystemExit("Bloco historyRows não encontrado.")

txt = txt.replace(old, new, 1)

p.write_text(txt, encoding="utf-8")

print("OK - historyRows enriquecido.")
