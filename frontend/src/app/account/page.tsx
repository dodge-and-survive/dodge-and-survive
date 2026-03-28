"use client";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Nav from "../../components/nav";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function DailySpinCard({ apiUrl, address }: { apiUrl: string, address?: string }) {
  const [spinStatus, setSpinStatus] = useState<"available" | "cooldown" | "loading">("loading");
  const [nextSpin, setNextSpin] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | string | null>(null);
  const [rotation, setRotation] = useState(0);

  const segments = [
    { xp: 5, prob: "60%", color: "#333" },
    { xp: 10, prob: "30%", color: "#555" },
    { xp: 20, prob: "15%", color: "#E8FF00" },
    { xp: 30, prob: "4.9%", color: "#FFD700" },
    { xp: 50, prob: "2%", color: "#00FFFF" },
  ];
  const segAngle = 360 / segments.length;

  useEffect(() => {
    if (!address) return;
    fetch(`${apiUrl}/api/spin/status/${address}`)
      .then(r => r.json())
      .then(data => {
        if (data.canSpin) setSpinStatus("available");
        else {
          setSpinStatus("cooldown");
          if (data.nextSpinAt) {
            const diff = new Date(data.nextSpinAt).getTime() - Date.now();
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            setNextSpin(`${h}h ${String(m).padStart(2,"0")}m`);
          }
        }
      })
      .catch(() => setSpinStatus("available"));
  }, [address]);

 const doSpin = async () => {
    if (!address || spinning || spinStatus !== "available") return;
    setSpinning(true);
    try {
      const res = await fetch(`${apiUrl}/api/spin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: address }) });
      const data = await res.json();
      const xpWon = data.xpAmount;

      // Map reward to segment index
      const segmentMap: Record<number, number> = { 5: 0, 10: 1, 20: 2, 30: 3, 50: 4 };
      const segIndex = segmentMap[xpWon] ?? 0;

      // Each segment = 72deg. Segments start at -90deg (top).
      // Segment i center in wheel coords = i * 72 + 36 - 90
      // To land pointer (top) on segment i, we rotate so that segment center faces up
      const segDeg = 360 / segments.length;
      const segCenter = segIndex * segDeg + segDeg / 2; // center of segment in wheel space
      const targetOffset = (360 - segCenter) % 360; // how much to rotate so it faces top
      const currentBase = rotation % 360;
      const diff = (targetOffset - currentBase + 360) % 360;
      const finalRotation = rotation + 5 * 360 + diff;

      setRotation(finalRotation);

      setTimeout(() => {
        if (data.xpAmount) { setResult(data.xpAmount); setSpinStatus("cooldown"); setNextSpin("23h 59m"); }
        setSpinning(false);
      }, 4000);
    } catch {
      setSpinning(false);
    }
  };

  const r = 130; const cx = 160; const cy = 160;

  const getSegmentPath = (i: number) => {
    const s = (i * segAngle - 90) * (Math.PI / 180);
    const e = ((i + 1) * segAngle - 90) * (Math.PI / 180);
    return `M ${cx} ${cy} L ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)} Z`;
  };

  const getTextPos = (i: number) => {
    const angle = (i * segAngle + segAngle / 2 - 90) * (Math.PI / 180);
    return { x: cx + r * 0.65 * Math.cos(angle), y: cy + r * 0.65 * Math.sin(angle), rotate: i * segAngle + segAngle / 2 };
  };

  return (
    <div>
      <style>{`
        @keyframes glowPulse { 0%,100%{filter:drop-shadow(0 0 8px rgba(232,255,0,0.5))} 50%{filter:drop-shadow(0 0 24px rgba(232,255,0,1))} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", letterSpacing: "0.2em", textTransform: "uppercase" as const, marginBottom: "4px" }}>Daily Reward</div>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.8rem", color: "#E8FF00", letterSpacing: "0.1em", lineHeight: 1 }}>SPIN & EARN</div>
        </div>
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: spinStatus === "available" ? "#00FF88" : "#555", background: spinStatus === "available" ? "rgba(0,255,136,0.08)" : "#0a0a0a", border: `1px solid ${spinStatus === "available" ? "rgba(0,255,136,0.3)" : "#1a1a1a"}`, padding: "6px 12px", letterSpacing: "0.1em" }}>
          {spinStatus === "available" ? "● READY" : spinStatus === "cooldown" ? "○ USED" : "..."}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderTop: "24px solid #E8FF00", zIndex: 10, filter: "drop-shadow(0 0 6px rgba(232,255,0,0.9))" }} />
          <svg width="320" height="320" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4s cubic-bezier(0.17,0.67,0.12,1)" : "none", animation: spinStatus === "available" && !spinning && !result ? "glowPulse 2s ease-in-out infinite" : "none", borderRadius: "50%", maxWidth: "100%" }}>
            {segments.map((seg, i) => (
              <g key={i}>
                <path d={getSegmentPath(i)} fill={seg.color} stroke="#0a0a0a" strokeWidth="2" />
                <text x={getTextPos(i).x} y={getTextPos(i).y} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${getTextPos(i).rotate},${getTextPos(i).x},${getTextPos(i).y})`} style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "14px", fill: seg.color === "#333" || seg.color === "#555" ? "#aaa" : "#000", fontWeight: "bold" }}>
                  {typeof seg.xp === "number" ? `+${seg.xp}` : seg.xp}
                </text>
              </g>
            ))}
            <circle cx={cx} cy={cy} r={20} fill="#0a0a0a" stroke="#E8FF00" strokeWidth="2" />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "10px", fill: "#E8FF00" }}>SPIN</text>
          </svg>
        </div>
        {result ? (
          <div style={{ textAlign: "center", padding: "16px 32px", background: "rgba(232,255,0,0.04)", border: "1px solid rgba(232,255,0,0.2)", animation: "fadeInUp 0.5s ease", width: "100%" }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginBottom: "6px", letterSpacing: "0.2em" }}>YOU EARNED</div>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "4rem", color: "#E8FF00", lineHeight: 1, textShadow: "0 0 40px rgba(232,255,0,0.5)" }}>+{result} XP</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginTop: "6px" }}>Next spin available tomorrow</div>
          </div>
        ) : spinStatus === "available" ? (
          <button onClick={doSpin} disabled={spinning} style={{ background: spinning ? "#1a1a00" : "#E8FF00", color: spinning ? "#E8FF00" : "#000", border: spinning ? "1px solid #E8FF00" : "none", padding: "16px 48px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", cursor: spinning ? "not-allowed" : "pointer", letterSpacing: "0.15em", transition: "all 0.2s", width: "100%" }}>
            {spinning ? "SPINNING..." : "⚡ SPIN NOW"}
          </button>
        ) : spinStatus === "cooldown" ? (
          <div style={{ textAlign: "center", padding: "14px 24px", background: "#0a0a0a", border: "1px solid #1a1a1a", width: "100%" }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555" }}>Already spun today</div>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", color: "#444", marginTop: "4px" }}>NEXT IN {nextSpin}</div>
          </div>
        ) : (
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#555" }}>Loading...</div>
        )}
      </div>
    </div>
  );
}

const TIERS = [
  { name: "BRONZE", min: 0, max: 2000, color: "#cd7f32" },
  { name: "SILVER", min: 2000, max: 5000, color: "#aaa" },
  { name: "GOLD", min: 5000, max: 10000, color: "#FFD700" },
  { name: "DIAMOND", min: 10000, max: 20000, color: "#00FFFF" },
];

function getTierInfo(xp: number) {
  const current = TIERS.find(t => xp >= t.min && xp < t.max) || TIERS[TIERS.length - 1];
  const nextIndex = TIERS.indexOf(current) + 1;
  const next = TIERS[nextIndex] || null;
  const progress = next ? ((xp - current.min) / (current.max - current.min)) * 100 : 100;
  const xpNeeded = next ? next.min - xp : 0;
  return { current, next, progress, xpNeeded };
}

// Mobile accordion wrapper component
function MobileSection({ title, defaultOpen = false, children }: { title: string, defaultOpen?: boolean, children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${open ? "rgba(232,255,0,0.3)" : "#1e1e1e"}`, background: "#111", marginBottom: "8px", transition: "border-color 0.3s", boxShadow: open ? "0 0 10px rgba(232,255,0,0.06)" : "none" }}>
      <button onClick={() => setOpen(p => !p)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: open ? "rgba(232,255,0,0.04)" : "transparent", border: "none", cursor: "pointer", borderBottom: open ? "1px solid rgba(232,255,0,0.1)" : "none", transition: "background 0.2s" }}>
        <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", color: open ? "#E8FF00" : "#888", letterSpacing: "0.08em", transition: "color 0.2s" }}>{title}</span>
        <span style={{ color: open ? "#E8FF00" : "#444", fontSize: "0.8rem", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease, color 0.2s" }}>▼</span>
      </button>
      <div style={{ maxHeight: open ? "2000px" : "0", overflow: "hidden", opacity: open ? 1 : 0, transition: "max-height 0.4s ease, opacity 0.3s ease" }}>
        <div style={{ padding: "20px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [friendsJoined, setFriendsJoined] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refCopied, setRefCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState<string | null>(null);

useEffect(() => { if (isConnected === false) { const t = setTimeout(() => { if (!isConnected) router.push("/"); }, 3000); return () => clearTimeout(t); } }, [isConnected]);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/api/profile/${address}`)
      .then(r => r.json())
      .then(data => {
        if (!data.user) { setLoading(false); router.push("/register"); return; }
        setUser(data.user);
        setInviteCodes(data.inviteCodes || []);
        setFriendsJoined(data.friendsJoined || 0);
        setLoading(false);
      })
      .catch(() => { setLoading(false); router.push("/register"); });
  }, [address]);

  const xp = user?.xp || 0;
  const { current: currentTier, next: nextTier, progress, xpNeeded } = getTierInfo(xp);
  const weeklyPlayed = user?.weeklyGamesPlayed || 0;
  const maxGames = user?.isSubscribed ? 2 : 1;
  const gamesRemaining = Math.max(0, maxGames - weeklyPlayed);
  const winRate = user?.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) : "0.0";
  const unusedCodes = inviteCodes.filter(c => !c.used);

  const nextReset = () => {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getUTCDay();
    monday.setUTCDate(now.getUTCDate() + (day === 0 ? 1 : 8 - day));
    monday.setUTCHours(0, 0, 0, 0);
    const diff = monday.getTime() - now.getTime();
    if (diff <= 0) return "Soon";
    return `${Math.floor(diff / 86400000)}d ${Math.floor((diff % 86400000) / 3600000)}h`;
  };

  const L: React.CSSProperties = { fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", textTransform: "uppercase" as const, marginBottom: "4px" };
  const V: React.CSSProperties = { fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", color: "white", lineHeight: 1 };
  const card: React.CSSProperties = { background: "#111", border: "1px solid #1e1e1e", padding: "24px", marginBottom: "12px" };
  const cardGlow: React.CSSProperties = { ...card, borderColor: "rgba(232,255,0,0.2)", boxShadow: "0 0 16px rgba(232,255,0,0.05)" };
  const miniCard: React.CSSProperties = { background: "#0a0a0a", border: "1px solid #1a1a1a", padding: "14px" };
  const secTitle: React.CSSProperties = { fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "#E8FF00", letterSpacing: "0.08em", marginBottom: "14px" };

  // Shared content blocks (used in both desktop and mobile)
  const AccountContent = () => (
    <>
      <div style={L}>Player</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2rem", color: "#E8FF00", lineHeight: 1 }}>{user?.username || "—"}</div>
      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", marginTop: "4px", marginBottom: "16px" }}>{address?.slice(0,6)}...{address?.slice(-4)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
        <div style={miniCard}><div style={L}>Joined</div><div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "#aaa" }}>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</div></div>
        <div style={miniCard}><div style={L}>User ID</div><div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#444" }}>{user?.id?.slice(0,8)}...</div></div>
      </div>
      <div style={{ ...miniCard, marginBottom: "16px", borderColor: user?.isSubscribed ? "rgba(232,255,0,0.2)" : "#1a1a1a" }}>
        <div style={L}>Player Type</div>
        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.6rem", color: user?.isSubscribed ? "#E8FF00" : user?.userType === "free" ? "#00FF88" : "#666" }}>
          {user?.isSubscribed ? "SUBSCRIBER" : user?.userType === "free" ? "FREE PLAYER" : "VISITOR"}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const, marginTop: "8px" }}>
          {user?.badge && <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", background: "#1a1a00", border: "1px solid rgba(232,255,0,0.35)", padding: "3px 8px", color: "#E8FF00" }}>⭐ {user.badge}</span>}
          {user?.betaSubscriber && <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", background: "#001a1a", border: "1px solid rgba(0,255,255,0.3)", padding: "3px 8px", color: "#00FFFF" }}>EARLY SUB</span>}
        </div>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "8px" }}>
          <div><div style={L}>Total XP</div><div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.8rem", color: "#E8FF00", lineHeight: 1 }}>{xp.toLocaleString()}</div></div>
          <div style={{ textAlign: "right" }}><div style={L}>Tier</div><div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.6rem", color: currentTier.color }}>{currentTier.name}</div></div>
        </div>
        <div style={{ background: "#0a0a0a", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "6px" }}>
          <div style={{ height: "100%", width: `${Math.min(progress, 100)}%`, background: currentTier.color, borderRadius: "4px", transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555" }}>{currentTier.min.toLocaleString()} XP</div>
          {nextTier ? <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555" }}><span style={{ color: "#E8FF00" }}>{xpNeeded.toLocaleString()}</span> to {nextTier.name}</div> : <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#E8FF00" }}>MAX TIER</div>}
        </div>
      </div>
    </>
  );

  const StatsContent = () => (
    <>
      <div style={secTitle}>GAME STATS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
        {[
          { label: "Played", value: user?.gamesPlayed || 0, color: "white" },
          { label: "Won", value: user?.gamesWon || 0, color: "#00FF88" },
          { label: "Win Rate", value: `${winRate}%`, color: "#E8FF00" },
          { label: "Streak", value: user?.winStreak || 0, color: "#FFD700" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...miniCard, textAlign: "center" }}>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.2rem", color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginTop: "4px", textTransform: "uppercase" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={secTitle}>WEEKLY LIMITS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "12px" }}>
        {[
          { label: "This Week", value: `${weeklyPlayed} / ${maxGames}`, color: "#E8FF00" },
          { label: "Remaining", value: String(gamesRemaining), color: gamesRemaining > 0 ? "#00FF88" : "#FF3333" },
          { label: "Reset In", value: nextReset(), color: "white" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...miniCard, textAlign: "center" }}>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.6rem", color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginTop: "4px", textTransform: "uppercase" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#0a0a0a", height: "6px", borderRadius: "3px", overflow: "hidden", marginBottom: "8px" }}>
        <div style={{ height: "100%", width: `${(weeklyPlayed / maxGames) * 100}%`, background: gamesRemaining > 0 ? "#00FF88" : "#FF3333", borderRadius: "3px" }} />
      </div>
      {gamesRemaining === 0 && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#FF3333", padding: "8px 10px", background: "#1a0000", border: "1px solid #330000" }}>Weekly limit reached. Resets in {nextReset()}.</div>}
    </>
  );

  const ReferralContent = () => (
    <>
      {!user?.isSubscribed ? (
        <div style={{ textAlign: "center", padding: "32px 16px", background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
          <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🔒</div>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: "#888", marginBottom: "8px" }}>LOCKED</div>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", marginBottom: "20px", lineHeight: 1.7 }}>Subscribe to unlock referrals and earn XP from invites.</div>
          <button onClick={() => router.push("/subscribe")} style={{ background: "#E8FF00", color: "#000", border: "none", padding: "12px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", cursor: "pointer", letterSpacing: "0.05em", width: "100%" }}>UPGRADE TO SUBSCRIBER →</button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <div style={miniCard}><div style={L}>Friends Joined</div><div style={V}>{friendsJoined}</div></div>
            <div style={miniCard}><div style={L}>Codes Available</div><div style={{ ...V, color: "#E8FF00" }}>{unusedCodes.length}</div></div>
          </div>
          <div style={{ ...L, marginBottom: "8px" }}>Invite Codes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            {inviteCodes.length > 0 ? inviteCodes.slice(0, 2).map((code, i) => (
              <div key={code.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ ...miniCard, flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: code.used ? "#444" : "#E8FF00", letterSpacing: "0.25em", textDecoration: code.used ? "line-through" : "none" }}>{code.code}</div>
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: code.used ? "#FF3333" : "#444" }}>{code.used ? "USED" : `SHARE ${i + 1}`}</div>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(code.code); setCodeCopied(code.code); setTimeout(() => setCodeCopied(null), 2000); }} style={{ background: codeCopied === code.code ? "#1a2a00" : "#111", color: codeCopied === code.code ? "#00FF88" : "#E8FF00", border: "1px solid", borderColor: codeCopied === code.code ? "#00FF88" : "#333", padding: "10px 14px", cursor: "pointer", fontFamily: "Bebas Neue, sans-serif", fontSize: "0.9rem" }}>
                  {codeCopied === code.code ? "✓" : "COPY"}
                </button>
              </div>
            )) : <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", padding: "12px", ...miniCard }}>Generating your codes...</div>}
          </div>
          <div style={miniCard}>
            <div style={{ ...L, marginBottom: "10px" }}>Referral XP Rewards</div>
            {[{ action: "Invite joins", xp: "+20 XP" }, { action: "Invite plays first game", xp: "+30 XP" }, { action: "Invite subscribes", xp: "+80 XP" }].map(({ action, xp }) => (
              <div key={action} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #111" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#666" }}>{action}</div>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "#E8FF00" }}>{xp}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  const RewardsContent = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
      <div style={miniCard}><div style={L}>USDT Won</div><div style={{ ...V, color: "#00FF88" }}>${user?.balance || "0.00"}</div><div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginTop: "4px" }}>Unlocks after Beta</div></div>
      <div style={miniCard}><div style={L}>Beta Bonus XP</div><div style={{ ...V, color: "#E8FF00" }}>{user?.betaSubscriber ? "+500" : "0"} XP</div><div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginTop: "4px" }}>Early supporter</div></div>
    </div>
  );

  if (loading) return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2rem", color: "#555" }}>LOADING...</div>
    </div>
  );

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        /* Desktop styles */
        .db-grid { display: grid; grid-template-columns: 300px 1fr 300px; gap: 0; padding: 24px 40px; align-items: start; }
        .mobile-only { display: none; }
        .desktop-left { display: block; }
        .desktop-center { display: block; }
        .desktop-right { display: block; }
        .card-hover:hover { border-color: rgba(232,255,0,0.3) !important; transform: translateY(-2px); transition: all 0.2s; }
        .copy-btn-s:hover { border-color: #E8FF00 !important; }

        /* Mobile overrides — ONLY layout changes */
        @media (max-width: 768px) {
          .db-grid { display: none !important; }
          .mobile-only { display: block !important; padding: 12px 16px; }
          .mobile-stat-g { grid-template-columns: 1fr 1fr !important; }
          .mobile-week-g { grid-template-columns: 1fr 1fr !important; }
        }

        /* Tablet */
        @media (min-width: 769px) and (max-width: 1100px) {
          .db-grid { grid-template-columns: 260px 1fr 280px !important; padding: 16px 20px !important; }
        }
      `}</style>

      {/* NAV — shared */}
      <Nav />

      {/* PAGE TITLE — shared */}
   <div style={{ padding: "24px 40px 16px", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.5rem", color: "white", lineHeight: 1, textShadow: "0 0 40px rgba(232,255,0,0.15)" }}>ACCOUNT</div>
        <div style={{ width: "40px", height: "3px", background: "#E8FF00", marginTop: "6px", boxShadow: "0 0 12px rgba(232,255,0,0.5)" }} />
      </div>

      {/* ═══ DESKTOP: 3-column grid ═══ */}
      <div className="db-grid" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(232,255,0,0.03) 0%, transparent 60%)" }}>

        {/* LEFT */}
        <div style={{ paddingRight: "20px" }}>
          <div style={{ ...cardGlow, borderTop: "2px solid #E8FF00", marginBottom: "12px" }}>
            <AccountContent />
          </div>
          {!user?.isSubscribed && (
            <div style={{ ...card, borderColor: "rgba(232,255,0,0.2)", textAlign: "center" }}>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "#aaa", marginBottom: "8px" }}>UNLOCK MORE</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", marginBottom: "16px", lineHeight: 1.7 }}>Get 2x XP, referrals, and USDT prizes</div>
              <button onClick={() => router.push("/subscribe")} style={{ background: "#E8FF00", color: "#000", border: "none", padding: "12px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", cursor: "pointer", width: "100%", letterSpacing: "0.05em" }}>SUBSCRIBE $6.99 →</button>
            </div>
          )}
        </div>

        {/* CENTER */}
        <div style={{ paddingLeft: "20px", paddingRight: "20px" }}>
          <div style={{ ...cardGlow, borderTop: "2px solid #E8FF00", marginBottom: "12px", boxShadow: "0 0 24px rgba(232,255,0,0.07)" }}>
            <DailySpinCard apiUrl={API_URL} address={address} />
          </div>
          <div style={{ ...card, marginBottom: "12px" }}>
            <StatsContent />
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ paddingLeft: "20px" }}>
          <div style={{ ...cardGlow, marginBottom: "12px" }}>
            <div style={secTitle}>REFERRAL</div>
            <ReferralContent />
          </div>
          <div style={card}>
            <div style={secTitle}>REWARDS</div>
            <RewardsContent />
          </div>
        </div>
      </div>

      {/* ═══ MOBILE: accordion ═══ */}
      <div className="mobile-only">

        {/* Account — always open */}
        <MobileSection title="👤 ACCOUNT DETAILS" defaultOpen={true}>
          <AccountContent />
          {!user?.isSubscribed && (
            <div style={{ marginTop: "16px", padding: "16px", background: "#0a0a0a", border: "1px solid rgba(232,255,0,0.2)", textAlign: "center" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", marginBottom: "12px", lineHeight: 1.7 }}>Get 2x XP, referrals, and USDT prizes</div>
              <button onClick={() => router.push("/subscribe")} style={{ background: "#E8FF00", color: "#000", border: "none", padding: "12px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.1rem", cursor: "pointer", width: "100%", letterSpacing: "0.05em" }}>SUBSCRIBE $6.99 →</button>
            </div>
          )}
        </MobileSection>

        {/* Daily Spin — collapsible */}
        <MobileSection title="🎰 DAILY SPIN">
          <DailySpinCard apiUrl={API_URL} address={address} />
        </MobileSection>

        {/* Game Stats — collapsible */}
        <MobileSection title="📊 GAME STATS">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }} className="mobile-stat-g">
            {[
              { label: "Played", value: user?.gamesPlayed || 0, color: "white" },
              { label: "Won", value: user?.gamesWon || 0, color: "#00FF88" },
              { label: "Win Rate", value: `${winRate}%`, color: "#E8FF00" },
              { label: "Streak", value: user?.winStreak || 0, color: "#FFD700" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...miniCard, textAlign: "center" }}>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.2rem", color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginTop: "4px", textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ ...L, marginBottom: "10px" }}>Weekly Limits</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }} className="mobile-week-g">
            {[
              { label: "This Week", value: `${weeklyPlayed} / ${maxGames}`, color: "#E8FF00" },
              { label: "Remaining", value: String(gamesRemaining), color: gamesRemaining > 0 ? "#00FF88" : "#FF3333" },
              { label: "Reset In", value: nextReset(), color: "white" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...miniCard, textAlign: "center" }}>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.6rem", color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", marginTop: "4px", textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#0a0a0a", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(weeklyPlayed / maxGames) * 100}%`, background: gamesRemaining > 0 ? "#00FF88" : "#FF3333", borderRadius: "3px" }} />
          </div>
          {gamesRemaining === 0 && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#FF3333", padding: "8px 10px", background: "#1a0000", border: "1px solid #330000", marginTop: "8px" }}>Weekly limit reached. Resets in {nextReset()}.</div>}
        </MobileSection>

        {/* Referral — collapsible */}
        <MobileSection title="🔗 REFERRAL">
          <ReferralContent />
        </MobileSection>

        {/* Rewards — collapsible */}
        <MobileSection title="🏆 REWARDS">
          <RewardsContent />
        </MobileSection>

      </div>
    </div>
  );
}