"use client";
import { useRouter, usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    {
      label: "HOME",
      path: "/",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8FF00" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
          <path d="M9 21V12h6v9"/>
        </svg>
      ),
    },
    {
      label: "LOBBY",
      path: "/lobby",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8FF00" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      ),
    },
    {
      label: "ACCOUNT",
      path: "/account",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8FF00" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      ),
    },
    {
      label: "LEADERBOARD",
      path: "/leaderboard",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8FF00" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="14" width="4" height="8" rx="1"/>
          <rect x="9" y="9" width="4" height="13" rx="1"/>
          <rect x="16" y="4" width="4" height="18" rx="1"/>
        </svg>
      ),
    },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <>
      <style suppressHydrationWarning>{`
        .nav-wrap {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 40px;
          border-bottom: 1px solid #1a1a1a;
          background: rgba(8,8,8,0.96);
          backdrop-filter: blur(16px);
          position: sticky;
          top: 0;
          z-index: 200;
        }
   .nav-logo {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 2px;
          text-decoration: none;
        }
        .nav-logo img {
          height: 38px;
          width: auto;
          flex-shrink: 0;
          display: block;
        }
        .nav-logo-text {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.6rem;
          letter-spacing: 0em;
          line-height: 1;
          align-self: center;
          font-weight: 900;
        }
        .nav-logo-text .dodge { color: #ffffff; }
        .nav-logo-text .survive { color: #DFFF00; }
        .nav-right {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .nav-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-family: 'Space Mono', monospace;
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          transition: all 0.2s ease;
          color: #555;
          text-decoration: none;
        }
        .nav-tab:hover {
          background: rgba(232,255,0,0.05);
          color: #aaa;
        }
        .nav-tab.active {
          background: rgba(232,255,0,0.08);
          color: #E8FF00;
          box-shadow: 0 0 12px rgba(232,255,0,0.08);
        }
        .nav-connect {
          margin-left: 12px;
        }
        .mobile-bottom-nav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 65px;
          background: rgba(8,8,8,0.98);
          border-top: 1px solid rgba(232,255,0,0.2);
          backdrop-filter: blur(16px);
          z-index: 300;
          justify-content: space-around;
          align-items: center;
        }
        .mob-tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 1;
          height: 100%;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 0;
        }
        .mob-tab-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.06em;
          color: #555;
          transition: color 0.2s;
        }
        .mob-tab.active .mob-tab-label {
          color: #E8FF00;
        }
        .mob-tab.active svg {
          filter: drop-shadow(0 0 4px rgba(232,255,0,0.6));
        }
        .mob-tab:hover .mob-tab-label { color: #888; }

        @media (max-width: 768px) {
         .nav-logo img { height: 28px !important; }
          .nav-logo-text { font-size: 1.1rem !important; }
          .nav-tabs-desktop { display: none !important; }
          .mobile-bottom-nav { display: flex !important; }
          .nav-wrap { padding: 10px 20px; }
          .nav-connect { margin-left: 0; }
          body { padding-bottom: 65px; }
        }
      `}</style>

      <nav className="nav-wrap">
        <div className="nav-logo" onClick={() => router.push("/")}>
         <img src="/dns-logo.png" alt="D&S" />
          <span className="nav-logo-text">
            <span className="dodge">DODGE </span><span className="survive">& SURVIVE</span>
          </span>
        </div>
        <div className="nav-right">
          <div className="nav-tabs-desktop" style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {tabs.map(({ label, path, icon }) => {
              const active = isActive(path);
              return (
                <button
                  key={path}
                  className={`nav-tab ${active ? "active" : ""}`}
                  onClick={() => router.push(path)}
                >
                  {icon(active)}
                  {label}
                </button>
              );
            })}
          </div>
          <div className="nav-connect">
            <ConnectButton />
          </div>
        </div>
      </nav>

      <div className="mobile-bottom-nav">
        {tabs.map(({ label, path, icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              className={`mob-tab ${active ? "active" : ""}`}
              onClick={() => router.push(path)}
            >
              {icon(active)}
              <span className="mob-tab-label">{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}