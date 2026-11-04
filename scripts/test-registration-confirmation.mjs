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
  parseConfirmationMessage(
    'Click here [Join Our WhatsApp Community]\n(https://chat.whatsapp.com/example)',
  ),
  [
    { type: 'text', value: 'Click here ' },
    { type: 'link', value: 'Join Our WhatsApp Community', href: 'https://chat.whatsapp.com/example' },
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
