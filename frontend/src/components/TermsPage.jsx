const TERMS_SECTIONS = [
  {
    id: "agreement",
    title: "1. Agreement to These Terms",
    body: (
      <>
        <p>
          These Terms of Service are a legal agreement between you and OpenCom for access to and use of our websites, desktop
          applications, and related services.
        </p>
        <p>
          If you use OpenCom for an organization, you represent that you are authorized to accept these Terms on that
          organization&apos;s behalf.
        </p>
        <p>If you do not agree to these Terms, do not use OpenCom.</p>
      </>
    )
  },
  {
    id: "eligibility",
    title: "2. Eligibility and Account Security",
    body: (
      <>
        <p>
          You must be at least 13 years old, or the minimum digital consent age in your country, whichever is higher.
        </p>
        <p>
          You must provide accurate information, keep your credentials secure, and promptly notify us of unauthorized use of your
          account.
        </p>
        <p>You are responsible for activity that occurs through your account.</p>
      </>
    )
  },
  {
    id: "acceptable-use",
    title: "3. Acceptable Use",
    body: (
      <>
        <p>You may not use OpenCom to:</p>
        <ul>
          <li>violate laws, regulations, or the rights of others;</li>
          <li>harass, threaten, exploit, defame, or impersonate others;</li>
          <li>share malware, phishing content, scams, or unauthorized tracking tools;</li>
          <li>attempt unauthorized access, interfere with services, or bypass security controls;</li>
          <li>infringe intellectual property, privacy, or publicity rights;</li>
          <li>distribute spam, deceptive content, or coordinated abuse;</li>
          <li>publish or promote child sexual abuse material, terrorist content, or credible violent threats.</li>
        </ul>
      </>
    )
  },
  {
    id: "user-content",
    title: "4. User Content and License",
    body: (
      <>
        <p>You keep ownership of content you submit to OpenCom.</p>
        <p>
          You grant OpenCom a worldwide, non-exclusive, royalty-free license to host, store, process, transmit, and display your
          content only as needed to operate, secure, and improve the service.
        </p>
        <p>
          You represent that you have the rights necessary to submit and share your content. You may delete content, but retained
          copies may persist in backups or logs for a limited period.
        </p>
      </>
    )
  },
  {
    id: "privacy",
    title: "5. Privacy and Data Processing",
    body: (
      <>
        <p>
          By using OpenCom, you consent to processing of account, usage, and content data as needed to deliver the service, enforce
          security, and comply with law.
        </p>
        <p>
          We may use service providers to process data on our behalf under appropriate contractual controls. We retain data only as
          long as needed for the purposes described in these Terms or required by law.
        </p>
      </>
    )
  },
  {
    id: "moderation",
    title: "6. Moderation and Enforcement",
    body: (
      <>
        <p>
          We may investigate abuse reports, review content, and take action including content removal, feature restrictions, account
          suspension, or termination.
        </p>
        <p>
          We may also preserve or disclose information when required to enforce these Terms, protect users, or comply with legal
          obligations.
        </p>
      </>
    )
  },
  {
    id: "billing",
    title: "7. Paid Features, Billing, and Cancellations",
    body: (
      <>
        <p>
          Paid subscriptions and boosts may renew automatically unless canceled before the renewal date. You authorize us and our
          payment providers to charge applicable fees and taxes.
        </p>
        <p>
          Unless required by law, fees are non-refundable once billed. You are responsible for keeping your payment details current.
        </p>
      </>
    )
  },
  {
    id: "availability",
    title: "8. Service Availability and Changes",
    body: (
      <>
        <p>
          OpenCom is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We do not guarantee uninterrupted, secure, or error-free
          operation.
        </p>
        <p>
          We may modify, suspend, or discontinue features at any time. Where practical, we will provide advance notice for material
          changes.
        </p>
      </>
    )
  },
  {
    id: "third-party",
    title: "9. Third-Party Services",
    body: (
      <>
        <p>
          OpenCom may include links or integrations with third-party services. Those services are governed by their own terms and
          privacy policies.
        </p>
        <p>We are not responsible for third-party content, conduct, security, or data handling practices.</p>
      </>
    )
  },
  {
    id: "ip",
    title: "10. OpenCom Intellectual Property",
    body: (
      <>
        <p>
          OpenCom and its software, branding, and related materials are protected by copyright, trademark, and other laws. Except as
          expressly allowed, you may not copy, modify, reverse engineer, distribute, or create derivative works from the service.
        </p>
      </>
    )
  },
  {
    id: "disclaimer",
    title: "11. Disclaimer of Warranties",
    body: (
      <>
        <p>
          To the maximum extent permitted by law, OpenCom disclaims all warranties, express or implied, including merchantability,
          fitness for a particular purpose, non-infringement, and availability.
        </p>
      </>
    )
  },
  {
    id: "liability",
    title: "12. Limitation of Liability",
    body: (
      <>
        <p>
          To the maximum extent permitted by law, OpenCom and its operators are not liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for loss of data, profits, revenue, or goodwill.
        </p>
        <p>
          Our total liability for any claim related to the service is limited to the greater of USD $100 or the amount you paid to
          OpenCom in the 12 months before the event giving rise to the claim.
        </p>
        <p>Nothing in these Terms limits rights or remedies that cannot be lawfully limited.</p>
      </>
    )
  },
  {
    id: "indemnity",
    title: "13. Indemnification",
    body: (
      <>
        <p>
          You agree to indemnify and hold harmless OpenCom and its operators from third-party claims, liabilities, damages, and
          expenses arising out of your content, your misuse of the service, or your violation of these Terms.
        </p>
      </>
    )
  },
  {
    id: "governing-law",
    title: "14. Governing Law and Disputes",
    body: (
      <>
        <p>
          These Terms are governed by the laws of the jurisdiction where OpenCom&apos;s operator is established, excluding conflict of law
          rules.
        </p>
        <p>
          Unless mandatory law requires otherwise, legal disputes must be brought in courts located in that jurisdiction, and each
          party consents to those courts.
        </p>
      </>
    )
  },
  {
    id: "changes",
    title: "15. Changes to These Terms",
    body: (
      <>
        <p>
          We may update these Terms periodically. We will update the &quot;Last updated&quot; date when changes are made. Continued use after
          changes become effective means you accept the revised Terms.
        </p>
      </>
    )
  },
  {
    id: "contact",
    title: "16. Contact",
    body: (
      <>
        <p>
          Questions about these Terms can be sent to <a href="mailto:don@opencom.online">don@opencom.online</a>.
        </p>
      </>
    )
  }
];

export function TermsPage({ onBack }) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <div className="landing-brand-wrap">
          <img src="logo.png" alt="OpenCom" className="landing-logo" />
          <span className="landing-brand">OpenCom</span>
        </div>
        <button type="button" className="landing-btn landing-btn-secondary legal-back-btn" onClick={onBack}>
          Back
        </button>
      </header>

      <main className="legal-main">
        <article className="legal-card">
          <h1>Terms of Service</h1>
          <p className="legal-meta">Last updated: February 25, 2026</p>
          <p className="legal-intro">
            Please read these Terms carefully. They define what you can expect from OpenCom and what OpenCom expects from you.
          </p>

          <nav className="legal-toc" aria-label="Terms sections">
            {TERMS_SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="legal-anchor">
                {section.title}
              </a>
            ))}
          </nav>

          {TERMS_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="legal-section">
              <h2>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </article>

        <div className="legal-actions">
          <button type="button" className="landing-btn landing-btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </main>
    </div>
  );
}
