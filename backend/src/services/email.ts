import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? "noreply@snapcard.ca";

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!apiKey) {
    console.log(`[Email] Would send to ${to}: ${subject}`);
    return;
  }

  await sgMail.send({ to, from: fromEmail, subject, html });
}

// ── Welcome email ──────────────────────────────────────

export async function sendWelcomeEmail(email: string, name: string | null): Promise<void> {
  const displayName = name ?? "there";

  await send(
    email,
    "Welcome to SnapCard!",
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to SnapCard, ${displayName}!</h2>
      <p>You're all set to start listing trading cards on eBay faster than ever.</p>
      <h3>Getting Started:</h3>
      <ol>
        <li><strong>Connect your eBay account</strong> — authorize SnapCard to create listings</li>
        <li><strong>Upload a card photo</strong> — our AI identifies it instantly</li>
        <li><strong>Review &amp; publish</strong> — one click to go live on eBay</li>
      </ol>
      <p>
        <a href="${process.env.FRONTEND_URL ?? "https://snapcard.ca"}/onboarding"
           style="display: inline-block; padding: 10px 24px; background: #18181b; color: #fff; border-radius: 6px; text-decoration: none;">
          Get Started
        </a>
      </p>
      <p style="color: #666; font-size: 14px; margin-top: 24px;">
        Questions? Just reply to this email.
      </p>
    </div>
    `
  );
}

// ── Listing published email ────────────────────────────

export async function sendListingPublishedEmail(
  email: string,
  cardName: string,
  ebayItemId: string
): Promise<void> {
  await send(
    email,
    `Your listing is live: ${cardName}`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Your listing is live!</h2>
      <p><strong>${cardName}</strong> has been published to eBay.</p>
      <p>
        <a href="https://www.ebay.ca/itm/${ebayItemId}"
           style="display: inline-block; padding: 10px 24px; background: #18181b; color: #fff; border-radius: 6px; text-decoration: none;">
          View on eBay
        </a>
      </p>
      <p style="color: #666; font-size: 14px; margin-top: 24px;">
        Manage your listings at
        <a href="${process.env.FRONTEND_URL ?? "https://snapcard.ca"}/dashboard">SnapCard Dashboard</a>.
      </p>
    </div>
    `
  );
}

// ── Listing error email ────────────────────────────────

export async function sendListingErrorEmail(
  email: string,
  cardName: string,
  errorMessage: string
): Promise<void> {
  await send(
    email,
    `Listing failed: ${cardName}`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Listing failed</h2>
      <p>There was an issue publishing <strong>${cardName}</strong> to eBay:</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; margin: 16px 0;">
        <p style="color: #991b1b; margin: 0;">${errorMessage}</p>
      </div>
      <p>You can retry from your dashboard:</p>
      <p>
        <a href="${process.env.FRONTEND_URL ?? "https://snapcard.ca"}/dashboard"
           style="display: inline-block; padding: 10px 24px; background: #18181b; color: #fff; border-radius: 6px; text-decoration: none;">
          Go to Dashboard
        </a>
      </p>
    </div>
    `
  );
}
