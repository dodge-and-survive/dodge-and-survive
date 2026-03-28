import { pgTable, serial, text, integer, boolean, timestamp, numeric, uuid, pgEnum } from "drizzle-orm/pg-core";

export const gameStateEnum = pgEnum("game_state", ["open", "running", "finished", "cancelled"]);
export const userTypeEnum = pgEnum("user_type", ["visitor", "free", "subscriber"]);
export const xpTierEnum = pgEnum("xp_tier", ["bronze", "silver", "gold", "diamond"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique(),
  walletAddress: text("wallet_address").notNull().unique(),
  username: text("username").unique(),
  userType: userTypeEnum("user_type").notNull().default("visitor"),
  xp: integer("xp").notNull().default(0),
  xpTier: xpTierEnum("xp_tier").notNull().default("bronze"),
  gamesPlayed: integer("games_played").notNull().default(0),
  gamesWon: integer("games_won").notNull().default(0),
  winStreak: integer("win_streak").notNull().default(0),
  balance: numeric("balance", { precision: 18, scale: 6 }).notNull().default("0"),
  isSubscribed: boolean("is_subscribed").notNull().default(false),
  subscribedAt: timestamp("subscribed_at"),
  isBetaSubscriber: boolean("is_beta_subscriber").notNull().default(false),
  earlySupXpGranted: boolean("early_sup_xp_granted").notNull().default(false),
  badge: text("badge"),
  betaSubscriber: boolean("beta_subscriber").notNull().default(false),
  weeklyGamesPlayed: integer("weekly_games_played").notNull().default(0),
  weeklyGamesReset: timestamp("weekly_games_reset"),
  referredBy: uuid("referred_by"),
  firstGamePlayed: boolean("first_game_played").notNull().default(false),
  lastSpinAt: timestamp("last_spin_at"),
  lastDodgeAt: timestamp("last_dodge_at"),
  lastDodgeClaimedAt: timestamp("last_dodge_claimed_at"),
  weeklyXp: integer("weekly_xp").notNull().default(0),
  weeklyXpReset: timestamp("weekly_xp_reset"),
  weeklyXpLastUpdated: timestamp("weekly_xp_last_updated"),
  weeklyLocked: boolean("weekly_locked").notNull().default(false),
  monthlyXp: integer("monthly_xp").notNull().default(0),
  monthlyXpReset: timestamp("monthly_xp_reset"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const inviteCodes = pgTable("invite_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  usedById: uuid("used_by_id").references(() => users.id),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const xpTransactions = pgTable("xp_transactions", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailySpins = pgTable("daily_spins", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  reward: text("reward").notNull(),
  xpAwarded: integer("xp_awarded").notNull().default(0),
  spunAt: timestamp("spun_at").defaultNow(),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  onChainId: integer("on_chain_id"),
  startTime: timestamp("start_time").notNull(),
  state: gameStateEnum("state").notNull().default("open"),
  prizePool: numeric("prize_pool", { precision: 18, scale: 6 }).notNull().default("0"),
  playerCount: integer("player_count").notNull().default(0),
  maxPlayers: integer("max_players").notNull().default(50),
  currentRound: integer("current_round").notNull().default(0),
  serverSeed: text("server_seed"),
  serverSeedHash: text("server_seed_hash"),
  blockHash: text("block_hash"),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const gamePlayers = pgTable("game_players", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  walletAddress: text("wallet_address").notNull(),
  userType: userTypeEnum("user_type").notNull().default("free"),
  eliminated: boolean("eliminated").notNull().default(false),
  eliminatedRound: integer("eliminated_round"),
  isWinner: boolean("is_winner").notNull().default(false),
  xpEarned: integer("xp_earned").notNull().default(0),
  txHash: text("tx_hash"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  roundNumber: integer("round_number").notNull(),
  type: text("type").notNull(),
  randomSeed: text("random_seed"),
  outcomeData: text("outcome_data"),
  eliminatedCount: integer("eliminated_count").notNull().default(0),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const playerRoundChoices = pgTable("player_round_choices", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  roundId: integer("round_id").notNull().references(() => rounds.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  choice: text("choice").notNull(),
  eliminated: boolean("eliminated").notNull().default(false),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Weekly Leaderboard (current week live) ─────────────────
export const weeklyLeaderboard = pgTable("weekly_leaderboard", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  weekStart: timestamp("week_start").notNull(),
  xp: integer("xp").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  gamesPlayed: integer("games_played").notNull().default(0),
  rank: integer("rank"),
});

// ── Weekly Periods (one row per week) ──────────────────────
export const weeklyPeriods = pgTable("weekly_periods", {
  id: serial("id").primaryKey(),
  weekId: text("week_id").notNull().unique(), // e.g. "2024-W12"
  weekStart: timestamp("week_start").notNull(),
  weekEnd: timestamp("week_end").notNull(),
  locked: boolean("locked").notNull().default(false),
  rewardsDistributed: boolean("rewards_distributed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Weekly Snapshots (top 5 per week, permanent history) ───
export const weeklySnapshots = pgTable("weekly_snapshots", {
  id: serial("id").primaryKey(),
  weekId: text("week_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id),
  walletAddress: text("wallet_address").notNull(),
  username: text("username"),
  weeklyXp: integer("weekly_xp").notNull().default(0),
  rank: integer("rank").notNull(),
  xpReward: integer("xp_reward").notNull().default(0),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
  rewardClaimedAt: timestamp("reward_claimed_at"),
  xpReachedAt: timestamp("xp_reached_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Monthly Periods (one row per month) ────────────────────
export const monthlyPeriods = pgTable("monthly_periods", {
  id: serial("id").primaryKey(),
  monthId: text("month_id").notNull().unique(), // e.g. "2024-03"
  monthStart: timestamp("month_start").notNull(),
  monthEnd: timestamp("month_end").notNull(),
  locked: boolean("locked").notNull().default(false),
  rewardsDistributed: boolean("rewards_distributed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Monthly Snapshots (top 5 per month, permanent history) ─
export const monthlySnapshots = pgTable("monthly_snapshots", {
  id: serial("id").primaryKey(),
  monthId: text("month_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id),
  walletAddress: text("wallet_address").notNull(),
  username: text("username"),
  monthlyXp: integer("monthly_xp").notNull().default(0),
  rank: integer("rank").notNull(),
  xpReward: integer("xp_reward").notNull().default(0),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
  rewardClaimedAt: timestamp("reward_claimed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});