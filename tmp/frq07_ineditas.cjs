const fs = require("fs");

const file = "src/pages/Statistics/Statistics.jsx";

let text = fs
  .readFileSync(file, "utf8")
  .replace(/\r\n/g, "\n");

function replaceOnce(from, to, label) {
  const count = text.split(from).length - 1;

  if (count !== 1) {
    throw new Error(
      `${label}: trecho encontrado ${count} vez(es). Esperado: 1.`
    );
  }

  text = text.replace(from, to);
}

function insertBefore(marker, content, label) {
  const index = text.indexOf(marker);

  if (index < 0) {
    throw new Error(`${label}: marcador não encontrado.`);
  }

  text =
    text.slice(0, index) +
    content +
    text.slice(index);
}

function replaceBetween(startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);

  if (start < 0) {
    throw new Error(`${label}: início não encontrado.`);
  }

  const end = text.indexOf(
    endMarker,
    start + startMarker.length
  );

  if (end < 0) {
    throw new Error(`${label}: final não encontrado.`);
  }

  text =
    text.slice(0, start) +
    replacement +
    text.slice(end);
}

/*
==============================================================================
1. FUNÇÕES PARA UNIVERSO DE MILHARES
==============================================================================
*/

const itemLabelEnd = `function itemLabel(mode, key) {
  if (mode === "animal") {
    const group = Number(key);
    const animal = getAnimalLabel(group) || \`Grupo \${pad2(group)}\`;

    return {
      main: animal,
      secondary: \`Grupo \${pad2(group)}\`,
    };
  }

  return {
    main: key,
    secondary:
      mode === "dezena"
        ? "Dezena"
        : mode === "centena"
        ? "Centena"
        : "Milhar",
  };
}`;

const itemLabelWithHelpers = `${itemLabelEnd}

function groupFromMilhar(value) {
  const milhar = lastDigits(value, 4);

  if (!milhar) return null;

  const dezena = Number(milhar.slice(-2));
  const normalizedDezena = dezena === 0 ? 100 : dezena;
  const group = Math.ceil(normalizedDezena / 4);

  return group >= 1 && group <= 25 ? group : null;
}

function buildMilharUniverse(selectedGroup = null) {
  const output = [];

  for (let value = 0; value <= 9999; value += 1) {
    const milhar = String(value).padStart(4, "0");
    const group = groupFromMilhar(milhar);

    if (
      selectedGroup &&
      group !== selectedGroup
    ) {
      continue;
    }

    output.push({
      key: milhar,
      group,
      animal:
        getAnimalLabel(group) ||
        \`Grupo \${pad2(group)}\`,
    });
  }

  return output;
}`;

replaceOnce(
  itemLabelEnd,
  itemLabelWithHelpers,
  "Funções do universo de milhares"
);

/*
==============================================================================
2. ESTADO DA VISÃO
==============================================================================
*/

replaceOnce(
  `  const [mode, setMode] = useState("dezena");`,
  `  const [mode, setMode] = useState("dezena");
  const [rankingView, setRankingView] = useState("frequentes");`,
  "Estado rankingView"
);

/*
==============================================================================
3. CÁLCULO DAS MILHARES INÉDITAS E PROGRESSO
==============================================================================
*/

const distinctBlock = `  const distinctItemsLabel = useMemo(() => {
    if (mode === "dezena") return "Dezenas distintas";
    if (mode === "centena") return "Centenas distintas";
    if (mode === "milhar") return "Milhares distintas";

    return "Animais distintos";
  }, [mode]);`;

