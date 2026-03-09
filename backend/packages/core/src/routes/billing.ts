import { FastifyInstance } from "fastify";
import { q } from "../db.js";
import { env } from "../env.js";
import { reconcileBoostBadge } from "../boost.js";
import { z } from "zod";
import crypto from "node:crypto";
import { ulidLike } from "@ods/shared/ids.js";
import { revokeCustomInvitesForOwnerLossOfBoost } from "../customInvites.js";

const OPENCOM_BOOST_MONTHLY_GBP = 10;
const OPENCOM_BOOST_GIFT_MONTHLY_PENCE = 1000;
const OPENCOM_BOOST_GIFT_GRANT_DAYS = 30;
const OPENCOM_BOOST_GIFT_REDEEM_WINDOW_DAYS = 180;
const OPENCOM_BOOST_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;

function stripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY);
}

async function stripeRequest(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "POST") {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");

  const query = method === "GET" ? `?${new URLSearchParams(params).toString()}` : "";
  const response = await fetch(`https://api.stripe.com/v1${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: method === "POST" ? new URLSearchParams(params).toString() : undefined
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`STRIPE_${response.status}${text ? `:${text}` : ""}`);
  }

  return response.json() as Promise<any>;
}

function toMySqlDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function boostGiftJoinUrl(code: string) {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/gift/${encodeURIComponent(code)}`;
}

function newBoostGiftCode() {
  return crypto.randomBytes(18).toString("base64url");
}

type BoostGiftRow = {
  id: string;
  code: string;
  purchaser_user_id: string;
  recipient_user_id: string | null;
  status: "pending_payment" | "active" | "redeemed" | "expired" | "void";
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_pence: number;
  currency: string;
  grant_days: number;
  purchased_at: string | null;
  expires_at: string;
  redeemed_at: string | null;
  created_at: string;
};

async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const existing = await q<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM user_subscriptions WHERE user_id=:userId LIMIT 1`,
    { userId }
  );

  const existingId = existing[0]?.stripe_customer_id;
  if (existingId) return existingId;

  const user = await q<{ email: string; username: string }>(`SELECT email,username FROM users WHERE id=:userId LIMIT 1`, { userId });

  const created = await stripeRequest("/customers", {
    email: user[0]?.email || "",
    name: user[0]?.username || "",
    "metadata[userId]": userId
  });

  await q(
    `INSERT INTO user_subscriptions (user_id, stripe_customer_id, plan, status)
     VALUES (:userId, :stripeCustomerId, 'opencom_boost', 'incomplete')
     ON DUPLICATE KEY UPDATE stripe_customer_id=VALUES(stripe_customer_id)`,
    { userId, stripeCustomerId: created.id }
  );

  return created.id as string;
}

async function syncBoostBadgeFromStripe(userId: string) {
  const rows = await q<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM user_subscriptions WHERE user_id=:userId LIMIT 1`,
    { userId }
  );
  const stripeCustomerId = rows[0]?.stripe_customer_id;

  if (!stripeCustomerId) {
    const reconciled = await reconcileBoostBadge(userId);
    if (!reconciled.active) await revokeCustomInvitesForOwnerLossOfBoost(userId);
    return {
      active: reconciled.active,
      source: reconciled.source,
      status: "not_configured",
      currentPeriodEnd: null as string | null,
      manualExpiresAt: reconciled.manualExpiresAt,
      trialActive: reconciled.trialActive,
      trialStartsAt: reconciled.trialStartsAt,
      trialEndsAt: reconciled.trialEndsAt
    };
  }

  const subs = await stripeRequest("/subscriptions", {
    customer: stripeCustomerId,
    status: "all",
    limit: "5"
  }, "GET");

  const activeSub = (subs.data || []).find((s: any) => ["active", "trialing", "past_due"].includes(s.status));

  if (activeSub) {
    const currentPeriodEndIso = activeSub.current_period_end
      ? new Date(Number(activeSub.current_period_end) * 1000).toISOString()
      : null;

    await q(
      `INSERT INTO user_subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
       VALUES (:userId, :stripeCustomerId, :stripeSubscriptionId, 'opencom_boost', :status, :currentPeriodEnd)
       ON DUPLICATE KEY UPDATE
         stripe_customer_id=VALUES(stripe_customer_id),
         stripe_subscription_id=VALUES(stripe_subscription_id),
         status=VALUES(status),
         current_period_end=VALUES(current_period_end)`,
      {
        userId,
        stripeCustomerId,
        stripeSubscriptionId: activeSub.id,
        status: activeSub.status,
        currentPeriodEnd: currentPeriodEndIso ? currentPeriodEndIso.slice(0, 19).replace("T", " ") : null
      }
    );

    const reconciled = await reconcileBoostBadge(userId);
    if (!reconciled.active) await revokeCustomInvitesForOwnerLossOfBoost(userId);
    return {
      active: reconciled.active,
      source: reconciled.source,
      status: activeSub.status,
      currentPeriodEnd: currentPeriodEndIso,
      manualExpiresAt: reconciled.manualExpiresAt,
      trialActive: reconciled.trialActive,
      trialStartsAt: reconciled.trialStartsAt,
      trialEndsAt: reconciled.trialEndsAt
    };
  }

  await q(`UPDATE user_subscriptions SET status='canceled', stripe_subscription_id=NULL, current_period_end=NULL WHERE user_id=:userId`, { userId });

  const reconciled = await reconcileBoostBadge(userId);
  if (!reconciled.active) await revokeCustomInvitesForOwnerLossOfBoost(userId);
  return {
    active: reconciled.active,
    source: reconciled.source,
    status: "canceled",
    currentPeriodEnd: null as string | null,
    manualExpiresAt: reconciled.manualExpiresAt,
    trialActive: reconciled.trialActive,
    trialStartsAt: reconciled.trialStartsAt,
    trialEndsAt: reconciled.trialEndsAt
  };
}

