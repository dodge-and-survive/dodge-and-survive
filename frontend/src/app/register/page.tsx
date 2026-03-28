"use client";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function RegisterPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [step, setStep] = useState<"username" | "invite">("username");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected]);

  useEffect(() => {
    if (!address || typeof window === "undefined") return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/${address}`)
    .then(r => r.json())
    .then(data => { if (data.user) router.push("/lobby"); });
}, [address]);
  const handleUsername = async () => {
    if (!username || username.length < 3) return setError("Username must be at least 3 characters");
    if (username.length > 20) return setError("Username must be under 20 characters");
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return setError("Only letters, numbers and underscores");
    setError("");
    setStep("invite");
  };

  const handleFinish = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, username, inviteCode: inviteCode || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "Invalid or expired invite code") {
          setError("This invite code has already been used or is invalid.");
          setInviteCode("");
        } else {
          setError(data.error || "Registration failed");
        }
        return;
      }
      router.push("/lobby");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", letterSpacing: "0.2em", color: "#E8FF00" }}>STAKE & SURVIVE</div>
        <ConnectButton />
      </nav>

      <div style={{ maxWidth: "480px", margin: "80px auto", padding: "0 20px" }}>
        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "3.5rem", color: "white", marginBottom: "4px" }}>
          {step === "username" ? "CREATE PROFILE" : "INVITE CODE"}
        </div>
        <div style={{ width: "48px", height: "2px", background: "#E8FF00", marginBottom: "32px" }} />

        {step === "username" && (
          <div>
            <div style={{ background: "#111", border: "1px solid #333", padding: "20px", marginBottom: "24px" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", textTransform: "uppercase", marginBottom: "8px" }}>Wallet</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "#E8FF00" }}>{address?.slice(0, 6)}...{address?.slice(-4)}</div>
            </div>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#666", marginBottom: "8px", textTransform: "uppercase" }}>Choose your username</div>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. CryptoKing99" maxLength={20}
                style={{ width: "100%", background: "#111", border: "1px solid #333", color: "white", padding: "14px 16px", fontFamily: "Space Mono, monospace", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                onKeyDown={e => e.key === "Enter" && handleUsername()} />
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#444", marginTop: "6px" }}>Letters, numbers, underscores only. Max 20 chars.</div>
            </div>
            {error && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#FF3333", marginBottom: "16px" }}>{error}</div>}
            <button onClick={handleUsername} style={{ background: "#E8FF00", color: "#000", border: "none", padding: "16px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.3rem", letterSpacing: "0.08em", cursor: "pointer", width: "100%" }}>
              CONTINUE →
            </button>
          </div>
        )}

        {step === "invite" && (
          <div>
            <div style={{ background: "#111", border: "1px solid #333", padding: "20px", marginBottom: "24px" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", textTransform: "uppercase", marginBottom: "4px" }}>Username</div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.5rem", color: "#E8FF00" }}>{username}</div>
            </div>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#666", marginBottom: "8px", textTransform: "uppercase" }}>Have an invite code? (optional)</div>
              <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3D4" maxLength={8}
                style={{ width: "100%", background: "#111", border: "1px solid #333", color: "white", padding: "14px 16px", fontFamily: "Space Mono, monospace", fontSize: "0.9rem", outline: "none", letterSpacing: "0.1em", boxSizing: "border-box" }} />
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#444", marginTop: "6px" }}>Invite codes unlock free game access.</div>
            </div>
            {error && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#FF3333", marginBottom: "16px" }}>{error}</div>}
            <button onClick={handleFinish} disabled={loading} style={{ background: "#E8FF00", color: "#000", border: "none", padding: "16px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.3rem", letterSpacing: "0.08em", cursor: loading ? "not-allowed" : "pointer", width: "100%", opacity: loading ? 0.7 : 1 }}>
              {loading ? "CREATING..." : "ENTER THE ARENA →"}
            </button>
            <button onClick={() => setStep("username")} style={{ background: "transparent", color: "#555", border: "none", padding: "12px", fontFamily: "Space Mono, monospace", fontSize: "0.7rem", cursor: "pointer", width: "100%", marginTop: "8px" }}>← back</button>
          </div>
        )}
      </div>
    </div>
  );
}