const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const {
  Timestamp,
} = require('firebase-admin/firestore');

const ROOT = path.resolve(__dirname, '..');

const UID = 'verification-test-user';
const EMAIL = 'verification@example.test';

const CREATED =
  '2026-01-01T00:00:00.000Z';

const CHALLENGE_ID = 'a'.repeat(64);

const cache = new Map();

function forbidden() {
  throw new Error('FORBIDDEN_EXTERNAL_OPERATION');
}

// Strictly offline source loader.
// Never load the actual Firebase Admin initializer,
// delivery provider, or authentication services.
function loadSource(relativeFile) {
  const file = path.resolve(ROOT, relativeFile);

  if (cache.has(file)) {
    return cache.get(file);
  }

  const allowed = [
    'src/lib/email-verification.ts',
    'src/lib/professional-profile-validation.ts',
    'src/services/email/account-email-verification-schema.ts',
    'src/services/email/account-email-verification.service.ts',
    'src/services/email/email-verification-transaction.service.ts',
  ];

  assert.ok(
    allowed.includes(
      path.relative(ROOT, file)
    ),
    'UNAPPROVED_SOURCE: ' + relativeFile
  );

  const source = fs.readFileSync(file, 'utf8');

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = { exports: {} };

  function localRequire(name) {
    if (name === 'server-only') {
      return {};
    }

    if (name === 'firebase-admin/firestore') {
      return { Timestamp };
    }

    if (name === '@/firebase/admin') {
      return { getFirebaseAdmin: forbidden };
    }

    if (
      name ===
      '@/services/account-identity.service'
    ) {
      return {
        assertValidAccountUid(uid) {
          assert.equal(uid, UID);
        },
      };
    }

    if (name === '@/lib/account-identity') {
      return {
        ACCOUNT_IDENTITIES_COLLECTION:
          'accountIdentities',
      };
    }

    if (
      name ===
      '@/services/account-suspension-guard.service'
    ) {
      return {
        assertGlobalAccountNotSuspended: forbidden,
        isGlobalAccountEligible: forbidden,
      };
    }

    if (name === '@/lib/legacy-startup-profile') {
      return {
        resolveLegacyStartupStatus: forbidden,
      };
    }

    if (
      name.endsWith(
        'email-otp-account.service'
      )
    ) {
      return {
        requireEmailOtpAccount: forbidden,
      };
    }

    if (
      name.endsWith(
        'email-otp-crypto.service'
      )
    ) {
      return {
        isEmailOtpEnabled: () => true,
      };
    }

    if (
      name.endsWith(
        'email-otp-lifecycle-fence.service'
      )
    ) {
      return {
        assertEmailOtpLifecycleFence: forbidden,
        captureEmailOtpLifecycleFence: forbidden,
      };
    }

    let target;

    if (name.startsWith('@/')) {
      target = 'src/' + name.slice(2) + '.ts';
    } else if (name.startsWith('./')) {
      target = path.relative(
        ROOT,
        path.resolve(
          path.dirname(file),
          name + '.ts'
        )
      );
    } else {
      throw new Error(
        'UNEXPECTED_DEPENDENCY: ' + name
      );
    }

    return loadSource(target);
  }

  new Function(
    'require',
    'module',
    'exports',
    compiled
  )(
    localRequire,
    mod,
    mod.exports
  );

  cache.set(file, mod.exports);

  return mod.exports;
}

const {
  createAccountEmailVerification,
} = loadSource(
  'src/services/email/account-email-verification-schema.ts'
);

const {
  evaluateEffectiveEmailVerification,
} = loadSource(
  'src/services/email/account-email-verification.service.ts'
);

const {
  readTransactionalEmailVerification,
  isCustomEmailVerificationPublicationReady,
} = loadSource(
  'src/services/email/email-verification-transaction.service.ts'
);

function authUser(overrides = {}) {
  return {
    uid: UID,
    email: EMAIL,
    emailVerified: false,
    disabled: false,
    metadata: {
      creationTime: CREATED,
    },
    ...overrides,
  };
}

function authority(overrides = {}) {
  return {
    ...createAccountEmailVerification({
      uid: UID,
      email: EMAIL,
      authAccountCreatedAt: CREATED,
      challengeId: CHALLENGE_ID,
      nowMs: Date.now() - 1000,
    }),
    ...overrides,
  };
}

function evaluate(record, overrides = {}) {
  return evaluateEffectiveEmailVerification({
    uid: UID,
    authUser: authUser(),
    accountActive: true,
    authorityRecord: record,
    nowMs: Date.now(),
    ...overrides,
  });
}

function harness(options = {}) {
  let reads = 0;
  let writeQueued = false;

  const ref = {
    id: UID,
    path: 'accountEmailVerifications/' + UID,
    get: forbidden,
  };

  const db = {
    collection(name) {
      assert.equal(
        name,
        'accountEmailVerifications'
      );

      return {
        doc(uid) {
          assert.equal(uid, UID);
          return ref;
        },
      };
    },
    runTransaction: forbidden,
  };

  const transaction = {
    async get(document) {
      assert.equal(document, ref);

      if (writeQueued) {
        throw new Error('READ_AFTER_WRITE');
      }

      reads++;

      if (options.readFailure) {
        throw new Error('AUTHORITY_READ_FAILED');
      }

      return {
        id: options.snapshotId || UID,
        ref: {
          path: options.snapshotPath || ref.path,
        },
        exists: options.record != null,
        data: () => options.record,
      };
    },

    set: forbidden,
    update: forbidden,
    delete: forbidden,
    create: forbidden,
  };

  return {
    get reads() {
      return reads;
    },

    queueWrite() {
      writeQueued = true;
    },

    async resolve(overrides = {}) {
      return readTransactionalEmailVerification({
        transaction,
        db,
        uid: UID,
        authUser: authUser(),
        accountActive: true,
        ...overrides,
      });
    },
  };
}

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

