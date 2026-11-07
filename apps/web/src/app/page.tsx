import { APP_NAME } from "@paibot/shared";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 16px" }}>
      <h1 style={{ fontSize: 40, margin: 0 }}>
        {APP_NAME} <span style={{ color: "#ff6b1a" }}>läuft.</span>
      </h1>
      <p style={{ fontSize: 18, lineHeight: 1.5 }}>
        Dein persönliches KI-Team – EU-souverän und selbst gehostet. Das hier ist das Gerüst aus
        Folge 0. Ab Folge 2 wird daraus Schritt für Schritt der echte Agent.
      </p>
      <p style={{ color: "#6b6f76" }}>Healthcheck: /api/health</p>
    </main>
  );
}
