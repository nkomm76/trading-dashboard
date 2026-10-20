import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dividenden-Dashboard",
  description: "Privates Dashboard für das Dividendendepot",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
