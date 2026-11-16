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


const {
  updateAdminBkashSettings,
  getAdminBkashSettings,
} = require('../src/services/payments/bkash-settings.service.ts');

const {
  getEventBkashPaymentInstructions,
} = require('../src/services/payments/bkash-manual-provider.service.ts');

const {
  submitEventBkashPayment,
} = require('../src/services/payments/bkash-manual-submission.service.ts');

const {
  decideAdminBkashPayment,
} = require('../src/services/payments/bkash-admin-decision.service.ts');

const {
  listAdminPendingBkashPayments,
} = require('../src/services/payments/bkash-admin-review.service.ts');

const {
  getAdminBkashPaymentDetails,
} = require('../src/services/payments/bkash-admin-details.service.ts');

const {
  expireBkashPaymentReview,
} = require('../src/services/payments/bkash-review-expiry.service.ts');

const {
  Timestamp,
} = require('firebase-admin/firestore');

const createdSubmissionIds = new Set();
const createdClaimIds = new Set();
const createdSettingsAuditIds = new Set();

let originalSettings = null;
let settingsTouched = false;
let settingsRef = null;


async function main() {
  const admin = await createAccount('admin');
  const founder = await createAccount('founder');
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


  process.env.BKASH_MANUAL_PAYMENTS_ENABLED = 'true';

  const senderNumber = '01700000001';
  const receivingNumber = '01800000001';

  const access = {
    idToken: founder.token,
    guestSessionSecret: null,
  };

  const initialSettings =
    await getAdminBkashSettings(admin.token);

  // Use the existing provider settings singleton.
  const settingsDocs = await adminDb
    .collection(P.providerSettings)
    .get();

  assert.ok(
    settingsDocs.size <= 1,
    'Unexpected provider settings fixtures'
  );

  if (settingsDocs.size === 1) {
    settingsRef = settingsDocs.docs[0].ref;
    originalSettings = settingsDocs.docs[0].data();
  }

  const settings = await updateAdminBkashSettings(
    admin.token,
    {
      enabled: true,
      receivingNumber,
      accountType: 'personal',
      expectedConfigVersion:
        initialSettings.configVersion,
    }
  );

  settingsTouched = true;

  assert.equal(settings.effectiveEnabled, true);
  assert.equal(settings.receivingNumber, receivingNumber);

  const updatedSettingsDocs = await adminDb
    .collection(P.providerSettings)
    .get();

  assert.equal(updatedSettingsDocs.size, 1);

  settingsRef = updatedSettingsDocs.docs[0].ref;

  const settingsAudits = await adminDb
    .collection(P.auditLogs)
    .where('actorUid', '==', admin.uid)
    .get();

  for (const doc of settingsAudits.docs) {
    if (doc.data().action === 'bkash_settings_updated') {
      createdSettingsAuditIds.add(doc.id);
    }
  }

  pass('Admin bKash settings configured');

  async function newPaidOrder() {
    const result = success(
      await register(
        payload(
          paidId,
          'BDT',
          180000,
          founderEmail
        ),
        { token: founder.token }
      ),
      201
    );

    assert.equal(result.provider, 'bkash_manual');
    assert.equal(result.status, 'awaiting_payment');

    const order = (
      await adminDb.collection(C.orders)
        .doc(result.orderId).get()
    ).data();

    const paymentOrder = (
      await adminDb.collection(P.orders)
        .doc(order.paymentOrderId).get()
    ).data();

    return {
      orderId: result.orderId,
      paymentOrderId: order.paymentOrderId,
      paymentId: paymentOrder.activePaymentId,
      reservationId: order.reservationId,
    };
  }

  async function readRecord(collection, id) {
    const snap = await adminDb
      .collection(collection)
      .doc(id)
      .get();

    assert.ok(snap.exists, collection + '/' + id);

    return snap.data();
  }

  async function assertRegistrationStatus(
    orderId,
    expected
  ) {
    const registrations = await adminDb
      .collection(C.registrations)
      .where('orderId', '==', orderId)
      .get();

    assert.equal(registrations.size, 1);

    for (const doc of registrations.docs) {
      assert.equal(
        doc.data().status,
        expected
      );

      if (expected === 'confirmed') {
        assert.ok(doc.data().confirmedAt);
      } else {
        assert.equal(
          doc.data().confirmedAt,
          null
        );
      }
    }
  }

  function transactionId() {
    return randomUUID()
      .replace(/-/g, '')
      .toUpperCase()
      .slice(0, 12);
  }

  async function submit(order, trxId) {
    await getEventBkashPaymentInstructions(
      order.orderId,
      access
    );

    const result = await submitEventBkashPayment(
      order.orderId,
      access,
      {
        senderNumber,
        transactionId: trxId,
      }
    );

    createdSubmissionIds.add(order.paymentId);

    const submission = await readRecord(
      P.manualSubmissions,
      order.paymentId
    );

    createdClaimIds.add(
      submission.transactionClaimId
    );

    assert.equal(
      submission.status,
      'pending_verification'
    );

    assert.equal(
      submission.transactionId,
      trxId
    );

    return result;
  }

  function approval(trxId) {
    return {
      decision: 'approve',
      confirmedFundsReceived: true,
      verifiedAmountMinor: 180000,
      verifiedTransactionId: trxId,
      verifiedSenderNumber: senderNumber,
      verifiedReceivingNumber: receivingNumber,
      reason: 'Emulator verified payment',
    };
  }

  const first = await newPaidOrder();
  const trx1 = transactionId();

  await getEventBkashPaymentInstructions(
    first.orderId,
    access
  );

  const paymentWithSnapshot = await readRecord(
    P.payments,
    first.paymentId
  );

  assert.equal(
    paymentWithSnapshot.bkashAccountSnapshot.receivingNumber,
    receivingNumber
  );

  assert.equal(
    paymentWithSnapshot.bkashAccountSnapshot.accountType,
    'personal'
  );

  pass('Payment receiving account snapshot persisted');

  await submit(first, trx1);

  assert.equal(
    (await readRecord(P.payments, first.paymentId)).status,
    'pending_verification'
  );

  pass('Payment submission enters pending verification');

  const replay = await submitEventBkashPayment(
    first.orderId,
    access,
    {
      senderNumber,
      transactionId: trx1,
    }
  );

  assert.equal(replay.replayed, true);

  pass('Identical submission replay is idempotent');

  const pending =
    await listAdminPendingBkashPayments(admin.token);

  assert.ok(
    pending.items.some(
      item => item.submissionId === first.paymentId
    )
  );

  const bkashDetails =
    await getAdminBkashPaymentDetails(
      admin.token,
      first.paymentId
    );

  assert.equal(bkashDetails.canApprove, true);
  assert.equal(bkashDetails.amountMinor, 180000);

  pass('Admin pending list and payment details');

  const second = await newPaidOrder();

  await getEventBkashPaymentInstructions(
    second.orderId,
    access
  );

  await assert.rejects(
    submitEventBkashPayment(
      second.orderId,
      access,
      {
        senderNumber,
        transactionId: trx1,
      }
    )
  );

  assert.equal(
    (await readRecord(P.payments, second.paymentId)).status,
    'pending_payment'
  );

  pass('Duplicate transaction claim blocked');

  await assert.rejects(
    decideAdminBkashPayment(
      founder.token,
      first.paymentId,
      approval(trx1)
    )
  );

  pass('Non-admin payment approval blocked');

  const missingConfirmation = approval(trx1);

  delete missingConfirmation.confirmedFundsReceived;

  await assert.rejects(
    decideAdminBkashPayment(
      admin.token,
      first.paymentId,
      missingConfirmation
    )
  );

  pass('Approval without receipt confirmation blocked');

  await assert.rejects(
    decideAdminBkashPayment(
      admin.token,
      first.paymentId,
      {
        ...approval(trx1),
        verifiedAmountMinor: 179999,
      }
    )
  );

  assert.equal(
    (await readRecord(P.payments, first.paymentId)).status,
    'pending_verification'
  );

  pass('Incorrect verified amount blocked');

  const beforeApproval = await inventory(paidId);

  const approvalRace = await Promise.allSettled([
    decideAdminBkashPayment(
      admin.token,
      first.paymentId,
      approval(trx1)
    ),
    decideAdminBkashPayment(
      admin.token,
      first.paymentId,
      approval(trx1)
    ),
  ]);

  assert.equal(
    approvalRace.filter(
      item => item.status === 'fulfilled'
    ).length,
    1
  );

  const afterApproval = await inventory(paidId);

  assert.equal(
    afterApproval.reservedQuantity,
    beforeApproval.reservedQuantity - 1
  );

  assert.equal(
    afterApproval.issuedQuantity,
    beforeApproval.issuedQuantity + 1
  );

  assert.equal(
    (await readRecord(P.payments, first.paymentId)).status,
    'succeeded'
  );

  assert.equal(
    (await readRecord(C.orders, first.orderId)).status,
    'fulfilled'
  );

  assert.equal(
    (await readRecord(P.orders, first.paymentOrderId)).status,
    'fulfilled'
  );

  assert.equal(
    (await readRecord(C.reservations, first.reservationId)).status,
    'consumed'
  );

  assert.equal(
    (await readRecord(P.manualSubmissions, first.paymentId)).status,
    'approved'
  );

  await assertRegistrationStatus(
    first.orderId,
    'confirmed'
  );

  pass('Concurrent approval consumes inventory exactly once');

  // L9: Verify canonical ticket and email records.
  const {
    buildEventTicketId,
  } = require(
    '../src/services/event-ticket-issuance.service.ts'
  );

  const issuedTickets = await adminDb
    .collection(C.tickets)
    .where('orderId', '==', first.orderId)
    .get();

  assert.equal(issuedTickets.size, 1);

  const issuedTicket = issuedTickets.docs[0].data();

  assert.equal(issuedTicket.status, 'issued');
  assert.equal(issuedTicket.orderId, first.orderId);
  assert.equal(issuedTicket.ticketTypeId, paidId);

  assert.equal(
    issuedTicket.ticketId,
    buildEventTicketId(issuedTicket.registrationId)
  );

  assert.equal(
    issuedTickets.docs[0].id,
    issuedTicket.ticketId
  );

  assert.match(
    issuedTicket.ticketNumber,
    /^TS-[A-F0-9]{64}$/
  );

  assert.match(
    issuedTicket.qrTokenHash,
    /^[a-f0-9]{64}$/
  );

  assert.equal(issuedTicket.checkedInAt, null);

  pass('Exactly one canonical ticket issued');

  const ticketAudit = await readRecord(
    C.auditLogs,
    'issued_' + issuedTicket.ticketId
  );

  assert.equal(ticketAudit.action, 'ticket_issued');
  assert.equal(ticketAudit.resourceId, issuedTicket.ticketId);

  pass('Ticket issuance audit verified');

  const approvedEmails = await adminDb
    .collection(C.emailOutbox)
    .where('orderId', '==', first.orderId)
    .get();

  const confirmationEmails = approvedEmails.docs
    .map(doc => doc.data())
    .filter(job => job.type === 'registration_confirmed');

  assert.equal(confirmationEmails.length, 1);

  const confirmationEmail = confirmationEmails[0];

  assert.equal(confirmationEmail.status, 'pending');
  assert.equal(confirmationEmail.provider, 'resend');
  assert.equal(confirmationEmail.attemptCount, 0);
  assert.equal(confirmationEmail.providerEmailId, null);

  assert.equal(
    confirmationEmail.idempotencyKey,
    'tabstartup-event-email/' + confirmationEmail.emailId
  );

  pass('Confirmation email queued exactly once');

  // L9C: Confirmed ticket PDF email attachments.

  const {
    readConfirmedEmailTicketInputs,
    generateConfirmedEmailAttachments,
  } = require(
    '../src/services/email/event-ticket-attachment.service.ts'
  );

  const confirmedPdfInputs =
    await adminDb.runTransaction(
      tx => readConfirmedEmailTicketInputs(
        tx,
        adminDb,
        confirmationEmail,
        Timestamp.now()
      ),
      { readOnly: true }
    );

  assert.equal(confirmedPdfInputs.length, 1);

  const pdfInput = confirmedPdfInputs[0];

  assert.equal(
    pdfInput.ticketNumber,
    issuedTicket.ticketNumber
  );

  const pdfRegistration = await readRecord(
    C.registrations,
    issuedTicket.registrationId
  );

  assert.equal(
    pdfInput.participantName,
    pdfRegistration.participant.fullName
  );

  assert.equal(pdfInput.currency, 'BDT');
  assert.equal(pdfInput.unitAmountMinor, 180000);
  assert.equal(pdfInput.status, 'issued');

  pass('Email PDF inputs match canonical admission ticket');

  const pdfAttachments =
    await generateConfirmedEmailAttachments(
      confirmedPdfInputs
    );

  assert.equal(pdfAttachments.length, 1);

  assert.equal(
    pdfAttachments[0].filename,
    'TabStartup-Ticket-' +
      issuedTicket.ticketNumber +
      '.pdf'
  );

  const pdfBytes = Buffer.from(
    pdfAttachments[0].content,
    'base64'
  );

  assert.equal(
    pdfBytes.subarray(0, 5).toString('ascii'),
    '%PDF-'
  );

  assert.ok(pdfBytes.length > 1000);
  assert.ok(pdfBytes.length <= 1024 * 1024);

  pass('Confirmation attachment contains a valid PDF header and size');

  const repeatedPdfAttachments =
    await generateConfirmedEmailAttachments(
      confirmedPdfInputs
    );

  assert.deepEqual(
    repeatedPdfAttachments,
    pdfAttachments,
    'Repeated ticket generation must preserve exact PDF bytes'
  );

  pass('Repeated PDF generation preserves attachment bytes');

  await assert.rejects(
    adminDb.runTransaction(
      tx => readConfirmedEmailTicketInputs(
        tx,
        adminDb,
        {
          ...confirmationEmail,
          recipientEmail: 'wrong-recipient@example.test',
        },
        Timestamp.now()
      ),
      { readOnly: true }
    )
  );

  pass('Ticket attachment rejects mismatched recipient');

  await assert.rejects(
    generateConfirmedEmailAttachments([
      pdfInput,
      pdfInput,
    ])
  );

  pass('Duplicate ticket attachment rejected');

  await assert.rejects(
    generateConfirmedEmailAttachments([])
  );

  pass('Empty ticket attachment list rejected');

  // L9C: Email payload and mocked Resend delivery.

  const emailTestEnvironment = {
    EVENT_EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 're_emulator_test_only_123456',
    EVENT_EMAIL_FROM:
      'TabStartup Events <events@tabstartup.com>',
    EVENT_EMAIL_REPLY_TO:
      'info@tabstartup.com',
  };

  const previousEmailEnvironment = {};

  for (const [key, value] of
    Object.entries(emailTestEnvironment)) {
    previousEmailEnvironment[key] = process.env[key];
    process.env[key] = value;
  }

  const originalEmailFetch = globalThis.fetch;

  try {
    const {
      claimEventEmailJob,
    } = require(
      '../src/services/email/event-email-claim.service.ts'
    );

    const {
      prepareClaimedEmailPayload,
    } = require(
      '../src/services/email/event-email-payload.service.ts'
    );

    const {
      sendTransactionalEmail,
    } = require(
      '../src/services/email/resend-email.service.ts'
    );

    const emailClaim =
      await claimEventEmailJob(
        confirmationEmail.emailId
      );

    assert.equal(emailClaim.status, 'claimed');

    const preparedEmail =
      await prepareClaimedEmailPayload(
        emailClaim.job,
        emailClaim.leaseToken
      );

    assert.equal(preparedEmail.status, 'ready');

    assert.equal(
      preparedEmail.payload.to,
      confirmationEmail.recipientEmail
    );

    assert.deepEqual(
      preparedEmail.payload.attachments,
      pdfAttachments
    );

    assert.equal(
      preparedEmail.payload.idempotencyKey,
      confirmationEmail.idempotencyKey
    );

    pass('Prepared confirmation email binds canonical PDF attachments');

    const repeatedEmail =
      await prepareClaimedEmailPayload(
        emailClaim.job,
        emailClaim.leaseToken
      );

    assert.equal(repeatedEmail.status, 'ready');

    assert.deepEqual(
      repeatedEmail.payload,
      preparedEmail.payload
    );

    pass('Repeated email preparation preserves delivery payload');

    let mockedEmailRequests = 0;

    globalThis.fetch = async (url, options) => {
      assert.equal(
        String(url),
        'https://api.resend.com/emails'
      );

      assert.equal(options.method, 'POST');

      const body = JSON.parse(options.body);

      assert.deepEqual(
        body.attachments,
        pdfAttachments
      );

      assert.equal(
        body.from,
        emailTestEnvironment.EVENT_EMAIL_FROM
      );

      mockedEmailRequests++;

      return new Response(
        JSON.stringify({
          id: 'emulator-email-test-123456',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    };

    const emailDelivery =
      await sendTransactionalEmail(
        preparedEmail.payload
      );

    assert.equal(emailDelivery.status, 'accepted');
    assert.equal(emailDelivery.provider, 'resend');

    assert.equal(
      emailDelivery.providerEmailId,
      'emulator-email-test-123456'
    );

    assert.equal(mockedEmailRequests, 1);

    pass('Mocked Resend request contains exact PDF attachments');

    await assert.rejects(
      sendTransactionalEmail({
        ...preparedEmail.payload,
        attachments: [
          {
            filename: 'invalid.pdf',
            content: 'invalid-content',
          },
        ],
      })
    );

    assert.equal(mockedEmailRequests, 1);

    pass('Invalid attachment blocked before provider request');

  } finally {
    globalThis.fetch = originalEmailFetch;

    for (const [key, value] of
      Object.entries(previousEmailEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }





  const trx2 = transactionId();

  await submit(second, trx2);

  await assert.rejects(
    decideAdminBkashPayment(
      admin.token,
      second.paymentId,
      {
        decision: 'reject',
        reason: 'Missing confirmation',
      }
    )
  );

  pass('Rejection without no-funds confirmation blocked');

  const beforeReject = await inventory(paidId);

  await decideAdminBkashPayment(
    admin.token,
    second.paymentId,
    {
      decision: 'reject',
      confirmedNoFundsReceived: true,
      reason: 'Emulator no funds received',
    }
  );

  const afterReject = await inventory(paidId);

  assert.equal(
    afterReject.reservedQuantity,
    beforeReject.reservedQuantity - 1
  );

  assert.equal(
    afterReject.issuedQuantity,
    beforeReject.issuedQuantity
  );

  assert.equal(
    (await readRecord(P.payments, second.paymentId)).status,
    'rejected'
  );

  assert.equal(
    (await readRecord(C.orders, second.orderId)).status,
    'cancelled'
  );

  assert.equal(
    (await readRecord(C.reservations, second.reservationId)).status,
    'released'
  );

  await assertRegistrationStatus(
    second.orderId,
    'cancelled'
  );

  pass('Rejection releases inventory without issuing tickets');

  const rejectedTickets = await adminDb
    .collection(C.tickets)
    .where('orderId', '==', second.orderId)
    .get();

  assert.equal(rejectedTickets.size, 0);

  pass('Rejected payment has no ticket records');

  const rejectedEmails = await adminDb
    .collection(C.emailOutbox)
    .where('orderId', '==', second.orderId)
    .get();

  const rejectionEmails = rejectedEmails.docs
    .map(doc => doc.data())
    .filter(job => job.type === 'payment_rejected');

  assert.equal(rejectionEmails.length, 1);
  assert.equal(rejectionEmails[0].status, 'pending');

  assert.equal(
    rejectedEmails.docs
      .map(doc => doc.data())
      .filter(job => job.type === 'registration_confirmed')
      .length,
    0
  );

  pass('Rejection email queued without confirmation email');

  const third = await newPaidOrder();
  const trx3 = transactionId();

  await submit(third, trx3);

  const notDue = await expireBkashPaymentReview(
    third.paymentId
  );

  assert.equal(notDue.status, 'not_due');

  pass('Active review reservation cannot expire early');

  const thirdSubmission = await readRecord(
    P.manualSubmissions,
    third.paymentId
  );

  // Wait until a valid deadline can be placed
  // strictly after the original submission time.
  const elapsedDeadlineMs =
    thirdSubmission.submittedAt.toMillis() + 1;

  const waitMs = Math.max(
    0,
    elapsedDeadlineMs - Date.now() + 20
  );

  if (waitMs > 0) {
    await new Promise(
      resolve => setTimeout(resolve, waitMs)
    );
  }

  const elapsedDeadline =
    Timestamp.fromMillis(elapsedDeadlineMs);

  const deadlineBatch = adminDb.batch();

  deadlineBatch.update(
    adminDb.collection(P.manualSubmissions)
      .doc(third.paymentId),
    {
      reviewDeadlineAt: elapsedDeadline,
    }
  );

  deadlineBatch.update(
    adminDb.collection(C.reservations)
      .doc(third.reservationId),
    {
      reviewDeadlineAt: elapsedDeadline,
    }
  );

  await deadlineBatch.commit();

  const expiredDetails =
    await getAdminBkashPaymentDetails(
      admin.token,
      third.paymentId
    );

  assert.equal(
    expiredDetails.canApprove,
    false
  );

  pass('Elapsed review deadline blocks approval');

  const beforeExpiry = await inventory(paidId);

  const expiryRace = await Promise.allSettled([
    decideAdminBkashPayment(
      admin.token,
      third.paymentId,
      approval(trx3)
    ),
    expireBkashPaymentReview(
      third.paymentId
    ),
  ]);

  assert.equal(
    expiryRace[0].status,
    'rejected'
  );

  assert.equal(
    expiryRace[1].status,
    'fulfilled'
  );

  assert.equal(
    expiryRace[1].value.status,
    'expired'
  );

  assert.equal(
    expiryRace[1].value.inventoryReleased,
    true
  );

  const afterExpiry = await inventory(paidId);

  assert.equal(
    afterExpiry.reservedQuantity,
    beforeExpiry.reservedQuantity - 1
  );

  assert.equal(
    afterExpiry.issuedQuantity,
    beforeExpiry.issuedQuantity
  );

  for (const [collection, id] of [
    [P.payments, third.paymentId],
    [P.orders, third.paymentOrderId],
    [C.orders, third.orderId],
    [P.manualSubmissions, third.paymentId],
  ]) {
    assert.equal(
      (await readRecord(collection, id)).status,
      'requires_review'
    );
  }

  assert.equal(
    (await readRecord(
      C.reservations,
      third.reservationId
    )).status,
    'expired'
  );

  await assertRegistrationStatus(
    third.orderId,
    'requires_review'
  );

  const preservedClaim = await readRecord(
    P.transactionClaims,
    thirdSubmission.transactionClaimId
  );

  assert.equal(
    preservedClaim.transactionId,
    trx3
  );

  pass('Concurrent expired approval and expiry preserve financial consistency');

  const repeatedExpiry =
    await expireBkashPaymentReview(
      third.paymentId
    );

  assert.equal(
    repeatedExpiry.inventoryReleased,
    false
  );

  const finalInventory = await inventory(paidId);

  assert.equal(
    finalInventory.reservedQuantity,
    afterExpiry.reservedQuantity
  );

  assert.equal(
    finalInventory.issuedQuantity,
    afterExpiry.issuedQuantity
  );

  pass('Repeated expiry cannot release inventory twice');

  // L9C: Recovery approval after review timeout.

  const {
    decideAdminBkashRecovery,
  } = require(
    '../src/services/payments/bkash-recovery-decision.service.ts'
  );

  const {
    getAdminBkashRecoveryDetails,
  } = require(
    '../src/services/payments/bkash-recovery-admin-details.service.ts'
  );

  await assert.rejects(
    getAdminBkashRecoveryDetails(
      founder.token,
      third.paymentId
    )
  );

  await assert.rejects(
    decideAdminBkashRecovery(
      founder.token,
      third.paymentId,
      approval(trx3)
    )
  );

  pass('Non-admin cannot access or approve recovery');

  const recoveryDetails =
    await getAdminBkashRecoveryDetails(
      admin.token,
      third.paymentId
    );

  assert.equal(
    recoveryDetails.recoveryType,
    'review_timeout'
  );

  assert.equal(
    recoveryDetails.canApprove,
    true
  );

  assert.ok(
    recoveryDetails.availableQuantity >= 1
  );

  pass('Expired review is eligible for recovery');

  const beforeRecovery =
    await inventory(paidId);

  const recoveryResult =
    await decideAdminBkashRecovery(
      admin.token,
      third.paymentId,
      approval(trx3)
    );

  assert.equal(
    recoveryResult.status,
    'approved'
  );

  for (const [collection, id, status] of [
    [P.payments, third.paymentId, 'succeeded'],
    [P.orders, third.paymentOrderId, 'fulfilled'],
    [C.orders, third.orderId, 'fulfilled'],
    [P.manualSubmissions, third.paymentId, 'approved'],
    [C.reservations, third.reservationId, 'expired'],
  ]) {
    assert.equal(
      (await readRecord(collection, id)).status,
      status
    );
  }

  await assertRegistrationStatus(
    third.orderId,
    'confirmed'
  );

  pass('Recovery approval fulfills payment and registration');

  const afterRecovery =
    await inventory(paidId);

  assert.equal(
    afterRecovery.reservedQuantity,
    beforeRecovery.reservedQuantity
  );

  assert.equal(
    afterRecovery.issuedQuantity,
    beforeRecovery.issuedQuantity + 1
  );

  pass('Recovery issues capacity without double release');

  const recoveryTickets = await adminDb
    .collection(C.tickets)
    .where('orderId', '==', third.orderId)
    .get();

  assert.equal(recoveryTickets.size, 1);

  assert.equal(
    recoveryTickets.docs[0].data().status,
    'issued'
  );

  pass('Recovery issues exactly one admission ticket');

  await assert.rejects(
    decideAdminBkashRecovery(
      admin.token,
      third.paymentId,
      approval(trx3)
    )
  );

  const afterDuplicate =
    await inventory(paidId);

  assert.equal(
    afterDuplicate.reservedQuantity,
    afterRecovery.reservedQuantity
  );

  assert.equal(
    afterDuplicate.issuedQuantity,
    afterRecovery.issuedQuantity
  );

  assert.equal(
    (await adminDb
      .collection(C.tickets)
      .where('orderId', '==', third.orderId)
      .get()).size,
    1
  );

  pass('Duplicate recovery cannot issue extra tickets');

  const recoveryAudits = await adminDb
    .collection(P.auditLogs)
    .where('resourceId', '==', eventId)
    .get();

  assert.equal(
    recoveryAudits.docs
      .map(doc => doc.data())
      .filter(
        item => item.action === 'bkash_recovery_approved'
      ).length,
    1
  );

  pass('Recovery financial audit recorded exactly once');

  // L9C: Late bKash evidence recovery.

  const {
    expireUnpaidEventReservation,
  } = require(
    '../src/services/payments/event-unpaid-expiry.service.ts'
  );

  const {
    submitLateEventBkashPayment,
  } = require(
    '../src/services/payments/bkash-late-submission.service.ts'
  );

  const late = await newPaidOrder();
  const lateTrx = transactionId();

  await getEventBkashPaymentInstructions(
    late.orderId,
    access
  );

  const lateInput = {
    senderNumber,
    transactionId: lateTrx,
  };

  await assert.rejects(
    submitLateEventBkashPayment(
      late.orderId,
      access,
      lateInput
    )
  );

  pass('Late recovery cannot bypass active payment window');

  const latePayment = await readRecord(
    P.payments,
    late.paymentId
  );

  const elapsedExpiryMs = Math.max(
    latePayment.createdAt.toMillis(),
    latePayment.bkashAccountSnapshot.capturedAt.toMillis()
  ) + 1;

  const expiryWaitMs = Math.max(
    0,
    elapsedExpiryMs - Date.now() + 20
  );

  if (expiryWaitMs > 0) {
    await new Promise(
      resolve => setTimeout(resolve, expiryWaitMs)
    );
  }

  const elapsedExpiry =
    Timestamp.fromMillis(elapsedExpiryMs);

  const lateExpiryBatch = adminDb.batch();

  for (const [collection, id] of [
    [C.orders, late.orderId],
    [C.reservations, late.reservationId],
    [P.orders, late.paymentOrderId],
  ]) {
    lateExpiryBatch.update(
      adminDb.collection(collection).doc(id),
      { expiresAt: elapsedExpiry }
    );
  }

  await lateExpiryBatch.commit();

  const beforeLateExpiry =
    await inventory(paidId);

  const lateExpiry =
    await expireUnpaidEventReservation(
      late.reservationId
    );

  assert.equal(
    lateExpiry.inventoryReleased,
    true
  );

  assert.equal(
    (await readRecord(
      C.orders,
      late.orderId
    )).status,
    'requires_review'
  );

  const afterLateExpiry =
    await inventory(paidId);

  assert.equal(
    afterLateExpiry.reservedQuantity,
    beforeLateExpiry.reservedQuantity - 1
  );

  assert.equal(
    afterLateExpiry.issuedQuantity,
    beforeLateExpiry.issuedQuantity
  );

  pass('Expired bKash payment preserves evidence recovery');

  createdSubmissionIds.add(late.paymentId);

  const lateResult =
    await submitLateEventBkashPayment(
      late.orderId,
      access,
      lateInput
    );

  assert.equal(
    lateResult.status,
    'requires_review'
  );

  const lateSubmission = await readRecord(
    P.manualSubmissions,
    late.paymentId
  );

  createdClaimIds.add(
    lateSubmission.transactionClaimId
  );

  assert.equal(
    lateSubmission.status,
    'requires_review'
  );

  assert.equal(
    lateSubmission.transactionId,
    lateTrx
  );

  await assertRegistrationStatus(
    late.orderId,
    'requires_review'
  );

  pass('Late payment evidence accepted for manual review');

  const lateReplay =
    await submitLateEventBkashPayment(
      late.orderId,
      access,
      lateInput
    );

  assert.equal(lateReplay.replayed, true);

  assert.equal(
    lateReplay.status,
    'requires_review'
  );

  const afterLateReplay =
    await inventory(paidId);

  assert.equal(
    afterLateReplay.reservedQuantity,
    afterLateExpiry.reservedQuantity
  );

  assert.equal(
    afterLateReplay.issuedQuantity,
    afterLateExpiry.issuedQuantity
  );

  pass('Late submission replay preserves inventory');

  // L9C: Insufficient capacity protection.

  const lateDetails =
    await getAdminBkashRecoveryDetails(
      admin.token,
      late.paymentId
    );

  assert.equal(
    lateDetails.recoveryType,
    'late_submission'
  );

  assert.equal(lateDetails.canApprove, true);

  assert.ok(
    lateDetails.availableQuantity > 0
  );

  pass('Late submission is eligible while capacity exists');

  const capacityFillOrders = [];

  for (
    let i = 0;
    i < lateDetails.availableQuantity;
    i++
  ) {
    capacityFillOrders.push(
      await newPaidOrder()
    );
  }

  const fullInventory =
    await inventory(paidId);

  assert.equal(
    fullInventory.reservedQuantity +
      fullInventory.issuedQuantity,
    fullInventory.capacity
  );

  const blockedRecovery =
    await getAdminBkashRecoveryDetails(
      admin.token,
      late.paymentId
    );

  assert.equal(
    blockedRecovery.availableQuantity,
    0
  );

  assert.equal(
    blockedRecovery.canApprove,
    false
  );

  assert.ok(
    blockedRecovery.approvalBlockers.includes(
      'INSUFFICIENT_AVAILABLE_CAPACITY'
    )
  );

  pass('Sold-out capacity blocks late recovery approval');

  await assert.rejects(
    decideAdminBkashRecovery(
      admin.token,
      late.paymentId,
      approval(lateTrx)
    )
  );

  const afterBlockedRecovery =
    await inventory(paidId);

  assert.equal(
    afterBlockedRecovery.reservedQuantity,
    fullInventory.reservedQuantity
  );

  assert.equal(
    afterBlockedRecovery.issuedQuantity,
    fullInventory.issuedQuantity
  );

  for (const [collection, id] of [
    [P.payments, late.paymentId],
    [P.orders, late.paymentOrderId],
    [C.orders, late.orderId],
    [P.manualSubmissions, late.paymentId],
  ]) {
    assert.equal(
      (await readRecord(collection, id)).status,
      'requires_review'
    );
  }

  await assertRegistrationStatus(
    late.orderId,
    'requires_review'
  );

  const blockedTickets = await adminDb
    .collection(C.tickets)
    .where('orderId', '==', late.orderId)
    .get();

  assert.equal(blockedTickets.size, 0);

  pass('Blocked recovery preserves payment and inventory without issuing tickets');







  const audits = await adminDb
    .collection(P.auditLogs)
    .where('resourceId', '==', eventId)
    .get();

  const approvedAudits = audits.docs
    .map(doc => doc.data())
    .filter(
      item => item.action === 'bkash_payment_approved'
    );

  const rejectedAudits = audits.docs
    .map(doc => doc.data())
    .filter(
      item => item.action === 'bkash_payment_rejected'
    );

  assert.equal(approvedAudits.length, 1);
  assert.equal(rejectedAudits.length, 1);

  assert.equal(
    approvedAudits[0].verificationEvidence.confirmedFundsReceived,
    true
  );

  assert.equal(
    rejectedAudits[0].verificationEvidence.confirmedNoFundsReceived,
    true
  );

  assert.equal(
    approvedAudits[0].verificationEvidence.verifiedTransactionId,
    trx1
  );

  pass('Financial audit evidence persisted exactly once');

  console.log(
    'A8 BKASH CRITICAL CHECKS PASSED: ' + passed
  );
}

async function cleanup() {
  for (const id of createdSubmissionIds) {
    await adminDb.collection(P.manualSubmissions)
      .doc(id).delete();
  }

  for (const id of createdClaimIds) {
    await adminDb.collection(P.transactionClaims)
      .doc(id).delete();
  }

  for (const id of createdSettingsAuditIds) {
    await adminDb.collection(P.auditLogs)
      .doc(id).delete();
  }

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
      P.transactionClaims,
      P.auditLogs,
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
    'PASS: Targeted A8 BKASH cleanup completed'
  );
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('A8 BKASH FAILED:', error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error('A8 BKASH CLEANUP FAILED:', error);
      process.exitCode = 1;
    } finally {
      await deleteApp(adminApp);
    }
  }
})();
