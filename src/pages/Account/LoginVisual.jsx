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

function safeSetLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function safeRemoveLS(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export default function LoginVisual({ onEnter, onSkip, onRegister }) {
  const [logoOk, setLogoOk] = useState(true);
  const [stage, setStage] = useState("entry"); // entry | auth
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
    const WHITE_72 = "rgba(255,255,255,0.72)";
    const WHITE_60 = "rgba(255,255,255,0.60)";
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
        padding: "clamp(24px, 3vw, 34px) clamp(22px, 3vw, 30px) 18px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "linear-gradient(180deg, rgba(202,166,75,0.09), rgba(0,0,0,0.02) 70%)",
      },

      logoWrap: {
        display: "grid",
        placeItems: "center",
      },

      logoBox: {
        width: "min(380px, 82vw)",
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
        marginTop: 8,
      },

      subtitle: {
        fontSize: "clamp(14px, 1.6vw, 16px)",
        color: WHITE,
        fontWeight: 700,
        letterSpacing: 0.4,
        margin: "4px 0 0 0",
      },

      body: {
        padding: "18px 22px 22px",
        display: "grid",
        gap: 14,
      },

      sectionTitle: {
        margin: 0,
        fontSize: 18,
        fontWeight: 900,
        letterSpacing: 0.2,
        textAlign: "center",
      },

      sectionText: {
        margin: 0,
        fontSize: 13,
        lineHeight: 1.45,
        color: WHITE_72,
        textAlign: "center",
      },

      formGrid: {
        display: "grid",
        gap: 12,
      },

      fieldWrap: {
        display: "grid",
        gap: 6,
      },

      label: {
        fontSize: 13,
        fontWeight: 800,
        color: WHITE_72,
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

      hint: {
        margin: 0,
        fontSize: 12,
        lineHeight: 1.4,
        color: WHITE_60,
        textAlign: "center",
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
      },

      btnRow: {
        display: "grid",
        gap: 12,
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

      btnGhost: {
        height: 46,
        borderRadius: 15,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "transparent",
        color: WHITE_72,
        fontWeight: 800,
        cursor: "pointer",
        fontSize: 14,
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
      setErrorMsg("Preencha login e senha.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    // Impede conflito com sessão fake anterior
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

      // O componente pai é o dono da autenticação real.
      // Se ele autenticou, ele decide navegação/sessão Firebase.
      if (result === false) {
        throw new Error("Login inválido.");
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

    safeSetLS(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({
        ok: true,
        type: "guest",
        loginType: "guest",
        plan: "FREE",
        authMode: "visual",
        ts: Date.now(),
      })
    );

    safeSetLS(LS_GUEST_ACTIVE_KEY, "1");
    dispatchSessionChanged();

    try {
      onSkip?.();
    } catch {}
  }

  async function onSubmitLogin(e) {
    e.preventDefault();
    if (submitting) return;
    await handleRealLogin();
  }

  function onCadastrar() {
    setErrorMsg("");

    if (typeof onRegister === "function") {
      onRegister();
      return;
    }

    window.alert("Fluxo de cadastro ainda não foi conectado.");
  }

  function goToAuthStage() {
    setErrorMsg("");
    setStage("auth");
  }

  function goToEntryStage() {
    setErrorMsg("");
    setStage("entry");
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
            {stage === "entry" ? (
              <div style={ui.btnRow}>
                <button type="button" style={ui.btnPrimary} onClick={goToAuthStage}>
                  ENTRAR
                </button>

                <button type="button" style={ui.btnSecondary} onClick={enterGuest}>
                  CONVIDADO
                </button>
              </div>
            ) : (
              <>
                <h2 style={ui.sectionTitle}>Acesso ao painel</h2>
                <p style={ui.sectionText}>
                  Login e senha precisam passar pelo fluxo real do Firebase. Convidado é acesso visual local.
                </p>

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
                      placeholder="Digite seu login"
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

                  <p style={ui.hint}>
                    Este formulário não cria sessão local fake de usuário. A autenticação deve ser feita no componente pai.
                  </p>

                  <div style={ui.btnRow}>
                    <button
                      type="submit"
                      style={{
                        ...ui.btnPrimary,
                        ...(submitting ? ui.btnDisabled : null),
                      }}
                      disabled={submitting}
                    >
                      {submitting ? "ENTRANDO..." : "ENTRAR"}
                    </button>

                    <button
                      type="button"
                      style={{
                        ...ui.btnSecondary,
                        ...(submitting ? ui.btnDisabled : null),
                      }}
                      onClick={onCadastrar}
                      disabled={submitting}
                    >
                      CADASTRAR
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

                    <button
                      type="button"
                      style={{
                        ...ui.btnGhost,
                        ...(submitting ? ui.btnDisabled : null),
                      }}
                      onClick={goToEntryStage}
                      disabled={submitting}
                    >
                      VOLTAR
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}