const computedBlock = `${distinctBlock}

  const isUnseenView =
    mode === "milhar" &&
    rankingView === "ineditas";

  const milharUniverse = useMemo(
    () => buildMilharUniverse(selectedGroup),
    [selectedGroup]
  );

  const unseenRows = useMemo(() => {
    if (!isUnseenView) return [];

    if (selectedPosition === 7) {
      return [];
    }

    const appeared = new Set(
      rows.map((row) => lastDigits(row.key, 4))
    );

    const output = milharUniverse.filter(
      (item) => !appeared.has(item.key)
    );

    output.sort((a, b) => {
      if (sort === "number_desc") {
        return b.key.localeCompare(a.key, "pt-BR", {
          numeric: true,
        });
      }

      return a.key.localeCompare(b.key, "pt-BR", {
        numeric: true,
      });
    });

    return output;
  }, [
    isUnseenView,
    rows,
    milharUniverse,
    sort,
    selectedPosition,
  ]);

  const visibleUnseenRows = useMemo(() => {
    const parsedLimit = Number(limit);

    if (
      Number.isFinite(parsedLimit) &&
      parsedLimit > 0
    ) {
      return unseenRows.slice(0, parsedLimit);
    }

    return unseenRows;
  }, [unseenRows, limit]);

  const progressPercent = useMemo(() => {
    const done = Number(progress.done || 0);
    const total = Number(progress.total || 0);

    if (!total) return 0;

    return Math.min(
      100,
      Math.max(0, Math.round((done / total) * 100))
    );
  }, [progress]);

  const thirdKpiLabel = isUnseenView
    ? "Milhares inéditas"
    : distinctItemsLabel;

  const thirdKpiValue = isUnseenView
    ? unseenRows.length
    : rows.length;

  const fourthKpiLabel = isUnseenView
    ? "Universo possível"
    : "Mais frequente";

  const fourthKpiValue = isUnseenView
    ? milharUniverse.length
    : mostFrequentLabel;`;

replaceOnce(
  distinctBlock,
  computedBlock,
  "Cálculo das inéditas"
);

/*
==============================================================================
4. BOTÃO COPIAR
==============================================================================
*/

const copyStart =
  `  const copyRanking = useCallback(async () => {`;

const copyEnd =
  `\n\n  return (`;

const copyReplacement = `  const copyRanking = useCallback(async () => {
    const lines = [];

    if (isUnseenView) {
      lines.push(
        "MILHARES INÉDITAS",
        "",
        "Loteria: " + selectedLottery.label,
        "Período: " +
          ymdToBr(safeRange.from) +
          " até " +
          ymdToBr(safeRange.to),
        "Quantidade: " +
          formatInteger(unseenRows.length),
        ""
      );

      visibleUnseenRows.forEach((row, index) => {
        lines.push(
          String(index + 1) +
            "º - " +
            row.key +
            " - Grupo " +
            pad2(row.group) +
            " - " +
            row.animal
        );
      });
    } else {
      const title =
        mode === "dezena"
          ? "RANKING DE DEZENAS"
          : mode === "centena"
          ? "RANKING DE CENTENAS"
          : mode === "milhar"
          ? "RANKING DE MILHARES"
          : "RANKING DE ANIMAIS";

      lines.push(
        title,
        "",
        "Loteria: " + selectedLottery.label,
        "Período: " +
          ymdToBr(safeRange.from) +
          " até " +
          ymdToBr(safeRange.to),
        ""
      );

      sortedRows.forEach((row, index) => {
        const label = itemLabel(mode, row.key);

        lines.push(
          String(index + 1) +
            "º - " +
            label.main +
            " - " +
            formatInteger(row.count) +
            " ocorrência(s)"
        );
      });
    }

    try {
      await navigator.clipboard.writeText(
        lines.join("\\n")
      );

      alert(
        isUnseenView
          ? "Milhares inéditas copiadas."
          : "Ranking copiado."
      );
    } catch {
      alert(
        "Não foi possível copiar automaticamente."
      );
    }
  }, [
    isUnseenView,
    mode,
    selectedLottery,
    safeRange,
    sortedRows,
    unseenRows,
    visibleUnseenRows,
  ]);`;

replaceBetween(
  copyStart,
  copyEnd,
  copyReplacement,
  "Função copyRanking"
);

/*
==============================================================================
5. ESTILOS DO PROGRESSO
==============================================================================
*/

replaceOnce(
  `        .ppStatsProgress{
          margin:14px 14px 0;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(202,166,75,0.18);
          background:rgba(202,166,75,0.07);
          color:rgba(233,233,233,0.82);
          font-size:12px;
          font-weight:800;
        }`,
  `        .ppStatsProgress{
          margin:14px 14px 0;
          padding:12px;
          border-radius:12px;
          border:1px solid rgba(202,166,75,0.18);
          background:rgba(202,166,75,0.07);
          color:rgba(233,233,233,0.82);
          font-size:12px;
          font-weight:800;
        }

        .ppStatsProgressHeader{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
        }

        .ppStatsProgressPercent{
          color:#f4d77d;
          font-weight:950;
          font-variant-numeric:tabular-nums;
        }

        .ppStatsProgressTrack{
          width:100%;
          height:8px;
          margin-top:9px;
          border-radius:999px;
          overflow:hidden;
          background:rgba(255,255,255,0.09);
        }

        .ppStatsProgressFill{
          height:100%;
          border-radius:999px;
          background:linear-gradient(
            90deg,
            rgba(202,166,75,0.65),
            rgba(244,215,125,0.98)
          );
          transition:width 180ms ease;
        }

        .ppStatsViewSelector{
          padding:12px 14px 0;
          display:flex;
          justify-content:center;
          gap:8px;
        }

        .ppStatsViewButton{
          min-height:38px;
          padding:8px 15px;
          border-radius:999px;
          border:1px solid rgba(202,166,75,0.22);
          background:rgba(0,0,0,0.48);
          color:rgba(233,233,233,0.76);
          font-size:11px;
          font-weight:900;
          cursor:pointer;
        }

        .ppStatsViewButton.isActive{
          border-color:rgba(202,166,75,0.72);
          background:rgba(202,166,75,0.17);
          color:#f4d77d;
        }`,
  "Estilos do progresso"
);

