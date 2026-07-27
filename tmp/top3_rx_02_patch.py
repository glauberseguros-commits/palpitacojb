from pathlib import Path

hooks_path = Path(r"src/pages/Top3/top3.hooks.js")
firestore_path = Path(r"src/pages/Top3/top3.firestore.js")

hooks = hooks_path.read_text(encoding="utf-8")
firestore = firestore_path.read_text(encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 bloco, encontrado {count}"
        )

    return text.replace(old, new, 1)


# ======================================================================================
# 1. TRAVAS GLOBAIS DO MÓDULO
# Sobrevivem à remontagem provocada pelo React.StrictMode durante a sessão atual.
# ======================================================================================

old = '''function emptyAnalytics() {
  return { top: [], meta: null };
}
'''

new = '''const top3SaveRunKeys = new Set();
const top3ReconcileRunKeys = new Set();

function emptyAnalytics() {
  return { top: [], meta: null };
}
'''

hooks = replace_once(
    hooks,
    old,
    new,
    "Inserção das travas globais do TOP3"
)


# ======================================================================================
# 2. CHAVE ESTÁVEL DA GRADE
# Evita usar a identidade do array schedule como gatilho dos efeitos.
# ======================================================================================

old = '''  const isFederalNonDrawDay = useMemo(() => {
    return lotteryKeySafe === "FEDERAL" && !isFederalDrawDay(ymdSafe);
  }, [lotteryKeySafe, ymdSafe]);

  const rangeLabel = useMemo(() => {
'''

new = '''  const isFederalNonDrawDay = useMemo(() => {
    return lotteryKeySafe === "FEDERAL" && !isFederalDrawDay(ymdSafe);
  }, [lotteryKeySafe, ymdSafe]);

  const scheduleKey = useMemo(() => {
    return (Array.isArray(schedule) ? schedule : [])
      .map(toHourBucket)
      .filter(Boolean)
      .join("|");
  }, [schedule]);

  const rangeLabel = useMemo(() => {
'''

hooks = replace_once(
    hooks,
    old,
    new,
    "Criação da chave estável da grade"
)


# ======================================================================================
# 3. TRAVA DO SALVAMENTO
# Evita autenticação/transação repetida para a mesma previsão na mesma sessão.
# ======================================================================================

old = '''    if (!targetKey || !picks.length) return;

    const snapshot = top3.map((item, index) => ({
'''

new = '''    if (!targetKey || !picks.length) return;

    const saveRunKey = [
      lotteryKeySafe,
      targetKey,
      picks.join(","),
    ].join("|");

    if (top3SaveRunKeys.has(saveRunKey)) return;

    top3SaveRunKeys.add(saveRunKey);

    const snapshot = top3.map((item, index) => ({
'''

hooks = replace_once(
    hooks,
    old,
    new,
    "Inserção da trava de salvamento"
)


old = '''        if (!result?.ok) {
          console.error(
            "[TOP3 FIRESTORE SAVE FAILED]",
            diagnostic
          );
        } else {
'''

new = '''        if (!result?.ok) {
          top3SaveRunKeys.delete(saveRunKey);

          console.error(
            "[TOP3 FIRESTORE SAVE FAILED]",
            diagnostic
          );
        } else {
'''

hooks = replace_once(
    hooks,
    old,
    new,
    "Liberação da trava após falha de salvamento"
)


old = '''      .catch((error) => {
        const diagnostic = {
'''

new = '''      .catch((error) => {
        top3SaveRunKeys.delete(saveRunKey);

        const diagnostic = {
'''

hooks = replace_once(
    hooks,
    old,
    new,
    "Liberação da trava após exceção de salvamento"
)


# ======================================================================================
# 4. EFEITO DE LEITURA DO HISTÓRICO
# Remove todayDraws/rangeDraws, pois loadTop3PredictionDay não utiliza esses dados.
# Usa a chave textual da grade em vez da identidade do array.
# ======================================================================================

