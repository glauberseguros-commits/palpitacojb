// src/pages/Account/Account.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import LoginVisual from "./LoginVisual";

// Firebase
import { auth, db, storage } from "../../services/firebase";
import { onAuthStateChanged, deleteUser } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * Account (Minha Conta) — REAL (Firebase) + Premium UX
 *
 * ✅ Regras de acesso:
 * - Auth real (uid/email) manda no acesso.
 * - Guest só acontece quando o usuário clica "Entrar sem login".
 *
 * ✅ Perfil persistente:
 * - Firestore: users/{uid} -> { name, phoneDigits, photoUrl, updatedAt }
 *
 * ✅ Foto SEM limite (usuário pode escolher qualquer resolução):
 * - App converte/otimiza (client-side) e envia ao Storage
 * - Storage: users/{uid}/avatar/{timestamp}.jpg
 * - Firestore salva só a URL
 *
 * ✅ Guest:
 * - Foto é convertida/otimizada e salva como dataURL no localStorage (persistente)
 *
 * ✅ Telefone com máscara:
 * - (xx) x xxxx-xxxx (11 dígitos) ou (xx) xxxx-xxxx (10 dígitos)
 *
 * ✅ Botões:
 * - SALVAR / REMOVER FOTO / EXCLUIR CONTA
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

function digitsOnly(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function normalizePhoneDigits(v) {
  return digitsOnly(v).slice(0, 11);
}

function isPhoneBRValidDigits(d) {
  const s = String(d || "");
  return s.length === 10 || s.length === 11;
}

// (xx) x xxxx-xxxx (11) OR (xx) xxxx-xxxx (10)
function formatPhoneBR(digits) {
  const d = normalizePhoneDigits(digits);
  if (!d) return "";

  if (d.length <= 2) return `(${d}`;
  const dd = d.slice(0, 2);

  // 10 dígitos: (DD) XXXX-XXXX
  if (d.length <= 10) {
    const a = d.slice(2, 6);
    const b = d.slice(6, 10);
    if (d.length <= 6) return `(${dd}) ${a}`;
    return `(${dd}) ${a}${b ? `-${b}` : ""}`;
  }

  // 11 dígitos: (DD) 9 XXXX-XXXX
  const ninth = d.slice(2, 3);
  const a = d.slice(3, 7);
  const b = d.slice(7, 11);
  if (d.length <= 3) return `(${dd}) ${ninth}`;
  if (d.length <= 7) return `(${dd}) ${ninth} ${a}`;
  return `(${dd}) ${ninth} ${a}${b ? `-${b}` : ""}`;
}

function computeInitials(name) {
  const nm = String(name || "").trim();
  if (!nm) return "PP";
  const parts = nm.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "P";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onerror = () => reject(new Error("Falha ao ler imagem."));
      r.onload = () => resolve(String(r.result || ""));
      r.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Resize/compress image client-side (mobile-friendly)
 * - maxSide: 768 (bom p/ avatar)
 * - quality: 0.82 (jpeg)
 */
async function resizeImageToJpegBlob(file, { maxSide = 768, quality = 0.82 } = {}) {
  const inputFile = file;
  if (!inputFile) throw new Error("Arquivo inválido.");

  // tenta createImageBitmap (rápido), fallback para <img>
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(inputFile);
  } catch {
    bitmap = null;
  }

  let w = 0;
  let h = 0;

  if (bitmap) {
    w = bitmap.width;
    h = bitmap.height;
  } else {
    // fallback
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("Falha ao ler imagem."));
      r.onload = () => resolve(String(r.result || ""));
      r.readAsDataURL(inputFile);
    });

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Falha ao carregar imagem."));
      i.src = dataUrl;
    });

    w = img.naturalWidth || img.width;
    h = img.naturalHeight || img.height;

    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(img, 0, 0);
    bitmap = await createImageBitmap(tmp);
  }

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, outW, outH);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      "image/jpeg",
      Math.min(0.95, Math.max(0.5, quality))
    );
  });

  if (!blob) throw new Error("Falha ao converter imagem.");
  return blob;
}

/* =========================
   Firestore profile
========================= */

