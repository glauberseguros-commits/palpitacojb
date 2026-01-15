// src/pages/Admin/AdminLogin.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../services/firebase";
import { ADMINS_COLLECTION as ADMINS_COLLECTION_RAW } from "./adminKeys";

const GOLD = "rgba(202,166,75,1)";
const GOLD_SOFT = "rgba(202,166,75,0.16)";
const WHITE = "rgba(255,255,255,0.92)";
const WHITE_70 = "rgba(255,255,255,0.70)";
const BLACK = "#050505";
const BORDER = "rgba(202,166,75,0.35)";
const SHADOW = "0 18px 45px rgba(0,0,0,0.55)";

const LS_ADMIN_EMAIL = "pp_admin_email_v1";
const LS_ADMIN_LAST_UID = "pp_admin_uid_v1";

// ✅ não assume que adminKeys sempre vem limpo
const ADMINS_COLLECTION = String(ADMINS_COLLECTION_RAW || "").trim() || "admins";

/* =========================
   Helpers
========================= */

function safeStr(v) {
  return String(v ?? "").trim();
}

function normEmail(v) {
  return safeStr(v).toLowerCase();
}

function isEmailLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function humanizeFirebaseAuthError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");

  if (code === "auth/api-key-not-valid" || msg.includes("api-key-not-valid")) {
    return "API KEY do Firebase inválida no frontend. Verifique src/services/firebase.js (apiKey) e reinicie o npm start.";
  }

  if (code === "auth/invalid-credential") return "Credenciais inválidas. Confira e-mail e senha.";
  if (code === "auth/user-not-found") return "Usuário não encontrado.";
  if (code === "auth/wrong-password") return "Senha incorreta.";
  if (code === "auth/too-many-requests") return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (code === "auth/network-request-failed") return "Falha de rede. Verifique a conexão e tente novamente.";

  return msg || "Falha no login.";
}

function humanizeFirestoreError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");

  if (code.includes("permission-denied") || msg.toLowerCase().includes("permission")) {
    return "Sem permissão para validar Admin. Confirme as Rules e se o doc /admins/<UID> está acessível para o próprio UID.";
  }
  if (code.includes("unavailable")) {
    return "Firestore indisponível no momento. Tente novamente em instantes.";
  }
  if (code.includes("network")) {
    return "Falha de rede ao validar Admin. Verifique sua conexão.";
  }
  return msg || "Falha ao validar permissões no Firestore.";
}

async function isUidAdmin(uid) {
  try {
    const ref = doc(db, ADMINS_COLLECTION, String(uid || ""));
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() || {};
    return data.active !== false; // default true
  } catch (e) {
    // Propaga para exibir mensagem decente no UI
    const err = new Error(humanizeFirestoreError(e));
    err.__raw = e;
    throw err;
  }
}

