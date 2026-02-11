// src/pages/Account/Account.jsx
import React, { useEffect, useState } from "react";
import LoginVisual from "./LoginVisual";
import AccountView from "./AccountView";

// Firebase (real)
import { auth, db, storage } from "../../services/firebase";
import { onAuthStateChanged, deleteUser } from "firebase/auth";
import { doc, deleteDoc } from "firebase/firestore";

// Module pieces
import { normalizePhoneDigits, isPhoneBRValidDigits } from "./account.formatters";
import {
  useViewportWidth,
  useAccountUI,
  usePhotoPreview,
  useAccountDerived,
} from "./account.hooks";
import { markSessionAuth, markSessionGuest, safeRemoveSession } from "./account.session";
import {
  isGuestActive,
  setGuestActive,
  loadGuestProfile,
  saveGuestProfile,
  clearGuestProfile,
} from "./account.guestStorage";
import { ensureUserDoc, loadUserProfile, saveUserProfile } from "./account.profile.service";
import {
  blobToDataURL,
  uploadAvatarJpegToStorage,
  resizeImageToJpegBlob,
} from "./account.avatar.service";

/**
 * Account (controller)
 * - Lógica (auth/guest/storage/services) + passa props para AccountView
 */

export default function Account({ onClose = null }) {
  // viewport + ui
  const vw = useViewportWidth();
  const ui = useAccountUI(vw);

  // auth state
  const [authReady, setAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [createdAtIso, setCreatedAtIso] = useState("");

  // trial
  const [trialStartAt, setTrialStartAt] = useState("");
  const [trialEndAt, setTrialEndAt] = useState("");
  const [trialActive, setTrialActive] = useState(false);

  // drafts
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [photoFile, setPhotoFile] = useState(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // preview
  const { photoPreview, setPreviewFromFile, clearPreview } = usePhotoPreview();

  function resetAuthedState() {
    setUid("");
    setEmail("");
    setCreatedAtIso("");
    setTrialStartAt("");
    setTrialEndAt("");
    setTrialActive(false);

    setNameDraft("");
    setPhoneDraft("");
    setPhotoURL("");
    setPhotoFile(null);

    clearPreview();
  }

  // auth listener
  useEffect(() => {
    let alive = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!alive) return;

      setMsg("");
      setErr("");
      setAuthReady(true);

      // sem user: entra guest se guestActive
      if (!user?.uid) {
        const ga = isGuestActive();
        if (ga) {
          setIsGuest(true);
          markSessionGuest();

          const g = loadGuestProfile();
          setNameDraft(g.name);
          setPhoneDraft(normalizePhoneDigits(g.phone));
          setPhotoURL(g.photoURL);
          setPhotoFile(null);
          clearPreview();
        } else {
          setIsGuest(false);
          resetAuthedState();
          safeRemoveSession();
        }
        return;
      }

      // authed
      setGuestActive(false);
      setIsGuest(false);

      markSessionAuth(user);

      setUid(String(user.uid));
      setEmail(String(user.email || "").trim().toLowerCase());

      const created =
        user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toISOString() : "";
      setCreatedAtIso(created);

      await ensureUserDoc(db, user.uid, user);
      const remote = await loadUserProfile(db, user.uid);

      setNameDraft(String(remote?.name || "").trim());
      setPhoneDraft(normalizePhoneDigits(remote?.phone || ""));
      setPhotoURL(String(remote?.photoURL || "").trim());

      setTrialStartAt(String(remote?.trialStartAt || "").trim());
      setTrialEndAt(String(remote?.trialEndAt || "").trim());
      setTrialActive(remote?.trialActive === true);

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

  // derived values
  const derived = useAccountDerived({
    isGuest,
    uid,
    email,
    createdAtIso,
    trialStartAt,
    trialEndAt,
    trialActive,
    nameDraft,
    phoneDraft,
    photoURL,
    photoPreview,
  });

  const {
    isLogged,
    needsProfile,
    initials,
    phoneDigits,
    createdAtLabel,
    trialStartLabel,
    trialEndLabel,
    trialLabel,
    photoSrc,
  } = derived;

  /* =========================
     Handlers (UI)
  ========================= */

  const onNameChange = (v) => {
    setMsg("");
    setErr("");
    setNameDraft(String(v || ""));
  };

  const onPhoneChange = (v) => {
    setMsg("");
    setErr("");
    setPhoneDraft(normalizePhoneDigits(v));
  };

  const onPhotoPick = async (file) => {
    setMsg("");
    setErr("");
    if (!file) return;

    setPhotoFile(file);
    await setPreviewFromFile(file);
  };

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

  async function onSave() {
    setErr("");
    setMsg("");

    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneDigits(phoneDraft);

    if (!validateProfile(nm, ph)) return;

    setBusy(true);
    try {
      // guest: salva local, e foto vira dataURL (compactada)
      if (isGuest) {
        let finalPhoto = String(photoURL || "");

        if (photoFile) {
          const blob = await resizeImageToJpegBlob(photoFile, { maxSide: 768, quality: 0.82 });
          const dataUrl = await blobToDataURL(blob);
          finalPhoto = dataUrl;
        }

        saveGuestProfile({ name: nm, phone: ph, photoURL: finalPhoto });

        setPhotoURL(finalPhoto);
        setPhotoFile(null);
        clearPreview();

        setMsg("Perfil salvo.");
        return;
      }

      // authed
      const u = String(uid || auth.currentUser?.uid || "").trim();
      if (!u) {
        setErr("Sessão inválida. Faça login novamente.");
        return;
      }

      let finalPhotoURL = String(photoURL || "").trim();

      if (photoFile) {
        const up = await uploadAvatarJpegToStorage(storage, u, photoFile);
        if (!up.ok) {
          setErr("Falha ao enviar a foto. Tente novamente.");
          return;
        }
        finalPhotoURL = String(up.url || "").trim();
      }

      const ok = await saveUserProfile(db, u, {
        name: nm,
        phone: ph,
        photoURL: finalPhotoURL,
      });

      if (!ok) {
        setErr("Falha ao salvar no Firestore. Verifique regras/permissões.");
        return;
      }

      setPhotoURL(finalPhotoURL);
      setPhotoFile(null);
      clearPreview();
      setMsg("Perfil salvo.");
    } catch {
      setErr("Falha ao salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhoto() {
    setErr("");
    setMsg("");
    if (busy) return;

    if (isGuest) {
      setPhotoURL("");
      setPhotoFile(null);
      clearPreview();

      saveGuestProfile({
        name: String(nameDraft || "").trim(),
        phone: normalizePhoneDigits(phoneDraft),
        photoURL: "",
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
      const ok = await saveUserProfile(db, u, {
        name: String(nameDraft || "").trim(),
        phone: normalizePhoneDigits(phoneDraft),
        photoURL: "",
      });

      if (!ok) {
        setErr("Falha ao remover no Firestore.");
        return;
      }

      setPhotoURL("");
      setPhotoFile(null);
      clearPreview();
      setMsg("Foto removida.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAccount() {
    setErr("");
    setMsg("");
    if (busy) return;

    if (typeof window === "undefined") {
      setErr("Ação indisponível neste ambiente.");
      return;
    }

    const ok1 = window.confirm("ATENÇÃO: Isso vai excluir sua conta e seus dados. Deseja continuar?");
    if (!ok1) return;
    const ok2 = window.confirm("Última confirmação: EXCLUIR CONTA definitivamente?");
    if (!ok2) return;

    setBusy(true);
    try {
      if (isGuest) {
        clearGuestProfile();
        setGuestActive(false);
        safeRemoveSession();

        setNameDraft("");
        setPhoneDraft("");
        setPhotoURL("");
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

      try {
        await deleteDoc(doc(db, "users", u));
      } catch {}

      try {
        await deleteUser(user);
      } catch {
        setErr(
          "Falha ao excluir a conta (o Firebase pode exigir login recente). Saia e entre novamente e tente de novo."
        );
        return;
      }

      safeRemoveSession();
      setMsg("Conta excluída.");
      setIsGuest(false);
      setGuestActive(false);
      resetAuthedState();

      if (typeof onClose === "function") onClose();
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     Login / Guest
  ========================= */

  const onEnter = () => {
    // LoginVisual faz sign-in; o listener onAuthStateChanged marcará sessão auth.
    setGuestActive(false);
    setIsGuest(false);
  };

  const onSkip = () => {
    setMsg("");
    setErr("");

    setGuestActive(true);
    setIsGuest(true);

    markSessionGuest();

    resetAuthedState();

    const g = loadGuestProfile();
    setNameDraft(g.name);
    setPhoneDraft(normalizePhoneDigits(g.phone));
    setPhotoURL(g.photoURL);
    setPhotoFile(null);
    clearPreview();
  };

  /* =========================
     Render
  ========================= */

  if (!authReady) {
    return <div style={{ padding: 18, color: "rgba(255,255,255,0.78)" }}>Carregando...</div>;
  }

  if (!isLogged && !isGuest) {
    return <LoginVisual onEnter={onEnter} onSkip={onSkip} />;
  }

  return (
    <AccountView
      ui={ui}
      isGuest={isGuest}
      isLogged={isLogged}
      needsProfile={needsProfile}
      initials={initials}
      photoSrc={photoSrc}
      name={nameDraft}
      phoneDigits={phoneDigits}
      email={email}
      uid={uid}
      createdAtLabel={createdAtLabel}
      trialStartLabel={trialStartLabel}
      trialEndLabel={trialEndLabel}
      trialLabel={trialLabel}
      busy={busy}
      err={err}
      msg={msg}
      onNameChange={onNameChange}
      onPhoneChange={onPhoneChange}
      onPhotoPick={onPhotoPick}
      onSave={onSave}
      onRemovePhoto={onRemovePhoto}
      onDeleteAccount={onDeleteAccount}
    />
  );
}



