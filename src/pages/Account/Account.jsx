// src/pages/Account/Account.jsx
import React, { useEffect, useMemo, useState } from "react";
import LoginVisual from "./LoginVisual";

/**
 * Account (Minha Conta) — Premium
 *
 * ✅ AGORA:
 * - LoginVisual faz Auth real (email) e chama onEnter(payload)
 * - Account grava sessão visual (pp_session_v1) apenas como cache local
 * - Após login/cadastro (não-guest): chama onLoggedIn() -> App vai para DASHBOARD
 * - Guest (sem login): também pode ir para DASHBOARD (onLoggedIn)
 *
 * IMPORTANTE:
 * - Este componente continua NÃO escrevendo no Firestore.
 * - Firestore/UserDoc fica para Admin e/ou um futuro sync.
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
  return digits.length === 10 || digits.length === 11;
}

function detectLoginType(idNorm) {
  if (isEmailLike(idNorm)) return "email";
  if (isPhoneLike(idNorm)) return "phone";
  return "unknown";
}

function safeISO(s) {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatBRDateTime(iso) {
  const d = safeISO(iso);
  if (!d) return "—";
  try {
    return d.toLocaleString("pt-BR");
  } catch {
    return String(iso || "—");
  }
}

/* =========================
   Plan engine (FREE/PRO/VIP)
========================= */

function isStillValidIso(expiresAt) {
  if (!expiresAt) return true;
  const d = safeISO(expiresAt);
  if (!d) return false;
  return Date.now() <= d.getTime();
}

function isStillValidMs(untilMs) {
  if (!untilMs) return false;
  const v = Number(untilMs || 0);
  if (!Number.isFinite(v)) return false;
  return v > Date.now();
}

function computePlan(session) {
  const vipIndefinite = !!session?.vipIndefinite;
  const vipUntilMs = session?.vipUntilMs != null ? Number(session.vipUntilMs) : null;
  const vipFlags = session?.vipFlags || null;

  const proUntilMs = session?.proUntilMs != null ? Number(session.proUntilMs) : null;
  const planBase = String(session?.planBase || "").toLowerCase();

  const vipActiveNew = vipIndefinite || isStillValidMs(vipUntilMs);
  if (vipActiveNew) {
    const scope = vipFlags && vipFlags.full === false ? "PARTIAL" : "FULL";
    return {
      tier: "VIP",
      scope,
      expiresAt: vipIndefinite ? null : vipUntilMs ? new Date(vipUntilMs).toISOString() : null,
    };
  }

  const proActiveNew = isStillValidMs(proUntilMs) || planBase === "pro";
  if (proActiveNew) {
    return {
      tier: "PRO",
      scope: "FULL",
      expiresAt: proUntilMs ? new Date(proUntilMs).toISOString() : null,
    };
  }

  const vip = session?.vip;
  const pro = session?.pro;

  const vipActiveOld = !!vip?.enabled && isStillValidIso(vip?.expiresAt);
  if (vipActiveOld) {
    const scope = String(vip?.scope || "FULL").toUpperCase();
    return {
      tier: "VIP",
      scope: scope === "PARTIAL" ? "PARTIAL" : "FULL",
      expiresAt: vip?.expiresAt ?? null,
    };
  }

  const proActiveOld = !!pro?.enabled && isStillValidIso(pro?.expiresAt);
  if (proActiveOld) {
    return { tier: "PRO", scope: "FULL", expiresAt: pro?.expiresAt ?? null };
  }

  return { tier: "FREE", scope: "FULL", expiresAt: null };
}

function planLabel(plan) {
  if (!plan?.tier) return "FREE";
  return plan.tier;
}

function planSubLabel(plan) {
  if (!plan?.tier) return "";
  if (plan.tier === "VIP") {
    if (!plan.expiresAt) return plan.scope === "PARTIAL" ? "VIP (parcial)" : "VIP (indeterminado)";
    return plan.scope === "PARTIAL"
      ? `VIP (parcial) até ${formatBRDateTime(plan.expiresAt)}`
      : `VIP até ${formatBRDateTime(plan.expiresAt)}`;
  }
  if (plan.tier === "PRO") {
    if (!plan.expiresAt) return "PRO ativo";
    return `PRO até ${formatBRDateTime(plan.expiresAt)}`;
  }
  return "FREE";
}

