from pathlib import Path

path = Path("tmp/perf_top3_16_patch.py")
text = path.read_text(encoding="utf-8")

old = '''sync = replace_once(
    sync,
    \'\'\'    await saveMetadata(
      lotteryKey,
      {
\'\'\',
    \'\'\'    let compactUpdated = false;
    let compactError = null;
    const updatedCompactYears = [];

    if (compactReady) {
      try {
        const byYear = new Map();

        for (const draw of draws) {
          const year = draw.ymd.slice(0, 4);

          if (!byYear.has(year)) {
            byYear.set(year, []);
          }

          byYear.get(year).push(draw);
        }

        for (
          const [year, yearDraws]
          of byYear.entries()
        ) {
          const payload =
            await saveCompactYear(
              lotteryKey,
              year,
              yearDraws,
              dependencies.repositoryDependencies || {}
            );

          updatedCompactYears.push({
            year,
            drawCount:
              Number(payload?.drawCount || 0),
            previousDrawCount:
              Number(
                payload?.previousDrawCount || 0
              ),
          });
        }

        const compactYears = Array.from(
          new Set(
            orderedMonths.map(
              (month) =>
                String(month).slice(0, 4)
            )
          )
        ).sort();

        await saveCompactManifest(
          lotteryKey,
          {
            status: "complete",
            totalDraws:
              summary.totalDraws,
            yearCount:
              compactYears.length,
            years:
              compactYears,
            firstYmd:
              summary.firstYmd,
            lastYmd:
              summary.lastYmd,
            firstDrawId:
              summary.firstDrawId,
            lastDrawId:
              summary.lastDrawId,
            source:
              "bootstrap_plus_incremental",
            incrementalUpdatedAt:
              new Date().toISOString(),
            staleReason: null,
            staleAt: null,
          },
          dependencies.repositoryDependencies || {}
        );

        compactUpdated = true;
      } catch (error) {
        compactError = String(
          error?.message ||
          error ||
          "compact_incremental_failed"
        );

        console.warn(
          "[TOP3-HISTORY] Compacto incremental falhou; " +
          "a leitura mensal continuará disponível:",
          compactError
        );

        try {
          await saveCompactManifest(
            lotteryKey,
            {
              status: "stale",
              staleReason:
                compactError,
              staleAt:
                new Date().toISOString(),
            },
            dependencies.repositoryDependencies || {}
          );
        } catch (manifestError) {
          console.warn(
            "[TOP3-HISTORY] Falha ao marcar compacto como stale:",
            manifestError?.message ||
            manifestError
          );
        }
      }
    }

    await saveMetadata(
      lotteryKey,
      {
\'\'\',
    "sync/compact-update",
)
'''

new = '''sync_function_marker = (
    "async function syncImportedResultToTop3History("
)

if sync_function_marker not in sync:
    raise RuntimeError(
        "sync/compact-update: função principal não encontrada"
    )

sync_prefix, sync_function_body = sync.split(
    sync_function_marker,
    1,
)

sync_function_body = replace_once(
    sync_function_body,
    \'\'\'    await saveMetadata(
      lotteryKey,
      {
\'\'\',
    \'\'\'    let compactUpdated = false;
    let compactError = null;
    const updatedCompactYears = [];

    if (compactReady) {
      try {
        const byYear = new Map();

        for (const draw of draws) {
          const year = draw.ymd.slice(0, 4);

          if (!byYear.has(year)) {
            byYear.set(year, []);
          }

          byYear.get(year).push(draw);
        }

        for (
          const [year, yearDraws]
          of byYear.entries()
        ) {
          const payload =
            await saveCompactYear(
              lotteryKey,
              year,
              yearDraws,
              dependencies.repositoryDependencies || {}
            );

          updatedCompactYears.push({
            year,
            drawCount:
              Number(payload?.drawCount || 0),
            previousDrawCount:
              Number(
                payload?.previousDrawCount || 0
              ),
          });
        }

        const compactYears = Array.from(
          new Set(
            orderedMonths.map(
              (month) =>
                String(month).slice(0, 4)
            )
          )
        ).sort();

        await saveCompactManifest(
          lotteryKey,
          {
            status: "complete",
            totalDraws:
              summary.totalDraws,
            yearCount:
              compactYears.length,
            years:
              compactYears,
            firstYmd:
              summary.firstYmd,
            lastYmd:
              summary.lastYmd,
            firstDrawId:
              summary.firstDrawId,
            lastDrawId:
              summary.lastDrawId,
            source:
              "bootstrap_plus_incremental",
            incrementalUpdatedAt:
              new Date().toISOString(),
            staleReason: null,
            staleAt: null,
          },
          dependencies.repositoryDependencies || {}
        );

        compactUpdated = true;
      } catch (error) {
        compactError = String(
          error?.message ||
          error ||
          "compact_incremental_failed"
        );

        console.warn(
          "[TOP3-HISTORY] Compacto incremental falhou; " +
          "a leitura mensal continuará disponível:",
          compactError
        );

        try {
          await saveCompactManifest(
            lotteryKey,
            {
              status: "stale",
              staleReason:
                compactError,
              staleAt:
                new Date().toISOString(),
            },
            dependencies.repositoryDependencies || {}
          );
        } catch (manifestError) {
          console.warn(
            "[TOP3-HISTORY] Falha ao marcar compacto como stale:",
            manifestError?.message ||
            manifestError
          );
        }
      }
    }

    await saveMetadata(
      lotteryKey,
      {
\'\'\',
    "sync/compact-update/function-scope",
)

sync = (
    sync_prefix +
    sync_function_marker +
    sync_function_body
)
'''

count = text.count(old)

if count != 1:
    raise RuntimeError(
        f"Bloco sync/compact-update no patch: esperado 1; encontrado {count}"
    )

path.write_text(
    text.replace(old, new, 1),
    encoding="utf-8",
    newline="\n",
)

print("SECOND_ANCHOR_FIXED")
