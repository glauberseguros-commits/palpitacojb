"use strict";

const fs = require("fs");

const target = "src/pages/Top3/top3.hooks.js";

let content = fs.readFileSync(target, "utf8");

function replaceOnce(label, before, after) {
  const first = content.indexOf(before);

  if (first < 0) {
    throw new Error(`Âncora não encontrada: ${label}`);
  }

  const second = content.indexOf(
    before,
    first + before.length
  );

  if (second >= 0) {
    throw new Error(`Âncora duplicada: ${label}`);
  }

  content =
    content.slice(0, first) +
    after +
    content.slice(first + before.length);
}

function replaceFirstAfter(label, marker, before, after) {
  const markerIndex = content.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error(`Marcador não encontrado: ${label}`);
  }

  const targetIndex = content.indexOf(before, markerIndex);

  if (targetIndex < 0) {
    throw new Error(`Âncora após marcador não encontrada: ${label}`);
  }

  content =
    content.slice(0, targetIndex) +
    after +
    content.slice(targetIndex + before.length);
}

/* ================================================================================================
   1. Converte o snapshot persistido para o formato visual dos cards.
================================================================================================ */

replaceOnce(
  "helper hydratePersistedTop3",
`function makeTargetKey(ymd, hour) {
  const y = safeStr(ymd);
  const h = toHourBucket(hour);
  return isYMD(y) && h ? \`\${y}_\${h}\` : "";
}

function resolveLayerMetaText(analytics) {`,
`function makeTargetKey(ymd, hour) {
  const y = safeStr(ymd);
  const h = toHourBucket(hour);
  return isYMD(y) && h ? \`\${y}_\${h}\` : "";
}

function hydratePersistedTop3(entry) {
  const snapshot = Array.isArray(entry?.snapshot)
    ? entry.snapshot.slice(0, 3)
    : [];

  return snapshot
    .map((item, index) => {
      const grupo = Number(item?.grupo);

      if (
        !Number.isFinite(grupo) ||
        grupo < 1 ||
        grupo > 25
      ) {
        return null;
      }

      return {
        ...item,

        rank: Number(item?.rank || index + 1),
        grupo,

        animal:
          safeStr(item?.animal) ||
          safeStr(getAnimalLabel(grupo)),

        prob: Number(item?.prob || 0),
        probPct: Number(item?.probPct || 0),

        milhares20: Array.isArray(item?.milhares20)
          ? item.milhares20.slice(0, 20)
          : [],

        milharesCols: Array.isArray(item?.milharesCols)
          ? item.milharesCols
          : [],

        imgBg: [getGrupoImgSrc(grupo, 512)]
          .filter(Boolean),

        imgIcon: buildResultStyleImgVariants(
          grupo,
          96
        ),

        persistedSnapshot: true,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function findExactPersistedPrediction({
  history,
  lotteryKey,
  targetYmd,
  targetHour,
}) {
  const lottery = safeStr(lotteryKey).toUpperCase();
  const ymd = safeStr(targetYmd);
  const hour = toHourBucket(targetHour);

  return (
    (Array.isArray(history) ? history : []).find(
      (entry) =>
        safeStr(entry?.lotteryKey).toUpperCase() ===
          lottery &&
        safeStr(entry?.targetYmd) === ymd &&
        toHourBucket(entry?.targetHour) === hour
    ) || null
  );
}

function resolveLayerMetaText(analytics) {`
);

/* ================================================================================================
   2. Estados da previsão persistida atual.
================================================================================================ */

replaceOnce(
  "estados da previsão atual",
`  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);
  const [reconcileRetryNonce, setReconcileRetryNonce] = useState(0);`,
`  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);

  const [
    currentPersistedPrediction,
    setCurrentPersistedPrediction,
  ] = useState(null);

  const [
    currentPersistedResolved,
    setCurrentPersistedResolved,
  ] = useState(false);

  const [reconcileRetryNonce, setReconcileRetryNonce] = useState(0);`
);

/* ================================================================================================
   3. Limpa a previsão persistida ao trocar consulta.
================================================================================================ */

replaceOnce(
  "reset da previsão persistida",
`    setSkipPtRio18ByFederal(false);
    setBaseDrawState(null);

    setLastInfo({`,
`    setSkipPtRio18ByFederal(false);
    setBaseDrawState(null);

    setCurrentPersistedPrediction(null);
    setCurrentPersistedResolved(false);

    setLastInfo({`
);

/* ================================================================================================
   4. Carrega o snapshot exato antes da geração dos cards.
================================================================================================ */

replaceOnce(
  "efeito de carregamento do snapshot atual",
`  useEffect(() => {
    if (loading) return undefined;

    if (
      !baseDrawState ||
      !Array.isArray(rangeDraws) ||
      !rangeDraws.length
    ) {`,
`  useEffect(() => {
    let alive = true;

    setCurrentPersistedPrediction(null);
    setCurrentPersistedResolved(false);

    async function loadCurrentPersistedPrediction() {
      if (
        !isYMD(analysisYmd) ||
        !analysisHourBucket
      ) {
        if (alive) {
          setCurrentPersistedPrediction(null);
          setCurrentPersistedResolved(true);
        }

        return;
      }

      try {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          schedule: [analysisHourBucket],
        });

        const exact = findExactPersistedPrediction({
          history,
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          targetHour: analysisHourBucket,
        });

        if (alive) {
          setCurrentPersistedPrediction(exact);
        }
      } catch (error) {
        if (debugTop3) {
          console.warn(
            "[TOP3 CURRENT SNAPSHOT LOAD]",
            error
          );
        }

        if (alive) {
          setCurrentPersistedPrediction(null);
        }
      } finally {
        if (alive) {
          setCurrentPersistedResolved(true);
        }
      }
    }

    loadCurrentPersistedPrediction();

    return () => {
      alive = false;
    };
  }, [
    lotteryKeySafe,
    analysisYmd,
    analysisHourBucket,
    debugTop3,
  ]);

  useEffect(() => {
    if (loading) return undefined;

    if (
      !baseDrawState ||
      !Array.isArray(rangeDraws) ||
      !rangeDraws.length
    ) {`
);

