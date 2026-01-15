// src/pages/Account/Account.jsx
import React, { useEffect, useMemo, useState } from "react";
import LoginVisual from "./LoginVisual";

// Firebase
import { auth, db, storage } from "../../services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/**
 * Account (Minha Conta) — REAL (Firebase)
 * - Auth real (uid/email) manda no acesso
 * - Perfil persistente:
 *   Firestore: users/{uid} -> { name, phoneDigits, photoUrl, updatedAt }
 * - Foto SEM limite via Firebase Storage:
 *   Storage: users/{uid}/avatar/{timestamp}_{filename}
 *   Salva URL no Firestore
 *
 * Observação:
 * - Firestore tem limite ~1MB por documento -> NÃO salvar base64 lá.
 * - Guest (sem login) continua local/visual.
 */

const LS_GUEST_KEY = "pp_guest_profile_v1";

/* =========================
   Helpers
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

/* =========================
   Firestore profile
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
   Guest profile (local only)
========================= */

function loadGuestProfile() {
  try {
    const raw = localStorage.getItem(LS_GUEST_KEY);
    if (!raw) return { name: "", phoneDigits: "", photoUrl: "" };
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { name: "", phoneDigits: "", photoUrl: "" };
    return {
      name: String(obj.name || "").trim(),
      phoneDigits: String(obj.phoneDigits || "").trim(),
      photoUrl: String(obj.photoUrl || "").trim(),
    };
  } catch {
    return { name: "", phoneDigits: "", photoUrl: "" };
  }
}

