// src/pages/Account/Account.jsx
import React, { useEffect, useRef, useState } from "react";
import LoginVisual from "./LoginVisual";
import AccountView from "./AccountView";

// Firebase (real)
import { auth, db, storage } from "../../services/firebase";
import {
  onAuthStateChanged,
  deleteUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  deleteDoc,
} from "firebase/firestore";

// Module pieces
import { normalizePhoneDigits, isPhoneBRValidDigits } from "./account.formatters";
import {
  useViewportWidth,
  useAccountUI,
  usePhotoPreview,
  useAccountDerived,
} from "./account.hooks";
import { markSessionAuth, safeRemoveSession } from "./account.session";
import {
  setGuestActive,
  saveGuestProfile,
  clearGuestProfile,
} from "./account.guestStorage";
import {
  ensureUserDoc,
  loadUserProfile,
  saveUserProfile,
} from "./account.profile.service";
import {
  blobToDataURL,
  uploadAvatarJpegToStorage,
  resizeImageToJpegBlob,
} from "./account.avatar.service";

/**
 * Account (controller)
 * - Estados válidos:
 *   1) Firebase real autenticado
 *   2) Guest local
 * - Login autenticado por e-mail e senha.
 *
 * Plano real:
 *   - FREE
 *   - PREMIUM
 *   - VIP
 *
 * Compat temporária:
 *   - trialStartAt / trialEndAt / trialActive continuam existindo
 *     apenas para não quebrar hooks/view antigos.
 */

const PLAN_FREE = "FREE";
const PLAN_STANDARD = "STANDARD";
const PLAN_PLUS = "PLUS";
const PLAN_PREMIUM = "PREMIUM";
const PLAN_VIP = "VIP";

function normalizePlan(planRaw) {
  const p = String(planRaw || "").trim().toUpperCase();
  if (p === PLAN_VIP) return PLAN_VIP;
  if (p === PLAN_STANDARD) return PLAN_STANDARD;
  if (p === PLAN_PLUS) return PLAN_PLUS;
  if (p === PLAN_PREMIUM) return PLAN_PREMIUM;
  return PLAN_FREE;
}