/* ================================================================================================
   5. Espera a leitura do Firestore antes de montar os cards.
================================================================================================ */

replaceOnce(
  "guarda do cálculo dos cards",
`  useEffect(() => {
    if (loading || !analyticsReady) return undefined;

    let cancelled = false;`,
`  useEffect(() => {
    if (
      loading ||
      !analyticsReady ||
      !currentPersistedResolved
    ) {
      return undefined;
    }

    let cancelled = false;`
);

/* ================================================================================================
   6. Snapshot salvo tem prioridade sobre novo cálculo.
================================================================================================ */

replaceOnce(
  "prioridade do snapshot",
`      try {
        const nextTop3 = buildTop3Predictions({
          analytics,
          build20,
          safeStr,
          getAnimalLabel,
          build4ColsFromEngineOut: buildTop3MilharesCols,
          resolveProbValue: resolveTop3ProbValue,
          getGrupoImgSrc,
          buildResultStyleImgVariants,
        });

        if (cancelled) return;

        setTop3(Array.isArray(nextTop3) ? nextTop3 : []);
        setPrimaryComputing(false);`,
`      try {
        const persistedTop3 = hydratePersistedTop3(
          currentPersistedPrediction
        );

        if (persistedTop3.length) {
          if (cancelled) return;

          setTop3(persistedTop3);
          setPrimaryComputing(false);

          return;
        }

        const nextTop3 = buildTop3Predictions({
          analytics,
          build20,
          safeStr,
          getAnimalLabel,
          build4ColsFromEngineOut: buildTop3MilharesCols,
          resolveProbValue: resolveTop3ProbValue,
          getGrupoImgSrc,
          buildResultStyleImgVariants,
        });

        if (cancelled) return;

        setTop3(Array.isArray(nextTop3) ? nextTop3 : []);
        setPrimaryComputing(false);`
);

/* ================================================================================================
   7. Dependências do cálculo.
================================================================================================ */

replaceOnce(
  "dependências do cálculo",
`  }, [
    loading,
    analyticsReady,
    analytics,
    build20,
  ]);`,
`  }, [
    loading,
    analyticsReady,
    analytics,
    build20,
    currentPersistedResolved,
    currentPersistedPrediction,
  ]);`
);

/* ================================================================================================
   8. Não tenta salvar novamente quando já há snapshot.
================================================================================================ */

replaceOnce(
  "proteção do salvamento",
`    if (!analysisYmd || !analysisHourBucket) return;
    if (!Array.isArray(top3) || !top3.length) return;
    if (!isFutureTarget(analysisYmd, analysisHourBucket)) return;`,
`    if (!analysisYmd || !analysisHourBucket) return;
    if (!currentPersistedResolved) return;
    if (currentPersistedPrediction) return;
    if (!Array.isArray(top3) || !top3.length) return;
    if (!isFutureTarget(analysisYmd, analysisHourBucket)) return;`
);

/* ================================================================================================
   9. Permite consultar o documento definitivo após o salvamento.
================================================================================================ */

replaceFirstAfter(
  "callback assíncrono do salvamento",
  "saveTop3PredictionSnapshot({",
  `.then((result) => {`,
  `.then(async (result) => {`
);

/* ================================================================================================
   10. Após salvar, hidrata imediatamente a mesma previsão.
================================================================================================ */

replaceFirstAfter(
  "hidratação depois do save",
  "saveTop3PredictionSnapshot({",
`        } else {
          console.info(
            "[TOP3 FIRESTORE SAVE OK]",
            diagnostic
          );
        }`,
`        } else {
          let persistedEntry = null;

          if (result?.existing) {
            try {
              const persistedHistory =
                await loadTop3PredictionDay({
                  lotteryKey: lotteryKeySafe,
                  targetYmd: analysisYmd,
                  schedule: [analysisHourBucket],
                });

              persistedEntry =
                findExactPersistedPrediction({
                  history: persistedHistory,
                  lotteryKey: lotteryKeySafe,
                  targetYmd: analysisYmd,
                  targetHour: analysisHourBucket,
                });
            } catch (error) {
              if (debugTop3) {
                console.warn(
                  "[TOP3 SNAPSHOT RELOAD AFTER SAVE]",
                  error
                );
              }
            }
          }

          if (!persistedEntry) {
            persistedEntry = {
              lotteryKey: lotteryKeySafe,
              targetYmd: analysisYmd,
              targetHour: analysisHourBucket,
              targetKey,
              picks,
              snapshot,
              engineVersion,
              status: "predicted",
            };
          }

          setCurrentPersistedPrediction(
            persistedEntry
          );

          setCurrentPersistedResolved(true);

          console.info(
            "[TOP3 FIRESTORE SAVE OK]",
            diagnostic
          );
        }`
);

/* ================================================================================================
   11. Dependências do salvamento.
================================================================================================ */

replaceOnce(
  "dependências do salvamento",
`  }, [
    analysisYmd,
    analysisHourBucket,
    top3,
    lotteryKeySafe,
    debugTop3,
  ]);`,
`  }, [
    analysisYmd,
    analysisHourBucket,
    top3,
    lotteryKeySafe,
    debugTop3,
    currentPersistedResolved,
    currentPersistedPrediction,
  ]);`
);

fs.writeFileSync(target, content, "utf8");

console.log("PATCH_OK");
console.log(`Arquivo alterado: ${target}`);
