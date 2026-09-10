import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fly-explorer — a fruit fly connectome, live in your browser",
  description: "The FlyWire Drosophila connectome running as a leaky integrate-and-fire network. Poke a sense; watch the wiring answer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
