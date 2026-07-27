"use strict";

const fs = require("fs");

const target = "src/pages/Top3/top3.hooks.js";
let content = fs.readFileSync(target, "utf8");

function replaceOnce(label, before, after) {
  const first = content.indexOf(before);

  if (first < 0) {
    throw new Error(`Âncora não encontrada: ${label}`);
  }

  const second = content.indexOf(before, first + before.length);

  if (second >= 0) {
    throw new Error(`Âncora duplicada: ${label}`);
  }

  content =
    content.slice(0, first) +
    after +
    content.slice(first + before.length);
}

/* ================================================================================================
   1. Helper para transformar o snapshot persistido no mesmo formato visual usado pelos cards.
================================================================================================ */

replaceOnce(
  "helper após makeTargetKey",
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

      const imgBg =
        Array.isArray(item?.imgBg) && item.imgBg.length
          ? item.imgBg.filter(Boolean)
          : [getGrupoImgSrc(grupo, 512)].filter(Boolean);

      const imgIcon =
        Array.isArray(item?.imgIcon) && item.imgIcon.length
          ? item.imgIcon.filter(Boolean)
          : buildResultStyleImgVariants(grupo, 96);

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
        imgBg,
        imgIcon,
        persistedSnapshot: true,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function resolveLayerMetaText(analytics) {`
);

/* ================================================================================================
   2. Estados que controlam a leitura do snapshot do sorteio-alvo.
================================================================================================ */

replaceOnce(
  "estados de persistência",
`  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);
  const [reconcileRetryNonce, setReconcileRetryNonce] = useState(0);`,
`  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);
  const [currentPersistedPrediction, setCurrentPersistedPrediction] =
    useState(null);
  const [currentPersistedResolved, setCurrentPersistedResolved] =
    useState(false);
  const [reconcileRetryNonce, setReconcileRetryNonce] = useState(0);`
);

/* ================================================================================================
   3. Limpeza completa ao trocar loteria, data ou consulta.
================================================================================================ */

replaceOnce(
  "reset da previsão persistida",
`    setLoadedYmd("");
    setLastHourBucket("");
    setTargetHourBucket("");
    setTargetYmd("");
    setSkipPtRio18ByFederal(false);
    setBaseDrawState(null);`,
`    setLoadedYmd("");
    setLastHourBucket("");
    setTargetHourBucket("");
    setTargetYmd("");
    setSkipPtRio18ByFederal(false);
    setBaseDrawState(null);
    setCurrentPersistedPrediction(null);
    setCurrentPersistedResolved(false);`
);

/* ================================================================================================
   4. Carrega primeiro o snapshot exato da loteria/data/horário atual.
================================================================================================ */

replaceOnce(
  "efeito antes do cálculo de analytics",
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
      if (!isYMD(analysisYmd) || !analysisHourBucket) {
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

        const exactEntry = (
          Array.isArray(history) ? history : []
        ).find((entry) => {
          return (
            safeStr(entry?.lotteryKey).toUpperCase() ===
              lotteryKeySafe &&
            safeStr(entry?.targetYmd) === analysisYmd &&
            toHourBucket(entry?.targetHour) ===
              analysisHourBucket
          );
        }) || null;

        if (alive) {
          setCurrentPersistedPrediction(exactEntry);
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
   5. O cálculo dos cards espera a consulta do snapshot.
      Se já existe snapshot, ele prevalece sobre qualquer recálculo do motor.
================================================================================================ */

replaceOnce(
  "bloqueio do cálculo até resolver snapshot",
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

replaceOnce(
  "prioridade do snapshot persistido",
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
   6. Impede novo salvamento quando o sorteio já possui snapshot congelado.
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
   7. Após criar um snapshot novo, ele passa imediatamente a ser a fonte oficial da tela.
================================================================================================ */

replaceOnce(
  "hidratação após salvamento",
`        } else {
          console.info(
            "[TOP3 FIRESTORE SAVE OK]",
            diagnostic
          );
        }`,
`        } else {
          const persistedEntry = {
            lotteryKey: lotteryKeySafe,
            targetYmd: analysisYmd,
            targetHour: analysisHourBucket,
            targetKey,
            picks,
            snapshot,
            engineVersion,
            status: "predicted",
          };

          setCurrentPersistedPrediction(persistedEntry);
          setCurrentPersistedResolved(true);

          console.info(
            "[TOP3 FIRESTORE SAVE OK]",
            diagnostic
          );
        }`
);

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
