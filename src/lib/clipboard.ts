/**
 * Copying a share link, in one place so the article and the event agree.
 *
 * `navigator.clipboard` only exists in a secure context, so an older browser or
 * a page served over plain http falls back to the hidden-field trick rather than
 * failing silently.
 */
export function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  return new Promise((resolve, reject) => {
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    if (copied) resolve();
    else reject(new Error('copy failed'));
  });
}

/** How long "Link copied" stays on screen before the button returns to normal. */
export const COPIED_FEEDBACK_MS = 2000;
