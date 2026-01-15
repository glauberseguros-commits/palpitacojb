// src/pages/Account/Account.jsx
import React, { useEffect, useMemo, useState } from "react";
import LoginVisual from "./LoginVisual";
import { auth } from "../../services/firebase";
import { signOut } from "firebase/auth";

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
   Validators
========================= */
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
function normalizePhoneBR(v) {
  return String(v ?? "").replace(/\D+/g, "");
}
function isPhoneBRValidDigits(d) {
  const s = String(d || "");
  return s.length === 10 || s.length === 11;
}
function computeInitials(name) {
  const nm = String(name || "").trim();
  if (!nm) return "PP";
  const parts = nm.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "P";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}
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

/* =========================
   Component
========================= */
export default function Account({ onClose = null }) {
  const [session, setSession] = useState(null);
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [photoDraft, setPhotoDraft] = useState("");

  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  useEffect(() => {
    const s = loadSession();
    if (s?.ok) setSession(s);

    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isLogged = !!session?.ok;

  const isGuest = useMemo(() => {
    const t = String(session?.loginType || "").toLowerCase();
    const id = String(session?.loginId || "").toLowerCase();
    return t === "guest" || id === "guest" || !!session?.skipped;
  }, [session?.loginType, session?.loginId, session?.skipped]);

  const needsProfile = useMemo(() => {
    if (!isLogged) return false;
    if (isGuest) return false;
    const nm = String(session?.name || "").trim();
    const ph = String(session?.phoneDigits || "").trim();
    return nm.length < 2 || !isPhoneBRValidDigits(ph);
  }, [isLogged, isGuest, session?.name, session?.phoneDigits]);

  useEffect(() => {
    if (!session?.ok) return;
    setNameDraft(String(session?.name || "").trim());
    setPhoneDraft(String(session?.phoneDigits || "").trim());
    setPhotoDraft(String(session?.photoUrl || ""));
    setProfileMsg("");
    setProfileErr("");
  }, [session]);

  const initials = useMemo(() => {
    const nm = String(nameDraft || "").trim();
    return computeInitials(nm || session?.name);
  }, [nameDraft, session?.name]);

  const ui = useMemo(() => {
    const GOLD = "rgba(201,168,62,0.95)";
    const BORDER = "rgba(255,255,255,0.14)";
    const BORDER2 = "rgba(255,255,255,0.10)";
    const BG = "rgba(0,0,0,0.40)";
    const BG2 = "rgba(0,0,0,0.45)";
    const SHADOW = "0 18px 48px rgba(0,0,0,0.55)";
    const mobile = vw < 980;

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

      avatarRow: {
        display: "grid",
        gridTemplateColumns: mobile ? "1fr" : "84px 1fr",
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

      hint: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.35 },

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

      actions: { marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" },
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

      msgErr: { fontSize: 12.5, fontWeight: 900, color: "rgba(255,120,120,0.95)" },
      msgOk: { fontSize: 12.5, fontWeight: 900, color: "rgba(120,255,180,0.95)" },

      divider: { height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" },

      row: {
        display: "grid",
        gridTemplateColumns: mobile ? "1fr" : "140px 1fr",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 14,
        border: `1px solid ${BORDER2}`,
        background: "rgba(0,0,0,0.35)",
      },
      k: { fontSize: 12, fontWeight: 900, opacity: 0.75 },
      v: { fontSize: 12.5, fontWeight: 800, wordBreak: "break-word" },
    };
  }, [vw]);

  const handleEnter = (payload) => {
    const uid = String(payload?.uid || "").trim();
    const email = String(payload?.email || payload?.loginId || "").trim().toLowerCase();
    const createdAtIso = payload?.createdAtIso || null;

    const next = {
      ok: true,
      uid,
      email,
      loginId: email || "—",
      loginType: "email",
      mode: payload?.mode || "login",
      since: createdAtIso || new Date().toISOString(),

      name: String(payload?.name || "").trim(),
      phoneDigits: String(payload?.phoneDigits || "").trim(),
      photoUrl: String(payload?.photoUrl || "").trim(),
    };

    saveSession(next);
    setSession(next);
  };

  const handleSkip = () => {
    const next = {
      ok: true,
      uid: "",
      email: "",
      loginId: "guest",
      loginType: "guest",
      mode: "skip",
      skipped: true,
      since: new Date().toISOString(),

      name: "",
      phoneDigits: "",
      photoUrl: "",
    };

    saveSession(next);
    setSession(next);
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

  function saveProfileOnly() {
    setProfileErr("");
    setProfileMsg("");

    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneBR(phoneDraft);

    if (!isGuest) {
      if (nm.length < 2) {
        setProfileErr("Informe seu nome (obrigatório).");
        return false;
      }
      if (!isPhoneBRValidDigits(ph)) {
        setProfileErr("Informe seu telefone com DDD (10 ou 11 dígitos).");
        return false;
      }
    }

    const next = {
      ...session,
      name: nm,
      phoneDigits: ph,
      photoUrl: String(photoDraft || ""),
    };

    saveSession(next);
    setSession(next);
    setProfileMsg("Perfil atualizado.");
    return true;
  }

  async function saveAndExit() {
    const ok = saveProfileOnly();
    if (!ok) return;

    try {
      await signOut(auth);
    } catch {}

    clearSession();
    setSession(null);
    if (typeof onClose === "function") onClose();
  }

  if (!isLogged) return <LoginVisual onEnter={handleEnter} onSkip={handleSkip} />;

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={ui.title}>Minha Conta</div>
        <div style={ui.subtitle}>Sessão ativa. Você pode sair/fechar quando quiser.</div>
      </div>

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
            <div style={ui.hint}>
              {isGuest ? (
                <>
                  <b>Nome</b>, <b>telefone</b> e <b>foto</b> são <b>opcionais</b> (você entrou sem login).
                </>
              ) : (
                <>
                  <b>Nome</b> e <b>telefone</b> são <b>obrigatórios</b>. Foto é opcional.
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

            <input
              style={ui.input}
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(normalizePhoneBR(e.target.value))}
              placeholder={isGuest ? "Telefone com DDD (opcional)" : "Telefone com DDD (obrigatório)"}
              inputMode="numeric"
              autoComplete="tel"
            />

            <div style={{ display: "grid", gap: 8 }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoPick(e.target.files?.[0] || null)}
                style={{ color: "rgba(255,255,255,0.78)" }}
              />

              <div style={ui.actions}>
                <button type="button" style={ui.primaryBtn} onClick={saveAndExit}>
                  SALVAR / SAIR
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

        <div style={{ display: "grid", gap: 10 }}>
          <div style={ui.row}>
            <div style={ui.k}>Identificação</div>
            <div style={ui.v}>{session?.uid || "—"}</div>
          </div>

          <div style={ui.row}>
            <div style={ui.k}>E-mail</div>
            <div style={ui.v}>{session?.email || "—"}</div>
          </div>

          <div style={ui.row}>
            <div style={ui.k}>Telefone</div>
            <div style={ui.v}>{session?.phoneDigits ? `+55 ${session.phoneDigits}` : "—"}</div>
          </div>

          <div style={ui.row}>
            <div style={ui.k}>Cadastro</div>
            <div style={ui.v}>{formatBRDateTime(session?.since)}</div>
          </div>

          {needsProfile ? (
            <div style={ui.msgErr}>
              Nome e telefone são obrigatórios. Preencha e clique em <b>SALVAR / SAIR</b>.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
