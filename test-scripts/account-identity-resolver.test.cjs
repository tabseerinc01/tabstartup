require('./identity-runtime-loader.cjs');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deleteApp } = require('firebase-admin/app');
const { FieldValue } = require('firebase-admin/firestore');

const {
  getFirebaseAdmin,
} = require('../src/firebase/admin.ts');

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
    'identity_resolver_test_' +
    randomUUID().replace(/-/g, '');

  const fixtures = [];
  let passed = 0;

  function pass(name) {
    passed++;
    console.log('PASS: ' + name);
  }

  async function seed(name, options = {}) {
    const uid = prefix + '_' + name;

    const refs = {
      identity: adminDb
        .collection('accountIdentities').doc(uid),
      startup: adminDb
        .collection('users').doc(uid),
      eventOrganizer: adminDb
        .collection('eventOrganizerProfiles').doc(uid),
    };

    fixtures.push(...Object.values(refs));

    const batch = adminDb.batch();

    if (options.identity) {
      batch.set(refs.identity, {
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
      batch.set(refs.startup, {
        uid,
        role: 'founder',
        roles: ['founder'],
        status: 'active',
        ...options.startup,
      });
    }

    if (options.eventOrganizer) {
      batch.set(refs.eventOrganizer, {
        uid,
        ...options.eventOrganizer,
      });
    }

    if (
      options.identity ||
      options.startup ||
      options.eventOrganizer
    ) {
      await batch.commit();
    }

    return uid;
  }

  async function verify(
    name,
    options,
    status,
    source,
    hasStartupProfile,
    hasEventOrganizerProfile
  ) {
    const uid = await seed(name, options);

    const result =
      await resolveAccountIdentity(uid);

    assert.equal(result.uid, uid);
    assert.equal(result.status, status);
    assert.equal(result.source, source);

    assert.deepEqual(result.profiles, {
      hasStartupProfile,
      hasEventOrganizerProfile,
    });

    pass(name);
  }

  try {
    await verify(
      'unknown_account',
      {},
      'unprovisioned',
      'unprovisioned',
      false,
      false
    );

    await verify(
      'legacy_active',
      { startup: {} },
      'active',
      'legacy_startup',
      true,
      false
    );

    await verify(
      'legacy_suspended',
      { startup: { status: 'suspended' } },
      'suspended',
      'legacy_startup',
      true,
      false
    );

    await verify(
      'legacy_invalid_status',
      { startup: { status: 'invalid' } },
      'unprovisioned',
      'unprovisioned',
      true,
      false
    );

    await verify(
      'global_active',
      { identity: {} },
      'active',
      'global_identity',
      false,
      false
    );

    await verify(
      'global_suspended',
      { identity: { status: 'suspended' } },
      'suspended',
      'global_identity',
      false,
      false
    );

    await verify(
      'legacy_suspension_preserved',
      {
        identity: {},
        startup: { status: 'suspended' },
      },
      'suspended',
      'global_identity',
      true,
      false
    );

    await verify(
      'global_suspension_preserved',
      {
        identity: { status: 'suspended' },
        startup: {},
      },
      'suspended',
      'global_identity',
      true,
      false
    );

    await verify(
      'event_organizer_only',
      {
        identity: {},
        eventOrganizer: {},
      },
      'active',
      'global_identity',
      false,
      true
    );

    await verify(
      'dual_profiles',
      {
        identity: {},
        startup: {},
        eventOrganizer: {},
      },
      'active',
      'global_identity',
      true,
      true
    );

    const invalidIdentities = [
      [
        'identity_uid_mismatch',
        { uid: 'incorrect_uid' },
      ],
      [
        'invalid_schema_version',
        { schemaVersion: 999 },
      ],
      [
        'invalid_global_status',
        { status: 'unknown' },
      ],
    ];

    for (
      const [name, identity] of invalidIdentities
    ) {
      const uid = await seed(name, { identity });

      await assert.rejects(
        () => resolveAccountIdentity(uid),
        /INVALID_ACCOUNT_IDENTITY/
      );

      pass(name);
    }

    const invalidUids = [
      '',
      ' ',
      'invalid/uid',
      '.',
      '..',
      'x'.repeat(129),
      null,
    ];

    for (const uid of invalidUids) {
      await assert.rejects(
        () => resolveAccountIdentity(uid),
        /INVALID.*UID/
      );
    }

    pass('invalid_uid_inputs');

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
