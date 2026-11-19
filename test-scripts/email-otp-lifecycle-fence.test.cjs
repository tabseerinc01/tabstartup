'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

const UID = 'lifecycle-test-user';
const COLLECTION = 'accountIdentities';

const cache = new Map();

const allowedSources = new Set([
  'src/services/email/email-otp-lifecycle-fence.service.ts',
  'src/services/account-suspension-guard.service.ts',
  'src/services/account-identity.service.ts',
  'src/lib/account-identity.ts',
]);

function loadSource(relativeFile) {
  assert.ok(
    allowedSources.has(relativeFile),
    'UNEXPECTED_SOURCE: ' + relativeFile
  );

  if (cache.has(relativeFile)) {
    return cache.get(relativeFile).exports;
  }

  const source = fs.readFileSync(
    path.join(ROOT, relativeFile),
    'utf8'
  );

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
    fileName: relativeFile,
  }).outputText;

  const module = { exports: {} };

  cache.set(relativeFile, module);

  function localRequire(name) {
    if (name === 'server-only') {
      return {};
    }

    if (
      name === '@/lib/account-identity'
    ) {
      return {
        ACCOUNT_IDENTITIES_COLLECTION:
          COLLECTION,
      };
    }

    if (
      name ===
      '@/services/account-identity.service'
    ) {
      return {
        assertValidAccountUid(uid) {
          if (
            typeof uid !== 'string' ||
            !uid ||
            uid.includes('/')
          ) {
            throw new Error('INVALID_UID');
          }
        },
      };
    }

    if (
      name ===
      '@/services/account-suspension-guard.service'
    ) {
      return {
        assertGlobalAccountNotSuspended(
          uid,
          snapshot
        ) {
          assert.equal(uid, UID);

          if (
            snapshot.exists &&
            snapshot.data().status !== 'active'
          ) {
            throw new Error('ACCOUNT_SUSPENDED');
          }
        },
      };
    }

    throw new Error(
      'UNEXPECTED_DEPENDENCY: ' + name
    );
  }

  new Function(
    'require',
    'module',
    'exports',
    compiled
  )(
    localRequire,
    module,
    module.exports
  );

  return module.exports;
}

const {
  captureEmailOtpLifecycleFence,
  assertEmailOtpLifecycleFence,
} = loadSource(
  'src/services/email/email-otp-lifecycle-fence.service.ts'
);

function snapshot(options = {}) {
  const exists = options.exists ?? true;

  return {
    id: options.id ?? UID,

    ref: {
      path:
        options.path ??
        COLLECTION + '/' + UID,
    },

    exists,

    updateTime:
      'updateTime' in options
        ? options.updateTime
        : exists
          ? {
              seconds: 1800000000,
              nanoseconds: 123456789,
            }
          : undefined,

    data() {
      return exists
        ? {
            uid: UID,
            status:
              options.status ?? 'active',
          }
        : undefined;
    },
  };
}

test('01 captures exact identity version', () => {
  assert.equal(
    captureEmailOtpLifecycleFence(
      UID,
      snapshot()
    ),
    '1800000000:123456789'
  );
});

test('02 accepts matching lifecycle fence', () => {
  assert.doesNotThrow(() =>
    assertEmailOtpLifecycleFence(
      UID,
      '1800000000:123456789',
      snapshot()
    )
  );
});

test('03 rejects changed nanosecond version', () => {
  assert.throws(
    () =>
      assertEmailOtpLifecycleFence(
        UID,
        '1800000000:123456789',
        snapshot({
          updateTime: {
            seconds: 1800000000,
            nanoseconds: 123456790,
          },
        })
      ),
    /EMAIL_OTP_AUTH_REFRESH_REQUIRED/
  );
});

test('04 rejects changed seconds version', () => {
  assert.throws(
    () =>
      assertEmailOtpLifecycleFence(
        UID,
        '1800000000:123456789',
        snapshot({
          updateTime: {
            seconds: 1800000001,
            nanoseconds: 123456789,
          },
        })
      ),
    /EMAIL_OTP_AUTH_REFRESH_REQUIRED/
  );
});

test('05 rejects suspended identity', () => {
  assert.throws(
    () =>
      captureEmailOtpLifecycleFence(
        UID,
        snapshot({
          status: 'suspended',
        })
      ),
    /ACCOUNT_SUSPENDED/
  );
});

