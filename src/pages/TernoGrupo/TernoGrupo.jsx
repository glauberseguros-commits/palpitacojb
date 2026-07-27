import React from "react";

import { useTop3Controller } from "./top3.hooks";
import TernoGrupoView from "./TernoGrupoView";

export default function TernoGrupo() {
  const controller = useTop3Controller();

  return (
    <TernoGrupoView
      {...controller}
    />
  );
}
