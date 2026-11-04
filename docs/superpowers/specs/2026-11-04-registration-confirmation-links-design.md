# Links in event registration confirmations

Approved 4 November 2026.

## Goal

Let event administrators include clickable links in the registration confirmation
message, using the Markdown syntax already shown in the form editor:

`[Join Our WhatsApp Community](https://chat.whatsapp.com/example)`

## Design

Keep `confirmationMessage` as a plain string in the existing registration-form
data. Keep the existing textarea editor and add a concise hint showing the link
syntax. In the confirmation state, render only valid Markdown links as anchors;
render all other text literally, preserving line breaks. Do not interpret HTML,
bold, or italic syntax.

The rendering logic is scoped to the registration confirmation rather than
changing `SafeContent`, which is used by other pages and supports additional
formatting. Only absolute `http` and `https` URLs without credentials may become
links. Links open in a new tab with `rel="noopener noreferrer"`. Malformed or
unsupported link syntax remains visible as literal text.

## Compatibility and scope

- No registration-form schema or database changes; existing confirmation
  messages continue to display as text.
- No new dependency or rich-text editing control.
- Multiple Markdown links and ordinary multiline text are supported.
- Other Markdown formatting and raw HTML remain plain text.

## Validation

Verify link parsing and rendering for valid HTTP/HTTPS links, multiple links,
multiline text, malformed syntax, and unsafe schemes such as `javascript:`.
Run the relevant existing type-check/build and lint checks to ensure the modal
and editor remain compatible.
