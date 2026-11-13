const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

require('./identity-runtime-loader.cjs');

const {
  getFirebaseAdmin,
} = require('../src/firebase/admin.ts');

const {
  resolveAccountAuthorization,
} = require('../src/services/account-authorization.service.ts');

const {
  deleteApp,
} = require('firebase-admin/app');

async function main() {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !==
      '127.0.0.1:8080' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !==
      '127.0.0.1:9099' ||
    process.env.VERCEL === '1'
  ) {
    throw new Error('Local emulators required');
  }

  const { adminDb, adminApp } = getFirebaseAdmin();

  const prefix =
    'authorization-' + randomUUID();

  const refs = [];
  let passed = 0;

  async function test(name, operation) {
    await operation();
    passed++;
    console.log('PASS: ' + name);
  }

  async function fixture(name, options = {}) {
    const uid = prefix + '-' + name;

    const identity = {
      uid,
      email: uid + '@example.com',
      schemaVersion: 1,
      status: 'active',
    };

    const startup = {
      uid,
      role: 'founder',
      roles: ['founder'],
      status: 'active',
    };

    const eventOrganizer = {
      uid,
      displayName: 'Test Event Organizer',
      organizerType: 'individual',
      verificationStatus: 'approved',
      schemaVersion: 1,
      status: 'active',
    };

    const documents = [
      [
        'accountIdentities',
        options.identity,
        identity,
      ],
      [
        'users',
        options.startup,
        startup,
      ],
      [
        'eventOrganizerProfiles',
        options.eventOrganizer,
        eventOrganizer,
      ],
    ];

    for (
      const [collection, config, defaults]
      of documents
    ) {
      if (!config) continue;

      const ref =
        adminDb.collection(collection).doc(uid);

      refs.push(ref);

      await ref.set({
        ...defaults,
        ...config,
      });
    }

    return uid;
  }

  async function expectAccess(
    name,
    options,
    expected
  ) {
    await test(name, async () => {
      const uid = await fixture(name, options);

      const account =
        await resolveAccountAuthorization(uid);

      assert.equal(
        account.portals.startup.allowed,
        expected.startup,
        'Unexpected Startup access'
      );

      assert.equal(
        account.portals.event_organizer.allowed,
        expected.eventOrganizer,
        'Unexpected Event Organizer access'
      );

      if (expected.admin !== undefined) {
        assert.equal(
          account.isAdmin,
          expected.admin
        );
      }

      if (expected.status !== undefined) {
        assert.equal(
          account.identity.status,
          expected.status
        );
      }
    });
  }

  try {
    for (const role of [
      'founder',
      'investor',
      'mentor',
    ]) {
      await expectAccess(
        role + '-only',
        {
          identity: {},
          startup: {
            role,
            roles: [role],
          },
        },
        {
          startup: true,
          eventOrganizer: false,
          admin: false,
        }
      );
    }

    await expectAccess(
      'event-organizer-only',
      {
        identity: {},
        eventOrganizer: {},
      },
      {
        startup: false,
        eventOrganizer: true,
        admin: false,
      }
    );

    await expectAccess(
      'dual-profile',
      {
        identity: {},
        startup: {},
        eventOrganizer: {},
      },
      {
        startup: true,
        eventOrganizer: true,
      }
    );

    await expectAccess(
      'global-suspension',
      {
        identity: { status: 'suspended' },
        startup: {},
        eventOrganizer: {},
      },
      {
        startup: false,
        eventOrganizer: false,
        status: 'suspended',
      }
    );

    await expectAccess(
      'legacy-suspension',
      {
        identity: {},
        startup: { status: 'suspended' },
        eventOrganizer: {},
      },
      {
        startup: false,
        eventOrganizer: false,
        status: 'suspended',
      }
    );

    await expectAccess(
      'event-organizer-suspension',
      {
        identity: {},
        startup: {},
        eventOrganizer: {
          status: 'suspended',
        },
      },
      {
        startup: true,
        eventOrganizer: false,
      }
    );

    await expectAccess(
      'pending-event-organizer',
      {
        identity: {},
        eventOrganizer: {
          verificationStatus: 'pending',
        },
      },
      {
        startup: false,
        eventOrganizer: true,
      }
    );

    await expectAccess(
      'rejected-event-organizer',
      {
        identity: {},
        eventOrganizer: {
          verificationStatus: 'rejected',
        },
      },
      {
        startup: false,
        eventOrganizer: true,
      }
    );

    await expectAccess(
      'invalid-event-organizer-schema',
      {
        identity: {},
        eventOrganizer: {
          schemaVersion: 999,
        },
      },
      {
        startup: false,
        eventOrganizer: false,
      }
    );

    await expectAccess(
      'event-organizer-without-identity',
      {
        eventOrganizer: {},
      },
      {
        startup: false,
        eventOrganizer: false,
      }
    );

    await expectAccess(
      'legacy-startup',
      {
        startup: {},
      },
      {
        startup: true,
        eventOrganizer: false,
        status: 'active',
      }
    );

    await test(
      'historical missing uid and status',
      async () => {
        const uid = prefix + '-historical';

        const ref =
          adminDb.collection('users').doc(uid);

        refs.push(ref);

        await ref.set({
          role: 'founder',
        });

        const account =
          await resolveAccountAuthorization(uid);

        assert.equal(
          account.portals.startup.allowed,
          true
        );

        assert.equal(
          account.identity.status,
          'active'
        );
      }
    );

    await expectAccess(
      'invalid-startup-uid',
      {
        identity: {},
        startup: {
          uid: 'different-uid',
        },
      },
      {
        startup: false,
        eventOrganizer: false,
      }
    );

    await expectAccess(
      'invalid-startup-status',
      {
        identity: {},
        startup: {
          status: 'unknown',
        },
      },
      {
        startup: false,
        eventOrganizer: false,
      }
    );

    await expectAccess(
      'no-professional-role',
      {
        identity: {},
        startup: {
          role: 'user',
          roles: ['user'],
        },
      },
      {
        startup: false,
        eventOrganizer: false,
        admin: false,
      }
    );

    await expectAccess(
      'unprovisioned-account',
      {},
      {
        startup: false,
        eventOrganizer: false,
        status: 'unprovisioned',
      }
    );

    await expectAccess(
      'admin-only',
      {
        startup: {
          role: 'admin',
          roles: ['admin'],
        },
      },
      {
        startup: false,
        eventOrganizer: false,
        admin: true,
      }
    );

    await expectAccess(
      'suspended-admin',
      {
        identity: {
          status: 'suspended',
        },
        startup: {
          role: 'admin',
          roles: ['admin'],
        },
      },
      {
        startup: false,
        eventOrganizer: false,
        admin: false,
      }
    );

    await test(
      'malformed global identity rejected',
      async () => {
        const uid = await fixture(
          'malformed-identity',
          {
            identity: {
              schemaVersion: 999,
            },
            startup: {},
            eventOrganizer: {},
          }
        );

        await assert.rejects(
          () => resolveAccountAuthorization(uid),
          /INVALID_ACCOUNT_IDENTITY/
        );
      }
    );

    await test(
      'invalid account UID rejected',
      async () => {
        await assert.rejects(
          () => resolveAccountAuthorization(''),
          /INVALID_ACCOUNT_UID/
        );
      }
    );

    console.log(
      'TOTAL SERVER AUTHORIZATION CHECKS PASSED: ' +
      passed
    );
  } finally {
    for (const ref of refs) {
      await ref.delete();
    }

    await deleteApp(adminApp);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
