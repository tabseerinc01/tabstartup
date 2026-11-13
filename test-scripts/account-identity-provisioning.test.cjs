require('./identity-runtime-loader.cjs');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deleteApp } = require('firebase-admin/app');
const { FieldValue } = require('firebase-admin/firestore');

const {
  getFirebaseAdmin,
} = require('../src/firebase/admin.ts');

const {
  provisionLegacyAccountIdentity,
} = require('../src/services/account-identity-provisioning.service.ts');

async function main() {
  const {
    adminApp,
    adminAuth,
    adminDb,
  } = getFirebaseAdmin();

  assert.equal(
    adminApp.options.projectId,
    'demo-tabstartup'
  );

  const prefix =
    'identity_provision_test_' +
    randomUUID().replace(/-/g, '');

  const fixtures = [];
  const authUsers = [];

  let passed = 0;

  function pass(name) {
    passed++;
    console.log('PASS: ' + name);
  }

  async function seed(name, options = {}) {
    const uid = prefix + '_' + name;

    const email = uid + '@example.com';

    const identityRef = adminDb
      .collection('accountIdentities').doc(uid);

    const startupRef = adminDb
      .collection('users').doc(uid);

    fixtures.push(identityRef, startupRef);

    if (options.auth !== false) {
      await adminAuth.createUser({
        uid,
        ...(options.noEmail ? {} : { email }),
        disabled: options.disabled === true,
      });

      authUsers.push(uid);
    }

    if (options.startup !== false) {
      await startupRef.set({
        uid,
        email: 'legacy-' + email,
        status: 'active',
        role: 'founder',
        roles: ['founder'],
        ...options.startup,
      });
    }

    if (options.identity) {
      await identityRef.set({
        uid,
        email,
        status: 'active',
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...options.identity,
      });
    }

    return {
      uid,
      email,
      identityRef,
      startupRef,
    };
  }

  async function verifyBlocked(
    name,
    options,
    expectedError
  ) {
    const fixture = await seed(name, options);

    const before = await fixture.identityRef.get();

    await assert.rejects(
      () => provisionLegacyAccountIdentity(
        fixture.uid
      ),
      expectedError
    );

    const after = await fixture.identityRef.get();

    assert.equal(after.exists, before.exists);

    if (before.exists) {
      assert.deepEqual(
        after.data(),
        before.data()
      );
    }

    pass(name);
  }

  try {
    const active = await seed('active_legacy');

    const startupBefore =
      await active.startupRef.get();

    const first =
      await provisionLegacyAccountIdentity(
        active.uid
      );

    assert.deepEqual(first, {
      uid: active.uid,
      status: 'active',
      created: true,
    });

    const created =
      await active.identityRef.get();

    assert.equal(created.exists, true);
    assert.equal(created.data().uid, active.uid);
    assert.equal(created.data().email, active.email);
    assert.equal(created.data().status, 'active');
    assert.equal(created.data().schemaVersion, 1);
    assert.ok(created.data().createdAt);
    assert.ok(created.data().updatedAt);

    const startupAfter =
      await active.startupRef.get();

    assert.deepEqual(
      startupAfter.data(),
      startupBefore.data()
    );

    pass('active_legacy_identity_created');

    const repeated =
      await provisionLegacyAccountIdentity(
        active.uid
      );

    assert.deepEqual(repeated, {
      uid: active.uid,
      status: 'active',
      created: false,
    });

    const unchanged =
      await active.identityRef.get();

    assert.deepEqual(
      unchanged.data(),
      created.data()
    );

    pass('repeated_provisioning_idempotent');

    const concurrent = await seed('concurrent');

    const results = await Promise.all(
      Array.from(
        { length: 5 },
        () => provisionLegacyAccountIdentity(
          concurrent.uid
        )
      )
    );

    assert.equal(
      results.filter(r => r.created).length,
      1
    );

    assert.equal(
      results.filter(r => !r.created).length,
      4
    );

    for (const result of results) {
      assert.equal(result.uid, concurrent.uid);
      assert.equal(result.status, 'active');
    }

    assert.equal(
      (await concurrent.identityRef.get()).exists,
      true
    );

    pass('concurrent_provisioning_single_creation');

    await verifyBlocked(
      'suspended_legacy',
      {
        startup: { status: 'suspended' },
      },
      /LEGACY_ACCOUNT_SUSPENDED/
    );

    await verifyBlocked(
      'disabled_auth',
      { disabled: true },
      /ACCOUNT_DISABLED/
    );

    await verifyBlocked(
      'auth_without_email',
      { noEmail: true },
      /ACCOUNT_EMAIL_REQUIRED/
    );

    await verifyBlocked(
      'auth_only_account',
      { startup: false },
      /STARTUP_PROFILE_REQUIRED/
    );

    await verifyBlocked(
      'nonexistent_auth',
      { auth: false },
      error => error.code === 'auth/user-not-found'
    );

    await verifyBlocked(
      'legacy_uid_mismatch',
      {
        startup: { uid: 'incorrect_uid' },
      },
      /INVALID_STARTUP_PROFILE/
    );

    await verifyBlocked(
      'invalid_legacy_status',
      {
        startup: { status: 'invalid' },
      },
      /INVALID_LEGACY_ACCOUNT_STATUS/
    );

    const suspended = await seed(
      'existing_suspended',
      {
        identity: { status: 'suspended' },
      }
    );

    const suspendedBefore =
      await suspended.identityRef.get();

    const suspendedResult =
      await provisionLegacyAccountIdentity(
        suspended.uid
      );

    assert.deepEqual(suspendedResult, {
      uid: suspended.uid,
      status: 'suspended',
      created: false,
    });

    assert.deepEqual(
      (await suspended.identityRef.get()).data(),
      suspendedBefore.data()
    );

    pass('existing_global_suspension_preserved');

    const legacySuspended = await seed(
      'existing_legacy_suspended',
      {
        identity: {},
        startup: { status: 'suspended' },
      }
    );

    const legacyBefore =
      await legacySuspended.identityRef.get();

    const legacyResult =
      await provisionLegacyAccountIdentity(
        legacySuspended.uid
      );

    assert.deepEqual(legacyResult, {
      uid: legacySuspended.uid,
      status: 'suspended',
      created: false,
    });

    assert.deepEqual(
      (await legacySuspended.identityRef.get()).data(),
      legacyBefore.data()
    );

    pass('existing_identity_legacy_suspension');

    await verifyBlocked(
      'malformed_existing_identity',
      {
        identity: { schemaVersion: 999 },
      },
      /INVALID_ACCOUNT_IDENTITY/
    );

    for (const uid of [
      '',
      ' ',
      'invalid/uid',
      '.',
      '..',
      'x'.repeat(129),
      null,
    ]) {
      await assert.rejects(
        () => provisionLegacyAccountIdentity(uid),
        /INVALID.*UID/
      );
    }

    pass('invalid_uid_inputs');

    console.log('\nTOTAL PASSED: ' + passed);

  } finally {
    const cleanupErrors = [];

    try {
      if (fixtures.length > 0) {
        const batch = adminDb.batch();

        for (const ref of fixtures) {
          batch.delete(ref);
        }

        await batch.commit();

        console.log(
          'CLEANUP: Firestore test documents removed.'
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    for (const uid of authUsers) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length === 0) {
      console.log(
        'CLEANUP: Auth test accounts removed.'
      );
    }

    await deleteApp(adminApp);

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        'Test cleanup failed'
      );
    }
  }
}

main().catch(error => {
  console.error('FAILED:', error);
  process.exitCode = 1;
});