/*
==============================================================================
6. RESET AO MUDAR DE ABA
==============================================================================
*/

replaceOnce(
  `                  setMode(item.value);`,
  `                  setRankingView("frequentes");
                  setSort("count_desc");
                  setMode(item.value);`,
  "Reset da visão ao mudar de aba"
);

/*
==============================================================================
7. SELETOR FREQUENTES / INÉDITAS
==============================================================================
*/

const filtersMarker =
  `        <div className="ppStatsFilters">`;

const viewSelector = `        {mode === "milhar" ? (
          <div
            className="ppStatsViewSelector"
            role="tablist"
            aria-label="Visualização das milhares"
          >
            <button
              type="button"
              className={[
                "ppStatsViewButton",
                rankingView === "frequentes"
                  ? "isActive"
                  : "",
              ].join(" ")}
              onClick={() => {
                setRankingView("frequentes");
                setSort("count_desc");
              }}
              aria-selected={
                rankingView === "frequentes"
              }
              role="tab"
            >
              Mais frequentes
            </button>

            <button
              type="button"
              className={[
                "ppStatsViewButton",
                rankingView === "ineditas"
                  ? "isActive"
                  : "",
              ].join(" ")}
              onClick={() => {
                setRankingView("ineditas");
                setSort("number_asc");
              }}
              aria-selected={
                rankingView === "ineditas"
              }
              role="tab"
            >
              Inéditas
            </button>
          </div>
        ) : null}

`;

insertBefore(
  filtersMarker,
  viewSelector,
  "Seletor de visualização"
);

/*
==============================================================================
8. TEXTO E BARRA DE PROGRESSO
==============================================================================
*/

replaceOnce(
  `        {loading ? (
          <div className="ppStatsProgress">
            Processando período:{" "}
            {formatInteger(progress.done)} de{" "}
            {formatInteger(progress.total)} blocos.
          </div>
        ) : null}`,
  `        {loading ? (
          <div className="ppStatsProgress">
            <div className="ppStatsProgressHeader">
              <span>Carregando resultados...</span>

              <span className="ppStatsProgressPercent">
                {progressPercent}%
              </span>
            </div>

            <div className="ppStatsProgressTrack">
              <div
                className="ppStatsProgressFill"
                style={{
                  width: \`\${progressPercent}%\`,
                }}
              />
            </div>
          </div>
        ) : null}`,
  "Progresso profissional"
);

/*
==============================================================================
9. KPIS
==============================================================================
*/

replaceOnce(
  `              {distinctItemsLabel}`,
  `              {thirdKpiLabel}`,
  "Título do terceiro KPI"
);

replaceOnce(
  `              {formatInteger(rows.length)}`,
  `              {formatInteger(thirdKpiValue)}`,
  "Valor do terceiro KPI"
);

replaceOnce(
  `            <div className="ppStatsKpiLabel">
              Mais frequente
            </div>`,
  `            <div className="ppStatsKpiLabel">
              {fourthKpiLabel}
            </div>`,
  "Título do quarto KPI"
);

replaceOnce(
  `              title={mostFrequentLabel}
            >
              {mostFrequentLabel}`,
  `              title={String(fourthKpiValue)}
            >
              {isUnseenView
                ? formatInteger(fourthKpiValue)
                : fourthKpiValue}`,
  "Valor do quarto KPI"
);

/*
==============================================================================
10. ORDENAÇÃO
==============================================================================
*/

replaceOnce(
  `                {SORTS.map((item) => (`,
  `                {(isUnseenView
                  ? SORTS.filter((item) =>
                      [
                        "number_asc",
                        "number_desc",
                      ].includes(item.value)
                    )
                  : SORTS
                ).map((item) => (`,
  "Opções de ordenação"
);

