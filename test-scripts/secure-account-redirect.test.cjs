const assert = require('node:assert/strict');

require('./identity-runtime-loader.cjs');

const {
  sanitizeAccountReturnTo,
  resolveAccountLoginDestination,
} = require('../src/lib/safe-account-redirect.ts');

let passed = 0;

function test(name, operation) {
  operation();
  passed++;
  console.log('PASS: ' + name);
}

const safePaths = [
  '/dashboard',
  '/dashboard/connections',
  '/dashboard?tab=profile',
  '/control',
  '/startups/example',
];

for (const path of safePaths) {
  test('Safe path: ' + path, () => {
    assert.equal(
      sanitizeAccountReturnTo(path),
      path
    );
  });
}

const unsafePaths = [
  '',
  'https://evil.example',
  '//evil.example',
  '/\\evil.example',
  '/%2Fevil.example',
  '/%5Cevil.example',
  '/dashboard/../control',
  '/dashboard/%2e%2e/control',
  'javascript:alert(1)',
  'dashboard',
  '/dashboard\n',
  '/dashboard\t',
  '/dashboard with spaces',
  '/' + 'a'.repeat(2050),
];

for (const path of unsafePaths) {
  test(
    'Unsafe path blocked: ' +
      JSON.stringify(path).slice(0, 90),
    () => {
      assert.equal(
        sanitizeAccountReturnTo(path),
        null
      );
    }
  );
}

function account({
  startup = false,
  eventOrganizer = false,
  admin = false,
  status = 'active',
} = {}) {
  return {
    uid: 'test-account',
    status,
    isAdmin: admin,
    portals: {
      startup: {
        allowed: startup,
      },
      event_organizer: {
        allowed: eventOrganizer,
      },
    },
  };
}

const scenarios = [
  [
    'Startup default destination',
    account({ startup: true }),
    null,
    '/dashboard',
  ],
  [
    'Startup authorized returnTo',
    account({ startup: true }),
    '/dashboard/connections',
    '/dashboard/connections',
  ],
  [
    'Startup cannot redirect to control',
    account({ startup: true }),
    '/control',
    '/dashboard',
  ],
  [
    'Startup external redirect blocked',
    account({ startup: true }),
    '//evil.example',
    '/dashboard',
  ],
  [
    'Admin default destination',
    account({ admin: true }),
    null,
    '/control',
  ],
  [
    'Admin authorized returnTo',
    account({ admin: true }),
    '/control/users',
    '/control/users',
  ],
  [
    'Event Organizer-only cannot enter Startup',
    account({ eventOrganizer: true }),
    '/dashboard',
    null,
  ],
  [
    'Dual profile requires portal selection',
    account({
      startup: true,
      eventOrganizer: true,
    }),
    null,
    null,
  ],
  [
    'Dual profile authorized Startup returnTo',
    account({
      startup: true,
      eventOrganizer: true,
    }),
    '/dashboard/profile',
    '/dashboard/profile',
  ],
  [
    'Suspended account cannot redirect',
    account({
      startup: true,
      admin: true,
      status: 'suspended',
    }),
    '/control',
    null,
  ],
  [
    'Unprovisioned account has no destination',
    account({
      status: 'unprovisioned',
    }),
    null,
    null,
  ],
];

for (
  const [name, profile, returnTo, expected]
  of scenarios
) {
  test(name, () => {
    assert.equal(
      resolveAccountLoginDestination(
        profile,
        returnTo
      ),
      expected
    );
  });
}

console.log(
  'TOTAL SECURE REDIRECT CHECKS PASSED: ' +
  passed
);
