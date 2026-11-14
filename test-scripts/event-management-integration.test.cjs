const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

require('./identity-runtime-loader.cjs');

const {
  getFirebaseAdmin,
} = require('../src/firebase/admin.ts');

const {
  deleteApp,
} = require('firebase-admin/app');

const {
  EVENT_COLLECTIONS: C,
} = require('../src/lib/event-types.ts');

const rootRoute = require(
  '../src/app/api/control/events/route.ts'
);

const eventRoute = require(
  '../src/app/api/control/events/[eventId]/route.ts'
);

const ticketRoute = require(
  '../src/app/api/control/events/[eventId]/tickets/route.ts'
);

const publishRoute = require(
  '../src/app/api/control/events/[eventId]/publish/route.ts'
);

const {
  adminApp,
  adminAuth,
  adminDb,
} = getFirebaseAdmin();

assert.equal(
  adminApp.options.projectId,
  'demo-tabstartup',
  'STOP: Unexpected Firebase project.'
);

const prefix =
  'event-integration-' + randomUUID();

const slug = prefix;

const createdUsers = [];
const createdEvents = new Set();

let passed = 0;

function pass(name) {
  passed++;

  console.log(
    'PASS ' + passed + ': ' + name
  );
}

async function createAccount(role) {
  const uid = prefix + '-' + role;

  const email =
    uid + '@example.test';

  const password =
    'LocalTest-' + randomUUID();

  await adminAuth.createUser({
    uid,
    email,
    password,
    emailVerified: true,
  });

  createdUsers.push(uid);

  await adminDb
    .collection('users')
    .doc(uid)
    .set({
      uid,
      email,
      role,
      roles: [role],
      status: 'active',
    });

  const response = await fetch(
    'http://127.0.0.1:9099/' +
    'identitytoolkit.googleapis.com/v1/' +
    'accounts:signInWithPassword?key=demo-key',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const result = await response.json();

  assert.equal(response.status, 200);
  assert.ok(result.idToken);

  return {
    uid,
    token: result.idToken,
  };
}

async function request(
  handler,
  method,
  token,
  options = {}
) {
  const headers = {};

  if (token) {
    headers.Authorization =
      'Bearer ' + token;
  }

  if (options.revision !== undefined) {
    headers['X-Event-Revision'] =
      String(options.revision);
  }

  if (options.body !== undefined) {
    headers['Content-Type'] =
      'application/json';
  }

  const req = new Request(
    'http://localhost/api/control/events' +
    (options.eventId
      ? '/' + options.eventId
      : ''),
    {
      method,
      headers,
      ...(options.body !== undefined
        ? {
            body: JSON.stringify(options.body),
          }
        : {}),
    }
  );

  const response = await handler(
    req,
    {
      params: Promise.resolve({
        eventId: options.eventId,
      }),
    }
  );

  return {
    status: response.status,
    body: await response.json(),
  };
}

function success(result, status = 200) {
  assert.equal(
    result.status,
    status,
    JSON.stringify(result.body)
  );

  assert.equal(
    result.body.success,
    true
  );

  return result.body.data;
}

function failure(result, status) {
  assert.equal(
    result.status,
    status,
    JSON.stringify(result.body)
  );

  assert.equal(
    result.body.success,
    false
  );
}

async function main() {
  const admin =
    await createAccount('admin');

  const founder =
    await createAccount('founder');

  pass('Isolated emulator accounts created');

  const now = Date.now();

  const draft = {
    title: 'Integration Test Startup Summit',
    slug,
    category: 'conference',
    shortDescription:
      'Local emulator integration event.',
    description:
      'Temporary event for integration testing.',
    bannerUrl: null,
    mode: 'online',
    visibility: 'public',
    registrationType: 'mixed',
    timezone: 'Asia/Dhaka',

    startsAtMs:
      now + 7 * 86400000,

    endsAtMs:
      now + 7 * 86400000 + 7200000,

    registrationOpensAtMs: now,

    registrationClosesAtMs:
      now + 6 * 86400000,

    capacity: {
      online: 100,
      offline: 0,
    },

    maxTicketsPerOrder: 5,
    allowGuestRegistration: true,
    venue: null,

    privateDetails: {
      meetingProvider: 'zoom',
      meetingUrl:
        'https://example.test/private-meeting',
      meetingId: 'private-meeting-id',
      meetingPasscode: 'private-passcode',
      privateParticipantInstructions:
        'Private instructions for confirmed participants.',
    },

    terms: 'Test event terms.',
    refundPolicy: 'Test refund policy.',
  };

  // Unauthenticated and non-admin requests.

  failure(
    await request(
      rootRoute.POST,
      'POST',
      null,
      { body: draft }
    ),
    401
  );

  pass('Unauthenticated creation rejected');

  failure(
    await request(
      rootRoute.POST,
      'POST',
      founder.token,
      { body: draft }
    ),
    403
  );

  pass('Non-admin creation rejected');

  // Create official event.

  const created = success(
    await request(
      rootRoute.POST,
      'POST',
      admin.token,
      { body: draft }
    ),
    201
  );

  const eventId = created.event.eventId;

  createdEvents.add(eventId);

  assert.equal(
    created.event.status,
    'draft'
  );

  assert.equal(
    created.event.registrationStatus,
    'not_open'
  );

  assert.equal(
    created.event.organizerId,
    'tabstartup'
  );

  assert.equal(
    created.privateDetails.meetingPasscode,
    'private-passcode'
  );

  pass('Official draft and private details created');

  const draftProjection =
    await adminDb
      .collection(C.publicEvents)
      .doc(eventId)
      .get();

  assert.equal(
    draftProjection.exists,
    false
  );

  pass('Draft is not publicly projected');

  failure(
    await request(
      rootRoute.POST,
      'POST',
      admin.token,
      { body: draft }
    ),
    409
  );

  pass('Duplicate slug rejected');

  // Read and list.

  const loaded = success(
    await request(
      eventRoute.GET,
      'GET',
      admin.token,
      { eventId }
    )
  );

  assert.equal(
    loaded.event.eventId,
    eventId
  );

  assert.equal(
    loaded.privateDetails.meetingUrl,
    draft.privateDetails.meetingUrl
  );

  pass('Admin can read canonical event');

  const listed = success(
    await request(
      rootRoute.GET,
      'GET',
      admin.token
    )
  );

  assert.ok(
    listed.some(
      item => item.eventId === eventId
    )
  );

  assert.ok(
    listed.every(
      item => !('privateDetails' in item)
    )
  );

  pass('Admin listing excludes private details');

  failure(
    await request(
      eventRoute.GET,
      'GET',
      founder.token,
      { eventId }
    ),
    403
  );

  pass('Non-admin private event read rejected');

  // Edit and revision guards.

  const initialRevision =
    loaded.event.updatedAt;

  const editedDraft = {
    ...draft,
    title: 'Updated Integration Summit',
  };

  failure(
    await request(
      eventRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        body: editedDraft,
      }
    ),
    400
  );

  pass('Missing revision rejected');

  const edited = success(
    await request(
      eventRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: initialRevision,
        body: editedDraft,
      }
    )
  );

  assert.equal(
    edited.event.title,
    editedDraft.title
  );

  assert.ok(
    edited.event.updatedAt >
    initialRevision
  );

  pass('Draft edited with advanced revision');

  failure(
    await request(
      eventRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: initialRevision,
        body: draft,
      }
    ),
    409
  );

  pass('Stale event update rejected');

  const revision =
    edited.event.updatedAt;

  // Configure free and paid tickets.

  const freeTicket = {
    name: 'Free Admission',
    description: 'Free event access.',
    benefits: ['Event access'],
    attendanceMode: 'online',
    pricingType: 'free',

    price: {
      usdAmountMinor: 0,
      bdtAmountMinor: 0,
    },

    capacity: 20,
    maxPerOrder: 2,
    status: 'active',
    sortOrder: 0,
    salesStartAtMs: null,
    salesEndAtMs: null,
  };

  const paidTicket = {
    ...freeTicket,
    name: 'Premium Admission',
    pricingType: 'paid',

    price: {
      usdAmountMinor: 1500,
      bdtAmountMinor: 180000,
    },

    capacity: 80,
    maxPerOrder: 5,
    sortOrder: 1,

    salesEndAtMs:
      now + 6 * 86400000,
  };

  const tickets = [
    freeTicket,
    paidTicket,
  ];

  failure(
    await request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision,
        body: [
          freeTicket,
          {
            ...paidTicket,
            capacity: 100,
          },
        ],
      }
    ),
    400
  );

  pass('Excess ticket capacity rejected');

  failure(
    await request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision,
        body: [
          {
            ...paidTicket,
            price: {
              usdAmountMinor: 1500,
              bdtAmountMinor: 0,
            },
          },
        ],
      }
    ),
    400
  );

  pass('Invalid dual-currency price rejected');

  failure(
    await request(
      publishRoute.POST,
      'POST',
      admin.token,
      {
        eventId,
        revision,
      }
    ),
    409
  );

  pass('Event without tickets cannot publish');

  const saved = success(
    await request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision,
        body: tickets,
      }
    )
  );

  assert.equal(saved.length, 2);

  assert.equal(
    saved[1].ticketType.price.usdAmountMinor,
    1500
  );

  assert.equal(
    saved[1].ticketType.price.bdtAmountMinor,
    180000
  );

  assert.equal(
    saved[1].inventory.capacity,
    80
  );

  assert.ok(
    saved.every(
      item =>
        item.inventory.reservedQuantity === 0 &&
        item.inventory.issuedQuantity === 0
    )
  );

  pass('Free and paid ticket inventory saved');

  failure(
    await request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision,
        body: tickets,
      }
    ),
    409
  );

  pass('Stale ticket replacement rejected');

  const afterTickets = success(
    await request(
      eventRoute.GET,
      'GET',
      admin.token,
      { eventId }
    )
  );

  const ticketRevision =
    afterTickets.event.updatedAt;

  assert.ok(
    ticketRevision > revision
  );

  // Reject event date changes that would
  // invalidate existing ticket sales windows.

  const invalidSchedule = {
    ...editedDraft,

    startsAtMs:
      now + 4 * 86400000,

    endsAtMs:
      now + 5 * 86400000,

    registrationClosesAtMs:
      now + 3 * 86400000,
  };

  failure(
    await request(
      eventRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: ticketRevision,
        body: invalidSchedule,
      }
    ),
    400
  );

  pass('Incompatible event schedule rejected');

  // Two simultaneous mutations using
  // the same reviewed revision.

  const concurrent = await Promise.all([
    request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: ticketRevision,
        body: tickets,
      }
    ),

    request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: ticketRevision,
        body: tickets,
      }
    ),
  ]);

  assert.deepEqual(
    concurrent
      .map(item => item.status)
      .sort((a, b) => a - b),
    [200, 409]
  );

  pass('Concurrent mutation allows only one winner');

  const latest = success(
    await request(
      eventRoute.GET,
      'GET',
      admin.token,
      { eventId }
    )
  );

  const latestRevision =
    latest.event.updatedAt;

  failure(
    await request(
      publishRoute.POST,
      'POST',
      admin.token,
      {
        eventId,
        revision: ticketRevision,
      }
    ),
    409
  );

  pass('Stale publication rejected');

  failure(
    await request(
      publishRoute.POST,
      'POST',
      founder.token,
      {
        eventId,
        revision: latestRevision,
      }
    ),
    403
  );

  pass('Non-admin publication rejected');

  // Publish the reviewed event.

  const published = success(
    await request(
      publishRoute.POST,
      'POST',
      admin.token,
      {
        eventId,
        revision: latestRevision,
      }
    )
  );

  assert.equal(
    published.status,
    'published'
  );

  assert.equal(
    published.registrationStatus,
    'not_open'
  );

  pass('Event published with registration disabled');

  const publicSnapshot =
    await adminDb
      .collection(C.publicEvents)
      .doc(eventId)
      .get();

  assert.ok(publicSnapshot.exists);

  const publicEvent =
    publicSnapshot.data();

  assert.equal(
    publicEvent.eventId,
    eventId
  );

  assert.equal(
    publicEvent.status,
    'published'
  );

  assert.equal(
    publicEvent.registrationStatus,
    'not_open'
  );

  pass('Public event projection created');

  const publicJson =
    JSON.stringify(publicEvent);

  for (const secret of [
    'private-meeting-id',
    'private-passcode',
    'https://example.test/private-meeting',
    'Private instructions for confirmed participants.',
  ]) {
    assert.ok(
      !publicJson.includes(secret)
    );
  }

  pass('Private meeting data excluded from projection');

  const publicTickets =
    await adminDb
      .collection(C.publicTicketTypes)
      .where('eventId', '==', eventId)
      .get();

  assert.equal(
    publicTickets.size,
    2
  );

  for (const doc of publicTickets.docs) {
    assert.equal(
      doc.data().availability,
      'not_open'
    );
  }

  pass('Public tickets created but unavailable for purchase');

  failure(
    await request(
      eventRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: published.updatedAt,
        body: editedDraft,
      }
    ),
    409
  );

  pass('Published event editing rejected');

  failure(
    await request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: published.updatedAt,
        body: tickets,
      }
    ),
    409
  );

  pass('Published ticket replacement rejected');

  failure(
    await request(
      publishRoute.POST,
      'POST',
      admin.token,
      {
        eventId,
        revision: published.updatedAt,
      }
    ),
    409
  );

  pass('Duplicate publication rejected');

  // Account suspension protection.

  await adminDb
    .collection('users')
    .doc(admin.uid)
    .update({
      status: 'suspended',
    });

  failure(
    await request(
      eventRoute.GET,
      'GET',
      admin.token,
      { eventId }
    ),
    403
  );

  pass('Suspended admin access rejected');

  console.log(
    '\n===== INTEGRATION RESULT ====='
  );

  console.log(
    'ALL ' + passed + ' CHECKS PASSED'
  );
}

