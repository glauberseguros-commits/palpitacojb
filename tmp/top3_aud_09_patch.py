from pathlib import Path

target = Path("backend/scripts/backtestTop3Official.js")
text = target.read_text(encoding="utf-8")

if "top3PrizeHits" in text and "getPrizeGroupsByPosition" in text:
    raise SystemExit(
        "A ampliação do backtest já parece estar aplicada. "
        "Nenhuma duplicação foi realizada."
    )

# ------------------------------------------------------------------
# 1. Adicionar helpers para extrair os grupos reais por posição
# ------------------------------------------------------------------

marker = """function getPredictionGroups(
  computed
) {
"""

helper = r'''function fallbackPrizePosition(prize) {
  const candidates = [
    prize?.position,
    prize?.posicao,
    prize?.pos,
    prize?.colocacao,
  ];

  for (const value of candidates) {
    const position = Number(value);

    if (Number.isFinite(position)) {
      return position;
    }
  }

  return null;
}

function fallbackPrizeGroup(prize) {
  const directCandidates = [
    prize?.grupo2,
    prize?.group2,
    prize?.grupo,
    prize?.group,
    prize?.animal_grupo,
    prize?.grupo_animal,
    prize?.grupoAnimal,
    prize?.g,
  ];

  for (const value of directCandidates) {
    const group = Number(value);

    if (
      Number.isFinite(group) &&
      group >= 1 &&
      group <= 25
    ) {
      return group;
    }
  }

  const milharCandidates = [
    prize?.milhar,
    prize?.milhar4,
    prize?.numero,
    prize?.number,
    prize?.value,
    prize?.result,
    prize?.resultado,
    prize?.premio,
  ];

  for (const value of milharCandidates) {
    const digits = String(value ?? "")
      .replace(/\D+/g, "");

    if (!digits) {
      continue;
    }

    const dezenaRaw = Number(
      digits.padStart(2, "0").slice(-2)
    );

    if (
      !Number.isFinite(dezenaRaw) ||
      dezenaRaw < 0 ||
      dezenaRaw > 99
    ) {
      continue;
    }

    if (dezenaRaw === 0) {
      return 25;
    }

    const group = Math.ceil(
      dezenaRaw / 4
    );

    if (
      group >= 1 &&
      group <= 25
    ) {
      return group;
    }
  }

  return null;
}

function getPrizeGroupsByPosition(
  draw,
  publicApi,
  maxPosition = 3
) {
  const limit = Math.max(
    1,
    Number(maxPosition || 3)
  );

  const prizes = safeArray(
    draw?.prizes
  );

  const guessPosition =
    typeof publicApi?.guessPrizePos ===
    "function"
      ? publicApi.guessPrizePos
      : fallbackPrizePosition;

  const guessGroup =
    typeof publicApi?.guessPrizeGrupo ===
    "function"
      ? publicApi.guessPrizeGrupo
      : fallbackPrizeGroup;

  const result = Array.from(
    {
      length: limit,
    },
    () => null
  );

  for (const prize of prizes) {
    const position = Number(
      guessPosition(prize)
    );

    if (
      !Number.isFinite(position) ||
      position < 1 ||
      position > limit
    ) {
      continue;
    }

    const group = Number(
      guessGroup(prize)
    );

    if (
      !Number.isFinite(group) ||
      group < 1 ||
      group > 25
    ) {
      continue;
    }

    result[position - 1] = group;
  }

  if (
    !Number.isFinite(
      Number(result[0])
    )
  ) {
    result[0] = getFirstPrizeGroup(
      draw,
      publicApi
    );
  }

  return result;
}

'''

if marker not in text:
    raise SystemExit(
        "Marcador getPredictionGroups não encontrado."
    )

text = text.replace(
    marker,
    helper + marker,
    1,
)

# ------------------------------------------------------------------
# 2. Ampliar os buckets
# ------------------------------------------------------------------

