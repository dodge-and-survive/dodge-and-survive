import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { generateInviteCodes, awardXP } from "./xp.service";

export async function findOrCreateUser(walletAddress: string) {
  const addr = walletAddress.toLowerCase();
  
  let [user] = await db.select().from(users).where(eq(users.walletAddress, addr));
  
  if (!user) {
    [user] = await db.insert(users).values({
      walletAddress: addr,
      userType: "visitor",
    }).returning();
    console.log("New user created:", addr);
  }
  
  return user;
}

export async function upgradeToSubscriber(walletAddress: string) {
  const addr = walletAddress.toLowerCase();
  
  const [user] = await db.select().from(users).where(eq(users.walletAddress, addr));
  if (!user) return null;
  
  if (user.isSubscribed) return user;
  
  // Upgrade user
  await db.update(users).set({
    isSubscribed: true,
    userType: "subscriber",
    subscribedAt: new Date(),
  }).where(eq(users.id, user.id));

  // Award subscribe bonus XP
  await awardXP(addr, "subscribe_bonus", true);

  // Generate 3 invite codes
  const codes = await generateInviteCodes(addr);
  
  return { ...user, isSubscribed: true, inviteCodes: codes };
}

export async function getUserProfile(walletAddress: string) {
  const addr = walletAddress.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.walletAddress, addr));
  return user || null;
}