from pathlib import Path
import sys

target = Path(r"src/pages/Top3/top3.hooks.js")

if not target.exists():
    raise SystemExit(f"Arquivo não encontrado: {target}")

text = target.read_text(encoding="utf-8")

marker = "TOP3_REF_02_DEFER_SECONDARY"

if marker in text:
    raise SystemExit(
        "TOP3-REF-02 já parece estar aplicado. Nenhuma alteração foi realizada."
    )

replacements = []

replacements.append((
'''  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);
''',
'''  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);

  // TOP3_REF_02_DEFER_SECONDARY
  // Libera primeiro os dados e palpites essenciais.
  // Timeline e persistência são processadas depois, fora do caminho crítico.
  const [secondaryReady, setSecondaryReady] = useState(false);
'''
))

replacements.append((
'''    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");

    // Impede exibir resultados pertencentes à consulta anterior.
''',
'''    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");
    setSecondaryReady(false);

    // Impede exibir resultados pertencentes à consulta anterior.
'''
))

replacements.append((
'''  useEffect(() => {
    debugTop3Effect("02_ensure_timeline", {
''',
'''  useEffect(() => {
    if (
      loading ||
      !baseDrawState ||
      !Array.isArray(rangeDraws) ||
      !rangeDraws.length
    ) {
      setSecondaryReady(false);
      return undefined;
    }

    let cancelled = false;
    let idleId = null;
    let timeoutId = null;

    const activateSecondaryPipeline = () => {
      if (!cancelled) {
        setSecondaryReady(true);
      }
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      idleId = window.requestIdleCallback(
        activateSecondaryPipeline,
        { timeout: 300 }
      );
    } else {
      timeoutId = setTimeout(activateSecondaryPipeline, 0);
    }

    return () => {
      cancelled = true;

      if (
        idleId != null &&
        typeof window !== "undefined" &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }

      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [loading, baseDrawState, rangeDraws]);

  useEffect(() => {
    debugTop3Effect("02_ensure_timeline", {
'''
))

replacements.append((
'''  const timelineTop3 = useMemo(() => {
    const built = buildTop3TimelineViewModel({
''',
'''  const timelineTop3 = useMemo(() => {
    if (!secondaryReady) return [];

    const built = buildTop3TimelineViewModel({
'''
))

replacements.append((
'''    skipPtRio18ByFederal,
  ]);

  useEffect(() => {
    debugTop3Effect("03_save_prediction", {
''',
'''    skipPtRio18ByFederal,
    secondaryReady,
  ]);

  useEffect(() => {
    debugTop3Effect("03_save_prediction", {
'''
))

replacements.append((
'''    debugTop3Effect("04_load_persisted_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: persistedSchedule.length,
    });

    let alive = true;
''',
'''    debugTop3Effect("04_load_persisted_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: persistedSchedule.length,
      secondaryReady,
    });

    if (!secondaryReady) {
      setPersistedTop3History([]);
      return undefined;
    }

    let alive = true;
'''
))

replacements.append((
'''    lotteryKeySafe,
    timelineYmd,
    scheduleKey,
  ]);

  useEffect(() => {
    const persistedSchedule = scheduleKey
''',
'''    lotteryKeySafe,
    timelineYmd,
    scheduleKey,
    secondaryReady,
  ]);

  useEffect(() => {
    const persistedSchedule = scheduleKey
'''
))

replacements.append((
'''      rangeDrawsLength: Array.isArray(rangeDraws)
        ? rangeDraws.length
        : -1,
      loading,
    });

    if (loading) return;
''',
'''      rangeDrawsLength: Array.isArray(rangeDraws)
        ? rangeDraws.length
        : -1,
      loading,
      secondaryReady,
    });

    if (!secondaryReady) return;
    if (loading) return;
'''
))

replacements.append((
'''    scheduleKey,
    debugTop3,
    loading,
  ]);

  return {
''',
'''    scheduleKey,
    debugTop3,
    loading,
    secondaryReady,
  ]);

  return {
'''
))

for old, new in replacements:
    count = text.count(old)

    if count != 1:
        raise SystemExit(
            f"Âncora inválida ou ambígua. Esperado 1, encontrado {count}:\\n"
            + old[:240]
        )

    text = text.replace(old, new, 1)

target.write_text(text, encoding="utf-8", newline="")

print("PATCH_OK")
print(f"ARQUIVO={target}")
print(f"LINHAS={len(text.splitlines())}")
