from pathlib import Path
import sys


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8", newline="\n")


def replace_once(content, old, new, label):
    count = content.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: âncora encontrada {count} vez(es), esperado exatamente 1."
        )

    return content.replace(old, new, 1)


# ======================================================================================
# 1. top3HistoryRepository.js
# Faz upsertHistoryMonth devolver os dados anteriores do mês.
# Isso permite atualizar metadata sem reler todos os meses.
# ======================================================================================

path = "backend/engine/top3HistoryRepository.js"
content = read(path)

old = '''  return writeHistoryMonth(
    lotteryKey,
    yearMonth,
    merged,
    dependencies
  );
}'''

new = '''  const payload = await writeHistoryMonth(
    lotteryKey,
    yearMonth,
    merged,
    dependencies
  );

  return {
    ...payload,
    previousDrawCount: current.draws.length,
    previousFirstYmd:
      current.draws[0]?.ymd || null,
    previousLastYmd:
      current.draws[
        current.draws.length - 1
      ]?.ymd || null,
    previousFirstDrawId:
      current.draws[0]?.drawId || null,
    previousLastDrawId:
      current.draws[
        current.draws.length - 1
      ]?.drawId || null,
  };
}'''

content = replace_once(
    content,
    old,
    new,
    "top3HistoryRepository/upsertHistoryMonth"
)

write(path, content)


# ======================================================================================
# 2. top3HistorySync.js
# - remove listHistoryMonths do fluxo incremental;
# - atualiza metadata por delta;
# - paraleliza leitura dos draws e dos respectivos prêmios.
# ======================================================================================

path = "backend/engine/top3HistorySync.js"
content = read(path)

content = replace_once(
    content,
    '''  upsertHistoryMonth,
  listHistoryMonths,
  deduplicateDraws,''',
    '''  upsertHistoryMonth,
  deduplicateDraws,''',
    "top3HistorySync/imports"
)

old = '''  if (targetDrawIds.length) {
    for (const drawId of targetDrawIds) {
      const snap = await database
        .collection("draws")
        .doc(drawId)
        .get();

      if (snap.exists) {
        docs.push(snap);
      }
    }
  } else if (date) {'''

new = '''  if (targetDrawIds.length) {
    const snapshots = await Promise.all(
      targetDrawIds.map(
        (drawId) =>
          database
            .collection("draws")
            .doc(drawId)
            .get()
      )
    );

    docs.push(
      ...snapshots.filter(
        (snap) => snap.exists
      )
    );
  } else if (date) {'''

content = replace_once(
    content,
    old,
    new,
    "top3HistorySync/load draw documents"
)

old = '''  const draws = [];

  for (const doc of docs) {
    const draw = await readDrawWithPrizes(
      database,
      doc
    );

    if (!draw) {
      continue;
    }

    const drawLotteryKey = normalizeLotteryKey(
      draw.lottery_key ||
      draw.lotteryKey
    );

    if (drawLotteryKey !== lotteryKey) {
      continue;
    }

    if (
      date &&
      String(draw.ymd || draw.date || "") !== date
    ) {
      continue;
    }

    draws.push(draw);
  }

  return deduplicateDraws(draws);'''

new = '''  const loadedDraws = await Promise.all(
    docs.map(
      (doc) =>
        readDrawWithPrizes(
          database,
          doc
        )
    )
  );

  const draws = loadedDraws.filter((draw) => {
    if (!draw) {
      return false;
    }

    const drawLotteryKey = normalizeLotteryKey(
      draw.lottery_key ||
      draw.lotteryKey
    );

    if (drawLotteryKey !== lotteryKey) {
      return false;
    }

    if (
      date &&
      String(draw.ymd || draw.date || "") !== date
    ) {
      return false;
    }

    return true;
  });

  return deduplicateDraws(draws);'''

content = replace_once(
    content,
    old,
    new,
    "top3HistorySync/read prizes in parallel"
)