async function cleanup() {
  // Recover event IDs from the unique
  // test slug even if an assertion failed.

  const matching =
    await adminDb
      .collection(C.events)
      .where('slug', '==', slug)
      .get();

  for (const doc of matching.docs) {
    createdEvents.add(doc.id);
  }

  for (const eventId of createdEvents) {
    for (const collection of [
      C.ticketTypes,
      C.inventory,
      C.publicTicketTypes,
      C.auditLogs,
    ]) {
      const snapshot =
        await adminDb
          .collection(collection)
          .where('eventId', '==', eventId)
          .get();

      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
    }

    for (const collection of [
      C.events,
      C.privateDetails,
      C.publicEvents,
    ]) {
      await adminDb
        .collection(collection)
        .doc(eventId)
        .delete();
    }
  }

  await adminDb
    .collection(C.slugs)
    .doc(slug)
    .delete();

  for (const uid of createdUsers) {
    await adminDb
      .collection('users')
      .doc(uid)
      .delete();

    await adminAuth.deleteUser(uid);
  }

  console.log(
    'PASS: Targeted emulator test cleanup completed.'
  );
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error(
      'INTEGRATION FAILED:',
      error
    );

    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error(
        'CLEANUP FAILED:',
        error
      );

      process.exitCode = 1;
    } finally {
      await deleteApp(adminApp);
    }
  }
})();
