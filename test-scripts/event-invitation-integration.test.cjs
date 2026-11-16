const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.equal(process.env.GCLOUD_PROJECT, 'demo-tabstartup');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
assert.notEqual(process.env.VERCEL, '1');

require('./identity-runtime-loader.cjs');

const {
  listPublicEvents,
  getPublicEventBySlug,
} = require('../src/services/public-event.service.ts');

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


const { NextRequest } = require("next/server");
const { createHash } = require("node:crypto");
const { PAYMENT_COLLECTIONS: P } = require("../src/lib/payment-types.ts");
const registrationControl = require("../src/app/api/control/events/[eventId]/registration/route.ts");
const registrationRoute = require("../src/app/api/events/registrations/route.ts");
const guestRoute = require("../src/app/api/events/guest-session/route.ts");
const orderRoute = require("../src/app/api/events/orders/[orderId]/route.ts");

let settingsRef = null;
let originalSettings = null;
let settingsTouched = false;

async function main() {
  const admin = await createAccount('admin');
  const founder = await createAccount('founder');

  const now = Date.now();

  const draft = {
    title: 'Invitation Integration Test Summit',
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
    registrationAccess: 'public_and_invitation',
    invitationSettings: {
      enabled: true,
      allowComplimentary: true,
      maxAcceptedInvitations: 5,
    },
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

    capacity: 2,
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

    capacity: 5,
    maxPerOrder: 2,
    sortOrder: 1,

    salesEndAtMs:
      now + 6 * 86400000,
  };



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

  success(
    await request(
      ticketRoute.PUT,
      'PUT',
      admin.token,
      {
        eventId,
        revision: created.event.updatedAt,
        body: [
          freeTicket,
          paidTicket,
          {
            ...freeTicket,
            name: 'Invited Guest Admission',
            access: 'invite_only',
            capacity: 5,
            maxPerOrder: 1,
            sortOrder: 2,
          },
        ],
      }
    )
  );

  const latest = success(
    await request(
      eventRoute.GET,
      'GET',
      admin.token,
      { eventId }
    )
  );

  let event = success(
    await request(
      publishRoute.POST,
      'POST',
      admin.token,
      {
        eventId,
        revision: latest.event.updatedAt,
      }
    )
  );

  assert.equal(
    event.registrationStatus,
    'not_open'
  );

  pass('Isolated event published');

  const control = (
    status,
    token = admin.token,
    revision = event.updatedAt
  ) => request(
    registrationControl.POST,
    'POST',
    token,
    {
      eventId,
      revision,
      body: {
        registrationStatus: status,
      },
    }
  );

  async function publicStatus(expected) {
    const snapshot = await adminDb
      .collection(C.publicEvents)
      .doc(eventId)
      .get();

    assert.equal(
      snapshot.data().registrationStatus,
      expected
    );
  }

  failure(
    await control('open', founder.token),
    403
  );

  pass('Non-admin registration control rejected');

  process.env.EVENT_REGISTRATION_ENABLED = 'false';

  failure(
    await control('open'),
    409
  );

  process.env.EVENT_REGISTRATION_ENABLED = 'true';

  pass('Disabled registration cannot be opened');

  const oldRevision = event.updatedAt;

  event = success(
    await control('open')
  );

  assert.equal(event.registrationStatus, 'open');

  await publicStatus('open');

  pass('Registration opened with public projection');

  failure(
    await control(
      'paused',
      admin.token,
      oldRevision
    ),
    409
  );

  pass('Stale registration revision rejected');

  const details = await getPublicEventBySlug(slug);

  assert.ok(details);

  const ticketSnapshot = await adminDb
    .collection(C.ticketTypes)
    .where('eventId', '==', eventId)
    .get();

  const freeId = ticketSnapshot.docs.find(
    doc => doc.data().pricingType === 'free'
  ).id;

  const paidId = ticketSnapshot.docs.find(
    doc => doc.data().pricingType === 'paid'
  ).id;

  const origin = 'http://localhost:3000';

  async function publicRequest(
    handler,
    method,
    path,
    {
      token,
      cookie,
      body,
      orderId,
      requestOrigin = origin,
    } = {}
  ) {
    const headers = {
      Origin: requestOrigin,
      'Sec-Fetch-Site': 'same-origin',
    };

    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    if (cookie) {
      headers.Cookie = cookie;
    }

    if (body !== undefined) {
      headers['Content-Type'] =
        'application/json';
    }

    const response = await handler(
      new NextRequest(origin + path, {
        method,
        headers,
        ...(body !== undefined
          ? { body: JSON.stringify(body) }
          : {}),
      }),
      {
        params: Promise.resolve({ orderId }),
      }
    );

    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie'),
    };
  }

  async function guestSession() {
    const result = await publicRequest(
      guestRoute.POST,
      'POST',
      '/api/events/guest-session'
    );

    success(result);

    assert.ok(result.cookie);

    return result.cookie.split(';')[0];
  }

  const guest = await guestSession();
  const otherGuest = await guestSession();

  assert.notEqual(guest, otherGuest);

  pass('Independent signed guest sessions created');

  const hash = value =>
    createHash('sha256')
      .update(value, 'utf8')
      .digest('hex');

  const founderEmail =
    founder.uid + '@example.test';

  const guestEmail =
    prefix + '-guest@example.test';

  function payload(
    ticketTypeId,
    currency,
    amount,
    email = guestEmail,
    quantity = 1
  ) {
    return {
      eventSlug: slug,
      ticketTypeId,
      quantity,
      currency,
      purchaserEmail: email,
      participants: Array.from(
        { length: quantity },
        (_, index) => ({
          fullName: 'Test Participant ' + index,
          email,
          phone: null,
          organization: null,
          designation: null,
        })
      ),
      acceptedTerms: true,
      termsHash: hash(draft.terms),
      refundPolicyHash: hash(draft.refundPolicy),
      expectedUnitAmountMinor: amount,
      idempotencyKey: randomUUID(),
    };
  }

  const register = (
    body,
    access = { cookie: guest }
  ) => publicRequest(
    registrationRoute.POST,
    'POST',
    '/api/events/registrations',
    { ...access, body }
  );

  const readOrder = (
    orderId,
    access = { cookie: guest }
  ) => publicRequest(
    orderRoute.GET,
    'GET',
    '/api/events/orders/' + orderId,
    { ...access, orderId }
  );

  async function inventory(ticketId) {
    const snapshot = await adminDb
      .collection(C.inventory)
      .doc(ticketId)
      .get();

    return snapshot.data();
  }


  const {
    createAdminEventInvitation,
    revokeAdminEventInvitation,
    renewAdminEventInvitation,
  } = require('../src/services/event-invitation.service.ts');

  const {
    getAuthorizedInvitationDetails,
  } = require('../src/services/event-invitation-access.service.ts');

  const {
    acceptEventInvitation,
  } = require('../src/services/event-registration.service.ts');

  const {
    buildEventInvitationEmailId,
  } = require('../src/services/email/event-invitation-email-outbox.service.ts');

  const {
    checkEventInvitationEmailEligibility,
  } = require('../src/services/email/event-invitation-email-eligibility.service.ts');

  const {
    Timestamp,
  } = require('firebase-admin/firestore');

  const privateTicket = ticketSnapshot.docs.find(
    doc => doc.data().access === 'invite_only'
  );

  assert.ok(privateTicket);

  const privateId = privateTicket.id;

  const publicProjection = await adminDb
    .collection(C.publicTicketTypes)
    .doc(privateId)
    .get();

  assert.equal(publicProjection.exists, false);

  pass('Private invitation ticket excluded from public projection');

  const invitationInput = {
    ticketTypeId: privateId,
    category: 'special_guest',
    guestName: 'Invited Founder',
    guestEmail: founderEmail,
    expiresAtMs: now + 86400000,
  };

  await assert.rejects(
    () => createAdminEventInvitation(
      founder.token,
      eventId,
      invitationInput
    )
  );

  pass('Non-admin invitation creation blocked');

  const createdInvitation =
    await createAdminEventInvitation(
      admin.token,
      eventId,
      invitationInput
    );

  const invitationId =
    createdInvitation.invitation.invitationId;

  assert.equal(
    createdInvitation.invitation.status,
    'pending'
  );

  const firstToken = new URL(
    createdInvitation.invitationUrl
  ).hash.replace(/^#token=/, '');

  assert.match(firstToken, /^[a-f0-9]{64}$/);

  pass('Admin invitation created with secure token');

  await assert.rejects(
    () => createAdminEventInvitation(
      admin.token,
      eventId,
      invitationInput
    )
  );

  pass('Duplicate invitation creation blocked');

  async function readEmailJob(version) {
    const emailId = buildEventInvitationEmailId(
      eventId,
      invitationId,
      version
    );

    const snapshot = await adminDb
      .collection(C.emailOutbox)
      .doc(emailId)
      .get();

    assert.ok(snapshot.exists);

    return snapshot.data();
  }

  const firstJob = await readEmailJob(1);

  assert.equal(firstJob.status, 'pending');
  assert.equal(firstJob.type, 'event_invitation');
  assert.equal(firstJob.recipientEmail, founderEmail);
  assert.equal(firstJob.tokenVersion, 1);

  assert.equal(
    JSON.stringify(firstJob).includes(firstToken),
    false
  );

  pass('Invitation email queued without raw token');

  const registrationInput = payload(
    privateId,
    null,
    0,
    founderEmail
  );

  const publicAttempt = await register(
    registrationInput,
    { token: founder.token }
  );

  assert.ok(publicAttempt.status >= 400);

  pass('Public registration cannot access private ticket');

  await assert.rejects(
    () => getAuthorizedInvitationDetails(
      admin.token,
      invitationId,
      firstToken
    )
  );

  pass('Wrong account cannot access invitation');

  const invitationDetails =
    await getAuthorizedInvitationDetails(
      founder.token,
      invitationId,
      firstToken
    );

  assert.equal(invitationDetails.canAccept, true);

  pass('Verified invited account can access invitation');

  await revokeAdminEventInvitation(
    admin.token,
    eventId,
    invitationId,
    'Integration test revocation'
  );

  await assert.rejects(
    () => acceptEventInvitation(
      registrationInput,
      founder.token,
      invitationId,
      firstToken
    )
  );

  pass('Revoked invitation cannot be accepted');

  const revokedEligibility =
    await adminDb.runTransaction(
      tx => checkEventInvitationEmailEligibility(
        tx,
        adminDb,
        firstJob,
        Timestamp.now()
      )
    );

  assert.equal(revokedEligibility.eligible, false);

  assert.equal(
    revokedEligibility.reason,
    'INVITATION_EMAIL_NOT_PENDING'
  );

  pass('Revoked invitation email is ineligible');

  const renewed =
    await renewAdminEventInvitation(
      admin.token,
      eventId,
      invitationId,
      now + 2 * 86400000
    );

  const secondToken = new URL(
    renewed.invitationUrl
  ).hash.replace(/^#token=/, '');

  assert.match(secondToken, /^[a-f0-9]{64}$/);
  assert.notEqual(secondToken, firstToken);

  await assert.rejects(
    () => acceptEventInvitation(
      registrationInput,
      founder.token,
      invitationId,
      firstToken
    )
  );

  pass('Renewal invalidates previous invitation token');

  const secondJob = await readEmailJob(2);

  assert.equal(secondJob.tokenVersion, 2);
  assert.equal(secondJob.status, 'pending');

  pass('Renewal queues versioned invitation email');

  const activeEligibility =
    await adminDb.runTransaction(
      tx => checkEventInvitationEmailEligibility(
        tx,
        adminDb,
        secondJob,
        Timestamp.now()
      )
    );

  assert.equal(activeEligibility.eligible, true);

  pass('Active renewed invitation email is eligible');

  const before = await inventory(privateId);

  const accepted = await acceptEventInvitation(
    registrationInput,
    founder.token,
    invitationId,
    secondToken
  );

  assert.equal(accepted.status, 'confirmed');

  const after = await inventory(privateId);

  assert.equal(after.issuedQuantity, before.issuedQuantity + 1);
  assert.equal(after.reservedQuantity, before.reservedQuantity);

  pass('Invitation acceptance issues complimentary registration');

  const replay = await acceptEventInvitation(
    registrationInput,
    founder.token,
    invitationId,
    secondToken
  );

  assert.equal(replay.orderId, accepted.orderId);

  const tickets = await adminDb
    .collection(C.tickets)
    .where('orderId', '==', accepted.orderId)
    .get();

  assert.equal(tickets.size, 1);
  assert.equal(tickets.docs[0].data().status, 'issued');

  pass('Invitation replay preserves exactly one ticket');

  const finalInvitation = await adminDb
    .collection(C.invitations)
    .doc(invitationId)
    .get();

  assert.equal(
    finalInvitation.data().status,
    'accepted'
  );

  const finalEvent = await adminDb
    .collection(C.events)
    .doc(eventId)
    .get();

  assert.equal(
    finalEvent.data().invitationSettings
      .acceptedInvitationCount,
    1
  );

  pass('Invitation acceptance counter increments exactly once');

  const confirmationJobs = await adminDb
    .collection(C.emailOutbox)
    .where('orderId', '==', accepted.orderId)
    .get();

  assert.equal(
    confirmationJobs.docs.filter(
      doc => doc.data().type === 'registration_confirmed'
    ).length,
    1
  );

  pass('Invitation confirmation email queued exactly once');

  console.log('INVITATION LIFECYCLE CHECKS COMPLETE');
}

async function cleanup() {
  if (settingsTouched && settingsRef) {
    if (originalSettings) {
      await settingsRef.set(originalSettings);
    } else {
      await settingsRef.delete();
    }
  }

  const matching = await adminDb
    .collection(C.events)
    .where('slug', '==', slug)
    .get();

  for (const doc of matching.docs) {
    createdEvents.add(doc.id);
  }

  for (const eventId of createdEvents) {
    for (const collection of [
      P.payments,
      P.orders,
    ]) {
      const snapshot = await adminDb
        .collection(collection)
        .where('resourceId', '==', eventId)
        .get();

      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
    }

    for (const collection of [
      C.registrationRequests,
      C.registrations,
      C.reservations,
      C.orders,
      C.tickets,
      C.emailOutbox,
      C.invitations,
      C.ticketTypes,
      C.inventory,
      C.publicTicketTypes,
      C.auditLogs,
    ]) {
      assert.equal(typeof collection, 'string');

      const snapshot = await adminDb
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
    'PASS: Targeted invitation cleanup completed'
  );
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('INVITATION FAILED:', error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error('A7 CLEANUP FAILED:', error);
      process.exitCode = 1;
    } finally {
      await deleteApp(adminApp);
    }
  }
})();