test('native verified account remains supported', async () => {
  const h = harness();

  const result = await h.resolve({
    authUser: authUser({
      emailVerified: true,
    }),
  });

  assert.equal(result.emailVerified, true);
  assert.equal(result.source, 'firebase_auth');
  assert.equal(h.reads, 1);
});

test('native verification survives malformed custom authority', async () => {
  const h = harness({
    record: { invalid: true },
  });

  const result = await h.resolve({
    authUser: authUser({
      emailVerified: true,
    }),
  });

  assert.equal(result.emailVerified, true);
  assert.equal(result.source, 'firebase_auth');
});

test('missing authority does not verify account', async () => {
  const h = harness();

  const result = await h.resolve();

  assert.equal(result.emailVerified, false);
  assert.equal(result.reason, 'verification_missing');
});

test('valid custom authority is recognized by actual evaluator', () => {
  const result = evaluate(authority());

  assert.equal(result.emailVerified, true);
  assert.equal(result.source, 'tabstartup_otp');
});

test('custom authority cannot bypass publication gate', async () => {
  assert.equal(
    isCustomEmailVerificationPublicationReady(),
    false
  );

  const h = harness({
    record: authority(),
  });

  const result = await h.resolve();

  assert.equal(result.emailVerified, false);

  assert.equal(
    result.reason,
    'publication_authority_disabled'
  );

  assert.equal(h.reads, 1);
});

test('revoked authority is rejected', () => {
  const now = Timestamp.now();

  const result = evaluate(
    authority({
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    })
  );

  assert.equal(result.emailVerified, false);
  assert.equal(result.reason, 'verification_revoked');
});

test('malformed authority is rejected', () => {
  const result = evaluate({
    schemaVersion: 999,
  });

  assert.equal(result.emailVerified, false);
  assert.equal(result.reason, 'verification_invalid');
});

test('different email binding is rejected', () => {
  const result = evaluate(
    authority({
      verifiedEmail: 'other@example.test',
    })
  );

  assert.equal(result.emailVerified, false);
  assert.equal(result.reason, 'authority_binding_mismatch');
});

test('different account lifecycle is rejected', () => {
  const result = evaluate(
    authority({
      authAccountCreatedAt:
        '2025-12-31T00:00:00.000Z',
    })
  );

  assert.equal(result.emailVerified, false);
  assert.equal(result.reason, 'authority_binding_mismatch');
});

test('disabled account is rejected before authority read', async () => {
  const h = harness({
    record: authority(),
  });

  const result = await h.resolve({
    authUser: authUser({
      disabled: true,
      emailVerified: true,
    }),
  });

  assert.equal(result.emailVerified, false);
  assert.equal(result.reason, 'account_not_active');
  assert.equal(h.reads, 0);
});

test('inactive account is rejected before authority read', async () => {
  const h = harness({
    record: authority(),
  });

  const result = await h.resolve({
    accountActive: false,
  });

  assert.equal(result.emailVerified, false);
  assert.equal(h.reads, 0);
});

test('missing Auth account is rejected', async () => {
  const h = harness();

  const result = await h.resolve({
    authUser: null,
  });

  assert.equal(result.emailVerified, false);
  assert.equal(h.reads, 0);
});

test('mismatched Auth UID is rejected', async () => {
  const h = harness();

  const result = await h.resolve({
    authUser: authUser({
      uid: 'different-user',
      emailVerified: true,
    }),
  });

  assert.equal(result.emailVerified, false);
  assert.equal(h.reads, 0);
});

test('authority read failure propagates safely', async () => {
  const h = harness({
    readFailure: true,
  });

  await assert.rejects(
    h.resolve(),
    /AUTHORITY_READ_FAILED/
  );
});

test('authority snapshot UID mismatch is rejected', async () => {
  const h = harness({
    snapshotId: 'different-user',
  });

  await assert.rejects(
    h.resolve(),
    /EMAIL_VERIFICATION_AUTHORITY_PATH_MISMATCH/
  );
});

test('authority snapshot path mismatch is rejected', async () => {
  const h = harness({
    snapshotPath: 'users/' + UID,
  });

  await assert.rejects(
    h.resolve(),
    /EMAIL_VERIFICATION_AUTHORITY_PATH_MISMATCH/
  );
});

test('read after queued write is rejected', async () => {
  const h = harness();

  h.queueWrite();

  await assert.rejects(
    h.resolve(),
    /READ_AFTER_WRITE/
  );
});

test('invalid active-account context is rejected', async () => {
  const h = harness();

  await assert.rejects(
    h.resolve({
      accountActive: 'true',
    }),
    /INVALID_TRANSACTION_VERIFICATION_CONTEXT/
  );
});

async function main() {
  let passed = 0;

  for (const entry of tests) {
    await entry.run();

    passed++;

    console.log('PASS:', entry.name);
  }

  console.log(
    'VERIFICATION REGRESSION TESTS:',
    passed + '/' + tests.length
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