test('06 rejects old fence after reactivation', () => {
  const original =
    captureEmailOtpLifecycleFence(
      UID,
      snapshot()
    );

  const reactivated = snapshot({
    status: 'active',
    updateTime: {
      seconds: 1800000002,
      nanoseconds: 0,
    },
  });

  assert.throws(
    () =>
      assertEmailOtpLifecycleFence(
        UID,
        original,
        reactivated
      ),
    /EMAIL_OTP_AUTH_REFRESH_REQUIRED/
  );
});

test('07 captures missing legacy identity', () => {
  assert.equal(
    captureEmailOtpLifecycleFence(
      UID,
      snapshot({
        exists: false,
      })
    ),
    'missing'
  );
});

test('08 accepts unchanged missing identity', () => {
  assert.doesNotThrow(() =>
    assertEmailOtpLifecycleFence(
      UID,
      'missing',
      snapshot({
        exists: false,
      })
    )
  );
});

test('09 rejects missing-to-created transition', () => {
  assert.throws(
    () =>
      assertEmailOtpLifecycleFence(
        UID,
        'missing',
        snapshot()
      ),
    /EMAIL_OTP_AUTH_REFRESH_REQUIRED/
  );
});

test('10 rejects existing-to-missing transition', () => {
  assert.throws(
    () =>
      assertEmailOtpLifecycleFence(
        UID,
        '1800000000:123456789',
        snapshot({
          exists: false,
        })
      ),
    /EMAIL_OTP_AUTH_REFRESH_REQUIRED/
  );
});

test('11 rejects wrong document ID', () => {
  assert.throws(
    () =>
      captureEmailOtpLifecycleFence(
        UID,
        snapshot({
          id: 'different-user',
        })
      ),
    /EMAIL_OTP_LIFECYCLE_PATH_MISMATCH/
  );
});

test('12 rejects wrong document path', () => {
  assert.throws(
    () =>
      captureEmailOtpLifecycleFence(
        UID,
        snapshot({
          path: 'users/' + UID,
        })
      ),
    /EMAIL_OTP_LIFECYCLE_PATH_MISMATCH/
  );
});

test('13 rejects missing updateTime', () => {
  assert.throws(
    () =>
      captureEmailOtpLifecycleFence(
        UID,
        snapshot({
          updateTime: undefined,
        })
      ),
    /INVALID_EMAIL_OTP_LIFECYCLE_VERSION/
  );
});

test('14 rejects invalid seconds', () => {
  for (const seconds of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () =>
        captureEmailOtpLifecycleFence(
          UID,
          snapshot({
            updateTime: {
              seconds,
              nanoseconds: 0,
            },
          })
        ),
      /INVALID_EMAIL_OTP_LIFECYCLE_VERSION/
    );
  }
});

test('15 rejects invalid nanoseconds', () => {
  for (const nanoseconds of [
    -1,
    0.5,
    1000000000,
    NaN,
    Infinity,
  ]) {
    assert.throws(
      () =>
        captureEmailOtpLifecycleFence(
          UID,
          snapshot({
            updateTime: {
              seconds: 1800000000,
              nanoseconds,
            },
          })
        ),
      /INVALID_EMAIL_OTP_LIFECYCLE_VERSION/
    );
  }
});

test('16 rejects malformed expected fences', () => {
  for (const fence of [
    '',
    null,
    undefined,
    123,
    {},
    'invalid',
    '0:000000000',
    '1800000000:123',
    '1800000000:1234567890',
  ]) {
    assert.throws(
      () =>
        assertEmailOtpLifecycleFence(
          UID,
          fence,
          snapshot()
        ),
      /INVALID_EMAIL_OTP_LIFECYCLE_FENCE/
    );
  }
});

test('17 preserves nanosecond zero padding', () => {
  assert.equal(
    captureEmailOtpLifecycleFence(
      UID,
      snapshot({
        updateTime: {
          seconds: 1800000000,
          nanoseconds: 7,
        },
      })
    ),
    '1800000000:000000007'
  );
});

test('18 rejects suspended identity even with matching fence', () => {
  assert.throws(
    () =>
      assertEmailOtpLifecycleFence(
        UID,
        '1800000000:123456789',
        snapshot({
          status: 'suspended',
        })
      ),
    /ACCOUNT_SUSPENDED/
  );
});

// These are known unresolved lifecycle limitations.
// TODO cases must not be counted as security passes.

test.todo(
  '19 detect missing-created-deleted identity ABA'
);

test.todo(
  '20 detect Firebase Auth email away-and-back'
);

test.todo(
  '21 detect same UID recreation within timestamp precision'
);