old = '''  useEffect(() => {
    debugTop3Effect("04_load_persisted_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: Array.isArray(schedule)
        ? schedule.length
        : -1,
      todayDrawsLength: Array.isArray(todayDraws)
        ? todayDraws.length
        : -1,
      rangeDrawsLength: Array.isArray(rangeDraws)
        ? rangeDraws.length
        : -1,
    });

    let alive = true;

    async function loadPersistedHistory() {
      if (!isYMD(timelineYmd)) {
        if (alive) setPersistedTop3History([]);
        return;
      }

      try {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: timelineYmd,
          schedule,
        });

        if (alive) {
          setPersistedTop3History(
            Array.isArray(history) ? history : []
          );
        }
      } catch {
        if (alive) setPersistedTop3History([]);
      }
    }

    loadPersistedHistory();

    return () => {
      alive = false;
    };
  }, [
    lotteryKeySafe,
    timelineYmd,
    schedule,
    todayDraws,
    rangeDraws,
  ]);
'''

new = '''  useEffect(() => {
    const persistedSchedule = scheduleKey
      ? scheduleKey.split("|").filter(Boolean)
      : [];

    debugTop3Effect("04_load_persisted_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: persistedSchedule.length,
    });

    let alive = true;

    async function loadPersistedHistory() {
      if (!isYMD(timelineYmd)) {
        if (alive) setPersistedTop3History([]);
        return;
      }

      try {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: timelineYmd,
          schedule: persistedSchedule,
        });

        if (alive) {
          setPersistedTop3History(
            Array.isArray(history) ? history : []
          );
        }
      } catch {
        if (alive) setPersistedTop3History([]);
      }
    }

    loadPersistedHistory();

    return () => {
      alive = false;
    };
  }, [
    lotteryKeySafe,
    timelineYmd,
    scheduleKey,
  ]);
'''

hooks = replace_once(
    hooks,
    old,
    new,
    "Substituição do efeito de leitura persistida"
)


# ======================================================================================
# 5. EFEITO DE RECONCILIAÇÃO
# - Aguarda o carregamento completo.
# - Deduplica rangeDraws/todayDraws.
# - Gera assinatura baseada nos resultados reais.
# - Evita nova reconciliação do mesmo conteúdo.
# - Usa o histórico retornado pela própria reconciliação.
# ======================================================================================

old = '''  useEffect(() => {
    debugTop3Effect("05_reconcile_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: Array.isArray(schedule)
        ? schedule.length
        : -1,
      todayDrawsLength: Array.isArray(todayDraws)
        ? todayDraws.length
        : -1,
      rangeDrawsLength: Array.isArray(rangeDraws)
        ? rangeDraws.length
        : -1,
    });

    if (!(todayDraws?.length || rangeDraws?.length)) return;

    const allDraws = [
      ...(Array.isArray(rangeDraws) ? rangeDraws : []),
      ...(Array.isArray(todayDraws) ? todayDraws : []),
    ];

    reconcilePendingTop3Log({
      todayDraws: Array.isArray(todayDraws) ? todayDraws : [],
      rangeDraws: Array.isArray(rangeDraws) ? rangeDraws : [],
    });

    reconcileTop3PredictionDay({
      lotteryKey: lotteryKeySafe,
      targetYmd: timelineYmd,
      schedule,
      draws: allDraws,
    })
      .then(async () => {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: timelineYmd,
          schedule,
        });

        setPersistedTop3History(
          Array.isArray(history) ? history : []
        );
      })
      .catch((error) => {
        if (debugTop3) {
          console.warn("[TOP3 FIRESTORE RECONCILE]", error);
        }
      });
  }, [
    todayDraws,
    rangeDraws,
    lotteryKeySafe,
    timelineYmd,
    schedule,
    debugTop3,
  ]);
'''

