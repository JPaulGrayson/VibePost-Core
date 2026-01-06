import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import type { UserTier } from "@shared/schema";

export interface TierFeatureConfig {
  arenaRunsPerDay: number;
  autoArenaEnabled: boolean;
  aiChallengeGeneration: boolean;
  threadPosting: boolean;
  prioritySupport: boolean;
}

export const TIER_LIMITS: Record<UserTier, TierFeatureConfig> = {
  free: {
    arenaRunsPerDay: 3,
    autoArenaEnabled: false,
    aiChallengeGeneration: false,
    threadPosting: false,
    prioritySupport: false,
  },
  pro: {
    arenaRunsPerDay: 50,
    autoArenaEnabled: true,
    aiChallengeGeneration: true,
    threadPosting: true,
    prioritySupport: true,
  },
  byok: {
    arenaRunsPerDay: 999,
    autoArenaEnabled: true,
    aiChallengeGeneration: true,
    threadPosting: true,
    prioritySupport: false,
  },
};

async function getUserTier(userId: string): Promise<UserTier> {
  try {
    const result = await pool.query(
      "SELECT tier, tier_expires_at FROM users WHERE id = $1",
      [userId]
    );
    
    if (result.rows.length === 0) {
      return "free";
    }
    
    const { tier, tier_expires_at } = result.rows[0];
    
    if (tier === "pro" || tier === "byok") {
      if (tier_expires_at && new Date(tier_expires_at) < new Date()) {
        return "free";
      }
      return tier as UserTier;
    }
    
    return "free";
  } catch (error) {
    console.error("Error getting user tier:", error);
    return "free";
  }
}

export function requireTier(requiredTier: UserTier | UserTier[]) {
  const allowedTiers = Array.isArray(requiredTier) ? requiredTier : [requiredTier];
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.claims?.sub;
    
    if (!userId) {
      if (process.env.NODE_ENV !== "production") {
        console.log("⚠️ Tier check: No auth, allowing in dev mode");
        (req as any).userTier = "pro";
        return next();
      }
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const userTier = await getUserTier(userId);
    
    if (!allowedTiers.includes(userTier)) {
      return res.status(403).json({
        error: "Upgrade required",
        message: `This feature requires ${allowedTiers.join(" or ")} tier`,
        currentTier: userTier,
        requiredTier: allowedTiers,
        upgradeUrl: "/pricing"
      });
    }
    
    (req as any).userTier = userTier;
    next();
  };
}

export function checkFeature(feature: keyof TierFeatureConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.claims?.sub;
    
    if (!userId) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`⚠️ Feature check (${feature}): No auth, allowing in dev mode`);
        (req as any).userTier = "pro";
        (req as any).tierLimits = TIER_LIMITS.pro;
        return next();
      }
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const userTier = await getUserTier(userId);
    const limits = TIER_LIMITS[userTier];
    
    if (!limits[feature]) {
      return res.status(403).json({
        error: "Upgrade required",
        message: `The ${feature} feature requires a Pro or BYOK subscription`,
        currentTier: userTier,
        upgradeUrl: "/pricing"
      });
    }
    
    (req as any).userTier = userTier;
    (req as any).tierLimits = limits;
    next();
  };
}

export async function getTierLimits(userId: string): Promise<TierFeatureConfig> {
  const tier = await getUserTier(userId);
  return TIER_LIMITS[tier];
}

export { getUserTier };
