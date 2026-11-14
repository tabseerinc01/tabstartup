const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

let authenticatedAccount = null;

Module._load = function (request, parent, isMain) {
  if (request === 'server-only') {
    return {};
  }

  if (
    request ===
    '@/services/account-authorization.service'
  ) {
    return {
      authenticateAccount: async token => {
        if (
          token !== 'unit-test-token' ||
          !authenticatedAccount
        ) {
          throw new Error('UNAUTHENTICATED');
        }

        return authenticatedAccount;
      },
    };
  }

  if (
    request.startsWith('firebase') ||
    request.startsWith('@firebase/') ||
    request.startsWith('@/firebase/')
  ) {
    throw new Error(
      'FIREBASE_ACCESS_BLOCKED_IN_UNIT_TEST'
    );
  }

  return originalLoad.call(
    this, request, parent, isMain
  );
};

Module._resolveFilename = function (
  request, parent, isMain, options
) {
  if (request.startsWith('@/')) {
    request = path.join(
      src,
      request.slice(2)
    );
  }

  return originalResolve.call(
    this, request, parent, isMain, options
  );
};

require.extensions['.ts'] = function (
  module, filename
) {
  if (!filename.startsWith(src + path.sep)) {
    throw new Error(
      'UNEXPECTED_TYPESCRIPT_SOURCE'
    );
  }

  const compiled = ts.transpileModule(
    fs.readFileSync(filename, 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }
  );

  module._compile(
    compiled.outputText,
    filename
  );
};

const auth = require(
  '../src/services/event-authorization.service.ts'
);

const projection = require(
  '../src/lib/event-public-projection.ts'
);

const asset = require(
  '../src/lib/event-asset-validation.ts'
);

const payment = require(
  '../src/lib/payment-types.ts'
);

const eventTypes = require(
  '../src/lib/event-types.ts'
);

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function equal(name, fn, expected) {
  test(name, async () => {
    assert.deepEqual(await fn(), expected);
  });
}

function rejects(name, fn) {
  test(name, () => {
    assert.throws(fn);
  });
}

const official =
  auth.getOfficialEventOwnership();

const admin = {
  uid: 'admin-test',
  identity: {
    uid: 'admin-test',
    status: 'active',
  },
  isAdmin: true,
};

const external = {
  organizerType: 'verified_organizer',
  organizerId: 'external-test',
};

function decision(
  account,
  permission = 'event:update',
  ownership = official
) {
  return auth.evaluateEventManagementAccess(
    account,
    permission,
    ownership
  );
}

// ==================================================
// AUTHORIZATION
// ==================================================

const permissions = [
  'event:create',
  'event:read',
  'event:update',
  'event:publish',
  'event:cancel',
  'event:archive',
  'event:manage_tickets',
  'event:manage_inventory',
  'event:manage_participants',
  'event:manage_checkins',
  'event:manage_private_details',
  'event:manage_payments',
  'event:manage_refunds',
  'event:view_analytics',
  'event:view_audit_logs',
];

for (const permission of permissions) {
  equal(
    `Admin allowed: ${permission}`,
    () => decision(admin, permission).allowed,
    true
  );

  equal(
    `Non-admin denied: ${permission}`,
    () => decision(
      { ...admin, isAdmin: false },
      permission
    ).allowed,
    false
  );
}

equal(
  'Suspended admin denied',
  () => decision({
    ...admin,
    identity: {
      ...admin.identity,
      status: 'suspended',
    },
  }).reason,
  'ACCOUNT_SUSPENDED'
);

equal(
  'Mismatched identity denied',
  () => decision({
    ...admin,
    identity: {
      ...admin.identity,
      uid: 'different-user',
    },
  }).reason,
  'INVALID_ACCOUNT'
);

equal(
  'Unknown permission denied',
  () => decision(
    admin,
    'event:unknown'
  ).reason,
  'INVALID_PERMISSION'
);

equal(
  'External Event Organizer disabled',
  () => decision(
    admin,
    'event:publish',
    external
  ).reason,
  'EXTERNAL_EVENT_ORGANIZER_DISABLED'
);

equal(
  'Forged platform ownership denied',
  () => decision(
    admin,
    'event:update',
    {
      organizerType: 'platform',
      organizerId: 'forged-platform',
    }
  ).reason,
  'INVALID_EVENT_OWNERSHIP'
);

