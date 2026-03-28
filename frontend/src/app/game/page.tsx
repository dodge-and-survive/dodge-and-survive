"use client";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

type Phase = "connecting" | "waiting" | "round" | "result" | "eliminated" | "winner";
type RoundType = "safe_path" | "memory_flash" | "minefield" | "btc_oracle" | "final_round";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ── Audio ──────────────────────────────────────────────────
const useSound = () => {
  const ctx = useRef<AudioContext | null>(null);
  const getCtx = () => {
    if (!ctx.current) ctx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctx.current;
  };
  const beep = useCallback((freq: number, dur: number, type: OscillatorType = "sine", vol = 0.3) => {
    try {
      const ac = getCtx();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.start(); o.stop(ac.currentTime + dur);
    } catch {}
  }, []);
  const tap = useCallback(() => beep(800, 0.08, "square", 0.2), [beep]);
  const success = useCallback(() => { beep(523, 0.1); setTimeout(() => beep(659, 0.1), 100); setTimeout(() => beep(784, 0.2), 200); }, [beep]);
  const fail = useCallback(() => beep(200, 0.3, "sawtooth", 0.3), [beep]);
  const tick = useCallback(() => beep(440, 0.06, "square", 0.1), [beep]);
  const go = useCallback(() => { beep(1000, 0.05); setTimeout(() => beep(1200, 0.05), 60); setTimeout(() => beep(1400, 0.15), 120); }, [beep]);
  const eliminated = useCallback(() => beep(200, 0.4, "sawtooth", 0.3), [beep]);
  return { tap, success, fail, tick, go, eliminated };
};

// ── Round 1: Split Decision ────────────────────────────────
function SplitDecision({ onChoice, choice }: { onChoice: (c: string) => void; choice: string | null }) {
  const [resolved, setResolved] = useState<{ trap: string; picked: string } | null>(null);
  const snd = useSound();

  const pick = (side: string) => {
    if (choice) return;
    snd.tap();
    onChoice(side);
  };

  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: "480px", margin: "0 auto" }}>
      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#E8FF00", letterSpacing: "0.3em", marginBottom: "12px" }}>ROUND 1 OF 5</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "4rem", color: "white", lineHeight: 0.9, marginBottom: "8px" }}>SPLIT<br />DECISION</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.3rem", color: "#666", letterSpacing: "0.3em", marginBottom: "28px" }}>MAJORITY SIDE LOSES</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        {[
          { side: "left", icon: "←", color: "#00D4FF", label: "LEFT" },
          { side: "right", icon: "→", color: "#A855F7", label: "RIGHT" },
        ].map(({ side, icon, color, label }) => {
          const isChosen = choice === side;
          return (
            <button key={side} onClick={() => pick(side)} disabled={!!choice}
              style={{ padding: "36px 20px", border: `1px solid ${isChosen ? color : color + "33"}`, background: isChosen ? color + "1a" : color + "08", cursor: choice ? "not-allowed" : "pointer", textAlign: "center", transition: "all 0.2s", clipPath: "polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))", transform: isChosen ? "scale(1.02)" : "scale(1)" }}>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "2.4rem", fontWeight: 900, color, marginBottom: "10px", lineHeight: 1 }}>{icon}</div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.2rem", letterSpacing: "0.2em", color }}>{label}</div>
            </button>
          );
        })}
      </div>
      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: choice ? "#E8FF00" : "#555", textAlign: "center", minHeight: "20px", letterSpacing: "0.1em" }}>
        {choice ? `Locked in — ${choice.toUpperCase()} chosen` : "Pick your side — majority loses"}
      </div>
    </div>
  );
}

