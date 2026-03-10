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
} from "firebase/auth";
import {
  doc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";

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
 * - Login aceita:
 *   - e-mail
 *   - telefone (+55 / com máscara / só dígitos)
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
const PLAN_PREMIUM = "PREMIUM";
const PLAN_VIP = "VIP";
const ACCOUNT_SESSION_KEY = "pp_session_v1";

function normalizePlan(planRaw) {
  const p = String(planRaw || "").trim().toUpperCase();
  if (p === PLAN_VIP) return PLAN_VIP;
  if (p === PLAN_PREMIUM) return PLAN_PREMIUM;
  return PLAN_FREE;
}

function safeParseSession(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function loadFormalGuestSession() {
  try {
    const raw = localStorage.getItem(ACCOUNT_SESSION_KEY);
    if (!raw) return null;

    const obj = safeParseSession(raw);
    if (!obj || obj.ok !== true) return null;

    const type = String(obj.type || "").trim().toLowerCase();
    if (type !== "guest") return null;

    return obj;
  } catch {
    return null;
  }
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

  // plan (novo)
  const [plan, setPlan] = useState(PLAN_FREE);
  const [planStartAt, setPlanStartAt] = useState("");
  const [planEndAt, setPlanEndAt] = useState("");
  const [isLifetime, setIsLifetime] = useState(false);
  const [isActivePlan, setIsActivePlan] = useState(false);

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

  function normalizeLoginToPhoneCandidates(loginRaw) {
    const rawDigits = normalizePhoneDigits(loginRaw);
    const digits = String(rawDigits || "").trim();

    if (!digits) return [];

    const variants = new Set();
    variants.add(digits);

    // Se vier com +55 / 55 na frente e total BR internacional
    if (digits.length >= 12 && digits.startsWith("55")) {
      variants.add(digits.slice(2));
    }

    // Se vier sem +55, adiciona com 55 na frente
    if (!digits.startsWith("55")) {
      variants.add(`55${digits}`);
    }

    return Array.from(variants).filter(Boolean);
  }

  async function resolveEmailFromPhone(loginRaw) {
    const candidates = normalizeLoginToPhoneCandidates(loginRaw);

    if (!candidates.length) return "";

    for (const phoneCandidate of candidates) {
      try {
        const qRef = query(
          collection(db, "users"),
          where("phone", "==", phoneCandidate),
          limit(1)
        );
        const snap = await getDocs(qRef);

        if (!snap.empty) {
          const data = snap.docs[0]?.data() || {};
          const foundEmail = String(data.email || "").trim().toLowerCase();
          if (foundEmail) return foundEmail;
        }
      } catch {}
    }

    // compat com base antiga usando phoneDigits
    for (const phoneCandidate of candidates) {
      try {
        const qRef = query(
          collection(db, "users"),
          where("phoneDigits", "==", phoneCandidate),
          limit(1)
        );
        const snap = await getDocs(qRef);

        if (!snap.empty) {
          const data = snap.docs[0]?.data() || {};
          const foundEmail = String(data.email || "").trim().toLowerCase();
          if (foundEmail) return foundEmail;
        }
      } catch {}
    }

    return "";
  }

  async function resolveLoginToEmail(loginRaw) {
    if (isEmailLogin(loginRaw)) {
      return normalizeLoginToEmail(loginRaw);
    }

    return await resolveEmailFromPhone(loginRaw);
  }

  function buildFirebaseLoginError(error) {
    const code = String(error?.code || "").trim();

    switch (code) {
      case "auth/invalid-email":
        return "E-mail inválido.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Login ou senha inválidos.";
      case "auth/too-many-requests":
        return "Muitas tentativas. Aguarde e tente novamente.";
      case "auth/network-request-failed":
        return "Falha de rede. Verifique sua conexão.";
      default:
        return String(error?.message || "").trim() || "Falha ao autenticar no Firebase.";
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

      // sem Firebase user => pode ser guest local
      if (!user?.uid) {
        const formalGuest = loadFormalGuestSession();
        const guestActive = isGuestActive();

        if (formalGuest || guestActive) {
          setIsGuest(true);

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

          const g = loadGuestProfile();

          // mantém a sessão formal guest como fonte principal
          markSessionGuest();

          setNameDraft(g.name);
          setPhoneDraft(normalizePhoneDigits(g.phone));
          setPhotoURL(g.photoURL);
          setPhotoFile(null);
          clearPreview();

          authNotifiedRef.current = false;
          return;
        }

        // sem auth real e sem guest => limpa tudo
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

      setPlan(remotePlan);
      setPlanStartAt(remotePlanStartAt);
      setPlanEndAt(remotePlanEndAt);
      setIsLifetime(remoteIsLifetime);
      setIsActivePlan(remoteIsActivePlan);

      // compat temporária com hooks/view antigos:
      // FREE => sem trial ativo
      // PREMIUM/VIP => considera como "ativo" se houver plano ativo
      setTrialStartAt(remotePlanStartAt);
      setTrialEndAt(remotePlanEndAt);
      setTrialActive(remotePlan !== PLAN_FREE && remoteIsActivePlan);

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

  const onEnter = async (payload) => {
    setMsg("");
    setErr("");

    const login = String(payload?.login || "").trim();
    const password = String(payload?.password || "");
    const mode = String(payload?.mode || "").trim().toLowerCase();

    if (mode !== "firebase") {
      throw new Error("Modo de autenticação inválido.");
    }

    if (!login || !password) {
      throw new Error("Preencha login e senha.");
    }

    const emailForAuth = await resolveLoginToEmail(login);

    if (!emailForAuth) {
      throw new Error("Login ou senha inválidos.");
    }

    // trava guest enquanto autentica
    loginInFlightRef.current = true;
    authNotifiedRef.current = false;

    // mata estado guest antes do login real
    setGuestActive(false);
    setIsGuest(false);
    safeRemoveSession();

    try {
      await signInWithEmailAndPassword(auth, emailForAuth, password);
      return true;
    } catch (error) {
      loginInFlightRef.current = false;
      throw new Error(buildFirebaseLoginError(error));
    }
  };

  const onSkip = () => {
    setMsg("");
    setErr("");

    loginInFlightRef.current = false;
    authNotifiedRef.current = false;

    safeRemoveSession();

    setGuestActive(true, { silent: true });
    markSessionGuest();
    setIsGuest(true);

    resetAuthedState();

    const g = loadGuestProfile();
    setNameDraft(g.name);
    setPhoneDraft(normalizePhoneDigits(g.phone));
    setPhotoURL(g.photoURL);
    setPhotoFile(null);
    clearPreview();

    if (typeof onAuthenticated === "function") {
      onAuthenticated();
    }
  };

  const onRegister = () => {
    setMsg("");
    setErr("Cadastro ainda não foi conectado ao Firebase.");
  };

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
    return (
      <LoginVisual
        onEnter={onEnter}
        onSkip={onSkip}
        onRegister={onRegister}
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