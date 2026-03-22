function validateEnv() {
  const required = [
    "KING_LOTTERIES_FEDERAL",
  ];

  const missing = required.filter((key) => {
    const value = process.env[key];
    return !value || !String(value).trim();
  });

  if (missing.length) {
    throw new Error(
      `[ENV ERROR] Variáveis obrigatórias ausentes: ${missing.join(", ")}`
    );
  }

  console.log("[ENV] OK");
}

module.exports = { validateEnv };