rejects(
  'Ownership cannot change',
  () => auth.assertEventOwnershipUnchanged(
    official,
    external
  )
);

test(
  'Official ownership remains unchanged',
  () => auth.assertEventOwnershipUnchanged(
    official,
    { ...official }
  )
);

const context = {
  uid: admin.uid,
  actorType: 'admin',
  account: admin,
};

test(
  'Admin can publish official draft',
  () => auth.assertAdminEventTransition(
    context,
    {
      ...official,
      status: 'draft',
    },
    'published'
  )
);

rejects(
  'Invalid lifecycle transition denied',
  () => auth.assertAdminEventTransition(
    context,
    {
      ...official,
      status: 'published',
    },
    'draft'
  )
);

rejects(
  'Forged admin context denied',
  () => auth.assertAdminEventTransition(
    {
      ...context,
      uid: 'forged-admin',
    },
    {
      ...official,
      status: 'draft',
    },
    'published'
  )
);

equal(
  'Valid bearer token extracted',
  () => auth.getEventBearerToken(
    new Request('https://example.test', {
      headers: {
        authorization: 'Bearer test-token',
      },
    })
  ),
  'test-token'
);

for (const header of [
  '',
  'Basic test-token',
  'Bearer ',
  'Bearer token with spaces',
]) {
  rejects(
    `Invalid bearer rejected: ${header}`,
    () => auth.getEventBearerToken(
      new Request('https://example.test', {
        headers: {
          authorization: header,
        },
      })
    )
  );
}

test(
  'Authenticated admin receives context',
  async () => {
    authenticatedAccount = admin;

    const result =
      await auth.requireEventAdmin(
        'unit-test-token',
        'event:create'
      );

    assert.equal(result.uid, admin.uid);
    assert.equal(result.actorType, 'admin');
  }
);

test(
  'Invalid authentication rejected',
  async () => {
    await assert.rejects(
      auth.requireEventAdmin(
        'invalid-token',
        'event:create'
      )
    );
  }
);

test(
  'Authenticated non-admin rejected',
  async () => {
    authenticatedAccount = {
      ...admin,
      isAdmin: false,
    };

    await assert.rejects(
      auth.requireEventAdmin(
        'unit-test-token',
        'event:create'
      ),
      { code: 'ADMIN_ACCESS_REQUIRED' }
    );
  }
);

// ==================================================
// PUBLIC EVENT FIXTURES
// ==================================================

const now = 1800000000000;

const stamp = value => ({
  toMillis: () => value,
});

const event = {
  ...official,
  eventId: 'event-test',
  slug: 'startup-event',
  title: 'Startup Event',
  shortDescription: 'Startup networking',
  description: 'Official startup event',
  organizerName: 'TabStartup',
  organizerLogoUrl: null,
  category: 'networking',
  mode: 'online',
  status: 'published',
  visibility: 'public',
  registrationType: 'paid',
  registrationStatus: 'open',
  bannerUrl: null,
  timezone: 'Asia/Dhaka',
  startsAt: stamp(now + 3600000),
  endsAt: stamp(now + 7200000),
  registrationOpensAt: stamp(now - 3600000),
  registrationClosesAt: stamp(now + 1800000),
  venue: null,
  capacity: {
    online: 100,
    offline: 0,
  },
  allowGuestRegistration: true,
  maxTicketsPerOrder: 5,
  speakers: [{
    speakerId: 'speaker-test',
    fullName: 'Test Speaker',
    designation: 'Founder',
    organization: 'Test Startup',
    bio: 'Speaker biography',
    imageUrl: null,
    profileUid: 'PRIVATE_PROFILE_UID',
  }],
  sponsors: [{
    sponsorId: 'sponsor-test',
    name: 'Test Sponsor',
    tier: 'gold',
    logoUrl: null,
    websiteUrl: null,
    privateEmail: 'PRIVATE_SPONSOR_EMAIL',
  }],
  agenda: [{
    agendaItemId: 'agenda-test',
    title: 'Opening',
    description: 'Opening session',
    startsAt: stamp(now + 3600000),
    endsAt: stamp(now + 5400000),
    speakerIds: ['speaker-test'],
    attendanceMode: 'online',
    privateMeetingUrl: 'PRIVATE_MEETING_URL',
  }],
  terms: 'Event terms',
  refundPolicy: 'Event refund policy',
  schemaVersion: 1,
  createdByUid: 'PRIVATE_ADMIN_UID',
  meetingPasscode: 'PRIVATE_PASSCODE',
};

