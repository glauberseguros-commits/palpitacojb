"use strict";

const { updateSnapshot } = require("../engine/snapshotManager");

async function main() {
  try {
    const lottery = process.argv[2] || "PT_RIO";
    const force = String(process.argv[3] || "").toLowerCase() === "force";

    console.log("");
    console.log("====================================");
    console.log(" PALPITACO JB - Snapshot Worker");
    console.log("====================================");
    console.log("");

    console.log("Lottery..:", lottery);
    console.log("Force....:", force);
    console.log("");

    const result = await updateSnapshot({
      lottery,
      force,
    });

    console.log("OK.......:", result.ok);
    console.log("Bounds...:", result.bounds || null);
    console.log("Next.....:", result.nextStep || null);

    console.log("");
    console.log("Worker finalizado.");
    process.exit(0);
  } catch (e) {
    console.error("");
    console.error("ERRO:");
    console.error(e);
    process.exit(1);
  }
}

main();
