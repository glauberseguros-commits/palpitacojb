// src/pages/Admin/Admin.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../services/firebase";
import {
  ADMINS_COLLECTION as ADMINS_COLLECTION_RAW,
  USERS_COLLECTION as USERS_COLLECTION_RAW,
} from "./adminKeys";

const GOLD = "rgba(202,166,75,1)";
const GOLD_SOFT = "rgba(202,166,75,0.16)";
const WHITE = "rgba(255,255,255,0.92)";
const WHITE_70 = "rgba(255,255,255,0.70)";
const BLACK = "#050505";
const BORDER = "rgba(202,166,75,0.35)";
const SHADOW = "0 18px 45px rgba(0,0,0,0.55)";
const PANEL_BG = "rgba(0,0,0,0.42)";

const USERS_COLLECTION = String(USERS_COLLECTION_RAW || "").trim() || "users";
const ADMINS_COLLECTION = String(ADMINS_COLLECTION_RAW || "").trim() || "admins";

/* =========================
   Helpers
========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtBR(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "-";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function nowMs() {
  return Date.now();
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function normEmail(v) {
  return safeStr(v).toLowerCase();
}

function normPhoneE164(v) {
  // Admin cola +55... ou 55... ou (61) 999... => vira +55XXXXXXXXXXX
  const raw = safeStr(v);
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("55")) return `+${digits}`;
  // se vier só DDD+fone, assume BR
  if (digits.length >= 10) return `+55${digits}`;
  return `+${digits}`;
}

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function humanizeFsError(e) {
  const code = String(e?.code || "");
  const msg = String(e?.message || "Falha no Firestore.");
  if (
    code.includes("permission-denied") ||
    msg.toLowerCase().includes("permission")
  ) {
    return "Permissões ausentes ou insuficientes. Confirme se este login é Admin e se as Rules permitem ler /admins e ler/escrever em /users.";
  }
  if (code.includes("unavailable")) return "Firestore indisponível no momento. Tente novamente.";
  return msg;
}

function isEmailLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* =========================
   Admin gate via /admins/{uid}
========================= */

