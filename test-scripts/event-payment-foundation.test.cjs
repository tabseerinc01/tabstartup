const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (
  request,
  parent,
  isMain,
  options
) {
  if (request.startsWith('@/')) {
    request = path.join(
      root,
      'src',
      request.slice(2)
    );
  }

  return originalResolve.call(
    this,
    request,
    parent,
    isMain,
    options
  );
};

require.extensions['.ts'] = function (
  module,
  filename
) {
  const source = fs.readFileSync(
    filename,
    'utf8'
  );

  const compiled = ts.transpileModule(
    source,
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

const payment = require(
  '../src/lib/payment-types.ts'
);

const paymentLifecycle = require(
  '../src/lib/payment-lifecycle.ts'
);

const event = require(
  '../src/lib/event-validation.ts'
);

const eventLifecycle = require(
  '../src/lib/event-lifecycle.ts'
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS:', name);
  } catch (error) {
    failed++;
    console.error('FAIL:', name);
    console.error(error.message);
  }
}

function equal(name, actual, expected) {
  test(name, () => {
    assert.deepEqual(
      actual,
      expected
    );
  });
}

console.log(
  '\n===== CURRENCY AND PAYMENT ROUTING ====='
);

equal(
  'USD supported',
  payment.isPaymentCurrency('USD'),
  true
);

equal(
  'BDT supported',
  payment.isPaymentCurrency('BDT'),
  true
);

equal(
  'EUR rejected',
  payment.isPaymentCurrency('EUR'),
  false
);

equal(
  'USD routes to TabEdge',
  payment.getActivePaymentMethod('USD'),
  {
    currency: 'USD',
    provider: 'tabedge',
    verificationMode: 'automatic',
  }
);

equal(
  'BDT routes to bKash manual',
  payment.getActivePaymentMethod('BDT'),
  {
    currency: 'BDT',
    provider: 'bkash_manual',
    verificationMode: 'manual',
  }
);

test(
  'Unsupported currency cannot select provider',
  () => {
    assert.throws(
      () => payment.getActivePaymentMethod('EUR'),
      /UNSUPPORTED_PAYMENT_CURRENCY/
    );
  }
);

equal(
  'bKash API is inactive',
  paymentLifecycle.isActivePaymentMethod({
    currency: 'BDT',
    provider: 'bkash_api',
    verificationMode: 'automatic',
  }),
  false
);

equal(
  'BDT cannot use TabEdge',
  paymentLifecycle.isActivePaymentMethod({
    currency: 'BDT',
    provider: 'tabedge',
    verificationMode: 'automatic',
  }),
  false
);

equal(
  'USD cannot use bKash',
  paymentLifecycle.isActivePaymentMethod({
    currency: 'USD',
    provider: 'bkash_manual',
    verificationMode: 'manual',
  }),
  false
);

console.log(
  '\n===== AMOUNT AND PRICING ====='
);

equal(
  'Zero minor amount valid',
  payment.isValidMinorAmount(0),
  true
);

equal(
  'Negative amount rejected',
  payment.isValidMinorAmount(-1),
  false
);

equal(
  'Fractional minor amount rejected',
  payment.isValidMinorAmount(10.5),
  false
);

equal(
  'NaN rejected',
  payment.isValidMinorAmount(NaN),
  false
);

equal(
  'Infinity rejected',
  payment.isValidMinorAmount(Infinity),
  false
);

equal(
  'Unsafe integer rejected',
  payment.isValidMinorAmount(
    Number.MAX_SAFE_INTEGER + 1
  ),
  false
);

equal(
  'Paid amount cannot be zero',
  payment.isValidPaidAmount(0),
  false
);

const dualPrice = {
  usdAmountMinor: 1000,
  bdtAmountMinor: 120000,
};

equal(
  'Independent dual currency price valid',
  payment.isValidDualCurrencyPrice(dualPrice),
  true
);

equal(
  'USD price selected correctly',
  payment.getPriceForCurrency(
    dualPrice,
    'USD'
  ),
  {
    currency: 'USD',
    amountMinor: 1000,
  }
);

equal(
  'BDT price selected correctly',
  payment.getPriceForCurrency(
    dualPrice,
    'BDT'
  ),
  {
    currency: 'BDT',
    amountMinor: 120000,
  }
);

const freePricing = {
  pricingType: 'free',
  price: {
    usdAmountMinor: 0,
    bdtAmountMinor: 0,
  },
};

const paidPricing = {
  pricingType: 'paid',
  price: dualPrice,
};

equal(
  'Free ticket valid',
  event.isValidEventTicketPricing(
    freePricing
  ),
  true
);

equal(
  'Paid dual currency ticket valid',
  event.isValidEventTicketPricing(
    paidPricing
  ),
  true
);

equal(
  'Paid ticket requires both positive prices',
  event.isValidEventTicketPricing({
    pricingType: 'paid',
    price: {
      usdAmountMinor: 1000,
      bdtAmountMinor: 0,
    },
  }),
  false
);

equal(
  'Free ticket cannot contain paid price',
  event.isValidEventTicketPricing({
    pricingType: 'free',
    price: dualPrice,
  }),
  false
);

equal(
  'Free event rejects paid ticket',
  event.isTicketPricingAllowed(
    'free',
    paidPricing
  ),
  false
);

equal(
  'Mixed event accepts free ticket',
  event.isTicketPricingAllowed(
    'mixed',
    freePricing
  ),
  true
);

equal(
  'Mixed event accepts paid ticket',
  event.isTicketPricingAllowed(
    'mixed',
    paidPricing
  ),
  true
);

equal(
  'Integer ticket total calculated',
  event.calculateTicketTotalMinor(
    120000,
    3
  ),
  360000
);

test(
  'Unsafe total rejected',
  () => {
    assert.throws(
      () => event.calculateTicketTotalMinor(
        Number.MAX_SAFE_INTEGER,
        2
      ),
      /INVALID_TICKET_TOTAL/
    );
  }
);

console.log(
  '\n===== EVENT VALIDATION AND INVENTORY ====='
);

equal(
  'Valid event slug',
  event.isValidEventSlug(
    'tabstartup-demo-day'
  ),
  true
);

equal(
  'Invalid event slug rejected',
  event.isValidEventSlug('../event'),
  false
);

equal(
  'Invalid document ID rejected',
  event.isValidEventDocumentId('a/b'),
  false
);

equal(
  'Dhaka timezone valid',
  event.isValidEventTimezone('Asia/Dhaka'),
  true
);

equal(
  'Invalid timezone rejected',
  event.isValidEventTimezone('Invalid/Zone'),
  false
);

equal(
  'Online event capacity valid',
  event.isValidEventCapacity(
    'online',
    {
      online: 100,
      offline: 0,
    }
  ),
  true
);

equal(
  'Hybrid event requires both capacities',
  event.isValidEventCapacity(
    'hybrid',
    {
      online: 100,
      offline: 0,
    }
  ),
  false
);

equal(
  'Offline event rejects online attendance',
  event.isAttendanceModeAllowed(
    'offline',
    'online'
  ),
  false
);

equal(
  'Invalid event date range rejected',
  event.isValidEventDateRange(
    2000,
    1000
  ),
  false
);

equal(
  'Zero ticket quantity rejected',
  event.isValidTicketQuantity(0),
  false
);

equal(
  'Excess ticket quantity rejected',
  event.isValidTicketQuantity(21),
  false
);

const inventory = {
  capacity: 100,
  reservedQuantity: 20,
  issuedQuantity: 30,
};

equal(
  'Inventory counters valid',
  event.isValidInventoryCounters(
    inventory
  ),
  true
);

equal(
  'Available inventory calculated',
  event.getAvailableTicketQuantity(
    inventory
  ),
  50
);

equal(
  'Overbooked inventory rejected',
  event.isValidInventoryCounters({
    capacity: 100,
    reservedQuantity: 80,
    issuedQuantity: 30,
  }),
  false
);

equal(
  'Negative inventory rejected',
  event.isValidInventoryCounters({
    capacity: 100,
    reservedQuantity: -1,
    issuedQuantity: 30,
  }),
  false
);

console.log(
  '\n===== EVENT LIFECYCLE ====='
);

const officialDraft = {
  organizerType: 'platform',
  organizerId: 'tabstartup',
  status: 'draft',
};

const admin = {
  actorType: 'admin',
  uid: 'admin-test-uid',
};

const organizer = {
  actorType: 'event_organizer',
  uid: 'organizer-test-uid',
  organizerId: 'external-org',
};

equal(
  'Admin can publish official draft',
  eventLifecycle.canTransitionEventStatus(
    officialDraft,
    'published',
    admin
  ).allowed,
  true
);

equal(
  'External organizer cannot publish',
  eventLifecycle.canTransitionEventStatus(
    officialDraft,
    'published',
    organizer
  ).allowed,
  false
);

equal(
  'External events disabled in Release A',
  eventLifecycle.canTransitionEventStatus(
    {
      organizerType: 'verified_organizer',
      organizerId: 'external-org',
      status: 'approved',
    },
    'published',
    admin
  ).allowed,
  false
);

equal(
  'System cannot publish event',
  eventLifecycle.canTransitionEventStatus(
    officialDraft,
    'published',
    {
      actorType: 'system',
    }
  ).allowed,
  false
);

equal(
  'Published event cannot return to draft',
  eventLifecycle.canTransitionEventStatus(
    {
      ...officialDraft,
      status: 'published',
    },
    'draft',
    admin
  ).allowed,
  false
);

equal(
  'Draft event not publicly discoverable',
  eventLifecycle.isPublicEventDiscoverable({
    status: 'draft',
    visibility: 'public',
  }),
  false
);

equal(
  'Private event not publicly discoverable',
  eventLifecycle.isPublicEventDiscoverable({
    status: 'published',
    visibility: 'private',
  }),
  false
);

equal(
  'Published public event discoverable',
  eventLifecycle.isPublicEventDiscoverable({
    status: 'published',
    visibility: 'public',
  }),
  true
);

console.log(
  '\n===== PUBLICATION READINESS ====='
);

const now = Date.now();

const timestamp = ms => ({
  toMillis: () => ms,
});

const publishEvent = {
  ...officialDraft,
  eventId: 'event-test',
  title: 'TabStartup Demo Day',
  slug: 'tabstartup-demo-day',
  shortDescription: 'Startup networking event',
  description: 'Official TabStartup event.',
  mode: 'offline',
  timezone: 'Asia/Dhaka',
  capacity: {
    online: 0,
    offline: 100,
  },
  venue: {
    name: 'Event Venue',
    address: 'Dhaka',
    city: 'Dhaka',
    countryCode: 'BD',
    mapUrl: null,
  },
  startsAt: timestamp(now + 86400000),
  endsAt: timestamp(now + 90000000),
  registrationOpensAt: null,
  registrationClosesAt: null,
  maxTicketsPerOrder: 5,
  registrationType: 'paid',
};

const publicationTicket = {
  ticketType: {
    ticketTypeId: 'general',
    eventId: 'event-test',
    attendanceMode: 'offline',
    status: 'active',
    maxPerOrder: 5,
    ...paidPricing,
  },
  inventory: {
    eventId: 'event-test',
    ticketTypeId: 'general',
    capacity: 100,
    reservedQuantity: 0,
    issuedQuantity: 0,
  },
};

equal(
  'Valid paid event ready for publication',
  eventLifecycle.validateEventPublication(
    publishEvent,
    [publicationTicket],
    now
  ).ready,
  true
);

equal(
  'Publication without tickets rejected',
  eventLifecycle.validateEventPublication(
    publishEvent,
    [],
    now
  ).ready,
  false
);

equal(
  'Duplicate ticket type rejected',
  eventLifecycle.validateEventPublication(
    publishEvent,
    [
      publicationTicket,
      publicationTicket,
    ],
    now
  ).ready,
  false
);

equal(
  'Event-wide capacity overflow rejected',
  eventLifecycle.validateEventPublication(
    publishEvent,
    [
      {
        ...publicationTicket,
        inventory: {
          ...publicationTicket.inventory,
          capacity: 101,
        },
      },
    ],
    now
  ).ready,
  false
);

equal(
  'Ticket belonging to another event rejected',
  eventLifecycle.validateEventPublication(
    publishEvent,
    [
      {
        ...publicationTicket,
        ticketType: {
          ...publicationTicket.ticketType,
          eventId: 'another-event',
        },
      },
    ],
    now
  ).ready,
  false
);

equal(
  'Registration open for published event',
  eventLifecycle.isEventRegistrationOpen(
    {
      ...publishEvent,
      status: 'published',
      registrationStatus: 'open',
    },
    now
  ),
  true
);

equal(
  'Registration closed after event ends',
  eventLifecycle.isEventRegistrationOpen(
    {
      ...publishEvent,
      status: 'published',
      registrationStatus: 'open',
    },
    now + 91000000
  ),
  false
);

console.log(
  '\n===== PAYMENT LIFECYCLE ====='
);

const bkashPayment = {
  currency: 'BDT',
  provider: 'bkash_manual',
  verificationMode: 'manual',
  status: 'pending_verification',
  paymentId: 'payment-test',
  orderId: 'order-test',
  amountMinor: 120000,
  refundedAmountMinor: 0,
  providerPaymentId: null,
};

const tabedgePayment = {
  ...bkashPayment,
  currency: 'USD',
  provider: 'tabedge',
  verificationMode: 'automatic',
  status: 'processing',
  amountMinor: 1000,
};

const transition =
  paymentLifecycle.canTransitionPaymentStatus;

equal(
  'Customer cannot approve bKash payment',
  transition(
    bkashPayment,
    'succeeded',
    'customer'
  ),
  false
);

equal(
  'Admin may approve verified bKash payment',
  transition(
    bkashPayment,
    'succeeded',
    'admin'
  ),
  true
);

equal(
  'System cannot approve bKash payment',
  transition(
    bkashPayment,
    'succeeded',
    'system'
  ),
  false
);

equal(
  'Admin cannot manually approve TabEdge',
  transition(
    tabedgePayment,
    'succeeded',
    'admin'
  ),
  false
);

equal(
  'Verified provider may confirm TabEdge',
  transition(
    tabedgePayment,
    'succeeded',
    'verified_provider'
  ),
  true
);

equal(
  'Expired payment cannot directly succeed',
  transition(
    {
      ...tabedgePayment,
      status: 'expired',
    },
    'succeeded',
    'verified_provider'
  ),
  false
);

equal(
  'Late payment can enter review',
  transition(
    {
      ...tabedgePayment,
      status: 'expired',
    },
    'requires_review',
    'verified_provider'
  ),
  true
);

equal(
  'Customer can submit manual payment',
  transition(
    {
      ...bkashPayment,
      status: 'pending_payment',
    },
    'pending_verification',
    'customer'
  ),
  true
);

console.log(
  '\n===== BKASH SUBMISSION ====='
);

equal(
  'Local bKash number normalized',
  paymentLifecycle.normalizeBkashSenderNumber(
    '01712345678'
  ),
  '01712345678'
);

equal(
  'International bKash number normalized',
  paymentLifecycle.normalizeBkashSenderNumber(
    '+8801712345678'
  ),
  '01712345678'
);

equal(
  'Invalid sender number rejected',
  paymentLifecycle.normalizeBkashSenderNumber(
    '12345'
  ),
  null
);

equal(
  'Transaction reference normalized',
  paymentLifecycle.normalizeBkashTransactionId(
    ' abc123xyz '
  ),
  'ABC123XYZ'
);

equal(
  'Invalid transaction reference rejected',
  paymentLifecycle.normalizeBkashTransactionId(
    '../ABC123'
  ),
  null
);

test(
  'Customer cannot submit approval status',
  () => {
    assert.throws(
      () => paymentLifecycle.validateBkashSubmission({
        senderNumber: '01712345678',
        transactionId: 'ABC123XYZ',
        status: 'succeeded',
      }),
      /UNEXPECTED_BKASH_SUBMISSION_FIELD/
    );
  }
);

console.log(
  '\n===== PAYMENT EVIDENCE MATCHING ====='
);

const evidence = {
  provider: 'bkash_manual',
  currency: 'BDT',
  orderId: 'order-test',
  paymentId: 'payment-test',
  providerPaymentId: 'ABC123XYZ',
  amountMinor: 120000,
  verificationSource: 'admin',
};

const matches =
  paymentLifecycle.matchesVerifiedPaymentEvidence;

equal(
  'Matching bKash evidence accepted',
  matches(
    bkashPayment,
    evidence
  ),
  true
);

equal(
  'Incorrect amount rejected',
  matches(
    bkashPayment,
    {
      ...evidence,
      amountMinor: 100000,
    }
  ),
  false
);

equal(
  'Incorrect currency rejected',
  matches(
    bkashPayment,
    {
      ...evidence,
      currency: 'USD',
    }
  ),
  false
);

equal(
  'Incorrect order rejected',
  matches(
    bkashPayment,
    {
      ...evidence,
      orderId: 'another-order',
    }
  ),
  false
);

equal(
  'Incorrect payment ID rejected',
  matches(
    bkashPayment,
    {
      ...evidence,
      paymentId: 'another-payment',
    }
  ),
  false
);

equal(
  'Incorrect verification source rejected',
  matches(
    bkashPayment,
    {
      ...evidence,
      verificationSource: 'verified_provider',
    }
  ),
  false
);

const submission = {
  provider: 'bkash_manual',
  currency: 'BDT',
  paymentId: 'payment-test',
  orderId: 'order-test',
  senderNumber: '01712345678',
  transactionId: 'ABC123XYZ',
  claimedAmountMinor: 120000,
  status: 'pending_verification',
};

equal(
  'Matching manual submission accepted',
  paymentLifecycle.matchesBkashSubmission(
    bkashPayment,
    submission,
    evidence
  ),
  true
);

equal(
  'Wrong transaction reference rejected',
  paymentLifecycle.matchesBkashSubmission(
    bkashPayment,
    {
      ...submission,
      transactionId: 'XYZ123ABC',
    },
    evidence
  ),
  false
);

console.log(
  '\n===== REFUND VALIDATION ====='
);

const refundable = {
  status: 'partially_refunded',
  amountMinor: 120000,
  refundedAmountMinor: 20000,
};

equal(
  'Remaining refundable amount correct',
  paymentLifecycle.getRemainingRefundableAmount(
    refundable
  ),
  100000
);

equal(
  'Valid partial refund accepted',
  paymentLifecycle.isValidRefundAmount(
    refundable,
    50000
  ),
  true
);

equal(
  'Excess refund rejected',
  paymentLifecycle.isValidRefundAmount(
    refundable,
    100001
  ),
  false
);

equal(
  'Pending payment cannot be refunded',
  paymentLifecycle.getRemainingRefundableAmount({
    ...refundable,
    status: 'pending_payment',
  }),
  0
);

test(
  'Corrupt refund balance rejected',
  () => {
    assert.throws(
      () => paymentLifecycle.getRemainingRefundableAmount({
        ...refundable,
        refundedAmountMinor: 130000,
      }),
      /INVALID_PAYMENT_REFUND_BALANCE/
    );
  }
);

console.log(
  '\n===== FOUNDATION TEST SUMMARY ====='
);

console.log('Passed:', passed);
console.log('Failed:', failed);
console.log('Total:', passed + failed);

if (failed > 0) {
  process.exitCode = 1;
}
