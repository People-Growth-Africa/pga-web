import LegalPage from '../components/LegalPage';

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      description="What People Growth Africa collects when you create an account, why we collect it, how long we keep it and how to delete it."
      url="/privacy"
      updated="29 September 2026"
      intro="This policy covers the accounts people create on this website. It says exactly what we collect, why we need each item, how long we keep it and how you get it deleted. It describes the code that actually runs, not a template."
    >
      <div>
        <h2>What we collect</h2>
        <p>When you create an account we collect only these details:</p>
        <ul>
          <li>
            <strong>Everyone:</strong> your email address, your password, the type of account (talent
            or employer) and the date the account was created.
          </li>
          <li>
            <strong>Talent accounts:</strong> your full name, your field or main skill, your country
            and your availability.
          </li>
          <li>
            <strong>Employer accounts:</strong> the contact person's name, the company or
            organisation name and what you told us you need (finding talent, a consultation, or
            both).
          </li>
        </ul>
        <p>
          As you use the account we also record a short audit trail: the type of sign in event
          (account created, signed in, failed sign in, password reset, account deleted), the time it
          happened, and a salted hash of the IP address the request came from. The hash cannot be
          turned back into an address, and we never store the address itself.
        </p>
        <p>
          We never store your password. We store a bcrypt hash of it, built on top of a SHA-256
          digest so that long passwords are fully protected. Passwords and the codes in verification
          and reset emails are never written to logs.
        </p>
      </div>

      <div>
        <h2>Why we collect it</h2>
        <ul>
          <li>To create and manage your account, and to sign you in securely.</li>
          <li>To match talent profiles with employers who are hiring, when you ask us to.</li>
          <li>To prepare for a consultation, using what you told us your organisation needs.</li>
          <li>
            To protect accounts from abuse: rate limiting, auditing sign in attempts and rejecting
            passwords known to have appeared in data breaches.
          </li>
          <li>To send transactional email, such as confirming your address or resetting a password.</li>
        </ul>
        <p>
          We do not sell your data, we do not use it for advertising, and we do not share it with
          third parties except the processors listed below.
        </p>
      </div>

      <div>
        <h2>Who processes it on our behalf</h2>
        <ul>
          <li>
            <strong>Vercel</strong> hosts the site and runs the server endpoints.
          </li>
          <li>
            <strong>Neon</strong> hosts the Postgres database where accounts are stored, encrypted at
            rest and in transit.
          </li>
          <li>
            <strong>Resend</strong> delivers our transactional email and therefore handles your email
            address and the message contents.
          </li>
          <li>
            <strong>Upstash</strong> holds rate limit counters for up to one hour. We send it a hashed
            identifier, never your email address or IP address.
          </li>
          <li>
            <strong>Have I Been Pwned</strong> is consulted when you choose a password. Only the first
            five characters of the password's SHA-1 hash are sent, a method called k-anonymity, so the
            service cannot tell which password was checked.
          </li>
          <li>
            <strong>Vercel Analytics</strong> records anonymous page views.
          </li>
        </ul>
      </div>

      <div>
        <h2>How long we keep it</h2>
        <ul>
          <li>Your account and profile are kept for as long as the account exists.</li>
          <li>A signed in session lasts 7 days, or until you log out.</li>
          <li>Email confirmation links expire after 24 hours. Password reset links expire after 1 hour.</li>
          <li>Rate limit counters are discarded within an hour.</li>
          <li>
            Audit rows are kept for security, but the link to your account is removed when the
            account is deleted, so the remaining row no longer identifies you.
          </li>
        </ul>
      </div>

      <div>
        <h2>Deleting your data</h2>
        <p>
          You can delete your account yourself at any time from your dashboard. Deleting it removes
          your email address, your profile and every confirmation or reset link in the same step, and
          signs you out everywhere. This cannot be undone.
        </p>
        <p>
          If you want a copy of your data, or you want us to correct it, email{' '}
          <a href="mailto:hello@peoplegrowthafrica.com">hello@peoplegrowthafrica.com</a> from the
          address on your account and we will respond within 30 days.
        </p>
      </div>

      <div>
        <h2>Your rights</h2>
        <p>
          Nigeria's Data Protection Act 2023 gives you the right to know what personal data is held
          about you, to ask for a copy, to have inaccurate data corrected, to have it deleted and to
          object to certain processing. You can exercise any of these by writing to the address above
          or by deleting your account in your dashboard. You also have the right to complain to the
          Nigeria Data Protection Commission.
        </p>
      </div>

      <div>
        <h2>Security</h2>
        <p>
          Sessions are held in a cookie that JavaScript cannot read, passwords are hashed with bcrypt
          at a high cost factor, verification and reset codes are stored only as hashes, and all
          traffic is encrypted in transit. If you find a security problem, please report it to{' '}
          <a href="mailto:hello@peoplegrowthafrica.com">hello@peoplegrowthafrica.com</a> before
          telling anyone else, so we can fix it first.
        </p>
      </div>

      <div>
        <h2>Website visits</h2>
        <p>
          We count anonymous page visits so we can tell which pages are useful. The count uses no
          tracking cookies and no advertising identifiers. Your IP address and browser name are used
          only to avoid counting the same visitor twice in one day, then replaced with a salted hash
          that is deleted after two days. Staff pages and known bots are not counted.
        </p>
      </div>

      <div>
        <h2>Children</h2>
        <p>
          These accounts are for people aged 18 and over who are working or hiring. We do not
          knowingly collect data from anyone younger, and we will delete such an account if we learn
          about it.
        </p>
      </div>

      <div>
        <h2>Changes to this policy</h2>
        <p>
          If we change what we collect or why, we will update this page and the date at the top. If
          the change is significant we will email account holders.
        </p>
      </div>

      <div>
        <h2>Legal note</h2>
        <p>
          This page explains our practices in plain language. It is not legal advice, and it has not
          been reviewed by a lawyer. We recommend that a qualified Nigerian data protection lawyer
          reviews it before the accounts are promoted widely.
        </p>
      </div>
    </LegalPage>
  );
}
