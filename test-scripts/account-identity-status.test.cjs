require('./identity-runtime-loader.cjs');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deleteApp } = require('firebase-admin/app');
const { FieldValue } = require('firebase-admin/firestore');

const {
  getFirebaseAdmin,
} = require('../src/firebase/admin.ts');

const {
  setGlobalAccountStatus,
} = require('../src/services/account-identity-status.service.ts');

const {
  resolveAccountIdentity,
} = require('../src/services/account-identity.service.ts');

async function main() {
  const { adminApp, adminDb } = getFirebaseAdmin();

  assert.equal(
    adminApp.options.projectId,
    'demo-tabstartup'
  );

  const prefix =
    'identity_status_test_' +
    randomUUID().replace(/-/g, '');

  const fixtures = [];
  let passed = 0;

  function pass(name) {
    passed++;
    console.log('PASS: ' + name);
  }

  async function seed(name, options = {}) {
    const uid = prefix + '_' + name;

    const identityRef = adminDb
      .collection('accountIdentities').doc(uid);

    const startupRef = adminDb
      .collection('users').doc(uid);

    const eventOrganizerRef = adminDb
      .collection('eventOrganizerProfiles').doc(uid);

    const publicRef = adminDb
      .collection('publicProfiles').doc(uid);

    const professionalRefs = [
      'founder',
      'investor',
      'mentor',
    ].map(role => adminDb
      .collection('professionalProfiles')
      .doc(role + '_' + uid)
    );

    fixtures.push(
      identityRef,
      startupRef,
      eventOrganizerRef,
      publicRef,
      ...professionalRefs
    );

    const batch = adminDb.batch();

    if (options.identity !== false) {
      batch.set(identityRef, {
        uid,
        email: uid + '@example.com',
        status: 'active',
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...options.identity,
      });
    }

    if (options.startup) {
      batch.set(startupRef, {
        uid,
        role: 'founder',
        roles: ['founder'],
        status: 'active',
        ...options.startup,
      });
    }

    if (options.eventOrganizer) {
      batch.set(eventOrganizerRef, {
        uid,
        ...options.eventOrganizer,
      });
    }

    if (options.publications === true) {
      batch.set(publicRef, {
        uid,
        roles: ['founder', 'investor', 'mentor'],
      });

      for (const document of professionalRefs) {
        batch.set(document, {
          uid,
          role: document.id.split('_')[0],
          schemaVersion: 1,
          visibility: 'public',
          status: 'published',
        });
      }
    }

    await batch.commit();

    return {
      uid,
      identityRef,
      startupRef,
      eventOrganizerRef,
      publicRef,
      professionalRefs,
    };
  }

  async function assertNoPublication(fixture) {
    const snapshots = await Promise.all([
      fixture.publicRef.get(),
      ...fixture.professionalRefs.map(
        document => document.get()
      ),
    ]);

    for (const snapshot of snapshots) {
      assert.equal(
        snapshot.exists,
        false,
        'Unexpected publication: ' + snapshot.ref.path
      );
    }
  }

  async function verifyBlocked(
    name,
    options,
    requestedStatus,
    expectedError
  ) {
    const fixture = await seed(name, options);

    const before = await fixture.identityRef.get();

    await assert.rejects(
      () => setGlobalAccountStatus(
        fixture.uid,
        requestedStatus
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
    const active = await seed('active_account', {
      startup: {},
      publications: true,
    });

    const original =
      await active.identityRef.get();

    const suspended =
      await setGlobalAccountStatus(
        active.uid,
        'suspended'
      );

    assert.deepEqual(suspended, {
      uid: active.uid,
      previousStatus: 'active',
      status: 'suspended',
      effectiveStatus: 'suspended',
      changed: true,
    });

    const storedSuspended =
      await active.identityRef.get();

    assert.equal(
      storedSuspended.data().status,
      'suspended'
    );

    assert.deepEqual(
      storedSuspended.data().createdAt,
      original.data().createdAt
    );

    assert.equal(
      (await resolveAccountIdentity(active.uid)).status,
      'suspended'
    );

    await assertNoPublication(active);

    pass('active_identity_suspended');
    pass('global_suspension_removes_all_publications');

    const reactivated =
      await setGlobalAccountStatus(
        active.uid,
        'active'
      );

    assert.deepEqual(reactivated, {
      uid: active.uid,
      previousStatus: 'suspended',
      status: 'active',
      effectiveStatus: 'active',
      changed: true,
    });

    assert.equal(
      (await resolveAccountIdentity(active.uid)).status,
      'active'
    );

    await assertNoPublication(active);

    pass('suspended_identity_reactivated');
    pass('global_reactivation_does_not_republish');

    const beforeRepeat =
      await active.identityRef.get();

    const repeated =
      await setGlobalAccountStatus(
        active.uid,
        'active'
      );

    assert.equal(repeated.changed, false);
    assert.equal(repeated.effectiveStatus, 'active');

    assert.deepEqual(
      (await active.identityRef.get()).data(),
      beforeRepeat.data()
    );

    await assertNoPublication(active);

    pass('repeated_status_update_idempotent');

    const legacy = await seed(
      'legacy_suspended',
      {
        identity: { status: 'suspended' },
        startup: { status: 'suspended' },
        publications: true,
      }
    );

    const legacyBefore =
      await legacy.startupRef.get();

    const legacyResult =
      await setGlobalAccountStatus(
        legacy.uid,
        'active'
      );

    assert.equal(legacyResult.status, 'active');

    assert.equal(
      legacyResult.effectiveStatus,
      'suspended'
    );

    assert.equal(
      (await resolveAccountIdentity(legacy.uid)).status,
      'suspended'
    );

    assert.deepEqual(
      (await legacy.startupRef.get()).data(),
      legacyBefore.data()
    );

    await assertNoPublication(legacy);

    pass('legacy_suspension_preserved');

    const eventOrganizer = await seed(
      'event_organizer_only',
      {
        eventOrganizer: {},
      }
    );

    const eventOrganizerBefore =
      await eventOrganizer.eventOrganizerRef.get();

    const eventOrganizerResult =
      await setGlobalAccountStatus(
        eventOrganizer.uid,
        'suspended'
      );

    assert.equal(
      eventOrganizerResult.effectiveStatus,
      'suspended'
    );

    assert.equal(
      (await eventOrganizer.startupRef.get()).exists,
      false
    );

    assert.deepEqual(
      (await eventOrganizer.eventOrganizerRef.get()).data(),
      eventOrganizerBefore.data()
    );

    pass('event_organizer_only_status_updated');

    const dual = await seed('dual_profiles', {
      startup: {},
      eventOrganizer: {},
      publications: true,
    });

    const startupBefore =
      await dual.startupRef.get();

    const organizerBefore =
      await dual.eventOrganizerRef.get();

    await setGlobalAccountStatus(
      dual.uid,
      'suspended'
    );

    const dualResult =
      await resolveAccountIdentity(dual.uid);

    assert.equal(dualResult.status, 'suspended');

    assert.deepEqual(dualResult.profiles, {
      hasStartupProfile: true,
      hasEventOrganizerProfile: true,
    });

    assert.deepEqual(
      (await dual.startupRef.get()).data(),
      startupBefore.data()
    );

    assert.deepEqual(
      (await dual.eventOrganizerRef.get()).data(),
      organizerBefore.data()
    );

    await assertNoPublication(dual);

    pass('dual_profiles_preserved');

    await verifyBlocked(
      'missing_identity',
      { identity: false, startup: {} },
      'suspended',
      /ACCOUNT_IDENTITY_NOT_FOUND/
    );

    await verifyBlocked(
      'invalid_identity_uid',
      { identity: { uid: 'incorrect_uid' } },
      'suspended',
      /INVALID_ACCOUNT_IDENTITY/
    );

    await verifyBlocked(
      'invalid_schema_version',
      { identity: { schemaVersion: 999 } },
      'suspended',
      /INVALID_ACCOUNT_IDENTITY/
    );

    await verifyBlocked(
      'invalid_existing_status',
      { identity: { status: 'unknown' } },
      'suspended',
      /INVALID_ACCOUNT_IDENTITY/
    );

    await verifyBlocked(
      'invalid_requested_status',
      {},
      'unknown',
      /INVALID_ACCOUNT_STATUS/
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
        () => setGlobalAccountStatus(
          uid,
          'suspended'
        ),
        /INVALID.*UID/
      );
    }

    pass('invalid_uid_inputs');

    const concurrent = await seed(
      'concurrent_suspension',
      {
        startup: {},
        publications: true,
      }
    );

    const results = await Promise.all(
      Array.from(
        { length: 5 },
        () => setGlobalAccountStatus(
          concurrent.uid,
          'suspended'
        )
      )
    );

    assert.equal(
      results.filter(r => r.changed).length,
      1
    );

    assert.equal(
      results.filter(r => !r.changed).length,
      4
    );

    for (const result of results) {
      assert.equal(
        result.effectiveStatus,
        'suspended'
      );
    }

    assert.equal(
      (await concurrent.identityRef.get()).data().status,
      'suspended'
    );

    await assertNoPublication(concurrent);

    pass('concurrent_suspension_single_change');

    console.log('\nTOTAL PASSED: ' + passed);

  } finally {
    try {
      if (fixtures.length > 0) {
        const cleanup = adminDb.batch();

        for (const ref of fixtures) {
          cleanup.delete(ref);
        }

        await cleanup.commit();

        console.log(
          'CLEANUP: Test documents removed.'
        );
      }
    } finally {
      await deleteApp(adminApp);
    }
  }
}

main().catch(error => {
  console.error('FAILED:', error);
  process.exitCode = 1;
});