const ticket = {
  eventId: event.eventId,
  ticketTypeId: 'ticket-test',
  name: 'General Admission',
  description: 'Event access',
  benefits: ['Online access'],
  attendanceMode: 'online',
  pricingType: 'paid',
  price: {
    usdAmountMinor: 1000,
    bdtAmountMinor: 120000,
  },
  status: 'active',
  salesStartAt: null,
  salesEndAt: null,
  maxPerOrder: 5,
  sortOrder: 1,
  schemaVersion: 1,
  privateNote: 'PRIVATE_TICKET_NOTE',
};

const inventory = {
  eventId: event.eventId,
  ticketTypeId: ticket.ticketTypeId,
  capacity: 100,
  reservedQuantity: 5,
  issuedQuantity: 10,
};

function publicEvent(
  overrides = {},
  time = now
) {
  return projection.buildPublicEventProjection(
    { ...event, ...overrides },
    time
  );
}

function publicTicket(
  ticketOverrides = {},
  inventoryOverrides = {},
  eventOverrides = {},
  time = now
) {
  return projection.buildPublicTicketProjection(
    { ...event, ...eventOverrides },
    { ...ticket, ...ticketOverrides },
    { ...inventory, ...inventoryOverrides },
    time
  );
}

// ==================================================
// PUBLIC EVENT SECURITY
// ==================================================

equal(
  'Published official event visible',
  () => publicEvent().eventId,
  event.eventId
);

for (const status of [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'cancelled',
  'archived',
]) {
  equal(
    `Non-public status hidden: ${status}`,
    () => publicEvent({ status }),
    null
  );
}

for (const visibility of [
  'private',
  'invite_only',
]) {
  equal(
    `Visibility hidden: ${visibility}`,
    () => publicEvent({ visibility }),
    null
  );
}

equal(
  'External event projection denied',
  () => publicEvent(external),
  null
);

equal(
  'Unsupported schema hidden',
  () => publicEvent({ schemaVersion: 2 }),
  null
);

equal(
  'Completed public event visible',
  () => publicEvent({
    status: 'completed',
  }).status,
  'completed'
);

equal(
  'Completed event registration closed',
  () => publicEvent({
    status: 'completed',
  }).registrationStatus,
  'closed'
);

test(
  'Confidential event fields excluded',
  () => {
    const result = publicEvent();
    const serialized = JSON.stringify(result);

    assert.equal(
      serialized.includes('PRIVATE_'),
      false
    );

    assert.equal('capacity' in result, false);
    assert.equal('createdByUid' in result, false);

    assert.equal(
      'profileUid' in result.speakers[0],
      false
    );
  }
);

rejects(
  'Online event rejects physical venue',
  () => publicEvent({
    venue: {
      name: 'Test venue',
      address: 'Test address',
      city: 'Dhaka',
      countryCode: 'BD',
      mapUrl: null,
    },
  })
);

rejects(
  'Invalid event date range rejected',
  () => publicEvent({
    endsAt: stamp(now - 1000),
  })
);

rejects(
  'Invalid projection clock rejected',
  () => publicEvent({}, NaN)
);

// ==================================================
// PUBLIC TICKET SECURITY
// ==================================================

equal(
  'Valid ticket available',
  () => publicTicket().availability,
  'available'
);

equal(
  'Draft ticket hidden',
  () => publicTicket({ status: 'draft' }),
  null
);

equal(
  'Archived ticket hidden',
  () => publicTicket({ status: 'archived' }),
  null
);

equal(
  'Private event ticket hidden',
  () => publicTicket(
    {},
    {},
    { visibility: 'private' }
  ),
  null
);

equal(
  'Paused ticket closed',
  () => publicTicket({
    status: 'paused',
  }).availability,
  'closed'
);

equal(
  'Sold-out ticket correctly marked',
  () => publicTicket(
    {},
    { issuedQuantity: 95 }
  ).availability,
  'sold_out'
);