export async function billingRoutes(app: FastifyInstance) {
  app.get("/v1/billing/boost", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;

    if (!stripeConfigured()) {
      const reconciled = await reconcileBoostBadge(userId);
      if (!reconciled.active) await revokeCustomInvitesForOwnerLossOfBoost(userId);
      return {
        plan: "opencom_boost",
        priceGbpMonthly: OPENCOM_BOOST_MONTHLY_GBP,
        uploadLimitBytes: OPENCOM_BOOST_UPLOAD_LIMIT_BYTES,
        unlimitedServers: true,
        active: reconciled.active,
        source: reconciled.source,
        manualExpiresAt: reconciled.manualExpiresAt,
        trialActive: reconciled.trialActive,
        trialStartsAt: reconciled.trialStartsAt,
        trialEndsAt: reconciled.trialEndsAt,
        stripeConfigured: false
      };
    }

    const sync = await syncBoostBadgeFromStripe(userId);
    return {
      plan: "opencom_boost",
      priceGbpMonthly: OPENCOM_BOOST_MONTHLY_GBP,
      uploadLimitBytes: OPENCOM_BOOST_UPLOAD_LIMIT_BYTES,
      unlimitedServers: true,
      active: sync.active,
      source: sync.source,
      status: sync.status,
      currentPeriodEnd: sync.currentPeriodEnd,
      manualExpiresAt: sync.manualExpiresAt,
      trialActive: sync.trialActive,
      trialStartsAt: sync.trialStartsAt,
      trialEndsAt: sync.trialEndsAt,
      stripeConfigured: true
    };
  });

  app.post("/v1/billing/boost/checkout", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    if (!stripeConfigured() || !env.STRIPE_PRICE_ID_BOOST_GBP_10 || !env.STRIPE_SUCCESS_URL || !env.STRIPE_CANCEL_URL) {
      return rep.code(503).send({ error: "STRIPE_NOT_CONFIGURED" });
    }

    const customerId = await getOrCreateStripeCustomer(userId);

    const session = await stripeRequest("/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": env.STRIPE_PRICE_ID_BOOST_GBP_10,
      "line_items[0][quantity]": "1",
      success_url: env.STRIPE_SUCCESS_URL,
      cancel_url: env.STRIPE_CANCEL_URL,
      "metadata[userId]": userId,
      "metadata[plan]": "opencom_boost"
    });

    return rep.send({ url: session.url });
  });

  app.post("/v1/billing/boost/portal", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    if (!stripeConfigured() || !env.STRIPE_CUSTOMER_PORTAL_RETURN_URL) {
      return rep.code(503).send({ error: "STRIPE_NOT_CONFIGURED" });
    }

    const customerId = await getOrCreateStripeCustomer(userId);
    const session = await stripeRequest("/billing_portal/sessions", {
      customer: customerId,
      return_url: env.STRIPE_CUSTOMER_PORTAL_RETURN_URL
    });

    return rep.send({ url: session.url });
  });

  app.post("/v1/billing/boost/sync", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    if (!stripeConfigured()) return rep.code(503).send({ error: "STRIPE_NOT_CONFIGURED" });

    const sync = await syncBoostBadgeFromStripe(userId);
    return rep.send(sync);
  });

  app.post("/v1/billing/boost/cancel", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    if (!stripeConfigured()) return rep.code(503).send({ error: "STRIPE_NOT_CONFIGURED" });

    const row = await q<{ stripe_subscription_id: string | null }>(
      `SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id=:userId LIMIT 1`,
      { userId }
    );

    const subscriptionId = row[0]?.stripe_subscription_id;
    if (!subscriptionId) return rep.code(404).send({ error: "NO_ACTIVE_SUBSCRIPTION" });

    await stripeRequest(`/subscriptions/${subscriptionId}`, { cancel_at_period_end: "true" });
    await syncBoostBadgeFromStripe(userId);

    return rep.send({ ok: true });
  });

  app.get("/v1/billing/boost/gifts", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const rows = await q<BoostGiftRow>(
      `SELECT id,code,purchaser_user_id,recipient_user_id,status,stripe_checkout_session_id,stripe_payment_intent_id,amount_pence,currency,grant_days,purchased_at,expires_at,redeemed_at,created_at
       FROM boost_gifts
       WHERE purchaser_user_id=:userId
       ORDER BY created_at DESC
       LIMIT 50`,
      { userId }
    );
    return {
      gifts: rows.map((gift) => ({
        id: gift.id,
        code: gift.code,
        status: gift.status,
        amountPence: gift.amount_pence,
        currency: gift.currency,
        grantDays: gift.grant_days,
        purchasedAt: gift.purchased_at ? new Date(gift.purchased_at).toISOString() : null,
        expiresAt: gift.expires_at ? new Date(gift.expires_at).toISOString() : null,
        redeemedAt: gift.redeemed_at ? new Date(gift.redeemed_at).toISOString() : null,
        recipientUserId: gift.recipient_user_id,
        joinUrl: boostGiftJoinUrl(gift.code)
      }))
    };
  });

  app.post("/v1/billing/boost/gifts/checkout", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    if (!stripeConfigured()) return rep.code(503).send({ error: "STRIPE_NOT_CONFIGURED" });

    const giftId = ulidLike();
    const giftCode = newBoostGiftCode();
    const expiresAt = toMySqlDateTime(new Date(Date.now() + OPENCOM_BOOST_GIFT_REDEEM_WINDOW_DAYS * 24 * 60 * 60 * 1000));
    const appBase = env.APP_BASE_URL.replace(/\/$/, "");
    const successUrl = `${appBase}/app?boostGiftCheckout=success&giftId=${encodeURIComponent(giftId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appBase}/app?boostGiftCheckout=cancel`;

    const session = await stripeRequest("/checkout/sessions", {
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][unit_amount]": String(OPENCOM_BOOST_GIFT_MONTHLY_PENCE),
      "line_items[0][price_data][product_data][name]": "OpenCom Boost Gift (1 month)",
      "line_items[0][quantity]": "1",
      "metadata[userId]": userId,
      "metadata[purpose]": "boost_gift",
      "metadata[giftId]": giftId
    });

    await q(
      `INSERT INTO boost_gifts
       (id,code,purchaser_user_id,status,stripe_checkout_session_id,amount_pence,currency,grant_days,expires_at)
       VALUES
       (:id,:code,:purchaserUserId,'pending_payment',:stripeCheckoutSessionId,:amountPence,'gbp',:grantDays,:expiresAt)`,
      {
        id: giftId,
        code: giftCode,
        purchaserUserId: userId,
        stripeCheckoutSessionId: session.id,
        amountPence: OPENCOM_BOOST_GIFT_MONTHLY_PENCE,
        grantDays: OPENCOM_BOOST_GIFT_GRANT_DAYS,
        expiresAt
      }
    );

    return rep.send({ giftId, checkoutUrl: session.url });
  });

  app.post("/v1/billing/boost/gifts/complete-purchase", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    if (!stripeConfigured()) return rep.code(503).send({ error: "STRIPE_NOT_CONFIGURED" });

    const body = z.object({ giftId: z.string().min(3), sessionId: z.string().min(3) }).parse(req.body || {});

    const rows = await q<BoostGiftRow>(
      `SELECT id,code,purchaser_user_id,recipient_user_id,status,stripe_checkout_session_id,stripe_payment_intent_id,amount_pence,currency,grant_days,purchased_at,expires_at,redeemed_at,created_at
       FROM boost_gifts
       WHERE id=:giftId
       LIMIT 1`,
      { giftId: body.giftId }
    );
    if (!rows.length) return rep.code(404).send({ error: "GIFT_NOT_FOUND" });

    const gift = rows[0];
    if (gift.purchaser_user_id !== userId) return rep.code(403).send({ error: "FORBIDDEN" });
    if (gift.status === "active" || gift.status === "redeemed") {
      return rep.send({
        ok: true,
        giftId: gift.id,
        giftCode: gift.code,
        joinUrl: boostGiftJoinUrl(gift.code),
        status: gift.status
      });
    }

    const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(body.sessionId)}`, {}, "GET");
    if (session.id !== gift.stripe_checkout_session_id) return rep.code(400).send({ error: "SESSION_MISMATCH" });
    if (session.status !== "complete" || session.payment_status !== "paid") return rep.code(400).send({ error: "PAYMENT_INCOMPLETE" });
    if (session.metadata?.giftId && session.metadata.giftId !== gift.id) return rep.code(400).send({ error: "SESSION_GIFT_MISMATCH" });

    await q(
      `UPDATE boost_gifts
       SET status='active',
           purchased_at=NOW(),
           stripe_payment_intent_id=:paymentIntentId
       WHERE id=:giftId`,
      {
        giftId: gift.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null
      }
    );

    return rep.send({
      ok: true,
      giftId: gift.id,
      giftCode: gift.code,
      joinUrl: boostGiftJoinUrl(gift.code),
      status: "active"
    });
  });

  app.get("/v1/billing/boost/gifts/:code", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { code } = z.object({ code: z.string().min(8).max(96) }).parse(req.params);

    const rows = await q<BoostGiftRow & { purchaser_username: string | null }>(
      `SELECT g.id,g.code,g.purchaser_user_id,g.recipient_user_id,g.status,g.stripe_checkout_session_id,g.stripe_payment_intent_id,g.amount_pence,g.currency,g.grant_days,g.purchased_at,g.expires_at,g.redeemed_at,g.created_at,u.username AS purchaser_username
       FROM boost_gifts g
       LEFT JOIN users u ON u.id=g.purchaser_user_id
       WHERE g.code=:code
       LIMIT 1`,
      { code }
    );
    if (!rows.length) return rep.code(404).send({ error: "GIFT_NOT_FOUND" });
    const gift = rows[0];

    if (gift.status === "pending_payment") return rep.code(400).send({ error: "GIFT_PAYMENT_PENDING" });
    if (gift.status === "redeemed") return rep.code(409).send({ error: "GIFT_ALREADY_REDEEMED" });
    if (gift.status !== "active") return rep.code(400).send({ error: "GIFT_NOT_ACTIVE" });
    if (new Date(gift.expires_at).getTime() <= Date.now()) {
      await q(`UPDATE boost_gifts SET status='expired' WHERE id=:giftId AND status='active'`, { giftId: gift.id });
      return rep.code(410).send({ error: "GIFT_EXPIRED" });
    }
    if (gift.purchaser_user_id === userId) return rep.code(400).send({ error: "CANNOT_REDEEM_OWN_GIFT" });

    return rep.send({
      giftId: gift.id,
      code: gift.code,
      grantDays: gift.grant_days,
      amountPence: gift.amount_pence,
      currency: gift.currency,
      from: {
        userId: gift.purchaser_user_id,
        username: gift.purchaser_username || "Someone"
      },
      expiresAt: new Date(gift.expires_at).toISOString()
    });
  });

  app.post("/v1/billing/boost/gifts/:code/redeem", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { code } = z.object({ code: z.string().min(8).max(96) }).parse(req.params);

    const rows = await q<BoostGiftRow>(
      `SELECT id,code,purchaser_user_id,recipient_user_id,status,stripe_checkout_session_id,stripe_payment_intent_id,amount_pence,currency,grant_days,purchased_at,expires_at,redeemed_at,created_at
       FROM boost_gifts
       WHERE code=:code
       LIMIT 1`,
      { code }
    );
    if (!rows.length) return rep.code(404).send({ error: "GIFT_NOT_FOUND" });
    const gift = rows[0];

    if (gift.purchaser_user_id === userId) return rep.code(400).send({ error: "CANNOT_REDEEM_OWN_GIFT" });
    if (gift.status === "pending_payment") return rep.code(400).send({ error: "GIFT_PAYMENT_PENDING" });
    if (gift.status === "redeemed") return rep.code(409).send({ error: "GIFT_ALREADY_REDEEMED" });
    if (gift.status !== "active") return rep.code(400).send({ error: "GIFT_NOT_ACTIVE" });
    if (new Date(gift.expires_at).getTime() <= Date.now()) {
      await q(`UPDATE boost_gifts SET status='expired' WHERE id=:giftId AND status='active'`, { giftId: gift.id });
      return rep.code(410).send({ error: "GIFT_EXPIRED" });
    }

    const entitlement = await reconcileBoostBadge(userId);
    if (entitlement.active) return rep.code(409).send({ error: "USER_ALREADY_HAS_ACTIVE_BOOST" });

    const grantExpiresAt = toMySqlDateTime(new Date(Date.now() + gift.grant_days * 24 * 60 * 60 * 1000));
    await q(
      `INSERT INTO admin_boost_grants (user_id,granted_by,grant_type,reason,expires_at)
       VALUES (:userId,:grantedBy,'temporary',:reason,:expiresAt)`,
      {
        userId,
        grantedBy: gift.purchaser_user_id,
        reason: `Boost gift ${gift.id} redeemed`,
        expiresAt: grantExpiresAt
      }
    );

    await q(
      `UPDATE boost_gifts
       SET status='redeemed',
           recipient_user_id=:userId,
           redeemed_at=NOW()
       WHERE id=:giftId AND status='active'`,
      { giftId: gift.id, userId }
    );

    const updated = await reconcileBoostBadge(userId);
    return rep.send({
      ok: true,
      grantDays: gift.grant_days,
      boostActive: updated.active,
      boostSource: updated.source
    });
  });
}
