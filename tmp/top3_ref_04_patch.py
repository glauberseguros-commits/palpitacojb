from pathlib import Path
import sys

path = Path(r"src/pages/Top3/top3.hooks.js")

if not path.exists():
    raise SystemExit(f"Arquivo não encontrado: {path}")

text = path.read_text(encoding="utf-8")

marker = "TOP3_REF_04_MILHARES_CACHE"

if marker in text:
    raise SystemExit("PATCH_JA_APLICADO")

anchor_refs = '''  const requestIdRef = useRef(0);
  const boundsCacheRef = useRef(new Map());
  const analyticsCacheRef = useRef({ key: "", value: emptyAnalytics() });
'''

replacement_refs = '''  const requestIdRef = useRef(0);
  const boundsCacheRef = useRef(new Map());
  const analyticsCacheRef = useRef({ key: "", value: emptyAnalytics() });

  // TOP3_REF_04_MILHARES_CACHE
  // Cache restrito à carga atual. É limpo sempre que qualquer entrada
  // funcional da geração de milhares muda.
  const milharesCacheRef = useRef(new Map());
'''

if anchor_refs not in text:
    raise SystemExit("Âncora dos refs não encontrada")

text = text.replace(anchor_refs, replacement_refs, 1)

anchor_reset = '''  const build20 = useCallback(
    (grupo2, item = null) => {
      return buildMilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
        count: 20,
        targetYmd: item?.meta?.next?.ymd || analysisYmd,
      });
    },
    [rangeDraws, analysisHourBucket, schedule, analysisYmd]
  );

  const layerMetaText = useMemo(() => {
'''

replacement_reset = '''  useEffect(() => {
    milharesCacheRef.current.clear();
  }, [
    rangeDraws,
    analysisHourBucket,
    scheduleKey,
    analysisYmd,
    lotteryKeySafe,
  ]);

  const buildMilharesCached = useCallback(
    ({ grupo2, count, targetYmd }) => {
      const grupo = Number(grupo2);
      const target = isYMD(targetYmd) ? targetYmd : analysisYmd;

      const cacheKey = [
        lotteryKeySafe,
        analysisHourBucket,
        scheduleKey,
        target,
        Number(count),
        Number.isFinite(grupo) ? grupo : "",
      ].join("|");

      const cached = milharesCacheRef.current.get(cacheKey);

      if (cached) {
        return cached;
      }

      const generated = buildMilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
        count,
        targetYmd: target,
      });

      milharesCacheRef.current.set(cacheKey, generated);

      return generated;
    },
    [
      rangeDraws,
      analysisHourBucket,
      schedule,
      scheduleKey,
      analysisYmd,
      lotteryKeySafe,
    ]
  );

  const build16 = useCallback(
    (grupo2) => {
      return buildMilharesCached({
        grupo2,
        count: 16,
        targetYmd: analysisYmd,
      });
    },
    [buildMilharesCached, analysisYmd]
  );

  const build20 = useCallback(
    (grupo2, item = null) => {
      return buildMilharesCached({
        grupo2,
        count: 20,
        targetYmd: item?.meta?.next?.ymd || analysisYmd,
      });
    },
    [buildMilharesCached, analysisYmd]
  );

  const layerMetaText = useMemo(() => {
'''

if anchor_reset not in text:
    raise SystemExit("Âncora do build20 não encontrada")

text = text.replace(anchor_reset, replacement_reset, 1)

anchor_return = '''    build16: (grupo2) =>
      build16MilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
        targetYmd: analysisYmd,
      }),

    build20,
'''

replacement_return = '''    build16,
    build20,
'''

if anchor_return not in text:
    raise SystemExit("Âncora do retorno build16 não encontrada")

text = text.replace(anchor_return, replacement_return, 1)

path.write_text(text, encoding="utf-8", newline="\n")

print("PATCH_OK")
print(f"Arquivo alterado: {path}")
print("Cache de milhares: inserido")
print("build16: estabilizado")
print("build20: estabilizado")