equal(
  'Future ticket sale not open',
  () => publicTicket({
    salesStartAt: stamp(now + 1000),
  }).availability,
  'not_open'
);

equal(
  'Expired ticket sale closed',
  () => publicTicket({
    salesEndAt: stamp(now - 1000),
  }).availability,
  'closed'
);

equal(
  'Registration deadline closes tickets',
  () => publicTicket(
    {},
    {},
    {},
    now + 1800000
  ).availability,
  'closed'
);

rejects(
  'Foreign event ticket rejected',
  () => publicTicket({
    eventId: 'different-event',
  })
);

rejects(
  'Foreign inventory rejected',
  () => publicTicket(
    {},
    { ticketTypeId: 'different-ticket' }
  )
);

rejects(
  'Overbooked inventory rejected',
  () => publicTicket(
    {},
    { issuedQuantity: 100 }
  )
);

rejects(
  'Invalid paid currency price rejected',
  () => publicTicket({
    price: {
      usdAmountMinor: 1000,
      bdtAmountMinor: 0,
    },
  })
);

test(
  'Exact inventory counters excluded',
  () => {
    const result = publicTicket();

    for (const key of [
      'capacity',
      'reservedQuantity',
      'issuedQuantity',
      'privateNote',
    ]) {
      assert.equal(key in result, false);
    }
  }
);

equal(
  'Independent dual currency prices preserved',
  () => publicTicket().price,
  ticket.price
);

// ==================================================
// MALFORMED PUBLIC DATA SECURITY
// ==================================================

const privateObject = {
  secret: 'PRIVATE_MALFORMED_DATA',
};

for (const field of [
  'title',
  'shortDescription',
  'description',
  'organizerName',
  'organizerLogoUrl',
  'category',
  'registrationType',
  'registrationStatus',
  'bannerUrl',
  'timezone',
  'allowGuestRegistration',
  'maxTicketsPerOrder',
  'terms',
  'refundPolicy',
]) {
  rejects(
    `Malformed event field rejected: ${field}`,
    () => publicEvent({
      [field]: privateObject,
    })
  );
}

rejects(
  'Malformed nested speaker field rejected',
  () => publicEvent({
    speakers: [{
      ...event.speakers[0],
      fullName: privateObject,
    }],
  })
);

rejects(
  'Malformed nested sponsor field rejected',
  () => publicEvent({
    sponsors: [{
      ...event.sponsors[0],
      name: privateObject,
    }],
  })
);

rejects(
  'Malformed agenda speaker ID rejected',
  () => publicEvent({
    agenda: [{
      ...event.agenda[0],
      speakerIds: [privateObject],
    }],
  })
);

rejects(
  'Unsafe public banner URL rejected',
  () => publicEvent({
    bannerUrl: 'javascript:alert(1)',
  })
);

for (const field of [
  'name',
  'description',
  'sortOrder',
]) {
  rejects(
    `Malformed ticket field rejected: ${field}`,
    () => publicTicket({
      [field]: privateObject,
    })
  );
}

rejects(
  'Malformed ticket benefit rejected',
  () => publicTicket({
    benefits: [privateObject],
  })
);

equal(
  'Event projection closes at registration deadline',
  () => publicEvent(
    {},
    now + 1800000
  ).registrationStatus,
  'closed'
);

// ==================================================
// EVENT ASSET VALIDATION
// ==================================================

const jpeg = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0,
]);

const png = new Uint8Array(24);

png.set([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
]);

png.set([0x49, 0x48, 0x44, 0x52], 12);

const webp = Buffer.alloc(20);

webp.write('RIFF', 0);
webp.writeUInt32LE(12, 4);
webp.write('WEBP', 8);
webp.write('VP8 ', 12);

for (const [mime, bytes] of [
  ['image/jpeg', jpeg],
  ['image/png', png],
  ['image/webp', webp],
]) {
  equal(
    `Image signature detected: ${mime}`,
    () => asset.detectEventImageMimeType(bytes),
    mime
  );

  equal(
    `Preliminary image validation: ${mime}`,
    () => asset.validateEventAssetBytes(
      'banners',
      mime,
      bytes
    ).mimeType,
    mime
  );
}

rejects(
  'MIME mismatch rejected',
  () => asset.validateEventAssetBytes(
    'banners',
    'image/png',
    jpeg
  )
);

