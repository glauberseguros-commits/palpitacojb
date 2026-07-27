from pathlib import Path

path = Path("src/pages/Statistics/Statistics.jsx")

text = (
    path.read_text(encoding="utf-8")
    .replace("\r\n", "\n")
)

old = '''        @media (max-width:560px){
          .ppStatsControl{
            width:100%;
          }

          .ppStatsKpis{
            grid-template-columns:1fr 1fr;
          }

          .ppStatsKpi{
            padding:12px;
          }

          .ppStatsKpiValue{
            font-size:16px;
          }
        }'''

new = '''        @media (max-width:560px){
          .ppStatistics{
            padding:6px;
          }

          .ppStatsPanel{
            min-height:calc(100dvh - 12px);
            border-radius:14px;
          }

          .ppStatsHeader{
            padding:12px 10px;
            gap:12px;
          }

          .ppStatsTitle{
            font-size:20px;
          }

          .ppStatsSubtitle{
            margin-top:6px;
            font-size:11px;
          }

          .ppStatsTabs{
            width:100%;
            display:grid;
            grid-template-columns:repeat(2, minmax(0,1fr));
            gap:7px;
          }

          .ppStatsTab{
            width:100%;
            min-height:42px;
            padding:8px 7px;
            font-size:10px;
          }

          .ppStatsViewSelector{
            width:100%;
            padding:10px 10px 0;
          }

          .ppStatsViewButton{
            flex:1 1 0;
            min-width:0;
            min-height:42px;
            padding:8px 10px;
          }

          .ppStatsFilters{
            padding:10px;
            gap:8px;
          }

          .ppStatsControl{
            width:100%;
            min-height:44px;
            padding:7px 10px;
            border-radius:12px;
          }

          .ppStatsControl label{
            flex:0 0 auto;
            min-width:58px;
          }

          .ppStatsControl select,
          .ppStatsControl input{
            width:100%;
            min-width:0;
            text-align:right;
            font-size:12px;
          }

          .ppStatsControl input[type="date"]{
            max-width:100%;
          }

          .ppStatsAnalyze{
            width:100%;
            min-height:44px;
            padding:10px 14px;
          }

          .ppStatsError,
          .ppStatsProgress{
            margin:10px 10px 0;
          }

          .ppStatsProgress{
            padding:10px;
          }

          .ppStatsKpis{
            padding:10px;
            grid-template-columns:repeat(2, minmax(0,1fr));
            gap:8px;
          }

          .ppStatsKpi{
            min-height:82px;
            padding:11px;
            border-radius:13px;
          }

          .ppStatsKpiLabel{
            font-size:9px;
            line-height:1.25;
          }

          .ppStatsKpiValue{
            margin-top:7px;
            font-size:17px;
          }

          .ppStatsResults{
            padding:0 10px 10px;
          }

          .ppStatsToolbar{
            padding:8px 0;
            gap:8px;
          }

          .ppStatsToolbarGroup{
            width:100%;
            display:grid;
            grid-template-columns:auto minmax(0,1fr);
            gap:8px;
          }

          .ppStatsToolbarGroup:last-child{
            grid-template-columns:minmax(0,1fr) auto minmax(96px,0.45fr);
          }

          .ppStatsToolbar select{
            width:100%;
            min-width:0;
            min-height:42px;
          }

          .ppStatsToolbar .ppStatsAnalyze{
            width:100%;
            min-width:0;
          }

          .ppStatsTableWrap{
            border-radius:12px;
            overflow-x:auto;
            overflow-y:visible;
            -webkit-overflow-scrolling:touch;
            overscroll-behavior-x:contain;
          }

          .ppStatsTable{
            min-width:680px;
          }

          .ppStatsTable th{
            padding:10px 8px;
            font-size:9px;
          }

          .ppStatsTable td{
            padding:9px 8px;
            font-size:11px;
          }

          .ppStatsNumber{
            font-size:14px;
          }

          .ppStatsSecondary{
            font-size:9px;
          }

          .ppStatsBarCell{
            gap:7px;
          }

          .ppStatsBarTrack{
            min-width:64px;
          }

          .ppStatsEmpty{
            padding:28px 14px;
            font-size:12px;
          }
        }

        @media (max-width:360px){
          .ppStatsTabs{
            grid-template-columns:1fr 1fr;
          }

          .ppStatsKpis{
            grid-template-columns:1fr;
          }

          .ppStatsKpi{
            min-height:72px;
          }

          .ppStatsToolbarGroup:last-child{
            grid-template-columns:1fr;
          }

          .ppStatsToolbarGroup:last-child label{
            display:none;
          }

          .ppStatsTable{
            min-width:640px;
          }
        }'''

count = text.count(old)

if count != 1:
    raise SystemExit(
        f"Bloco mobile encontrado {count} vez(es). Esperado: 1."
    )

text = text.replace(old, new, 1)

path.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("OK - Responsividade mobile da página Frequências implementada.")