old_ensure_bucket = r'''function ensureBucket(
  map,
  key
) {
  if (!map[key]) {
    map[key] = {
      evaluated: 0,
      top1Hits: 0,
      top3Hits: 0,
      errors: 0,
    };
  }

  return map[key];
}
'''

new_ensure_bucket = r'''function ensureBucket(
  map,
  key
) {
  if (!map[key]) {
    map[key] = {
      evaluated: 0,

      top1Hits: 0,
      top3Hits: 0,

      prize1Hits: 0,
      prize2Hits: 0,
      prize3Hits: 0,

      top3PrizeHits: 0,

      matchedPrizePositions: 0,
      matchedPredictions: 0,

      errors: 0,
    };
  }

  return map[key];
}
'''

if old_ensure_bucket not in text:
    raise SystemExit(
        "Bloco ensureBucket original não encontrado."
    )

text = text.replace(
    old_ensure_bucket,
    new_ensure_bucket,
    1,
)

old_finalize_bucket = r'''function finalizeBucket(bucket = {}) {
  const evaluated = Number(
    bucket.evaluated || 0
  );

  const top1Hits = Number(
    bucket.top1Hits || 0
  );

  const top3Hits = Number(
    bucket.top3Hits || 0
  );

  return {
    evaluated,
    top1Hits,
    top3Hits,
    errors: Number(
      bucket.errors || 0
    ),
    top1Rate:
      evaluated > 0
        ? Number(
            (
              top1Hits /
              evaluated *
              100
            ).toFixed(4)
          )
        : 0,
    top3Rate:
      evaluated > 0
        ? Number(
            (
              top3Hits /
              evaluated *
              100
            ).toFixed(4)
          )
        : 0,
  };
}
'''

new_finalize_bucket = r'''function finalizeBucket(bucket = {}) {
  const evaluated = Number(
    bucket.evaluated || 0
  );

  const top1Hits = Number(
    bucket.top1Hits || 0
  );

  const top3Hits = Number(
    bucket.top3Hits || 0
  );

  const prize1Hits = Number(
    bucket.prize1Hits || 0
  );

  const prize2Hits = Number(
    bucket.prize2Hits || 0
  );

  const prize3Hits = Number(
    bucket.prize3Hits || 0
  );

  const top3PrizeHits = Number(
    bucket.top3PrizeHits || 0
  );

  const matchedPrizePositions = Number(
    bucket.matchedPrizePositions || 0
  );

  const matchedPredictions = Number(
    bucket.matchedPredictions || 0
  );

  const rate = (hits) =>
    evaluated > 0
      ? Number(
          (
            Number(hits || 0) /
            evaluated *
            100
          ).toFixed(4)
        )
      : 0;

  return {
    evaluated,

    top1Hits,
    top3Hits,

    prize1Hits,
    prize2Hits,
    prize3Hits,

    top3PrizeHits,

    matchedPrizePositions,
    matchedPredictions,

    errors: Number(
      bucket.errors || 0
    ),

    top1Rate:
      rate(top1Hits),

    top3Rate:
      rate(top3Hits),

    prize1Rate:
      rate(prize1Hits),

    prize2Rate:
      rate(prize2Hits),

    prize3Rate:
      rate(prize3Hits),

    top3PrizeRate:
      rate(top3PrizeHits),

    averageMatchedPrizePositions:
      evaluated > 0
        ? Number(
            (
              matchedPrizePositions /
              evaluated
            ).toFixed(4)
          )
        : 0,

    averageMatchedPredictions:
      evaluated > 0
        ? Number(
            (
              matchedPredictions /
              evaluated
            ).toFixed(4)
          )
        : 0,
  };
}
'''

if old_finalize_bucket not in text:
    raise SystemExit(
        "Bloco finalizeBucket original não encontrado."
    )

text = text.replace(
    old_finalize_bucket,
    new_finalize_bucket,
    1,
)

# ------------------------------------------------------------------
# 3. Ampliar relatório global
# ------------------------------------------------------------------