new = '''  useEffect(() => {
    const persistedSchedule = scheduleKey
      ? scheduleKey.split("|").filter(Boolean)
      : [];

    debugTop3Effect("05_reconcile_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: persistedSchedule.length,
      todayDrawsLength: Array.isArray(todayDraws)
        ? todayDraws.length
        : -1,
      rangeDrawsLength: Array.isArray(rangeDraws)
        ? rangeDraws.length
        : -1,
      loading,
    });

    if (loading) return;
    if (!isYMD(timelineYmd)) return;
    if (!(todayDraws?.length || rangeDraws?.length)) return;

    const drawMap = new Map();

    for (const draw of [
      ...(Array.isArray(rangeDraws) ? rangeDraws : []),
      ...(Array.isArray(todayDraws) ? todayDraws : []),
    ]) {
      if (pickDrawYMD(draw) !== timelineYmd) continue;

      const key = drawKey(draw);
      if (!key) continue;

      drawMap.set(key, draw);
    }

    const targetDraws = Array.from(drawMap.values()).sort(
      (a, b) => drawTs(a) - drawTs(b)
    );

    if (!targetDraws.length) return;

    const drawSignature = targetDraws
      .map((draw) => {
        const key = drawKey(draw);
        const grupo = Number(
          pickPrize1GrupoFromDraw(draw) || 0
        );

        const prize1 = Array.isArray(draw?.prizes)
          ? draw.prizes.find(
              (item) => Number(item?.position) === 1
            ) || draw.prizes[0]
          : null;

        const milhar = safeStr(
          prize1?.milhar ??
            prize1?.numero ??
            prize1?.number ??
            prize1?.valor ??
            draw?.prize_1 ??
            ""
        );

        return `${key}:${grupo}:${milhar}`;
      })
      .join(",");

    const reconcileRunKey = [
      lotteryKeySafe,
      timelineYmd,
      scheduleKey,
      drawSignature,
    ].join("|");

    if (top3ReconcileRunKeys.has(reconcileRunKey)) return;

    top3ReconcileRunKeys.add(reconcileRunKey);

    let alive = true;

    reconcilePendingTop3Log({
      todayDraws: Array.isArray(todayDraws) ? todayDraws : [],
      rangeDraws: Array.isArray(rangeDraws) ? rangeDraws : [],
    });

    reconcileTop3PredictionDay({
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
      });

    return () => {
      alive = false;
    };
  }, [
    todayDraws,
    rangeDraws,
    lotteryKeySafe,
    timelineYmd,
    scheduleKey,
    debugTop3,
    loading,
  ]);
'''

hooks = replace_once(
    hooks,
    old,
    new,
    "Substituição do efeito de reconciliação"
)


# ======================================================================================
# 6. FIRESTORE: RECONCILIAÇÃO PASSA A DEVOLVER O HISTÓRICO ATUALIZADO
# Isso elimina o loadTop3PredictionDay adicional feito anteriormente pelo controller.
# ======================================================================================

