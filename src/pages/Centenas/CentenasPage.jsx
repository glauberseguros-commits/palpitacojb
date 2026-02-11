import React from "react";
import Centenas from "./Centenas.jsx";

/**
 * Wrapper de compatibilidade:
 * - Mantém o Centenas.jsx atual funcionando
 * - Permite refatorar aos poucos para CentenasView.jsx sem quebrar rotas/imports
 */
export default function CentenasPage() {
  return <Centenas />;
}
