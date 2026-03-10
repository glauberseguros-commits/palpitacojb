// src/pages/Account/LoginVisual.jsx
import React, { useEffect, useMemo, useState } from "react";

const ACCOUNT_SESSION_KEY = "pp_session_v1";
const LS_GUEST_ACTIVE_KEY = "pp_guest_active_v1";
const LOGO_SRC = "/logo/palpitaco-jb.png";

function dispatchSessionChanged() {
  try {
    window.dispatchEvent(new Event("pp_session_changed"));
  } catch {}
}

function safeRemoveLS(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export default function LoginVisual({ onEnter, onSkip }) {
  const [logoOk, setLogoOk] = useState(true);
  const [loginValue, setLoginValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    (async () => {
      try {
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
    const WHITE = "rgba(255,255,255,0.94)";
    const WHITE_82 = "rgba(255,255,255,0.82)";
    const BORDER = "rgba(255,255,255,0.12)";
    const BORDER_GOLD = "rgba(202,166,75,0.30)";
    const BG = "#050505";
    const RED = "rgba(255,110,110,0.95)";

    return {
      page: {
        minHeight: "100vh",
        background: BG,
        color: WHITE,
        display: "grid",
        placeItems: "center",
        padding: "clamp(16px, 2.6vw, 28px)",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },

      glowA: {
        position: "absolute",
        inset: "-25%",
        background:
          "radial-gradient(760px 460px at 18% 18%, rgba(202,166,75,0.16), rgba(0,0,0,0) 62%)," +
          "radial-gradient(560px 380px at 84% 30%, rgba(202,166,75,0.08), rgba(0,0,0,0) 64%)," +
          "radial-gradient(620px 620px at 50% 100%, rgba(255,255,255,0.04), rgba(0,0,0,0) 66%)",
        pointerEvents: "none",
      },

      glowB: {
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0) 40%)," +
          "linear-gradient(0deg, rgba(255,255,255,0.02), rgba(0,0,0,0) 44%)",
        pointerEvents: "none",
      },

      shell: {
        width: "min(540px, 100%)",
        display: "grid",
        zIndex: 2,
      },

      card: {
        width: "100%",
        margin: "0 auto",
        borderRadius: 24,
        border: `1px solid ${BORDER}`,
        background: "rgba(0,0,0,0.54)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.62)",
        overflow: "hidden",
        backdropFilter: "blur(4px)",
      },

      header: {
        padding: "clamp(18px, 2.4vw, 24px) clamp(22px, 3vw, 30px) 10px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "linear-gradient(180deg, rgba(202,166,75,0.09), rgba(0,0,0,0.02) 70%)",
      },

      logoWrap: {
        display: "grid",
        placeItems: "center",
        gap: 4,
      },

      logoBox: {
        width: "min(330px, 74vw)",
        display: "grid",
        placeItems: "center",
      },

      logoImg: {
        width: "100%",
        height: "auto",
        display: "block",
        objectFit: "contain",
        filter:
          "drop-shadow(0 14px 34px rgba(0,0,0,0.50)) drop-shadow(0 0 18px rgba(202,166,75,0.08))",
      },

      markFallback: {
        width: 64,
        height: 64,
        borderRadius: 18,
        border: `1px solid ${BORDER_GOLD}`,
        background:
          "radial-gradient(20px 20px at 28% 25%, rgba(255,255,255,0.20), rgba(0,0,0,0) 60%)," +
          "linear-gradient(180deg, rgba(202,166,75,0.24), rgba(0,0,0,0.18))",
        display: "grid",
        placeItems: "center",
        fontWeight: 1000,
        fontSize: 28,
        color: GOLD,
      },

      titleWrap: {
        textAlign: "center",
        marginTop: -8,
      },

      subtitle: {
        fontSize: "clamp(14px, 1.5vw, 15px)",
        color: WHITE,
        fontWeight: 700,
        letterSpacing: 0.35,
        margin: 0,
      },

      body: {
        padding: "10px 22px 22px",
        display: "grid",
        gap: 10,
      },

      fieldWrap: {
        display: "grid",
        gap: 6,
      },

      label: {
        fontSize: 13,
        fontWeight: 900,
        color: WHITE_82,
        letterSpacing: 0.2,
      },

      input: {
        height: 50,
        borderRadius: 15,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.04)",
        color: WHITE,
        outline: "none",
        padding: "0 14px",
        fontSize: 15,
        fontWeight: 700,
      },

      errorBox: {
        border: "1px solid rgba(255,110,110,0.30)",
        background: "rgba(255,110,110,0.08)",
        color: RED,
        borderRadius: 14,
        padding: "10px 12px",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        marginBottom: 2,
      },

      formGrid: {
        display: "grid",
        gap: 12,
      },

      btnRow: {
        display: "grid",
        gap: 12,
        marginTop: 4,
      },

      btnPrimary: {
        height: 54,
        borderRadius: 17,
        border: "1px solid rgba(202,166,75,0.52)",
        background: "linear-gradient(180deg, rgba(202,166,75,0.22), rgba(202,166,75,0.10))",
        color: WHITE,
        fontWeight: 950,
        cursor: "pointer",
        fontSize: 16,
        letterSpacing: 0.3,
        boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
        opacity: 1,
      },

      btnSecondary: {
        height: 54,
        borderRadius: 17,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.05)",
        color: WHITE,
        fontWeight: 900,
        cursor: "pointer",
        fontSize: 16,
        letterSpacing: 0.2,
        opacity: 1,
      },

      btnDisabled: {
        opacity: 0.55,
        cursor: "not-allowed",
      },
    };
  }, []);

  function clearVisualSession() {
    safeRemoveLS(ACCOUNT_SESSION_KEY);
    safeRemoveLS(LS_GUEST_ACTIVE_KEY);
    dispatchSessionChanged();
  }

  async function handleRealLogin() {
    const login = String(loginValue || "").trim();
    const password = String(passwordValue || "");

    if (!login || !password) {
      setErrorMsg("Preencha e-mail/telefone e senha.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    // limpa apenas resíduo legado/local antes do fluxo real
    clearVisualSession();

    try {
      if (typeof onEnter !== "function") {
        throw new Error("Fluxo de autenticação real não foi conectado no componente pai.");
      }

      const result = await onEnter({
        login,
        password,
        mode: "firebase",
      });

      if (result === false) {
        throw new Error("Não foi possível concluir o acesso.");
      }
    } catch (err) {
      const msg =
        String(err?.message || "").trim() ||
        "Não foi possível autenticar com o Firebase.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function enterGuest() {
    setErrorMsg("");
    setSubmitting(false);

    try {
      if (typeof onSkip !== "function") {
        throw new Error("Fluxo de convidado não foi conectado no componente pai.");
      }

      onSkip();
    } catch (err) {
      const msg =
        String(err?.message || "").trim() ||
        "Não foi possível entrar como convidado.";
      setErrorMsg(msg);
    }
  }

  async function onSubmitLogin(e) {
    e.preventDefault();
    if (submitting) return;
    await handleRealLogin();
  }

  return (
    <div style={ui.page}>
      <div style={ui.glowA} />
      <div style={ui.glowB} />

      <div style={ui.shell}>
        <div style={ui.card}>
          <div style={ui.header}>
            <div style={ui.logoWrap}>
              {logoOk ? (
                <div style={ui.logoBox}>
                  <img
                    src={LOGO_SRC}
                    alt="Palpitaco JB"
                    style={ui.logoImg}
                    onError={() => setLogoOk(false)}
                  />
                </div>
              ) : (
                <div style={ui.markFallback}>PJ</div>
              )}

              <div style={ui.titleWrap}>
                <p style={ui.subtitle}>Resultados • Estatística • Insights</p>
              </div>
            </div>
          </div>

          <div style={ui.body}>
            {errorMsg ? <div style={ui.errorBox}>{errorMsg}</div> : null}

            <form style={ui.formGrid} onSubmit={onSubmitLogin}>
              <div style={ui.fieldWrap}>
                <label style={ui.label} htmlFor="pp-login">
                  Login
                </label>
                <input
                  id="pp-login"
                  type="text"
                  value={loginValue}
                  onChange={(e) => setLoginValue(e.target.value)}
                  placeholder="Digite seu e-mail ou telefone"
                  style={ui.input}
                  autoComplete="username"
                  disabled={submitting}
                />
              </div>

              <div style={ui.fieldWrap}>
                <label style={ui.label} htmlFor="pp-password">
                  Senha
                </label>
                <input
                  id="pp-password"
                  type="password"
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  placeholder="Digite sua senha"
                  style={ui.input}
                  autoComplete="current-password"
                  disabled={submitting}
                />
              </div>

              <div style={ui.btnRow}>
                <button
                  type="submit"
                  style={{
                    ...ui.btnPrimary,
                    ...(submitting ? ui.btnDisabled : null),
                  }}
                  disabled={submitting}
                >
                  {submitting ? "PROCESSANDO..." : "ENTRAR / CADASTRAR"}
                </button>

                <button
                  type="button"
                  style={{
                    ...ui.btnSecondary,
                    ...(submitting ? ui.btnDisabled : null),
                  }}
                  onClick={enterGuest}
                  disabled={submitting}
                >
                  CONVIDADO
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}