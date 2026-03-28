import { db } from "../db/client";
import { users, xpTransactions, inviteCodes } from "../db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const XP_REWARDS: Record<string, number> = {
  join_game: 10,
  round_1: 10,
  round_2: 20,
  round_3: 30,
  round_4: 40,
  round_5: 50,
  win_game: 100,
  watch_game: 5,
  correct_prediction: 10,
  subscribe_bonus: 200,
  beta_early_supporter: 500,
  referral_joined: 20,
  referral_played: 30,
  referral_subscribed: 80,
  referral_signup_bonus: 5,
  daily_spin: 0,
};

function getTier(xp: number): "bronze" | "silver" | "gold" | "diamond" {
  if (xp >= 10000) return "diamond";
  if (xp >= 5000) return "gold";
  if (xp >= 2000) return "silver";
  return "bronze";
}

export async function awardXP(
  walletAddress: string,
  reason: string,
  isSubscriber: boolean = false,
  customAmount?: number
) {
  const baseXP = customAmount ?? XP_REWARDS[reason] ?? 0;
  if (baseXP === 0) return;
  const multiplier = isSubscriber ? 2 : 1;
  const amount = baseXP * multiplier;

  const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
  if (!user) return;

 const newXP = user.xp + amount;
  const newTier = getTier(newXP);

  const weeklyReasons = ["join_game", "round_1", "round_2", "round_3", "round_4", "round_5", "win_game", "daily_spin"];
  const isWeeklyXp = weeklyReasons.some(r => reason.startsWith(r.split("_")[0]));
  // Weekly XP is always base (no 2x) — fair competition
  const baseWeeklyXp = customAmount ?? XP_REWARDS[reason] ?? 0;
  const newWeeklyXp = isWeeklyXp ? (user.weeklyXp || 0) + baseWeeklyXp : (user.weeklyXp || 0);

  await db.update(users).set({ xp: newXP, xpTier: newTier, weeklyXp: newWeeklyXp }).where(eq(users.id, user.id));
  await db.insert(xpTransactions).values({
    userId: user.id,
    amount,
    reason: `${reason}${isSubscriber ? " (2x)" : ""}`,
  });

  return { xp: amount, total: newXP, tier: newTier };
}

export async function generateInviteCodes(walletAddress: string): Promise<string[]> {
  const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
  if (!user) return [];

  const codes: string[] = [];
  for (let i = 0; i < 2; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    await db.insert(inviteCodes).values({ code, ownerId: user.id });
    codes.push(code);
  }
  return codes;
}

export async function useInviteCode(code: string, newUserWallet: string): Promise<boolean> {
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code.toUpperCase()));
  if (!invite || invite.used) return false;

  const [newUser] = await db.select().from(users).where(eq(users.walletAddress, newUserWallet.toLowerCase()));
  if (!newUser) return false;

  await db.update(inviteCodes).set({ used: true, usedById: newUser.id, usedAt: new Date() }).where(eq(inviteCodes.id, invite.id));
  await db.update(users).set({ userType: "free", referredBy: invite.ownerId }).where(eq(users.id, newUser.id));

  // Award +5 XP to invited user
  await awardXP(newUserWallet.toLowerCase(), "referral_signup_bonus", false, 5);

  // Award +20 XP to referrer
  const [owner] = await db.select().from(users).where(eq(users.id, invite.ownerId));
  if (owner) await awardXP(owner.walletAddress, "referral_joined", owner.isSubscribed);

  return true;
}

export async function grantBetaSubscriberBonus(walletAddress: string) {
  const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress.toLowerCase()));
  if (!user || user.earlySupXpGranted) return;

  await awardXP(walletAddress, "beta_early_supporter", false);

  await db.update(users).set({
    isBetaSubscriber: true,
    betaSubscriber: true,
    earlySupXpGranted: true,
    badge: "Early Supporter",
  }).where(eq(users.id, user.id));
}