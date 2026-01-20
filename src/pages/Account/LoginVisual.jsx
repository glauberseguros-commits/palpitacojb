// src/pages/Account/LoginVisual.jsx
import React, { useEffect, useMemo } from "react";

const ACCOUNT_SESSION_KEY = "pp_session_v1";
const LS_GUEST_ACTIVE_KEY = "pp_guest_active_v1";

function dispatchSessionChanged() {
  try {
    window.dispatchEvent(new Event("pp_session_changed"));
  } catch {}
}

function safeSetLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export default function LoginVisual({ onEnter }) {
  // ✅ auditoria RJ somente em DEV (evita custo/log em produção)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    (async () => {
      try {
        // lazy import pra não empacotar dev tools no build prod
        const mod = await import("../../dev/runAuditRJ");
        if (mod?.runAuditRJ) {
          console.log("🔎 Rodando auditoria RJ (bounds) [DEV]...");
          await mod.runAuditRJ();
        }
      } catch (e) {
        console.warn("AuditRJ (DEV) falhou:", e);
      }
    })();
  }, []);

  const ui = useMemo(() => {
    const GOLD = "rgba(202,166,75,1)";
    const WHITE = "rgba(255,255,255,0.92)";
    const WHITE_70 = "rgba(255,255,255,0.70)";
    const BORDER = "rgba(255,255,255,0.12)";
    const BORDER_GOLD = "rgba(202,166,75,0.35)";
    const BG = "#050505";

    return {
      page: {
        minHeight: "100vh",
        background: BG,
        color: WHITE,
        display: "grid",
        placeItems: "center",
        padding: "clamp(14px, 2.5vw, 26px)",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },

      glowA: {
        position: "absolute",
        inset: "-25%",
        background:
          "radial-gradient(700px 420px at 18% 22%, rgba(202,166,75,0.18), rgba(0,0,0,0) 60%)," +
          "radial-gradient(520px 380px at 82% 34%, rgba(202,166,75,0.10), rgba(0,0,0,0) 62%)," +
          "radial-gradient(520px 520px at 50% 92%, rgba(255,255,255,0.06), rgba(0,0,0,0) 64%)",
        pointerEvents: "none",
      },

      glowB: {
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0) 40%)," +
          "linear-gradient(0deg, rgba(255,255,255,0.03), rgba(0,0,0,0) 45%)",
        pointerEvents: "none",
      },

      shell: {
        width: "min(980px, 100%)",
        display: "grid",
        gap: "clamp(12px, 2vw, 18px)",
        zIndex: 2,
      },

      card: {
        width: "min(560px, 100%)",
        margin: "0 auto",
        borderRadius: 22,
        border: `1px solid ${BORDER}`,
        background: "rgba(0,0,0,0.48)",
        boxShadow: "0 18px 55px rgba(0,0,0,0.60)",
        overflow: "hidden",
      },

      header: {
        padding: "clamp(18px, 2.2vw, 22px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(202,166,75,0.10), rgba(0,0,0,0.10))",
      },

      brandRow: {
        display: "flex",
        alignItems: "center",
        gap: 12,
      },

      mark: {
        width: 44,
        height: 44,
        borderRadius: 14,
        border: `1px solid ${BORDER_GOLD}`,
        background:
          "radial-gradient(18px 18px at 28% 25%, rgba(255,255,255,0.20), rgba(0,0,0,0) 60%)," +
          "linear-gradient(180deg, rgba(202,166,75,0.25), rgba(0,0,0,0.20))",
        display: "grid",
        placeItems: "center",
        fontWeight: 1000,
        color: GOLD,
      },

      title: {
        fontSize: "clamp(18px, 2.2vw, 22px)",
        fontWeight: 1000,
        margin: 0,
      },

      subtitle: {
        fontSize: "clamp(12px, 1.5vw, 13px)",
        color: WHITE_70,
        margin: 0,
      },

      body: {
        padding: "clamp(18px, 2.2vw, 22px)",
        display: "grid",
        gap: 12,
      },

      btnRow: {
        display: "grid",
        gap: 10,
      },

      btnPrimary: {
        height: 48,
        borderRadius: 16,
        border: "1px solid rgba(202,166,75,0.55)",
        background: "linear-gradient(180deg, rgba(202,166,75,0.22), rgba(202,166,75,0.10))",
        color: WHITE,
        fontWeight: 950,
        cursor: "pointer",
      },
    };
  }, []);

  const enterLogin = () => {
    safeSetLS(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({ ok: true, type: "user", plan: "FREE", ts: Date.now() })
    );
    safeSetLS(LS_GUEST_ACTIVE_KEY, "0");
    dispatchSessionChanged();
    onEnter?.("dashboard");
  };

  return (
    <div style={ui.page}>
      <div style={ui.glowA} />
      <div style={ui.glowB} />

      <div style={ui.shell}>
        <div style={ui.card}>
          <div style={ui.header}>
            <div style={ui.brandRow}>
              <div style={ui.mark}>PJ</div>
              <div>
                <h1 style={ui.title}>Palpitaco JB</h1>
                <p style={ui.subtitle}>Resultados • Estatística • Insights</p>
              </div>
            </div>
          </div>

          <div style={ui.body}>
            <div style={ui.btnRow}>
              <button style={ui.btnPrimary} onClick={enterLogin}>
                ENTRAR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
