from pathlib import Path
import sys

hooks_path = Path("src/pages/Top3/top3.hooks.js")
view_path = Path("src/pages/Top3/Top3View.jsx")

hooks = hooks_path.read_text(encoding="utf-8")
view = view_path.read_text(encoding="utf-8")

changes = []

# ======================================================================================
# 1. Criar estado que preserva as datas reais já carregadas por loteria
# ======================================================================================

old = '''  const [rangeDraws, setRangeDraws] = useState([]);
  const [todayDraws, setTodayDraws] = useState([]);
  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });
'''

new = '''  const [rangeDraws, setRangeDraws] = useState([]);
  const [todayDraws, setTodayDraws] = useState([]);
  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });

  const [
    availableHistoryDatesByLottery,
    setAvailableHistoryDatesByLottery,
  ] = useState({});
'''

if old not in hooks:
    raise RuntimeError(
        "Âncora 1 não encontrada em top3.hooks.js: estados rangeDraws/todayDraws."
    )

hooks = hooks.replace(old, new, 1)
changes.append("Estado availableHistoryDatesByLottery criado")

# ======================================================================================
# 2. Registrar as datas reais depois da carga do histórico
# ======================================================================================

old = '''      setRangeDraws(hist);
    } catch (e) {
'''

new = '''      setRangeDraws(hist);

      const loadedHistoryDates = Array.from(
        new Set(
          (Array.isArray(hist) ? hist : [])
            .map((draw) => pickDrawYMD(draw))
            .filter((date) => isYMD(date))
        )
      );

      setAvailableHistoryDatesByLottery((current) => {
        const previous = Array.isArray(current?.[lKey])
          ? current[lKey]
          : [];

        const merged = Array.from(
          new Set([
            ...previous,
            ...loadedHistoryDates,
          ])
        ).sort();

        return {
          ...current,
          [lKey]: merged,
        };
      });
    } catch (e) {
'''

if old not in hooks:
    raise RuntimeError(
        "Âncora 2 não encontrada em top3.hooks.js: setRangeDraws(hist)."
    )

hooks = hooks.replace(old, new, 1)
changes.append("Datas reais de rangeDraws armazenadas por loteria")

# ======================================================================================
# 3. Criar lista da loteria ativa antes do return do controller
# ======================================================================================

old = '''  return {
    LOOKBACK_ALL,
'''

new = '''  const availableHistoryDates = useMemo(() => {
    const key = safeStr(lotteryKeySafe).toUpperCase();

    return Array.isArray(
      availableHistoryDatesByLottery?.[key]
    )
      ? availableHistoryDatesByLottery[key]
      : [];
  }, [
    availableHistoryDatesByLottery,
    lotteryKeySafe,
  ]);

  return {
    LOOKBACK_ALL,
'''

if old not in hooks:
    raise RuntimeError(
        "Âncora 3 não encontrada em top3.hooks.js: início do return."
    )

hooks = hooks.replace(old, new, 1)
changes.append("Lista da loteria ativa criada")

# ======================================================================================
# 4. Expor availableHistoryDates no controller
# ======================================================================================

old = '''    top3,
    timelineTop3,
    persistedTop3History,

    setLotteryKey,
'''

new = '''    top3,
    timelineTop3,
    persistedTop3History,
    availableHistoryDates,

    setLotteryKey,
'''

if old not in hooks:
    raise RuntimeError(
        "Âncora 4 não encontrada em top3.hooks.js: retorno do histórico."
    )

hooks = hooks.replace(old, new, 1)
changes.append("availableHistoryDates exposto ao Top3View")

# ======================================================================================
# 5. Receber a nova propriedade no Top3View
# ======================================================================================

old = '''    timelineTop3,
    persistedTop3History,
    top3,
'''

new = '''    timelineTop3,
    persistedTop3History,
    availableHistoryDates: controllerHistoryDates,
    top3,
'''

if old not in view:
    raise RuntimeError(
        "Âncora 5 não encontrada em Top3View.jsx: destructuring das props."
    )

view = view.replace(old, new, 1)
changes.append("Top3View passou a receber controllerHistoryDates")

# ======================================================================================
# 6. Incluir a fonte real na montagem das datas navegáveis
# ======================================================================================

old = '''  const availableHistoryDates = useMemo(() => {
    const dates = new Set();

    (Array.isArray(timeline) ? timeline : []).forEach(
'''

new = '''  const availableHistoryDates = useMemo(() => {
    const dates = new Set();

    (
      Array.isArray(controllerHistoryDates)
        ? controllerHistoryDates
        : []
    ).forEach((date) => {
      const ymd = String(date || "").trim();

      if (isYMD(ymd) && ymd <= todayForCalendar) {
        dates.add(ymd);
      }
    });

    (Array.isArray(timeline) ? timeline : []).forEach(
'''

if old not in view:
    raise RuntimeError(
        "Âncora 6 não encontrada em Top3View.jsx: availableHistoryDates."
    )

view = view.replace(old, new, 1)
changes.append("Datas reais do controller adicionadas ao calendário")

# ======================================================================================
# 7. Atualizar dependências do useMemo
# ======================================================================================

old = '''  }, [
    timeline,
    persistedTop3History,
    todayForCalendar,
  ]);
'''

new = '''  }, [
    controllerHistoryDates,
    timeline,
    persistedTop3History,
    todayForCalendar,
  ]);
'''

if old not in view:
    raise RuntimeError(
        "Âncora 7 não encontrada em Top3View.jsx: dependências do calendário."
    )

view = view.replace(old, new, 1)
changes.append("Dependências do calendário atualizadas")

hooks_path.write_text(hooks, encoding="utf-8")
view_path.write_text(view, encoding="utf-8")

print("STATUS_PATCH: OK")
for item in changes:
    print(f"- {item}")
