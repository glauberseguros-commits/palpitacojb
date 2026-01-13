// src/pages/Account/Account.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * Account (Minha Conta / Login) — Premium (sem libs)
 * - Sem autenticação real (por enquanto)
 * - Login visual grava sessão simples em localStorage
 * - Sair/Fechar limpa sessão e chama onClose() (logout global no App)
 *
 * Chave localStorage:
 * - "pp_session_v1"
 */

const LS_KEY = "pp_session_v1";

/* =========================
   Storage helpers
========================= */

function safeParseJSON(s) {
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return safeParseJSON(raw);
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(session));
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

/* =========================
   Normalizers / validators
========================= */

function normalizeLoginId(v) {
  // Mantém números/()+- e letras (email), só “limpa” espaços duplicados
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function isEmailLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  // heurística simples (login visual)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isPhoneLike(v) {
  // heurística simples: se tiver pelo menos 10 dígitos, consideramos telefone possível
  const digits = String(v ?? "").replace(/\D+/g, "");
  return digits.length >= 10;
}

export default function Account({
  // opcional: se você tiver um controlador de página, pode passar callback
  onClose = null,
}) {
  const [session, setSession] = useState(null);

  // form (login visual)
  const [loginId, setLoginId] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const s = loadSession();
    if (s?.ok) setSession(s);
  }, []);

  const isLogged = !!session?.ok;

  const loginIdNorm = useMemo(() => normalizeLoginId(loginId), [loginId]);

  const handleLogin = (e) => {
    e.preventDefault();
    setMsg("");

    const id = normalizeLoginId(loginId);
    if (!id) {
      setMsg("Informe um e-mail ou telefone.");
      return;
    }

    // login visual: só uma checagem leve para reduzir lixo
    if (!isEmailLike(id) && !isPhoneLike(id)) {
      setMsg("Informe um e-mail válido ou um telefone com DDD.");
      return;
    }

    if (!String(senha || "").trim()) {
      setMsg("Informe a senha.");
      return;
    }

    // ✅ Login VISUAL (sem autenticação real)
    // Trocar depois por validação real no backend/Firebase
    const next = {
      ok: true,
      loginId: id,
      loginType: isEmailLike(id) ? "email" : "phone",
      plan: "Premium",
      since: new Date().toISOString(),
    };

    saveSession(next);
    setSession(next);
    setSenha("");
    setMsg("");
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setLoginId("");
    setSenha("");
    setMsg("");
    if (typeof onClose === "function") onClose();
  };

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={ui.title}>Minha Conta / Login</div>
        <div style={ui.subtitle}>
          Área de conta: editar dados, ver plano, sair/fechar sessão.
        </div>
      </div>

      <div style={ui.grid}>
        {/* ESQUERDA: LOGIN / PERFIL */}
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div style={ui.cardTitle}>{isLogged ? "Perfil" : "Acesso"}</div>
            <div style={ui.badge}>{isLogged ? "Sessão ativa" : "Login visual"}</div>
          </div>

          {!isLogged ? (
            <form onSubmit={handleLogin} style={ui.form}>
              <label style={ui.label}>E-mail ou telefone</label>
              <input
                value={loginIdNorm}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="email@dominio.com ou (xx) x xxxx-xxxx"
                style={ui.input}
                inputMode="text"
                autoComplete="off"
              />

              <label style={ui.label}>Senha</label>
              <input
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha"
                style={ui.input}
                type="password"
                autoComplete="off"
              />

              {msg ? <div style={ui.msg}>{msg}</div> : null}

              <button type="submit" style={ui.primaryBtn}>
                ENTRAR
              </button>

              <div style={ui.hint}>
                Observação: login ainda é visual. Autenticação real será ativada
                futuramente.
              </div>
            </form>
          ) : (
            <div style={ui.profile}>
              <div style={ui.row}>
                <div style={ui.k}>Identificação</div>
                <div style={ui.v}>{session?.loginId || "—"}</div>
              </div>

              <div style={ui.row}>
                <div style={ui.k}>Tipo</div>
                <div style={ui.v}>
                  {session?.loginType === "email"
                    ? "E-mail"
                    : session?.loginType === "phone"
                    ? "Telefone"
                    : "—"}
                </div>
              </div>

              <div style={ui.row}>
                <div style={ui.k}>Plano</div>
                <div style={ui.vGold}>{session?.plan || "—"}</div>
              </div>

              <div style={ui.row}>
                <div style={ui.k}>Desde</div>
                <div style={ui.v}>
                  {session?.since
                    ? new Date(session.since).toLocaleString("pt-BR")
                    : "—"}
                </div>
              </div>

              <div style={ui.actions}>
                <button type="button" style={ui.secondaryBtn} onClick={handleLogout}>
                  SAIR / FECHAR
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DIREITA: PLANO / FUTURO */}
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div style={ui.cardTitle}>Plano & Recursos</div>
            <div style={ui.badgeGold}>Premium</div>
          </div>

          <div style={ui.list}>
            <div style={ui.li}>• Botão: Sair / Fechar</div>
            <div style={ui.li}>
              • Futuro: alterar e-mail/telefone/senha (quando tiver autenticação real)
            </div>
            <div style={ui.li}>• Futuro: dados do plano Premium</div>
            <div style={ui.li}>• Futuro: histórico/recibos/assinatura</div>
          </div>

          <div style={ui.divider} />

          <div style={ui.note}>
            Quando você ativar autenticação real, esta tela já está preparada: basta
            trocar o <span style={ui.mono}>handleLogin</span> por validação via backend
            e preencher a sessão com os dados reais.
          </div>
        </div>
      </div>
    </div>
  );
}

