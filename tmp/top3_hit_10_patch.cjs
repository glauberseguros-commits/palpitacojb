"use strict";

const fs = require("fs");

const target = "./src/pages/Top3/top3.hooks.js";

let content = fs.readFileSync(target, "utf8");
const original = content;

function replaceOnce(label, oldValue, newValue) {
  const first = content.indexOf(oldValue);
  const last = content.lastIndexOf(oldValue);

  if (first < 0) {
    throw new Error(`${label}: bloco não localizado.`);
  }

  if (first !== last) {
    throw new Error(`${label}: mais de uma ocorrência localizada.`);
  }

  content =
    content.slice(0, first) +
    newValue +
    content.slice(first + oldValue.length);
}

/*
 * 1. Controle global das retentativas.
 *
 * A chave de execução continua impedindo chamadas duplicadas simultâneas,
 * mas não bloqueia definitivamente uma reconciliação que terminou sem
 * atualizar um registro ainda pendente.
 */
replaceOnce(
  "Mapa global de retentativas",
  `const top3SaveRunKeys = new Set();
const top3ReconcileRunKeys = new Set();`,
  `const top3SaveRunKeys = new Set();
const top3ReconcileRunKeys = new Set();
const top3ReconcileRetryCounts = new Map();

const TOP3_RECONCILE_MAX_RETRIES = 3;
const TOP3_RECONCILE_RETRY_DELAY_MS = 1200;`
);

/*
 * 2. Estado usado exclusivamente para disparar uma nova tentativa
 * controlada sem recarregar toda a página.
 */
replaceOnce(
  "Estado de retentativa",
  `  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);`,
  `  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);
  const [reconcileRetryNonce, setReconcileRetryNonce] = useState(0);`
);

/*
 * 3. Substitui o tratamento do retorno da reconciliação.
 *
 * Regras:
 * - erro: libera a chave imediatamente;
 * - atualização realizada: encerra e limpa contador;
 * - nenhuma atualização, mas existe previsão pendente com resultado:
 *   libera a chave e tenta novamente;
 * - máximo de três retentativas para evitar loop.
 */
replaceOnce(
  "Tratamento completo da reconciliação",
  `    reconcileTop3PredictionDay({
      lotteryKey: lotteryKeySafe,
      targetYmd: timelineYmd,
      schedule: persistedSchedule,
      draws: targetDraws,
    })
      .then((result) => {
        if (!alive) return;

        if (!result?.ok) {
          top3ReconcileRunKeys.delete(reconcileRunKey);
          return;
        }

        setPersistedTop3History(
          Array.isArray(result?.history)
            ? result.history
            : []
        );
      })
      .catch((error) => {
        top3ReconcileRunKeys.delete(reconcileRunKey);

        if (debugTop3) {
          console.warn("[TOP3 FIRESTORE RECONCILE]", error);
        }
      });`,
  `    reconcileTop3PredictionDay({
      lotteryKey: lotteryKeySafe,
      targetYmd: timelineYmd,
      schedule: persistedSchedule,
      draws: targetDraws,
    })
      .then((result) => {
        if (!result?.ok) {
          top3ReconcileRunKeys.delete(reconcileRunKey);
          top3ReconcileRetryCounts.delete(reconcileRunKey);
          return;
        }

        const reconciledHistory = Array.isArray(result?.history)
          ? result.history
          : [];

        if (alive) {
          setPersistedTop3History(reconciledHistory);
        }

        const targetDrawKeys = new Set(
          targetDraws
            .map((draw) => drawKey(draw))
            .filter(Boolean)
        );

        const hasPendingResult = reconciledHistory.some((entry) => {
          const y = safeStr(entry?.targetYmd);
          const h = toHourBucket(entry?.targetHour);
          const key = isYMD(y) && h ? \`\${y}|\${h}\` : "";

          return (
            key &&
            targetDrawKeys.has(key) &&
            safeStr(entry?.status).toLowerCase() !== "validated"
          );
        });

        const updated = Number(result?.updated || 0);

        if (updated > 0 || !hasPendingResult) {
          top3ReconcileRetryCounts.delete(reconcileRunKey);
          return;
        }

        const retryCount =
          Number(top3ReconcileRetryCounts.get(reconcileRunKey) || 0) + 1;

        if (retryCount > TOP3_RECONCILE_MAX_RETRIES) {
          top3ReconcileRunKeys.delete(reconcileRunKey);
          top3ReconcileRetryCounts.delete(reconcileRunKey);

          if (debugTop3) {
            console.warn(
              "[TOP3 FIRESTORE RECONCILE RETRIES EXHAUSTED]",
              {
                reconcileRunKey,
                retryCount: retryCount - 1,
                historyLength: reconciledHistory.length,
              }
            );
          }

          return;
        }

        top3ReconcileRetryCounts.set(
          reconcileRunKey,
          retryCount
        );

        window.setTimeout(() => {
          top3ReconcileRunKeys.delete(reconcileRunKey);

          if (alive) {
            setReconcileRetryNonce((value) => value + 1);
          }
        }, TOP3_RECONCILE_RETRY_DELAY_MS);
      })
      .catch((error) => {
        top3ReconcileRunKeys.delete(reconcileRunKey);
        top3ReconcileRetryCounts.delete(reconcileRunKey);

        if (debugTop3) {
          console.warn("[TOP3 FIRESTORE RECONCILE]", error);
        }
      });`
);

/*
 * 4. Inclui o nonce nas dependências do efeito.
 */
replaceOnce(
  "Dependência da retentativa",
  `    loading,
    secondaryReady,
  ]);`,
  `    loading,
    secondaryReady,
    reconcileRetryNonce,
  ]);`
);

if (content === original) {
  throw new Error("Nenhuma alteração foi aplicada.");
}

const retryMapOccurrences = (
  content.match(/top3ReconcileRetryCounts/g) || []
).length;

const nonceOccurrences = (
  content.match(/reconcileRetryNonce/g) || []
).length;

if (retryMapOccurrences < 5) {
  throw new Error(
    `Validação falhou: referências ao mapa de retentativas = ${retryMapOccurrences}.`
  );
}

if (nonceOccurrences < 2) {
  throw new Error(
    `Validação falhou: referências ao nonce = ${nonceOccurrences}.`
  );
}

fs.writeFileSync(target, content, "utf8");

console.log("PATCH_STATUS=OK");
console.log(`RETRY_MAP_REFERENCES=${retryMapOccurrences}`);
console.log(`NONCE_REFERENCES=${nonceOccurrences}`);

