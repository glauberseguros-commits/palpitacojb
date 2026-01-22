// src/pages/Account/AccountView.jsx
import React from "react";

/**
 * AccountView
 * - Somente UI (JSX)
 * - Toda lógica vem por props
 */

export default function AccountView({
  ui,
  isGuest,
  isLogged,
  needsProfile,

  initials,
  photoSrc,

  name,
  phoneDisplay,

  email,
  uid,
  createdAtLabel,
  trialStartLabel,
  trialEndLabel,
  trialLabel,

  busy,
  err,
  msg,

  onNameChange,
  onPhoneChange,
  onPhotoPick,
  onSave,
  onRemovePhoto,
  onDeleteAccount,
}) {
  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={ui.title}>Minha Conta</div>
        <div style={ui.subtitle}>
          {isGuest ? "Modo convidado (sem login)." : "Sessão ativa."}
          {!isGuest ? (
            <>
              <br />
              <span style={{ opacity: 0.92 }}>Trial: {trialLabel}</span>
            </>
          ) : null}
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
          <div style={ui.avatar}>
            {photoSrc ? (
              <img src={photoSrc} alt="Foto do perfil" style={ui.avatarImg} />
            ) : (
              <div style={ui.avatarFallback}>{initials}</div>
            )}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={ui.hint}>
              {isGuest ? (
                <>
                  <b>Nome</b>, <b>telefone</b> e <b>foto</b> são opcionais.
                </>
              ) : (
                <>
                  <b>Nome</b> e <b>telefone</b> são obrigatórios.
                </>
              )}
            </div>

            <input
              style={ui.input}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={isGuest ? "Digite seu nome (opcional)" : "Digite seu nome"}
              disabled={busy}
            />

            <input
              style={ui.input}
              value={phoneDisplay}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder={isGuest ? "(xx) x xxxx-xxxx (opcional)" : "(xx) x xxxx-xxxx"}
              disabled={busy}
            />

            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPhotoPick(e.target.files?.[0] || null)}
              disabled={busy}
              style={{ color: "rgba(255,255,255,0.78)" }}
            />

            <div style={ui.actions}>
              <button
                type="button"
                style={ui.primaryBtn(busy)}
                onClick={onSave}
                disabled={busy}
              >
                {busy ? "SALVANDO..." : "SALVAR"}
              </button>

              <button
                type="button"
                style={ui.secondaryBtn(busy)}
                onClick={onRemovePhoto}
                disabled={busy}
              >
                REMOVER FOTO
              </button>

              <button
                type="button"
                style={ui.dangerBtn(busy)}
                onClick={onDeleteAccount}
                disabled={busy}
              >
                EXCLUIR CONTA
              </button>
            </div>

            {err ? <div style={ui.msgErr}>{err}</div> : null}
            {msg ? <div style={ui.msgOk}>{msg}</div> : null}
          </div>
        </div>

        <div style={ui.divider} />

        <div style={{ display: "grid", gap: 10 }}>
          <InfoRow ui={ui} label="Identificação" value={isGuest ? "—" : uid || "—"} />
          <InfoRow ui={ui} label="E-mail" value={isGuest ? "—" : email || "—"} />
          <InfoRow ui={ui} label="Cadastro" value={isGuest ? "—" : createdAtLabel} />

          {!isGuest ? (
            <>
              <InfoRow ui={ui} label="Trial início" value={trialStartLabel} />
              <InfoRow ui={ui} label="Trial fim" value={trialEndLabel} />
            </>
          ) : null}

          {needsProfile ? (
            <div style={ui.msgErr}>
              Nome e telefone são obrigatórios. Clique em <b>SALVAR</b>.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ ui, label, value }) {
  return (
    <div style={ui.row}>
      <div style={ui.k}>{label}</div>
      <div style={ui.v}>{value || "—"}</div>
    </div>
  );
}