/*
==============================================================================
11. CABEÇALHO DA TABELA
==============================================================================
*/

replaceOnce(
  `                  <th style={{ width: 80 }}>
                    Ranking
                  </th>
                  <th style={{ width: 180 }}>
                    {mode === "animal"
                      ? "Animal"
                      : "Número"}
                  </th>
                  <th style={{ width: 130 }}>
                    Ocorrências
                  </th>
                  <th style={{ width: 230 }}>
                    Participação
                  </th>
                  <th style={{ width: 210 }}>
                    Última aparição
                  </th>`,
  `                  {isUnseenView ? (
                    <>
                      <th style={{ width: 90 }}>
                        Ordem
                      </th>
                      <th style={{ width: 180 }}>
                        Milhar
                      </th>
                      <th style={{ width: 130 }}>
                        Grupo
                      </th>
                      <th style={{ width: 220 }}>
                        Animal
                      </th>
                    </>
                  ) : (
                    <>
                      <th style={{ width: 80 }}>
                        Ranking
                      </th>
                      <th style={{ width: 180 }}>
                        {mode === "animal"
                          ? "Animal"
                          : "Número"}
                      </th>
                      <th style={{ width: 130 }}>
                        Ocorrências
                      </th>
                      <th style={{ width: 230 }}>
                        Participação
                      </th>
                      <th style={{ width: 210 }}>
                        Última aparição
                      </th>
                    </>
                  )}`,
  "Cabeçalho da tabela"
);

/*
==============================================================================
12. CORPO DA TABELA
==============================================================================
*/

const tbodyStart = `              <tbody>`;
const tbodyEnd = `              </tbody>`;

const tbodyReplacement = `              <tbody>
                {isUnseenView ? (
                  <>
                    {visibleUnseenRows.map(
                      (row, index) => (
                        <tr key={row.key}>
                          <td className="ppStatsRank">
                            {index + 1}º
                          </td>

                          <td>
                            <div className="ppStatsNumber">
                              {row.key}
                            </div>
                            <div className="ppStatsSecondary">
                              Milhar inédita
                            </div>
                          </td>

                          <td>
                            <strong>
                              {pad2(row.group)}
                            </strong>
                          </td>

                          <td>
                            <strong>
                              {row.animal}
                            </strong>
                          </td>
                        </tr>
                      )
                    )}

                    {!visibleUnseenRows.length ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="ppStatsEmpty">
                            {selectedPosition === 7
                              ? "O 7º prêmio possui apenas centena, não milhar."
                              : rows.length
                              ? "Todas as milhares do universo selecionado já apareceram."
                              : "Selecione os filtros e toque em “Gerar ranking”."}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ) : (
                  <>
                    {sortedRows.map((row, index) => {
                      const label = itemLabel(
                        mode,
                        row.key
                      );

                      const relativeWidth =
                        mostFrequent?.count > 0
                          ? Math.max(
                              2,
                              (row.count /
                                mostFrequent.count) *
                                100
                            )
                          : 0;

                      return (
                        <tr key={row.key}>
                          <td className="ppStatsRank">
                            {index + 1}º
                          </td>

                          <td>
                            <div className="ppStatsNumber">
                              {label.main}
                            </div>
                            <div className="ppStatsSecondary">
                              {label.secondary}
                            </div>
                          </td>

                          <td>
                            <strong>
                              {formatInteger(row.count)}
                            </strong>
                          </td>

                          <td>
                            <div className="ppStatsBarCell">
                              <div className="ppStatsBarTrack">
                                <div
                                  className="ppStatsBar"
                                  style={{
                                    width: \`\${relativeWidth}%\`,
                                  }}
                                />
                              </div>

                              <strong>
                                {formatPercent(row.percent)}%
                              </strong>
                            </div>
                          </td>

                          <td>
                            <div>
                              {ymdToBr(row.latestYmd)}
                            </div>

                            <div className="ppStatsSecondary">
                              {row.latestHour || "—"}
                              {row.latestPosition
                                ? \` · \${row.latestPosition}º prêmio\`
                                : ""}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!sortedRows.length ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="ppStatsEmpty">
                            Selecione os filtros e toque em
                            “Gerar ranking”.
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                )}`;

replaceBetween(
  tbodyStart,
  tbodyEnd,
  tbodyReplacement,
  "Corpo da tabela"
);

fs.writeFileSync(file, text, "utf8");

console.log("OK - Progresso e milhares inéditas implementados.");