old_global_report = r'''  lines.push(
    `TOP1................: ${result.global.top1Hits} (${formatPercent(result.global.top1Rate)})`
  );

  lines.push(
    `TOP3................: ${result.global.top3Hits} (${formatPercent(result.global.top3Rate)})`
  );

  lines.push(
    `Tempo total.........: ${result.tookMs} ms`
  );
'''

new_global_report = r'''  lines.push(
    `TOP1................: ${result.global.top1Hits} (${formatPercent(result.global.top1Rate)})`
  );

  lines.push(
    `TOP3 no 1º prêmio...: ${result.global.top3Hits} (${formatPercent(result.global.top3Rate)})`
  );

  lines.push(
    `Acerto no 1º prêmio.: ${result.global.prize1Hits} (${formatPercent(result.global.prize1Rate)})`
  );

  lines.push(
    `Acerto no 2º prêmio.: ${result.global.prize2Hits} (${formatPercent(result.global.prize2Rate)})`
  );

  lines.push(
    `Acerto no 3º prêmio.: ${result.global.prize3Hits} (${formatPercent(result.global.prize3Rate)})`
  );

  lines.push(
    `Algum acerto 1º-3º..: ${result.global.top3PrizeHits} (${formatPercent(result.global.top3PrizeRate)})`
  );

  lines.push(
    `Posições atingidas..: ${result.global.matchedPrizePositions}`
  );

  lines.push(
    `Média posições/caso.: ${Number(result.global.averageMatchedPrizePositions || 0).toFixed(4)}`
  );

  lines.push(
    `Palpites atingidos..: ${result.global.matchedPredictions}`
  );

  lines.push(
    `Média palpites/caso.: ${Number(result.global.averageMatchedPredictions || 0).toFixed(4)}`
  );

  lines.push(
    `Tempo total.........: ${result.tookMs} ms`
  );
'''

if old_global_report not in text:
    raise SystemExit(
        "Bloco global do relatório não encontrado."
    )

text = text.replace(
    old_global_report,
    new_global_report,
    1,
)

# ------------------------------------------------------------------
# 4. Ampliar linhas por horário, dia e mês
# ------------------------------------------------------------------

old_hour_line = r'''      `${hour.padEnd(8)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | TOP3=${formatPercent(bucket.top3Rate).padStart(8)} | erros=${bucket.errors}`
'''

new_hour_line = r'''      `${hour.padEnd(8)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | 1º=${formatPercent(bucket.prize1Rate).padStart(8)} | 2º=${formatPercent(bucket.prize2Rate).padStart(8)} | 3º=${formatPercent(bucket.prize3Rate).padStart(8)} | QUALQUER=${formatPercent(bucket.top3PrizeRate).padStart(8)} | erros=${bucket.errors}`
'''

if old_hour_line not in text:
    raise SystemExit(
        "Linha por horário não encontrada."
    )

text = text.replace(
    old_hour_line,
    new_hour_line,
    1,
)

old_weekday_line = r'''      `${weekday.padEnd(3)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | TOP3=${formatPercent(bucket.top3Rate).padStart(8)} | erros=${bucket.errors}`
'''

new_weekday_line = r'''      `${weekday.padEnd(3)} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | 1º=${formatPercent(bucket.prize1Rate).padStart(8)} | 2º=${formatPercent(bucket.prize2Rate).padStart(8)} | 3º=${formatPercent(bucket.prize3Rate).padStart(8)} | QUALQUER=${formatPercent(bucket.top3PrizeRate).padStart(8)} | erros=${bucket.errors}`
'''

if old_weekday_line not in text:
    raise SystemExit(
        "Linha por dia da semana não encontrada."
    )

text = text.replace(
    old_weekday_line,
    new_weekday_line,
    1,
)

old_month_line = r'''      `${month} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | TOP3=${formatPercent(bucket.top3Rate).padStart(8)} | erros=${bucket.errors}`
'''

