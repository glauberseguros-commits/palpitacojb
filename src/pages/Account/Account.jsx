// src/pages/Account/Account.jsx
import React, { useEffect, useMemo, useState } from "react";
import LoginVisual from "./LoginVisual";

// Firebase
import { auth, db } from "../../services/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

const LS_SESSION_KEY = "pp_session_v1";
const LS_PROFILE_CACHE_KEY = "pp_profile_cache_v1";

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
    const raw = localStorage.getItem(LS_SESSION_KEY);
    if (!raw) return null;
    return safeParseJSON(raw);
  } catch {
    return null;
  }
}
function saveSession(session) {
  try {
    localStorage.setItem(LS_SESSION_KEY, JSON.stringify(session));
  } catch {}
}
function clearSession() {
  try {
    localStorage.removeItem(LS_SESSION_KEY);
  } catch {}
}

function loadProfileCache() {
  try {
    const raw = localStorage.getItem(LS_PROFILE_CACHE_KEY);
    const obj = safeParseJSON(raw || "");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function saveProfileCache(cacheObj) {
  try {
    localStorage.setItem(LS_PROFILE_CACHE_KEY, JSON.stringify(cacheObj || {}));
  } catch {}
}

/* =========================
   Helpers / validators
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
   Firestore profile
   users/{uid} -> { name, phoneDigits, photoUrl, updatedAt }
========================= */
async function loadUserProfile(uid) {
  const u = String(uid || "").trim();
  if (!u) return null;
  try {
    const ref = doc(db, "users", u);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return {
      name: String(data.name || "").trim(),
      phoneDigits: String(data.phoneDigits || "").trim(),
      photoUrl: String(data.photoUrl || "").trim(),
    };
  } catch {
    return null;
  }
}

async function saveUserProfile(uid, payload) {
  const u = String(uid || "").trim();
  if (!u) return false;
  try {
    const ref = doc(db, "users", u);
    await setDoc(
      ref,
      {
        name: String(payload?.name || "").trim(),
        phoneDigits: String(payload?.phoneDigits || "").trim(),
        photoUrl: String(payload?.photoUrl || "").trim(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
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

  const [busyProfile, setBusyProfile] = useState(false);
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

  const initials = useMemo(() => computeInitials(nameDraft || session?.name), [nameDraft, session?.name]);

  const needsProfile = useMemo(() => {
    if (!isLogged) return false;
    if (isGuest) return false;
    const nm = String(session?.name || "").trim();
    const ph = String(session?.phoneDigits || "").trim();
    return nm.length < 2 || !isPhoneBRValidDigits(ph);
  }, [isLogged, isGuest, session?.name, session?.phoneDigits]);

  // sempre que sessão muda, hidrata drafts
  useEffect(() => {
    if (!session?.ok) return;

    setNameDraft(String(session?.name || "").trim());
    setPhoneDraft(String(session?.phoneDigits || "").trim());
    setPhotoDraft(String(session?.photoUrl || ""));
    setProfileMsg("");
    setProfileErr("");
  }, [session]);

  // ✅ quando logar (uid válido), tenta carregar perfil do Firestore.
  // fallback: cache local
  useEffect(() => {
    if (!session?.ok) return;
    if (isGuest) return;

    const uid = String(session?.uid || "").trim();
    if (!uid) return;

    let alive = true;

    (async () => {
      // 1) tenta Firestore
      const remote = await loadUserProfile(uid);

      // 2) fallback cache local
      const cache = loadProfileCache();
      const cached = cache?.[uid] || null;

      const picked = remote || cached;
      if (!alive || !picked) return;

      const next = {
        ...session,
        name: String(picked.name || "").trim(),
        phoneDigits: String(picked.phoneDigits || "").trim(),
        photoUrl: String(picked.photoUrl || "").trim(),
      };

      saveSession(next);
      setSession(next);

      // sincroniza drafts
      setNameDraft(next.name);
      setPhoneDraft(next.phoneDigits);
      setPhotoDraft(next.photoUrl);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.ok, session?.uid, isGuest]);

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
      primaryBtn: (disabled) => ({
        height: 40,
        borderRadius: 14,
        border: "1px solid rgba(201,168,62,0.55)",
        background: "rgba(201,168,62,0.14)",
        color: GOLD,
        fontWeight: 950,
        letterSpacing: 0.15,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0 14px",
        opacity: disabled ? 0.6 : 1,
      }),
      secondaryBtn: (disabled) => ({
        height: 40,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 900,
        letterSpacing: 0.15,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0 14px",
        opacity: disabled ? 0.6 : 1,
      }),

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

  // ✅ Este handleEnter depende do SEU LoginVisual real.
  // Ele precisa passar: { uid, email, createdAtIso } ao autenticar via Firebase.
  const handleEnter = (payload) => {
    const uid = String(payload?.uid || "").trim();
    const email = String(payload?.email || payload?.loginId || "").trim().toLowerCase();

    // tenta pegar cache local assim que entra (melhora UX)
    const cache = loadProfileCache();
    const cached = uid ? cache?.[uid] : null;

    const next = {
      ok: true,
      uid,
      email,
      loginId: email || "—",
      loginType: "email",
      mode: payload?.mode || "login",
      since: payload?.createdAtIso || new Date().toISOString(),

      name: String(payload?.name || cached?.name || "").trim(),
      phoneDigits: String(payload?.phoneDigits || cached?.phoneDigits || "").trim(),
      photoUrl: String(payload?.photoUrl || cached?.photoUrl || "").trim(),

      // plano fica para o admin/Firestore depois
      plan: String(payload?.plan || "FREE"),
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
      plan: "FREE",
    };

    saveSession(next);
    setSession(next);
  };

  async function handlePhotoPick(file) {
    setProfileErr("");
    setProfileMsg("");
    if (!file) return;

    // 🔒 Firestore tem limite de 1MB por doc.
    // Foto em dataURL explode fácil, então limitamos forte:
    const maxMB = 0.18; // ~180KB
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxMB) {
      setProfileErr(
        `Foto grande demais (${sizeMB.toFixed(2)} MB). Use até ${maxMB} MB (por enquanto).`
      );
      return;
    }

    try {
      const dataUrl = await fileToDataURL(file);
      setPhotoDraft(dataUrl);
    } catch {
      setProfileErr("Não foi possível carregar a foto.");
    }
  }

  function validateProfile(nm, phDigits) {
    if (isGuest) return true;
    if (String(nm || "").trim().length < 2) {
      setProfileErr("Informe seu nome (obrigatório).");
      return false;
    }
    if (!isPhoneBRValidDigits(phDigits)) {
      setProfileErr("Informe seu telefone com DDD (10 ou 11 dígitos).");
      return false;
    }
    return true;
  }

  async function saveProfileOnly() {
    setProfileErr("");
    setProfileMsg("");

    const uid = String(session?.uid || "").trim();
    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneBR(phoneDraft);
    const photoUrl = String(photoDraft || "");

    if (!validateProfile(nm, ph)) return false;

    // 1) atualiza sessão local
    const next = { ...session, name: nm, phoneDigits: ph, photoUrl };
    saveSession(next);
    setSession(next);

    // 2) cache local por UID (sobrevive ao logout)
    if (uid) {
      const cache = loadProfileCache();
      cache[uid] = { name: nm, phoneDigits: ph, photoUrl };
      saveProfileCache(cache);
    }

    // 3) grava Firestore (persistente)
    if (!isGuest && uid) {
      setBusyProfile(true);
      const ok = await saveUserProfile(uid, { name: nm, phoneDigits: ph, photoUrl });
      setBusyProfile(false);

      if (!ok) {
        setProfileMsg("Perfil salvo localmente. (Falha ao gravar no Firestore.)");
        return true;
      }
    }

    setProfileMsg("Perfil salvo.");
    return true;
  }

  async function saveAndExit() {
    const ok = await saveProfileOnly();
    if (!ok) return;

    // ✅ sai do Firebase, mas NÃO destrói o cache do perfil
    try {
      await signOut(auth);
    } catch {}

    // limpa sessão visual para voltar ao login
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
                  <b>Nome</b>, <b>telefone</b> e <b>foto</b> são <b>opcionais</b> (sem login).
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
              disabled={busyProfile}
            />

            <input
              style={ui.input}
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(normalizePhoneBR(e.target.value))}
              placeholder={isGuest ? "Telefone com DDD (opcional)" : "Telefone com DDD (obrigatório)"}
              inputMode="numeric"
              autoComplete="tel"
              disabled={busyProfile}
            />

            <div style={{ display: "grid", gap: 8 }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoPick(e.target.files?.[0] || null)}
                style={{ color: "rgba(255,255,255,0.78)" }}
                disabled={busyProfile}
              />

              <div style={ui.actions}>
                <button
                  type="button"
                  style={ui.primaryBtn(busyProfile)}
                  onClick={saveAndExit}
                  disabled={busyProfile}
                >
                  {busyProfile ? "SALVANDO..." : "SALVAR / SAIR"}
                </button>

                <button
                  type="button"
                  style={ui.secondaryBtn(busyProfile)}
                  onClick={() => {
                    setPhotoDraft("");
                    const next = { ...session, photoUrl: "" };
                    saveSession(next);
                    setSession(next);

                    const uid = String(session?.uid || "").trim();
                    if (uid) {
                      const cache = loadProfileCache();
                      cache[uid] = {
                        ...(cache[uid] || {}),
                        photoUrl: "",
                        name: String(next.name || "").trim(),
                        phoneDigits: String(next.phoneDigits || "").trim(),
                      };
                      saveProfileCache(cache);
                    }

                    setProfileMsg("Foto removida.");
                    setProfileErr("");
                  }}
                  disabled={busyProfile}
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
