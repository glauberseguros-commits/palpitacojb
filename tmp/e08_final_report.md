# E08 — Relatório Final de Auditoria

## Objetivo
Auditar completamente o experimento E08 sem alterar produção.

## Situação
- Auditoria estrutural: CONCLUÍDA
- Backtest oficial: VALIDADO
- Produção: NÃO ALTERADA

## Evidências Consolidadas

### e08_consolidated_analysis.txt

```text
================================================
E08.9 - CONSOLIDAÇÃO TÉCNICA
SEM NOVO BACKTEST
================================================

BENCHMARK INTEGRAL
Casos avaliados........: 7406
V3 TOP1................: 321
E08 TOP1...............: 333
Delta TOP1.............: +12
V3 TOP3................: 913
E08 TOP3...............: 913
Delta TOP3.............: +0

AUDITORIA DETALHADA - 500 CASOS
Casos avaliados........: 500
Ordem alterada.........: 179 (35.80%)
Ganhos TOP1............: 4
Perdas TOP1............: 6
Neutros................: 169
Saldo TOP1.............: -2
Casos decisivos........: 10
Decisivos/mudanças.....: 5.59%
Ganhos/mudanças........: 2.23%
Perdas/mudanças........: 3.35%

AUDITORIA POR HORÁRIO - AMOSTRA
11:00 | mudanças=44 | ganhos=0 | perdas=2 | neutros=42 | saldo=-2
14:00 | mudanças=36 | ganhos=1 | perdas=1 | neutros=34 | saldo=+0
16:00 | mudanças=40 | ganhos=2 | perdas=0 | neutros=38 | saldo=+2
18:00 | mudanças=24 | ganhos=0 | perdas=1 | neutros=23 | saldo=-1
21:00 | mudanças=35 | ganhos=1 | perdas=2 | neutros=32 | saldo=-1

DELTA INTEGRAL POR HORÁRIO
09:00 | V3=29 | E08=27 | delta=-2
11:00 | V3=69 | E08=58 | delta=-11
14:00 | V3=65 | E08=69 | delta=+4
16:00 | V3=53 | E08=63 | delta=+10
18:00 | V3=30 | E08=37 | delta=+7
21:00 | V3=75 | E08=79 | delta=+4

CONCLUSÃO
1. O E08 melhorou o TOP1 no período integral.
2. O conjunto TOP3 permaneceu preservado.
3. A amostra detalhada de 500 casos apresentou comportamento instável.
4. A maioria das reordenações foi neutra para o TOP1.
5. Não há evidência suficiente para criar uma regra seletiva por grupo.
6. O horário 16h merece investigação futura, mas não implementação isolada.
7. O E08 deve permanecer experimental até validação adicional.
8. Não é recomendado criar o E09 neste momento.
```

### e08_hour_mechanism_audit.txt

