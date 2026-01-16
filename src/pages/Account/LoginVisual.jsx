// src/pages/Account/LoginVisual.jsx
import React, { useMemo } from "react";

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
  const ui = useMemo(() => {
    const GOLD = "rgba(202,166,75,1)";
    const GOLD_SOFT = "rgba(202,166,75,0.20)";
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
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },

      // glow + textura sutil
      glowA: {
        position: "absolute",
        inset: "-25%",
        background:
          "radial-gradient(700px 420px at 18% 22%, rgba(202,166,75,0.18), rgba(0,0,0,0) 60%)," +
          "radial-gradient(520px 380px at 82% 34%, rgba(202,166,75,0.10), rgba(0,0,0,0) 62%)," +
          "radial-gradient(520px 520px at 50% 92%, rgba(255,255,255,0.06), rgba(0,0,0,0) 64%)",
        filter: "blur(0px)",
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
        gridTemplateColumns: "1fr",
        gap: "clamp(12px, 2vw, 18px)",
        position: "relative",
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
        background:
          "linear-gradient(180deg, rgba(202,166,75,0.10), rgba(0,0,0,0.10))",
      },

      brandRow: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 0,
      },

      mark: {
        width: 44,
        height: 44,
        borderRadius: 14,
        border: `1px solid ${BORDER_GOLD}`,
        background:
          "radial-gradient(18px 18px at 28% 25%, rgba(255,255,255,0.20), rgba(0,0,0,0) 60%)," +
          "linear-gradient(180deg, rgba(202,166,75,0.25), rgba(0,0,0,0.20))",
        boxShadow: `0 16px 40px rgba(0,0,0,0.55)`,
        display: "grid",
        placeItems: "center",
        fontWeight: 1000,
        letterSpacing: 0.6,
        color: GOLD,
        userSelect: "none",
      },

      titleWrap: { minWidth: 0, display: "grid", gap: 4 },

      title: {
        fontSize: "clamp(18px, 2.2vw, 22px)",
        fontWeight: 1000,
        letterSpacing: 0.2,
        lineHeight: 1.1,
        margin: 0,
      },

      subtitle: {
        fontSize: "clamp(12px, 1.5vw, 13px)",
        color: WHITE_70,
        margin: 0,
        lineHeight: 1.3,
        letterSpacing: 0.15,
      },

      body: {
        padding: "clamp(18px, 2.2vw, 22px)",
        display: "grid",
        gap: 12,
      },

      hint: {
        fontSize: "clamp(12px, 1.5vw, 12.5px)",
        color: "rgba(255,255,255,0.75)",
        lineHeight: 1.35,
      },

      btnRow: {
        display: "grid",
        gap: 10,
        marginTop: 6,
      },

      btnPrimary: {
        height: 48,
        borderRadius: 16,
        border: "1px solid rgba(202,166,75,0.55)",
        background:
          "linear-gradient(180deg, rgba(202,166,75,0.22), rgba(202,166,75,0.10))",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 950,
        letterSpacing: 0.25,
        cursor: "pointer",
        outline: "none",
        boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
        transition: "transform .12s ease, filter .12s ease, background .12s ease",
      },

      btnSecondary: {
        height: 44,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.90)",
        fontWeight: 900,
        letterSpacing: 0.2,
        cursor: "pointer",
        outline: "none",
        transition: "transform .12s ease, filter .12s ease, background .12s ease",
      },

      foot: {
        padding: "12px 18px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        background: "rgba(0,0,0,0.35)",
        color: "rgba(255,255,255,0.62)",
        fontSize: 11.5,
      },

      pill: {
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        borderRadius: 999,
        padding: "6px 10px",
        fontWeight: 850,
        letterSpacing: 0.2,
      },

      link: {
        color: "rgba(202,166,75,0.95)",
        textDecoration: "none",
        fontWeight: 850,
      },
    };
  }, []);

  const enterAsGuest = () => {
    // ✅ marca guest
    safeSetLS(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({ ok: true, type: "guest", plan: "FREE", ts: Date.now() })
    );
    safeSetLS(LS_GUEST_ACTIVE_KEY, "1");

    // ✅ avisa o App.js no mesmo tab
    dispatchSessionChanged();

    // fallback: se o pai quiser navegar
    onEnter?.("dashboard");
  };

  const enterLogin = () => {
    // login visual (sem auth real)
    // ✅ marca user e desliga guest ativo (se sobrou)
    safeSetLS(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({ ok: true, type: "user", plan: "FREE", ts: Date.now() })
    );
    safeSetLS(LS_GUEST_ACTIVE_KEY, "0");

    // ✅ avisa o App.js no mesmo tab
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
              <div style={ui.titleWrap}>
                <h1 style={ui.title}>Palpitaco JB</h1>
                <p style={ui.subtitle}>Estatística • Leitura • Análise</p>
              </div>
            </div>
          </div>

          <div style={ui.body}>
            <div style={ui.hint}>
              Acesso rápido para explorar estatísticas e painéis.
              <br />
              <span style={{ opacity: 0.9 }}>
                Preview libera navegação básica sem login.
              </span>
            </div>

            <div style={ui.btnRow}>
              <button
                type="button"
                onClick={enterLogin}
                style={ui.btnPrimary}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                ENTRAR
              </button>

              <button
                type="button"
                onClick={enterAsGuest}
                style={ui.btnSecondary}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                ENTRAR SEM LOGIN (PREVIEW)
              </button>
            </div>
          </div>

          <div style={ui.foot}>
            <span style={ui.pill}>FREE</span>
            <span>
              Ao entrar você aceita os{" "}
              <a href="#!" style={ui.link} onClick={(e) => e.preventDefault()}>
                termos
              </a>{" "}
              e{" "}
              <a href="#!" style={ui.link} onClick={(e) => e.preventDefault()}>
                privacidade
              </a>
              .
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