old = '''  const loadMonths =
    dependencies.listHistoryMonths ||
    listHistoryMonths;

  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;'''

new = '''  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;'''

content = replace_once(
    content,
    old,
    new,
    "top3HistorySync/remove loadMonths dependency"
)

old = '''      updatedMonths.push({
        yearMonth,
        drawCount:
          Number(payload?.drawCount || 0),
      });
    }

    const months = await loadMonths(
      lotteryKey,
      dependencies.repositoryDependencies || {}
    );

    const summary = summarizeMonths(months);

    await saveMetadata(
      lotteryKey,
      {
        bootstrapStatus: "complete",
        incrementalUpdatedAt:
          new Date().toISOString(),
        totalDraws:
          summary.totalDraws,
        monthCount:
          summary.monthCount,
        months:
          summary.months,
        firstYmd:
          summary.firstYmd,
        lastYmd:
          summary.lastYmd,
        firstDrawId:
          summary.firstDrawId,
        lastDrawId:
          summary.lastDrawId,
        lastProcessedDrawId:
          summary.lastDrawId,
        staleReason: null,
        staleAt: null,
        source:
          "bootstrap_plus_incremental",
      },
      dependencies.repositoryDependencies || {}
    );'''

new = '''      updatedMonths.push({
        yearMonth,
        drawCount:
          Number(payload?.drawCount || 0),
        previousDrawCount:
          Number(
            payload?.previousDrawCount || 0
          ),
        firstYmd:
          payload?.firstYmd || null,
        lastYmd:
          payload?.lastYmd || null,
        firstDrawId:
          payload?.firstDrawId || null,
        lastDrawId:
          payload?.lastDrawId || null,
      });
    }

    const metadataMonths = safeArray(
      metadata?.months
    )
      .map((value) =>
        String(value || "").trim()
      )
      .filter(Boolean);

    const monthSet = new Set(
      metadataMonths
    );

    for (const item of updatedMonths) {
      monthSet.add(item.yearMonth);
    }

    const orderedMonths =
      Array.from(monthSet).sort();

    const totalDelta =
      updatedMonths.reduce(
        (total, item) =>
          total +
          Number(item.drawCount || 0) -
          Number(
            item.previousDrawCount || 0
          ),
        0
      );

    const totalDraws = Math.max(
      0,
      Number(metadata?.totalDraws || 0) +
      totalDelta
    );

    const firstCandidates = [
      metadata?.firstYmd
        ? {
            ymd: metadata.firstYmd,
            drawId:
              metadata.firstDrawId || null,
          }
        : null,
      ...updatedMonths.map((item) =>
        item.firstYmd
          ? {
              ymd: item.firstYmd,
              drawId:
                item.firstDrawId || null,
            }
          : null
      ),
    ]
      .filter(Boolean)
      .sort((a, b) =>
        String(a.ymd)
          .localeCompare(String(b.ymd))
      );

    const lastCandidates = [
      metadata?.lastYmd
        ? {
            ymd: metadata.lastYmd,
            drawId:
              metadata.lastDrawId || null,
          }
        : null,
      ...updatedMonths.map((item) =>
        item.lastYmd
          ? {
              ymd: item.lastYmd,
              drawId:
                item.lastDrawId || null,
            }
          : null
      ),
    ]
      .filter(Boolean)
      .sort((a, b) =>
        String(a.ymd)
          .localeCompare(String(b.ymd))
      );

    const first =
      firstCandidates[0] || null;

    const last =
      lastCandidates[
        lastCandidates.length - 1
      ] || null;

    const summary = {
      totalDraws,
      monthCount:
        orderedMonths.length,
      months:
        orderedMonths,
      firstYmd:
        first?.ymd || null,
      lastYmd:
        last?.ymd || null,
      firstDrawId:
        first?.drawId || null,
      lastDrawId:
        last?.drawId || null,
    };

    await saveMetadata(
      lotteryKey,
      {
        bootstrapStatus: "complete",
        incrementalUpdatedAt:
          new Date().toISOString(),
        totalDraws:
          summary.totalDraws,
        monthCount:
          summary.monthCount,
        months:
          summary.months,
        firstYmd:
          summary.firstYmd,
        lastYmd:
          summary.lastYmd,
        firstDrawId:
          summary.firstDrawId,
        lastDrawId:
          summary.lastDrawId,
        lastProcessedDrawId:
          summary.lastDrawId,
        staleReason: null,
        staleAt: null,
        source:
          "bootstrap_plus_incremental",
      },
      dependencies.repositoryDependencies || {}
    );'''

