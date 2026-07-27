from pathlib import Path

target = Path("src/pages/Centenas/CentenasView.jsx")
text = target.read_text(encoding="utf-8")

marker = "const rawList40 = c40"

if "[CEN-FLT-02][GROUP-PIPELINE]" in text:
    print("INSTRUMENTAÇÃO JÁ EXISTE — nenhuma duplicação aplicada.")
    raise SystemExit(0)

anchor = """        const rawList40 = c40
"""

instrumentation = """        const diagnosticCountsNonZero = Array.from(
          counts.entries()
        )
          .filter(([, count]) => Number(count) > 0)
          .map(([centena, count]) => ({
            centena,
            count: Number(count),
          }));

        const diagnosticPayload = {
          generatedAt: new Date().toISOString(),

          lotteryOptId,
          selectedLotteryKeys,

          filters: {
            fMes,
            fDiaMes,
            fDiaSemana,
            fHorario,
            fAnimal,
            fPosicao,
          },

          requestedCloseHour,
          requestedPrizePositions,

          grupo: g,
          grupo2,
          animal,

          entriesBaseCount: Array.isArray(entriesBase)
            ? entriesBase.length
            : 0,

          prizesHistoricalRawCount:
            prizesHistoricalRaw.length,

          allHistoricalPrizesCount:
            allHistoricalPrizes.length,

          prizesCurrentBeforePrizeFilter:
            prizesAll.length,

          allPrizesCurrentCount:
            allPrizes.length,

          groupPrizesCount:
            groupPrizes.length,

          groupHistoricalPrizesCount:
            groupHistoricalPrizes.length,

          totalCentenasWithOccurrence:
            diagnosticCountsNonZero.length,

          totalOccurrences:
            diagnosticCountsNonZero.reduce(
              (sum, item) => sum + Number(item.count || 0),
              0
            ),

          centenasWithOccurrence:
            diagnosticCountsNonZero,

          currentPrizeSamples:
            groupPrizes.slice(0, 20).map((prize) => ({
              ymd:
                pickPrizeYmd(prize) || null,
              hour:
                pickPrizeHour(prize) || null,
              position:
                pickPrizePositionNumber(prize),
              grupo:
                inferGrupoFromPrize(prize),
              centena:
                pickCentena3(prize),
              milhar:
                pickMilhar4(prize),
            })),

          historicalPrizeSamples:
            groupHistoricalPrizes
              .slice(0, 20)
              .map((prize) => ({
                ymd:
                  pickPrizeYmd(prize) || null,
                hour:
                  pickPrizeHour(prize) || null,
                position:
                  pickPrizePositionNumber(prize),
                grupo:
                  inferGrupoFromPrize(prize),
                centena:
                  pickCentena3(prize),
                milhar:
                  pickMilhar4(prize),
              })),
        };

        if (typeof window !== "undefined") {
          window.__CEN_FLT_02__ =
            window.__CEN_FLT_02__ || [];

          window.__CEN_FLT_02__.push(
            diagnosticPayload
          );

          if (window.__CEN_FLT_02__.length > 100) {
            window.__CEN_FLT_02__ =
              window.__CEN_FLT_02__.slice(-100);
          }
        }

        console.info(
          "[CEN-FLT-02][GROUP-PIPELINE]",
          diagnosticPayload
        );

        const rawList40 = c40
"""

if anchor not in text:
    raise SystemExit(
        "ERRO: âncora exata não encontrada. "
        "Nenhum arquivo foi alterado."
    )

text = text.replace(anchor, instrumentation, 1)
target.write_text(text, encoding="utf-8")

print("OK — instrumentação adicionada em:")
print(target)
