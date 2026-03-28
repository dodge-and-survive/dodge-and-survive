import express from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export const authRouter = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

authRouter.post("/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: "Missing credential" });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(400).json({ error: "Invalid token" });

    const email = payload.email;
    let [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      const walletAddress = "0x" + crypto.createHash("sha256").update(email + Date.now()).digest("hex").slice(0, 40);
      [user] = await db.insert(users).values({ email, walletAddress }).returning();
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, walletAddress: user.walletAddress },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return res.json({ token, user });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Authentication failed" });
  }
});

authRouter.patch("/wallet", authenticateToken, async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: "Missing wallet address" });

  try {
    await db.update(users).set({ walletAddress }).where(eq(users.id, req.user.id));
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update wallet" });
  }
});

export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
