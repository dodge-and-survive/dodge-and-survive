"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Nav from "../components/nav";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

export default function HomePage() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Scroll reveal
  useEffect(() => {
    if (!mounted) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = "1";
          (e.target as HTMLElement).style.transform = "translateY(0)";
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [mounted]);

  const handleEnter = async () => {
    if (!isConnected || !address) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${address}`);
      const data = await res.json();
      if (data.user) { router.push("/lobby"); } else { router.push("/register"); }
    } catch { router.push("/register"); }
  };

  return (
    <div style={{ background: "#050505", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "white", overflowX: "hidden" }}>
      <style suppressHydrationWarning>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Bebas+Neue&family=Space+Mono:wght@400;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }

        .beta-banner {
          background: linear-gradient(90deg, #E8FF00, #c8df00);
          color: #000;
          text-align: center;
          padding: 10px 20px;
          font-family: 'Space Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.05em;
          font-weight: 700;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(5,5,5,0.95);
          backdrop-filter: blur(20px);
          position: sticky;
          top: 36px;
          z-index: 99;
        }

        .logo { font-family: 'Bebas Neue', sans-serif; font-size: 1.6rem; letter-spacing: 0.2em; color: #E8FF00; }

        .nav-links { display: flex; gap: 20px; align-items: center; }

        .nav-link {
          font-family: 'Space Mono', monospace;
          font-size: 0.7rem;
          color: #666;
          cursor: pointer;
          background: none;
          border: none;
          letter-spacing: 0.05em;
          transition: color 0.2s;
          text-decoration: none;
        }
        .nav-link:hover { color: #E8FF00; }
        .nav-link-primary {
          font-family: 'Space Mono', monospace;
          font-size: 0.7rem;
          color: #E8FF00;
          cursor: pointer;
          background: rgba(232,255,0,0.08);
          border: 1px solid rgba(232,255,0,0.3);
          padding: 6px 14px;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        }
        .nav-link-primary:hover { background: rgba(232,255,0,0.15); }

        /* HERO */
        .hero {
          min-height: 82vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 20px;
          position: relative;
          overflow: hidden;
        }

        .hero-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,255,0,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 80%, rgba(232,255,0,0.03) 0%, transparent 50%);
        }

        @keyframes gridMove {
          0% { transform: translateY(0); }
          100% { transform: translateY(60px); }
        }

        .hero-grid {
          position: absolute;
          inset: -60px 0 0 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
          animation: gridMove 8s linear infinite;
        }

        .hero-tag {
          font-family: 'Space Mono', monospace;
          font-size: 0.7rem;
          color: #E8FF00;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          margin-bottom: 24px;
          opacity: 0.8;
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .hero-tag::before, .hero-tag::after { content: ''; width: 40px; height: 1px; background: #E8FF00; opacity: 0.5; }

        .hero-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(3rem, 9vw, 7.5rem);
          line-height: 0.9;
          color: white;
          margin-bottom: 32px;
          position: relative;
          letter-spacing: 0.02em;
        }

        .hero-title-survive {
          color: #E8FF00;
          display: block;
          text-shadow: 0 0 60px rgba(232,255,0,0.4), 0 0 120px rgba(232,255,0,0.15);
        }

        .hero-subtitle {
          font-size: clamp(0.95rem, 2vw, 1.1rem);
          color: rgba(255,255,255,0.8);
          max-width: 480px;
          line-height: 1.75;
          margin-bottom: 48px;
          font-weight: 300;
          position: relative;
        }

        .hero-stats {
          display: flex;
          gap: 0;
          margin-bottom: 48px;
          border: 1px solid rgba(255,255,255,0.08);
          position: relative;
        }

        .hero-stat {
          padding: 16px 24px;
          border-right: 1px solid rgba(255,255,255,0.08);
          text-align: center;
        }
        .hero-stat:last-child { border-right: none; }

        .hero-stat-value {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1rem;
          color: #E8FF00;
          line-height: 1;
          margin-bottom: 4px;
          letter-spacing: 0.05em;
        }

        .hero-stat-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.55rem;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(232,255,0,0.3); transform: scale(1); }
          50% { box-shadow: 0 0 50px rgba(232,255,0,0.5); transform: scale(1.02); }
        }

        .btn-primary {
          background: #E8FF00;
          color: #000;
          border: none;
          padding: 18px 56px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.4rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          animation: pulse-glow 3s ease-in-out infinite;
          transition: transform 0.1s;
        }
        .btn-primary:hover { animation: none; transform: translateY(-2px); box-shadow: 0 8px 50px rgba(232,255,0,0.5); }

        .btn-secondary {
          background: transparent;
          color: #666;
          border: 1px solid #333;
          padding: 18px 40px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.4rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover { color: white; border-color: #666; }

        .btn-group { display: flex; gap: 16px; align-items: center; position: relative; }

        /* REVEAL ANIMATION */
        .reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.5s ease, transform 0.5s ease;
        }

        /* SECTIONS */
        .section { padding: 100px 40px; max-width: 1100px; margin: 0 auto; }

        .section-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          color: #E8FF00;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          margin-bottom: 16px;
          opacity: 0.8;
        }

        .section-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(2.5rem, 5vw, 4rem);
          color: white;
          margin-bottom: 60px;
          line-height: 1;
        }

      .steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
.steps-grid > *:nth-child(4) { grid-column: 1; margin-left: calc(50% + 1px); }
.steps-grid > *:nth-child(5) { grid-column: 2; }
@media (max-width: 768px) {
  .ways-grid { display: flex !important; flex-direction: column !important; overflow-x: unset !important; gap: 16px !important; }
  .ways-grid > * { min-width: unset !important; max-width: 100% !important; width: 100% !important; flex-shrink: unset !important; }
}
        .step {
          background: #111;
          border: 1px solid #1a1a1a;
          padding: 40px 28px;
          transition: all 0.3s ease;
        }
        .step:hover {
          border-color: rgba(232,255,0,0.4);
          transform: translateY(-4px);
          box-shadow: 0 8px 30px rgba(232,255,0,0.08), 0 4px 20px rgba(0,0,0,0.4);
          background: #141414;
        }
        .step-num { font-family: 'Bebas Neue', sans-serif; font-size: 4rem; color: rgba(232,255,0,0.15); line-height: 1; margin-bottom: 16px; }
        .step-icon { font-size: 2.5rem; margin-bottom: 16px; }
        .step-title { font-size: 1rem; font-weight: 600; color: rgba(255,255,255,0.95); margin-bottom: 8px; }
        .step-desc { font-size: 0.85rem; color: rgba(255,255,255,0.45); line-height: 1.6; }

        .sub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; }

        .sub-card {
          background: linear-gradient(135deg, #111 0%, #0d0d0d 100%);
          border: 1px solid rgba(232,255,0,0.2);
          padding: 48px;
        }

        .sub-benefits { list-style: none; display: flex; flex-direction: column; gap: 16px; }

        .sub-benefit {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.95rem;
          color: rgba(255,255,255,0.8);
        }
        .sub-benefit::before { content: '→'; color: #E8FF00; font-family: 'Space Mono', monospace; font-size: 0.8rem; flex-shrink: 0; }

        .sub-note {
          margin-top: 24px;
          padding: 16px;
          background: rgba(232,255,0,0.05);
          border-left: 2px solid #E8FF00;
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          color: #E8FF00;
          line-height: 1.6;
          letter-spacing: 0.03em;
        }

        .sub-price { font-family: 'Bebas Neue', sans-serif; font-size: 5rem; color: #E8FF00; line-height: 1; margin-bottom: 8px; text-shadow: 0 0 40px rgba(232,255,0,0.3); }
        .sub-price-label { font-family: 'Space Mono', monospace; font-size: 0.7rem; color: #555; letter-spacing: 0.1em; margin-bottom: 32px; }

        .future-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; margin-top: 48px; }
        .future-card { background: #0f0f0f; border: 1px solid #1a1a1a; border-top: 2px solid rgba(232,255,0,0.3); padding: 36px 24px; text-align: center; transition: transform 0.3s, box-shadow 0.3s, border-top-color 0.3s; cursor: default; }
        .future-card:hover { transform: translateY(-6px); box-shadow: 0 16px 40px rgba(232,255,0,0.07); border-top-color: rgba(232,255,0,0.8); }
        .future-val { font-family: 'Bebas Neue', sans-serif; font-size: 3rem; color: #E8FF00; line-height: 1; margin-bottom: 6px; text-shadow: 0 0 30px rgba(232,255,0,0.2); }
        .future-label { font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #aaa; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
        .future-desc { font-family: 'Space Mono', monospace; font-size: 0.58rem; color: #444; letter-spacing: 0.03em; line-height: 1.5; }

        .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); margin: 0 40px; }

        .footer {
          padding: 60px 40px;
          border-top: 1px solid #111;
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1100px;
          margin: 0 auto;
        }

        .wallet-list { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
        .wallet-tag { font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #444; border: 1px solid #222; padding: 6px 12px; letter-spacing: 0.05em; }
        .powered-by { font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #444; letter-spacing: 0.1em; }
        .powered-by span { color: #E8FF00; }

        @media (max-width: 768px) {
          .nav { padding: 16px 20px; }
          .hero { padding: 60px 20px 80px; min-height: auto; }
          .hero-stats { flex-wrap: wrap; }
          .hero-stat { flex: 1 1 45%; border-bottom: 1px solid rgba(255,255,255,0.08); }
          .btn-group { flex-direction: column; width: 100%; }
          .btn-primary, .btn-secondary { width: 100%; text-align: center; }
          .steps-grid { grid-template-columns: 1fr 1fr; }
          .sub-grid { grid-template-columns: 1fr; }
          .future-grid { grid-template-columns: 1fr 1fr; }
          .footer { flex-direction: column; gap: 24px; text-align: center; }
          .section { padding: 60px 20px; }
          .beta-banner { font-size: 0.6rem; }
        }
.noise-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1000;
          opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 200px 200px;
        }
        .vignette {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 999;
          background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%);
        }
        .btn-primary:hover {
          animation: none !important;
          transform: scale(1.03) translateY(-2px) !important;
          box-shadow: 0 0 30px rgba(232,255,0,0.6), 0 0 60px rgba(232,255,0,0.3) !important;
        }
        @media (max-width: 480px) {
          .steps-grid { grid-template-columns: 1fr; }
          .hero-stat { flex: 1 1 100%; }
          .nav-links { gap: 12px; }
        }
      `}</style>
<div className="noise-overlay" />
      <div className="vignette" />
      {/* Beta Banner */}
      <div className="beta-banner">
🚀 BETA SEASON 1 LIVE — Early players earn bonus XP & future rewards.
      </div>

      {/* Nav */}
      <Nav />

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />

        <div className="hero-tag">BETA SEASON 1 LIVE NOW</div>

        <h1 className="hero-title">
          DODGE &<span className="hero-title-survive">SURVIVE</span>
        </h1>

       <p className="hero-subtitle">
          Play daily challenges to earn XP. Compete in weekly elimination rounds and climb the leaderboard.
        </p>

     <p style={{ fontSize: "0.8rem", letterSpacing: "0.2em", color: "#aaa", marginBottom: "32px", textTransform: "uppercase" }}>
          Play Daily · Earn XP · <span style={{ color: "#d4ff00" }}>Climb Weekly Leaderboard</span> · Win Rewards
        </p>

        <div className="btn-group">
          <ConnectButton.Custom>
            {({ openConnectModal, mounted: m, account, chain }) => {
              const connected = m && account && chain;
              return (
                <button className="btn-primary" onClick={async () => {
                  if (!connected) { openConnectModal(); return; }
                  try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${account.address}`);
                    const data = await res.json();
                    if (data.user) { router.push("/lobby"); } else { router.push("/register"); }
                  } catch { router.push("/register"); }
                }}>
                  ENTER THE ARENA
                </button>
              );
            }}
          </ConnectButton.Custom>
          <button className="btn-secondary" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
            HOW IT WORKS
          </button>
        </div>
      </section>

      <div className="divider" />

      {/* HOW IT WORKS */}
      <section className="section reveal" id="how">
        <div className="section-label">Game Flow</div>
        <div className="section-title">HOW IT WORKS</div>
        <div className="steps-grid">
          {[
            { num: "01", icon: "🎮", title: "Play Daily", desc: "Complete the daily game to earn XP." },
            { num: "02", icon: "⚡", title: "Earn XP", desc: "Your performance determines how much XP you gain." },
            { num: "03", icon: "🎯", title: "Compete Weekly", desc: "Use your entries to join weekly elimination rounds." },
            { num: "04", icon: "📈", title: "Climb Leaderboard", desc: "Earn more XP to move up the weekly rankings." },
            { num: "05", icon: "🏆", title: "Win Rewards", desc: "Finish in the Top 5 to earn bonus rewards." },
          ].map(({ num, icon, title, desc }) => (
            <div key={num} className="step">
              <div className="step-num">{num}</div>
              <div className="step-icon">{icon}</div>
              <div className="step-title">{title}</div>
              <div className="step-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="divider" />
<div className="divider" />

      {/* WAYS TO PLAY */}
      <section className="section reveal">
        <div className="section-label">Player Types</div>
        <div className="section-title">WAYS TO PLAY</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }} className="ways-grid">
          {[
            {
              num: "01", icon: "👁️", title: "Visitor", tag: "FREE", tagColor: "#333", tagText: "#666",
              perks: [ "Play daily game (1 attempt/day)","Earn XP from daily game", "Earn XP from daily spin", "Access leaderboard"],
              note: null,
            },
            {
              num: "02", icon: "🎮", title: "Free Player", tag: "INVITE REQUIRED", tagColor: "rgba(232,255,0,0.08)", tagText: "#E8FF00",
              perks: ["Play daily game (1 attempt/day)", "Earn XP from daily game","Earn XP from daily spin", "Play 1 game per week","Access leaderboard"],
              note: "Access requires an invite code from a subscriber.",
            },
            {
              num: "03", icon: "⭐", title: "Subscriber", tag: "$4.99 / WEEK", tagColor: "rgba(232,255,0,0.12)", tagText: "#E8FF00",
             perks: ["Play daily game (1 attempt/day)","Earn XP from daily game","Earn XP from daily spin", "Play 2 games per week", "2× XP multiplier", "Invite friends with codes", "Eligible for USDT prizes"],
              note: null,
            },
          ].map(({ num, icon, title, tag, tagColor, tagText, perks, note }) => (
            <div key={num} className="step" style={{ display: "flex", flexDirection: "column", padding: "48px 36px" }}>
              <div className="step-num">{num}</div>
              <div className="step-icon">{icon}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <div className="step-title" style={{ marginBottom: 0 }}>{title}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.55rem", background: tagColor, color: tagText, border: `1px solid ${tagText}33`, padding: "3px 8px", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{tag}</div>
              </div>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px", flex: 1 }}>
                {perks.map(p => (
                  <li key={p} style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: "#E8FF00", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", marginTop: "1px", flexShrink: 0 }}>→</span>
                    {p}
                  </li>
                ))}
              </ul>
              {note && (
                <div style={{ marginTop: "20px", padding: "10px 12px", background: "rgba(232,255,0,0.04)", borderLeft: "2px solid rgba(232,255,0,0.3)", fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", color: "#666", lineHeight: 1.6, letterSpacing: "0.02em" }}>
                  {note}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      {/* SUBSCRIBER BENEFITS */}
      <section className="section reveal">
        <div className="section-label">Subscription</div>
        <div className="section-title">SUBSCRIBER BENEFITS</div>
        <div className="sub-grid">
          <div className="sub-card">
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "#E8FF00", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px", opacity: 0.8 }}>
              Early Supporter Rewards
            </div>
            <ul className="sub-benefits">
              {[
                "+500 XP subscriber bonus (one time)",
                "2× XP boost on all XP earnings (daily + weekly)",
                "2 games per week",
                "Invite codes for friends",
                "Eligible for USDT prizes after Beta",
                "Early Supporter badge & status",
              ].map(b => <li key={b} className="sub-benefit">{b}</li>)}
            </ul>
            <div className="sub-note">
              Subscribe during Beta to lock Early Supporter status and earn bonus XP before prizes go live.
            </div>
          </div>
        <div style={{ padding: "20px 0" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "#555", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
              Become an Early Supporter
            </div>
            <div style={{ display: "inline-block", background: "rgba(232,255,0,0.1)", border: "1px solid rgba(232,255,0,0.4)", padding: "4px 12px", fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", color: "#E8FF00", letterSpacing: "0.1em", marginBottom: "16px" }}>
              ⭐ EARLY SUPPORTER BONUS
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "3rem", color: "#E8FF00", lineHeight: 1, marginBottom: "4px", textShadow: "0 0 40px rgba(232,255,0,0.3)" }}>$4.99</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "#555", letterSpacing: "0.05em", marginBottom: "8px" }}>Early Supporter upgrade</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "rgba(232,255,0,0.7)", marginBottom: "32px", letterSpacing: "0.03em" }}>
              Lock Early Supporter status before USDT prizes go live.
            </div>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted: m, account, chain }) => {
                const connected = m && account && chain;
                return (
                  <button className="btn-primary" style={{ fontSize: "1.1rem", padding: "16px 40px", animation: "none" }} onClick={async () => {
                    if (!connected) { openConnectModal(); return; }
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${account.address}`);
                      const data = await res.json();
                    if (data.user) { router.push("/subscribe"); } else { router.push("/register"); }
                    } catch { router.push("/register"); }
                  }}>
                    BECOME EARLY SUPPORTER
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* FUTURE PRIZE MODEL */}
      <section className="section reveal">
        <div className="section-label">After Beta</div>
        <div className="section-title">FUTURE PRIZE MODEL</div>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.95rem", maxWidth: "560px", lineHeight: 1.7 }}>
          After Beta ends, subscribers compete for weekly USDT rewards. The top 5 survivors of each game split the prize pool.
        </p>
        <div className="future-grid">
          {[
            { val: "$4.99", label: "Subscription", desc: "One-time subscriber fee" },
            { val: "2", label: "Games / Week", desc: "Friday & Sunday UTC" },
            { val: "5", label: "Final Survivors", desc: "Per game winners" },
            { val: "USDT", label: "Prize Currency", desc: "Split among survivors" },
       ].map(({ val, label, desc }) => (
            <div key={label} className="future-card">
              <div className="future-val">{val}</div>
              <div className="future-label">{label}</div>
              <div className="future-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="divider" />

    </div>
  );
}