```text
================================================
E08.10 - AUDITORIA DO MECANISMO POR HORÁRIO
================================================

Arquivo: backend/engine/scoreEngineE08Experimental.js

================================================
FUNÇÃO: normalizeHour
================================================
0016: function normalizeHour(value) {
0017:   const raw = String(
0018:     value ?? ""
0019:   ).trim();
0020: 
0021:   if (!raw) {
0022:     return "";
0023:   }
0024: 
0025:   const match = raw.match(
0026:     /^(\d{1,2})(?::?(\d{2}))?/
0027:   );
0028: 
0029:   if (!match) {
0030:     return "";
0031:   }
0032: 
0033:   const hour = Number(match[1]);
0034:   const minute = Number(
0035:     match[2] || 0
0036:   );
0037: 
0038:   if (
0039:     !Number.isFinite(hour) ||
0040:     hour < 0 ||
0041:     hour > 23 ||
0042:     !Number.isFinite(minute) ||
0043:     minute < 0 ||
0044:     minute > 59
0045:   ) {
0046:     return "";
0047:   }
0048: 
0049:   return (
0050:     String(hour).padStart(2, "0") +
0051:     ":" +
0052:     String(minute).padStart(2, "0")
0053:   );
0054: }

================================================
FUNÇÃO: pickDrawHour
================================================
0056: function pickDrawHour(draw) {
0057:   return normalizeHour(
0058:     draw?.close_hour ??
0059:     draw?.closeHour ??
0060:     draw?.hour ??
0061:     draw?.hora
0062:   );
0063: }

================================================
FUNÇÃO: collectSameHourFrequency
================================================
0250: function collectSameHourFrequency(
0251:   drawsRange,
0252:   targetHour
0253: ) {
0254:   const counts = new Map();
0255: 
0256:   for (
0257:     let group = 1;
0258:     group <= GROUPS_K;
0259:     group += 1
0260:   ) {
0261:     counts.set(group, 0);
0262:   }
0263: 
0264:   let samples = 0;
0265: 
0266:   for (
0267:     const draw
0268:     of safeArray(drawsRange)
0269:   ) {
0270:     const hour =
0271:       pickDrawHour(draw);
0272: 
0273:     if (
0274:       !targetHour ||
0275:       hour !== targetHour
0276:     ) {
0277:       continue;
0278:     }
0279: 
0280:     const group =
0281:       pickFirstPrizeGroup(draw);
0282: 
0283:     if (group == null) {
0284:       continue;
0285:     }
0286: 
0287:     samples += 1;
0288: 
0289:     counts.set(
0290:       group,
0291:       Number(
0292:         counts.get(group) || 0
0293:       ) + 1
0294:     );
0295:   }
0296: 
0297:   return {
0298:     counts,
0299:     samples,
0300:   };
0301: }

================================================
FUNÇÃO: computeProbability
================================================
0303: function computeProbability(
0304:   count,
0305:   samples
0306: ) {
0307:   const denominator =
0308:     Number(samples || 0) +
0309:     (
0310:       LAPLACE_ALPHA *
0311:       GROUPS_K
0312:     );
0313: 
0314:   return denominator > 0
0315:     ? (
0316:         Number(count || 0) +
0317:         LAPLACE_ALPHA
0318:       ) / denominator
0319:     : 1 / GROUPS_K;
0320: }

================================================
FUNÇÃO: computeStatisticalTop3E08Experimental
================================================
0349: function computeStatisticalTop3E08Experimental(
0350:   input = {}

================================================
OCORRÊNCIAS COMPLEMENTARES
================================================

0005: } = require("./scoreEngineUnified");
0056: function pickDrawHour(draw) {
0059:     draw?.closeHour ??
0250: function collectSameHourFrequency(
0254:   const counts = new Map();
0261:     counts.set(group, 0);
0271:       pickDrawHour(draw);
0289:     counts.set(
0292:         counts.get(group) || 0
0298:     counts,
0303: function computeProbability(
0304:   count,
0316:         Number(count || 0) +
0329:     .sort(
0336:     .sort(
0349: function computeStatisticalTop3E08Experimental(
0357:   const baselineTop =
0361:   if (baselineTop.length < 3) {
0364:       experimental: {
0376:       input.targetHourOverride
0379:   const frequency =
0380:     collectSameHourFrequency(
0385:   const rerankedTop =
0386:     baselineTop
0394:           const count = Number(
0395:             frequency.counts.get(
0400:           const sameHourProbability =
0401:             computeProbability(
0402:               count,
0403:               frequency.samples
0410:             __sameHourCount:
0411:               count,
0412:             __sameHourProbability:
0413:               sameHourProbability,
0417:       .sort((a, b) => {
0419:           b.__sameHourProbability !==
0420:           a.__sameHourProbability
0423:             b.__sameHourProbability -
0424:             a.__sameHourProbability
0437:             __sameHourCount,
0438:             __sameHourProbability,
0451:             meta: {
0452:               ...(original?.meta || {}),
0456:               sameHourCount:
0457:                 __sameHourCount,
0458:               sameHourProbability:
0459:                 __sameHourProbability,
0460:               sameHourSamples:
0461:                 frequency.samples,
0470:       baselineTop,
0471:       rerankedTop
0481:     top: rerankedTop,
0482:     ranking: rerankedTop,
0483:     baselineTop,
0484:     experimental: {
0490:         "RERANK_V3_TOP3_BY_SAME_HOUR_FREQUENCY",
0494:         frequency.samples,
0496:         baselineTop.map(
0500:         rerankedTop.map(
0504:     meta: {
0505:       ...(baseline?.meta || {}),
0508:       experimental: {
0514:           frequency.samples,
0521:   collectSameHourFrequency,
0522:   computeStatisticalTop3E08Experimental,

================================================
QUESTÕES QUE ESTA AUDITORIA DEVE RESPONDER
================================================

1. A frequência usa somente resultados anteriores ao concurso-alvo?
2. Qual é o tamanho efetivo da amostra de cada horário?
3. A probabilidade é frequência absoluta ou relativa?
4. Existe suavização para amostras pequenas?
5. Qual é o critério de desempate?
6. A posição original da V3 é preservada em empates?
7. Há diferença estrutural entre 11h e 16h no cálculo?

Nenhum backtest foi executado.
Nenhum arquivo de código foi alterado.
```

