"use client";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Nav from "../../components/nav";
import { parseUnits } from "viem";
import { base } from "wagmi/chains";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
const SUBSCRIPTION_FEE = parseUnits("6.99", 6);
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const USDC_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const CONTRACT_ABI = [
  { name: "subscribe", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "isSubscribed", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

export default function LobbyPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "approving" | "subscribing" | "done">("idle");
  const [error, setError] = useState("");
  const [xp, setXp] = useState(0);
  const [tier, setTier] = useState("BRONZE");
  const [dailyAttemptUsed, setDailyAttemptUsed] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<"loading" | "playable" | "played_not_claimed" | "claimed">("loading");
  const [countdown, setCountdown] = useState("00:00:00");
  const [userType, setUserType] = useState<"visitor" | "free" | "subscriber" | null>(null);

 useEffect(() => { if (isConnected === false) { const t = setTimeout(() => { if (!isConnected) router.push("/"); }, 3000); return () => clearTimeout(t); } }, [isConnected]);
useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/api/daily-game/status/${address}`)
      .then(r => r.json())
      .then(data => {
        if (!data.hasPlayed) setDailyStatus("playable");
        else if (data.hasPlayed && !data.hasClaimed) setDailyStatus("played_not_claimed");
        else setDailyStatus("claimed");
        setDailyAttemptUsed(data.hasPlayed);
      })
      .catch(() => {});

  }, [address]);


  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date();
      next.setUTCHours(20, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/api/profile/${address}`)
      .then(r => r.json())
      .then(data => {
        if (data.user) { setXp(data.user.xp || 0); setTier((data.user.xpTier || "bronze").toUpperCase()); setUserType(data.user.userType || "visitor"); }
        else router.push("/register");
      });
  }, [address]);

  const { data: usdcBal } = useReadContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId: base.id });
  const { data: isSubscribed } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "isSubscribed", args: address ? [address] : undefined, chainId: base.id });
  const { writeContract: approve, data: approveTxHash } = useWriteContract();
  const { writeContract: subscribe, data: subscribeTxHash } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: subscribeSuccess } = useWaitForTransactionReceipt({ hash: subscribeTxHash });

  useEffect(() => {
    if (approveSuccess && step === "approving") {
      setStep("subscribing");
      subscribe({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "subscribe", chainId: base.id, chain: undefined, account: "" as `0x${string}` as `0x${string}` });
    }
  }, [approveSuccess]);

  useEffect(() => {
    if (subscribeSuccess && step === "subscribing") {
      setStep("done");
      fetch(`${API_URL}/api/on-subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: address }) });
    }
  }, [subscribeSuccess]);

  const handleSubscribe = () => {
    if (!address) return;
    setError(""); setStep("approving");
    approve({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve", args: [CONTRACT_ADDRESS, SUBSCRIPTION_FEE], chainId: base.id, chain: undefined, account: "" as `0x${string}` });
  };

  const subscribed = isSubscribed || step === "done";
  const subButtonText = { idle: "SUBSCRIBE — $6.99 USDC / WEEK", approving: "APPROVING USDC...", subscribing: "SUBSCRIBING...", done: "✓ SUBSCRIBED" }[step];
  const usdcDisplay = usdcBal ? (Number(usdcBal) / 1e6).toFixed(2) : "0.00";

  const card: React.CSSProperties = { background: "#111", border: "1px solid #1e1e1e", padding: "28px", marginBottom: "16px", transition: "border-color 0.2s, box-shadow 0.2s" };
  const L: React.CSSProperties = { fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555", textTransform: "uppercase" as const, letterSpacing: "0.15em", marginBottom: "4px" };

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      <style suppressHydrationWarning>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');`}</style>
      <Nav />

      <style suppressHydrationWarning>{`
        @media(min-width: 900px) {
          .lobby-wrap { max-width: 1100px !important; }
          .weekly-card { display: grid !important; grid-template-columns: 60% 40%; gap: 32px; align-items: start; }
          .weekly-left { width: 100%; }
          .weekly-right { width: 100%; }
          .weekly-title { font-size: 2.4rem !important; }
          .weekly-desc { font-size: 0.72rem !important; }
          .weekly-round-label { font-size: 1rem !important; }
          .weekly-round-sub { font-size: 0.55rem !important; }
          .weekly-access-box { font-size: 0.65rem !important; padding: 14px !important; }
          .weekly-btn { font-size: 1.2rem !important; padding: 16px !important; }
        }
      `}</style>
      <div className="lobby-wrap" style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "3.5rem", color: "white", marginBottom: "4px", textShadow: "0 0 40px rgba(232,255,0,0.15)" }}>LOBBY</div>
        <div style={{ width: "48px", height: "3px", background: "#E8FF00", marginBottom: "24px", boxShadow: "0 0 12px rgba(232,255,0,0.5)" }} />

        {/* Quick stats */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[
            { label: "XP", val: xp.toLocaleString(), color: "#E8FF00" },
            { label: "Tier", val: tier, color: "#00FF88" },
            { label: "USDC", val: `$${usdcDisplay}`, color: "#00FF88" },
            { label: "Status", val: subscribed ? "SUBSCRIBED" : "FREE", color: subscribed ? "#00FF88" : "#FF3333" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ flex: 1, background: "#111", border: "1px solid #1a1a1a", padding: "12px 10px", textAlign: "center" }}>
              <div style={L}>{label}</div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── DAILY GAME CARD ── */}
        <div style={{ background: "#080812", border: "2px solid rgba(0,255,180,0.3)", padding: "32px 28px", marginBottom: "16px", boxShadow: "0 0 32px rgba(0,255,180,0.08), inset 0 0 32px rgba(0,255,180,0.02)", position: "relative" }}>
          {/* Attempts badge */}
          <div style={{ position: "absolute", top: "16px", right: "16px", fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: dailyAttemptUsed ? "#FF3333" : "#00FF88", background: dailyAttemptUsed ? "rgba(255,51,51,0.08)" : "rgba(0,255,136,0.08)", border: `1px solid ${dailyAttemptUsed ? "rgba(255,51,51,0.2)" : "rgba(0,255,136,0.2)"}`, padding: "4px 10px" }}>
            {dailyStatus === "playable" ? "1 / 1 LEFT" : dailyStatus === "played_not_claimed" ? "CLAIM XP" : "0 / 1 LEFT"}
          </div>

          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(0,255,180,0.5)", letterSpacing: "4px", marginBottom: "8px" }}>DAILY CHALLENGE</div>
          <div style={{ fontFamily: "Orbitron, monospace", fontSize: "clamp(1.6rem,4vw,2.2rem)", fontWeight: 900, color: "#00ffb3", letterSpacing: "4px", lineHeight: 1, marginBottom: "6px" }}>DODGE NODES</div>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(0,255,180,0.35)", letterSpacing: "2px", marginBottom: "28px" }}>30 seconds • Dodge enemies • Earn XP</div>

          <div style={{ display: "flex", gap: "16px", marginBottom: "28px" }}>
            {[
              { icon: "◉", label: "Dodge Nodes" },
              { icon: "◆", label: "Collect Tokens" },
              { icon: "⬡", label: "Claim XP" },
            ].map(({ icon, label }) => (
              <div key={label} style={{ flex: 1, textAlign: "center", padding: "10px", background: "rgba(0,255,180,0.03)", border: "1px solid rgba(0,255,180,0.08)" }}>
                <div style={{ fontSize: "1.2rem", color: "#00ffb3", marginBottom: "4px" }}>{icon}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(0,255,180,0.4)", letterSpacing: "1px" }}>{label}</div>
              </div>
            ))}
          </div>

       {dailyStatus === "loading" && (
            <div style={{ textAlign: "center", padding: "18px" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555" }}>Checking status...</div>
            </div>
          )}
          {dailyStatus === "playable" && (
            <button onClick={() => router.push("/game/dodge-nodes")}s
              style={{ width: "100%", background: "#00ffb3", color: "#020408", border: "none", padding: "18px", fontFamily: "Orbitron, monospace", fontSize: "1rem", fontWeight: 900, letterSpacing: "5px", cursor: "pointer", clipPath: "polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)", boxShadow: "0 0 24px rgba(0,255,180,0.35)" }}>
              ▶ PLAY NOW
            </button>
          )}
          {dailyStatus === "played_not_claimed" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#00ffb3", marginBottom: "12px" }}>You played today — claim your XP!</div>
              <button onClick={() => router.push("/game/dodge-nodes?claim=true")}
                style={{ width: "100%", background: "transparent", color: "#00ffb3", border: "2px solid #00ffb3", padding: "16px", fontFamily: "Orbitron, monospace", fontSize: "0.9rem", fontWeight: 900, letterSpacing: "3px", cursor: "pointer", boxShadow: "0 0 16px rgba(0,255,180,0.2)" }}>
                CLAIM XP →
              </button>
            </div>
          )}
          {dailyStatus === "claimed" && (
            <div style={{ textAlign: "center", padding: "18px", background: "rgba(0,0,0,0.3)", border: "1px solid #1a1a1a" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555" }}>✓ XP claimed. Resets in 20h.</div>
            </div>
          )}
        </div>

     {/* ── WEEKLY GAME CARD ── */}
        <div style={{ ...card, borderColor: "rgba(232,255,0,0.25)", boxShadow: "0 0 20px rgba(232,255,0,0.05)" }}>
          <div className="weekly-card">

            {/* LEFT — title + rounds */}
            <div className="weekly-left">
              <div style={L}>Weekly Elimination Game</div>
              <div className="weekly-title" style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.6rem", color: "#E8FF00", lineHeight: 1, marginBottom: "6px" }}>WEEKLY ARENA (COMING SOON)</div>
              <div className="weekly-desc" style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555", marginBottom: "20px" }}>Survive 5 rounds. Compete with all players. Top 5 earn bonus rewards.</div>

              <div style={{ display: "flex", gap: "8px" }}>
                {[{ n: 1, name: "Split" }, { n: 2, name: "Memory" }, { n: 3, name: "Timing" }, { n: 4, name: "BTC" }, { n: 5, name: "Reaction" }].map(({ n, name }) => (
                  <div key={n} style={{ flex: 1, background: "#0a0a0a", border: "1px solid #1a1a1a", padding: "8px 4px", textAlign: "center" }}>
                    <div className="weekly-round-label" style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "0.75rem", color: "#E8FF00", lineHeight: 1 }}>Round {n}</div>
                    <div className="weekly-round-sub" style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "#555", marginTop: "2px" }}>{name}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — access info + button */}
            <div className="weekly-right">
              {error && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#FF3333", marginBottom: "10px", padding: "8px", background: "#1a0000", border: "1px solid #330000" }}>{error}</div>}

              <div className="weekly-access-box" style={{ marginBottom: "16px", marginTop: "16px", padding: "10px 12px", background: "rgba(232,255,0,0.03)", border: "1px solid rgba(232,255,0,0.12)", fontFamily: "Space Mono, monospace", fontSize: "0.52rem", color: "#888" }}>
                {userType === "subscriber" && "⭐ 2 Weekly Entries Available"}
                {userType === "free" && "🔓 1 Weekly Entry via Referral"}
                {(userType === "visitor" || userType === null) && "🔒 No Weekly Access Yet"}
              </div>

            {userType === "subscriber" && (
                <button disabled className="weekly-btn" style={{ width: "100%", background: "rgba(232,255,0,0.08)", color: "#E8FF00", border: "1px solid rgba(232,255,0,0.3)", padding: "14px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", letterSpacing: "0.06em", cursor: "not-allowed" }}>
                  🚀 2 WEEKLY ENTRIES – STARTS SOON
                </button>
              )}
              {userType === "free" && (
                <button disabled className="weekly-btn" style={{ width: "100%", background: "rgba(232,255,0,0.04)", color: "#E8FF00", border: "1px solid rgba(232,255,0,0.2)", padding: "14px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", letterSpacing: "0.06em", cursor: "not-allowed", opacity: 0.8 }}>
                  🎟 1 WEEKLY ENTRY – STARTS SOON
                </button>
              )}
              {(userType === "visitor" || userType === null) && (
                <button disabled className="weekly-btn" style={{ width: "100%", background: "#111", color: "#555", border: "1px solid #2a2a2a", padding: "14px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", letterSpacing: "0.06em", cursor: "not-allowed" }}>
                  🔒 NO ACCESS YET
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}