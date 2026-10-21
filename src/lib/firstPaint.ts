/**
 * Is this the first paint of a prerendered page?
 *
 * Since the build now ships the real markup, an entrance animation that starts
 * at `opacity: 0` would hide text that is already in the HTML — the exact
 * problem prerendering exists to solve. So on that first paint the elements are
 * rendered in their finished state, and the server and the hydrating client
 * agree on the same markup. Every later mount is a normal client-side
 * navigation and animates as before.
 *
 * On the server the page is, by definition, being prerendered, so the answer is
 * true there too. That is what keeps the two render passes identical: same
 * `initial={false}`, same inline styles, no hydration mismatch.
 */

const inBrowser = typeof document !== 'undefined';

let firstPaint =
  !inBrowser || document.documentElement.hasAttribute('data-prerendered');

/** True while the current document is still the one the build produced. */
export function isFirstPaint(): boolean {
  return firstPaint;
}

/** Called once the initial hydration has committed (see Layout). */
export function finishFirstPaint(): void {
  firstPaint = false;
}
