"use client";
export const dynamic = "force-dynamic";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { base } from "wagmi/chains";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const CONTRACT_ABI = [
  {
    name: "claimDailyXP",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "xpAmount", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

function getXPFromScore(score: number, prevBest: number, noHits: boolean, survived: boolean) {
  let xp = 0;
  if (score >= 500) xp = 50;
  else if (score >= 401) xp = 35;
  else if (score >= 301) xp = 25;
  else if (score >= 201) xp = 15;
  else if (score >= 101) xp = 10;
  else xp = 5;
  if (score > prevBest && prevBest > 0) xp += 5;
  if (noHits) xp += 10;
  if (survived) xp += 5;
  xp = Math.min(xp, 50); // daily cap
  const tier = score >= 500 ? "PRO" : score >= 301 ? "STRONG" : score >= 101 ? "GOOD" : "BEGINNER";
  return { xp, tier };
}

export default function DodgeNodesPage() {
  const { address } = useAccount();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<"playing" | "done">("playing");
  const animRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const searchParams = useSearchParams();
  const [gameState, setGameState] = useState<"idle" | "playing" | "done">(
    searchParams.get("claim") === "true" ? "done" : "idle"
  );
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [finalScore, setFinalScore] = useState(0);
  const [finalXP, setFinalXP] = useState(0);
  const [finalTier, setFinalTier] = useState("");
useEffect(() => {
    if (searchParams.get("claim") !== "true" || !address) return;
    fetch(`${API_URL}/api/daily-game/status/${address}`)
      .then(r => r.json())
      .then(data => {
        if (data.hasPlayed && !data.hasClaimed) {
          const saved = localStorage.getItem("nodedodge_last_score");
          if (saved) {
            const { score, xp, tier } = JSON.parse(saved);
            setFinalScore(score);
            setFinalXP(xp);
            setFinalTier(tier);
          }
          setGameState("done");
        } else {
          setGameState("idle");
        }
      });
  }, [address]);
  const [noHits, setNoHits] = useState(true);
  const hitRef = useRef(false);
  const survivedRef = useRef(false);

  // Claim flow state
  const [claimStep, setClaimStep] = useState<"idle" | "signing" | "confirming" | "done" | "error">("idle");
  const [nextAttempt, setNextAttempt] = useState("");

  useEffect(() => {
    const tick = () => {
      const played = localStorage.getItem("nodedodge_played");
      if (!played) return;
      const playedDate = new Date(played);
      const next = new Date(playedDate);
      next.setHours(next.getHours() + 24);
      const diff = next.getTime() - Date.now();
      if (diff <= 0) { setNextAttempt(""); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setNextAttempt(`${h}h ${String(m).padStart(2,"0")}m`);
    };
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [gameState]);
  const [claimError, setClaimError] = useState("");
  const [signatureData, setSignatureData] = useState<{ signature: string; xpAmount: number } | null>(null);

  const { writeContract, data: txHash, error: writeError } = useWriteContract();
  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash: txHash });

  // Step 3: after tx confirmed — tell backend to award XP in DB
  useEffect(() => {
    if (!txSuccess || !txHash || claimStep !== "confirming") return;
    const confirm = async () => {
      try {
        const res = await fetch(`${API_URL}/api/confirm-xp-claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address, xpAmount: finalXP, txHash }),
        });
        const data = await res.json();
        if (data.success) {
          setClaimStep("done");
          localStorage.setItem("nodedodge_played", new Date().toISOString());
        } else {
          setClaimError(data.error || "Failed to confirm");
          setClaimStep("error");
        }
      } catch {
        setClaimError("Network error confirming claim");
        setClaimStep("error");
      }
    };
    confirm();
  }, [txSuccess, txHash]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      setClaimError(writeError.message.slice(0, 80));
      setClaimStep("error");
    }
  }, [writeError]);

  const claimXP = async () => {
    if (!address || claimStep !== "idle") return;
    setClaimStep("signing");
    setClaimError("");

    try {
      // Step 1: get signature from backend
      const res = await fetch(`${API_URL}/api/sign-xp-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, xpAmount: finalXP }),
      });
      const data = await res.json();
      if (!data.success) {
        setClaimError(data.error || "Failed to get signature");
        setClaimStep("error");
        return;
      }

      // Step 2: send tx to contract
      setClaimStep("confirming");
     writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "claimDailyXP",
        args: [BigInt(data.xpAmount), data.signature as `0x${string}`],
        chainId: base.id,
        chain: undefined,
        account: "" as `0x${string}`,
      });


    } catch (err) {
      setClaimError("Failed to connect to backend");
      setClaimStep("error");
    }
  };

  const startGame = () => {
    stateRef.current = "playing";
    setGameState("playing");
    setTimeLeft(30);
    setScore(0);
    setLives(3);
    setLevel(1);
    setClaimStep("idle");
    setClaimError("");
  };

  useEffect(() => {
    if (gameState !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 54;
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight - 54; };
    window.addEventListener("resize", onResize);

    const ctx = canvas.getContext("2d")!;
    let W = canvas.width, H = canvas.height;
    let gs = { score: 0, lives: 3, level: 1, frameCount: 0, scoreT: 0, spawnT: 0, tokenT: 0 };
    const isMobile = W < 768;
    let player = { x: W / 2, y: H - 100, r: isMobile ? 22 : 14, speed: isMobile ? 7 : 5.5, invincible: 0, trail: [] as {x:number,y:number}[] };
    let nodes: any[] = [], tokens: any[] = [], parts: any[] = [];
    let mX = W / 2, mY = H - 100, useMouse = false;
    const keys: Record<string, boolean> = {};

    const onMM = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); mX = e.clientX - r.left; mY = e.clientY - r.top; useMouse = true; };
    const onML = () => useMouse = false;
    const onKD = (e: KeyboardEvent) => { keys[e.key] = true; useMouse = false; if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault(); };
    const onKU = (e: KeyboardEvent) => { keys[e.key] = false; };
    const onTM = (e: TouchEvent) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); mX = e.touches[0].clientX - r.left; mY = e.touches[0].clientY - r.top; useMouse = true; };

    canvas.addEventListener("mousemove", onMM);
    canvas.addEventListener("mouseleave", onML);
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    canvas.addEventListener("touchmove", onTM, { passive: false });
// Audio
    let audioCtx: AudioContext | null = null;
    const getAC = () => { if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); return audioCtx; };
    const playTone = (freq: number, type: OscillatorType, dur: number, vol = 0.3) => {
      try { const ac = getAC(), o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur); o.start(); o.stop(ac.currentTime + dur); } catch {}
    };
    const collectSound = () => { playTone(523, "sine", 0.08, 0.25); setTimeout(() => playTone(784, "sine", 0.1, 0.2), 60); setTimeout(() => playTone(1046, "sine", 0.12, 0.18), 120); };
    const hitSound = () => { playTone(120, "sawtooth", 0.3, 0.4); setTimeout(() => playTone(80, "sawtooth", 0.2, 0.3), 100); };
    const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
    const burst = (x: number, y: number, col: string, n = 12) => {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 / n) * i, s = 2 + Math.random() * 3;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.025 + Math.random() * 0.03, r: 2 + Math.random() * 4, col });
      }
    };

    const spawnNode = () => {
      const edge = Math.floor(Math.random() * 4);
     const mobileMult = W < 768 ? 0.55 : 1;
      const spd = (1.8 + gs.level * 0.4 + Math.random() * 0.8) * mobileMult;
      let x = 0, y = 0, vx = 0, vy = 0;
      if (edge === 0) { x = Math.random() * W; y = -20; vx = (Math.random() - 0.5) * 2; vy = spd; }
      else if (edge === 1) { x = W + 20; y = Math.random() * H; vx = -spd; vy = (Math.random() - 0.5) * 2; }
      else if (edge === 2) { x = Math.random() * W; y = H + 20; vx = (Math.random() - 0.5) * 2; vy = -spd; }
      else { x = -20; y = Math.random() * H; vx = spd; vy = (Math.random() - 0.5) * 2; }
      nodes.push({ x, y, vx, vy, r: 12 + Math.random() * 8, homing: Math.random() < 0.12 + gs.level * 0.04, rot: 0, rotSpeed: (Math.random() - 0.5) * 0.15, type: Math.floor(Math.random() * 3) });
    };

    const spawnToken = () => {
      const m = 40;
      tokens.push({ x: m + Math.random() * (W - m * 2), y: m + Math.random() * (H - m * 2), r: 12, pulse: Math.random() * Math.PI * 2, val: 10 + gs.level * 5 });
    };

    const drawGrid = () => {
      ctx.strokeStyle = "rgba(0,255,180,0.025)"; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    };

    const drawNode = (n: any) => {
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.rot);
      const c = ["#ff2244", "#ff6600", "#cc00ff"][n.type];
      ctx.strokeStyle = c; ctx.fillStyle = c + "22"; ctx.lineWidth = 2; ctx.shadowColor = c; ctx.shadowBlur = 14;
      ctx.beginPath();
      if (n.type === 0) { ctx.rect(-n.r, -n.r, n.r * 2, n.r * 2); }
      else if (n.type === 1) { ctx.moveTo(0, -n.r); ctx.lineTo(n.r, n.r); ctx.lineTo(-n.r, n.r); ctx.closePath(); }
      else { ctx.arc(0, 0, n.r, 0, Math.PI * 2); }
      ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = c; ctx.globalAlpha = 0.9;
      ctx.font = `bold ${Math.max(7, n.r * 0.45)}px monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("NODE", 0, 0); ctx.globalAlpha = 1; ctx.restore();
    };

    const drawToken = (t: any) => {
      t.pulse += 0.08; const p = 1 + Math.sin(t.pulse) * 0.15;
      ctx.save(); ctx.translate(t.x, t.y); ctx.scale(p, p);
      ctx.beginPath(); ctx.arc(0, 0, t.r + 3, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1200"; ctx.shadowColor = "#ffd700"; ctx.shadowBlur = 20; ctx.fill();
      ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 2; ctx.stroke();
      ctx.shadowBlur = 0; ctx.restore();
    };

    const drawPlayer = () => {
    for (let i = 0; i < player.trail.length; i++) {
        const t = player.trail[i];
        const a = (i / player.trail.length) * (isMobile ? 0.7 : 0.4);
        const r = player.r * (i / player.trail.length) * (isMobile ? 1.0 : 0.8);
        ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,180,${a})`; ctx.fill();
      }
      if (player.invincible > 0 && Math.floor(player.invincible / 6) % 2 === 0) return;
      ctx.save(); ctx.translate(player.x, player.y);
      const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, player.r);
      gr.addColorStop(0, "#fff"); gr.addColorStop(0.4, "#00ffb3"); gr.addColorStop(1, "rgba(0,255,180,0)");
      ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI * 2);
      ctx.fillStyle = gr; ctx.shadowColor = "#00ffb3"; ctx.shadowBlur = 30; ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    };

  const endGame = (timedOut = false) => {
      if (stateRef.current === "done") return;
      stateRef.current = "done";
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      survivedRef.current = timedOut;
      const prevBest = parseInt(localStorage.getItem("nodedodge_best") || "0");
      const { xp, tier } = getXPFromScore(gs.score, prevBest, !hitRef.current, timedOut);
      if (gs.score > prevBest) localStorage.setItem("nodedodge_best", String(gs.score));
      setNoHits(!hitRef.current);
      setFinalScore(gs.score);
      setFinalXP(xp);
      setFinalTier(tier);
      setGameState("done");
      // Save score to localStorage for claim restore
      localStorage.setItem("nodedodge_last_score", JSON.stringify({ score: gs.score, xp, tier }));
      // Record play on backend
      if (address) {
        fetch(`${API_URL}/api/daily-game/record`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        }).catch(() => {});
      }
    
    };

    const loop = () => {
      if (stateRef.current === "done") return;
      gs.frameCount++;
      W = canvas.width; H = canvas.height;

     if (useMouse) {
        const dx = mX - player.x, dy = mY - player.y;
        const dist = Math.hypot(dx, dy);
        const followSpeed = isMobile ? 0.25 : 0.12;
        if (dist > 2) { player.x += dx * followSpeed; player.y += dy * followSpeed; }
      } else {
        let mx = 0, my = 0;
        if (keys["ArrowLeft"] || keys["a"]) mx -= 1;
        if (keys["ArrowRight"] || keys["d"]) mx += 1;
        if (keys["ArrowUp"] || keys["w"]) my -= 1;
        if (keys["ArrowDown"] || keys["s"]) my += 1;
        const len = Math.hypot(mx, my) || 1;
        player.x += (mx / len) * player.speed; player.y += (my / len) * player.speed;
      }
      player.x = Math.max(player.r, Math.min(W - player.r, player.x));
      player.y = Math.max(player.r, Math.min(H - player.r, player.y));
      player.trail.push({ x: player.x, y: player.y });
      if (player.trail.length > (isMobile ? 22 : 14)) player.trail.shift();
      if (player.invincible > 0) player.invincible--;

      gs.scoreT++; if (gs.scoreT >= 30) { gs.score += gs.level; gs.scoreT = 0; setScore(gs.score); }
      gs.spawnT++; if (gs.spawnT >= Math.max(10, 50 - gs.level * 5)) { spawnNode(); gs.spawnT = 0; }
      gs.tokenT++; if (gs.tokenT >= 130 && tokens.length < 6) { spawnToken(); gs.tokenT = 0; }
      if (gs.score >= gs.level * 150) { gs.level++; setLevel(gs.level); for (let i = 0; i < 2; i++) spawnToken(); }

      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.homing) {
          const dx = player.x - n.x, dy = player.y - n.y, dist = Math.hypot(dx, dy);
      n.vx += (dx / dist) * 0.05; n.vy += (dy / dist) * 0.05;
          const homingMult = W < 768 ? 0.55 : 1;
          const spd = Math.hypot(n.vx, n.vy), ms = (2.5 + gs.level * 0.3) * homingMult;
          if (spd > ms) { n.vx = (n.vx / spd) * ms; n.vy = (n.vy / spd) * ms; }
        }
        n.x += n.vx; n.y += n.vy; n.rot += n.rotSpeed;
        if (!n.homing && (n.x < -60 || n.x > W + 60 || n.y < -60 || n.y > H + 60)) { nodes.splice(i, 1); continue; }
        if (player.invincible <= 0 && d(player, n) < player.r + n.r - 4) {
          gs.lives--; player.invincible = 150;
          hitRef.current = true;
          hitSound();
          burst(player.x, player.y, "#ff2244", 20);
          nodes.splice(i, 1); setLives(gs.lives);
          if (gs.lives <= 0) { endGame(); return; }
        }
      }

      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        if (d(player, t) < player.r + t.r + 6) {
         gs.score += t.val; burst(t.x, t.y, "#ffd700", 8);
          collectSound();
          tokens.splice(i, 1); setScore(gs.score);
        }
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life -= p.decay;
        if (p.life <= 0) parts.splice(i, 1);
      }

      ctx.fillStyle = "#020408"; ctx.fillRect(0, 0, W, H);
      drawGrid();
      tokens.forEach(drawToken);
      nodes.forEach(drawNode);
      for (const p of parts) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.col + Math.floor(p.life * 255).toString(16).padStart(2, "0");
        ctx.shadowColor = p.col; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
      }
      drawPlayer();
      animRef.current = requestAnimationFrame(loop);
    };

    timerRef.current = setInterval(() => {
      if (stateRef.current === "done") return;
      setTimeLeft(prev => {
        const next = prev - 1;
        if (next <= 0) { endGame(true); return 0; }
        return next;
      });
    }, 1000);

    animRef.current = requestAnimationFrame(loop);

    return () => {
      stateRef.current = "done";
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousemove", onMM);
      canvas.removeEventListener("mouseleave", onML);
      canvas.removeEventListener("touchmove", onTM);
      window.removeEventListener("keydown", onKD);
      window.removeEventListener("keyup", onKU);
    };
  }, [gameState]);

  const claimLabel = () => {
    if (claimStep === "signing") return "GETTING SIGNATURE...";
    if (claimStep === "confirming" && txLoading) return "CONFIRM IN WALLET...";
    if (claimStep === "confirming" && !txLoading) return "WAITING FOR TX...";
    if (claimStep === "done") return `✓ +${finalXP} XP CLAIMED ON-CHAIN`;
    if (claimStep === "error") return "RETRY CLAIM";
    return `CLAIM +${finalXP} XP ON BASE`;
  };

  return (
    <div style={{ background: "#020408", minHeight: "100vh", overflow: "hidden", fontFamily: "Space Mono, monospace" }}>
      <style suppressHydrationWarning>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Space+Mono:wght@400;700&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes ndGlow { 0%,100%{text-shadow:0 0 20px #00ffb3,0 0 40px #00ffb3} 50%{text-shadow:0 0 40px #00ffb3,0 0 80px #00ffb3} }
        @keyframes ndPop { from{transform:scale(0.7);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes ndPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes ndFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* TOP BAR */}
      <div style={{ height: "54px", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", borderBottom: "1px solid rgba(0,255,180,0.15)", background: "rgba(2,4,8,0.98)", position: "relative", zIndex: 10 }}>
        <button onClick={() => router.push("/lobby")} style={{ background: "transparent", border: "1px solid rgba(0,255,180,0.2)", color: "rgba(0,255,180,0.6)", padding: "6px 14px", fontFamily: "Space Mono, monospace", fontSize: "0.6rem", letterSpacing: "2px", cursor: "pointer" }}>← LOBBY</button>
        <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.9rem", fontWeight: 900, color: "#00ffb3", letterSpacing: "4px" }}>NODE DODGE</div>
        {gameState === "playing" ? (
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.4rem", color: "rgba(0,255,180,0.4)", letterSpacing: "2px" }}>SCORE</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "1rem", fontWeight: 700, color: "#ffd700" }}>{score}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.4rem", color: "rgba(0,255,180,0.4)", letterSpacing: "2px" }}>TIME</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "1rem", fontWeight: 700, color: timeLeft <= 10 ? "#ff2244" : "#00ffb3", animation: timeLeft <= 10 ? "ndPulse 0.5s infinite" : "none" }}>{timeLeft}s</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.4rem", color: "rgba(0,255,180,0.4)", letterSpacing: "2px" }}>LIVES</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "1rem", color: "#ff00aa" }}>{Array.from({ length: 3 }, (_, i) => i < lives ? "♦" : "◇").join(" ")}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.4rem", color: "rgba(0,255,180,0.4)", letterSpacing: "2px" }}>LEVEL</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "1rem", fontWeight: 700, color: "#00ffb3" }}>{level}</div>
            </div>
          </div>
        ) : <div style={{ width: "80px" }} />}
      </div>

      {/* IDLE */}
      {gameState === "idle" && (
        <div style={{ position: "fixed", inset: 0, top: "54px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#020408", zIndex: 5, animation: "ndFade 0.4s ease" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,255,180,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,180,0.025) 1px,transparent 1px)", backgroundSize: "50px 50px", pointerEvents: "none" }} />
          <div style={{ position: "relative", textAlign: "center", padding: "40px" }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "rgba(0,255,180,0.5)", letterSpacing: "6px", marginBottom: "16px" }}>DAILY CHALLENGE</div>
            <div style={{ fontFamily: "Orbitron, monospace", fontSize: "clamp(3rem,8vw,5rem)", fontWeight: 900, color: "#00ffb3", letterSpacing: "6px", lineHeight: 0.9, marginBottom: "8px", animation: "ndGlow 2s ease infinite" }}>NODE<br />DODGE</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "#ffd700", letterSpacing: "4px", marginBottom: "40px" }}>30 SECOND MODE</div>
            <div style={{ display: "flex", gap: "32px", justifyContent: "center", marginBottom: "48px" }}>
              {[{ icon: "◉", label: "Dodge Nodes" }, { icon: "◆", label: "Collect Tokens" }, { icon: "⬡", label: "Claim XP On-Chain" }].map(({ icon, label }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.8rem", color: "#00ffb3", marginBottom: "6px" }}>{icon}</div>
                  <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.6rem", color: "#00ffb3" }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(0,255,180,0.35)", marginBottom: "28px" }}>Mouse · Arrow Keys · WASD</div>
            <button onClick={startGame} style={{ fontFamily: "Orbitron, monospace", fontSize: "1rem", fontWeight: 700, letterSpacing: "5px", color: "#020408", background: "#00ffb3", border: "none", padding: "18px 56px", cursor: "pointer", clipPath: "polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)", boxShadow: "0 0 40px rgba(0,255,180,0.4)" }}>▶ START</button>
          </div>
        </div>
      )}

      {/* GAME CANVAS */}
      <canvas ref={canvasRef} style={{ display: gameState === "playing" ? "block" : "none", width: "100%", height: "calc(100vh - 54px)", cursor: "none" }} />

      {/* RESULT */}
      {gameState === "done" && (
        <div style={{ position: "fixed", inset: 0, top: "54px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(2,4,8,0.97)", zIndex: 5, animation: "ndFade 0.4s ease" }}>
          <div style={{ position: "relative", textAlign: "center", animation: "ndPop 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <div style={{ fontFamily: "Orbitron, monospace", fontSize: "clamp(1.8rem,5vw,2.8rem)", fontWeight: 900, color: finalScore >= 300 ? "#00ffb3" : "#ff2244", letterSpacing: "6px", marginBottom: "28px", textShadow: `0 0 30px ${finalScore >= 300 ? "#00ffb3" : "#ff2244"}` }}>
              {finalScore >= 300 ? "EXCELLENT" : finalScore >= 100 ? "WELL PLAYED" : "GAME OVER"}
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "24px" }}>
              {[{ label: "SCORE", val: finalScore, color: "#ffd700" }, { label: "LEVEL", val: level, color: "#00ffb3" }, { label: "TIER", val: finalTier, color: "#aaa" }].map(({ label, val, color }) => (
                <div key={label} style={{ border: "1px solid rgba(0,255,180,0.2)", background: "rgba(0,255,180,0.04)", padding: "16px 24px", textAlign: "center" }}>
                  <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(0,255,180,0.4)", letterSpacing: "3px", marginBottom: "8px" }}>{label}</div>
                  <div style={{ fontFamily: "Orbitron, monospace", fontSize: "1.4rem", fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>

           <div style={{ border: "1px solid rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.05)", padding: "16px 40px", marginBottom: "8px", textAlign: "center" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(255,215,0,0.5)", letterSpacing: "3px", marginBottom: "6px" }}>XP EARNED</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "2.2rem", fontWeight: 900, color: "#ffd700", letterSpacing: "4px" }}>+{finalXP} XP</div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "8px", flexWrap: "wrap" }}>
                {noHits && <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#00ffb3", background: "rgba(0,255,180,0.08)", border: "1px solid rgba(0,255,180,0.2)", padding: "3px 8px" }}>✦ PERFECT +10</span>}
                {survivedRef.current && <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#ffd700", background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)", padding: "3px 8px" }}>⏱ SURVIVED +5</span>}
                {finalScore > parseInt(localStorage.getItem("nodedodge_best") || "0") && <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#ff00aa", background: "rgba(255,0,170,0.08)", border: "1px solid rgba(255,0,170,0.2)", padding: "3px 8px" }}>★ NEW BEST +5</span>}
                <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "#555", padding: "3px 8px" }}>MAX 50 XP/DAY</span>
              </div>
            </div>

            {claimError && (
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#ff2244", marginBottom: "8px", padding: "8px 16px", background: "rgba(255,34,68,0.08)", border: "1px solid rgba(255,34,68,0.2)" }}>
                {claimError}
              </div>
            )}

           <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "16px", flexWrap: "wrap" }}>
              <button
                onClick={claimStep === "idle" || claimStep === "error" ? claimXP : undefined}
                disabled={claimStep === "signing" || claimStep === "confirming" || claimStep === "done"}
                style={{ fontFamily: "Orbitron, monospace", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "2px", color: claimStep === "done" ? "#00ffb3" : "#020408", background: claimStep === "done" ? "transparent" : "#E8FF00", border: claimStep === "done" ? "1px solid #00ffb3" : "none", padding: "16px 32px", cursor: claimStep === "done" || claimStep === "signing" || claimStep === "confirming" ? "default" : "pointer", opacity: claimStep === "signing" || claimStep === "confirming" ? 0.7 : 1, minWidth: "200px", clipPath: claimStep === "done" ? "none" : "polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
                {claimLabel()}
              </button>
              <button onClick={() => router.push("/lobby")}
                style={{ fontFamily: "Orbitron, monospace", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "2px", color: "#00ffb3", background: "transparent", border: "1px solid rgba(0,255,180,0.3)", padding: "16px 32px", cursor: "pointer", minWidth: "200px" }}>
                ← RETURN TO LOBBY
              </button>
            </div>
            {nextAttempt && (
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "rgba(0,255,180,0.35)", marginBottom: "8px", letterSpacing: "2px" }}>
                Next attempt in: <span style={{ color: "#00ffb3" }}>{nextAttempt}</span>
              </div>
            )}
            {claimStep === "confirming" && txHash && (
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "rgba(0,255,180,0.4)", marginTop: "8px" }}>
                TX: <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: "#00ffb3" }}>{txHash.slice(0, 20)}...</a>
              </div>
            )}
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.5rem", color: "rgba(0,255,180,0.2)", marginTop: "8px" }}>XP recorded on Base Sepolia blockchain</div>
          </div>
        </div>
      )}
    </div>
  );
}