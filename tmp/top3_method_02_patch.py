from pathlib import Path

target = Path("src/pages/Top3/top3.engine.js")

text = target.read_text(encoding="utf-8")

old = '''    const hit =
      Number.isFinite(Number(normalizedResultGrupo)) &&
      top3.length
        ? top3.some(
            (item) =>
              Number(item?.grupo) ===
              Number(normalizedResultGrupo)
          )
        : null;
'''

new = '''    const hitPrizePositions = resultTop3Groups.map(
      (resultGroup) =>
        Number.isFinite(Number(resultGroup)) &&
        top3.some(
          (item) =>
            Number(item?.grupo) ===
            Number(resultGroup)
        )
    );

    const matchedPrizePositions =
      hitPrizePositions.filter(Boolean).length;

    const hit =
      top3.length > 0 &&
      resultTop3Groups.some(
        (resultGroup) =>
          Number.isFinite(Number(resultGroup))
      )
        ? matchedPrizePositions > 0
        : null;
'''

if old not in text:
    raise SystemExit(
        "ERRO: bloco antigo de cálculo do hit não foi localizado exatamente."
    )

if text.count(old) != 1:
    raise SystemExit(
        f"ERRO: bloco antigo encontrado {text.count(old)} vezes; esperado: 1."
    )

text = text.replace(old, new, 1)

old_push = '''      resultGrupo: normalizedResultGrupo,
      resultTop3Groups,

      hit,

      status: Number.isFinite(
'''

new_push = '''      resultGrupo: normalizedResultGrupo,
      resultTop3Groups,

      hit,
      top3PrizeHit: hit,
      hitPrizePositions,
      matchedPrizePositions,

      status: Number.isFinite(
'''

if old_push not in text:
    raise SystemExit(
        "ERRO: bloco da timeline para inclusão das métricas não foi localizado."
    )

if text.count(old_push) != 1:
    raise SystemExit(
        f"ERRO: bloco da timeline encontrado {text.count(old_push)} vezes; esperado: 1."
    )

text = text.replace(old_push, new_push, 1)

target.write_text(text, encoding="utf-8", newline="\n")

print("PATCH APLICADO COM SUCESSO")
print("Arquivo:", target)
print("Método: 3 previsões x 3 primeiros prêmios, sem ordem")