async function loadUserProfile(uid) {
  const u = String(uid || "").trim();
  if (!u) return null;
  try {
    const r = doc(db, "users", u);
    const snap = await getDoc(r);
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
    const r = doc(db, "users", u);
    await setDoc(
      r,
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

function clearGuestProfile() {
  try {
    localStorage.removeItem(LS_GUEST_KEY);
  } catch {}
}

/* =========================
   Component
========================= */

export default function Account({ onClose = null }) {
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  // auth state (real)
  const [authReady, setAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false); // só TRUE quando usuário clicou "Entrar sem login"
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [createdAtIso, setCreatedAtIso] = useState("");

  // profile drafts
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDigitsDraft, setPhoneDigitsDraft] = useState(""); // sempre digits (10/11)
  const [photoUrl, setPhotoUrl] = useState(""); // URL (authed) ou dataURL (guest)
  const [photoFile, setPhotoFile] = useState(null); // file escolhido (upload no salvar)

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // preview objectURL (não vazar memória)
  const previewUrlRef = useRef("");
  const [photoPreview, setPhotoPreview] = useState("");

  // responsive
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function clearPreview() {
    try {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    } catch {}
    previewUrlRef.current = "";
    setPhotoPreview("");
  }

  // auth listener
  useEffect(() => {
    let alive = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!alive) return;

      setMsg("");
      setErr("");
      setAuthReady(true);

      // Se NÃO tem user, NÃO vira guest automaticamente.
      // Guest só acontece via handleSkip().
      if (!user?.uid) {
        setUid("");
        setEmail("");
        setCreatedAtIso("");
        return;
      }

      // authed
      setIsGuest(false);
      setUid(String(user.uid));
      setEmail(String(user.email || "").trim().toLowerCase());

      const created =
        user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toISOString() : "";
      setCreatedAtIso(created);

      const remote = await loadUserProfile(user.uid);

      const nm = String(remote?.name || "").trim();
      const ph = String(remote?.phoneDigits || "").trim();
      const url = String(remote?.photoUrl || "").trim();

      setNameDraft(nm);
      setPhoneDigitsDraft(normalizePhoneDigits(ph));
      setPhotoUrl(url);

      setPhotoFile(null);
      clearPreview();
    });

    return () => {
      alive = false;
      unsub?.();
      clearPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLogged = useMemo(() => !!uid && !isGuest, [uid, isGuest]);

  const initials = useMemo(() => computeInitials(nameDraft), [nameDraft]);

  const needsProfile = useMemo(() => {
    if (!isLogged) return false;
    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneDigits(phoneDigitsDraft);
    return nm.length < 2 || !isPhoneBRValidDigits(ph);
  }, [isLogged, nameDraft, phoneDigitsDraft]);

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
        gridTemplateColumns: gridIsMobile ? "1fr" : "92px 1fr",
        gap: 12,
        alignItems: "center",
      },
      avatar: {
        width: 92,
        height: 92,
        borderRadius: 18,
        border: "1px solid rgba(201,168,62,0.35)",
        background:
          "radial-gradient(70px 70px at 30% 20%, rgba(201,168,62,0.25), rgba(0,0,0,0)), linear-gradient(180deg, rgba(201,168,62,0.10), rgba(0,0,0,0.38))",
        boxShadow: "0 16px 40px rgba(0,0,0,0.60)",
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
        fontSize: 22,
        letterSpacing: 0.4,
      },

      hint: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.35 },

      input: {
        height: 44,
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
      dangerBtn: (disabled) => ({
        height: 40,
        borderRadius: 14,
        border: "1px solid rgba(255,120,120,0.42)",
        background: "rgba(255,120,120,0.10)",
        color: "rgba(255,170,170,0.95)",
        fontWeight: 950,
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
     Guest / Login
  ========================= */

  const handleEnter = () => {
    // LoginVisual faz o signIn/signup real.
    // onAuthStateChanged acima preenche.
  };

  const handleSkip = () => {
    setMsg("");
    setErr("");
    setIsGuest(true);
    setUid("");
    setEmail("");
    setCreatedAtIso("");

    const g = loadGuestProfile();
    setNameDraft(g.name);
    setPhoneDigitsDraft(normalizePhoneDigits(g.phoneDigits));
    setPhotoUrl(g.photoUrl);
    setPhotoFile(null);

    clearPreview();
  };

  /* =========================
     Photo pick / upload
  ========================= */

  async function handlePhotoPick(file) {
    setErr("");
    setMsg("");
    if (!file) return;

    // preview local (sem limite)
    try {
      clearPreview();
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
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
      const blob = await resizeImageToJpegBlob(photoFile, { maxSide: 768, quality: 0.82 });

      const path = `users/${uidLocal}/avatar/${Date.now()}.jpg`;
      const sref = storageRef(storage, path);

      await uploadBytes(sref, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(sref);

      return { ok: true, url };
    } catch {
      return { ok: false, url: String(photoUrl || "") };
    }
  }

  /* =========================
     Actions
  ========================= */

  async function saveProfile() {
    setErr("");
    setMsg("");

    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneDigits(phoneDigitsDraft);

    if (!validateProfile(nm, ph)) return;

    setBusy(true);

    try {
      if (isGuest) {
        // ✅ guest: se escolheu nova foto, converte/otimiza e salva dataURL (persistente)
        let finalPhoto = String(photoUrl || "");

        if (photoFile) {
          const blob = await resizeImageToJpegBlob(photoFile, { maxSide: 768, quality: 0.82 });
          const dataUrl = await blobToDataURL(blob);
          finalPhoto = dataUrl;
        }

        saveGuestProfile({ name: nm, phoneDigits: ph, photoUrl: finalPhoto });

        setPhotoUrl(finalPhoto);
        setPhotoFile(null);
        clearPreview();

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
        setErr("Falha ao salvar no Firestore. Verifique regras/permissões.");
        return;
      }

      setPhotoUrl(finalPhotoUrl);
      setPhotoFile(null);
      clearPreview();
      setMsg("Perfil salvo.");
    } catch {
      setErr("Falha ao salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setErr("");
    setMsg("");
    if (busy) return;

    if (isGuest) {
      setPhotoUrl("");
      setPhotoFile(null);
      clearPreview();

      saveGuestProfile({
        name: String(nameDraft || "").trim(),
        phoneDigits: normalizePhoneDigits(phoneDigitsDraft),
        photoUrl: "",
      });

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
      const ok = await saveUserProfile(u, {
        name: String(nameDraft || "").trim(),
        phoneDigits: normalizePhoneDigits(phoneDigitsDraft),
        photoUrl: "",
      });

      if (!ok) {
        setErr("Falha ao remover no Firestore.");
        return;
      }

      setPhotoUrl("");
      setPhotoFile(null);
      clearPreview();
      setMsg("Foto removida.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccountForever() {
    setErr("");
    setMsg("");
    if (busy) return;

    const ok1 = window.confirm("ATENÇÃO: Isso vai excluir sua conta e seus dados. Deseja continuar?");
    if (!ok1) return;
    const ok2 = window.confirm("Última confirmação: EXCLUIR CONTA definitivamente?");
    if (!ok2) return;

    setBusy(true);
    try {
      if (isGuest) {
        clearGuestProfile();

        setNameDraft("");
        setPhoneDigitsDraft("");
        setPhotoUrl("");
        setPhotoFile(null);
        clearPreview();

        setMsg("Dados locais removidos.");
        setIsGuest(false);
        return;
      }

      const user = auth.currentUser;
      const u = String(user?.uid || uid || "").trim();
      if (!u || !user) {
        setErr("Sessão inválida. Faça login novamente.");
        return;
      }

      // 1) apaga doc do Firestore
      try {
        await deleteDoc(doc(db, "users", u));
      } catch {}

      // 2) apaga a conta do Auth
      try {
        await deleteUser(user);
      } catch {
        setErr(
          "Falha ao excluir a conta (o Firebase pode exigir login recente). Saia e entre novamente e tente de novo."
        );
        return;
      }

      setMsg("Conta excluída.");
      setUid("");
      setEmail("");
      setCreatedAtIso("");
      setIsGuest(false);

      setNameDraft("");
      setPhoneDigitsDraft("");
      setPhotoUrl("");
      setPhotoFile(null);
      clearPreview();

      if (typeof onClose === "function") onClose();
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     Render
  ========================= */

  if (!authReady) {
    return (
      <div style={{ padding: 18, color: "rgba(255,255,255,0.78)" }}>
        Carregando...
      </div>
    );
  }

  if (!isLogged && !isGuest) {
    return <LoginVisual onEnter={handleEnter} onSkip={handleSkip} />;
  }

  const phoneDisplay = formatPhoneBR(phoneDigitsDraft);
  const phoneLabel = phoneDisplay || "—";

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
          <div style={ui.badge}>{needsProfile ? "Obrigatório" : isGuest ? "Opcional" : "Sessão ativa"}</div>
        </div>

        <div style={ui.avatarRow}>
          <div style={ui.avatar} aria-label="Foto do perfil">
            {photoPreview || photoUrl ? (
              <img src={String(photoPreview || photoUrl)} alt="Foto do perfil" style={ui.avatarImg} />
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
              value={phoneDisplay}
              onChange={(e) => setPhoneDigitsDraft(normalizePhoneDigits(e.target.value))}
              placeholder={isGuest ? "(xx) x xxxx-xxxx (opcional)" : "(xx) x xxxx-xxxx"}
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

                <button type="button" style={ui.dangerBtn(busy)} onClick={deleteAccountForever} disabled={busy}>
                  EXCLUIR CONTA
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
            <div style={ui.v}>{phoneLabel}</div>
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
