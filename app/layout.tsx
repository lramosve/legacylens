import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LegacyLens — GnuCOBOL Codebase Explorer",
  description:
    "Ask natural language questions about the GnuCOBOL compiler codebase. Powered by RAG with Voyage Code 3 embeddings and Claude.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("legacylens-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