/* =========================
   Image helper (optional photo)
========================= */

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });
}

function computeInitials(name) {
  const nm = String(name || "").trim();
  if (!nm) return "PP";
  const parts = nm.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "P";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

/* =========================
   Component
========================= */

export default function Account({ onClose = null, onLoggedIn = null }) {
  const [session, setSession] = useState(null);
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  // perfil (nome/foto)
  const [nameDraft, setNameDraft] = useState("");
  const [photoDraft, setPhotoDraft] = useState(""); // dataURL
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  useEffect(() => {
    const s = loadSession();
    if (s?.ok) setSession(s);

    function onResize() {
      setVw(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isLogged = !!session?.ok;

  const isGuest = useMemo(() => {
    const t = String(session?.loginType || "").toLowerCase();
    const id = String(session?.loginId || "").toLowerCase();
    return t === "guest" || id === "guest";
  }, [session?.loginType, session?.loginId]);

  const headerSubtitle = useMemo(() => {
    if (!isLogged) return "Faça login, cadastre-se ou entre sem login.";
    return "Sessão ativa. Você pode sair/fechar quando quiser.";
  }, [isLogged]);

  const plan = useMemo(() => computePlan(session), [session]);

  const needsProfile = useMemo(() => {
    const nm = String(session?.name || "").trim();
    return isLogged && !isGuest && nm.length < 2;
  }, [isLogged, isGuest, session?.name]);

  const initials = useMemo(() => {
    const fromDraft = String(nameDraft || "").trim();
    return computeInitials(fromDraft || session?.name);
  }, [nameDraft, session?.name]);

  useEffect(() => {
    if (!session?.ok) return;
    setNameDraft(String(session?.name || "").trim());
    setPhotoDraft(String(session?.photoUrl || ""));
    setProfileMsg("");
    setProfileErr("");
  }, [session]);

  const gridIsMobile = vw < 980;

  const ui = useMemo(() => {
    const GOLD = "rgba(201,168,62,0.95)";
    const BORDER = "rgba(255,255,255,0.14)";
    const BORDER2 = "rgba(255,255,255,0.10)";
    const BG = "rgba(0,0,0,0.40)";
    const BG2 = "rgba(0,0,0,0.45)";
    const SHADOW = "0 18px 48px rgba(0,0,0,0.55)";

    return {
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
        border: `1px solid ${BORDER}`,
        background: BG2,
        boxShadow: SHADOW,
      },
      title: { fontSize: 18, fontWeight: 900, letterSpacing: 0.2 },
      subtitle: { marginTop: 6, fontSize: 12.5, opacity: 0.78, lineHeight: 1.35 },

      grid: {
        display: "grid",
        gridTemplateColumns: gridIsMobile
          ? "1fr"
          : "minmax(320px, 1.1fr) minmax(320px, 1fr)",
        gap: 14,
        minHeight: 0,
        flex: 1,
      },

      card: {
        borderRadius: 18,
        border: `1px solid ${BORDER}`,
        background: BG,
        boxShadow: SHADOW,
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

      cardTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 0.15 },

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
        fontWeight: 950,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(201,168,62,0.35)",
        background: "rgba(201,168,62,0.10)",
        color: GOLD,
        whiteSpace: "nowrap",
      },

      profile: { display: "grid", gap: 10 },

      row: {
        display: "grid",
        gridTemplateColumns: gridIsMobile ? "1fr" : "120px 1fr",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 14,
        border: `1px solid ${BORDER2}`,
        background: "rgba(0,0,0,0.35)",
      },

      k: { fontSize: 12, fontWeight: 900, opacity: 0.75 },
      v: { fontSize: 12.5, fontWeight: 800, wordBreak: "break-word" },
      vGold: { fontSize: 12.5, fontWeight: 950, color: GOLD },

      actions: { marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" },

      secondaryBtn: {
        height: 40,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 900,
        letterSpacing: 0.15,
        cursor: "pointer",
        padding: "0 14px",
      },

      primaryBtn: {
        height: 40,
        borderRadius: 14,
        border: "1px solid rgba(201,168,62,0.55)",
        background: "rgba(201,168,62,0.14)",
        color: GOLD,
        fontWeight: 950,
        letterSpacing: 0.15,
        cursor: "pointer",
        padding: "0 14px",
      },

      input: {
        height: 42,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.45)",
        color: "rgba(255,255,255,0.92)",
        padding: "0 12px",
        outline: "none",
        boxSizing: "border-box",
        fontWeight: 800,
        letterSpacing: 0.15,
      },

      hint: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.35 },

      msgErr: { fontSize: 12.5, fontWeight: 900, color: "rgba(255,120,120,0.95)" },
      msgOk: { fontSize: 12.5, fontWeight: 900, color: "rgba(120,255,180,0.95)" },

      avatarRow: {
        display: "grid",
        gridTemplateColumns: gridIsMobile ? "1fr" : "84px 1fr",
        gap: 12,
        alignItems: "center",
      },

      avatar: {
        width: 84,
        height: 84,
        borderRadius: 18,
        border: "1px solid rgba(201,168,62,0.35)",
        background: "linear-gradient(180deg, rgba(201,168,62,0.12), rgba(0,0,0,0.35))",
        boxShadow: "0 14px 34px rgba(0,0,0,0.55)",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
      },

      avatarImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },

      avatarFallback: {
        fontWeight: 1000,
        color: "rgba(10,10,10,0.92)",
        background: "rgba(201,168,62,0.95)",
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
      },

      list: { display: "grid", gap: 8, fontSize: 12.5, opacity: 0.85, lineHeight: 1.35 },

      divider: { height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" },

      note: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.45 },

      mono: {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontWeight: 900,
      },
    };
  }, [gridIsMobile]);

  const handleEnter = (payload) => {
    const rawId = payload?.loginId ?? "";
    const id = normalizeLoginId(rawId);

    const loginType =
      payload?.loginType && payload.loginType !== "unknown"
        ? payload.loginType
        : detectLoginType(id);

    const mode = payload?.mode || "login";

    const payloadName = String(payload?.name || "").trim();
    const payloadPhoto = String(payload?.photoUrl || "").trim();

    const next = {
      ok: true,
      loginId: id || "—",
      loginType,
      mode,
      since: new Date().toISOString(),

      name: payloadName,
      photoUrl: payloadPhoto,

      pro: { enabled: false, expiresAt: null },
      vip: { enabled: false, expiresAt: null, scope: "FULL", features: {} },

      planBase: "free",
      proUntilMs: null,
      vipUntilMs: null,
      vipIndefinite: false,
      vipFlags: { full: true },
    };

    saveSession(next);
    setSession(next);

    // ✅ pós-login: sai da tela Account (Login) e vai para DASHBOARD via App
    if (typeof onLoggedIn === "function") onLoggedIn(next);
  };

  const handleSkip = () => {
    const next = {
      ok: true,
      loginId: "guest",
      loginType: "guest",
      mode: "skip",
      skipped: true,
      since: new Date().toISOString(),

      name: "",
      photoUrl: "",

      pro: { enabled: false, expiresAt: null },
      vip: { enabled: false, expiresAt: null, scope: "FULL", features: {} },

      planBase: "free",
      proUntilMs: null,
      vipUntilMs: null,
      vipIndefinite: false,
      vipFlags: { full: true },
    };
    saveSession(next);
    setSession(next);

    // ✅ guest também entra no app (Dashboard)
    if (typeof onLoggedIn === "function") onLoggedIn(next);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    if (typeof onClose === "function") onClose();
  };

  async function handlePhotoPick(file) {
    setProfileErr("");
    setProfileMsg("");
    if (!file) return;

    const maxMB = 1.8;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxMB) {
      setProfileErr(`Foto muito grande (${sizeMB.toFixed(2)} MB). Use até ${maxMB} MB.`);
      return;
    }

    try {
      const dataUrl = await fileToDataURL(file);
      setPhotoDraft(dataUrl);
    } catch {
      setProfileErr("Não foi possível carregar a foto.");
    }
  }

  function handleSaveProfile() {
    setProfileErr("");
    setProfileMsg("");

    const nm = String(nameDraft || "").trim();

    if (!isGuest && nm.length < 2) {
      setProfileErr("Informe seu nome (obrigatório).");
      return;
    }

    const next = { ...session, name: nm, photoUrl: String(photoDraft || "") };

    saveSession(next);
    setSession(next);
    setProfileMsg("Perfil atualizado.");
  }

  // ✅ Não logado: mostra Login
  if (!isLogged) {
    return <LoginVisual onEnter={handleEnter} onSkip={handleSkip} />;
  }

  const shownPlan = planLabel(plan);
  const shownPlanSub = planSubLabel(plan);

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={ui.title}>Minha Conta</div>
        <div style={ui.subtitle}>{headerSubtitle}</div>
      </div>

      <div style={ui.grid}>
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div style={ui.cardTitle}>{needsProfile ? "Completar Perfil" : "Perfil"}</div>
            <div style={ui.badge}>{needsProfile ? "Obrigatório" : isGuest ? "Opcional" : "Sessão ativa"}</div>
          </div>

          <div style={ui.avatarRow}>
            <div style={ui.avatar} aria-label="Foto do perfil">
              {session?.photoUrl || photoDraft ? (
                <img
                  src={String(photoDraft || session?.photoUrl || "")}
                  alt="Foto do perfil"
                  style={ui.avatarImg}
                />
              ) : (
                <div style={ui.avatarFallback}>{initials}</div>
              )}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={ui.hint}>
                  {isGuest ? (
                    <>
                      <b>Nome</b> e <b>foto</b> são <b>opcionais</b> (você entrou sem login). Fica só no seu
                      dispositivo.
                    </>
                  ) : (
                    <>
                      <b>Nome</b> (obrigatório) e <b>foto</b> (opcional). Fica só no seu dispositivo.
                    </>
                  )}
                </div>

                <input
                  style={ui.input}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={isGuest ? "Digite seu nome (opcional)" : "Digite seu nome"}
                  autoComplete="name"
                />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoPick(e.target.files?.[0] || null)}
                  style={{ color: "rgba(255,255,255,0.78)" }}
                />

                <div style={ui.actions}>
                  <button type="button" style={ui.primaryBtn} onClick={handleSaveProfile}>
                    SALVAR PERFIL
                  </button>

                  <button
                    type="button"
                    style={ui.secondaryBtn}
                    onClick={() => {
                      setPhotoDraft("");
                      const next = { ...session, photoUrl: "" };
                      saveSession(next);
                      setSession(next);
                      setProfileMsg("Foto removida.");
                      setProfileErr("");
                    }}
                  >
                    REMOVER FOTO
                  </button>
                </div>

                {profileErr ? <div style={ui.msgErr}>{profileErr}</div> : null}
                {profileMsg ? <div style={ui.msgOk}>{profileMsg}</div> : null}
              </div>
            </div>
          </div>

          <div style={ui.divider} />

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
              <div style={ui.vGold}>{shownPlan}</div>
            </div>

            {shownPlanSub ? (
              <div style={ui.row}>
                <div style={ui.k}>Detalhe</div>
                <div style={ui.v}>{shownPlanSub}</div>
              </div>
            ) : null}

            <div style={ui.row}>
              <div style={ui.k}>Cadastro</div>
              <div style={ui.v}>{formatBRDateTime(session?.since)}</div>
            </div>

            <div style={ui.actions}>
              <button type="button" style={ui.secondaryBtn} onClick={handleLogout}>
                SAIR / FECHAR
              </button>
            </div>

            {needsProfile ? (
              <div style={ui.msgErr}>
                Nome é obrigatório. Preencha e clique em <b>SALVAR PERFIL</b>.
              </div>
            ) : null}
          </div>
        </div>

        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div style={ui.cardTitle}>Plano & Regras</div>
            <div style={ui.badgeGold}>{shownPlan}</div>
          </div>

          <div style={ui.list}>
            <div>• <b>FREE</b>: padrão (sem pagamento).</div>
            <div>• <b>PRO</b>: pagamento ativo (30 dias+), com expiração.</div>
            <div>• <b>VIP</b>: somente admin ativa (pode ser parcial/total, com ou sem prazo).</div>
          </div>

          <div style={ui.divider} />

          <div style={ui.note}>
            ✅ Implementação atual: sessão local em <span style={ui.mono}>localStorage</span>. <br />
            Quando ligar pagamento real, preencha <span style={ui.mono}>proUntilMs</span>. <br />
            Para VIP, admin define <span style={ui.mono}>vipUntilMs</span> / <span style={ui.mono}>vipIndefinite</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