const ui = {
  page: {
    height: "100%",
    minHeight: 0,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxSizing: "border-box",
    color: "rgba(255,255,255,0.92)",
  },
  header: {
    padding: "14px 16px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.45)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12.5,
    opacity: 0.78,
    lineHeight: 1.35,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, 1fr)",
    gap: 14,
    minHeight: 0,
    flex: 1,
  },
  card: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.40)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
    padding: 16,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0.15,
  },
  badge: {
    fontSize: 11,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
  },
  badgeGold: {
    fontSize: 11,
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(201,168,62,0.35)",
    background: "rgba(201,168,62,0.10)",
    color: "rgba(201,168,62,0.95)",
    whiteSpace: "nowrap",
  },
  form: { display: "grid", gap: 10 },
  label: { fontSize: 12, fontWeight: 800, opacity: 0.85 },
  input: {
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.45)",
    color: "rgba(255,255,255,0.92)",
    padding: "0 12px",
    outline: "none",
    boxSizing: "border-box",
  },
  msg: {
    fontSize: 12.5,
    color: "rgba(255,120,120,0.95)",
    fontWeight: 800,
  },
  primaryBtn: {
    height: 42,
    borderRadius: 14,
    border: "1px solid rgba(201,168,62,0.55)",
    background: "rgba(201,168,62,0.16)",
    color: "rgba(201,168,62,0.95)",
    fontWeight: 900,
    letterSpacing: 0.2,
    cursor: "pointer",
  },
  secondaryBtn: {
    height: 40,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    letterSpacing: 0.15,
    cursor: "pointer",
  },
  hint: { marginTop: 6, fontSize: 12, opacity: 0.72, lineHeight: 1.35 },
  profile: { display: "grid", gap: 10 },
  row: {
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
  },
  k: { fontSize: 12, fontWeight: 900, opacity: 0.75 },
  v: { fontSize: 12.5, fontWeight: 800 },
  vGold: { fontSize: 12.5, fontWeight: 900, color: "rgba(201,168,62,0.95)" },
  actions: { marginTop: 6, display: "flex", gap: 10 },
  list: { display: "grid", gap: 8, fontSize: 12.5, opacity: 0.85, lineHeight: 1.35 },
  li: {},
  divider: { height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" },
  note: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.45 },
  mono: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontWeight: 900,
  },
};
