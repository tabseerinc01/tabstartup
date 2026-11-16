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

  process.env.BKASH_MANUAL_PAYMENTS_ENABLED = 'true';
  process.env.TABEDGE_PAYMENTS_ENABLED = 'true';

  const { Timestamp } = require('firebase-admin/firestore');
  const { PAYMENT_SCHEMA_VERSION } = require('../src/lib/payment-types.ts');

  settingsRef = adminDb
    .collection(P.providerSettings)
    .doc('bkash_manual');

  const previousSettings = await settingsRef.get();

  originalSettings = previousSettings.exists
    ? previousSettings.data()
    : null;

  const settingsNow = Timestamp.now();

  settingsTouched = true;

  await settingsRef.set({
    schemaVersion: PAYMENT_SCHEMA_VERSION,
    provider: 'bkash_manual',
    currency: 'BDT',
    enabled: true,
    receivingNumber: '01800000001',
    accountType: 'personal',
    configVersion: 1,
    createdAt: settingsNow,
    updatedAt: settingsNow,
    updatedByUid: admin.uid,
  });

  console.log('PASS: Emulator bKash configuration ready');
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
        body: [freeTicket, paidTicket],
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

  process.env.EVENT_REGISTRATION_ENABLED = 'false';

  failure(
    await register(
      payload(freeId, null, 0)
    ),
    503
  );

  process.env.EVENT_REGISTRATION_ENABLED = 'true';

  pass('Registration API feature flag enforced');

  failure(
    await register(
      payload(freeId, null, 0),
      {}
    ),
    401
  );

  pass('Missing registration identity rejected');

  const freePayload = payload(
    freeId,
    null,
    0
  );

  const free = success(
    await register(freePayload),
    201
  );

  assert.equal(free.status, 'confirmed');
  assert.equal(free.paymentRequired, false);
  assert.equal(free.totalAmountMinor, 0);

  const freeInventory = await inventory(freeId);

  assert.equal(freeInventory.issuedQuantity, 1);
  assert.equal(freeInventory.reservedQuantity, 0);

  pass('Free registration confirmed atomically');

  const replay = success(
    await register(freePayload)
  );

  assert.equal(replay.orderId, free.orderId);
  assert.equal(replay.replayed, true);

  assert.equal(
    (await inventory(freeId)).issuedQuantity,
    1
  );

  pass('Duplicate request does not allocate twice');

  failure(
    await register({
      ...freePayload,
      participants: [{
        ...freePayload.participants[0],
        fullName: 'Changed Participant',
      }],
    }),
    409
  );

  pass('Changed payload with same key rejected');

  const freeOrder = success(
    await readOrder(free.orderId)
  );

  assert.equal(freeOrder.orderId, free.orderId);
  assert.equal(freeOrder.status, 'fulfilled');

  assert.ok(
    !JSON.stringify(freeOrder).includes(guestEmail)
  );

  pass('Guest order status excludes purchaser PII');

  failure(
    await readOrder(
      free.orderId,
      { cookie: otherGuest }
    ),
    404
  );

  failure(
    await readOrder(
      free.orderId,
      { token: founder.token }
    ),
    404
  );

  pass('Other guest and account cannot read guest order');

  // L9: Verify free ticket and authorized PDF access.
  assert.ok(Array.isArray(freeOrder.tickets));
  assert.equal(freeOrder.tickets.length, 1);

  const issuedFreeTicket = freeOrder.tickets[0];

  assert.equal(issuedFreeTicket.status, 'issued');

  assert.match(
    issuedFreeTicket.ticketId,
    /^ticket_[a-f0-9]{64}$/
  );

  assert.match(
    issuedFreeTicket.ticketNumber,
    /^TS-[A-F0-9]{64}$/
  );

  pass('Free registration replay preserves one issued ticket');

  const pdfRoute = require(
    '../src/app/api/events/orders/[orderId]/tickets/[ticketId]/pdf/route.ts'
  );

  assert.equal(typeof pdfRoute.GET, 'function');

  // L9: Verify actual PDF download authorization.
  async function downloadTestPdf(access, ticketId) {
    const headers = {};

    if (access.cookie) {
      headers.Cookie = access.cookie;
    }

    if (access.token) {
      headers.Authorization = 'Bearer ' + access.token;
    }

    const req = new NextRequest(
      'http://localhost/api/events/orders/' +
      free.orderId + '/tickets/' + ticketId + '/pdf',
      {
        method: 'GET',
        headers,
      }
    );

    return pdfRoute.GET(req, {
      params: Promise.resolve({
        orderId: free.orderId,
        ticketId,
      }),
    });
  }

  const ownPdf = await downloadTestPdf(
    { cookie: guest },
    issuedFreeTicket.ticketId
  );

  assert.equal(ownPdf.status, 200);

  assert.equal(
    ownPdf.headers.get('content-type'),
    'application/pdf'
  );

  assert.match(
    ownPdf.headers.get('cache-control'),
    /no-store/
  );

  const pdfBytes = Buffer.from(
    await ownPdf.arrayBuffer()
  );

  assert.equal(
    pdfBytes.subarray(0, 5).toString(),
    '%PDF-'
  );

  pass('Authorized guest can download actual ticket PDF');

  const otherGuestPdf = await downloadTestPdf(
    { cookie: otherGuest },
    issuedFreeTicket.ticketId
  );

  assert.equal(otherGuestPdf.status, 404);

  const otherAccountPdf = await downloadTestPdf(
    { token: founder.token },
    issuedFreeTicket.ticketId
  );

  assert.equal(otherAccountPdf.status, 404);

  pass('Unauthorized guest and account cannot download ticket PDF');

  const missingTicketPdf = await downloadTestPdf(
    { cookie: guest },
    'ticket_' + '0'.repeat(64)
  );

  assert.equal(missingTicketPdf.status, 404);

  pass('Unknown ticket PDF request rejected');

  const freeTicketRecords = await adminDb
    .collection(C.tickets)
    .where('orderId', '==', free.orderId)
    .get();

  assert.equal(freeTicketRecords.size, 1);

  assert.equal(
    freeTicketRecords.docs[0].id,
    issuedFreeTicket.ticketId
  );

  pass('Free registration has exactly one canonical ticket');

  const freeEmailRecords = await adminDb
    .collection(C.emailOutbox)
    .where('orderId', '==', free.orderId)
    .get();

  const freeConfirmationJobs = freeEmailRecords.docs
    .map(doc => doc.data())
    .filter(job => job.type === 'registration_confirmed');

  assert.equal(freeConfirmationJobs.length, 1);

  assert.equal(
    freeConfirmationJobs[0].status,
    'pending'
  );

  assert.equal(
    freeConfirmationJobs[0].attemptCount,
    0
  );

  pass('Free confirmation email queued exactly once');


  failure(
    await register({
      ...payload(paidId, 'USD', 1500),
      termsHash: '0'.repeat(64),
    }),
    409
  );

  failure(
    await register({
      ...payload(paidId, 'USD', 1500),
      refundPolicyHash: '0'.repeat(64),
    }),
    409
  );

  pass('Modified terms and refund policy rejected');

  failure(
    await register(
      payload(paidId, 'USD', 1)
    ),
    409
  );

  pass('Modified ticket price rejected');

  failure(
    await register(
      payload(paidId, null, 1500)
    ),
    400
  );

  pass('Missing paid currency rejected');

  // L9: Verify the BDT-only launch configuration.
  const beforeDisabledUsd = await inventory(paidId);

  const originalTabEdgeFlag =
    process.env.TABEDGE_PAYMENTS_ENABLED;

  try {
    process.env.TABEDGE_PAYMENTS_ENABLED = 'false';

    const disabledUsd = await register(
      payload(paidId, 'USD', 1500, founderEmail),
      { token: founder.token }
    );

    assert.equal(
      disabledUsd.status,
      503,
      'Disabled USD provider must return HTTP 503'
    );

    const afterDisabledUsd = await inventory(paidId);

    assert.equal(
      afterDisabledUsd.reservedQuantity,
      beforeDisabledUsd.reservedQuantity
    );

    assert.equal(
      afterDisabledUsd.issuedQuantity,
      beforeDisabledUsd.issuedQuantity
    );

    pass('Disabled USD registration cannot reserve inventory');
  } finally {
    if (originalTabEdgeFlag === undefined) {
      delete process.env.TABEDGE_PAYMENTS_ENABLED;
    } else {
      process.env.TABEDGE_PAYMENTS_ENABLED =
        originalTabEdgeFlag;
    }
  }

  const usd = success(
    await register(
      payload(
        paidId,
        'USD',
        1500,
        founderEmail
      ),
      { token: founder.token }
    ),
    201
  );

  assert.equal(usd.status, 'awaiting_payment');
  assert.equal(usd.currency, 'USD');
  assert.equal(usd.provider, 'tabedge');
  assert.equal(usd.totalAmountMinor, 1500);

  pass('USD registration creates TabEdge order');

  const bdt = success(
    await register(
      payload(paidId, 'BDT', 180000)
    ),
    201
  );

  assert.equal(bdt.status, 'awaiting_payment');
  assert.equal(bdt.currency, 'BDT');
  assert.equal(bdt.provider, 'bkash_manual');
  assert.equal(bdt.totalAmountMinor, 180000);

  pass('BDT registration creates manual bKash order');

  const accountOrder = success(
    await readOrder(
      usd.orderId,
      { token: founder.token }
    )
  );

  assert.equal(accountOrder.orderId, usd.orderId);

  failure(
    await readOrder(
      usd.orderId,
      { token: admin.token }
    ),
    404
  );

  failure(
    await readOrder(usd.orderId),
    404
  );

  pass('Account order ownership enforced');

  for (const result of [usd, bdt]) {
    const orderSnapshot = await adminDb
      .collection(C.orders)
      .doc(result.orderId)
      .get();

    const order = orderSnapshot.data();

    assert.ok(order.paymentOrderId);

    const paymentOrder = (
      await adminDb
        .collection(P.orders)
        .doc(order.paymentOrderId)
        .get()
    ).data();

    assert.equal(
      paymentOrder.productOrderId,
      result.orderId
    );

    assert.equal(
      paymentOrder.amountMinor,
      result.totalAmountMinor
    );

    assert.equal(
      paymentOrder.currency,
      result.currency
    );

    assert.equal(
      paymentOrder.provider,
      result.provider
    );

    assert.equal(
      paymentOrder.status,
      'awaiting_payment'
    );

    const payment = (
      await adminDb
        .collection(P.payments)
        .doc(paymentOrder.activePaymentId)
        .get()
    ).data();

    assert.equal(
      payment.amountMinor,
      result.totalAmountMinor
    );

    assert.equal(
      payment.status,
      'pending_payment'
    );
  }

  pass('Canonical payment records match order snapshots');

  const reservedBefore = await inventory(paidId);

  assert.equal(reservedBefore.reservedQuantity, 2);
  assert.equal(reservedBefore.issuedQuantity, 0);

  const race = await Promise.all([
    register(
      payload(paidId, 'USD', 1500, guestEmail, 2)
    ),
    register(
      payload(paidId, 'BDT', 180000, guestEmail, 2)
    ),
  ]);

  assert.deepEqual(
    race.map(item => item.status).sort(),
    [201, 409]
  );

  const reservedAfter = await inventory(paidId);

  assert.equal(reservedAfter.reservedQuantity, 4);
  assert.equal(reservedAfter.issuedQuantity, 0);

  pass('Concurrent paid reservations cannot oversell');

  event = success(
    await control('paused')
  );

  await publicStatus('paused');

  failure(
    await register(
      payload(freeId, null, 0)
    ),
    409
  );

  assert.equal(
    (await inventory(paidId)).reservedQuantity,
    4
  );

  pass('Pause blocks new orders without releasing reservations');

  event = success(
    await control('open')
  );

  await publicStatus('open');

  const finalFree = success(
    await register(
      payload(freeId, null, 0)
    ),
    201
  );

  assert.equal(finalFree.status, 'confirmed');

  assert.equal(
    (await inventory(freeId)).issuedQuantity,
    2
  );

  failure(
    await register(
      payload(freeId, null, 0)
    ),
    409
  );

  pass('Resume works and sold-out inventory rejects orders');

  event = success(
    await control('closed')
  );

  await publicStatus('closed');

  failure(
    await control('open'),
    409
  );

  failure(
    await register(
      payload(paidId, 'USD', 1500)
    ),
    409
  );

  pass('Closed registration is terminal');

  const existingOrder = success(
    await readOrder(bdt.orderId)
  );

  assert.equal(
    existingOrder.status,
    'awaiting_payment'
  );

  assert.equal(
    (await inventory(paidId)).reservedQuantity,
    4
  );

  pass('Existing paid orders preserved after closure');

  const audits = await adminDb
    .collection(C.auditLogs)
    .where('eventId', '==', eventId)
    .get();

  const actions = audits.docs.map(
    doc => doc.data().action
  );

  for (const action of [
    'event_registration_opened',
    'event_registration_paused',
    'event_registration_resumed',
    'event_registration_closed',
  ]) {
    assert.ok(actions.includes(action), action);
  }

  pass('Registration lifecycle audit logs recorded');

  console.log(
    'A7 CRITICAL CHECKS PASSED: ' + passed
  );
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
    'PASS: Targeted A7 cleanup completed'
  );
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('A7 FAILED:', error);
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