old = '''  const lottery = normalizeLotteryKey(lotteryKey);
  let updated = 0;

  for (const entry of history) {
    if (!entry) continue;

    const realDraw = findDrawForTarget({
      draws,
      targetYmd: entry?.targetYmd,
      targetHour: entry?.targetHour,
    });

    if (!realDraw) continue;

    const resultGrupo = Number(
      pickPrize1GrupoFromDraw(realDraw)
    );

    if (
      !Number.isFinite(resultGrupo) ||
      resultGrupo < 1 ||
      resultGrupo > 25
    ) {
      continue;
    }

    const resultMilhar = extractPrize1Milhar(realDraw);
    const savedLottery = safeStr(
      entry?.resultLotteryKey
    ).toUpperCase();
    const savedGrupo = Number(entry?.resultGrupo);
    const savedMilhar = normalizeMilhar(entry?.resultMilhar);

    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      resultGrupo,
      resultMilhar
    );

    const alreadyMatchesRealResult =
      entry?.status === "validated" &&
      savedLottery === lottery &&
      savedGrupo === resultGrupo &&
      savedMilhar === resultMilhar &&
      safeStr(entry?.hitType) === analysis.hitType &&
      Number(entry?.hitScore) === analysis.hitScore &&
      Number(entry?.hitPosition) === analysis.hitPosition &&
      safeStr(entry?.matchedValue) === analysis.matchedValue;

    if (alreadyMatchesRealResult) {
      continue;
    }

    const ref = doc(db, COLLECTION, entry.id);
    const now = Date.now();

    await setDoc(
      ref,
      {
        resultGrupo,
        resultMilhar,
        resultLotteryKey: lottery,
        resultAnimal: safeStr(
          extractPrize1(realDraw)?.animal || ""
        ),
        hitType: analysis.hitType,
        hitScore: analysis.hitScore,
        hitPosition: analysis.hitPosition,
        matchedValue: analysis.matchedValue,
        validatedAt: now,
        validatedBy: user.uid,
        updatedAt: now,
        status: "validated",
      },
      { merge: true }
    );

    updated += 1;
  }

  return {
    ok: true,
    updated,
  };
'''

new = '''  const lottery = normalizeLotteryKey(lotteryKey);
  let updated = 0;
  const reconciledHistory = [];

  for (const entry of history) {
    if (!entry) continue;

    const realDraw = findDrawForTarget({
      draws,
      targetYmd: entry?.targetYmd,
      targetHour: entry?.targetHour,
    });

    if (!realDraw) {
      reconciledHistory.push(entry);
      continue;
    }

    const resultGrupo = Number(
      pickPrize1GrupoFromDraw(realDraw)
    );

    if (
      !Number.isFinite(resultGrupo) ||
      resultGrupo < 1 ||
      resultGrupo > 25
    ) {
      reconciledHistory.push(entry);
      continue;
    }

    const resultMilhar = extractPrize1Milhar(realDraw);
    const savedLottery = safeStr(
      entry?.resultLotteryKey
    ).toUpperCase();
    const savedGrupo = Number(entry?.resultGrupo);
    const savedMilhar = normalizeMilhar(entry?.resultMilhar);

    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      resultGrupo,
      resultMilhar
    );

    const alreadyMatchesRealResult =
      entry?.status === "validated" &&
      savedLottery === lottery &&
      savedGrupo === resultGrupo &&
      savedMilhar === resultMilhar &&
      safeStr(entry?.hitType) === analysis.hitType &&
      Number(entry?.hitScore) === analysis.hitScore &&
      Number(entry?.hitPosition) === analysis.hitPosition &&
      safeStr(entry?.matchedValue) === analysis.matchedValue;

    if (alreadyMatchesRealResult) {
      reconciledHistory.push(entry);
      continue;
    }

    const ref = doc(db, COLLECTION, entry.id);
    const now = Date.now();

    const validationPayload = {
      resultGrupo,
      resultMilhar,
      resultLotteryKey: lottery,
      resultAnimal: safeStr(
        extractPrize1(realDraw)?.animal || ""
      ),
      hitType: analysis.hitType,
      hitScore: analysis.hitScore,
      hitPosition: analysis.hitPosition,
      matchedValue: analysis.matchedValue,
      validatedAt: now,
      validatedBy: user.uid,
      updatedAt: now,
      status: "validated",
    };

    await setDoc(
      ref,
      validationPayload,
      { merge: true }
    );

    reconciledHistory.push({
      ...entry,
      ...validationPayload,
    });

    updated += 1;
  }

  return {
    ok: true,
    updated,
    history: reconciledHistory,
  };
'''

firestore = replace_once(
    firestore,
    old,
    new,
    "Retorno do histórico reconciliado"
)


hooks_path.write_text(hooks, encoding="utf-8")
firestore_path.write_text(firestore, encoding="utf-8")

print("PATCH_OK")
print(hooks_path)
print(firestore_path)
