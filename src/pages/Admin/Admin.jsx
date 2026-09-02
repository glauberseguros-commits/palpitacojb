import React from "react";

import "./AdminSimple.css";

import UserManagementPage from "./modules/UserManagement/UserManagementPage";

export default function Admin({
  onExit,
  onLogout,
}) {
  return (
    <main className="jb-admin">
      <header className="jb-admin-header">
        <div className="jb-admin-header__inner">
          <div className="jb-admin-brand">
            <img
              src="/logo/palpitaco-jb.png"
              alt="Palpitaco JB"
            />

            <div>
              <span>
                PAINEL ADMINISTRATIVO
              </span>

              <strong>
                Gestão de usuários
              </strong>
            </div>
          </div>

          <div className="jb-admin-header__actions">
            <button
              type="button"
              className="jb-admin-link"
              onClick={() => onExit?.()}
            >
              PLATAFORMA
            </button>

            <button
              type="button"
              className="jb-admin-exit"
              onClick={() => onLogout?.()}
            >
              SAIR
            </button>
          </div>
        </div>
      </header>

      <UserManagementPage />
    </main>
  );
}