new_month_line = r'''      `${month} avaliados=${String(bucket.evaluated).padStart(5)} | TOP1=${formatPercent(bucket.top1Rate).padStart(8)} | 1º=${formatPercent(bucket.prize1Rate).padStart(8)} | 2º=${formatPercent(bucket.prize2Rate).padStart(8)} | 3º=${formatPercent(bucket.prize3Rate).padStart(8)} | QUALQUER=${formatPercent(bucket.top3PrizeRate).padStart(8)} | erros=${bucket.errors}`
'''

if old_month_line not in text:
    raise SystemExit(
        "Linha por mês não encontrada."
    )

text = text.replace(
    old_month_line,
    new_month_line,
    1,
)

# ------------------------------------------------------------------
# 5. Ampliar bucket global inicial
# ------------------------------------------------------------------

old_global_bucket = r'''  const globalBucket = {
    evaluated: 0,
    top1Hits: 0,
    top3Hits: 0,
    errors: 0,
  };
'''

new_global_bucket = r'''  const globalBucket = {
    evaluated: 0,

    top1Hits: 0,
    top3Hits: 0,

    prize1Hits: 0,
    prize2Hits: 0,
    prize3Hits: 0,

    top3PrizeHits: 0,

    matchedPrizePositions: 0,
    matchedPredictions: 0,

    errors: 0,
  };
'''

if old_global_bucket not in text:
    raise SystemExit(
        "Bucket global original não encontrado."
    )

text = text.replace(
    old_global_bucket,
    new_global_bucket,
    1,
)

# ------------------------------------------------------------------
# 6. Extrair TOP3 real dentro do caso
# ------------------------------------------------------------------

old_actual_group = r'''    const actualGroup =
      getFirstPrizeGroup(
        targetDraw,
        publicApi
      );
'''

new_actual_group = r'''    const actualTop3Groups =
      getPrizeGroupsByPosition(
        targetDraw,
        publicApi,
        3
      );

    const actualGroup =
      Number(
        actualTop3Groups[0]
      );
'''

if old_actual_group not in text:
    raise SystemExit(
        "Extração de actualGroup não encontrada."
    )

text = text.replace(
    old_actual_group,
    new_actual_group,
    1,
)

# ------------------------------------------------------------------
# 7. Calcular métricas novas após top3Hit
# ------------------------------------------------------------------

old_hit_block = r'''      const top3Hit =
        predictionGroups.includes(
          actualGroup
        );

      if (options.telemetry === true) {
'''

new_hit_block = r'''      const top3Hit =
        predictionGroups.includes(
          actualGroup
        );

      const prizePositionHits =
        actualTop3Groups.map(
          (group) =>
            Number.isFinite(
              Number(group)
            ) &&
            predictionGroups.includes(
              Number(group)
            )
        );

      const predictionHits =
        predictionGroups.map(
          (group) =>
            actualTop3Groups.some(
              (actual) =>
                Number.isFinite(
                  Number(actual)
                ) &&
                Number(actual) ===
                Number(group)
            )
        );

      const prize1Hit =
        Boolean(
          prizePositionHits[0]
        );

      const prize2Hit =
        Boolean(
          prizePositionHits[1]
        );

      const prize3Hit =
        Boolean(
          prizePositionHits[2]
        );

      const matchedPrizePositions =
        prizePositionHits.filter(
          Boolean
        ).length;

      const matchedPredictions =
        predictionHits.filter(
          Boolean
        ).length;

      const top3PrizeHit =
        matchedPrizePositions > 0;

      if (options.telemetry === true) {
'''

if old_hit_block not in text:
    raise SystemExit(
        "Bloco de cálculo top3Hit não encontrado."
    )

text = text.replace(
    old_hit_block,
    new_hit_block,
    1,
)

# ------------------------------------------------------------------
# 8. Ampliar telemetria
# ------------------------------------------------------------------