// ── Round 2: Memory Trace ──────────────────────────────────
function MemoryTrace({ onChoice, choice, seed }: { onChoice: (c: string) => void; choice: string | null; seed?: any }) {
  const [phase, setPhase] = useState<"watch" | "input" | "done">("watch");
  const [seq, setSeq] = useState<number[]>([]);
  const [input, setInput] = useState<number[]>([]);
  const [flashing, setFlashing] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  const snd = useSound();

  useEffect(() => {
    // Use seed safe tiles if provided, else generate locally
    let sequence: number[];
    if (seed?.safeTiles && seed.safeTiles.length >= 3) {
      sequence = seed.safeTiles.slice(0, 3);
    } else {
      const pool = [0,1,2,3,4,5];
      sequence = [];
      for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        sequence.push(pool.splice(idx, 1)[0]);
      }
    }
    setSeq(sequence);
    let i = 0;
    const flashNext = () => {
      if (i >= sequence.length) {
        setFlashing(null);
        setPhase("input");
        return;
      }
      setFlashing(sequence[i]);
      setTimeout(() => { setFlashing(null); setTimeout(flashNext, 300); }, 700);
      i++;
    };
    setTimeout(flashNext, 800);
  }, []);

  const tapTile = (tile: number) => {
    if (phase !== "input" || choice) return;
    const expected = seq[input.length];
    if (tile === expected) {
      snd.tap();
      const newInput = [...input, tile];
      setInput(newInput);
      setSelected(prev => [...prev, tile]);
      if (newInput.length === seq.length) {
        setPhase("done");
        onChoice(newInput.join(","));
      }
    } else {
      snd.fail();
      setWrong(tile);
      setTimeout(() => setWrong(null), 400);
      setPhase("done");
      onChoice("wrong");
    }
  };

  const dotActive = (i: number) => input.length > i || (phase === "watch" && flashing !== null && seq.indexOf(flashing) >= i);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#E8FF00", letterSpacing: "0.3em", marginBottom: "12px" }}>ROUND 2 OF 5</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "4rem", color: "white", lineHeight: 0.9, marginBottom: "8px" }}>MEMORY<br />TRACE</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.3rem", color: "#666", letterSpacing: "0.3em", marginBottom: "16px" }}>REPEAT THE SEQUENCE</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", color: phase === "watch" ? "#00D4FF" : "#E8FF00", letterSpacing: "0.2em", marginBottom: "12px" }}>
        {phase === "watch" ? "WATCH SEQUENCE" : phase === "input" ? "YOUR TURN" : "DONE"}
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "16px" }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: input.length > i ? "#00D4FF" : "#1a1a2a", transition: "background 0.2s" }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", maxWidth: "300px", margin: "0 auto 16px" }}>
        {[0,1,2,3,4,5].map(tile => {
          const isFlashing = flashing === tile;
          const isSel = selected.includes(tile);
          const isWrong = wrong === tile;
          return (
            <button key={tile} onClick={() => tapTile(tile)} disabled={phase !== "input" || !!choice}
              style={{ width: "88px", height: "88px", border: `1px solid ${isFlashing ? "#00D4FF" : isSel ? "#00D4FF" : isWrong ? "#FF2B2B" : "#1a1a2a"}`, background: isFlashing ? "rgba(0,212,255,0.4)" : isSel ? "rgba(0,212,255,0.1)" : isWrong ? "rgba(255,43,43,0.15)" : "#08080d", cursor: phase === "input" ? "pointer" : "default", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Orbitron, monospace", fontSize: "1.4rem", fontWeight: 900, color: isFlashing ? "#00D4FF" : isSel ? "#00D4FF" : "#333", animation: isWrong ? "shake 0.3s ease" : "none" }}>
              {tile + 1}
            </button>
          );
        })}
      </div>
      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555", letterSpacing: "0.1em" }}>
        {phase === "watch" ? "Watch carefully..." : phase === "input" ? `Tap the sequence in order (${input.length}/${seq.length})` : choice === "wrong" ? "Wrong sequence!" : "Correct!"}
      </div>
    </div>
  );
}

// ── Round 3: Timing Tap ────────────────────────────────────
function TimingTap({ onChoice, choice }: { onChoice: (c: string) => void; choice: string | null }) {
  const [needlePos, setNeedlePos] = useState(0);
  const [tapDone, setTapDone] = useState(false);
  const [result, setResult] = useState<"hit" | "miss" | null>(null);
  const [zoneStart] = useState(() => 20 + Math.random() * 30);
  const needleRef = useRef(0);
  const dirRef = useRef(1);
  const animRef = useRef<number | null>(null);
  const snd = useSound();

  useEffect(() => {
    if (choice) return;
    const animate = () => {
      needleRef.current += dirRef.current * 0.9;
      if (needleRef.current >= 97) { needleRef.current = 97; dirRef.current = -1; }
      if (needleRef.current <= 0) { needleRef.current = 0; dirRef.current = 1; }
      setNeedlePos(needleRef.current);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [choice]);

  const doTap = () => {
    if (tapDone || choice) return;
    setTapDone(true);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const hit = needleRef.current >= zoneStart && needleRef.current <= zoneStart + 18;
    setResult(hit ? "hit" : "miss");
    if (hit) snd.success(); else snd.fail();
    onChoice(hit ? "hit" : "miss");
  };

  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: "420px", margin: "0 auto" }}>
      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#E8FF00", letterSpacing: "0.3em", marginBottom: "12px" }}>ROUND 3 OF 5</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "4rem", color: "white", lineHeight: 0.9, marginBottom: "8px" }}>TIMING<br />TAP</div>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.3rem", color: "#666", letterSpacing: "0.3em", marginBottom: "28px" }}>HIT THE GREEN ZONE</div>

      <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "#333", letterSpacing: "0.1em", marginBottom: "6px" }}>SURVIVAL ZONE ↓</div>
      <div onClick={doTap} style={{ height: "64px", background: "#08080d", border: "1px solid #1a1a2a", position: "relative", overflow: "hidden", marginBottom: "6px", cursor: "pointer" }}>
        {/* Safe zone */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${zoneStart}%`, width: "18%", background: "rgba(0,255,136,0.15)", borderLeft: "2px solid #00FF88", borderRight: "2px solid #00FF88" }} />
        {/* Needle */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${needlePos}%`, width: "3px", background: result === "hit" ? "#00FF88" : result === "miss" ? "#FF2B2B" : "#E8FF00", boxShadow: `0 0 12px ${result === "hit" ? "#00FF88" : result === "miss" ? "#FF2B2B" : "#E8FF00"}`, transition: "background 0.2s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "#222", letterSpacing: "0.05em", marginBottom: "20px" }}>
        <span>DANGER</span><span>← SAFE ZONE →</span><span>DANGER</span>
      </div>

      <button onClick={doTap} disabled={tapDone}
        style={{ width: "100%", padding: "28px", background: "transparent", border: `1px solid ${tapDone ? "#1a1a2a" : "#1a1a2a"}`, color: tapDone ? "#333" : "#444", fontFamily: "Bebas Neue, sans-serif", fontSize: "2rem", letterSpacing: "0.3em", cursor: tapDone ? "not-allowed" : "pointer", transition: "all 0.1s" }}>
        TAP NOW
      </button>

      {result && (
        <div style={{ fontFamily: "Orbitron, monospace", fontSize: "1.4rem", fontWeight: 700, marginTop: "16px", color: result === "hit" ? "#00FF88" : "#FF2B2B" }}>
          {result === "hit" ? "PERFECT HIT" : "MISSED ZONE"}
        </div>
      )}
      {!tapDone && <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#333", marginTop: "12px" }}>Tap when needle is in the green zone</div>}
    </div>
  );
}