rejects(
  'SVG rejected',
  () => asset.validateEventAssetBytes(
    'banners',
    'image/svg+xml',
    Buffer.from('<svg></svg>')
  )
);

rejects(
  'Empty image rejected',
  () => asset.validateEventAssetBytes(
    'banners',
    'image/jpeg',
    new Uint8Array(0)
  )
);

rejects(
  'Fake JPEG rejected',
  () => asset.validateEventAssetBytes(
    'banners',
    'image/jpeg',
    Buffer.from('<html>invalid</html>')
  )
);

for (const category of [
  'banners',
  'speakers',
  'sponsors',
]) {
  rejects(
    `Oversized asset rejected: ${category}`,
    () => asset.validateEventAssetBytes(
      category,
      'image/jpeg',
      new Uint8Array(
        asset.EVENT_ASSET_SIZE_LIMITS[
          category
        ] + 1
      )
    )
  );
}

rejects(
  'Unknown asset category rejected',
  () => asset.validateEventAssetBytes(
    'documents',
    'image/jpeg',
    jpeg
  )
);

test(
  'Valid image dimensions accepted',
  () => asset.assertEventImageDimensions(
    1920,
    1080
  )
);

for (const [width, height] of [
  [0, 100],
  [-1, 100],
  [6001, 100],
  [6000, 6000],
  [NaN, 100],
  [100.5, 100],
]) {
  rejects(
    `Invalid dimensions rejected: ${width}x${height}`,
    () => asset.assertEventImageDimensions(
      width,
      height
    )
  );
}

for (const badId of [
  '../private',
  'event/test',
  '..',
  '',
  'event test',
  'event\n',
  'event%2Ftest',
]) {
  rejects(
    `Unsafe event path rejected: ${JSON.stringify(badId)}`,
    () => asset.buildEventAssetPath(
      'private',
      badId,
      'banners',
      'asset-test',
      'jpg'
    )
  );
}

rejects(
  'Unsafe asset ID rejected',
  () => asset.buildEventAssetPath(
    'private',
    'event-test',
    'banners',
    '../secret',
    'jpg'
  )
);

rejects(
  'Executable extension rejected',
  () => asset.buildEventAssetPath(
    'public',
    'event-test',
    'banners',
    'asset-test',
    'html'
  )
);

equal(
  'Private asset path correct',
  () => asset.buildEventAssetPath(
    'private',
    'event-test',
    'banners',
    'asset-test',
    'jpg'
  ),
  'event-assets/private/event-test/banners/asset-test.jpg'
);

test(
  'Generated asset identities are unique',
  () => {
    const a = asset.createEventAssetPaths(
      'event-test',
      'banners',
      'image/jpeg'
    );

    const b = asset.createEventAssetPaths(
      'event-test',
      'banners',
      'image/jpeg'
    );

    assert.notEqual(a.assetId, b.assetId);

    assert.equal(
      a.privatePath.replace(
        '/private/',
        '/public/'
      ),
      a.publicPath
    );
  }
);

// ==================================================
// SHARED PAYMENT COLLECTIONS
// ==================================================

test(
  'Event and payment collections are separate',
  () => {
    const eventNames = Object.values(
      eventTypes.EVENT_COLLECTIONS
    );

    const paymentNames = Object.values(
      payment.PAYMENT_COLLECTIONS
    );

    assert.equal(paymentNames.length, 7);

    assert.equal(
      new Set(paymentNames).size,
      paymentNames.length
    );

    for (const name of paymentNames) {
      assert.equal(
        eventNames.includes(name),
        false
      );
    }
  }
);

equal(
  'USD payment routes to TabEdge',
  () => payment.getActivePaymentMethod(
    'USD'
  ).provider,
  'tabedge'
);

equal(
  'BDT payment routes to bKash manual',
  () => payment.getActivePaymentMethod(
    'BDT'
  ).provider,
  'bkash_manual'
);

// ==================================================
// EXECUTION
// ==================================================

async function main() {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log('PASS:', name);
    } catch (error) {
      failed++;
      console.error('FAIL:', name);
      console.error(error.message);
    }
  }

  console.log(
    '\n===== EVENT SECURITY TEST SUMMARY ====='
  );

  console.log('Passed:', passed);
  console.log('Failed:', failed);
  console.log('Total:', passed + failed);

  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