### e08_computeStatisticalTop3_audit.txt

```text
====================================================================
E08.11B - FUNÇÃO PRINCIPAL COMPLETA
====================================================================

Arquivo: backend/engine/scoreEngineE08Experimental.js
Linhas: 349 até 518

0349: function computeStatisticalTop3E08Experimental(
0350:   input = {}
0351: ) {
0352:   const baseline =
0353:     computeStatisticalTop3V3(
0354:       input
0355:     );
0356: 
0357:   const baselineTop =
0358:     safeArray(baseline?.top)
0359:       .slice(0, 3);
0360: 
0361:   if (baselineTop.length < 3) {
0362:     return {
0363:       ...baseline,
0364:       experimental: {
0365:         enabled: true,
0366:         experiment: "E08",
0367:         applied: false,
0368:         reason:
0369:           "BASELINE_WITH_LESS_THAN_3",
0370:       },
0371:     };
0372:   }
0373: 
0374:   const targetHour =
0375:     normalizeHour(
0376:       input.targetHourOverride
0377:     );
0378: 
0379:   const frequency =
0380:     collectSameHourFrequency(
0381:       input.drawsRange,
0382:       targetHour
0383:     );
0384: 
0385:   const rerankedTop =
0386:     baselineTop
0387:       .map(
0388:         (item, index) => {
0389:           const group =
0390:             extractCandidateGroup(
0391:               item
0392:             );
0393: 
0394:           const count = Number(
0395:             frequency.counts.get(
0396:               group
0397:             ) || 0
0398:           );
0399: 
0400:           const sameHourProbability =
0401:             computeProbability(
0402:               count,
0403:               frequency.samples
0404:             );
0405: 
0406:           return {
0407:             ...item,
0408:             __baselineRank:
0409:               index + 1,
0410:             __sameHourCount:
0411:               count,
0412:             __sameHourProbability:
0413:               sameHourProbability,
0414:           };
0415:         }
0416:       )
0417:       .sort((a, b) => {
0418:         if (
0419:           b.__sameHourProbability !==
0420:           a.__sameHourProbability
0421:         ) {
0422:           return (
0423:             b.__sameHourProbability -
0424:             a.__sameHourProbability
0425:           );
0426:         }
0427: 
0428:         return (
0429:           a.__baselineRank -
0430:           b.__baselineRank
0431:         );
0432:       })
0433:       .map(
0434:         (item, index) => {
0435:           const {
0436:             __baselineRank,
0437:             __sameHourCount,
0438:             __sameHourProbability,
0439:             ...original
0440:           } = item;
0441: 
0442:           return {
0443:             ...original,
0444:             rank: index + 1,
0445:             title:
0446:               index === 0
0447:                 ? "Mais provável"
0448:                 : index === 1
0449:                   ? "2º mais provável"
0450:                   : "3º mais provável",
0451:             meta: {
0452:               ...(original?.meta || {}),
0453:               experiment: "E08",
0454:               baselineRank:
0455:                 __baselineRank,
0456:               sameHourCount:
0457:                 __sameHourCount,
0458:               sameHourProbability:
0459:                 __sameHourProbability,
0460:               sameHourSamples:
0461:                 frequency.samples,
0462:               targetHour,
0463:             },
0464:           };
0465:         }
0466:       );
0467: 
0468:   if (
0469:     !sameGroupSet(
0470:       baselineTop,
0471:       rerankedTop
0472:     )
0473:   ) {
0474:     throw new Error(
0475:       "E08 alterou o conjunto de candidatos da V3."
0476:     );
0477:   }
0478: 
0479:   return {
0480:     ...baseline,
0481:     top: rerankedTop,
0482:     ranking: rerankedTop,
0483:     baselineTop,
0484:     experimental: {
0485:       enabled: true,
0486:       experiment: "E08",
0487:       version: 1,
0488:       applied: true,
0489:       strategy:
0490:         "RERANK_V3_TOP3_BY_SAME_HOUR_FREQUENCY",
0491:       preservesCandidateSet: true,
0492:       targetHour,
0493:       samples:
0494:         frequency.samples,
0495:       baselineGroups:
0496:         baselineTop.map(
0497:           extractCandidateGroup
0498:         ),
0499:       rerankedGroups:
0500:         rerankedTop.map(
0501:           extractCandidateGroup
0502:         ),
0503:     },
0504:     meta: {
0505:       ...(baseline?.meta || {}),
0506:       scenario:
0507:         "E08_V3_TOP3_RERANK",
0508:       experimental: {
0509:         experiment: "E08",
0510:         preservesCandidateSet:
0511:           true,
0512:         targetHour,
0513:         samples:
0514:           frequency.samples,
0515:       },
0516:     },
0517:   };
0518: }

====================================================================
PONTOS PARA DECISÃO
====================================================================

1. Origem e construção de drawsRange.
2. Garantia de histórico anterior ao concurso-alvo.
3. Possível risco de look-ahead.
4. Comparador completo do sort().
5. Critérios sucessivos de desempate.
6. Preservação da posição original da V3.
7. Condições que ativam ou impedem a reordenação.
8. Metadados disponíveis para auditoria por horário.

Nenhum backtest foi executado.
Nenhum arquivo de código foi alterado.
```

