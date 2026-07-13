import React from "react";

export default function MilharEnginePage() {
  return (
    <div className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <span className="admin-panel__eyebrow">
            ENGINE
          </span>

          <h2>Motor de Milhares</h2>
        </div>
      </div>

      <div className="admin-panel__body">

        <p>
          Estrutura criada.
        </p>

        <p>
          Próxima etapa:
          conectar buildMilharAudit()
          ao painel técnico.
        </p>

      </div>
    </div>
  );
}
