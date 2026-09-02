import React from "react";

import UserManagementPage from "./modules/UserManagement/UserManagementPage";

export default function Admin({
  onExit,
  onLogout,
}) {
  const buttonBase = {
    minHeight: 42,
    padding: "0 16px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 800,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "22px 18px 36px",
        background:
          "linear-gradient(180deg,#050505 0%,#090806 50%,#050505 100%)",
        color: "#f6f3ea",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            paddingBottom: 17,
            marginBottom: 22,
            borderBottom:
              "1px solid rgba(202,166,75,0.18)",
          }}
        >
          <div>
            <div
              style={{
                color: "#d8b94e",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 1.3,
              }}
            >
              PALPITACO JB · ADMIN
            </div>

            <h1
              style={{
                margin: "5px 0 0",
                fontSize: "clamp(25px,4vw,34px)",
              }}
            >
              Gestão de usuários
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => onExit?.()}
              style={{
                ...buttonBase,
                color: "#fff",
                background:
                  "rgba(255,255,255,0.04)",
                border:
                  "1px solid rgba(255,255,255,0.13)",
              }}
            >
              VOLTAR À PLATAFORMA
            </button>

            <button
              type="button"
              onClick={() => onLogout?.()}
              style={{
                ...buttonBase,
                color: "#ffabab",
                background:
                  "rgba(180,40,40,0.07)",
                border:
                  "1px solid rgba(255,100,100,0.22)",
              }}
            >
              SAIR
            </button>
          </div>
        </header>

        <UserManagementPage />
      </div>
    </main>
  );
}