// ── Round 4: BTC Oracle ────────────────────────────────────
function BTCOracle({ onChoice, choice }: { onChoice: (c: string) => void; choice: string | null }) {
  const snd = useSound();
  // 5 states: intro → input → lock → wait → result
  const [step, setStep] = useState<"intro" | "input" | "lock" | "wait" | "result">("intro");
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [btcHistory, setBtcHistory] = useState<number[]>([]);
  const [cd, setCd] = useState(5);
  const [localChoice, setLocalChoice] = useState<string | null>(null);
  const [btcStart, setBtcStart] = useState<number | null>(null);
  const [btcEnd, setBtcEnd] = useState<number | null>(null);
  const [wentUp, setWentUp] = useState<boolean | null>(null);
  const priceIntRef = useRef<NodeJS.Timeout | null>(null);
  const cdIntRef = useRef<NodeJS.Timeout | null>(null);
  const stepRef = useRef(step);

  useEffect(() => { stepRef.current = step; }, [step]);

  const fetchPrice = async (): Promise<number> => {
    try {
      const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
      const data = await res.json();
      return parseFloat(data.price);
    } catch { return 0; }
  };

  // STEP 1: intro 3s → start input phase
  useEffect(() => {
   const t = setTimeout(async () => {
      const startPrice = await fetchPrice();
      setBtcStart(startPrice);
      setBtcPrice(startPrice);
      setBtcHistory([startPrice]);
      setStep("input");
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  // STEP 2: input phase — live price + 5s countdown
  useEffect(() => {
    if (step !== "input") return;
    // live price updates
    priceIntRef.current = setInterval(async () => {
      const p = await fetchPrice();
      if (p > 0) {
        setBtcPrice(p);
        setBtcHistory(prev => [...prev.slice(-39), p]);
      }
    }, 2000);
    // 5-second countdown
    let remaining = 4;
    setCd(remaining);
    cdIntRef.current = setInterval(() => {
      remaining--;
      setCd(remaining);
      if (remaining <= 3) snd.tick();
      if (remaining <= 0) {
        clearInterval(cdIntRef.current!);
        clearInterval(priceIntRef.current!);
        // lock whatever was picked (or null)
        setStep("lock");
      }
    }, 1000);
    return () => {
      clearInterval(priceIntRef.current!);
      clearInterval(cdIntRef.current!);
    };
  }, [step]);

  // STEP 3: lock → wait 2.5s → fetch end price → result
  useEffect(() => {
    if (step !== "lock") return;
  const t = setTimeout(async () => {
      const endPrice = await fetchPrice();
      setBtcEnd(endPrice);
      const up = btcStart !== null && endPrice > btcStart;
      setWentUp(up);
      setStep("result");
    }, 6000);
    return () => clearTimeout(t);
  }, [step]);

  // Submit choice to backend immediately when locked
  useEffect(() => {
    if (step !== "lock") return;
    onChoice(localChoice || "none");
  }, [step]);

  // STEP 4: result shown — just display, no need to notify again
  useEffect(() => {
    if (step !== "result" || wentUp === null) return;
    const correct = localChoice !== null && ((localChoice === "UP" && wentUp) || (localChoice === "DOWN" && !wentUp));
    const t = setTimeout(() => {
      // result already submitted at lock step
    }, 2000);
    if (correct) snd.success(); else snd.fail();
    return () => clearTimeout(t);
  }, [step, wentUp]);

  const pick = (dir: string) => {
    if (localChoice || step !== "input") return;
    snd.tap();
    setLocalChoice(dir);
    // don't lock yet — wait for timer to run out
  };

  const chartPoints = btcHistory.length > 1
    ? btcHistory.map((p, i) => {
        const x = (i / (btcHistory.length - 1)) * 300;
        const min = Math.min(...btcHistory);
        const max = Math.max(...btcHistory);
        const y = max === min ? 40 : 55 - ((p - min) / (max - min)) * 50;
        return `${x},${y}`;
      }).join(" ")
    : "0,40 300,40";

  const correct = wentUp !== null && localChoice !== null && ((localChoice === "UP" && wentUp) || (localChoice === "DOWN" && !wentUp));

  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: "420px", margin: "0 auto" }}>

      {/* STATE 1: INTRO */}
      {step === "intro" && (
        <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.65rem", color: "#555", letterSpacing: "0.4em", marginBottom: "20px" }}>⚠ ROUND 4 OF 5 ⚠</div>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "clamp(2.4rem,9vw,4rem)", color: "#E8FF00", letterSpacing: "0.3em", lineHeight: 1.05, textAlign: "center", textShadow: "0 0 40px rgba(232,255,0,0.8), 0 0 80px rgba(232,255,0,0.4)" }}>
            PREDICT BTC<br />UP OR DOWN
          </div>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "#ccc", letterSpacing: "0.25em", marginTop: "20px" }}>WATCH THE CHART · PICK YOUR DIRECTION</div>
        </div>
      )}

      {/* STATES 2-5: shared chart header */}
      {step !== "intro" && (
        <>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#E8FF00", letterSpacing: "0.3em", marginBottom: "12px" }}>ROUND 4 OF 5</div>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "4rem", color: "white", lineHeight: 0.9, marginBottom: "16px" }}>BTC ORACLE</div>

          {/* Price + countdown row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "12px" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "#333", letterSpacing: "0.15em", marginBottom: "4px" }}>BTC / USDT</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "2rem", fontWeight: 900, color: "#E8FF00" }}>
                {btcEnd !== null ? `$${btcEnd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : btcPrice ? `$${btcPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "LOADING..."}
              </div>
            </div>
            {step === "input" && (
              <div style={{ textAlign: "center" }}>
                <div key={cd} style={{ fontFamily: "Orbitron, monospace", fontSize: "3.5rem", fontWeight: 900, lineHeight: 1, color: cd <= 2 ? "#FF2B2B" : cd <= 3 ? "#FF8C00" : "#E8FF00", transition: "color 0.3s", animation: "cdPop 0.25s cubic-bezier(0.34,1.56,0.64,1)" }}>{cd}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "#444", letterSpacing: "0.15em" }}>SECONDS</div>
              </div>
            )}
          </div>

          {/* Chart */}
          <div style={{ height: "80px", border: "1px solid #1a1a2a", background: "#08080d", position: "relative", overflow: "hidden", marginBottom: "16px" }}>
            <svg width="100%" height="100%" viewBox="0 0 300 60" preserveAspectRatio="none">
              <polyline points={chartPoints} fill="none" stroke={step === "result" ? (wentUp ? "#00FF88" : "#FF2B2B") : "#888"} strokeWidth="2" />
            </svg>
            <div style={{ position: "absolute", top: "8px", left: "10px", fontFamily: "Space Mono, monospace", fontSize: "0.45rem", color: "#222", letterSpacing: "0.1em" }}>LIVE PRICE MOVEMENT</div>
          </div>

          {/* STATE 2: INPUT — buttons + countdown */}
          {step === "input" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { label: "PUMP", sub: "PRICE GOES UP", dir: "UP", icon: "↑", color: "#00FF88" },
                { label: "DUMP", sub: "PRICE GOES DOWN", dir: "DOWN", icon: "↓", color: "#FF2B2B" },
              ].map(({ label, sub, dir, icon, color }) => {
                const isChosen = localChoice === dir;
                return (
                  <button key={dir} onClick={() => pick(dir)} disabled={!!localChoice}
                    style={{ padding: "28px 20px", border: `2px solid ${isChosen ? color : color + "33"}`, background: isChosen ? color + "22" : color + "08", color, cursor: localChoice ? "not-allowed" : "pointer", transition: "all 0.2s", textAlign: "center", clipPath: "polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))", boxShadow: isChosen ? `0 0 20px ${color}44` : "none" }}>
                    <div style={{ fontSize: "2.4rem", marginBottom: "6px" }}>{icon}</div>
                    <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.6rem", letterSpacing: "0.25em" }}>{label}</div>
                    <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.45rem", letterSpacing: "0.1em", opacity: 0.5, marginTop: "4px" }}>{sub}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* STATE 3: LOCK */}
          {step === "lock" && (
            <div style={{ textAlign: "center", paddingTop: "16px" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#333", letterSpacing: "0.25em", marginBottom: "16px" }}>YOUR PREDICTION</div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "4rem", letterSpacing: "0.3em", color: localChoice === "UP" ? "#00FF88" : localChoice === "DOWN" ? "#FF2B2B" : "#555", marginBottom: "8px" }}>
                {localChoice === "UP" ? "PUMP ↑" : localChoice === "DOWN" ? "DUMP ↓" : "NO PICK"}
              </div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2rem", color: "#E8FF00", letterSpacing: "0.3em", marginBottom: "12px" }}>LOCKED IN</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555" }}>Fetching final price...</div>
            </div>
          )}

          {/* STATE 4: WAIT */}
          {step === "wait" && (
            <div style={{ textAlign: "center", paddingTop: "16px" }}>
              <div style={{ width: "40px", height: "40px", border: "3px solid #1a1a2a", borderTop: "3px solid #E8FF00", borderRadius: "50%", margin: "0 auto 16px", animation: "spinAnim 1s linear infinite" }} />
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#555" }}>Calculating result...</div>
            </div>
          )}

          {/* STATE 5: RESULT */}
          {step === "result" && wentUp !== null && (
            <div style={{ textAlign: "center", paddingTop: "8px", animation: "slideUp 0.4s ease" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#333", letterSpacing: "0.25em", marginBottom: "16px" }}>FINAL RESULT</div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2.5rem", letterSpacing: "0.2em", color: wentUp ? "#00FF88" : "#FF2B2B", marginBottom: "8px" }}>
                {wentUp ? "BTC WENT UP ↑" : "BTC WENT DOWN ↓"}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "16px" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555" }}>
                  Start: <span style={{ color: "#aaa" }}>${btcStart?.toLocaleString("en-US", { maximumFractionDigits: 0 }) ?? "—"}</span>
                </div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555" }}>
                  End: <span style={{ color: "#aaa" }}>${btcEnd?.toLocaleString("en-US", { maximumFractionDigits: 0 }) ?? "—"}</span>
                </div>
              </div>
              <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "5rem", letterSpacing: "0.2em", color: !localChoice ? "#555" : correct ? "#00FF88" : "#FF2B2B", textShadow: !localChoice ? "none" : correct ? "0 0 40px rgba(0,255,136,0.5)" : "0 0 40px rgba(255,43,43,0.5)", animation: "scaleIn 0.4s ease" }}>
                {!localChoice ? "NO PICK ✗" : correct ? "CORRECT ✓" : "WRONG ✗"}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Round 5: Reaction Race ─────────────────────────────────
function ReactionRace({ onChoice, choice }: { onChoice: (c: string) => void; choice: string | null }) {
  const [screen, setScreen] = useState<"intro" | "countdown" | "wait" | "go" | "result">("intro");
  const [cdNum, setCdNum] = useState(3);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [rank, setRank] = useState("");
  const [rankColor, setRankColor] = useState("#E8FF00");
  const reactStartRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const snd = useSound();

  useEffect(() => {
    if (choice) return;
    // Intro 1.5s
    setTimeout(() => {
      setScreen("countdown");
      let cd = 3;
      setCdNum(cd);
      snd.tick();
      const cdInt = setInterval(() => {
        cd--;
        if (cd > 0) { setCdNum(cd); snd.tick(); }
        else {
          clearInterval(cdInt);
          setScreen("wait");
          const delay = 1000 + Math.random() * 2000;
          setTimeout(() => {
            if (doneRef.current) return;
            setScreen("go");
            snd.go();
            reactStartRef.current = performance.now();
            setTimeout(() => { if (!doneRef.current) handleSlow(); }, 1500);
          }, delay);
        }
      }, 1000);
    }, 1500);
  }, []);

  const handleReact = () => {
    if (choice || doneRef.current) return;
    if (!reactStartRef.current) { snd.fail(); return; }
    doneRef.current = true;
    snd.tap();
    const rt = (performance.now() - reactStartRef.current) / 1000;
    setReactionTime(rt);
    setScreen("result");
    let r = "", rc = "#E8FF00", won = true;
    if (rt < 0.3) { r = "LIGHTNING — TOP 5"; rc = "#00FF88"; snd.success(); }
    else if (rt < 0.6) { r = "FAST — TOP 5 SURVIVOR"; rc = "#00FF88"; snd.success(); }
    else if (rt < 1.0) { r = "AVERAGE — BORDERLINE"; rc = "#E8FF00"; }
    else { r = "TOO SLOW — ELIMINATED"; rc = "#FF2B2B"; won = false; snd.fail(); }
    setRank(r);
    setRankColor(rc);
    onChoice(rt < 1.0 ? `react:${rt.toFixed(3)}` : `slow:${rt.toFixed(3)}`);
  };

  const handleSlow = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setScreen("result");
    setRank("ELIMINATED");
    setRankColor("#FF2B2B");
    snd.fail();
    onChoice("noReact");
  };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#030305" }} onClick={screen === "wait" || screen === "go" ? handleReact : undefined}>
      {screen === "intro" && (
        <>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1rem", color: "#333", letterSpacing: "0.4em", marginBottom: "16px" }}>FINAL ROUND</div>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "5rem", color: "#E8FF00", letterSpacing: "0.25em", lineHeight: 0.9, textAlign: "center", marginBottom: "8px" }}>REACTION<br />RACE</div>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.3rem", color: "#555", letterSpacing: "0.25em", marginTop: "16px" }}>TAP WHEN IT FLASHES</div>
        </>
      )}
      {screen === "countdown" && (
        <div style={{ fontFamily: "Orbitron, monospace", fontSize: "14rem", fontWeight: 900, color: "#E8FF00", lineHeight: 1, animation: "cdPop 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>{cdNum}</div>
      )}
      {screen === "wait" && (
        <>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: "#222", letterSpacing: "0.4em", marginBottom: "24px" }}>STAND BY...</div>
          <div style={{ width: "60px", height: "60px", borderRadius: "50%", border: "2px solid #111", animation: "waitPulse 1s ease infinite" }} />
        </>
      )}
      {screen === "go" && (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(232,255,0,0.06)", border: "3px solid #E8FF00" }}>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "10rem", color: "#E8FF00", lineHeight: 0.9, textAlign: "center", letterSpacing: "0.25em", animation: "goPop 0.15s cubic-bezier(0.34,1.56,0.64,1)" }}>TAP<br />NOW</div>
        </div>
      )}
      {screen === "result" && (
        <>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#333", letterSpacing: "0.25em", marginBottom: "12px" }}>REACTION TIME</div>
          <div style={{ fontFamily: "Orbitron, monospace", fontSize: "5rem", fontWeight: 900, lineHeight: 1, marginBottom: "12px", color: rankColor }}>
            {reactionTime !== null ? `${reactionTime.toFixed(3)}s` : "NO REACT"}
          </div>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", letterSpacing: "0.2em", color: rankColor }}>{rank}</div>
        </>
      )}
    </div>
  );
}

// ── Main Game Page ─────────────────────────────────────────
export default function GamePage() {
  const { address } = useAccount();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const addressRef = useRef<string | undefined>(undefined);
  const snd = useSound();

  const [phase, setPhase] = useState<Phase>("connecting");
  const [currentRound, setCurrentRound] = useState(0);
  const [roundType, setRoundType] = useState<RoundType>("safe_path");
  const [choice, setChoice] = useState<string | null>(null);
  const [countdownState, setCountdownState] = useState(15);
  const [activePlayers, setActivePlayers] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [isEliminated, setIsEliminated] = useState(false);
  const [waitingDots, setWaitingDots] = useState(".");
  const [phaseIn, setPhaseIn] = useState(false);
  const [roundSeed, setRoundSeed] = useState<any>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const isEliminatedRef = useRef(false);
  const lastCountRef = useRef(15);

  useEffect(() => { addressRef.current = address; }, [address]);
  useEffect(() => {
    const i = setInterval(() => setWaitingDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    setPhaseIn(false);
    const t = setTimeout(() => setPhaseIn(true), 50);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      const addr = addressRef.current;
      if (addr) socket.emit("join_game", { address: addr });
    });
    socket.on("game_joined", ({ playerCount: pc }: any) => { setPlayerCount(pc); setActivePlayers(pc); setPhase("waiting"); });
    socket.on("player_count", ({ count }: any) => setPlayerCount(count));
    socket.on("game_started", ({ playerCount: pc }: any) => { setPlayerCount(pc); setActivePlayers(pc); });

    socket.on("round_start", ({ round, type, choiceWindowMs, activePlayers: ap, seed }: any) => {
      if (isEliminatedRef.current) return;
      setCurrentRound(round);
      setRoundType(type);
      setActivePlayers(ap);
      setChoice(null);
      setRoundSeed(seed || null);
      setPhase("round");
      const seconds = Math.floor(choiceWindowMs / 1000);
      lastCountRef.current = seconds;
      setCountdownState(seconds);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdownState(prev => {
          const next = prev <= 1 ? 0 : prev - 1;
          if (next <= 3 && next > 0) snd.tick();
          if (next <= 0 && countdownRef.current) clearInterval(countdownRef.current);
          return next;
        });
      }, 1000);
    });

    socket.on("round_result", ({ round, eliminated: elim, remaining: rem }: any) => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setRemaining(rem);
      setCurrentRound(round);
      const roundXP: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
      let total = 10;
const myAddr = addressRef.current?.toLowerCase();
const iElim = myAddr && elim.map((a: string) => a.toLowerCase()).includes(myAddr);
const survivedRounds = iElim ? round - 1 : round;
for (let r = 1; r <= survivedRounds; r++) total += (roundXP[r] || 0);
if (!iElim && round === 5) total += 100;
setXpEarned(total);
      const iGotEliminated = myAddr && elim.map((a: string) => a.toLowerCase()).includes(myAddr);
      if (iGotEliminated) {
        isEliminatedRef.current = true;
        setIsEliminated(true);
        snd.eliminated();
        setPhase("eliminated");
      } else {
        snd.success();
        setPhase("result");
      }
    });

    socket.on("game_limit_reached", ({ message }: any) => { alert(message); router.push("/lobby"); });
    socket.on("game_finished", ({ winners: w }: any) => {
      if (isEliminatedRef.current) return;
      const myAddr = addressRef.current?.toLowerCase();
      if (myAddr && w.map((a: string) => a.toLowerCase()).includes(myAddr)) {
        snd.success(); setPhase("winner");
      } else {
        snd.eliminated(); setPhase("eliminated");
      }
    });

    return () => { socket.disconnect(); if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [address]);

  const handleChoice = (c: string) => {
    if (choice || !socketRef.current || isEliminated) return;
    setChoice(c);
    socketRef.current.emit("submit_choice", { choice: c });
  };

  const startGame = () => {
    if (socketRef.current) { snd.tap(); socketRef.current.emit("start_game"); }
  };

  const urgentCountdown = countdownState <= 5;
  const maxTime = lastCountRef.current || 15;

  return (
    <div style={{ background: "#030305", minHeight: "100vh", fontFamily: "Space Mono, monospace", overflow: "hidden" }}>
      <style suppressHydrationWarning>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Orbitron:wght@400;700;900&display=swap');
        @keyframes cdPop { from{transform:scale(1.4);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes goPop { from{transform:scale(1.3);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes waitPulse { 0%,100%{transform:scale(1);border-color:#111} 50%{transform:scale(1.2);border-color:#333} }
        @keyframes btcGlow { from{text-shadow:0 0 20px #E8FF00,0 0 40px #E8FF00} to{text-shadow:0 0 40px #E8FF00,0 0 80px #E8FF00,0 0 120px rgba(232,255,0,0.4)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scaleIn { from{transform:scale(0.8);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes winnerPulse { 0%,100%{text-shadow:0 0 20px rgba(232,255,0,0.5)} 50%{text-shadow:0 0 60px rgba(232,255,0,1)} }
        @keyframes spinAnim { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 8px rgba(232,255,0,0.3)} 50%{box-shadow:0 0 24px rgba(232,255,0,0.8)} }
        @keyframes dotBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes countPulse { 0%{transform:scale(1)} 50%{transform:scale(1.2)} 100%{transform:scale(1)} }
        @keyframes rdFill { from{width:0} to{width:100%} }
        body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.04) 2px,rgba(0,0,0,0.04) 4px);pointer-events:none;z-index:9999;}
        .game-btn { transition: all 0.15s ease; }
        .game-btn:hover:not(:disabled) { transform: scale(1.04); }
        .game-btn:active:not(:disabled) { transform: scale(0.96); }
        @media (max-width: 600px) {
          .round-badges { display: none !important; }
          .game-content { padding: 20px 14px !important; }
          .stats-row { gap: 8px !important; }
          .stat-card { padding: 12px 16px !important; }
        }
      `}</style>

      {/* TOP NAV */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", height: "54px", borderBottom: "1px solid #1a1a2a", background: "rgba(3,3,5,0.98)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", color: "#E8FF00", letterSpacing: "0.25em" }}>STAKE & SURVIVE</div>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          {phase === "round" && (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.42rem", color: "#333", letterSpacing: "0.1em", textTransform: "uppercase" }}>Round</div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.9rem", fontWeight: 700, color: "#E8FF00" }}>{currentRound}/5</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.42rem", color: "#333", letterSpacing: "0.1em", textTransform: "uppercase" }}>Alive</div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "0.9rem", fontWeight: 700, color: "white" }}>{activePlayers}</div>
              </div>
            </>
          )}
          {/* Circular timer */}
          {phase === "round" && (
            <div style={{ position: "relative", width: "46px", height: "46px" }}>
              <svg width="46" height="46" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="23" cy="23" r="19" fill="none" stroke="#111" strokeWidth="2.5" />
                <circle cx="23" cy="23" r="19" fill="none" stroke={urgentCountdown ? "#FF2B2B" : "#E8FF00"} strokeWidth="2.5" strokeDasharray="119.4" strokeDashoffset={119.4 * (1 - countdownState / maxTime)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Orbitron, monospace", fontSize: "0.85rem", fontWeight: 700, color: urgentCountdown ? "#FF2B2B" : "#E8FF00", animation: urgentCountdown ? "countPulse 1s ease infinite" : "none" }}>{countdownState}</div>
            </div>
          )}
          {phase !== "round" && (
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#333" }}>{address?.slice(0,6)}...{address?.slice(-4)}</div>
          )}
        </div>
      </div>

      {/* ROUND PROGRESS BAR */}
      {phase === "round" && (
        <div style={{ display: "flex", gap: "6px", padding: "10px 20px", borderBottom: "1px solid #0a0a14", background: "rgba(3,3,5,0.9)" }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ flex: 1, height: "3px", background: i < currentRound - 1 ? "#E8FF00" : i === currentRound - 1 ? "#1a1a2a" : "#0f0f1a", position: "relative", overflow: "hidden" }}>
              {i === currentRound - 1 && <div style={{ position: "absolute", left: 0, top: 0, height: "100%", background: "#E8FF00", animation: "rdFill 15s linear forwards" }} />}
            </div>
          ))}
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="game-content" style={{ maxWidth: "640px", margin: "0 auto", padding: "40px 24px", animation: phaseIn ? "fadeIn 0.4s ease" : "none" }}>

        {/* CONNECTING */}
        {phase === "connecting" && (
          <div style={{ textAlign: "center", paddingTop: "100px" }}>
            <div style={{ width: "48px", height: "48px", border: "3px solid #1a1a2a", borderTop: "3px solid #E8FF00", borderRadius: "50%", margin: "0 auto 24px", animation: "spinAnim 1s linear infinite" }} />
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.5rem", color: "#555" }}>CONNECTING TO ARENA{waitingDots}</div>
          </div>
        )}

        {/* WAITING */}
        {phase === "waiting" && (
          <div style={{ textAlign: "center", paddingTop: "60px" }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#E8FF00", letterSpacing: "0.3em", marginBottom: "16px", animation: "dotBlink 1.5s ease infinite" }}>● LIVE</div>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "3.5rem", color: "white", lineHeight: 1, marginBottom: "8px" }}>ARENA LOBBY</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "#555", marginBottom: "48px" }}>Waiting for players to join</div>
            <div style={{ background: "#08080d", border: "1px solid #1a1a2a", padding: "32px", marginBottom: "32px" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.1em" }}>Players In Lobby</div>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: "5rem", fontWeight: 900, color: "#E8FF00", lineHeight: 1 }}>{playerCount}</div>
              <div style={{ display: "flex", gap: "4px", marginTop: "16px", justifyContent: "center" }}>
                {Array.from({ length: 20 }, (_, i) => (
                  <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: i < playerCount ? "#E8FF00" : "#1a1a2a", transition: "background 0.3s" }} />
                ))}
              </div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.55rem", color: "#555", marginTop: "8px" }}>Min 20 to start • Max 50</div>
            </div>
            <div style={{ background: "#08080d", border: "1px solid #1a1a2a", padding: "16px 20px", marginBottom: "28px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00FF88", animation: "pulse 1.5s ease infinite", flexShrink: 0 }} />
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "#aaa" }}>{address?.slice(0,6)}...{address?.slice(-4)}</div>
              <div style={{ marginLeft: "auto", fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#00FF88", letterSpacing: "0.1em" }}>READY</div>
            </div>
            <button onClick={startGame} className="game-btn" style={{ background: "#E8FF00", color: "#000", border: "none", padding: "18px 56px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.4rem", cursor: "pointer", letterSpacing: "0.08em", animation: "glow 2s ease infinite", clipPath: "polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))" }}>
              START GAME
            </button>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#333", marginTop: "12px" }}>You can start early for testing</div>
          </div>
        )}

        {/* ROUND UIs */}
        {phase === "round" && roundType === "safe_path" && (
          <SplitDecision onChoice={handleChoice} choice={choice} />
        )}
        {phase === "round" && roundType === "memory_flash" && (
          <MemoryTrace onChoice={handleChoice} choice={choice} seed={roundSeed} />
        )}
        {phase === "round" && roundType === "minefield" && (
          <TimingTap onChoice={handleChoice} choice={choice} />
        )}
        {phase === "round" && roundType === "btc_oracle" && (
          <BTCOracle onChoice={handleChoice} choice={choice} />
        )}
        {phase === "round" && roundType === "final_round" && (
          <ReactionRace onChoice={handleChoice} choice={choice} />
        )}

        {/* RESULT — SURVIVED */}
        {phase === "result" && (
          <div style={{ textAlign: "center", paddingTop: "40px", animation: "slideUp 0.5s ease" }}>
            <div style={{ fontSize: "4rem", marginBottom: "16px" }}>⚡</div>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "5rem", color: "#00FF88", lineHeight: 1, marginBottom: "8px", textShadow: "0 0 40px rgba(0,255,136,0.4)" }}>SURVIVED</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "#555", marginBottom: "32px" }}>Round {currentRound} complete</div>
            <div className="stats-row" style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "24px" }}>
              <div className="stat-card" style={{ background: "#08080d", border: "1px solid #1a1a2a", padding: "16px 28px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginBottom: "4px" }}>REMAINING</div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "2.5rem", fontWeight: 900, color: "white" }}>{remaining}</div>
              </div>
              <div className="stat-card" style={{ background: "#08080d", border: "1px solid rgba(0,255,136,0.2)", padding: "16px 28px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginBottom: "4px" }}>ROUNDS LEFT</div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "2.5rem", fontWeight: 900, color: "#00FF88" }}>{5 - currentRound}</div>
              </div>
            </div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#444", animation: "pulse 1.5s ease infinite" }}>
              {currentRound < 5 ? "⏳ Next round starting in 5 seconds..." : "⚡ Final results incoming..."}
            </div>
          </div>
        )}

        {/* ELIMINATED — kept exactly as before with XP display */}
        {phase === "eliminated" && (
          <div style={{ textAlign: "center", paddingTop: "60px", animation: "slideUp 0.5s ease" }}>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "6rem", color: "#FF2B2B", lineHeight: 1, marginBottom: "8px", textShadow: "0 0 60px rgba(255,43,43,0.6)", animation: "scaleIn 0.4s ease" }}>ELIMINATED</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "#555", marginBottom: "40px" }}>You were eliminated in Round {currentRound}.</div>
            <div className="stats-row" style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "40px" }}>
              <div className="stat-card" style={{ background: "#08080d", border: "1px solid rgba(232,255,0,0.2)", padding: "20px 32px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginBottom: "4px", letterSpacing: "0.1em" }}>XP EARNED</div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "3rem", fontWeight: 900, color: "#E8FF00" }}>+{xpEarned}</div>
              </div>
              <div className="stat-card" style={{ background: "#08080d", border: "1px solid rgba(255,43,43,0.2)", padding: "20px 32px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginBottom: "4px", letterSpacing: "0.1em" }}>SURVIVED</div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "3rem", fontWeight: 900, color: "#FF2B2B" }}>{Math.max(0, currentRound - 1)}/5</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => router.push("/lobby")} className="game-btn" style={{ background: "#E8FF00", color: "#000", border: "none", padding: "16px 36px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", cursor: "pointer", letterSpacing: "0.06em", clipPath: "polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))" }}>PLAY AGAIN</button>
              <button onClick={() => router.push("/leaderboard")} className="game-btn" style={{ background: "transparent", color: "#555", border: "1px solid #1a1a2a", padding: "16px 36px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", cursor: "pointer", letterSpacing: "0.06em" }}>LEADERBOARD</button>
            </div>
          </div>
        )}

        {/* WINNER */}
        {phase === "winner" && (
          <div style={{ textAlign: "center", paddingTop: "60px", animation: "slideUp 0.5s ease" }}>
            <div style={{ fontSize: "4rem", marginBottom: "16px" }}>🏆</div>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "6rem", color: "#E8FF00", lineHeight: 1, marginBottom: "8px", animation: "winnerPulse 2s ease infinite" }}>WINNER!</div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.85rem", color: "#aaa", marginBottom: "40px" }}>You survived all 5 rounds. You are a Final Survivor.</div>
            <div className="stats-row" style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "40px" }}>
              <div className="stat-card" style={{ background: "#08080d", border: "1px solid rgba(232,255,0,0.3)", padding: "20px 32px", textAlign: "center", boxShadow: "0 0 24px rgba(232,255,0,0.08)" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginBottom: "4px", letterSpacing: "0.1em" }}>XP EARNED</div>
                <div style={{ fontFamily: "Orbitron, monospace", fontSize: "3rem", fontWeight: 900, color: "#E8FF00" }}>+{xpEarned}</div>
              </div>
              <div className="stat-card" style={{ background: "#08080d", border: "1px solid rgba(0,255,136,0.3)", padding: "20px 32px", textAlign: "center", boxShadow: "0 0 24px rgba(0,255,136,0.08)" }}>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "#555", marginBottom: "4px", letterSpacing: "0.1em" }}>STATUS</div>
                <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "2rem", color: "#00FF88" }}>FINAL<br />SURVIVOR</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => router.push("/lobby")} className="game-btn" style={{ background: "#E8FF00", color: "#000", border: "none", padding: "16px 36px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", cursor: "pointer", letterSpacing: "0.06em", animation: "glow 2s ease infinite", clipPath: "polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))" }}>PLAY AGAIN</button>
              <button onClick={() => router.push("/leaderboard")} className="game-btn" style={{ background: "transparent", color: "#aaa", border: "1px solid #1a1a2a", padding: "16px 36px", fontFamily: "Bebas Neue, sans-serif", fontSize: "1.2rem", cursor: "pointer", letterSpacing: "0.06em" }}>LEADERBOARD</button>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM STATUS BAR */}
      {phase === "round" && roundType !== "final_round" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(3,3,5,0.98)", backdropFilter: "blur(10px)", borderTop: "1px solid #1a1a2a", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: choice ? "#00FF88" : "#222", animation: choice ? "none" : "pulse 1s infinite" }} />
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: choice ? "#00FF88" : "#555", letterSpacing: "0.1em" }}>
              {choice ? "Choice locked — waiting for others" : "Make your choice..."}
            </span>
          </div>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "#333" }}>{activePlayers} players · Round {currentRound}/5</div>
        </div>
      )}
    </div>
  );
}