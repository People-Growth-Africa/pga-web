# Event Registration Confirmation Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Markdown-style HTTP(S) links in event registration confirmation messages while preserving plain text and safe rendering.

**Architecture:** Add a pure TypeScript parser that splits a confirmation message into literal-text and safe-link parts. Render those parts in the confirmation state and show the supported syntax beside the existing admin textarea; keep stored form data unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Node.js built-in assertions for the focused regression script.

## Global Constraints

- Interpret only Markdown links; other Markdown formatting and raw HTML remain plain text.
- Only absolute `http` and `https` URLs without credentials may become links.
- Links open in a new tab with `rel="noopener noreferrer"`.
- Preserve ordinary text, multiline messages, and existing stored registration forms.
- Do not add a dependency or change the registration-form schema/database.

---

## File map

- Create `src/lib/confirmationMessage.ts` for parsing link syntax and validating targets.
- Modify `src/components/EventRegistrationModal.tsx` to render parsed text and links accessibly in the confirmed state.
- Modify `src/components/admin/RegistrationFormBuilder.tsx` to explain the supported Markdown syntax under the existing textarea.
- Create `scripts/test-registration-confirmation.mjs` for fast parser regression tests.
- Modify `package.json` to expose the focused test as `npm run test:registration-confirmation`.

### Task 1: Parse safe links from confirmation text

**Files:**
- Create: `src/lib/confirmationMessage.ts`
- Create: `scripts/test-registration-confirmation.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `parseConfirmationMessage(message: string): ConfirmationMessagePart[]`.
- `ConfirmationMessagePart` is a discriminated union:

```ts
export type ConfirmationMessagePart =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };
```

- A link part contains its visible label in `value` and the original validated URL in `href`. Unsupported or malformed syntax remains inside text parts.

- [x] **Step 1: Add regression cases for text and links**

Create `scripts/test-registration-confirmation.mjs`:

```js
import assert from 'node:assert/strict';
import { parseConfirmationMessage } from '../src/lib/confirmationMessage.ts';

assert.deepEqual(parseConfirmationMessage('Thanks for registering.'), [
  { type: 'text', value: 'Thanks for registering.' },
]);
assert.deepEqual(parseConfirmationMessage(''), []);
assert.deepEqual(parseConfirmationMessage('**bold** <strong>HTML</strong>'), [
  { type: 'text', value: '**bold** <strong>HTML</strong>' },
]);

assert.deepEqual(
  parseConfirmationMessage(
    'Join [the community](https://chat.whatsapp.com/example) or [visit us](http://example.com).',
  ),
  [
    { type: 'text', value: 'Join ' },
    { type: 'link', value: 'the community', href: 'https://chat.whatsapp.com/example' },
    { type: 'text', value: ' or ' },
    { type: 'link', value: 'visit us', href: 'http://example.com' },
    { type: 'text', value: '.' },
  ],
);

assert.deepEqual(
  parseConfirmationMessage('First line\n[Join](https://example.com)\nLast line'),
  [
    { type: 'text', value: 'First line\n' },
    { type: 'link', value: 'Join', href: 'https://example.com' },
    { type: 'text', value: '\nLast line' },
  ],
);

const unsafe = '[run](javascript:alert(1))';
assert.deepEqual(parseConfirmationMessage(unsafe), [{ type: 'text', value: unsafe }]);

const credentialUrl = '[private](https://not-a-secret@host.invalid)';
assert.deepEqual(parseConfirmationMessage(credentialUrl), [
  { type: 'text', value: credentialUrl },
]);

const relativeProtocolUrl = '[relative](http:example.com)';
assert.deepEqual(parseConfirmationMessage(relativeProtocolUrl), [
  { type: 'text', value: relativeProtocolUrl },
]);

const malformed = '[missing destination] and [unfinished](https://example.com';
assert.deepEqual(parseConfirmationMessage(malformed), [{ type: 'text', value: malformed }]);

console.log('PASS  registration confirmation link parsing');
```

- [x] **Step 2: Run the focused test and confirm it fails**

Add `"test:registration-confirmation": "node scripts/test-registration-confirmation.mjs"` to `package.json` scripts, then run:

```text
npm run test:registration-confirmation
```

Expected: FAIL because `src/lib/confirmationMessage.ts` does not exist yet.

- [x] **Step 3: Implement the parser**

In `src/lib/confirmationMessage.ts`, define the union above and export `parseConfirmationMessage`. Scan matches of `/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi`, emitting any preceding text and then a link only when `new URL(href)` succeeds and both `username` and `password` are empty. Leave rejected matches within the unconsumed text so they are emitted literally. Append any trailing text. For an empty input return `[]`; when a nonempty input contains no valid link, return one text part containing the input unchanged.

- [x] **Step 4: Run the parser regression test**

Run `npm run test:registration-confirmation`.

Expected: PASS for ordinary text, multiple links, both allowed protocols, preserved newlines, malformed syntax, `javascript:`, non-absolute HTTP URLs, and credential-bearing URLs.

### Task 2: Render links in the admin previewed confirmation flow

**Files:**
- Modify: `src/components/EventRegistrationModal.tsx`
- Modify: `src/components/admin/RegistrationFormBuilder.tsx`

**Interfaces:**
- Consumes `parseConfirmationMessage(message: string): ConfirmationMessagePart[]` from Task 1.
- The modal renders each text part as a React text child and each link part as an `<a>` with `href`, `target="_blank"`, and `rel="noopener noreferrer"`.

- [x] **Step 1: Add the textarea hint**

In `RegistrationFormBuilder.tsx`, add helper text beneath the existing confirmation-message textarea:

```tsx
<span className="mt-1 block font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/45">
  Use [link text](https://example.com) to add a clickable link.
</span>
```

Keep the existing textarea value, update handler, row count, maximum length, and disabled behavior unchanged.

- [x] **Step 2: Render parsed parts in the confirmation modal**

Import `parseConfirmationMessage` in `EventRegistrationModal.tsx`. Keep the existing condition for an empty confirmation message and the default thank-you copy unchanged. For a nonempty message, render the parsed parts inside the existing paragraph with its current styling and `whitespace-pre-line` class. Use an index-based React key; render link labels as children, and set `target="_blank"` plus `rel="noopener noreferrer"` on links. Do not use `dangerouslySetInnerHTML`.

- [x] **Step 3: Run the focused regression test**

Run `npm run test:registration-confirmation`.

Expected: PASS with no parser regressions.

- [x] **Step 4: Run type-check and lint**

Run:

```text
npx tsc -b
npm run lint
```

Expected: both commands pass.

- [x] **Step 5: Review the diff**

Run `git --no-pager diff --check` and inspect the changed files. Confirm only the confirmation-message textarea hint and confirmed-state rendering changed in the UI, and that no schema, API, or database files changed.