function saveGuestProfile(p) {
  try {
    localStorage.setItem(
      LS_GUEST_KEY,
      JSON.stringify({
        name: String(p?.name || "").trim(),
        phoneDigits: String(p?.phoneDigits || "").trim(),
        photoUrl: String(p?.photoUrl || "").trim(),
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {}
}

/* =========================
   Component
========================= */

export default function Account({ onClose = null }) {
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  // sessão atual (real)
  const [isGuest, setIsGuest] = useState(false);
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [createdAtIso, setCreatedAtIso] = useState("");

  // perfil (draft)
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [photoUrl, setPhotoUrl] = useState(""); // URL final (storage/download) ou local (guest)
  const [photoFile, setPhotoFile] = useState(null); // File selecionado (upload no salvar)
  const [photoPreview, setPhotoPreview] = useState(""); // preview local

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // responsive
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // fonte de verdade: auth
  useEffect(() => {
    let alive = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!alive) return;

      setMsg("");
      setErr("");

      if (!user?.uid) {
        // sem auth => fica em modo guest (LoginVisual pode usar onSkip)
        setUid("");
        setEmail("");
        setCreatedAtIso("");
        setIsGuest(true);

        const g = loadGuestProfile();
        setNameDraft(g.name);
        setPhoneDraft(g.phoneDigits);
        setPhotoUrl(g.photoUrl);
        setPhotoFile(null);
        setPhotoPreview("");
        return;
      }

      // authed
      setIsGuest(false);
      setUid(String(user.uid));
      setEmail(String(user.email || "").trim().toLowerCase());
      const created = user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toISOString() : "";
      setCreatedAtIso(created);

      // carrega perfil do Firestore
      const remote = await loadUserProfile(user.uid);

      const nm = String(remote?.name || "").trim();
      const ph = String(remote?.phoneDigits || "").trim();
      const url = String(remote?.photoUrl || "").trim();

      setNameDraft(nm);
      setPhoneDraft(ph);
      setPhotoUrl(url);
      setPhotoFile(null);
      setPhotoPreview("");
    });

    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  const isLogged = useMemo(() => !isGuest && !!uid, [isGuest, uid]);

  const initials = useMemo(() => computeInitials(nameDraft), [nameDraft]);

  const needsProfile = useMemo(() => {
    if (!isLogged) return false;
    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneBR(phoneDraft);
    return nm.length < 2 || !isPhoneBRValidDigits(ph);
  }, [isLogged, nameDraft, phoneDraft]);

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
        gridTemplateColumns: gridIsMobile ? "1fr" : "140px 1fr",
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
  }, [gridIsMobile]);

  /* =========================
     Handlers
  ========================= */

  const handleEnter = () => {
    // LoginVisual deve fazer signIn/SignUp real.
    // Se o usuário autenticou, onAuthStateChanged acima vai entrar e preencher tudo.
    // Então aqui não precisamos fazer nada.
  };

  const handleSkip = () => {
    setIsGuest(true);
    setUid("");
    setEmail("");
    setCreatedAtIso("");

    const g = loadGuestProfile();
    setNameDraft(g.name);
    setPhoneDraft(g.phoneDigits);
    setPhotoUrl(g.photoUrl);
    setPhotoFile(null);
    setPhotoPreview("");
  };

  async function handlePhotoPick(file) {
    setErr("");
    setMsg("");
    if (!file) return;

    // sem "limite", mas preview local
    try {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
      setPhotoFile(file);
    } catch {
      setErr("Não foi possível carregar o preview da foto.");
    }
  }

  function validateProfile(nm, phDigits) {
    if (isGuest) return true;
    if (String(nm || "").trim().length < 2) {
      setErr("Informe seu nome (obrigatório).");
      return false;
    }
    if (!isPhoneBRValidDigits(phDigits)) {
      setErr("Informe seu telefone com DDD (10 ou 11 dígitos).");
      return false;
    }
    return true;
  }

  async function uploadAvatarIfNeeded(uidLocal) {
    if (!photoFile) return { ok: true, url: String(photoUrl || "") };

    try {
      const safeName = String(photoFile.name || "avatar").replace(/[^\w.\-]+/g, "_");
      const path = `users/${uidLocal}/avatar/${Date.now()}_${safeName}`;
      const sref = storageRef(storage, path);

      await uploadBytes(sref, photoFile);
      const url = await getDownloadURL(sref);

      return { ok: true, url };
    } catch {
      return { ok: false, url: String(photoUrl || "") };
    }
  }

  async function saveProfile() {
    setErr("");
    setMsg("");

    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneBR(phoneDraft);

    if (!validateProfile(nm, ph)) return;

    setBusy(true);

    try {
      if (isGuest) {
        // guest: salva local
        const finalPhoto = photoPreview || photoUrl || "";
        saveGuestProfile({ name: nm, phoneDigits: ph, photoUrl: finalPhoto });

        setPhotoUrl(finalPhoto);
        setPhotoFile(null);
        // não precisa manter preview objectURL
        setMsg("Perfil salvo.");
        return;
      }

      const u = String(uid || auth.currentUser?.uid || "").trim();
      if (!u) {
        setErr("Sessão inválida. Faça login novamente.");
        return;
      }

      // 1) upload da foto (se houver)
      const up = await uploadAvatarIfNeeded(u);
      const finalPhotoUrl = String(up.url || "").trim();

      if (!up.ok) {
        setErr("Falha ao enviar a foto. Tente novamente.");
        return;
      }

      // 2) grava no Firestore
      const ok = await saveUserProfile(u, {
        name: nm,
        phoneDigits: ph,
        photoUrl: finalPhotoUrl,
      });

      if (!ok) {
        setErr("Falha ao salvar no Firestore. Verifique as regras/permissões.");
        return;
      }

      // 3) atualiza estado local
      setPhotoUrl(finalPhotoUrl);
      setPhotoFile(null);
      setMsg("Perfil salvo.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setErr("");
    setMsg("");

    if (busy) return;

    // guest: só limpa local
    if (isGuest) {
      setPhotoUrl("");
      setPhotoFile(null);
      setPhotoPreview("");
      saveGuestProfile({ name: nameDraft, phoneDigits: normalizePhoneBR(phoneDraft), photoUrl: "" });
      setMsg("Foto removida.");
      return;
    }

    const u = String(uid || auth.currentUser?.uid || "").trim();
    if (!u) {
      setErr("Sessão inválida. Faça login novamente.");
      return;
    }

    setBusy(true);
    try {
      // Se a fotoUrl for de storage, não tentamos deletar o arquivo aqui (opcional).
      // (Dá pra deletar depois, mas precisa salvar o path.)
      const ok = await saveUserProfile(u, {
        name: String(nameDraft || "").trim(),
        phoneDigits: normalizePhoneBR(phoneDraft),
        photoUrl: "",
      });

      if (!ok) {
        setErr("Falha ao remover no Firestore.");
        return;
      }

      setPhotoUrl("");
      setPhotoFile(null);
      setPhotoPreview("");
      setMsg("Foto removida.");
    } finally {
      setBusy(false);
    }
  }

  // Render: se não tiver auth e não for guest => mostra login
  // (login real: o LoginVisual deve autenticar e o onAuthStateChanged vai preencher)
  const shouldShowLogin = !isLogged && !isGuest;

  if (shouldShowLogin) {
    return <LoginVisual onEnter={handleEnter} onSkip={handleSkip} />;
  }

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={ui.title}>Minha Conta</div>
        <div style={ui.subtitle}>
          {isGuest ? "Modo convidado (sem login)." : "Sessão ativa. Você pode sair quando quiser."}
        </div>
      </div>

      <div style={ui.card}>
        <div style={ui.cardHeader}>
          <div style={ui.cardTitle}>{needsProfile ? "Completar Perfil" : "Perfil"}</div>
          <div style={ui.badge}>
            {needsProfile ? "Obrigatório" : isGuest ? "Opcional" : "Sessão ativa"}
          </div>
        </div>

        <div style={ui.avatarRow}>
          <div style={ui.avatar} aria-label="Foto do perfil">
            {photoPreview || photoUrl ? (
              <img
                src={String(photoPreview || photoUrl)}
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
              disabled={busy}
            />

            <input
              style={ui.input}
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(normalizePhoneBR(e.target.value))}
              placeholder={isGuest ? "Telefone com DDD (opcional)" : "Telefone com DDD (obrigatório)"}
              inputMode="numeric"
              autoComplete="tel"
              disabled={busy}
            />

            <div style={{ display: "grid", gap: 8 }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoPick(e.target.files?.[0] || null)}
                style={{ color: "rgba(255,255,255,0.78)" }}
                disabled={busy}
              />

              <div style={ui.actions}>
                <button type="button" style={ui.primaryBtn(busy)} onClick={saveProfile} disabled={busy}>
                  {busy ? "SALVANDO..." : "SALVAR"}
                </button>

                <button type="button" style={ui.secondaryBtn(busy)} onClick={removePhoto} disabled={busy}>
                  REMOVER FOTO
                </button>
              </div>

              {err ? <div style={ui.msgErr}>{err}</div> : null}
              {msg ? <div style={ui.msgOk}>{msg}</div> : null}
            </div>
          </div>
        </div>

        <div style={ui.divider} />

        <div style={{ display: "grid", gap: 10 }}>
          <div style={ui.row}>
            <div style={ui.k}>Identificação</div>
            <div style={ui.v}>{isGuest ? "—" : uid || "—"}</div>
          </div>

          <div style={ui.row}>
            <div style={ui.k}>E-mail</div>
            <div style={ui.v}>{isGuest ? "—" : email || "—"}</div>
          </div>

          <div style={ui.row}>
            <div style={ui.k}>Telefone</div>
            <div style={ui.v}>
              {normalizePhoneBR(phoneDraft) ? `+55 ${normalizePhoneBR(phoneDraft)}` : "—"}
            </div>
          </div>

          <div style={ui.row}>
            <div style={ui.k}>Cadastro</div>
            <div style={ui.v}>{isGuest ? "—" : formatBRDateTime(createdAtIso)}</div>
          </div>

          {needsProfile ? (
            <div style={ui.msgErr}>
              Nome e telefone são obrigatórios. Preencha e clique em <b>SALVAR</b>.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