async function isUidAdmin(uid) {
  const id = safeStr(uid);
  if (!id) return false;
  const ref = doc(db, ADMINS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data() || {};
  return data.active === true;
}

/* =========================
   Firestore ops
========================= */

async function fetchUserById(uid) {
  const ref = doc(db, USERS_COLLECTION, String(uid || ""));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

async function fetchLastUsers() {
  const qy = query(
    collection(db, USERS_COLLECTION),
    orderBy("updatedAtMs", "desc"),
    limit(25)
  );
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function fetchByEmail(emailInput) {
  const emailLower = normEmail(emailInput);
  if (!emailLower) return [];

  const colRef = collection(db, USERS_COLLECTION);

  // tenta emailLower primeiro
  try {
    const q1 = query(colRef, where("emailLower", "==", emailLower), limit(10));
    const s1 = await getDocs(q1);
    const rows1 = s1.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (rows1.length) return rows1;
  } catch {
    // ignora
  }

  const q2 = query(colRef, where("email", "==", emailLower), limit(10));
  const s2 = await getDocs(q2);
  return s2.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function fetchByPhone(phoneInput) {
  const phoneE164 = normPhoneE164(phoneInput);
  if (!phoneE164) return [];
  const colRef = collection(db, USERS_COLLECTION);

  try {
    const q1 = query(colRef, where("phoneE164", "==", phoneE164), limit(10));
    const s1 = await getDocs(q1);
    const rows1 = s1.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (rows1.length) return rows1;
  } catch {
    // ignora
  }

  const q2 = query(colRef, where("phone", "==", phoneE164), limit(10));
  const s2 = await getDocs(q2);
  return s2.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

/* =========================
   Plano efetivo (VIP > PRO > FREE)
========================= */

function computeEffectivePlan(docData) {
  const now = nowMs();
  const vipIndef = !!docData?.vipIndefinite;
  const vipUntil = Number(docData?.vipUntilMs || 0);
  const vipActive = vipIndef || vipUntil > now;

  const proUntil = Number(docData?.proUntilMs || 0);
  const proActive = proUntil > now;

  if (vipActive) return "vip";
  if (proActive) return "pro";
  return "free";
}

/* =========================
   Component
========================= */

export default function Admin({ onExit, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // lista
  const [rows, setRows] = useState([]);

  // busca
  const [qUid, setQUid] = useState("");
  const [qEmail, setQEmail] = useState("");
  const [qPhone, setQPhone] = useState("");

  // editor base
  const [uidEdit, setUidEdit] = useState("");
  const [nameEdit, setNameEdit] = useState("");
  const [photoURLEdit, setPhotoURLEdit] = useState("");
  const [emailEdit, setEmailEdit] = useState("");
  const [phoneEdit, setPhoneEdit] = useState("");

  // base plan (pagamento)
  const [planBase, setPlanBase] = useState("free"); // free | pro
  const [proDays, setProDays] = useState(30);
  const [proUntilMs, setProUntilMs] = useState(null);

  // VIP (admin)
  const [vipDays, setVipDays] = useState(7);
  const [vipUntilMs, setVipUntilMs] = useState(null);
  const [vipIndefinite, setVipIndefinite] = useState(false);

  // flags vip (futuro: parcial)
  const [vipFull, setVipFull] = useState(true);

  // status
  const [disabled, setDisabled] = useState(false);

  // UI: selecionado
  const [selectedId, setSelectedId] = useState("");
  const clearToastTimerRef = useRef(null);

  const isVipActive = useMemo(() => {
    if (vipIndefinite) return true;
    const v = Number(vipUntilMs || 0);
    return v > nowMs();
  }, [vipUntilMs, vipIndefinite]);

  const isProActive = useMemo(() => {
    const v = Number(proUntilMs || 0);
    return v > nowMs();
  }, [proUntilMs]);

  const toast = (text, isErr = false) => {
    if (clearToastTimerRef.current) {
      clearTimeout(clearToastTimerRef.current);
      clearToastTimerRef.current = null;
    }
    setMsg(isErr ? "" : text);
    setErr(isErr ? text : "");
    clearToastTimerRef.current = setTimeout(() => {
      setMsg("");
      setErr("");
      clearToastTimerRef.current = null;
    }, 2600);
  };

  useEffect(() => {
    return () => {
      if (clearToastTimerRef.current) {
        clearTimeout(clearToastTimerRef.current);
        clearToastTimerRef.current = null;
      }
    };
  }, []);

  const clearEditor = () => {
    setUidEdit("");
    setNameEdit("");
    setPhotoURLEdit("");
    setEmailEdit("");
    setPhoneEdit("");

    setPlanBase("free");
    setProDays(30);
    setProUntilMs(null);

    setVipDays(7);
    setVipUntilMs(null);
    setVipIndefinite(false);
    setVipFull(true);

    setDisabled(false);
    setSelectedId("");
  };

  const pickRow = (r) => {
    const uid = String(r?.id || r?.uid || "");
    setSelectedId(uid);
    setUidEdit(uid);

    setNameEdit(String(r?.name || ""));
        setPhotoURLEdit(String(r?.photoURL || r?.photoUrl || ""));

    setEmailEdit(String(r?.email || ""));
    setPhoneEdit(String(r?.phone || r?.phoneE164 || ""));

    // base plan/pagamento
    const base = String(r?.planBase || r?.plan || "free").toLowerCase(); // compat: se antes usava plan
    setPlanBase(base === "pro" ? "pro" : "free");
    setProUntilMs(r?.proUntilMs ? Number(r.proUntilMs) : null);
    setProDays(30);

    // vip
    setVipIndefinite(!!r?.vipIndefinite);
    setVipUntilMs(r?.vipUntilMs ? Number(r.vipUntilMs) : null);
    setVipDays(7);

    // vip flags
    setVipFull(r?.vipFlags?.full !== false);

    setDisabled(!!r?.disabled);
  };

  // ✅ carrega lista quando auth está pronto + valida admin
  useEffect(() => {
    let mounted = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      if (!user) {
        setRows([]);
        clearEditor();
        return;
      }

      try {
        setBusy(true);
        setErr("");

        // garante token atualizado
        await user.getIdToken(true);

        // Gate: confirma se este UID é admin em /admins/{uid} com { active:true }
        const okAdmin = await isUidAdmin(user.uid);

        if (!okAdmin) {
          setRows([]);
          clearEditor();
          toast("Acesso negado: este usuário não é Admin.", true);
          try {
            await signOut(auth);
          } catch {}
          onLogout?.();
          return;
        }

        const list = await fetchLastUsers();
        if (!mounted) return;
        setRows(list);
      } catch (e) {
        if (!mounted) return;
        setErr(humanizeFsError(e));
      } finally {
        if (!mounted) return;
        setBusy(false);
      }
    });

    return () => {
      mounted = false;
      try {
        unsub?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshLast = async () => {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const list = await fetchLastUsers();
      setRows(list);
      toast("Lista atualizada.");
    } catch (e) {
      toast(humanizeFsError(e), true);
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    setErr("");
    setMsg("");

    const uid = safeStr(qUid);
    const email = safeStr(qEmail);
    const phone = safeStr(qPhone);

    if (!uid && !email && !phone) {
      return toast("Informe UID, e-mail ou telefone para buscar.", true);
    }

    setBusy(true);
    try {
      if (uid) {
        const one = await fetchUserById(uid);
        setRows(one ? [one] : []);
        if (one) pickRow(one);
        if (!one) toast("Nenhum usuário encontrado para esse UID.", true);
        return;
      }

      if (email) {
        const list = await fetchByEmail(email);
        setRows(list);
        if (list?.[0]) pickRow(list[0]);
        if (!list.length) toast("Nenhum usuário encontrado para esse e-mail.", true);
        return;
      }

      if (phone) {
        const list = await fetchByPhone(phone);
        setRows(list);
        if (list?.[0]) pickRow(list[0]);
        if (!list.length) toast("Nenhum usuário encontrado para esse telefone.", true);
        return;
      }
    } catch (e) {
      toast(humanizeFsError(e), true);
    } finally {
      setBusy(false);
    }
  };

  const loadToEditor = async () => {
    setErr("");
    setMsg("");

    const uid = safeStr(uidEdit);
    if (!uid) return toast("Informe o UID para carregar no editor.", true);

    setBusy(true);
    try {
      const one = await fetchUserById(uid);

      if (one) {
        pickRow(one);
        toast("Usuário carregado.");
      } else {
        // prepara novo
        setSelectedId(uid);
        setNameEdit("");
        setPhotoURLEdit("");
        setEmailEdit("");
        setPhoneEdit("");

        setPlanBase("free");
        setProUntilMs(null);

        setVipUntilMs(null);
        setVipIndefinite(false);
        setVipFull(true);

        setDisabled(false);
        toast("Usuário novo (doc ainda não existe). Clique Salvar para criar.");
      }
    } catch (e) {
      toast(humanizeFsError(e), true);
    } finally {
      setBusy(false);
    }
  };

  const grantVip = () => {
    const days = clampInt(vipDays, 1, 365);
    const until = nowMs() + days * 24 * 60 * 60 * 1000;
    setVipIndefinite(false);
    setVipUntilMs(until);
  };

  const setVipForever = () => {
    setVipIndefinite(true);
    setVipUntilMs(null);
  };

  const removeVip = () => {
    setVipIndefinite(false);
    setVipUntilMs(null);
  };

  const grantPro = () => {
    // PRO = pagamento: mínimo 30 dias (regra sua)
    const days = clampInt(proDays, 30, 365);
    const until = nowMs() + days * 24 * 60 * 60 * 1000;
    setPlanBase("pro");
    setProUntilMs(until);
  };

  const removePro = () => {
    setPlanBase("free");
    setProUntilMs(null);
  };

  const saveUser = async () => {
    setErr("");
    setMsg("");

    const uid = safeStr(uidEdit);
    if (!uid) return toast("Informe o UID do usuário (editor) antes de salvar.", true);

    const name = safeStr(nameEdit);
    if (!name) return toast("Nome é obrigatório. Preencha o campo Nome antes de salvar.", true);

    // ✅ Cadastro real: exigir e-mail e telefone
    // Regra prática: se o usuário estiver com PRO ou VIP ativo (ou sendo ativado), exige ambos.
    const emailLower = normEmail(emailEdit);
    const phoneE164 = normPhoneE164(phoneEdit);
    const willBeVip = !!vipIndefinite || Number(vipUntilMs || 0) > nowMs();
    const willBePro = planBase === "pro" || Number(proUntilMs || 0) > nowMs();
    const needsContacts = willBeVip || willBePro;

    if (needsContacts) {
      if (!emailLower || !isEmailLike(emailLower)) {
        return toast("Para PRO/VIP, e-mail válido é obrigatório.", true);
      }
      if (!phoneE164 || phoneE164.length < 12) {
        return toast("Para PRO/VIP, telefone é obrigatório (formato +55...).", true);
      }
    }

    setBusy(true);
    try {
            const photoURL = safeStr(photoURLEdit) || null;

      const payload = {
        uid,

        // perfil
        name,        photoURL,
        photoUrl: photoURL,// contatos
        email: emailLower || null,
        emailLower: emailLower || null,
        phone: phoneE164 || null,
        phoneE164: phoneE164 || null,

        // base (pagamento)
        planBase: planBase === "pro" ? "pro" : "free",
        proUntilMs: proUntilMs ? Number(proUntilMs) : null,

        // vip (admin)
        vipIndefinite: !!vipIndefinite,
        vipUntilMs: vipUntilMs ? Number(vipUntilMs) : null,
        vipFlags: {
          full: !!vipFull,
        },

        // status
        disabled: !!disabled,

        // meta
        updatedAtMs: nowMs(),
      };

      const ref = doc(db, USERS_COLLECTION, uid);
      await setDoc(ref, payload, { merge: true });

      toast("Usuário salvo com sucesso.");

      const list = await fetchLastUsers();
      setRows(list);

      // mantém seleção atual na lista nova
      const again = list.find((x) => String(x.id) === String(uid));
      if (again) pickRow(again);
    } catch (e2) {
      toast(humanizeFsError(e2), true);
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    try {
      await signOut(auth);
    } catch {}
    onLogout?.();
  };

  const onExitSafe = () => {
    try {
      onExit?.();
    } catch {}
  };

  return (
    <div style={{ minHeight: "100vh", background: BLACK, padding: 18, color: WHITE }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 900, letterSpacing: 1 }}>
          <span style={{ color: GOLD }}>PALPITACO</span> • ADMIN
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={refreshLast}
            disabled={busy}
            style={{
              height: 38,
              borderRadius: 999,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: WHITE_70,
              padding: "0 14px",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Atualizar
          </button>

          <button
            onClick={onExitSafe}
            style={{
              height: 38,
              borderRadius: 999,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: WHITE_70,
              padding: "0 14px",
              cursor: "pointer",
            }}
          >
            Voltar
          </button>

          <button
            onClick={doLogout}
            style={{
              height: 38,
              borderRadius: 999,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: WHITE_70,
              padding: "0 14px",
              cursor: "pointer",
            }}
          >
            Sair
          </button>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 440px",
          gap: 14,
        }}
      >
        {/* LISTA */}
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${BORDER}`,
            background: PANEL_BG,
            boxShadow: SHADOW,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 900, color: GOLD }}>Usuários</div>

            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <input
                value={qUid}
                onChange={(e) => setQUid(e.target.value)}
                placeholder="Buscar por UID"
                style={{
                  height: 38,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                  width: 190,
                }}
              />
              <input
                value={qEmail}
                onChange={(e) => setQEmail(e.target.value)}
                placeholder="Buscar por e-mail"
                style={{
                  height: 38,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                  width: 200,
                }}
              />
              <input
                value={qPhone}
                onChange={(e) => setQPhone(e.target.value)}
                placeholder="Buscar por telefone (+55...)"
                style={{
                  height: 38,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                  width: 220,
                }}
              />
              <button
                onClick={search}
                disabled={busy}
                style={{
                  height: 38,
                  borderRadius: 999,
                  border: "none",
                  background: busy ? GOLD_SOFT : GOLD,
                  color: "#111",
                  fontWeight: 900,
                  padding: "0 14px",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </div>

          {msg ? (
            <div style={{ marginTop: 10, color: "rgba(120,255,180,0.95)" }}>{msg}</div>
          ) : null}
          {err ? (
            <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)" }}>{err}</div>
          ) : null}

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: "0 10px",
              }}
            >
              <thead>
                <tr style={{ color: WHITE_70, fontSize: 12, textAlign: "left" }}>
                  <th style={{ padding: "0 10px" }}>Nome</th>
                  <th style={{ padding: "0 10px" }}>UID</th>
                  <th style={{ padding: "0 10px" }}>E-mail</th>
                  <th style={{ padding: "0 10px" }}>Telefone</th>
                  <th style={{ padding: "0 10px" }}>Base</th>
                  <th style={{ padding: "0 10px" }}>PRO até</th>
                  <th style={{ padding: "0 10px" }}>VIP</th>
                  <th style={{ padding: "0 10px" }}>Status</th>
                  <th style={{ padding: "0 10px" }} />
                </tr>
              </thead>
              <tbody>
                {rows?.length ? (
                  rows.map((r) => {
                    const eff = computeEffectivePlan(r);
                    const vipIndef = !!r?.vipIndefinite;
                    const vip = r?.vipUntilMs ? Number(r.vipUntilMs) : 0;
                    const vipOn = vipIndef || vip > nowMs();

                    const pro = r?.proUntilMs ? Number(r.proUntilMs) : 0;
                    const proOn = pro > nowMs();

                    const isSel = String(r?.id || "") === String(selectedId || "");

                    return (
                      <tr
                        key={r.id}
                        style={{
                          background: isSel
                            ? "rgba(202,166,75,0.10)"
                            : "rgba(0,0,0,0.35)",
                        }}
                      >
                        <td
                          style={{
                            padding: "10px",
                            border: `1px solid ${BORDER}`,
                            borderRight: "none",
                            borderRadius: "12px 0 0 12px",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 12,
                              color: eff === "vip" ? GOLD : WHITE,
                            }}
                          >
                            {r?.name || "—"}
                          </div>
                          <div style={{ fontSize: 11, color: WHITE_70 }}>{eff.toUpperCase()}</div>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 12 }}>
                            {String(r.id || "-").slice(0, 12)}…
                          </div>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <span style={{ color: WHITE_70, fontSize: 12 }}>{r?.email || "-"}</span>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <span style={{ color: WHITE_70, fontSize: 12 }}>
                            {r?.phone || r?.phoneE164 || "-"}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <span style={{ color: r?.planBase === "pro" ? GOLD : WHITE }}>
                            {String(r?.planBase || "free")}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <span style={{ color: proOn ? GOLD : WHITE_70 }}>{fmtBR(pro)}</span>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <span style={{ color: vipOn ? GOLD : WHITE_70 }}>
                            {vipIndef ? "Indef." : fmtBR(vip)}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          {r.disabled ? "Bloqueado" : "Ativo"}
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            border: `1px solid ${BORDER}`,
                            borderLeft: "none",
                            borderRadius: "0 12px 12px 0",
                          }}
                        >
                          <button
                            onClick={() => pickRow(r)}
                            style={{
                              height: 32,
                              borderRadius: 999,
                              background: isSel ? "rgba(202,166,75,0.16)" : "transparent",
                              border: `1px solid ${BORDER}`,
                              color: WHITE_70,
                              padding: "0 12px",
                              cursor: "pointer",
                              fontWeight: 800,
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} style={{ padding: 12, color: WHITE_70 }}>
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
            * Coleção usada: <b>{USERS_COLLECTION}</b> • docId = <b>UID do Firebase Auth</b>.
            <br />
            VIP é liberado pelo admin (prazo ou indeterminado). PRO é pagamento (mínimo 30 dias).
          </div>
        </div>

        {/* EDITOR */}
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${BORDER}`,
            background: PANEL_BG,
            boxShadow: SHADOW,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 900, color: GOLD }}>Editar usuário</div>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ color: WHITE_70, fontSize: 12 }}>UID (Firebase Auth)</div>
              <input
                value={uidEdit}
                onChange={(e) => setUidEdit(e.target.value)}
                placeholder="Cole o UID do usuário"
                style={{
                  height: 40,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button
                  onClick={loadToEditor}
                  disabled={busy}
                  style={{
                    height: 36,
                    borderRadius: 999,
                    border: "none",
                    background: busy ? GOLD_SOFT : GOLD,
                    color: "#111",
                    fontWeight: 900,
                    padding: "0 14px",
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {busy ? "Carregando..." : "Carregar"}
                </button>
                <button
                  onClick={clearEditor}
                  style={{
                    height: 36,
                    borderRadius: 999,
                    background: "transparent",
                    border: `1px solid ${BORDER}`,
                    color: WHITE_70,
                    padding: "0 14px",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Limpar
                </button>
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ color: WHITE_70, fontSize: 12 }}>Nome (obrigatório)</div>
              <input
                value={nameEdit}
                onChange={(e) => setNameEdit(e.target.value)}
                placeholder="Nome do usuário"
                style={{
                  height: 40,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ color: WHITE_70, fontSize: 12 }}>Foto (URL) — opcional</div>
              <input
                value={photoURLEdit}
                onChange={(e) => setPhotoURLEdit(e.target.value)}
                placeholder="https://..."
                style={{
                  height: 40,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                }}
              />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                Pode ficar vazio. Se preencher, deve ser URL pública.
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ color: WHITE_70, fontSize: 12 }}>E-mail</div>
              <input
                value={emailEdit}
                onChange={(e) => setEmailEdit(e.target.value)}
                placeholder="user@email.com"
                style={{
                  height: 40,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                }}
              />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                Para PRO/VIP, e-mail é obrigatório.
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ color: WHITE_70, fontSize: 12 }}>Telefone</div>
              <input
                value={phoneEdit}
                onChange={(e) => setPhoneEdit(e.target.value)}
                placeholder="+55 61 99999-9999"
                style={{
                  height: 40,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 12px",
                  outline: "none",
                }}
              />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                Para PRO/VIP, telefone é obrigatório.
              </div>
            </label>

            {/* PRO (pagamento) */}
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                background: "rgba(0,0,0,0.25)",
                padding: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ color: WHITE_70, fontSize: 12 }}>PRO até</div>
                  <div style={{ fontWeight: 900, color: isProActive ? GOLD : WHITE }}>
                    {fmtBR(proUntilMs)}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                    PRO = pagamento (mínimo 30 dias).
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min={30}
                    max={365}
                    value={proDays}
                    onChange={(e) => setProDays(e.target.value)}
                    style={{
                      width: 84,
                      height: 34,
                      borderRadius: 10,
                      border: `1px solid ${BORDER}`,
                      background: "rgba(0,0,0,0.25)",
                      color: WHITE,
                      padding: "0 10px",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={grantPro}
                    style={{
                      height: 34,
                      borderRadius: 999,
                      border: "none",
                      background: GOLD,
                      color: "#111",
                      fontWeight: 900,
                      padding: "0 12px",
                      cursor: "pointer",
                    }}
                  >
                    Ativar
                  </button>
                  <button
                    onClick={removePro}
                    style={{
                      height: 34,
                      borderRadius: 999,
                      background: "transparent",
                      border: `1px solid ${BORDER}`,
                      color: WHITE_70,
                      padding: "0 12px",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>

            {/* VIP (admin) */}
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                background: "rgba(0,0,0,0.25)",
                padding: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ color: WHITE_70, fontSize: 12 }}>VIP</div>
                  <div style={{ fontWeight: 900, color: isVipActive ? GOLD : WHITE }}>
                    {vipIndefinite ? "Indeterminado" : fmtBR(vipUntilMs)}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                    VIP = sem pagamento, admin libera (prazo ou indeterminado).
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      color: WHITE_70,
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={vipFull}
                      onChange={(e) => setVipFull(e.target.checked)}
                    />
                    VIP total
                  </label>

                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={vipDays}
                    onChange={(e) => setVipDays(e.target.value)}
                    style={{
                      width: 80,
                      height: 34,
                      borderRadius: 10,
                      border: `1px solid ${BORDER}`,
                      background: "rgba(0,0,0,0.25)",
                      color: WHITE,
                      padding: "0 10px",
                      outline: "none",
                    }}
                  />

                  <button
                    onClick={grantVip}
                    style={{
                      height: 34,
                      borderRadius: 999,
                      border: "none",
                      background: GOLD,
                      color: "#111",
                      fontWeight: 900,
                      padding: "0 12px",
                      cursor: "pointer",
                    }}
                  >
                    Liberar
                  </button>

                  <button
                    onClick={setVipForever}
                    style={{
                      height: 34,
                      borderRadius: 999,
                      border: "none",
                      background: "rgba(202,166,75,0.55)",
                      color: "#111",
                      fontWeight: 900,
                      padding: "0 12px",
                      cursor: "pointer",
                    }}
                  >
                    Indef.
                  </button>

                  <button
                    onClick={removeVip}
                    style={{
                      height: 34,
                      borderRadius: 999,
                      background: "transparent",
                      border: `1px solid ${BORDER}`,
                      color: WHITE_70,
                      padding: "0 12px",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={disabled}
                onChange={(e) => setDisabled(e.target.checked)}
              />
              <span style={{ color: WHITE_70 }}>Usuário bloqueado</span>
            </label>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                onClick={saveUser}
                disabled={busy}
                style={{
                  height: 40,
                  borderRadius: 999,
                  border: "none",
                  background: busy ? GOLD_SOFT : GOLD,
                  color: "#111",
                  fontWeight: 900,
                  padding: "0 14px",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>

            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
              Regra: VIP prevalece sobre PRO. PRO prevalece sobre FREE.
              <br />
              Para ativar PRO/VIP, este Admin exige e-mail e telefone.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