content = replace_once(
    content,
    old,
    new,
    "top3HistorySync/incremental metadata"
)

write(path, content)


# ======================================================================================
# 3. top3PredictionService.js
# Decora os draws uma única vez para filtrar e ordenar.
# Evita chamadas repetidas de pickDrawYMD, pickDrawHour e normalizeHour.
# ======================================================================================

path = "backend/engine/top3PredictionService.js"
content = read(path)

old = '''  const targetKey = dateHourKey(date, closeHour);

  const history = allDraws
    .filter((draw) => {
      const ymd = publicApi.pickDrawYMD(draw);
      const hour = publicApi.pickDrawHour(draw);

      if (!ymd || !hour) {
        return false;
      }

      return dateHourKey(ymd, hour) < targetKey;
    })
    .sort((a, b) => {
      const aKey = dateHourKey(
        publicApi.pickDrawYMD(a),
        publicApi.pickDrawHour(a)
      );

      const bKey = dateHourKey(
        publicApi.pickDrawYMD(b),
        publicApi.pickDrawHour(b)
      );

      return aKey.localeCompare(bKey);
    });'''

new = '''  const targetKey = dateHourKey(date, closeHour);

  const history = allDraws
    .map((draw) => {
      const ymd =
        publicApi.pickDrawYMD(draw);

      const rawHour =
        publicApi.pickDrawHour(draw);

      if (!ymd || !rawHour) {
        return null;
      }

      const hour =
        normalizeHour(rawHour);

      return {
        draw,
        ymd,
        hour,
        key: `${ymd}T${hour}`,
      };
    })
    .filter(
      (item) =>
        item &&
        item.key < targetKey
    )
    .sort((a, b) =>
      a.key.localeCompare(b.key)
    )
    .map((item) => item.draw);'''

content = replace_once(
    content,
    old,
    new,
    "top3PredictionService/decorated history"
)

old = '''    topN: 3,
    targetYmdOverride: date,
    targetHourOverride: closeHour,
  });'''

new = '''    topN: 3,
    targetYmdOverride: date,
    targetHourOverride: closeHour,
    drawsAlreadySorted: true,
  });'''

content = replace_once(
    content,
    old,
    new,
    "top3PredictionService/sorted flag"
)

write(path, content)


# ======================================================================================
# 4. top3.engine.js
# Permite ao backend informar que o histórico já está ordenado.
# O padrão continua false, portanto frontend, backtests e demais consumidores
# mantêm o comportamento anterior.
# ======================================================================================

path = "src/pages/Top3/top3.engine.js"
content = read(path)

old = '''  topN = 3,
  targetYmdOverride = "",
  targetHourOverride = "",
}) {
  const list = sortDrawsAsc(Array.isArray(drawsRange) ? drawsRange : []);'''

new = '''  topN = 3,
  targetYmdOverride = "",
  targetHourOverride = "",
  drawsAlreadySorted = false,
}) {
  const sourceList =
    Array.isArray(drawsRange)
      ? drawsRange
      : [];

  const list = drawsAlreadySorted
    ? sourceList
    : sortDrawsAsc(sourceList);'''

count = content.count(old)

if count != 1:
    raise RuntimeError(
        "top3.engine/computeStatisticalTop3V3: "
        f"âncora encontrada {count} vez(es), esperado exatamente 1."
    )

content = content.replace(old, new, 1)

write(path, content)

print("PATCH_OK")
