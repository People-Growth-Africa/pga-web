import assert from 'node:assert/strict';
import { getRegistrationCutoff, isRegistrationOpen } from '../src/lib/event-registration.ts';

const eventStart = '2027-02-20T14:00:00+01:00';
const cutoff = Date.parse(eventStart);

assert.equal(isRegistrationOpen({ eventStart }, cutoff - 1), true);
assert.equal(isRegistrationOpen({ eventStart }, cutoff), false);
assert.equal(isRegistrationOpen({ eventStart }, cutoff + 1), false);
assert.equal(
  isRegistrationOpen({ eventStart: '2027-02-20T13:00:00Z' }, '2027-02-20T12:59:59Z'),
  true,
);

const dstStart = '2025-03-09T03:00:00-04:00';
assert.equal(
  isRegistrationOpen({ eventStart: dstStart }, Date.parse('2025-03-09T01:59:59-05:00')),
  true,
);
assert.equal(
  isRegistrationOpen({ eventStart: dstStart }, Date.parse('2025-03-09T03:00:00-04:00')),
  false,
);

assert.equal(getRegistrationCutoff({ eventStart: '2027-02-20T13:00:00Z' }), cutoff);
assert.equal(
  isRegistrationOpen(
    { eventStart: '2027-02-20T13:00:00Z', eventEnd: null },
    cutoff - 1,
  ),
  true,
);
assert.equal(isRegistrationOpen({ eventStart: null }, cutoff - 1), false);
assert.equal(isRegistrationOpen({ eventStart: 'not-a-date' }, cutoff - 1), false);
assert.equal(
  isRegistrationOpen(
    { eventStart: '2027-02-20T13:00:00Z', registrationDeadline: '2027-02-19T13:00:00Z' },
    cutoff - 1,
  ),
  false,
);

console.log('PASS  event registration cutoff boundaries and timezones');
