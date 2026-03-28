"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import Nav from "../../components/nav";
import { base } from "wagmi/chains";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const CONTRACT_ABI = [
  {
    name: "setWeeklyReward",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "xpAmount", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32", silver: "#aaa", gold: "#FFD700", diamond: "#00FFFF",
};

const WEEKLY_REWARDS = [120, 100, 80, 60, 40];
const MONTHLY_REWARDS = [500, 300, 200, 150, 100];

type WeekStatus = "active" | "locked" | "finalized";

export default function LeaderboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [tab, setTab] = useState<"weekly" | "monthly" | "alltime" | "wins">("weekly");
  const [topXP, setTopXP] = useState<any[]>([]);
  const [topWeekly, setTopWeekly] = useState<any[]>([]);
  const [topWins, setTopWins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myWeeklyXp, setMyWeeklyXp] = useState(0);
  const [xpToTop5, setXpToTop5] = useState<number | null>(null);
  const [countdown, setCountdown] = useState("");

  const [weekStatus, setWeekStatus] = useState<WeekStatus>("active");
  const [weekEnd, setWeekEnd] = useState<Date | null>(null);
  const [claimableUntil, setClaimableUntil] = useState<Date | null>(null);

  const [myReward, setMyReward] = useState<any>(null);
  const [claimStep, setClaimStep] = useState<"idle" | "preparing" | "confirming" | "done" | "error">("idle");
  const [claimError, setClaimError] = useState("");

  const { writeContract, data: txHash, error: writeError } = useWriteContract();
  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!txSuccess || !txHash || claimStep !== "confirming" || !myReward) return;
    const confirm = async () => {
      try {
        const res = await fetch(`${API_URL}/api/weekly-reward/claim-confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address, weekId: myReward.weekId, txHash }),
        });
        const data = await res.json();
        if (data.success) { setClaimStep("done"); setMyReward((p: any) => ({ ...p, rewardClaimed: true })); }
        else { setClaimError(data.error || "Failed"); setClaimStep("error"); }
      } catch { setClaimError("Network error"); setClaimStep("error"); }
    };
    confirm();
  }, [txSuccess, txHash]);

  useEffect(() => {
    if (writeError) { setClaimError(writeError.message.slice(0, 100)); setClaimStep("error"); }
  }, [writeError]);

  useEffect(() => {
    const tick = () => {
      const target = weekStatus === "finalized" && claimableUntil ? claimableUntil : weekEnd;
      if (!target) return;
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { setCountdown("00:00:00"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setCountdown(`${d}d ${h}h ${m}m`);
      else setCountdown(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [weekEnd, claimableUntil, weekStatus]);

  useEffect(() => {
    fetch(`${API_URL}/api/leaderboard`)
      .then(r => r.json())
      .then(data => { setTopXP(data.topXP || []); setTopWeekly(data.topWeekly || []); setTopWins(data.topWins || []); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`${API_URL}/api/weekly-status`)
      .then(r => r.json())
      .then(data => {
        setWeekStatus(data.status || "active");
        if (data.weekEnd) setWeekEnd(new Date(data.weekEnd));
        if (data.claimableUntil) setClaimableUntil(new Date(data.claimableUntil));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/api/leaderboard/rank/${address}`)
      .then(r => r.json())
      .then(data => { setMyRank(data.rank); setMyWeeklyXp(data.weeklyXp || 0); setXpToTop5(data.xpToTop5); });

    fetch(`${API_URL}/api/weekly-reward/my-status/${address}`)
      .then(r => r.json())
      .then(data => {
        setMyReward(data.reward || null);
        if (data.reward?.rewardClaimed) setClaimStep("done");
      });
  }, [address]);

  const claimReward = async () => {
    if (!address || !myReward || claimStep !== "idle") return;
    setClaimStep("preparing");
    setClaimError("");
    try {
      const res = await fetch(`${API_URL}/api/weekly-reward/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, xpAmount: myReward.xpReward }),
      });
      const data = await res.json();
      if (!data.success) { setClaimError(data.error || "Failed"); setClaimStep("error"); return; }
      setClaimStep("confirming");
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "setWeeklyReward",
        args: [address, BigInt(myReward.xpReward), data.signature as `0x${string}`],
        chainId: base.id,
        chain: undefined,
        account: "" as `0x${string}`,
      });
    } catch { setClaimError("Failed to prepare claim"); setClaimStep("error"); }
  };

  const claimLabel = () => {
    if (claimStep === "preparing") return "PREPARING...";
    if (claimStep === "confirming" && txLoading) return "CONFIRM IN WALLET...";
    if (claimStep === "confirming" && !txLoading) return "WAITING FOR TX...";
    if (claimStep === "done") return `✓ CLAIMED`;
    if (claimStep === "error") return "RETRY";
    return `CLAIM +${myReward?.xpReward} XP`;
  };

  const getList = () => {
    if (tab === "weekly" || tab === "monthly") return topWeekly;
    if (tab === "alltime") return topXP;
    return topWins;
  };

  const list = getList();
  const getMedal = (i: number) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
  const isMe = (player: any) => address && player.walletAddress?.toLowerCase() === address.toLowerCase();
  const rewards = tab === "monthly" ? MONTHLY_REWARDS : WEEKLY_REWARDS;

  const statusBanner = () => {
    if (weekStatus === "active") return {
      bg: "rgba(232,255,0,0.03)", border: "rgba(232,255,0,0.15)", color: "#E8FF00",
      icon: "⏱", label: "WEEK ACTIVE", sub: `Ends in ${countdown}`, sub2: "Finish Top 5 to earn rewards"
    };
    if (weekStatus === "locked") return {
      bg: "rgba(255,165,0,0.06)", border: "rgba(255,165,0,0.3)", color: "#FFA500",
      icon: "🔒", label: "RESULTS BEING CALCULATED", sub: "Finalizing top 5...", sub2: "Check back in a few minutes"
    };
    return {
      bg: "rgba(0,255,136,0.04)", border: "rgba(0,255,136,0.3)", color: "#00FF88",
      icon: "🏆", label: "FINAL RESULTS", sub: claimableUntil ? `Claim within: ${countdown}` : "Claim your reward", sub2: "Rewards available for Top 5"
    };
  };

  const banner = statusBanner();

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      <style suppressHydrationWarning>{`
        @media (max-width: 768px) {
          .lb-wrap { padding: 20px 16px !important; }
          .lb-title { font-size: 2.5rem !important; }
          .top5-grid { grid-template-columns: 1fr 1fr !important; }
          .my-rank-grid { grid-template-columns: 1fr 1fr !important; }
          .player-row { padding: 10px 12px !important; gap: 8px !important; }
          .player-xp-label { display: none !important; }
          .tab-wrap { gap: 4px !important; flex-wrap: wrap !important; }
          .tab-btn { font-size: 0.65rem !important; padding: 8px 6px !important; }
        }
        @keyframes rewardGlow { 0%,100%{box-shadow:0 0 8px rgba(232,255,0,0.2)} 50%{box-shadow:0 0 20px rgba(232,255,0,0.4)} }
      `}</style>

      <Nav />

      <div className="lb-wrap" style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: "24px" }}>
          <div className="lb-title" style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "3.5rem", color: "white", lineHeight: 1, marginBottom: "4px" }}>LEADERBOARD</div>
          <div style={{ width: "48px", height: "2px", background: "#E8FF00", marginBottom: "16px" }} />
        </div>

        <div style={{ background: banner.bg, border: `1px solid ${banner.border}`, padding: "16px 20px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: banner.color, letterSpacing: "0.08em", marginBottom: "4px" }}>
              {banner.icon} {banner.label}
            </div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555" }}>{banner.sub}</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#444", marginTop: "2px" }}>{banner.sub2}</div>
          </div>
          {weekStatus === "active" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "1.6rem", fontWeight: 700, color: "#E8FF00", letterSpacing: "2px" }}>{countdown}</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555" }}>UNTIL WEEK ENDS</div>
            </div>
          )}
          {weekStatus === "finalized" && claimableUntil && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#FF6B6B", marginBottom: "2px" }}>⚠ Claim expires in</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "1.4rem", fontWeight: 700, color: "#FF6B6B" }}>{countdown}</div>
            </div>
          )}
        </div>

        {weekStatus === "finalized" && myReward && !myReward.rewardClaimed && claimStep !== "done" && (
          <div style={{ background: "rgba(232,255,0,0.05)", border: "2px solid rgba(232,255,0,0.5)", padding: "20px 24px", marginBottom: "20px", animation: "rewardGlow 2s ease infinite" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", color: "#E8FF00", letterSpacing: "0.08em", marginBottom: "4px" }}>
                  🏆 YOU FINISHED #{myReward.rank} THIS WEEK
                </div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555" }}>
                  Reward: <span style={{ color: "#E8FF00" }}>+{myReward.xpReward} XP</span> · Claim within 24h
                </div>
                {claimError && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#FF3333", marginTop: "6px" }}>{claimError}</div>}
              </div>
              <button onClick={claimStep === "idle" || claimStep === "error" ? claimReward : undefined}
                disabled={claimStep === "preparing" || claimStep === "confirming"}
                style={{ background: "#E8FF00", color: "#000", border: "none", padding: "14px 32px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", letterSpacing: "0.06em", cursor: claimStep !== "idle" && claimStep !== "error" ? "not-allowed" : "pointer", opacity: claimStep === "preparing" || claimStep === "confirming" ? 0.7 : 1, clipPath: "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)", minWidth: "180px", textAlign: "center" }}>
                {claimLabel()}
              </button>
            </div>
            {txHash && claimStep === "confirming" && (
              <div style={{ marginTop: "8px", fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(232,255,0,0.4)" }}>
                TX: <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: "#E8FF00" }}>{txHash.slice(0, 24)}...</a>
              </div>
            )}
          </div>
        )}

        {claimStep === "done" && (
          <div style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.3)", padding: "14px 20px", marginBottom: "20px", fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#00FF88" }}>
            ✓ Reward claimed! +{myReward?.xpReward} XP added to your account.
          </div>
        )}

        {address && (
          <div style={{ background: "#111", border: "1px solid rgba(232,255,0,0.2)", borderLeft: "3px solid #E8FF00", padding: "18px 20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "0.85rem", color: "#555", letterSpacing: "0.1em" }}>YOUR STANDING</div>
              <button onClick={() => router.push("/lobby")}
                style={{ background: "#E8FF00", color: "#000", border: "none", padding: "6px 16px", fontFamily: "Bebas Neue, sans-serif", fontSize: "0.85rem", letterSpacing: "0.06em", cursor: "pointer" }}>
                ▶ PLAY NOW
              </button>
            </div>
            <div className="my-rank-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", padding: "12px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginBottom: "4px" }}>WEEKLY RANK</div>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.2rem", color: myRank && myRank <= 5 ? "#E8FF00" : "white", lineHeight: 1 }}>{myRank ? `#${myRank}` : "—"}</div>
              </div>
              <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", padding: "12px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginBottom: "4px" }}>WEEKLY XP</div>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.2rem", color: "#E8FF00", lineHeight: 1 }}>{myWeeklyXp.toLocaleString()}</div>
              </div>
              <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", padding: "12px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginBottom: "4px" }}>TO TOP 5</div>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: xpToTop5 === 0 ? "1.2rem" : "2.2rem", color: xpToTop5 === 0 ? "#00FF88" : "#FF6B6B", lineHeight: 1 }}>
                  {xpToTop5 === null ? "—" : xpToTop5 === 0 ? "IN TOP 5!" : `${xpToTop5} XP`}
                </div>
              </div>
            </div>
            {xpToTop5 !== null && xpToTop5 > 0 && weekStatus === "active" && (
              <div style={{ marginTop: "10px", fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
                💡 Need <span style={{ color: "#E8FF00" }}>{xpToTop5} more XP</span> to reach Top 5 and earn rewards this week
              </div>
            )}
          </div>
        )}

        {(tab === "weekly" || tab === "monthly") && (
          <div style={{ background: "#0f0f0f", border: "1px solid rgba(232,255,0,0.12)", padding: "14px 18px", marginBottom: "20px" }}>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "0.8rem", color: "#E8FF00", letterSpacing: "0.1em", marginBottom: "10px" }}>
              🔥 REWARD ZONE — TOP 5 ONLY
            </div>
            <div className="top5-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
              {rewards.map((xp, i) => (
                <div key={i} style={{ background: "#0a0a0a", border: `1px solid ${i < 3 ? "rgba(232,255,0,0.15)" : "#1a1a1a"}`, padding: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: i < 3 ? "1.2rem" : "0.9rem", marginBottom: "3px" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}th`}</div>
                  <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "#E8FF00" }}>+{xp} XP</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555", marginTop: "8px" }}>
              No 2x multiplier on rewards. Fixed XP. Only Top 5 earn rewards each week.
            </div>
          </div>
        )}

        <div className="tab-wrap" style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          {[{ key: "weekly", label: "WEEKLY XP" }, { key: "monthly", label: "MONTHLY XP" }, { key: "alltime", label: "ALL TIME" }, { key: "wins", label: "WIN RANKINGS" }].map(({ key, label }) => (
            <button key={key} className="tab-btn" onClick={() => setTab(key as any)}
              style={{ flex: 1, padding: "10px", fontFamily: "Bebas Neue, sans-serif", fontSize: "0.9rem", letterSpacing: "0.06em", border: "1px solid", borderColor: tab === key ? "#E8FF00" : "#222", background: tab === key ? "rgba(232,255,0,0.08)" : "#111", color: tab === key ? "#E8FF00" : "#555", cursor: "pointer", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "monthly" && (
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", padding: "8px 12px", background: "#0a0a0a", border: "1px solid #1a1a1a", marginBottom: "14px" }}>
            Monthly leaderboard tracks cumulative XP earned this month. Resets on the 1st.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", fontFamily: "Bebas Neue, sans-serif", fontSize: "2rem", color: "#333" }}>LOADING...</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "#555" }}>No players yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {(tab === "weekly" || tab === "monthly") && list.length > 0 && (
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#E8FF00", padding: "6px 12px", background: "rgba(232,255,0,0.04)", border: "1px solid rgba(232,255,0,0.1)", borderBottom: "none", letterSpacing: "2px" }}>
                🔥 REWARD ZONE
              </div>
            )}

            {list.map((player, i) => {
              const me = isMe(player);
              const inTop5 = i < 5;
              const isRewardZone = (tab === "weekly" || tab === "monthly") && inTop5;
              return (
                <div key={i} className="player-row" style={{
                  background: me ? "rgba(232,255,0,0.06)" : inTop5 && isRewardZone ? "#0f0f0f" : "#0a0a0a",
                  border: "1px solid",
                  borderColor: me ? "rgba(232,255,0,0.5)" : i === 0 ? "#FFD700" : i === 1 ? "#888" : i === 2 ? "#cd7f32" : isRewardZone ? "rgba(232,255,0,0.12)" : "#151515",
                  padding: "13px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  boxShadow: me ? "0 0 12px rgba(232,255,0,0.06)" : i === 0 ? "0 0 8px rgba(255,215,0,0.08)" : "none",
                }}>
                  <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: i < 3 ? "1.5rem" : "1.1rem", color: i === 0 ? "#FFD700" : i === 1 ? "#aaa" : i === 2 ? "#cd7f32" : "#444", minWidth: "40px", textAlign: "center" }}>
                    {getMedal(i)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: me ? "#E8FF00" : "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {player.username || player.walletAddress?.slice(0, 6) + "..." + player.walletAddress?.slice(-4)}
                      </div>
                      {me && <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", background: "rgba(232,255,0,0.1)", border: "1px solid rgba(232,255,0,0.3)", padding: "2px 5px", color: "#E8FF00", flexShrink: 0 }}>YOU</span>}
                    </div>
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#444", marginTop: "2px" }}>
                      {player.gamesPlayed || 0} games · {player.gamesWon || 0} wins
                    </div>
                  </div>

                  {isRewardZone && (
                    <div style={{ background: "rgba(232,255,0,0.06)", border: "1px solid rgba(232,255,0,0.15)", padding: "4px 8px", textAlign: "center", flexShrink: 0 }} className="player-xp-label">
                      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "#555" }}>REWARD</div>
                      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "0.85rem", color: "#E8FF00" }}>+{rewards[i]} XP</div>
                    </div>
                  )}

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {(tab === "weekly" || tab === "monthly") && (
                      <>
                        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: TIER_COLORS[player.xpTier] || "#E8FF00" }}>{(player.weeklyXp || 0).toLocaleString()} XP</div>
                        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#444" }}>{tab === "monthly" ? "this month" : "this week"}</div>
                      </>
                    )}
                    {tab === "alltime" && (
                      <>
                        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: TIER_COLORS[player.xpTier] || "#E8FF00" }}>{(player.xp || 0).toLocaleString()} XP</div>
                        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: TIER_COLORS[player.xpTier] || "#444", textTransform: "uppercase" }}>{player.xpTier}</div>
                      </>
                    )}
                    {tab === "wins" && (
                      <>
                        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: "#00FF88" }}>{player.gamesWon || 0} WINS</div>
                        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#444" }}>streak: {player.winStreak || 0}</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {address && myRank && myRank > 100 && (
              <div style={{ marginTop: "10px", background: "rgba(232,255,0,0.04)", border: "1px solid rgba(232,255,0,0.25)", padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", color: "#E8FF00", minWidth: "40px", textAlign: "center" }}>#{myRank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "#E8FF00" }}>YOU</div>
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555" }}>Outside top 100</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: "#E8FF00" }}>{myWeeklyXp.toLocaleString()} XP</div>
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555" }}>this week</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}