/** Läuft einmal beim Serverstart. Der Node-Teil liegt getrennt, damit die Edge-Laufzeit ihn nicht lädt. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyMigrations } = await import("./instrumentation-node");
    await applyMigrations();
  }
}