export default function Account({ onClose = null, onAuthenticated = null }) {
  // viewport + ui
  const vw = useViewportWidth();
  const ui = useAccountUI(vw);

  // trava de fluxo: impede guest durante login real
  const loginInFlightRef = useRef(false);
  const authNotifiedRef = useRef(false);

  // auth state
  const [authReady, setAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [createdAtIso, setCreatedAtIso] = useState("");

  // plan (novo) - somente setters são usados neste controller
  const [, setPlan] = useState(PLAN_FREE);
  const [, setPlanStartAt] = useState("");
  const [, setPlanEndAt] = useState("");
  const [, setIsLifetime] = useState(false);
  const [, setIsActivePlan] = useState(false);

  // compat legado para hooks/view
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

    setPlan(PLAN_FREE);
    setPlanStartAt("");
    setPlanEndAt("");
    setIsLifetime(false);
    setIsActivePlan(false);

    // compat
    setTrialStartAt("");
    setTrialEndAt("");
    setTrialActive(false);

    setNameDraft("");
    setPhoneDraft("");
    setPhotoURL("");
    setPhotoFile(null);

    clearPreview();
  }

  function resetGuestState() {
    setIsGuest(false);
    setNameDraft("");
    setPhoneDraft("");
    setPhotoURL("");
    setPhotoFile(null);
    clearPreview();
  }

  function isEmailLogin(v) {
    const s = String(v || "").trim();
    return s.includes("@");
  }

  function normalizeLoginToEmail(loginRaw) {
    return String(loginRaw || "").trim().toLowerCase();
  }


  function buildFirebaseLoginError(error) {
    const code = String(error?.code || "").trim();

    switch (code) {
      case "auth/invalid-email":
        return { type: "invalid_email", msg: "E-mail inválido." };

      case "auth/user-not-found":
        return { type: "user_not_found", msg: "Usuário não encontrado." };

      case "auth/wrong-password":
        return { type: "wrong_password", msg: "Login ou senha inválidos." };

      case "auth/invalid-credential":
        // no Firebase isso pode significar:
        // - senha errada
        // - usuário inexistente (com proteção de enumeração)
        return { type: "invalid_credential", msg: "Login ou senha inválidos." };

      case "auth/email-already-in-use":
        return { type: "email_in_use", msg: "Este e-mail já possui cadastro." };

      case "auth/weak-password":
        return { type: "weak_password", msg: "A senha precisa ter pelo menos 6 caracteres." };

      case "auth/too-many-requests":
        return { type: "too_many_requests", msg: "Muitas tentativas. Aguarde e tente novamente." };

      case "auth/network-request-failed":
        return { type: "network", msg: "Falha de rede. Verifique sua conexão." };

      default:
        return {
          type: "unknown",
          msg: String(error?.message || "").trim() || "Falha ao autenticar no Firebase.",
        };
    }
  }

  // auth listener
  useEffect(() => {
    let alive = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!alive) return;

      setMsg("");
      setErr("");

      // durante login real em andamento, não hidrate guest
      if (!user?.uid && loginInFlightRef.current) {
        setAuthReady(false);
        return;
      }

      setAuthReady(true);

      // Sem Firebase user, nao existe acesso alternativo.
      if (!user?.uid) {
        resetAuthedState();
        resetGuestState();
        safeRemoveSession();

        authNotifiedRef.current = false;
        return;
      }

      // auth real consolidado
      loginInFlightRef.current = false;

      setGuestActive(false);
      setIsGuest(false);

      setUid(String(user.uid));
      setEmail(String(user.email || "").trim().toLowerCase());

      const created =
        user?.metadata?.creationTime
          ? new Date(user.metadata.creationTime).toISOString()
          : "";
      setCreatedAtIso(created);

      await ensureUserDoc(db, user.uid, user);
      const remote = await loadUserProfile(db, user.uid);

      const remotePlan = normalizePlan(remote?.plan);
      const remotePlanStartAt = String(remote?.planStartAt || "").trim();
      const remotePlanEndAt = String(remote?.planEndAt || "").trim();
      const remoteIsLifetime = remote?.isLifetime === true;
      const remoteIsActivePlan =
        remote?.isActivePlan === true ||
        (remotePlan !== PLAN_FREE && remoteIsLifetime === true);

      const remoteTrialStartAt = String(remote?.trialStartAt || "").trim();
      const remoteTrialEndAt = String(remote?.trialEndAt || "").trim();
      const remoteTrialActive = remote?.trialActive === true;

      setPlan(remotePlan);
      setPlanStartAt(remotePlanStartAt);
      setPlanEndAt(remotePlanEndAt);
      setIsLifetime(remoteIsLifetime);
      setIsActivePlan(remoteIsActivePlan);

      setTrialStartAt(remoteTrialStartAt);
      setTrialEndAt(remoteTrialEndAt);
      setTrialActive(remoteTrialActive);

      setNameDraft(String(remote?.name || "").trim());
      setPhoneDraft(normalizePhoneDigits(remote?.phone || ""));
      setPhotoURL(String(remote?.photoURL || "").trim());

      setPhotoFile(null);
      clearPreview();

      // grava sessão somente depois de conhecer o plano real
      markSessionAuth({
        uid: user.uid,
        email: String(user.email || "").trim().toLowerCase(),

        plan: remotePlan,
        planStartAt: remotePlanStartAt,
        planEndAt: remotePlanEndAt,
        isLifetime: remoteIsLifetime,
        isActivePlan: remoteIsActivePlan,

        trialStartAt: remoteTrialStartAt,
        trialEndAt: remoteTrialEndAt,
        trialActive: remoteTrialActive,

        metadata: user?.metadata || {},
      });

      if (typeof onAuthenticated === "function" && !authNotifiedRef.current) {
        authNotifiedRef.current = true;
        onAuthenticated();
      }
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
          const blob = await resizeImageToJpegBlob(photoFile, {
            maxSide: 768,
            quality: 0.82,
          });
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

      // authed real
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

    const ok1 = window.confirm(
      "ATENÇÃO: Isso vai excluir sua conta e seus dados. Deseja continuar?"
    );
    if (!ok1) return;
    const ok2 = window.confirm(
      "Última confirmação: EXCLUIR CONTA definitivamente?"
    );
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
        authNotifiedRef.current = false;
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
      authNotifiedRef.current = false;

      if (typeof onClose === "function") onClose();
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     Login / Guest
  ========================= */

  const onRegister = async ({
    name,
    phone,
    email,
    password,
    confirmPassword,
  }) => {
    setMsg("");
    setErr("");

    const safeName =
      String(name || "").trim();

    const safePhone =
      normalizePhoneDigits(
        phone
      );

    const emailCandidate =
      normalizeLoginToEmail(
        email
      );

    if (safeName.length < 2) {
      throw new Error(
        "Informe seu nome."
      );
    }

    if (
      !isPhoneBRValidDigits(
        safePhone
      )
    ) {
      throw new Error(
        "Informe um telefone válido."
      );
    }

    if (
      !isEmailLogin(
        emailCandidate
      )
    ) {
      throw new Error(
        "Informe um e-mail válido."
      );
    }

    if (
      String(
        password || ""
      ).length < 6
    ) {
      throw new Error(
        "A senha precisa ter pelo menos 6 caracteres."
      );
    }

    if (
      String(password || "") !==
      String(confirmPassword || "")
    ) {
      throw new Error(
        "As senhas não coincidem."
      );
    }

    loginInFlightRef.current =
      true;

    authNotifiedRef.current =
      false;

    setGuestActive(false);
    setIsGuest(false);

    try {
      clearGuestProfile();
    } catch {}

    safeRemoveSession();

    try {
      const credential =
        await createUserWithEmailAndPassword(
          auth,
          emailCandidate,
          password
        );

      const user =
        credential?.user;

      if (!user?.uid) {
        throw new Error(
          "Conta criada sem identificação válida."
        );
      }

      const ensured =
        await ensureUserDoc(
          db,
          user.uid,
          user
        );

      if (
        ensured?.ok !== true
      ) {
        throw new Error(
          "Não foi possível criar o perfil."
        );
      }

      const saved =
        await saveUserProfile(
          db,
          user.uid,
          {
            name:
              safeName,

            phone:
              safePhone,

            photoURL:
              "",
          }
        );

      if (!saved) {
        throw new Error(
          "Conta criada, mas não foi possível salvar nome e telefone."
        );
      }

      setNameDraft(
        safeName
      );

      setPhoneDraft(
        safePhone
      );

      setEmail(
        emailCandidate
      );

      return true;
    }
    catch (error) {
      loginInFlightRef.current =
        false;

      const parsed =
        buildFirebaseLoginError(
          error
        );

      if (
        parsed?.type ===
          "unknown" &&
        error?.message
      ) {
        throw error;
      }

      throw new Error(
        parsed?.msg ||
        error?.message ||
        "Não foi possível criar a conta."
      );
    }
  };

  const onEnter = async (payload) => {
    setMsg("");
    setErr("");

    const emailForAuth =
      normalizeLoginToEmail(
        payload?.login
      );

    const password =
      String(
        payload?.password || ""
      );

    const mode =
      String(
        payload?.mode || ""
      )
        .trim()
        .toLowerCase();

    if (mode !== "firebase") {
      throw new Error(
        "Modo de autenticação inválido."
      );
    }

    if (
      !isEmailLogin(
        emailForAuth
      )
    ) {
      throw new Error(
        "Informe seu e-mail."
      );
    }

    if (!password) {
      throw new Error(
        "Informe sua senha."
      );
    }

    loginInFlightRef.current =
      true;

    authNotifiedRef.current =
      false;

    setGuestActive(false);
    setIsGuest(false);

    try {
      clearGuestProfile();
    } catch {}

    safeRemoveSession();

    try {
      await signInWithEmailAndPassword(
        auth,
        emailForAuth,
        password
      );

      return true;
    }
    catch (error) {
      loginInFlightRef.current =
        false;

      const parsed =
        buildFirebaseLoginError(
          error
        );

      throw new Error(
        parsed?.msg ||
        "Login ou senha inválidos."
      );
    }
  };

  async function onResetPassword(
    emailRaw
  ) {
    const emailCandidate =
      normalizeLoginToEmail(
        emailRaw
      );

    if (
      !isEmailLogin(
        emailCandidate
      )
    ) {
      throw new Error(
        "Informe um e-mail válido."
      );
    }

    try {
      await sendPasswordResetEmail(
        auth,
        emailCandidate
      );

      return true;
    }
    catch (error) {
      const code =
        String(
          error?.code || ""
        ).trim();

      if (
        code ===
        "auth/user-not-found"
      ) {
        return true;
      }

      if (
        code ===
        "auth/too-many-requests"
      ) {
        throw new Error(
          "Muitas solicitações. Aguarde alguns minutos e tente novamente."
        );
      }

      if (
        code ===
        "auth/network-request-failed"
      ) {
        throw new Error(
          "Falha de rede. Verifique sua conexão."
        );
      }

      throw new Error(
        "Não foi possível enviar a recuperação de senha."
      );
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

  if (!isLogged) {
    return (
      <LoginVisual
        onEnter={onEnter}
        onRegister={onRegister}
        onResetPassword={onResetPassword}
      />
    );
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