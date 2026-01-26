export const centenasCss = `
      .cx0_wrap{
        width:100%;
        height:100%;
        padding:14px;
        color:#e9e9e9;
        display:flex;
        flex-direction:column;
        gap:12px;
        box-sizing:border-box;
      }
      .cx0_title{ text-align:center; font-weight:1000; letter-spacing:.8px; margin:0; font-size:18px; }
      .cx0_sub{ text-align:center; font-size:11px; color:rgba(233,233,233,.72); }

      .cx0_filters{
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(0,0,0,0.45);
        box-shadow:0 18px 60px rgba(0,0,0,0.55);
        padding:12px;
        display:grid;
        grid-template-columns: 1fr;
        gap:10px;
      }
      @media (min-width: 720px){ .cx0_filters{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 1100px){ .cx0_filters{ grid-template-columns: repeat(6, minmax(0, 1fr)); } }

      .cx0_fItem{
        display:flex;
        flex-direction:column;
        gap:8px;
        min-width:0;
        align-items:center;
      }
      .cx0_fLab{
        width:100%;
        text-align:center;
        font-weight:900;
        font-size:13px;
        color:rgba(233,233,233,0.92);
      }

      .cx0_selWrap{
        position:relative;
        width:100%;
        border-radius:12px;
        border:1px solid rgba(255,255,255,0.12);
        background:rgba(0,0,0,0.55);
        height:48px;
        display:flex;
        align-items:center;
        padding:0 14px;
        box-sizing:border-box;
      }
      .cx0_sel{
        width:100%;
        appearance:none;
        background:transparent;
        border:none;
        outline:none;
        color:#fff;
        font-weight:900;
        font-size:15px;
        cursor:pointer;
        padding-right:28px;
        text-align:left;
      }
      .cx0_sel option{ background:#0b0b0b; color:#e9e9e9; }
      .cx0_chev{
        position:absolute; right:12px; top:50%;
        transform:translateY(-50%);
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-top:9px solid rgba(233,233,233,0.72);
        pointer-events:none;
      }

      .cx0_controls{
        display:flex;
        justify-content:center;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }
      .cx0_chip{
        display:inline-flex; align-items:center; gap:8px;
        padding:8px 10px;
        border-radius:999px;
        background:rgba(0,0,0,0.55);
        border:1px solid rgba(202,166,75,0.18);
        box-shadow:0 10px 30px rgba(0,0,0,0.35);
      }
      .cx0_chip label{ font-size:10px; color:rgba(233,233,233,0.62); }
      .cx0_chip select{ background:transparent; border:none; outline:none; color:#e9e9e9; font-weight:900; font-size:12px; }
      .cx0_chip select option{ background:#0b0b0b; color:#e9e9e9; }

      .cx0_btn{
        cursor:pointer;
        border-radius:999px;
        padding:9px 14px;
        font-weight:900;
        font-size:12px;
        letter-spacing:0.4px;
        background:rgba(0,0,0,0.6);
        color:#e9e9e9;
        border:1px solid rgba(202,166,75,0.30);
        box-shadow:0 12px 34px rgba(0,0,0,0.35);
      }
      .cx0_btn:disabled{ opacity:.55; cursor:not-allowed; }

      .cx0_status{
        text-align:center;
        font-size:11px;
        color:rgba(233,233,233,0.70);
        padding:6px 8px;
      }
      .cx0_bar{
        height:6px;
        border-radius:999px;
        background:rgba(255,255,255,0.08);
        overflow:hidden;
        margin:6px auto 0;
        max-width:520px;
      }
      .cx0_bar > div{
        height:100%;
        background:rgba(202,166,75,0.55);
        width:0%;
      }

      .cx0_err{
        padding:9px 11px;
        border-radius:12px;
        border:1px solid rgba(255,80,80,0.25);
        background:rgba(255,80,80,0.08);
        color:rgba(255,220,220,0.92);
        white-space:pre-wrap;
        font-size:12px;
      }

      .cx0_panel{
        border-radius:14px;
        border:1px solid rgba(202,166,75,0.16);
        background:
          radial-gradient(1000px 500px at 20% 0%, rgba(202,166,75,0.08), transparent 55%),
          radial-gradient(900px 500px at 85% 20%, rgba(255,255,255,0.05), transparent 50%),
          rgba(0,0,0,0.45);
        box-shadow:0 20px 60px rgba(0,0,0,0.45);
        overflow:hidden;
      }

      .cx0_grid{
        display:grid;
        grid-template-columns: 1fr;
        gap:10px;
        padding:10px;
        align-items:start;
      }
      @media (min-width: 980px){ .cx0_grid{ grid-template-columns: 320px 1fr; } }

      .cx0_banner{
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(0,0,0,0.35);
        box-shadow:0 14px 40px rgba(0,0,0,0.45);
        overflow:hidden;
        padding:12px;
        position:sticky;
        top:10px;
        align-self:start;
      }

      .cx0_bImg{
        width:252px; height:252px;
        max-width:100%;
        border-radius:10px;
        border:2px solid rgba(202,166,75,0.60);
        box-shadow:0 18px 55px rgba(0,0,0,0.55);
        overflow:hidden;
        background:rgba(0,0,0,0.55);
        margin:0 auto;
        padding:3px;
        box-sizing:border-box;
      }
      .cx0_bImg img{
        width:100%; height:100%;
        border-radius:8px;
        object-fit:cover;
        display:block;
        transform:translateZ(0);
        backface-visibility:hidden;
      }

      .cx0_bTxt{ margin-top:10px; text-align:center; }
      .cx0_bGrp{ font-weight:1000; letter-spacing:.5px; font-size:12px; opacity:.95; }
      .cx0_bAn{ margin-top:4px; font-weight:900; font-size:14px; color:rgba(233,233,233,0.85); }

      .cx0_list{ min-height:0; display:flex; flex-direction:column; gap:10px; }

      .cx0_card{
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(0,0,0,0.35);
        box-shadow:0 14px 40px rgba(0,0,0,0.45);
        overflow:hidden;
      }
      .cx0_head{
        display:flex; align-items:center; justify-content:space-between;
        gap:12px; padding:10px 12px; cursor:pointer; user-select:none;
      }
      .cx0_hLeft{ display:flex; align-items:center; gap:10px; min-width:0; }
      .cx0_hImg{
        width:38px; height:38px;
        border-radius:10px;
        border:2px solid rgba(202,166,75,0.55);
        box-shadow:0 14px 34px rgba(0,0,0,0.45);
        background:rgba(0,0,0,0.55);
        overflow:hidden;
        flex:0 0 auto;
        padding:2px;
        box-sizing:border-box;
      }
      .cx0_hImg img{
        width:100%; height:100%;
        border-radius:8px;
        object-fit:cover;
        display:block;
      }
      .cx0_hNames{ display:flex; flex-direction:column; gap:2px; min-width:0; }
      .cx0_hGrp{ font-weight:1000; letter-spacing:.4px; font-size:12px; white-space:nowrap; }
      .cx0_hAn{ font-weight:800; color:rgba(233,233,233,.82); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

      .cx0_hRight{ display:flex; align-items:center; gap:12px; }
      .cx0_kpi{ text-align:right; }
      .cx0_kpiK{ font-size:10px; color:rgba(233,233,233,0.62); }
      .cx0_kpiV{ font-size:12px; font-weight:1000; color:#caa64b; }

      .cx0_body{
        border-top:1px solid rgba(255,255,255,0.06);
        padding:10px 12px 12px;
        background:linear-gradient(180deg, rgba(202,166,75,0.06), rgba(0,0,0,0.16));
      }

      .cx0_bodyTop{
        display:flex; align-items:center; justify-content:space-between;
        gap:10px; flex-wrap:wrap;
        font-size:11px; color:rgba(233,233,233,0.78);
        margin-bottom:10px;
      }
      .cx0_bodyTop b{ color:#caa64b; }
      .cx0_toggle{
        cursor:pointer; border-radius:999px; padding:8px 10px;
        font-weight:900; font-size:11px;
        background:rgba(0,0,0,0.35);
        color:#e9e9e9;
        border:1px solid rgba(202,166,75,0.25);
      }

      .cx0_tbl{
        width:100%;
        border-radius:12px;
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(0,0,0,0.28);
        overflow:hidden;
      }
      .cx0_row{
        display:grid;
        grid-template-columns: 90px 140px 140px 1fr;
        gap:0;
        align-items:center;
      }
      .cx0_row > div{
        padding:10px 12px;
        border-bottom:1px solid rgba(255,255,255,0.06);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        text-align:center;
        font-size:12px;
        color:rgba(233,233,233,0.92);
      }
      .cx0_headRow > div{
        background:rgba(0,0,0,0.72);
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:.6px;
        color:rgba(233,233,233,0.75);
        font-weight:900;
      }
      .cx0_scroll{
        max-height: min(420px, 55vh);
        overflow:auto;
      }
      .cx0_row:hover > div{ background:rgba(202,166,75,0.06); }

      .cx0_mono{
        font-variant-numeric:tabular-nums;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        letter-spacing:0.3px;
        font-weight:900;
      }
      .cx0_count b{ color:#caa64b; }

      @media (max-width: 820px){
        .cx0_row{ grid-template-columns: 70px 110px 110px 1fr; }
      }
`;
