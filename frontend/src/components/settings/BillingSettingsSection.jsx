export function BillingSettingsSection({
  boostStatus,
  boostLoading,
  startBoostCheckout,
  openBoostPortal,
  loadBoostStatus,
  startBoostGiftCheckout,
  boostGiftCheckoutBusy,
  loadSentBoostGifts,
  boostGiftCode,
  setBoostGiftCode,
  previewBoostGift,
  boostGiftLoading,
  boostGiftPreview,
  setBoostGiftPrompt,
  boostGiftSent,
  buildBoostGiftUrl,
  setStatus,
}) {
  return (
    <section className="card boost-card">
      <div className="boost-hero">
        <span className={`boost-pill ${boostStatus?.active ? "active" : ""}`}>
          {boostStatus?.active ? "BOOST ACTIVE" : "BOOST INACTIVE"}
        </span>
        <h4>OpenCom Boost</h4>
        <p className="hint">
          Unlock custom invite codes, permanent invite links, and higher limits.
        </p>
      </div>
      <div className="boost-grid">
        <div className="boost-price">
          <strong>£10</strong>
          <span>/ month</span>
        </div>
        <ul className="boost-perks">
          <li>Custom invite code slugs</li>
          <li>Permanent invite links</li>
          <li>100MB upload limit</li>
          <li>Unlimited servers</li>
        </ul>
      </div>
      {boostLoading && <p className="hint">Loading billing status…</p>}
      {boostStatus && (
        <p className="hint">
          Status: {boostStatus.active ? "Active" : "Inactive"}
          {boostStatus.currentPeriodEnd
            ? ` · Renews ${new Date(boostStatus.currentPeriodEnd).toLocaleDateString()}`
            : ""}
          {!boostStatus.currentPeriodEnd && boostStatus.trialActive && boostStatus.trialEndsAt
            ? ` · Trial ends ${new Date(boostStatus.trialEndsAt).toLocaleDateString()}`
            : ""}
        </p>
      )}
      {boostStatus && !boostStatus.stripeConfigured && (
        <p className="hint">Stripe is not configured on this server yet.</p>
      )}
      <div className="row-actions boost-actions">
        <button onClick={startBoostCheckout}>Get Boost</button>
        <button className="ghost" onClick={openBoostPortal}>
          Manage
        </button>
        <button className="ghost" onClick={loadBoostStatus}>
          Refresh
        </button>
      </div>

      <hr className="boost-divider" />
      <div className="boost-gift-head">
        <h5>Gift Boost (1 month)</h5>
        <p className="hint">Buy a one-month gift link and send it to a friend.</p>
      </div>
      <div className="row-actions boost-actions boost-gift-actions">
        <button onClick={startBoostGiftCheckout} disabled={boostGiftCheckoutBusy}>
          {boostGiftCheckoutBusy ? "Opening checkout…" : "Buy Gift (£10)"}
        </button>
        <button className="ghost" onClick={loadSentBoostGifts}>
          Refresh Gifts
        </button>
      </div>

      <div className="invite-link-row">
        <input
          className="invite-link-input"
          placeholder="Paste boost gift link or code"
          value={boostGiftCode}
          onChange={(event) => setBoostGiftCode(event.target.value)}
        />
        <button
          type="button"
          onClick={() => previewBoostGift(boostGiftCode)}
          disabled={boostGiftLoading}
        >
          {boostGiftLoading ? "Checking…" : "Preview"}
        </button>
      </div>

      {boostGiftPreview && (
        <div className="boost-gift-preview">
          <p className="hint">
            Gift from <strong>{boostGiftPreview.from?.username || "someone"}</strong>{" "}
            · {boostGiftPreview.grantDays} day(s)
          </p>
          <p className="hint">
            Expires {new Date(boostGiftPreview.expiresAt).toLocaleDateString()}
          </p>
          <button onClick={() => setBoostGiftPrompt(boostGiftPreview)}>
            Redeem Gift
          </button>
        </div>
      )}

      {boostGiftSent.length > 0 && (
        <div className="boost-gift-list">
          <p className="hint">Your recent gifts</p>
          {boostGiftSent.slice(0, 5).map((gift) => (
            <div key={gift.id} className="boost-gift-row">
              <span>{gift.status.toUpperCase()}</span>
              <input readOnly value={gift.joinUrl || buildBoostGiftUrl(gift.code)} />
              <button
                type="button"
                onClick={() => {
                  const link = gift.joinUrl || buildBoostGiftUrl(gift.code);
                  navigator.clipboard
                    .writeText(link)
                    .then(() => setStatus("Gift link copied."))
                    .catch(() => setStatus("Could not copy gift link."));
                }}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
