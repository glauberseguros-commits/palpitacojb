// src/pages/Account/Account.jsx
import React, { useEffect, useMemo, useState } from "react";
import LoginVisual from "./LoginVisual";

/**
 * Account (Minha Conta / Login) — Premium
 * - Agora usa LoginVisual como UI única de login/cadastro
 * - Sessão VISUAL via localStorage (pp_session_v1)
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
   Normalizers / validators (leve)
========================= */

function normalizeLoginId(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function isEmailLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isPhoneLike(v) {
  const digits = String(v ?? "").replace(/\D+/g, "");
  // BR: DDD + número => 10 ou 11 dígitos (ex.: 61999999999)
  return digits.length === 10 || digits.length === 11;
}

function detectLoginType(idNorm) {
  if (isEmailLike(idNorm)) return "email";
  if (isPhoneLike(idNorm)) return "phone";
  return "unknown";
}

export default function Account({
  // opcional: se você tiver um controlador de página, pode passar callback
  onClose = null,
}) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const s = loadSession();
    if (s?.ok) setSession(s);
  }, []);

  const isLogged = !!session?.ok;

  const headerSubtitle = useMemo(() => {
    if (!isLogged) return "Faça login, cadastre-se ou entre sem login.";
    return "Sessão ativa. Você pode sair/fechar quando quiser.";
  }, [isLogged]);

  const handleEnter = (payload) => {
    // payload vem do LoginVisual
    const rawId = payload?.loginId ?? "";
    const id = normalizeLoginId(rawId);

    const loginType =
      payload?.loginType && payload.loginType !== "unknown"
        ? payload.loginType
        : detectLoginType(id);

    const mode = payload?.mode || "login";

    const next = {
      ok: true,
      loginId: id || "—",
      loginType,
      plan: "Premium",
      since: new Date().toISOString(),
      mode,
    };

    saveSession(next);
    setSession(next);
  };

  const handleSkip = () => {
    const next = {
      ok: true,
      loginId: "guest",
      loginType: "guest",
      plan: "Free",
      since: new Date().toISOString(),
      mode: "skip",
      skipped: true,
    };
    saveSession(next);
    setSession(next);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    if (typeof onClose === "function") onClose();
  };

  // Se NÃO estiver logado, mostra o LoginVisual em tela cheia (padrão premium)
  if (!isLogged) {
    return <LoginVisual onEnter={handleEnter} onSkip={handleSkip} />;
  }

  // Se estiver logado, mostra a tela “Minha Conta” (perfil + plano)
  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={ui.title}>Minha Conta</div>
        <div style={ui.subtitle}>{headerSubtitle}</div>
      </div>

      <div style={ui.grid}>
        {/* ESQUERDA: PERFIL */}
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div style={ui.cardTitle}>Perfil</div>
            <div style={ui.badge}>Sessão ativa</div>
          </div>

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
                  : session?.loginType === "guest"
                  ? "Sem login"
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
              <button
                type="button"
                style={ui.secondaryBtn}
                onClick={handleLogout}
              >
                SAIR / FECHAR
              </button>
            </div>
          </div>
        </div>

        {/* DIREITA: PLANO / FUTURO */}
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div style={ui.cardTitle}>Plano & Recursos</div>
            <div style={ui.badgeGold}>
              {session?.plan === "Premium" ? "Premium" : "Free"}
            </div>
          </div>

          <div style={ui.list}>
            <div style={ui.li}>• Sessão salva no dispositivo (localStorage)</div>
            <div style={ui.li}>• Botão: Sair / Fechar</div>
            <div style={ui.li}>
              • Futuro: autenticação real (Firebase Auth / backend)
            </div>
            <div style={ui.li}>
              • Futuro: plano Premium / pagamentos / histórico
            </div>
          </div>

          <div style={ui.divider} />

          <div style={ui.note}>
            Quando você ativar autenticação real, esta tela já está preparada:
            basta ligar o login/cadastro real no{" "}
            <span style={ui.mono}>LoginVisual</span> e preencher a sessão com dados
            reais — sem o usuário escrever nada no banco.
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
  v: { fontSize: 12.5, fontWeight: 800, wordBreak: "break-word" },
  vGold: { fontSize: 12.5, fontWeight: 900, color: "rgba(201,168,62,0.95)" },
  actions: { marginTop: 6, display: "flex", gap: 10 },
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
  list: {
    display: "grid",
    gap: 8,
    fontSize: 12.5,
    opacity: 0.85,
    lineHeight: 1.35,
  },
  li: {},
  divider: { height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" },
  note: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.45 },
  mono: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontWeight: 900,
  },
};
