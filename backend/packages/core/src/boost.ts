import { q } from "./db.js";

export const BOOST_BADGE = "boost";
export type BoostEntitlementSource = "none" | "stripe" | "manual" | "trial" | "both";

type ActiveGrantRow = {
  id: number;
  grant_type: "permanent" | "temporary";
  expires_at: string | null;
  created_at: string;
  granted_by: string;
  reason: string | null;
};

type BoostTrialWindowRow = {
  boost_trial_starts_at: string | null;
  boost_trial_ends_at: string | null;
};

export type BoostTrialWindow = {
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type BoostEntitlement = {
  active: boolean;
  source: BoostEntitlementSource;
  expiresAt: string | null;
  manualExpiresAt: string | null;
  trialActive: boolean;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function trialWindowIsActive(startsAt: Date | null, endsAt: Date | null, now = new Date()): boolean {
  if (!startsAt || !endsAt) return false;
  const nowMs = now.getTime();
  return startsAt.getTime() <= nowMs && nowMs < endsAt.getTime();
}

function resolveBoostSource(input: {
  manualActive: boolean;
  stripeActive: boolean;
  trialActive: boolean;
}): BoostEntitlementSource {
  const activeSources = [input.manualActive, input.stripeActive, input.trialActive].filter(Boolean).length;
  if (!activeSources) return "none";
  if (activeSources > 1) return "both";
  if (input.stripeActive) return "stripe";
  if (input.manualActive) return "manual";
  return "trial";
}

async function hasActiveStripeBoost(userId: string): Promise<boolean> {
  const rows = await q<{ has_active: number }>(
    `SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END AS has_active
     FROM user_subscriptions
     WHERE user_id=:userId
       AND status IN ('active','trialing','past_due')`,
    { userId }
  );
  return rows[0]?.has_active === 1;
}

export async function getActiveManualBoostGrant(userId: string): Promise<ActiveGrantRow | null> {
  const rows = await q<ActiveGrantRow>(
    `SELECT id,grant_type,expires_at,created_at,granted_by,reason
     FROM admin_boost_grants
     WHERE user_id=:userId
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    { userId }
  );
  return rows[0] ?? null;
}

export async function getBoostTrialWindow(): Promise<BoostTrialWindow> {
  const rows = await q<BoostTrialWindowRow>(
    `SELECT boost_trial_starts_at,boost_trial_ends_at
     FROM platform_config
     WHERE id=1
     LIMIT 1`
  );

  const startsAtDate = parseDate(rows[0]?.boost_trial_starts_at ?? null);
  const endsAtDate = parseDate(rows[0]?.boost_trial_ends_at ?? null);
  return {
    startsAt: startsAtDate?.toISOString() ?? null,
    endsAt: endsAtDate?.toISOString() ?? null,
    active: trialWindowIsActive(startsAtDate, endsAtDate)
  };
}

export async function reconcileBoostBadge(userId: string): Promise<BoostEntitlement> {
  const [manualGrant, stripeActive, trialWindow] = await Promise.all([
    getActiveManualBoostGrant(userId),
    hasActiveStripeBoost(userId),
    getBoostTrialWindow()
  ]);

  const manualActive = Boolean(manualGrant);
  const shouldHaveBoost = manualActive || stripeActive || trialWindow.active;

  if (shouldHaveBoost) {
    await q(
      `INSERT INTO user_badges (user_id,badge)
       VALUES (:userId,:badge)
       ON DUPLICATE KEY UPDATE user_id=user_id`,
      { userId, badge: BOOST_BADGE }
    );
  } else {
    await q(`DELETE FROM user_badges WHERE user_id=:userId AND badge=:badge`, { userId, badge: BOOST_BADGE });
  }

  const manualExpiresAt = parseDate(manualGrant?.expires_at ?? null)?.toISOString() ?? null;
  return {
    active: shouldHaveBoost,
    source: resolveBoostSource({ manualActive, stripeActive, trialActive: trialWindow.active }),
    expiresAt: manualExpiresAt,
    manualExpiresAt,
    trialActive: trialWindow.active,
    trialStartsAt: trialWindow.startsAt,
    trialEndsAt: trialWindow.endsAt
  };
}