function safeReadLS(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeWriteLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function safeRemoveLS(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export default function AdminLogin({ onAuthed, onCancel }) {
  const [email, setEmail] = useState(() => safeReadLS(LS_ADMIN_EMAIL) || "");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const lockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setSafeErr = (text) => {
    if (!mountedRef.current) return;
    setErr(text);
  };
  const setSafeBusy = (v) => {
    if (!mountedRef.current) return;
    setBusy(v);
  };

  // ✅ Auto-login: se já estiver logado e for admin, entra direto
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      // evita corrida: auth change + submit
      if (lockRef.current) return;

      try {
        setSafeBusy(true);
        setSafeErr("");

        // força refresh token (pega claims/estado atual)
        await user.getIdToken(true);

        const ok = await isUidAdmin(user.uid);
        if (!ok) {
          await signOut(auth);
          safeRemoveLS(LS_ADMIN_LAST_UID);
          setSafeErr("Acesso negado: este usuário não é Admin do Palpitaco.");
          return;
        }

        safeWriteLS(LS_ADMIN_LAST_UID, user.uid);
        onAuthed?.({ uid: user.uid, email: user.email || "" });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[AdminLogin] auto-check admin error:", e?.__raw || e);
        setSafeErr(String(e?.message || "Falha ao validar Admin."));
      } finally {
        setSafeBusy(false);
      }
    });

    return () => {
      try {
        unsub?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    const e = normEmail(email);
    const p = safeStr(pass);
    return isEmailLike(e) && p.length >= 6 && !busy;
  }, [email, pass, busy]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;

    const eMail = normEmail(email);
    const pWord = safeStr(pass);

    if (!isEmailLike(eMail)) return setErr("Informe um e-mail válido.");
    if (pWord.length < 6) return setErr("Senha deve ter pelo menos 6 caracteres.");

    setErr("");
    setBusy(true);
    lockRef.current = true;

    try {
      const cred = await signInWithEmailAndPassword(auth, eMail, pWord);

      // ✅ persist email
      safeWriteLS(LS_ADMIN_EMAIL, eMail);

      const uid = cred?.user?.uid;
      if (!uid) throw new Error("Login incompleto (UID ausente).");

      // força refresh token (importante quando troca de usuário)
      await cred.user.getIdToken(true);

      const ok = await isUidAdmin(uid);

      if (!ok) {
        await signOut(auth);
        safeRemoveLS(LS_ADMIN_LAST_UID);
        setErr("Acesso negado: este usuário não é Admin do Palpitaco.");
        return;
      }

      safeWriteLS(LS_ADMIN_LAST_UID, uid);
      onAuthed?.({ uid, email: cred?.user?.email || eMail });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[AdminLogin] auth error:", error?.code, error);
      setErr(humanizeFirebaseAuthError(error));
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BLACK,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          borderRadius: 18,
          border: `1px solid ${BORDER}`,
          background: "rgba(0,0,0,0.52)",
          boxShadow: SHADOW,
          padding: 18,
        }}
      >
        <div style={{ fontWeight: 900, letterSpacing: 2, color: GOLD, fontSize: 12 }}>
          PALPITACO • ADMIN
        </div>

        <div style={{ fontWeight: 900, color: WHITE, fontSize: 24, marginTop: 6 }}>
          Acesso restrito
        </div>

        <div style={{ color: WHITE_70, marginTop: 6, lineHeight: 1.35 }}>
          Entre com e-mail e senha de administrador para gerenciar usuários (VIP/planos).
        </div>

        <form onSubmit={submit} style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ color: WHITE_70, fontSize: 12 }}>E-mail de acesso</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@dominio.com"
              autoComplete="username"
              disabled={busy}
              inputMode="email"
              style={{
                height: 44,
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                background: "rgba(0,0,0,0.35)",
                color: WHITE,
                padding: "0 12px",
                outline: "none",
                opacity: busy ? 0.8 : 1,
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ color: WHITE_70, fontSize: 12 }}>Senha</div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                type={showPass ? "text" : "password"}
                placeholder="Senha do painel"
                autoComplete="current-password"
                disabled={busy}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.35)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                  opacity: busy ? 0.8 : 1,
                }}
              />

              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                disabled={busy}
                style={{
                  height: 44,
                  borderRadius: 12,
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  color: WHITE_70,
                  padding: "0 12px",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: busy ? 0.8 : 1,
                }}
                title={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>

          {err ? (
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,80,80,0.35)",
                background: "rgba(255,80,80,0.10)",
                color: WHITE,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.3,
              }}
            >
              {err}
              {String(err || "").toLowerCase().includes("rules") ? (
                <div style={{ marginTop: 6, color: WHITE_70, fontSize: 12 }}>
                  Se quiser validar: o doc deve existir em <b>/{ADMINS_COLLECTION}/&lt;UID&gt;</b> e permitir leitura pelo próprio UID.
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              height: 46,
              borderRadius: 999,
              border: "none",
              cursor: canSubmit ? "pointer" : "not-allowed",
              background: canSubmit ? GOLD : GOLD_SOFT,
              color: "#111",
              fontWeight: 900,
              letterSpacing: 0.5,
              marginTop: 4,
            }}
          >
            {busy ? "Entrando..." : "Entrar no painel"}
          </button>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              style={{
                height: 40,
                borderRadius: 999,
                background: "transparent",
                border: `1px solid ${BORDER}`,
                color: WHITE_70,
                padding: "0 14px",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.85 : 1,
              }}
            >
              Voltar
            </button>
            <div style={{ flex: 1 }} />
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Dica: no Firestore, crie o doc <b>/{ADMINS_COLLECTION}/&lt;UID&gt;</b> com <b>{`{ active: true }`}</b>.
          </div>
        </form>
      </div>
    </div>
  );
}
