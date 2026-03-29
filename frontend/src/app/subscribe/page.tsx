"use client";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseUnits } from "viem";
import { base } from "wagmi/chains";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";

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

export default function SubscribePage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "approving" | "subscribing" | "done">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [backendSubscribed, setBackendSubscribed] = useState(false);

 useEffect(() => { if (!isConnected) router.push("/"); }, [isConnected]);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/api/user/${address}`)
      .then(r => r.json())
      .then(data => { if (data?.isSubscribed) setBackendSubscribed(true); })
      .catch(() => {});
  }, [address]);

  const { data: usdcBal } = useReadContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: address ? [address] : undefined,chainId: base.id, account: "" as `0x${string}` });
  const { data: isSubscribed } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "isSubscribed", args: address ? [address] : undefined, chainId: base.id, account: "" as `0x${string}` });
  const { writeContract: approve, data: approveTxHash } = useWriteContract();
  const { writeContract: subscribe, data: subscribeTxHash } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: subscribeSuccess } = useWaitForTransactionReceipt({ hash: subscribeTxHash });

  useEffect(() => {
    if (approveSuccess && step === "approving") {
      setStep("subscribing");
      subscribe({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "subscribe", chainId: base.id, chain: base, account: "" as `0x${string}` });
    }
  }, [approveSuccess]);

  useEffect(() => {
    if (subscribeSuccess && step === "subscribing") {
      setStep("done");
      fetch(`${API_URL}/api/on-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      }).then(() => {
        setSuccess(true);
        setTimeout(() => router.push("/account"), 3000);
      });
    }
  }, [subscribeSuccess]);

  const handlePay = () => {
    if (!address) return;
    setError("");
    const usdcBalance = usdcBal ? Number(usdcBal) / 1e6 : 0;
   if (usdcBalance < 4.99) {
      setError(`Insufficient USDC. You have $${usdcBalance.toFixed(2)} but need $4.99.`);
      return;
    }
    setStep("approving");
approve({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve", args: [CONTRACT_ADDRESS, SUBSCRIPTION_FEE], chainId: base.id, chain: base, account: "" as `0x${string}` });
  };

  const usdcDisplay = usdcBal ? (Number(usdcBal) / 1e6).toFixed(2) : "0.00";
  const alreadySubscribed = isSubscribed || backendSubscribed || step === "done";

  const benefits = [
    { icon: "🎮", title: "2 Games Per Week", desc: "Play 2 elimination games every week" },
    { icon: "⚡", title: "2x XP Boost", desc: "Earn 2x XP on all earnings (daily + weekly)" },
    { icon: "🎁", title: "+500 XP Beta Bonus", desc: "Instant +500 XP bonus on upgrade" },
    { icon: "🔗", title: "Referral Rewards", desc: "Earn XP when friends join & subscribe" },
    { icon: "💰", title: "USDT Prize Eligibility", desc: "Win real rewards after Beta ends" },
    { icon: "🏅", title: "Early Supporter Badge", desc: "Get exclusive badge + profile status" },
  ];

  return (
    <div suppressHydrationWarning style={{ background: "#0A0A0A", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      <style suppressHydrationWarning>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glowPulse { 0%,100%{box-shadow:0 0 20px rgba(232,255,0,0.2)} 50%{box-shadow:0 0 40px rgba(232,255,0,0.5)} }
        @keyframes badgePulse { 0%,100%{box-shadow:0 0 8px rgba(232,255,0,0.4)} 50%{box-shadow:0 0 20px rgba(232,255,0,0.8)} }
        .pay-btn:hover { transform: scale(1.03) !important; box-shadow: 0 8px 40px rgba(232,255,0,0.5) !important; }
        .benefit-row:hover { border-color: rgba(232,255,0,0.2) !important; background: #141414 !important; }
        @media(max-width:768px) {
          .sub-grid { grid-template-columns: 1fr !important; }
          .sub-wrap { padding: 24px 16px !important; }
        }
      `}</style>

      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", letterSpacing: "0.2em", color: "#E8FF00", cursor: "pointer" }} onClick={() => router.push("/")}>STAKE & SURVIVE</div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <button onClick={() => router.push("/lobby")} style={{ background: "transparent", color: "#666", border: "none", cursor: "pointer", fontFamily: "Space Mono, monospace", fontSize: "0.7rem" }}>← BACK</button>
          <ConnectButton />
        </div>
      </nav>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "60px 32px" }} className="sub-wrap">

        {success ? (
          <div style={{ textAlign: "center", animation: "fadeInUp 0.5s ease" }}>
            <div style={{ fontSize: "4rem", marginBottom: "20px" }}>🎉</div>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "3rem", color: "#E8FF00", marginBottom: "8px" }}>WELCOME!</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "#00FF88", marginBottom: "8px" }}>You are now an Early Supporter</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#555" }}>Redirecting to your account...</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: "48px", animation: "fadeInUp 0.4s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#E8FF00", letterSpacing: "0.3em", textTransform: "uppercase" as const, opacity: 0.8 }}>⭐ BETA EARLY SUPPORTER</div>
                <div style={{ padding: "3px 10px", background: "rgba(232,255,0,0.1)", border: "1px solid rgba(232,255,0,0.4)", borderRadius: "2px", fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#E8FF00", letterSpacing: "0.15em", animation: "badgePulse 2.5s ease-in-out infinite" }}>LIMITED ACCESS</div>
              </div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "clamp(2.5rem,5vw,4rem)", color: "white", lineHeight: 1, marginBottom: "8px" }}>BECOME A <span style={{ color: "#E8FF00" }}>SUBSCRIBER</span></div>
              <div style={{ width: "48px", height: "2px", background: "#E8FF00" }} />
            </div>

            {/* 2-column grid */}
            <div className="sub-grid" style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: "32px", alignItems: "start" }}>

              {/* LEFT — Benefits */}
              <div style={{ animation: "fadeInUp 0.5s ease" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", letterSpacing: "0.2em", textTransform: "uppercase" as const, marginBottom: "16px" }}>WHAT YOU GET</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {benefits.map(({ icon, title, desc }) => (
                    <div key={title} className="benefit-row" style={{ display: "flex", alignItems: "center", gap: "16px", background: "#0f0f0f", border: "1px solid #1a1a1a", padding: "16px", transition: "all 0.2s" }}>
                      <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>{icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "white", letterSpacing: "0.05em" }}>{title}</div>
                        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginTop: "2px" }}>{desc}</div>
                      </div>
                      <span style={{ color: "#E8FF00", fontSize: "0.9rem", flexShrink: 0 }}>✓</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT — Pricing + CTA */}
              <div style={{ animation: "fadeInUp 0.6s ease", position: "sticky" as const, top: "24px" }}>
                <div style={{ background: "#0f0f0f", border: "1px solid rgba(232,255,0,0.3)", padding: "32px", boxShadow: "0 0 40px rgba(232,255,0,0.05)" }}>

                  {/* Most Popular tag */}
                  <div style={{ display: "inline-block", background: "#E8FF00", color: "#000", padding: "4px 12px", fontFamily: "Space Mono, monospace", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.15em", marginBottom: "20px" }}>
                    ★ MOST POPULAR
                  </div>

                  {/* Price */}
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555", textTransform: "uppercase" as const, marginBottom: "4px" }}>Subscription Fee</div>
<div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "4rem", color: "#E8FF00", lineHeight: 1, textShadow: "0 0 30px rgba(232,255,0,0.3)" }}>$4.99</div>
<div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555", marginTop: "4px" }}>One-time · Base Mainnet · USDC</div>
                  </div>

                  {/* Limited beta note */}
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(232,255,0,0.6)", marginBottom: "20px", padding: "8px 12px", background: "rgba(232,255,0,0.04)", borderLeft: "2px solid rgba(232,255,0,0.3)" }}>
                    Limited Beta Access — Early supporters get permanent benefits
                  </div>

                  {/* Balance */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", padding: "12px", background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555" }}>Your USDC Balance</div>
                    <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: Number(usdcDisplay) >= 6.99 ? "#00FF88" : "#FF3333" }}>${usdcDisplay}</div>
                  </div>

                  {error && (
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#FF3333", padding: "10px 12px", background: "#1a0000", border: "1px solid #330000", marginBottom: "16px" }}>
                      {error}
                    </div>
                  )}

                  {alreadySubscribed ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <button disabled style={{
                        width: "100%",
                        background: "transparent",
                        color: "#00FF88",
                        border: "1px solid rgba(0,255,136,0.4)",
                        padding: "18px",
                        fontFamily: "Bebas Neue, sans-serif",
                        fontSize: "1.3rem",
                        letterSpacing: "0.1em",
                        cursor: "not-allowed",
                        opacity: 0.75,
                      }}>
                        ✓ EARLY SUPPORTER ACTIVE
                      </button>
                      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555", textAlign: "center" }}>
                        You already have access to all benefits
                      </div>
                    </div>
                  ) : (
                    <button className="pay-btn" onClick={handlePay} disabled={step !== "idle"} style={{
                      width: "100%",
                      background: step !== "idle" ? "#1a1a00" : "#E8FF00",
                      color: step !== "idle" ? "#E8FF00" : "#000",
                      border: step !== "idle" ? "1px solid #E8FF00" : "none",
                      padding: "18px",
                      fontFamily: "Bebas Neue, sans-serif",
                      fontSize: "1.3rem",
                      letterSpacing: "0.1em",
                      cursor: step !== "idle" ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                      animation: step === "idle" ? "glowPulse 2s ease-in-out infinite" : "none",
                    }}>
                      {step === "idle" && "BECOME EARLY SUPPORTER"}
                      {step === "approving" && "APPROVING USDC..."}
                      {step === "subscribing" && "CONFIRMING..."}
                      {step === "done" && "✓ DONE"}
                    </button>
                  )}
<div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#333", textAlign: "center", marginTop: "12px" }}>
                    Requires USDC on Base Mainnet
                  </div>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}