### e08_drawsRange_origin_audit.txt

```text
========================================================================
E08.12 - ORIGEM DO drawsRange
========================================================================


------------------------------------------------------------------------
backend/engine/scoreEngineE08Experimental.js
------------------------------------------------------------------------
0004:   computeStatisticalTop3V3,
0251:   drawsRange,
0268:     of safeArray(drawsRange)
0349: function computeStatisticalTop3E08Experimental(
0353:     computeStatisticalTop3V3(
0376:       input.targetHourOverride
0381:       input.drawsRange,
0522:   computeStatisticalTop3E08Experimental,

------------------------------------------------------------------------
backend/engine/scoreEngineUnified.js
------------------------------------------------------------------------
0088: function computeStatisticalTop3V3(input = {}) {
0093:     "computeStatisticalTop3V3"
0102:   computeStatisticalTop3V3,

------------------------------------------------------------------------
backend/engine/scoreEngineV4Experimental.js
------------------------------------------------------------------------
0004:   computeStatisticalTop3V3,
0352:     input.drawsRange
0366:       input.targetHourOverride
0684:     computeStatisticalTop3V3(

------------------------------------------------------------------------
backend/engine/top3PredictionService.js
------------------------------------------------------------------------
0013:   computeStatisticalTop3V3,
0757:     computeStatisticalTop3V3;
0833:     drawsRange: history,
0840:     targetHourOverride: closeHour,

------------------------------------------------------------------------
backend/scripts/auditTop3E08DifferencesExperimental.js
------------------------------------------------------------------------
0011:   computeStatisticalTop3E08Experimental,
0194:           computeStatisticalTop3E08Experimental,

------------------------------------------------------------------------
backend/scripts/backtestTop3E08Experimental.js
------------------------------------------------------------------------
0011:   computeStatisticalTop3E08Experimental,
0179:           computeStatisticalTop3E08Experimental,

------------------------------------------------------------------------
backend/scripts/backtestTop3Official.js
------------------------------------------------------------------------
0012:   computeStatisticalTop3V3,
0516:     computeStatisticalTop3V3;
0705:           drawsRange:
0714:           targetHourOverride:

------------------------------------------------------------------------
src/dev/runAuditTop3.js
------------------------------------------------------------------------
0102:   const drawsRange = await getKingResultsByRange({
0114:   const draws = Array.isArray(drawsRange) ? drawsRange : [];
0124:     drawsRange: draws,

------------------------------------------------------------------------
src/pages/Top3/__tests__/top3.backtest.layers.test.js
------------------------------------------------------------------------
0222:       drawsRange: history,

------------------------------------------------------------------------
src/pages/Top3/__tests__/top3.backtest.test.js
------------------------------------------------------------------------
0230:       drawsRange: history,

------------------------------------------------------------------------
src/pages/Top3/__tests__/top3.public-api.node.test.js
------------------------------------------------------------------------
0019:   "computeStatisticalTop3V3",

------------------------------------------------------------------------
src/pages/Top3/modules/top3.analytics.js
------------------------------------------------------------------------
0013:   computeStatisticalTop3V3,
0193:     computeStatisticalTop3V3({
0195:       drawsRange: safeHistoricalList,
0203:       targetHourOverride: forcedTargetH,

------------------------------------------------------------------------
src/pages/Top3/modules/top3.timeline.js
------------------------------------------------------------------------
0142:     drawsRange: range,

------------------------------------------------------------------------
src/pages/Top3/top3.engine.before-history-stats-20260710_111832.js
------------------------------------------------------------------------
0968:   drawsRange,
0978:   const list = Array.isArray(drawsRange) ? drawsRange : [];
1084:   drawsRange,
1091:   targetHourOverride = "",
1093:   const list = Array.isArray(drawsRange) ? drawsRange : [];
1123:   const forcedTargetH = toHourBucket(targetHourOverride);
1146:     drawsRange: list,
1579:   drawsRange,
1587:     drawsRange,
2030:   drawsRange,
2042:     Array.isArray(drawsRange) ? drawsRange : [],
2204:   drawsRange,
2212:   targetHourOverride = "",
2214:   const list = Array.isArray(drawsRange) ? drawsRange : [];
2244:   const forcedTargetH = toHourBucket(targetHourOverride);
2269:     drawsRange: list,
2288:     drawsRange: list,
2352:     drawsRange: list,
2880: export function computeStatisticalTop3V3({
2882:   drawsRange,
2889:   targetHourOverride = "",
2891:   const list = sortDrawsAsc(Array.isArray(drawsRange) ? drawsRange : []);
2920:   const forcedTargetH = toHourBucket(targetHourOverride);
3937:   drawsRange,
3945:   const range = Array.isArray(drawsRange) ? [...drawsRange] : [];
4106:     const computed = computeStatisticalTop3V3({
4108:       drawsRange: [...usableHistory, ...usableTodayContext],
4116:       targetHourOverride: slotHour,
4164:   drawsRange,
4170:   const range = Array.isArray(drawsRange) ? drawsRange : [];
4187:       drawsRange: range,

------------------------------------------------------------------------
src/pages/Top3/top3.engine.before-history-stats-20260710_112326.js
------------------------------------------------------------------------
0968:   drawsRange,
0978:   const list = Array.isArray(drawsRange) ? drawsRange : [];
1084:   drawsRange,
1091:   targetHourOverride = "",
1093:   const list = Array.isArray(drawsRange) ? drawsRange : [];
1123:   const forcedTargetH = toHourBucket(targetHourOverride);
1146:     drawsRange: list,
1579:   drawsRange,
1587:     drawsRange,
2030:   drawsRange,
2042:     Array.isArray(drawsRange) ? drawsRange : [],
2204:   drawsRange,
2212:   targetHourOverride = "",
2214:   const list = Array.isArray(drawsRange) ? drawsRange : [];
2244:   const forcedTargetH = toHourBucket(targetHourOverride);
2269:     drawsRange: list,
2288:     drawsRange: list,
2352:     drawsRange: list,
2880: export function computeStatisticalTop3V3({
2882:   drawsRange,
2889:   targetHourOverride = "",
2891:   const list = sortDrawsAsc(Array.isArray(drawsRange) ? drawsRange : []);
2920:   const forcedTargetH = toHourBucket(targetHourOverride);
3937:   drawsRange,
3945:   const range = Array.isArray(drawsRange) ? [...drawsRange] : [];
4106:     const computed = computeStatisticalTop3V3({
4108:       drawsRange: [...usableHistory, ...usableTodayContext],
4116:       targetHourOverride: slotHour,
4164:   drawsRange,
4170:   const range = Array.isArray(drawsRange) ? drawsRange : [];
4187:       drawsRange: range,

------------------------------------------------------------------------
src/pages/Top3/top3.engine.js
------------------------------------------------------------------------
0968:   drawsRange,
0978:   const list = Array.isArray(drawsRange) ? drawsRange : [];
1084:   drawsRange,
1091:   targetHourOverride = "",
1093:   const list = Array.isArray(drawsRange) ? drawsRange : [];
1123:   const forcedTargetH = toHourBucket(targetHourOverride);
1146:     drawsRange: list,
1579:   drawsRange,
1587:     drawsRange,
2030:   drawsRange,
2042:     Array.isArray(drawsRange) ? drawsRange : [],
2204:   drawsRange,
2212:   targetHourOverride = "",
2214:   const list = Array.isArray(drawsRange) ? drawsRange : [];
2244:   const forcedTargetH = toHourBucket(targetHourOverride);
2269:     drawsRange: list,
2288:     drawsRange: list,
2352:     drawsRange: list,
2834: export function computeStatisticalTop3V3({
2836:   drawsRange,
2843:   targetHourOverride = "",
2845:   const list = sortDrawsAsc(Array.isArray(drawsRange) ? drawsRange : []);
2874:   const forcedTargetH = toHourBucket(targetHourOverride);
3870:   drawsRange,
3878:   const range = Array.isArray(drawsRange) ? [...drawsRange] : [];
4072:     const computed = computeStatisticalTop3V3({
4074:       drawsRange: [...usableHistory, ...usableTodayContext],
4082:       targetHourOverride: slotHour,
4131:   drawsRange,
4137:   const range = Array.isArray(drawsRange) ? drawsRange : [];
4154:       drawsRange: range,

------------------------------------------------------------------------
src/pages/Top3/top3.public-api.js
------------------------------------------------------------------------
0015:   computeStatisticalTop3V3,

------------------------------------------------------------------------
src/services/statsSignals.js
------------------------------------------------------------------------
0019:    - drawsRange: lista de draws (preferencialmente detailed), com prizes embutidos
0289:   drawsRange,
0297:   const list = Array.isArray(drawsRange) ? drawsRange : [];

========================================================================
OBJETIVO
========================================================================

1. Descobrir quem monta input.drawsRange.
2. Descobrir se drawsRange já vem filtrado.
3. Confirmar se somente concursos anteriores são usados.
4. Localizar eventual risco de look-ahead.

Nenhum backtest executado.
Nenhum arquivo alterado.
```

