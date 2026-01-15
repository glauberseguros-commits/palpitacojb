// src/pages/Admin/Admin.jsx
import React, { useEffect, useMemo, useState } from "react";
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
import { USERS_COLLECTION as USERS_COLLECTION_RAW } from "./adminKeys";

const GOLD = "rgba(202,166,75,1)";
const GOLD_SOFT = "rgba(202,166,75,0.16)";
const WHITE = "rgba(255,255,255,0.92)";
const WHITE_70 = "rgba(255,255,255,0.70)";
const BLACK = "#050505";
const BORDER = "rgba(202,166,75,0.35)";
const SHADOW = "0 18px 45px rgba(0,0,0,0.55)";
const PANEL_BG = "rgba(0,0,0,0.42)";

const USERS_COLLECTION = String(USERS_COLLECTION_RAW || "").trim() || "users";

function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmtBR(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
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
  // se já começa com + e tem dígitos suficientes, tenta respeitar
  if (raw.startsWith("+")) return `+${digits}`;
  // se veio 55..., prefixa +
  if (digits.startsWith("55")) return `+${digits}`;
  // se veio só DDD+numero (BR), prefixa +55
  if (digits.length >= 10) return `+55${digits}`;
  return `+${digits}`;
}

function humanizeFsError(e) {
  const code = String(e?.code || "");
  const msg = String(e?.message || "Falha no Firestore.");
  if (code.includes("permission-denied") || msg.toLowerCase().includes("permission")) {
    return "Permissões ausentes ou insuficientes. Confirme se este login é Admin e se as Rules permitem ler/escrever em /users.";
  }
  if (code.includes("unavailable")) return "Firestore indisponível no momento. Tente novamente.";
  return msg;
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

  // Preferencial: emailLower
  // Fallback: email
  const colRef = collection(db, USERS_COLLECTION);

  // tenta emailLower primeiro
  try {
    const q1 = query(colRef, where("emailLower", "==", emailLower), limit(10));
    const s1 = await getDocs(q1);
    const rows1 = s1.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (rows1.length) return rows1;
  } catch {
    // ignora e tenta o fallback abaixo
  }

  const q2 = query(colRef, where("email", "==", emailLower), limit(10));
  const s2 = await getDocs(q2);
  return s2.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function fetchByPhone(phoneInput) {
  const phoneE164 = normPhoneE164(phoneInput);
  if (!phoneE164) return [];
  const colRef = collection(db, USERS_COLLECTION);

  // Preferencial: phoneE164
  try {
    const q1 = query(colRef, where("phoneE164", "==", phoneE164), limit(10));
    const s1 = await getDocs(q1);
    const rows1 = s1.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (rows1.length) return rows1;
  } catch {
    // ignora e tenta o fallback abaixo
  }

  const q2 = query(colRef, where("phone", "==", phoneE164), limit(10));
  const s2 = await getDocs(q2);
  return s2.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
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
  const [emailEdit, setEmailEdit] = useState("");
  const [phoneEdit, setPhoneEdit] = useState("");

  // editor permissões
  const [plan, setPlan] = useState("free"); // free | pro | vip
  const [vipDays, setVipDays] = useState(7);
  const [vipUntilMs, setVipUntilMs] = useState(null);
  const [disabled, setDisabled] = useState(false);

  const isVipActive = useMemo(() => {
    const v = Number(vipUntilMs || 0);
    return v > nowMs();
  }, [vipUntilMs]);

  const toast = (text, isErr = false) => {
    setMsg(isErr ? "" : text);
    setErr(isErr ? text : "");
    if (!isErr) setTimeout(() => setMsg(""), 2500);
  };

  const clearEditor = () => {
    setUidEdit("");
    setEmailEdit("");
    setPhoneEdit("");
    setPlan("free");
    setVipDays(7);
    setVipUntilMs(null);
    setDisabled(false);
  };

  const pickRow = (r) => {
    const uid = String(r?.id || r?.uid || "");
    setUidEdit(uid);
    setEmailEdit(String(r?.email || ""));
    setPhoneEdit(String(r?.phone || r?.phoneE164 || ""));

    setPlan(String(r?.plan || "free"));
    setVipUntilMs(r?.vipUntilMs ? Number(r.vipUntilMs) : null);
    setDisabled(!!r?.disabled);
    setVipDays(7);
  };

  // ✅ carrega lista SÓ quando auth está pronto + token atualizado
  useEffect(() => {
    let unsub = null;

    unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRows([]);
        return;
      }
      try {
        setBusy(true);
        setErr("");
        await user.getIdToken(true);
        const list = await fetchLastUsers();
        setRows(list);
      } catch (e) {
        setErr(humanizeFsError(e));
      } finally {
        setBusy(false);
      }
    });

    return () => {
      try {
        unsub?.();
      } catch {}
    };
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

    if (!uid && !email && !phone) return toast("Informe UID, e-mail ou telefone para buscar.", true);

    setBusy(true);
    try {
      // prioridade: UID
      if (uid) {
        const one = await fetchUserById(uid);
        setRows(one ? [one] : []);
        if (!one) toast("Nenhum usuário encontrado para esse UID.", true);
        return;
      }

      // email
      if (email) {
        const list = await fetchByEmail(email);
        setRows(list);
        if (!list.length) toast("Nenhum usuário encontrado para esse e-mail.", true);
        return;
      }

      // phone
      if (phone) {
        const list = await fetchByPhone(phone);
        setRows(list);
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
        setPlan("free");
        setVipUntilMs(null);
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
    const days = Math.max(1, Math.min(365, Number(vipDays || 0)));
    const until = nowMs() + days * 24 * 60 * 60 * 1000;
    setVipUntilMs(until);
    setPlan("vip");
  };

  const removeVip = () => {
    setVipUntilMs(null);
    if (plan === "vip") setPlan("free");
  };

  const saveUser = async () => {
    setErr("");
    setMsg("");

    const uid = safeStr(uidEdit);
    if (!uid) return toast("Informe o UID do usuário (editor) antes de salvar.", true);

    setBusy(true);
    try {
      const emailLower = normEmail(emailEdit);
      const phoneE164 = normPhoneE164(phoneEdit);

      const payload = {
        uid,
        email: emailLower || null,
        emailLower: emailLower || null,
        phone: phoneE164 || null,
        phoneE164: phoneE164 || null,

        plan: String(plan || "free"),
        vipUntilMs: vipUntilMs ? Number(vipUntilMs) : null,
        disabled: !!disabled,

        updatedAtMs: nowMs(),
      };

      const ref = doc(db, USERS_COLLECTION, uid);
      await setDoc(ref, payload, { merge: true });

      toast("Usuário salvo com sucesso.");

      const list = await fetchLastUsers();
      setRows(list);
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
            onClick={onExit}
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
          gridTemplateColumns: "1fr 420px",
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

            <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                  width: 220,
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
                  width: 220,
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

          {msg ? <div style={{ marginTop: 10, color: "rgba(120,255,180,0.95)" }}>{msg}</div> : null}
          {err ? <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)" }}>{err}</div> : null}

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" }}>
              <thead>
                <tr style={{ color: WHITE_70, fontSize: 12, textAlign: "left" }}>
                  <th style={{ padding: "0 10px" }}>UID</th>
                  <th style={{ padding: "0 10px" }}>E-mail</th>
                  <th style={{ padding: "0 10px" }}>Telefone</th>
                  <th style={{ padding: "0 10px" }}>Plano</th>
                  <th style={{ padding: "0 10px" }}>VIP até</th>
                  <th style={{ padding: "0 10px" }}>Status</th>
                  <th style={{ padding: "0 10px" }} />
                </tr>
              </thead>
              <tbody>
                {rows?.length ? (
                  rows.map((r) => {
                    const vip = r?.vipUntilMs ? Number(r.vipUntilMs) : 0;
                    const vipOn = vip > nowMs();
                    return (
                      <tr key={r.id} style={{ background: "rgba(0,0,0,0.35)" }}>
                        <td
                          style={{
                            padding: "10px",
                            border: `1px solid ${BORDER}`,
                            borderRight: "none",
                            borderRadius: "12px 0 0 12px",
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 12 }}>
                            {String(r.id || "-").slice(0, 18)}…
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
                          <span style={{ color: WHITE_70, fontSize: 12 }}>{r?.phone || r?.phoneE164 || "-"}</span>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <span style={{ color: r.plan === "vip" ? GOLD : WHITE }}>
                            {r.plan || "free"}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: "10px",
                            borderTop: `1px solid ${BORDER}`,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <span style={{ color: vipOn ? GOLD : WHITE_70 }}>{fmtBR(vip)}</span>
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
                              background: "transparent",
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
                    <td colSpan={7} style={{ padding: 12, color: WHITE_70 }}>
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
            Dica: se ainda não existir nenhum doc em <b>{USERS_COLLECTION}</b>, a lista ficará vazia mesmo — crie pelo editor à direita.
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
              <div style={{ color: WHITE_70, fontSize: 12 }}>E-mail (opcional)</div>
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
                Recomendado salvar também <b>emailLower</b> (normalizado).
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ color: WHITE_70, fontSize: 12 }}>Telefone (opcional)</div>
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
                Recomendado salvar <b>phoneE164</b> (ex.: +5561999999999).
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ color: WHITE_70, fontSize: 12 }}>Plano</div>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                style={{
                  height: 40,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                  color: WHITE,
                  padding: "0 10px",
                  outline: "none",
                }}
              >
                <option value="free">free</option>
                <option value="pro">pro</option>
                <option value="vip">vip</option>
              </select>
            </label>

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
                  <div style={{ color: WHITE_70, fontSize: 12 }}>VIP até</div>
                  <div style={{ fontWeight: 900, color: isVipActive ? GOLD : WHITE }}>
                    {fmtBR(vipUntilMs)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

              <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                VIP = <b>vipUntilMs</b> no futuro. Trial X dias = hoje + X dias.
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
                {busy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
