import { APP_NAME } from "@paibot/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Dein persönliches KI-Team – EU-souverän und selbst gehostet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#faf7f2",
          color: "#2b2d31",
        }}
      >
        {children}
      </body>
    </html>
  );
}
