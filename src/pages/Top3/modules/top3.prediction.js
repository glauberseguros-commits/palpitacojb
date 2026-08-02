function clampProb(v) {
  const n = Number(v);

  if (!Number.isFinite(n)) return 0;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));

  return Math.max(0, Math.min(1, n));
}

function isValidGrupo(g) {
  const n = Number(g);

  return (
    Number.isFinite(n) &&
    n >= 1 &&
    n <= 25
  );
}

/*
 * TOP3_BUILD24_SNAPSHOT_CONTRACT_V1
 *
 * O mesmo conjunto de 24 milhares exibido ao usuário é entregue
 * à persistência e, posteriormente, à avaliação histórica.
 */
export function buildTop3Predictions({
  analytics,
  build24,
  safeStr,
  toHourBucket,
  getAnimalLabel,
  build4ColsFromEngineOut,
  resolveProbValue,
  getGrupoImgSrc,
  buildResultStyleImgVariants,
}) {
  const arr = Array.isArray(analytics?.top)
    ? analytics.top
    : [];

  const milharesCache = new Map();

  return arr
    .filter((x) => isValidGrupo(x?.grupo))
    .slice(0, 3)
    .map((x) => {
      const g = Number(x.grupo);

      const animal = safeStr(
        getAnimalLabel(g) || ""
      );

      const nextY = safeStr(
        x?.meta?.next?.ymd || ""
      );

      const nextH = toHourBucket
        ? toHourBucket(
            x?.meta?.next?.hour || ""
          )
        : safeStr(
            x?.meta?.next?.hour || ""
          );

      const cacheKey =
        `${g}|${nextY}|${nextH}`;

      let out = milharesCache.get(cacheKey);

      if (!out) {
        out = build24(g, x);
        milharesCache.set(cacheKey, out);
      }

      const milharesCols =
        build4ColsFromEngineOut(
          out,
          4,
          6
        );

      const milhares24 = milharesCols
        .flatMap((column) => {
          return Array.isArray(column?.items)
            ? column.items
            : [];
        })
        .slice(0, 24);

      const milhares20 =
        milhares24.slice(0, 20);

      const prob = clampProb(
        resolveProbValue(x)
      );

      const probPct = prob * 100;

      const bgPrimary =
        getGrupoImgSrc(g, 512);

      const iconVariants =
        buildResultStyleImgVariants(
          g,
          96
        );

      return {
        ...x,
        animal,
        imgBg: bgPrimary
          ? [bgPrimary]
          : [],
        imgIcon: iconVariants,
        prob,
        probPct,
        meta: x?.meta || null,

        /*
         * Contrato canônico atual.
         */
        milharesCols,
        milhares24,

        /*
         * Compatibilidade temporária com consumidores legados.
         */
        milhares20,
      };
    });
}
