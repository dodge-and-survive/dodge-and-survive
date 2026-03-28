import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
const server = http.createServer(app);

export const io = new Server(server, {
  cors: { origin: "*", credentials: true },
});

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.get("/health", (_, res) => res.json({ status: "ok" }));

// ── BTC Price ──────────────────────────────────────────────
let btcPriceStart: number | null = null;

async function fetchBTCPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await res.json();
    return parseFloat(data.price);
  } catch {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await res.json();
      return data.bitcoin.usd;
    } catch { return 0; }
  }
}

// ── Weekly Cron Helpers ────────────────────────────────────
function getWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - new Date(Date.UTC(year, 0, 1)).getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function getWeekBounds(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

async function ensureCurrentWeekPeriod() {
  const { db } = await import("./db/client");
  const { weeklyPeriods } = await import("./db/schema");
  const { eq } = await import("drizzle-orm");
  const now = new Date();
  const weekId = getWeekId(now);
  const { start, end } = getWeekBounds(now);
  const [existing] = await db.select().from(weeklyPeriods).where(eq(weeklyPeriods.weekId, weekId));
  if (!existing) {
    await db.insert(weeklyPeriods).values({ weekId, weekStart: start, weekEnd: end, status: "active" } as any);
    console.log(`✅ Created week period: ${weekId}`);
  }
  return weekId;
}

async function lockWeek(weekId: string) {
  const { db } = await import("./db/client");
  const { weeklyPeriods, users } = await import("./db/schema");
  const { eq } = await import("drizzle-orm");
  const [period] = await db.select().from(weeklyPeriods).where(eq(weeklyPeriods.weekId, weekId));
  if (!period || (period as any).status !== "active") return;
  await db.update(weeklyPeriods).set({ locked: true, status: "locked" } as any).where(eq(weeklyPeriods.weekId, weekId));
  await db.update(users).set({ weeklyLocked: true } as any);
  console.log(`🔒 Week ${weekId} locked`);
}

async function finalizeWeek(weekId: string) {
  const { db } = await import("./db/client");
  const { weeklyPeriods, weeklySnapshots, users } = await import("./db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const [period] = await db.select().from(weeklyPeriods).where(eq(weeklyPeriods.weekId, weekId));
  if (!period || (period as any).status !== "locked") return;

  const allUsers = await db.select({
    id: users.id, walletAddress: users.walletAddress, username: users.username,
    weeklyXp: users.weeklyXp, weeklyXpLastUpdated: users.weeklyXpLastUpdated,
  }).from(users).orderBy(desc(users.weeklyXp));

  allUsers.sort((a, b) => {
    if ((b.weeklyXp || 0) !== (a.weeklyXp || 0)) return (b.weeklyXp || 0) - (a.weeklyXp || 0);
    const aTime = (a as any).weeklyXpLastUpdated ? new Date((a as any).weeklyXpLastUpdated).getTime() : Infinity;
    const bTime = (b as any).weeklyXpLastUpdated ? new Date((b as any).weeklyXpLastUpdated).getTime() : Infinity;
    return aTime - bTime;
  });

  const xpRewards = [120, 100, 80, 60, 40];
  const top5 = allUsers.slice(0, 5);
  const claimableUntil = new Date(Date.now() + 24 * 3600 * 1000);

  for (let i = 0; i < top5.length; i++) {
    const u = top5[i];
    if (!u.weeklyXp || u.weeklyXp === 0) continue;
    await db.insert(weeklySnapshots).values({
      weekId, userId: u.id, walletAddress: u.walletAddress, username: u.username,
      weeklyXp: u.weeklyXp || 0, rank: i + 1, xpReward: xpRewards[i] || 0, rewardClaimed: false,
    });
  }

  await db.update(weeklyPeriods)
    .set({ rewardsDistributed: true, status: "finalized", claimableUntil } as any)
    .where(eq(weeklyPeriods.weekId, weekId));
  console.log(`🏆 Week ${weekId} FINALIZED — ${top5.length} players can claim`);
}

async function resetWeeklyXP() {
  const { db } = await import("./db/client");
  const { users } = await import("./db/schema");
  await db.update(users).set({ weeklyXp: 0, weeklyXpReset: new Date(), weeklyLocked: false } as any);
  console.log(`🔄 Weekly XP reset`);
}

async function weeklyLeaderboardCron() {
  try {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const min = now.getUTCMinutes();
    const weekId = await ensureCurrentWeekPeriod();

    // Sunday 23:55 UTC → lock
    if (day === 0 && hour === 23 && min === 55) {
      console.log("⏰ Locking weekly leaderboard...");
      await lockWeek(weekId);
    }

    // Monday 00:05 UTC → finalize + reset
    if (day === 1 && hour === 0 && min === 5) {
      const lastWeek = new Date(now);
      lastWeek.setUTCDate(lastWeek.getUTCDate() - 1);
      const lastWeekId = getWeekId(lastWeek);
      console.log("🏆 Finalizing week:", lastWeekId);
      await finalizeWeek(lastWeekId);
      await resetWeeklyXP();
      await ensureCurrentWeekPeriod();
    }
  } catch (err) {
    console.error("Cron error:", err);
  }
}

// Run cron every minute
setInterval(weeklyLeaderboardCron, 60 * 1000);
weeklyLeaderboardCron();

// ── API Routes ─────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { walletAddress, username, inviteCode } = req.body;
  if (!walletAddress || !username) return res.status(400).json({ error: "Missing fields" });
  try {
    const { findOrCreateUser } = await import("./services/user.service");
    const { useInviteCode } = await import("./services/xp.service");
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    await findOrCreateUser(walletAddress);
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing && existing.walletAddress !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: "Username already taken" });
    }
    await db.update(users).set({ username }).where(eq(users.walletAddress, walletAddress.toLowerCase()));
    if (inviteCode) {
      const codeValid = await useInviteCode(inviteCode, walletAddress);
      if (!codeValid) return res.status(400).json({ error: "Invalid or expired invite code" });
    }
    return res.json({ success: true, username });
  } catch (err: any) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.get("/api/profile/:wallet", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { users, inviteCodes } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select().from(users).where(eq(users.walletAddress, req.params.wallet.toLowerCase()));
    if (!user) return res.status(404).json({ error: "User not found" });
    const codes = await db.select().from(inviteCodes).where(eq(inviteCodes.ownerId, user.id));
    const friendsJoined = codes.filter(c => c.used).length;
    return res.json({ user, inviteCodes: codes, friendsJoined });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.post("/api/on-subscribe", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: "Missing wallet" });
  try {
    const { db } = await import("./db/client");
    const { users, inviteCodes } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const { grantBetaSubscriberBonus } = await import("./services/xp.service");
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
    if (!user) return res.status(404).json({ error: "User not found" });
    await db.update(users).set({ isSubscribed: true, userType: "subscriber", subscribedAt: new Date() }).where(eq(users.id, user.id));
    await grantBetaSubscriberBonus(walletAddress);
    if (user.referredBy) {
      const { awardXP } = await import("./services/xp.service");
      const [referrer] = await db.select().from(users).where(eq(users.id, user.referredBy));
      if (referrer) await awardXP(referrer.walletAddress, "referral_subscribed", referrer.isSubscribed);
    }
    const existing = await db.select().from(inviteCodes).where(eq(inviteCodes.ownerId, user.id));
    let codes = existing.map(c => c.code);
    if (existing.length < 2) {
      const { generateInviteCodes } = await import("./services/xp.service");
      codes = await generateInviteCodes(walletAddress);
    }
    return res.json({ success: true, codes });
  } catch (err) {
    console.error("Subscribe error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/spin", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: "Missing wallet" });
  try {
    const { db } = await import("./db/client");
    const { users, dailySpins } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
    if (!user) return res.status(404).json({ error: "User not found" });
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    if (user.lastSpinAt && user.lastSpinAt >= todayStart) {
      const nextSpin = new Date(todayStart);
      nextSpin.setUTCDate(nextSpin.getUTCDate() + 1);
      return res.status(400).json({ error: "Already spun today", nextSpin });
    }
        const rand = Math.random() * 100;
    let reward: string;
    let xpAmount: number;
    let freeSubscription = false;
    if (rand < 2) { reward = "+50 XP"; xpAmount = 50; }
    else if (rand < 6.9) { reward = "+30 XP"; xpAmount = 30; }
    else if (rand < 21.9) { reward = "+20 XP"; xpAmount = 20; }
    else if (rand < 51.9) { reward = "+10 XP"; xpAmount = 10; }
    else { reward = "+5 XP"; xpAmount = 5; }

    if (xpAmount > 0) {
      const { awardXP } = await import("./services/xp.service");
      await awardXP(walletAddress.toLowerCase(), "daily_spin", user.isSubscribed || false, xpAmount);
    }
    if (freeSubscription) {
      const { upgradeToSubscriber } = await import("./services/user.service");
      await upgradeToSubscriber(walletAddress.toLowerCase());
    }
    await db.insert(dailySpins).values({ userId: user.id, reward, xpAwarded: xpAmount });
    await db.update(users).set({ lastSpinAt: now }).where(eq(users.id, user.id));
    return res.json({ success: true, reward, xpAmount, freeSubscription });
  } catch (err: any) {
    console.error("Spin error:", err);
    res.status(500).json({ error: "Spin failed" });
  }
});