old_telemetry_actual = r'''          actual: {
            group: actualGroup,
          },
          prediction: {
            groups: predictionGroups,
            top1Hit,
            top3Hit,
          },
'''

new_telemetry_actual = r'''          actual: {
            group: actualGroup,
            top3Groups:
              actualTop3Groups,
          },
          prediction: {
            groups:
              predictionGroups,

            top1Hit,
            top3Hit,

            prize1Hit,
            prize2Hit,
            prize3Hit,

            top3PrizeHit,

            matchedPrizePositions,
            matchedPredictions,

            prizePositionHits,
            predictionHits,
          },
'''

if old_telemetry_actual not in text:
    raise SystemExit(
        "Bloco de telemetria actual/prediction não encontrado."
    )

text = text.replace(
    old_telemetry_actual,
    new_telemetry_actual,
    1,
)

# ------------------------------------------------------------------
# 9. Incrementar novas métricas nos buckets
# ------------------------------------------------------------------

old_bucket_increment = r'''        if (top3Hit) {
          bucket.top3Hits += 1;
        }
      }
'''

new_bucket_increment = r'''        if (top3Hit) {
          bucket.top3Hits += 1;
        }

        if (prize1Hit) {
          bucket.prize1Hits += 1;
        }

        if (prize2Hit) {
          bucket.prize2Hits += 1;
        }

        if (prize3Hit) {
          bucket.prize3Hits += 1;
        }

        if (top3PrizeHit) {
          bucket.top3PrizeHits += 1;
        }

        bucket.matchedPrizePositions +=
          matchedPrizePositions;

        bucket.matchedPredictions +=
          matchedPredictions;
      }
'''

if old_bucket_increment not in text:
    raise SystemExit(
        "Bloco de incremento dos buckets não encontrado."
    )

text = text.replace(
    old_bucket_increment,
    new_bucket_increment,
    1,
)

# ------------------------------------------------------------------
# 10. Tornar os arquivos de saída específicos da loteria
# ------------------------------------------------------------------

old_suffix = r'''  const suffix =
    options.limit
      ? `limit_${options.limit}`
      : "full";
'''

new_suffix = r'''  const lotterySuffix =
    String(options.lotteryKey || "PT_RIO")
      .trim()
      .toLowerCase();

  const suffix =
    options.limit
      ? `${lotterySuffix}_limit_${options.limit}`
      : `${lotterySuffix}_full`;
'''

if old_suffix not in text:
    raise SystemExit(
        "Bloco suffix não encontrado."
    )

text = text.replace(
    old_suffix,
    new_suffix,
    1,
)

# ------------------------------------------------------------------
# 11. Exportar helper para testes
# ------------------------------------------------------------------

old_exports = r'''  sortDraws,
  getFirstPrizeGroup,
  getPredictionGroups,
'''

new_exports = r'''  sortDraws,
  getFirstPrizeGroup,
  getPrizeGroupsByPosition,
  getPredictionGroups,
'''

if old_exports not in text:
    raise SystemExit(
        "Bloco module.exports não encontrado."
    )

text = text.replace(
    old_exports,
    new_exports,
    1,
)

required_tokens = [
    "function getPrizeGroupsByPosition",
    "prize1Hits",
    "prize2Hits",
    "prize3Hits",
    "top3PrizeHits",
    "matchedPrizePositions",
    "matchedPredictions",
    "actualTop3Groups",
    "prizePositionHits",
    "predictionHits",
    "averageMatchedPrizePositions",
    "averageMatchedPredictions",
]

missing = [
    token
    for token in required_tokens
    if token not in text
]

if missing:
    raise SystemExit(
        "Validação interna falhou. Tokens ausentes: "
        + ", ".join(missing)
    )

target.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("PATCH_OK")
print(f"Arquivo alterado: {target}")
print("Backtest oficial ampliado para os prêmios 1, 2 e 3.")
print("Arquivos de saída agora incluem a loteria no nome.")
