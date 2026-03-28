import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { Toaster } from "react-hot-toast";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Dodge & Survive",
  description: "Daily Web3 elimination game on Base.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
       <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: "#111", color: "#fff", border: "1px solid #333" },
            }}
          />
         <footer style={{ borderTop: "1px solid #1a1a1a", background: "#0A0A0A", padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <style>{`
              .footer-icon { color: #444; transition: color 0.2s, transform 0.2s, filter 0.2s; display: flex; align-items: center; }
              .footer-icon:hover { color: #E8FF00; transform: scale(1.18); filter: drop-shadow(0 0 6px rgba(232,255,0,0.6)); }
              @media(max-width: 768px) {
                .footer-inner { flex-direction: column !important; align-items: center !important; gap: 16px !important; text-align: center !important; }
                footer { padding: 20px 20px 84px !important; }
              }
            `}</style>
            <div className="footer-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              {/* LEFT — branding */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#444" }}>
                  Powered by <span style={{ color: "#E8FF00" }}>Base</span>
                </div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#333" }}>
                  © 2026 Dodge & Survive
                </div>
              </div>
              {/* RIGHT — contact */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#444", letterSpacing: "0.1em", textTransform: "uppercase" }}>Contact</div>
                <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                  <a href="https://x.com/DodgeSurvive" target="_blank" rel="noreferrer" className="footer-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                  <a href="https://discord.gg/H8GUMSaEJ" target="_blank" rel="noreferrer" className="footer-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