### e08_history_builder_audit.txt

```text
========================================================================
E08.13 - CONSTRUÇÃO DO history
========================================================================

------------------------------------------------------------------------
LINHAS 1 - 28
------------------------------------------------------------------------
0001: "use strict";
0002: 
0003: const {
0004:   fetchDrawsWithPrizesByRange,
0005: } = require("./drawRepository");
0006: 
0007: const {
0008:   readFullHistory,
0009:   readMetadata,
0010: } = require("./top3HistoryRepository");
0011: 
0012: const {
0013:   computeStatisticalTop3V3,
0014:   loadTop3PublicApi,
0015: } = require("./scoreEngineUnified");
0016: 
0017: const {
0018:   createPredictionRun,
0019: } = require("./predictionService");
0020: 
0021: const {
0022:   getDb,
0023: } = require("../service/firebaseAdmin");
0024: 
0025: const PT_RIO_SCHEDULE_NORMAL = [
0026:   "09:00",
0027:   "11:00",
0028:   "14:00",

------------------------------------------------------------------------
LINHAS 434 - 467
------------------------------------------------------------------------
0434:     });
0435:   }
0436: 
0437:   while (cols.length < expectedCols) {
0438:     cols.push({
0439:       dezena: "",
0440:       items: Array(perCol).fill(""),
0441:     });
0442:   }
0443: 
0444:   return cols.slice(0, expectedCols);
0445: }
0446: 
0447: function buildTop3PublicSnapshot({
0448:   computedTop,
0449:   history,
0450:   lotteryKey,
0451:   date,
0452:   closeHour,
0453:   publicApi,
0454: }) {
0455:   const schedule = scheduleForPublicProjection(
0456:     lotteryKey,
0457:     date
0458:   );
0459: 
0460:   return (Array.isArray(computedTop)
0461:     ? computedTop
0462:     : []
0463:   )
0464:     .slice(0, 3)
0465:     .map((item, index) => {
0466:       const grupo = Number(item?.grupo);
0467: 

------------------------------------------------------------------------
LINHAS 475 - 506
------------------------------------------------------------------------
0475: 
0476:       const probability = Number(
0477:         item?.scoreProb ??
0478:         item?.probability ??
0479:         item?.confidence ??
0480:         0
0481:       );
0482: 
0483:       const prob =
0484:         probability > 1
0485:           ? probability / 100
0486:           : probability;
0487: 
0488:       const engineOutput =
0489:         publicApi.build20MilharesForGrupo({
0490:           rangeDraws: history,
0491:           analysisHourBucket: closeHour,
0492:           schedule,
0493:           grupo2: grupo,
0494:           targetYmd: date,
0495:         });
0496: 
0497:       const milharesCols =
0498:         buildPublicMilharesCols(
0499:           engineOutput,
0500:           4,
0501:           5
0502:         );
0503: 
0504:       const milhares20 = milharesCols
0505:         .flatMap((column) => column.items)
0506:         .filter(

------------------------------------------------------------------------
LINHAS 524 - 560
------------------------------------------------------------------------
0524:         probPct:
0525:           Number.isFinite(prob)
0526:             ? Number((prob * 100).toFixed(4))
0527:             : 0,
0528:         milhares20,
0529:         milharesCols,
0530:         meta: item?.meta || null,
0531:       };
0532:     })
0533:     .filter(Boolean);
0534: }
0535: 
0536: async function saveTop3PublicProjection({
0537:   lotteryKey,
0538:   date,
0539:   closeHour,
0540:   snapshot,
0541:   engineVersion = "V3_STATISTICAL",
0542:   source = "backend-top3",
0543: }) {
0544:   const lottery = normalizeLotteryKey(lotteryKey);
0545:   const hour = normalizeHour(closeHour);
0546:   const hourCode = publicHourCode(hour);
0547: 
0548:   const id =
0549:     `${lottery}__${date}__${hourCode}`;
0550: 
0551:   const normalizedSnapshot =
0552:     Array.isArray(snapshot)
0553:       ? snapshot.slice(0, 3)
0554:       : [];
0555: 
0556:   if (!normalizedSnapshot.length) {
0557:     throw new Error(
0558:       "Snapshot público TOP3 vazio."
0559:     );
0560:   }

------------------------------------------------------------------------
LINHAS 738 - 772
------------------------------------------------------------------------
0738:         },
0739:       };
0740:     })
0741:     .filter((item) => /^\d{2}$/.test(item.grupo));
0742: }
0743: 
0744: async function createTop3PredictionRun(
0745:   input = {},
0746:   dependencies = {}
0747: ) {
0748:   const lotteryKey = normalizeLotteryKey(
0749:     input.lotteryKey
0750:   );
0751: 
0752:   const date = normalizeYmd(input.date);
0753:   const closeHour = normalizeHour(input.closeHour);
0754: 
0755:   const computeTop3 =
0756:     dependencies.computeTop3 ||
0757:     computeStatisticalTop3V3;
0758: 
0759:   const persistRun =
0760:     dependencies.persistRun ||
0761:     createPredictionRun;
0762: 
0763:   const publicApi =
0764:     dependencies.publicApi ||
0765:     loadTop3PublicApi();
0766: 
0767:   const historyLoad = await loadPredictionHistory({
0768:     lotteryKey,
0769:     date,
0770:     input,
0771:     dependencies,
0772:   });

------------------------------------------------------------------------
LINHAS 777 - 957
------------------------------------------------------------------------
0777: 
0778:   const {
0779:     source: historySource,
0780:     metadata: historyMetadata,
0781:     lookbackDays,
0782:     maxDraws,
0783:     startYmd,
0784:   } = historyLoad;
0785: 
0786:   if (!allDraws.length) {
0787:     throw new Error(
0788:       `Nenhum resultado encontrado para ${lotteryKey}.`
0789:     );
0790:   }
0791: 
0792:   const targetKey = dateHourKey(date, closeHour);
0793: 
0794:   const history = allDraws
0795:     .filter((draw) => {
0796:       const ymd = publicApi.pickDrawYMD(draw);
0797:       const hour = publicApi.pickDrawHour(draw);
0798: 
0799:       if (!ymd || !hour) {
0800:         return false;
0801:       }
0802: 
0803:       return dateHourKey(ymd, hour) < targetKey;
0804:     })
0805:     .sort((a, b) => {
0806:       const aKey = dateHourKey(
0807:         publicApi.pickDrawYMD(a),
0808:         publicApi.pickDrawHour(a)
0809:       );
0810: 
0811:       const bKey = dateHourKey(
0812:         publicApi.pickDrawYMD(b),
0813:         publicApi.pickDrawHour(b)
0814:       );
0815: 
0816:       return aKey.localeCompare(bKey);
0817:     });
0818: 
0819:   if (!history.length) {
0820:     throw new Error(
0821:       "Não existe histórico anterior ao horário solicitado."
0822:     );
0823:   }
0824: 
0825:   const drawLast = history[history.length - 1];
0826: 
0827:   const drawsToday = history.filter(
0828:     (draw) => publicApi.pickDrawYMD(draw) === date
0829:   );
0830: 
0831:   const computed = computeTop3({
0832:     lotteryKey,
0833:     drawsRange: history,
0834:     drawLast,
0835:     PT_RIO_SCHEDULE_NORMAL,
0836:     PT_RIO_SCHEDULE_WED_SAT,
0837:     FEDERAL_SCHEDULE,
0838:     topN: 3,
0839:     targetYmdOverride: date,
0840:     targetHourOverride: closeHour,
0841:   });
0842: 
0843:   const predictions = mapTop3ToPredictions(
0844:     computed?.top
0845:   );
0846: 
0847:   const publicSnapshot =
0848:     buildTop3PublicSnapshot({
0849:       computedTop: computed?.top,
0850:       history,
0851:       lotteryKey,
0852:       date,
0853:       closeHour,
0854:       publicApi,
0855:     });
0856: 
0857:   if (!predictions.length) {
0858:     throw new Error(
0859:       "O motor TOP3 não produziu previsões válidas."
0860:     );
0861:   }
0862: 
0863:   if (
0864:     publicSnapshot.length !== 3 ||
0865:     publicSnapshot.some(
0866:       (item) =>
0867:         !Array.isArray(item?.milhares20) ||
0868:         item.milhares20.length !== 20
0869:     )
0870:   ) {
0871:     throw new Error(
0872:       "O motor TOP3 não produziu 20 milhares válidas para cada grupo."
0873:     );
0874:   }
0875: 
0876:   const metadata = {
0877:     ...(input.metadata || {}),
0878:     engine: "top3_statistical_v3",
0879:     historyDraws: history.length,
0880:     drawsToday: drawsToday.length,
0881:     historySource,
0882:     historyBootstrapStatus:
0883:       historyMetadata?.bootstrapStatus || null,
0884:     historyTotalStored:
0885:       Number(historyMetadata?.totalDraws || 0) || null,
0886:     lookbackDays,
0887:     maxDraws,
0888:     startYmd,
0889:     lastDrawYmd:
0890:       publicApi.pickDrawYMD(drawLast) || null,
0891:     lastDrawHour:
0892:       publicApi.pickDrawHour(drawLast) || null,
0893:     targetYmd: date,
0894:     targetHour: closeHour,
0895:     engineMeta: computed?.meta || null,
0896:   };
0897: 
0898:   const engine = {
0899:     name: "top3_statistical_v3",
0900:     historyDraws: history.length,
0901:     drawsToday: drawsToday.length,
0902:     historySource,
0903:     historyBootstrapStatus:
0904:       historyMetadata?.bootstrapStatus || null,
0905:     historyTotalStored:
0906:       Number(historyMetadata?.totalDraws || 0) || null,
0907:     lookbackDays,
0908:     maxDraws,
0909:     startYmd,
0910:     targetYmd: date,
0911:     targetHour: closeHour,
0912:     meta: computed?.meta || null,
0913:   };
0914: 
0915:   if (input.dryRun === true) {
0916:     return {
0917:       run: null,
0918:       predictions,
0919:       publicSnapshot,
0920:       engine,
0921:       dryRun: true,
0922:     };
0923:   }
0924: 
0925:   const source =
0926:     input.source || "backend-top3";
0927: 
0928:   const result = await persistRun({
0929:     lotteryKey,
0930:     date,
0931:     closeHour,
0932:     source,
0933:     algorithm: "top3_statistical_v3",
0934:     metadata,
0935:     predictions,
0936:   });
0937: 
0938:   const publicProjection =
0939:     await saveTop3PublicProjection({
0940:       lotteryKey,
0941:       date,
0942:       closeHour,
0943:       snapshot: publicSnapshot,
0944:       engineVersion: "V3_STATISTICAL",
0945:       source,
0946:     });
0947: 
0948:   return {
0949:     ...result,
0950:     publicSnapshot,
0951:     publicProjection,
0952:     engine,
0953:     dryRun: false,
0954:   };
0955: }
0956: 
0957: module.exports = {

========================================================================
VALIDAR
========================================================================

1. Onde history nasce.
2. Quem popula history.
3. Se existe filtro temporal.
4. Se o concurso atual é removido.
5. Onde drawsRange recebe history.

Nenhum backtest executado.
Nenhum arquivo alterado.
```

# Conclusões

- E08 preserva o conjunto de candidatos da V3.
- Apenas reordena o TOP3.
- Utiliza frequência do mesmo horário.
- Mantém a ordem original da V3 em caso de empate.
- O histórico contém somente concursos anteriores ao alvo.
- Não foi identificado indício de look-ahead.
- Benchmark oficial: +12 acertos TOP1 sobre a V3.

# Pendências

- Explicar estatisticamente o ganho de +12.
- Decidir se o E08 deve permanecer apenas experimental ou evoluir.

# Status Final

Auditoria estrutural encerrada.
Nenhum código alterado.
Nenhum deploy realizado.
Nenhum commit realizado.
