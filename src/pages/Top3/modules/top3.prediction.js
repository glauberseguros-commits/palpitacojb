export function buildTop3Predictions({
  analytics,
  build20,
  safeStr,
  getAnimalLabel,
  build4ColsFromEngineOut,
  resolveProbValue,
  getGrupoImgSrc,
  buildResultStyleImgVariants,
}) {
  const arr = Array.isArray(analytics?.top) ? analytics.top : [];
  const milharesCache = new Map();

  const result = arr.map((x) => {
    const g = Number(x.grupo);
    const animal = safeStr(getAnimalLabel(g) || "");

    let out = milharesCache.get(g);

    if (!out) {
      out = build20(g);
      milharesCache.set(g, out);
    }

    const milharesCols = build4ColsFromEngineOut(out, 4, 5);
    const milhares20 = milharesCols.flatMap((c) => c.items).slice(0, 20);

    const prob = resolveProbValue(x);
    const probPct = prob * 100;

    const bgPrimary = getGrupoImgSrc(g, 512);
    const iconVariants = buildResultStyleImgVariants(g, 96);

    return {
      ...x,
      animal,
      imgBg: [bgPrimary],
      imgIcon: iconVariants,
      prob,
      probPct,
      meta: x?.meta || null,
      milharesCols,
      milhares20,
    };
  });

  return result;
}