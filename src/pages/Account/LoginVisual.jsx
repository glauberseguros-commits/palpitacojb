// src/pages/Account/LoginVisual.jsx
import React, { useMemo, useState, useEffect } from "react";

// ✅ Firebase Auth
import { auth } from "../../services/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

/**
 * LoginVisual (premium) — AGORA COM AUTH REAL
 * - Login/Cadastro: Firebase Auth (email)
 * - Telefone: por enquanto NÃO suporta Auth (apenas valida formato; exige email).
 * - NÃO escreve no Firestore (isso fica no Account.jsx / Admin)
 */

function isEmailLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isPhoneLikeBR(v) {
  const digits = String(v ?? "").replace(/\D+/g, "");
  return digits.length === 10 || digits.length === 11;
}

function detectLoginType(id) {
  if (isEmailLike(id)) return "email";
  if (isPhoneLikeBR(id)) return "phone";
  return "unknown";
}

function normalizePhoneDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

export default function LoginVisual({ onEnter, onSkip }) {
  const ui = useMemo(() => {
    const GOLD = "rgba(202,166,75,1)";
    const WHITE = "rgba(255,255,255,0.92)";
    const WHITE_70 = "rgba(255,255,255,0.70)";

    const BLACK = "#050505";
    const LAYER_1 = "rgba(5,5,5,0.72)";
    const LAYER_2 = "rgba(5,5,5,0.62)";
    const LAYER_3 = "rgba(5,5,5,0.52)";

    const BORDER_GOLD = "rgba(202,166,75,0.30)";
    const BORDER_SOFT = "rgba(255,255,255,0.10)";
    const BORDER_SOFT2 = "rgba(255,255,255,0.08)";

    return {
      colors: { GOLD, WHITE, WHITE_70, BLACK },

      root: {
        minHeight: "100vh",
        background: `
          radial-gradient(1200px 700px at 50% 0%, rgba(202,166,75,0.05) 0%, rgba(0,0,0,0) 58%),
          ${BLACK}
        `,
        color: WHITE,
        display: "grid",
        placeItems: "center",
        padding: 18,
      },

      card: {
        width: "min(560px, 94vw)",
        borderRadius: 18,
        border: `1px solid ${BORDER_SOFT2}`,
        background: `
          radial-gradient(520px 320px at 35% 10%, rgba(202,166,75,0.08) 0%, rgba(0,0,0,0) 62%),
          ${LAYER_1}
        `,
        boxShadow: "0 24px 70px rgba(0,0,0,0.70)",
        overflow: "hidden",
      },

      header: {
        padding: "18px 18px 14px",
        borderBottom: `1px solid ${BORDER_SOFT2}`,
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        gap: 10,
        background: LAYER_1,
      },

      logoWrap: {
        width: "100%",
        display: "grid",
        justifyItems: "center",
      },

      logoFrame: {
        width: "min(420px, 86%)",
        borderRadius: 16,
        border: `1px solid ${BORDER_SOFT2}`,
        background: `
          radial-gradient(520px 220px at 50% 20%, rgba(202,166,75,0.08) 0%, rgba(0,0,0,0) 68%),
          ${LAYER_2}
        `,
        boxShadow: "0 18px 50px rgba(0,0,0,0.60)",
        padding: 10,
        display: "grid",
        placeItems: "center",
      },

      logoImg: {
        width: "100%",
        height: "auto",
        maxHeight: 170,
        objectFit: "contain",
        display: "block",
        filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.55))",
      },

      logoFallback: {
        width: "min(420px, 86%)",
        borderRadius: 16,
        border: `1px solid ${BORDER_GOLD}`,
        background: `
          linear-gradient(180deg, rgba(202,166,75,0.16), rgba(0,0,0,0)),
          ${LAYER_2}
        `,
        padding: "18px 14px",
        display: "grid",
        gap: 6,
        placeItems: "center",
      },

      fallbackTitle: { fontWeight: 1000, letterSpacing: 0.2, fontSize: 18 },
      fallbackTag: { fontWeight: 900, fontSize: 12.5, color: WHITE_70 },

      body: {
        padding: 18,
        display: "grid",
        gap: 12,
        background: LAYER_1,
      },

      field: { display: "grid", gap: 6 },
      label: { fontSize: 12, opacity: 0.85, fontWeight: 900 },

      input: {
        height: 44,
        borderRadius: 12,
        border: `1px solid ${BORDER_SOFT}`,
        background: LAYER_2,
        color: WHITE,
        padding: "0 12px",
        outline: "none",
        fontWeight: 800,
        letterSpacing: 0.2,
      },

      hint: { opacity: 0.72, fontSize: 12, lineHeight: 1.35 },

      msgErr: {
        marginTop: 2,
        fontSize: 12.5,
        lineHeight: 1.35,
        color: "rgba(255,120,120,0.95)",
        fontWeight: 900,
      },
      msgOk: {
        marginTop: 2,
        fontSize: 12.5,
        lineHeight: 1.35,
        color: "rgba(120,255,180,0.95)",
        fontWeight: 900,
      },

      actions: {
        padding: 18,
        borderTop: `1px solid ${BORDER_SOFT2}`,
        display: "grid",
        gap: 10,
        background: LAYER_1,
      },

      actionsTop: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
      },

      actionsBottom: {
        display: "grid",
      },

      btn: (variant, disabled) => ({
        height: 44,
        borderRadius: 12,
        border:
          variant === "primary"
            ? `1px solid rgba(202,166,75,0.42)`
            : `1px solid ${BORDER_SOFT}`,
        background:
          variant === "primary"
            ? `linear-gradient(180deg, rgba(202,166,75,0.18), rgba(0,0,0,0)), ${LAYER_3}`
            : LAYER_3,
        color: WHITE,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 1000,
        letterSpacing: 0.35,
        boxShadow: variant === "primary" ? "0 14px 34px rgba(0,0,0,0.60)" : "none",
        opacity: disabled ? 0.55 : 1,
      }),
    };
  }, []);

  const [loginId, setLoginId] = useState("");
  const [pass, setPass] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const LOGO_PATH = `${process.env.PUBLIC_URL || ""}/logo-palpitaco-jb.png`;
  const [logoSrc] = useState(LOGO_PATH);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    setMsg("");
    setErr("");
  }, [loginId, pass]);

  const canSubmit = useMemo(() => {
    const id = String(loginId || "").trim();
    const p = String(pass || "").trim();
    if (busy) return false;
    if (!id) return false;
    if (!isEmailLike(id) && !isPhoneLikeBR(id)) return false;
    if (p.length < 6) return false;
    return true;
  }, [loginId, pass, busy]);

  function humanAuthError(e) {
    const code = String(e?.code || "");
    if (code.includes("auth/invalid-email")) return "E-mail inválido.";
    if (code.includes("auth/user-not-found")) return "Conta não encontrada. Verifique o e-mail.";
    if (code.includes("auth/wrong-password")) return "Senha incorreta.";
    if (code.includes("auth/invalid-credential")) return "Credenciais inválidas.";
    if (code.includes("auth/email-already-in-use")) return "Este e-mail já está cadastrado.";
    if (code.includes("auth/weak-password")) return "Senha fraca. Use pelo menos 6 caracteres.";
    if (code.includes("auth/too-many-requests"))
      return "Muitas tentativas. Aguarde um pouco e tente novamente.";
    return e?.message || "Falha ao autenticar.";
  }

  async function authAction(mode) {
    setErr("");
    setMsg("");

    if (!canSubmit) {
      setErr("Informe um e-mail válido e senha (mínimo 6).");
      return;
    }

    const idRaw = String(loginId || "").trim();
    const type = detectLoginType(idRaw);

    // ✅ Telefone (BR) ainda é “visual” (sem Auth), pois exigiria Phone Auth + reCAPTCHA
    if (type === "phone") {
      setErr("Login por telefone ainda não está habilitado. Use e-mail.");
      return;
    }

    const email = idRaw.toLowerCase();
    const password = String(pass || "");

    setBusy(true);
    try {
      // evita sessão antiga “vazar” (principalmente se trocar usuário)
      try {
        await signOut(auth);
      } catch {}

      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
        setMsg("Cadastro criado com sucesso. Você já pode acessar.");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setMsg("Acesso liberado.");
      }

      onEnter?.({
        loginId: email,
        loginType: "email",
        mode,
      });
    } catch (e) {
      setErr(humanAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={ui.root}>
      <div style={ui.card}>
        <div style={ui.header}>
          <div style={ui.logoWrap}>
            {logoOk ? (
              <div style={ui.logoFrame}>
                <img
                  src={logoSrc}
                  alt="PALPITACO JB — Estatística • Leitura • Análise"
                  style={ui.logoImg}
                  onLoad={() => setLogoOk(true)}
                  onError={() => setLogoOk(false)}
                />
              </div>
            ) : (
              <div style={ui.logoFallback}>
                <div style={ui.fallbackTitle}>PALPITACO JB</div>
                <div style={ui.fallbackTag}>Estatística • Leitura • Análise</div>
              </div>
            )}
          </div>
        </div>

        <div style={ui.body}>
          <div style={ui.field}>
            <div style={ui.label}>E-MAIL OU TELEFONE</div>
            <input
              style={ui.input}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Digite seu e-mail (telefone ainda não habilitado)"
              inputMode="text"
              autoComplete="username"
              disabled={busy}
            />
          </div>

          <div style={ui.field}>
            <div style={ui.label}>Senha</div>
            <input
              style={ui.input}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Digite sua senha"
              type="password"
              autoComplete="current-password"
              disabled={busy}
            />
          </div>

          <div style={ui.hint}>Se você ainda não tem conta, se CADASTRE.</div>

          {err ? <div style={ui.msgErr}>{err}</div> : null}
          {msg ? <div style={ui.msgOk}>{msg}</div> : null}
        </div>

        <div style={ui.actions}>
          <div style={ui.actionsTop}>
            <button
              type="button"
              style={ui.btn("primary", busy || !canSubmit)}
              onClick={() => authAction("login")}
              disabled={busy || !canSubmit}
              title={!canSubmit ? "E-mail válido + senha (mínimo 6)" : "ENTRAR"}
            >
              {busy ? "PROCESSANDO..." : "ENTRAR"}
            </button>

            <button
              type="button"
              style={ui.btn("secondary", busy || !canSubmit)}
              onClick={() => authAction("signup")}
              disabled={busy || !canSubmit}
              title={!canSubmit ? "E-mail válido + senha (mínimo 6)" : "CADASTRAR"}
            >
              {busy ? "PROCESSANDO..." : "CADASTRAR"}
            </button>
          </div>

          <div style={ui.actionsBottom}>
            <button
              type="button"
              style={ui.btn("secondary", busy)}
              onClick={() =>
                onSkip?.({
                  loginId: "guest",
                  loginType: "guest",
                  mode: "skip",
                })
              }
              disabled={busy}
            >
              ENTRAR SEM LOGIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
