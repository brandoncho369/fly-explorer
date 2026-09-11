import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.fly-bench.com"),
  title: "fly-explorer — a fruit fly connectome, live in your browser",
  description: "The FlyWire Drosophila connectome (139k neurons, 3.7M synapses) running as a spiking network in your browser. Poke a sense; watch the wiring answer.",
  icons: { icon: "/icon.svg" },
  openGraph: { title: "fly-bench", description: "A fruit fly brain running live in your browser, and a benchmark for whether it still behaves like a fly.", url: "https://www.fly-bench.com", siteName: "fly-bench" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