app.get("/api/spin/status/:wallet", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select().from(users).where(eq(users.walletAddress, req.params.wallet.toLowerCase()));
    if (!user) return res.status(404).json({ error: "User not found" });
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const nextSpin = new Date(todayStart);
    nextSpin.setUTCDate(nextSpin.getUTCDate() + 1);
    const canSpin = !user.lastSpinAt || user.lastSpinAt < todayStart;
    return res.json({ canSpin, nextSpinAt: canSpin ? null : nextSpin });
  } catch (err) {
    console.error("Spin status error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { desc } = await import("drizzle-orm");
    const topXP = await db.select({ username: users.username, walletAddress: users.walletAddress, xp: users.xp, weeklyXp: users.weeklyXp, xpTier: users.xpTier, gamesPlayed: users.gamesPlayed, gamesWon: users.gamesWon, winStreak: users.winStreak }).from(users).orderBy(desc(users.xp)).limit(100);
    const topWeekly = await db.select({ username: users.username, walletAddress: users.walletAddress, xp: users.xp, weeklyXp: users.weeklyXp, xpTier: users.xpTier, gamesPlayed: users.gamesPlayed, gamesWon: users.gamesWon, winStreak: users.winStreak }).from(users).orderBy(desc(users.weeklyXp)).limit(100);
    const topWins = await db.select({ username: users.username, walletAddress: users.walletAddress, xp: users.xp, gamesWon: users.gamesWon, winStreak: users.winStreak }).from(users).orderBy(desc(users.gamesWon)).limit(100);
    return res.json({ topXP, topWeekly, topWins });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

app.get("/api/leaderboard/rank/:wallet", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { desc, eq } = await import("drizzle-orm");
    const wallet = req.params.wallet.toLowerCase();
    const allByWeekly = await db.select({ walletAddress: users.walletAddress, weeklyXp: users.weeklyXp }).from(users).orderBy(desc(users.weeklyXp));
    const rankIndex = allByWeekly.findIndex(u => u.walletAddress === wallet);
    const rank = rankIndex === -1 ? null : rankIndex + 1;
    const [user] = await db.select({ weeklyXp: users.weeklyXp, xp: users.xp }).from(users).where(eq(users.walletAddress, wallet));
    const rank5Xp = allByWeekly[4]?.weeklyXp || 0;
    const xpToTop5 = user ? Math.max(0, rank5Xp - (user.weeklyXp || 0) + 1) : null;
    return res.json({ rank, weeklyXp: user?.weeklyXp || 0, xp: user?.xp || 0, xpToTop5 });
  } catch (err) {
    console.error("Rank error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── Weekly Status ──────────────────────────────────────────
app.get("/api/weekly-status", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { weeklyPeriods } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const now = new Date();
    const weekId = getWeekId(now);
    const { end } = getWeekBounds(now);
    const [period] = await db.select().from(weeklyPeriods).where(eq(weeklyPeriods.weekId, weekId));
    const status = (period as any)?.status || "active";
    const claimableUntil = (period as any)?.claimableUntil || null;
    return res.json({ weekId, weekEnd: end, status, claimableUntil });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ── Weekly Reward My Status ────────────────────────────────
app.get("/api/weekly-reward/my-status/:wallet", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { weeklySnapshots, weeklyPeriods } = await import("./db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const wallet = req.params.wallet.toLowerCase();

    const snapshots = await db.select().from(weeklySnapshots)
      .where(eq(weeklySnapshots.walletAddress, wallet))
      .orderBy(desc(weeklySnapshots.createdAt))
      .limit(5);

    const unclaimedReward = snapshots.find(s => !s.rewardClaimed);

    const now = new Date();
    const weekId = getWeekId(now);
    const { end } = getWeekBounds(now);
    const [period] = await db.select().from(weeklyPeriods).where(eq(weeklyPeriods.weekId, weekId));
    const status = (period as any)?.status || "active";
    const claimableUntil = (period as any)?.claimableUntil || null;
    const withinWindow = unclaimedReward && claimableUntil ? new Date() < new Date(claimableUntil) : false;

    return res.json({
      hasUnclaimedReward: !!unclaimedReward && withinWindow,
      reward: unclaimedReward || null,
      weekStatus: status,
      weekEnd: end,
      claimableUntil,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ── Daily Game ─────────────────────────────────────────────
app.get("/api/daily-game/status/:wallet", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select().from(users).where(eq(users.walletAddress, req.params.wallet.toLowerCase()));
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    const lastDodgeAt = user.lastDodgeAt ? new Date(user.lastDodgeAt) : null;
    const lastDodgeClaimedAt = (user as any).lastDodgeClaimedAt ? new Date((user as any).lastDodgeClaimedAt) : null;

    // hasPlayed: played within last 20 hours
    const hasPlayed = !!(lastDodgeAt && (now.getTime() - lastDodgeAt.getTime()) < 20 * 3600 * 1000);

    // hasClaimed: claimed AFTER last play
    const hasClaimed = !!(hasPlayed && lastDodgeClaimedAt && lastDodgeAt && lastDodgeClaimedAt.getTime() >= lastDodgeAt.getTime());

    const nextPlayAt = hasPlayed ? new Date(lastDodgeAt!.getTime() + 20 * 3600 * 1000) : null;

    // Debug logs
    console.log(`[daily-game/status] wallet=${req.params.wallet}`);
    console.log(`  lastDodgeAt=${lastDodgeAt}`);
    console.log(`  lastDodgeClaimedAt=${lastDodgeClaimedAt}`);
    console.log(`  hasPlayed=${hasPlayed}, hasClaimed=${hasClaimed}`);

    return res.json({ canPlay: !hasPlayed, hasPlayed, hasClaimed, nextPlayAt, lastDodgeAt, lastDodgeClaimedAt });
  } catch (err) {
    console.error("daily-game/status error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/daily-game/record", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: "Missing wallet" });
  try {
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
    if (!user) return res.status(404).json({ error: "User not found" });
    const now = new Date();
    const last = (user as any).lastDodgeAt ? new Date((user as any).lastDodgeAt) : null;
    const played = last && (now.getTime() - last.getTime()) < 20 * 3600 * 1000;
    if (played) return res.status(400).json({ error: "Already played today", nextPlayAt: new Date(last!.getTime() + 20 * 3600 * 1000) });
    await db.update(users).set({ lastDodgeAt: now } as any).where(eq(users.id, user.id));
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ── XP Claim (Dodge Nodes) ─────────────────────────────────
app.post("/api/sign-xp-claim", async (req, res) => {
  const { walletAddress, xpAmount } = req.body;
  if (!walletAddress || !xpAmount) return res.status(400).json({ error: "Missing fields" });
  try {
    const { createPublicClient, http, keccak256, encodePacked, toBytes } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { baseSepolia } = await import("viem/chains");
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_RPC_URL) });
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as `0x${string}`;
    const contractABI = [
      { name: "claimNonce", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
      { name: "canClaim", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "bool" }] },
    ] as const;
    const canClaim = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractABI, functionName: "canClaim", args: [walletAddress as `0x${string}`] });
    if (!canClaim) return res.status(400).json({ error: "Cooldown active. Come back in 20 hours." });
    const nonce = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractABI, functionName: "claimNonce", args: [walletAddress as `0x${string}`] });
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
    const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}` as `0x${string}`);
    const msgHash = keccak256(encodePacked(["address", "uint256", "uint256", "address"], [walletAddress as `0x${string}`, BigInt(xpAmount), nonce, CONTRACT_ADDRESS]));
    const signature = await account.signMessage({ message: { raw: toBytes(msgHash) } });
    return res.json({ success: true, signature, nonce: nonce.toString(), xpAmount });
  } catch (err) {
    console.error("Sign XP error:", err);
    res.status(500).json({ error: "Failed to sign XP claim" });
  }
});

app.post("/api/confirm-xp-claim", async (req, res) => {
  const { walletAddress, xpAmount, txHash } = req.body;
  if (!walletAddress || !xpAmount || !txHash) return res.status(400).json({ error: "Missing fields" });
  try {
    const { createPublicClient, http } = await import("viem");
    const { baseSepolia } = await import("viem/chains");
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_RPC_URL) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success") return res.status(400).json({ error: "Transaction failed" });
    const { awardXP } = await import("./services/xp.service");
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
    if (!user) return res.status(404).json({ error: "User not found" });
    await awardXP(walletAddress.toLowerCase(), "daily_spin", user.isSubscribed || false, xpAmount);
    await db.update(users).set({ lastDodgeClaimedAt: new Date() } as any).where(eq(users.walletAddress, walletAddress.toLowerCase()));
    return res.json({ success: true, xpAwarded: xpAmount });
  } catch (err) {
    console.error("Confirm XP error:", err);
    res.status(500).json({ error: "Failed to confirm claim" });
  }
});

// ── Weekly Reward Set + Confirm ────────────────────────────
app.post("/api/weekly-reward/set", async (req, res) => {
  const { walletAddress, xpAmount } = req.body;
  if (!walletAddress || !xpAmount) return res.status(400).json({ error: "Missing fields" });
  try {
    // Check week is finalized before allowing claim
    const { db } = await import("./db/client");
    const { weeklyPeriods, weeklySnapshots } = await import("./db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const now = new Date();
    const weekId = getWeekId(now);
    // Check last week (rewards are for last week)
    const lastWeek = new Date(now);
    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
    const lastWeekId = getWeekId(lastWeek);

    // Find snapshot for this wallet
    const [snapshot] = await db.select().from(weeklySnapshots)
      .where(eq(weeklySnapshots.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(weeklySnapshots.createdAt))
      .limit(1);

    if (!snapshot) return res.status(400).json({ error: "No reward found for this wallet" });
    if (snapshot.rewardClaimed) return res.status(400).json({ error: "Already claimed" });

    // Check period is finalized
    const [period] = await db.select().from(weeklyPeriods).where(eq(weeklyPeriods.weekId, snapshot.weekId));
    if (!period || (period as any).status !== "finalized") {
      return res.status(400).json({ error: "Rewards not finalized yet" });
    }
    // Check claim window
    const claimableUntil = (period as any).claimableUntil;
    if (claimableUntil && new Date() > new Date(claimableUntil)) {
      return res.status(400).json({ error: "Claim window expired" });
    }

    const { createPublicClient, http, keccak256, encodePacked, toBytes } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { baseSepolia } = await import("viem/chains");
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_RPC_URL) });
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as `0x${string}`;
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
    const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}` as `0x${string}`);
    const nonce = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: [{ name: "weeklyRewardNonce", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] }] as const,
      functionName: "weeklyRewardNonce",
      args: [walletAddress as `0x${string}`],
    });
    const msgHash = keccak256(encodePacked(["address", "uint256", "uint256", "address"], [walletAddress as `0x${string}`, BigInt(xpAmount), nonce, CONTRACT_ADDRESS]));
    const signature = await account.signMessage({ message: { raw: toBytes(msgHash) } });
    return res.json({ success: true, signature, xpAmount, weekId: snapshot.weekId });
  } catch (err) {
    console.error("Weekly reward set error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/weekly-reward/claim-confirm", async (req, res) => {
  const { walletAddress, weekId, txHash } = req.body;
  if (!walletAddress || !weekId || !txHash) return res.status(400).json({ error: "Missing fields" });
  try {
    const { createPublicClient, http } = await import("viem");
    const { baseSepolia } = await import("viem/chains");
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_RPC_URL) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success") return res.status(400).json({ error: "Transaction failed" });
    const { db } = await import("./db/client");
    const { weeklySnapshots, users } = await import("./db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { awardXP } = await import("./services/xp.service");
    const [snapshot] = await db.select().from(weeklySnapshots)
      .where(and(eq(weeklySnapshots.walletAddress, walletAddress.toLowerCase()), eq(weeklySnapshots.weekId, weekId)));
    if (!snapshot) return res.status(404).json({ error: "Snapshot not found" });
    if (snapshot.rewardClaimed) return res.status(400).json({ error: "Already claimed" });
    await db.update(weeklySnapshots).set({ rewardClaimed: true, rewardClaimedAt: new Date() }).where(eq(weeklySnapshots.id, snapshot.id));
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
    if (user) await awardXP(walletAddress.toLowerCase(), "leaderboard_reward", false, snapshot.xpReward);
    return res.json({ success: true, xpAwarded: snapshot.xpReward });
  } catch (err) {
    console.error("Weekly claim confirm error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/leaderboard/reset", async (req, res) => {
  try {
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { desc } = await import("drizzle-orm");
    const { awardXP } = await import("./services/xp.service");
    const top5 = await db.select({ walletAddress: users.walletAddress, weeklyXp: users.weeklyXp }).from(users).orderBy(desc(users.weeklyXp)).limit(5);
    const rewards = [1000, 700, 500, 300, 200];
    for (let i = 0; i < top5.length; i++) {
      if (top5[i].weeklyXp && top5[i].weeklyXp > 0) {
        await awardXP(top5[i].walletAddress, "leaderboard_reward", false, rewards[i]);
      }
    }
    await db.update(users).set({ weeklyXp: 0, weeklyXpReset: new Date() });
    return res.json({ success: true, rewarded: top5.length });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── Game Engine ────────────────────────────────────────────
type RoundType = "safe_path" | "memory_flash" | "minefield" | "btc_oracle" | "final_round";
const ROUND_TYPES: RoundType[] = ["safe_path", "memory_flash", "minefield", "btc_oracle", "final_round"];
const CHOICE_WINDOW_MS = 15000;

interface Player {
  address: string;
  eliminated: boolean;
  choice: string | null;
  roundsSurvived: number;
  correctPicks: number;
  decisionTimes: number[];
  joinedAt: number;
}

interface RoundSeed {
  safePath?: { bombs: number[] };
  memoryFlash?: { safeTiles: number[] };
  minefield?: { bombs: number[] };
  btcOracle?: { priceStart: number; priceEnd: number; wentUp: boolean };
}

interface GameState {
  gameId: string;
  state: "waiting" | "running" | "finished";
  currentRound: number;
  roundType: RoundType;
  players: Map<string, Player>;
  roundSeed: RoundSeed | null;
  roundStartTime: number;
}

let currentGame: GameState | null = null;

function createGame(): GameState {
  return {
    gameId: crypto.randomUUID(),
    state: "waiting",
    currentRound: 0,
    roundType: "safe_path",
    players: new Map(),
    roundSeed: null,
    roundStartTime: 0,
  };
}

function getActive(game: GameState) {
  return [...game.players.values()].filter(p => !p.eliminated);
}

function pickRandom<T>(arr: T[], count: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

function generateRoundSeed(roundType: RoundType): RoundSeed {
  if (roundType === "safe_path") {
    return { safePath: { bombs: Array.from({ length: 5 }, () => Math.floor(Math.random() * 2)) } };
  } else if (roundType === "memory_flash") {
    return { memoryFlash: { safeTiles: pickRandom([0,1,2,3,4,5], 2) } };
  } else if (roundType === "minefield") {
    return { minefield: { bombs: pickRandom([0,1,2,3,4,5,6,7,8], 3) } };
  }
  return {};
}

function processRound(game: GameState, btcWentUp?: boolean): string[] {
  const eliminated: string[] = [];
  const active = getActive(game);

  if (game.roundType === "safe_path") {
    const choices: Record<string, number> = { left: 0, right: 0 };
    for (const p of active) {
      if (p.choice === "left" || p.choice === "right") choices[p.choice]++;
    }
    const trapSide = choices.left >= choices.right ? "left" : "right";
    for (const p of active) {
      if (!p.choice || p.choice === trapSide) eliminated.push(p.address);
    }
  } else if (game.roundType === "memory_flash") {
    for (const p of active) {
      if (!p.choice || p.choice === "wrong") eliminated.push(p.address);
    }
  } else if (game.roundType === "minefield") {
    for (const p of active) {
      if (!p.choice || p.choice === "miss") eliminated.push(p.address);
    }
  } else if (game.roundType === "btc_oracle") {
    const up = btcWentUp !== undefined ? btcWentUp : Math.random() > 0.5;
    io.to(game.gameId).emit("btc_result", { btcWentUp: up });
    for (const p of active) {
      if (!p.choice) { eliminated.push(p.address); continue; }
      const predicted = p.choice.toUpperCase();
      const correct = (predicted === "UP" && up) || (predicted === "DOWN" && !up);
      if (!correct) eliminated.push(p.address);
    }
  } else if (game.roundType === "final_round") {
    const scored = active.map(p => {
      const avgDecision = p.decisionTimes.length > 0
        ? p.decisionTimes.reduce((a, b) => a + b, 0) / p.decisionTimes.length
        : CHOICE_WINDOW_MS;
      const score = (p.roundsSurvived * 1000) + (p.correctPicks * 100) - avgDecision;
      return { address: p.address, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const survivors = new Set(scored.slice(0, 5).map(s => s.address));
    for (const p of active) {
      if (!survivors.has(p.address)) eliminated.push(p.address);
    }
    io.to(game.gameId).emit("final_rankings", { rankings: scored });
  }

  return eliminated;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function runRound(game: GameState) {
  game.roundType = ROUND_TYPES[game.currentRound - 1];

  if (game.roundType !== "btc_oracle" && game.roundType !== "final_round") {
    game.roundSeed = generateRoundSeed(game.roundType);
  } else {
    game.roundSeed = null;
  }

  for (const p of game.players.values()) p.choice = null;
  game.roundStartTime = Date.now();

  if (game.roundType === "btc_oracle") {
    btcPriceStart = await fetchBTCPrice();
    console.log(`BTC price at round start: $${btcPriceStart}`);
  }

  const seedPayload: any = {};
  if (game.roundType === "memory_flash" && game.roundSeed?.memoryFlash) {
    seedPayload.safeTiles = game.roundSeed.memoryFlash.safeTiles;
    seedPayload.showDuration = 1500;
  }

  io.to(game.gameId).emit("round_start", {
    round: game.currentRound,
    type: game.roundType,
    choiceWindowMs: CHOICE_WINDOW_MS,
    activePlayers: getActive(game).length,
    seed: seedPayload,
  });

  await sleep(CHOICE_WINDOW_MS);

  let btcWentUp: boolean | undefined;
  if (game.roundType === "btc_oracle") {
    const priceEnd = await fetchBTCPrice();
    if (btcPriceStart && priceEnd > 0) {
      btcWentUp = priceEnd > btcPriceStart;
      console.log(`BTC: $${btcPriceStart} → $${priceEnd} (${btcWentUp ? "UP" : "DOWN"})`);
    } else {
      btcWentUp = Math.random() > 0.5;
    }
  }

  const eliminated = processRound(game, btcWentUp);

  const roundEndTime = Date.now();
  for (const [addr, player] of game.players) {
    if (!player.eliminated && !eliminated.includes(addr)) {
      player.roundsSurvived++;
      player.correctPicks++;
      if (player.choice) {
        player.decisionTimes.push(roundEndTime - game.roundStartTime);
      }
    }
  }

  for (const addr of eliminated) {
    const p = game.players.get(addr);
    if (p) p.eliminated = true;
  }

  try {
    const { awardXP } = await import("./services/xp.service");
    const { getUserProfile } = await import("./services/user.service");
    for (const [addr, player] of game.players) {
      if (!player.eliminated) {
        const user = await getUserProfile(addr);
        await awardXP(addr, `round_${game.currentRound}` as any, user?.isSubscribed || false);
      }
    }
  } catch (err) { console.error("XP award error:", err); }

  const remaining = getActive(game).length;
  const resultPayload: any = { round: game.currentRound, eliminated, remaining, type: game.roundType };
  if (game.roundSeed?.safePath) resultPayload.bombs = game.roundSeed.safePath.bombs;
  if (game.roundSeed?.memoryFlash) resultPayload.safeTiles = game.roundSeed.memoryFlash.safeTiles;
  if (game.roundSeed?.minefield) resultPayload.bombs = game.roundSeed.minefield.bombs;

  io.to(game.gameId).emit("round_result", resultPayload);
  await sleep(5000);

  if (game.currentRound >= 5) {
    const winners = getActive(game).slice(0, 5).map(p => p.address);
    game.state = "finished";
    try {
      const { awardXP } = await import("./services/xp.service");
      const { getUserProfile } = await import("./services/user.service");
      for (const addr of winners) {
        const user = await getUserProfile(addr);
        await awardXP(addr, "win_game", user?.isSubscribed || false);
      }
    } catch (err) { console.error("Win XP error:", err); }
    try {
      const { db } = await import("./db/client");
      const { users } = await import("./db/schema");
      const { eq, sql } = await import("drizzle-orm");
      for (const addr of winners) {
        await db.update(users).set({ gamesWon: sql`${users.gamesWon} + 1` }).where(eq(users.walletAddress, addr));
      }
    } catch (err) { console.error("Games won update error:", err); }
    io.to(game.gameId).emit("game_finished", { winners });
  } else {
    game.currentRound++;
    await runRound(game);
  }
}

// ── Socket.IO ──────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join_game", async ({ address }: { address: string }) => {
    if (!currentGame || currentGame.state === "finished") currentGame = createGame();
    if (currentGame.players.has(address.toLowerCase())) {
      socket.join(currentGame.gameId);
      socket.emit("game_joined", { gameId: currentGame.gameId, playerCount: currentGame.players.size, state: currentGame.state });
      return;
    }

    try {
      const { db } = await import("./db/client");
      const { users } = await import("./db/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(eq(users.walletAddress, address.toLowerCase()));

      if (user) {
        const now2 = new Date();
        const dayOfWeek = now2.getUTCDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const thisMonday = new Date(now2);
        thisMonday.setUTCDate(now2.getUTCDate() - daysFromMonday);
        thisMonday.setUTCHours(0, 0, 0, 0);
        thisMonday.setUTCMinutes(0);
        thisMonday.setUTCSeconds(0);
        thisMonday.setUTCMilliseconds(0);
        const lastReset = user.weeklyGamesReset ? new Date(user.weeklyGamesReset) : null;
        const needsReset = !lastReset || lastReset.getTime() < thisMonday.getTime();
        if (needsReset) {
          await db.update(users).set({ weeklyGamesPlayed: 0, weeklyGamesReset: thisMonday }).where(eq(users.id, user.id));
          user.weeklyGamesPlayed = 0;
        }
        if (user.weeklyGamesPlayed >= 2) {
          socket.emit("game_limit_reached", { message: "You have used all your games for this week. Come back next Monday." });
          return;
        }
        await db.update(users).set({ weeklyGamesPlayed: user.weeklyGamesPlayed + 1, gamesPlayed: (user.gamesPlayed || 0) + 1 }).where(eq(users.id, user.id));
      }

      socket.join(currentGame.gameId);
      currentGame.players.set(address.toLowerCase(), {
        address: address.toLowerCase(),
        eliminated: false,
        choice: null,
        roundsSurvived: 0,
        correctPicks: 0,
        decisionTimes: [],
        joinedAt: Date.now(),
      });
      socket.data.address = address.toLowerCase();
      socket.data.gameId = currentGame.gameId;

      const { awardXP } = await import("./services/xp.service");
      const { getUserProfile } = await import("./services/user.service");
      const userProfile = await getUserProfile(address.toLowerCase());
      if (userProfile) {
        await awardXP(address.toLowerCase(), "join_game", userProfile.isSubscribed || false);
        if (!userProfile.firstGamePlayed && userProfile.referredBy) {
          await db.update(users).set({ firstGamePlayed: true }).where(eq(users.id, userProfile.id));
          const [referrer] = await db.select().from(users).where(eq(users.id, userProfile.referredBy));
          if (referrer) await awardXP(referrer.walletAddress, "referral_played", referrer.isSubscribed);
        }
      }

      socket.emit("game_joined", { gameId: currentGame.gameId, playerCount: currentGame.players.size, state: currentGame.state });
      io.to(currentGame.gameId).emit("player_count", { count: currentGame.players.size });

    } catch (err) {
      console.error("Join game error:", err);
    }
  });

  socket.on("submit_choice", ({ choice }: { choice: string }) => {
    const address = socket.data.address;
    if (!currentGame || !address) return;
    const player = currentGame.players.get(address);
    if (player && !player.eliminated) {
      player.choice = choice;
      socket.emit("choice_confirmed", { choice });
    }
  });

  socket.on("start_game", async () => {
    if (!currentGame || currentGame.state !== "waiting") return;
    currentGame.state = "running";
    currentGame.currentRound = 1;
    io.to(currentGame.gameId).emit("game_started", { playerCount: currentGame.players.size });
    runRound(currentGame);
  });

  socket.on("disconnect", () => console.log("Disconnected:", socket.id));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));