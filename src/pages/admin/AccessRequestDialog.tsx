import { useState, type FormEvent } from 'react';

import {
  ACCESS_PERMISSIONS,
  type AccessDuration,
  type AccessPermission,
  type AccessRequestStatus,
  type CreatedRequest,
} from './AccessClient';
import type { ApiResult } from '../../lib/authClient';

const inputClass =
  'min-h-[44px] w-full rounded-[10px] border border-charcoal/15 bg-white px-3.5 py-2.5 text-[0.9rem] text-charcoal focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20';
const labelClass = 'flex flex-col gap-1.5 text-[0.8rem] font-medium text-charcoal/70';

export default function AccessRequestDialog({
  permission,
  currentStatus,
  onSubmit,
  onCancel,
}: {
  permission: AccessPermission;
  currentStatus: AccessRequestStatus | null;
  onSubmit: (
    reason: string,
    requestedDuration: AccessDuration,
  ) => Promise<ApiResult<{ request: CreatedRequest }>>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [requestedDuration, setRequestedDuration] = useState<AccessDuration>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const permissionLabel =
    ACCESS_PERMISSIONS.find((item) => item.id === permission)?.label ?? permission;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Add a reason for your request.');
      return;
    }

    setSaving(true);
    setError(null);
    const result = await onSubmit(trimmedReason, requestedDuration);
    setSaving(false);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Close access request"
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default bg-charcoal/45"
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-request-title"
        onSubmit={(event) => void submit(event)}
        className="relative w-full max-w-[520px] rounded-[18px] border border-charcoal/10 bg-white p-6 shadow-elevated"
      >
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-deep-green">
          Permission request
        </p>
        <h2
          id="access-request-title"
          className="mt-2 font-[family-name:var(--font-heading)] text-[1.55rem] font-semibold text-charcoal"
        >
          Request {permissionLabel.toLowerCase()} access
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-charcoal/60">
          Explain what you need to do. The super administrator will review your request.
        </p>
        {currentStatus === 'declined' && (
          <p className="mt-4 rounded-[10px] bg-cream/70 px-3.5 py-3 text-xs leading-relaxed text-charcoal/65">
            Your previous request was declined. You can send a new request with more context.
          </p>
        )}

        <div className="mt-5 space-y-4">
          <label className={labelClass}>
            Reason
            <textarea
              autoFocus
              required
              minLength={1}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What work requires this access?"
              className={`${inputClass} min-h-32 resize-y`}
            />
          </label>
          <label className={labelClass}>
            Requested duration
            <select
              value={requestedDuration ?? ''}
              onChange={(event) =>
                setRequestedDuration(
                  event.target.value === '' ? null : (Number(event.target.value) as 7 | 30 | 90),
                )
              }
              className={inputClass}
            >
              <option value="">Permanent</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
            <span className="text-[0.72rem] text-charcoal/45">
              This is a preference. The reviewer chooses the final duration.
            </span>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-[10px] bg-terracotta/10 px-3.5 py-3 text-sm text-terracotta">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[10px] border border-charcoal/15 bg-white px-5 text-sm font-semibold text-charcoal hover:bg-cream/60 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-deep-green px-5 text-sm font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  );
}
