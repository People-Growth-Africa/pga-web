/**
 * The email confirmation state, in the one place it is phrased for a detail row.
 *
 * Both dashboards show it, so it lives here rather than being copied: one
 * component means the wording cannot drift between the two accounts, and the
 * words themselves always name the thing they are about. "Confirmed" alone was
 * ambiguous next to the employer visibility state, so it says "Email confirmed"
 * and nothing else uses the word confirmed for a different gate.
 *
 * `verified` always comes from the session (`users.email_verified` through
 * `GET /api/auth/me`), which is the same field the notice at the top of the page
 * and the journey strip read.
 */
export default function EmailStatusNote({ verified }: { verified: boolean }) {
  return (
    <span className="mt-1 flex items-center gap-1.5 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${verified ? 'bg-deep-green' : 'bg-terracotta'}`}
        aria-hidden="true"
      />
      <span className={verified ? 'text-deep-green' : 'text-charcoal/70'}>
        {verified ? 'Email confirmed' : 'Email not confirmed yet'}
      </span>
    </span>
  );
}
