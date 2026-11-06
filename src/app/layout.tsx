import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dividenden-Dashboard",
  description: "Privates Dashboard für das Dividendendepot",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Jede Seite je Anfrage rendern: nur so bekommen die Skripte den Nonce der Content-Security-Policy
  await connection();
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
