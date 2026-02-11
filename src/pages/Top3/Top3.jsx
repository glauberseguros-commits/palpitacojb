import React from "react";
import { useTop3Controller } from "./top3.hooks";
import Top3View from "./Top3View";

export default function Top3() {
  const c = useTop3Controller();
  return <Top3View {...c} />;
}
