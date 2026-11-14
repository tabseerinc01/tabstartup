const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

const {
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

const {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} = require('firebase/firestore');

const {
  ref,
  uploadBytes,
  getMetadata,
  updateMetadata,
  deleteObject,
  listAll,
} = require('firebase/storage');

const PROJECT_ID = 'demo-tabstartup';
const BUCKET = 'gs://demo-tabstartup.appspot.com';

const prefix =
  'event_security_' +
  randomUUID().replace(/-/g, '');

const uid = name => prefix + '_' + name;

const eventCollections = [
  'events',
  'eventSlugs',
  'eventPrivateDetails',
  'eventTicketTypes',
  'eventTicketInventory',
  'eventRegistrations',
  'eventOrders',
  'eventReservations',
  'eventTickets',
  'eventCheckIns',
  'eventAuditLogs',
];

const paymentCollections = [
  'paymentOrders',
  'payments',
  'paymentManualSubmissions',
  'paymentTransactionClaims',
  'paymentWebhookEvents',
  'paymentRefunds',
  'paymentAuditLogs',
];

const protectedCollections = [
  ...eventCollections,
  ...paymentCollections,
];

let passed = 0;
let failed = 0;

const documentPaths = [];
const storagePaths = [];

async function test(name, operation) {
  try {
    await operation();
    passed++;
    console.log('PASS: ' + name);
  } catch (error) {
    failed++;
    console.log('FAIL: ' + name);
    console.log(
      error.code || '',
      error.message
    );
  }
}

async function allowed(name, operation) {
  await test(name, operation);
}

async function denied(
  name,
  operation,
  expectedCode = 'permission-denied'
) {
  await test(name, async () => {
    await assert.rejects(
      operation,
      error => error.code === expectedCode
    );
  });
}

async function storageDenied(name, operation) {
  await denied(
    name,
    operation,
    'storage/unauthorized'
  );
}

function assertLocalEnvironment() {
  const expected = {
    FIRESTORE_EMULATOR_HOST:
      '127.0.0.1:8080',

    FIREBASE_AUTH_EMULATOR_HOST:
      '127.0.0.1:9099',

    FIREBASE_STORAGE_EMULATOR_HOST:
      '127.0.0.1:9199',
  };

  for (const [key, value] of
    Object.entries(expected)) {
    assert.equal(
      process.env[key],
      value,
      'Unsafe emulator environment: ' + key
    );
  }

  assert.notEqual(process.env.VERCEL, '1');
}

function eventData(eventId, overrides = {}) {
  return {
    eventId,
    schemaVersion: 1,
    visibility: 'public',
    status: 'published',
    title: 'Emulator Test Event',
    ...overrides,
  };
}

function ticketData(eventId, overrides = {}) {
  return {
    eventId,
    ticketTypeId: uid('ticket'),
    schemaVersion: 1,
    name: 'General Admission',
    ...overrides,
  };
}

const imageBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0,
]);

async function main() {
  assertLocalEnvironment();

  const hubResponse = await fetch(
    'http://127.0.0.1:4400/emulators'
  );

  assert.equal(hubResponse.ok, true);

  const hub = await hubResponse.json();

  for (const [name, port] of [
    ['firestore', 8080],
    ['auth', 9099],
    ['storage', 9199],
  ]) {
    assert.equal(hub[name].host, '127.0.0.1');
    assert.equal(hub[name].port, port);
  }

  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,

    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(
        'firestore.rules',
        'utf8'
      ),
    },

    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: fs.readFileSync(
        'storage.rules',
        'utf8'
      ),
    },
  });

  const startupUid = uid('startup');
  const organizerUid = uid('organizer');
  const adminUid = uid('admin');

  const publishedId = uid('published');
  const ongoingId = uid('ongoing');
  const completedId = uid('completed');
  const privateId = uid('private');
  const cancelledId = uid('cancelled');
  const draftId = uid('draft');
  const inviteId = uid('invite');
  const archivedId = uid('archived');
  const wrongSchemaId = uid('schema');
  const mismatchedId = uid('mismatch');
  const missingId = uid('missing');

  const hiddenEvents = [
    [privateId, { visibility: 'private' }],
    [inviteId, { visibility: 'invite_only' }],
    [cancelledId, { status: 'cancelled' }],
    [draftId, { status: 'draft' }],
    [archivedId, { status: 'archived' }],
    [wrongSchemaId, { schemaVersion: 2 }],
  ];

  const publicRoot =
    'event-assets/public/' + publishedId;

  const privateRoot =
    'event-assets/private/' + publishedId;

  const validAssets = [
    [publicRoot + '/banners/banner.jpg',
      'image/jpeg'],

    [publicRoot + '/speakers/speaker.png',
      'image/png'],

    [publicRoot + '/sponsors/sponsor.webp',
      'image/webp'],
  ];

  const invalidAssets = [
    [publicRoot + '/banners/mismatch.jpg',
      'image/png', imageBytes],

    [publicRoot + '/speakers/mismatch.png',
      'image/webp', imageBytes],

    [publicRoot + '/sponsors/mismatch.webp',
      'image/jpeg', imageBytes],

    [privateRoot + '/banners/banner.jpg',
      'image/jpeg', imageBytes],

    [publicRoot + '/unknown/banner.jpg',
      'image/jpeg', imageBytes],

    [publicRoot + '/banners/banner.svg',
      'image/svg+xml', imageBytes],

    [publicRoot + '/banners/banner.jpg.html',
      'image/jpeg', imageBytes],

    [publicRoot + '/banners/wrong-mime.jpg',
      'text/html', imageBytes],

    [publicRoot + '/banners/empty.jpg',
      'image/jpeg', new Uint8Array(0)],

    [publicRoot + '/banners/oversized.jpg',
      'image/jpeg',
      new Uint8Array(5 * 1024 * 1024 + 1)],

    [publicRoot + '/speakers/oversized.jpg',
      'image/jpeg',
      new Uint8Array(2 * 1024 * 1024 + 1)],

    [publicRoot + '/sponsors/oversized.jpg',
      'image/jpeg',
      new Uint8Array(2 * 1024 * 1024 + 1)],

    [publicRoot + '/banners/nested/image.jpg',
      'image/jpeg', imageBytes],

    ['event-assets/public/' + prefix +
      ' invalid/banners/image.jpg',
      'image/jpeg', imageBytes],
  ];

  const publicTicketId = uid('public_ticket');

  const mismatchedParentTicketId =
    uid('mismatched_parent_ticket');
  const missingTicketId = uid('missing_ticket');
  const wrongSchemaTicketId = uid('schema_ticket');

  const profilePath =
    'profile-images/' +
    startupUid +
    '/avatar.jpg';

  async function seedDocument(db, path, data) {
    documentPaths.push(path);
    await setDoc(doc(db, path), data);
  }

  async function seedAsset(
    storage,
    path,
    mime,
    bytes
  ) {
    storagePaths.push(path);

    await uploadBytes(
      ref(storage, path),
      bytes,
      { contentType: mime }
    );
  }

  try {
    console.log(
      '===== TRUSTED FIXTURE CREATION ====='
    );

    await env.withSecurityRulesDisabled(
      async ctx => {
        const db = ctx.firestore();
        const storage = ctx.storage(BUCKET);

        for (const [userId, roles] of [
          [startupUid, ['founder']],
          [adminUid, ['admin']],
        ]) {
          await seedDocument(
            db,
            'users/' + userId,
            {
              uid: userId,
              status: 'active',
              role: roles[0],
              roles,
            }
          );

          await seedDocument(
            db,
            'accountIdentities/' + userId,
            {
              uid: userId,
              email: userId + '@example.com',
              status: 'active',
              schemaVersion: 1,
            }
          );
        }

        await seedDocument(
          db,
          'accountIdentities/' + organizerUid,
          {
            uid: organizerUid,
            status: 'active',
            schemaVersion: 1,
            email: organizerUid + '@example.com',
          }
        );

        await seedDocument(
          db,
          'eventOrganizerProfiles/' + organizerUid,
          {
            uid: organizerUid,
            displayName: 'Test Event Organizer',
            organizerType: 'individual',
            status: 'active',
            verificationStatus: 'approved',
            schemaVersion: 1,
          }
        );

        for (const [id, overrides] of [
          [publishedId, {}],
          [ongoingId, { status: 'ongoing' }],
          [completedId, { status: 'completed' }],
          ...hiddenEvents,
          [mismatchedId, {
            eventId: uid('wrong_event_id'),
          }],
        ]) {
          await seedDocument(
            db,
            'publicEvents/' + id,
            eventData(id, overrides)
          );
        }

        await seedDocument(
          db,
          'publicEventTicketTypes/' + publicTicketId,
          ticketData(publishedId)
        );

        await seedDocument(
          db,
          'publicEventTicketTypes/' + missingTicketId,
          ticketData(missingId)
        );

        await seedDocument(
          db,
          'publicEventTicketTypes/' +
            wrongSchemaTicketId,
          ticketData(publishedId, {
            schemaVersion: 2,
          })
        );

        await seedDocument(
          db,
          'publicEventTicketTypes/' +
            mismatchedParentTicketId,
          ticketData(mismatchedId)
        );

        for (const [id] of hiddenEvents) {
          await seedDocument(
            db,
            'publicEventTicketTypes/' +
              id + '_ticket',
            ticketData(id)
          );
        }

        for (const name of protectedCollections) {
          const path = name + '/' + prefix;

          const fixture = {
            ownerUid: startupUid,
            organizerId: organizerUid,
            eventId: publishedId,
            status: 'active',
            secret: 'PRIVATE_TEST_DATA',
          };

          await seedDocument(db, path, fixture);

          await seedDocument(
            db,
            path + '/nested/private',
            fixture
          );
        }

        for (const [path, mime] of validAssets) {
          await seedAsset(
            storage,
            path,
            mime,
            imageBytes
          );
        }

        for (const [path, mime, bytes] of
          invalidAssets) {
          await seedAsset(
            storage,
            path,
            mime,
            bytes
          );
        }

        await seedAsset(
          storage,
          profilePath,
          'image/jpeg',
          imageBytes
        );
      }
    );

    console.log('FIXTURES: READY');

    const clients = [
      [
        'Guest',
        env.unauthenticatedContext(),
      ],
      [
        'Startup User',
        env.authenticatedContext(startupUid),
      ],
      [
        'Event Organizer',
        env.authenticatedContext(organizerUid),
      ],
      [
        'Database Admin',
        env.authenticatedContext(adminUid),
      ],
      [
        'Hardcoded Admin',
        env.authenticatedContext(
          'T2JnkPYdsoZGO8krUqcP3T5bvg62'
        ),
      ],
    ];

    for (const [name, ctx] of clients) {
      const db = ctx.firestore();
      const storage = ctx.storage(BUCKET);

      console.log(
        '\n===== CLIENT: ' + name + ' ====='
      );

      // Public event visibility.

      for (const id of [
        publishedId,
        ongoingId,
        completedId,
      ]) {
        await allowed(
          name + ': discoverable event read',
          async () => {
            const snap = await getDoc(
              doc(db, 'publicEvents', id)
            );

            assert.equal(snap.exists(), true);
            assert.equal(snap.data().eventId, id);
          }
        );
      }

      for (const [id] of hiddenEvents) {
        await denied(
          name + ': hidden event read blocked ' + id,
          () => getDoc(
            doc(db, 'publicEvents', id)
          )
        );
      }

      await denied(
        name + ': mismatched event ID blocked',
        () => getDoc(
          doc(db, 'publicEvents', mismatchedId)
        )
      );

      await allowed(
        name + ': constrained public event query',
        async () => {
          const result = await getDocs(
            query(
              collection(db, 'publicEvents'),
              where('schemaVersion', '==', 1),
              where('visibility', '==', 'public'),
              where('status', 'in', [
                'published',
                'ongoing',
                'completed',
              ])
            )
          );

          assert.equal(
            result.docs.some(
              item => item.id === publishedId
            ),
            true
          );

          for (const item of result.docs) {
            assert.equal(
              item.data().visibility,
              'public'
            );

            assert.equal(
              item.data().schemaVersion,
              1
            );
          }
        }
      );

      await denied(
        name + ': unrestricted event query blocked',
        () => getDocs(
          collection(db, 'publicEvents')
        )
      );

      await denied(
        name + ': incomplete event query blocked',
        () => getDocs(
          query(
            collection(db, 'publicEvents'),
            where('visibility', '==', 'public')
          )
        )
      );

      // Public ticket visibility.

      await allowed(
        name + ': public ticket read',
        async () => {
          const snap = await getDoc(
            doc(
              db,
              'publicEventTicketTypes',
              publicTicketId
            )
          );

          assert.equal(snap.exists(), true);
          assert.equal(
            snap.data().eventId,
            publishedId
          );
        }
      );

      await allowed(
        name + ': constrained ticket query',
        async () => {
          const result = await getDocs(
            query(
              collection(
                db,
                'publicEventTicketTypes'
              ),
              where('schemaVersion', '==', 1),
              where('eventId', '==', publishedId)
            )
          );

          assert.equal(
            result.docs.some(
              item => item.id === publicTicketId
            ),
            true
          );
        }
      );

      await denied(
        name + ': unrestricted ticket query blocked',
        () => getDocs(
          collection(db, 'publicEventTicketTypes')
        )
      );

      for (const id of [
        missingTicketId,
        wrongSchemaTicketId,
        mismatchedParentTicketId,
        ...hiddenEvents.map(
          ([eventId]) => eventId + '_ticket'
        ),
      ]) {
        await denied(
          name + ': hidden or invalid ticket blocked',
          () => getDoc(
            doc(db, 'publicEventTicketTypes', id)
          )
        );
      }

      await denied(
        name + ': mismatched parent ticket query blocked',
        () => getDocs(
          query(
            collection(
              db,
              'publicEventTicketTypes'
            ),
            where('schemaVersion', '==', 1),
            where('eventId', '==', mismatchedId)
          )
        )
      );

      // Public projection writes.

      for (const [nameOfCollection, existingId] of [
        ['publicEvents', publishedId],
        ['publicEventTicketTypes', publicTicketId],
      ]) {
        const existing = doc(
          db,
          nameOfCollection,
          existingId
        );

        await denied(
          name + ': ' + nameOfCollection +
            ' create blocked',
          () => setDoc(
            doc(
              db,
              nameOfCollection,
              uid('unauthorized')
            ),
            eventData(uid('unauthorized'))
          )
        );

        await denied(
          name + ': ' + nameOfCollection +
            ' overwrite blocked',
          () => setDoc(existing, {
            status: 'forged',
          })
        );

        await denied(
          name + ': ' + nameOfCollection +
            ' update blocked',
          () => updateDoc(existing, {
            status: 'forged',
          })
        );

        await denied(
          name + ': ' + nameOfCollection +
            ' delete blocked',
          () => deleteDoc(existing)
        );
      }

      // All protected event and payment collections.

      for (const collectionName of
        protectedCollections) {
        const existing = doc(
          db,
          collectionName,
          prefix
        );

        const nested = doc(
          db,
          collectionName,
          prefix,
          'nested',
          'private'
        );

        const label =
          name + ': ' + collectionName;

        await denied(
          label + ' get blocked',
          () => getDoc(existing)
        );

        await denied(
          label + ' list blocked',
          () => getDocs(
            collection(db, collectionName)
          )
        );

        await denied(
          label + ' create blocked',
          () => setDoc(
            doc(
              db,
              collectionName,
              uid('unauthorized')
            ),
            { status: 'forged' }
          )
        );

        await denied(
          label + ' overwrite blocked',
          () => setDoc(existing, {
            status: 'forged',
          })
        );

        await denied(
          label + ' update blocked',
          () => updateDoc(existing, {
            status: 'forged',
          })
        );

        await denied(
          label + ' delete blocked',
          () => deleteDoc(existing)
        );

        await denied(
          label + ' nested read blocked',
          () => getDoc(nested)
        );

        await denied(
          label + ' nested write blocked',
          () => updateDoc(nested, {
            status: 'forged',
          })
        );
      }

      // Storage access.

      for (const [path, mime] of validAssets) {
        const asset = ref(storage, path);

        await allowed(
          name + ': valid public asset read',
          async () => {
            const metadata =
              await getMetadata(asset);

            assert.equal(
              metadata.contentType,
              mime
            );
          }
        );

        await storageDenied(
          name + ': public asset overwrite blocked',
          () => uploadBytes(
            asset,
            imageBytes,
            { contentType: mime }
          )
        );

        await storageDenied(
          name + ': public asset metadata update blocked',
          () => updateMetadata(asset, {
            contentType: 'text/html',
          })
        );

        await storageDenied(
          name + ': public asset delete blocked',
          () => deleteObject(asset)
        );
      }

      for (const [path] of invalidAssets) {
        await storageDenied(
          name + ': private or invalid asset read blocked ' +
            path,
          () => getMetadata(
            ref(storage, path)
          )
        );
      }

      for (const root of [
        publicRoot,
        privateRoot,
      ]) {
        await storageDenied(
          name + ': asset creation blocked',
          () => uploadBytes(
            ref(
              storage,
              root + '/banners/unauthorized.jpg'
            ),
            imageBytes,
            { contentType: 'image/jpeg' }
          )
        );

        await storageDenied(
          name + ': asset listing blocked',
          () => listAll(
            ref(storage, root + '/banners')
          )
        );
      }

      const privateAsset = ref(
        storage,
        privateRoot + '/banners/banner.jpg'
      );

      await storageDenied(
        name + ': private asset update blocked',
        () => updateMetadata(privateAsset, {
          contentType: 'image/png',
        })
      );

      await storageDenied(
        name + ': private asset deletion blocked',
        () => deleteObject(privateAsset)
      );

      // Existing profile storage write behavior.

      if (name === 'Startup User') {
        await allowed(
          'Existing profile owner upload preserved',
          () => uploadBytes(
            ref(storage, profilePath),
            imageBytes,
            { contentType: 'image/jpeg' }
          )
        );
      } else {
        await storageDenied(
          name + ': other user profile upload blocked',
          () => uploadBytes(
            ref(storage, profilePath),
            imageBytes,
            { contentType: 'image/jpeg' }
          )
        );
      }

      // Existing identity protection.

      await denied(
        name + ': identity direct read blocked',
        () => getDoc(
          doc(db, 'accountIdentities', startupUid)
        )
      );

      await denied(
        name + ': Event Organizer profile read blocked',
        () => getDoc(
          doc(
            db,
            'eventOrganizerProfiles',
            organizerUid
          )
        )
      );
    }

    // Parent event visibility revocation.

    const guestDb =
      env.unauthenticatedContext().firestore();

    await env.withSecurityRulesDisabled(
      async ctx => {
        await updateDoc(
          doc(
            ctx.firestore(),
            'publicEvents',
            publishedId
          ),
          { status: 'cancelled' }
        );
      }
    );

    await denied(
      'Cancelled parent event immediately hidden',
      () => getDoc(
        doc(guestDb, 'publicEvents', publishedId)
      )
    );

    await denied(
      'Cancelled parent ticket immediately hidden',
      () => getDoc(
        doc(
          guestDb,
          'publicEventTicketTypes',
          publicTicketId
        )
      )
    );

    await env.withSecurityRulesDisabled(
      async ctx => {
        const db = ctx.firestore();

        for (const name of protectedCollections) {
          const snap = await getDoc(
            doc(db, name, prefix)
          );

          await test(
            name + ': protected fixture integrity',
            async () => {
              assert.equal(snap.exists(), true);
              assert.equal(
                snap.data().status,
                'active'
              );
              assert.equal(
                snap.data().secret,
                'PRIVATE_TEST_DATA'
              );
            }
          );
        }
      }
    );

  } finally {
    console.log(
      '\n===== TARGETED FIXTURE CLEANUP ====='
    );

    try {
      await env.withSecurityRulesDisabled(
        async ctx => {
          const db = ctx.firestore();
          const storage = ctx.storage(BUCKET);

          for (const path of
            [...documentPaths].reverse()) {
            await deleteDoc(doc(db, path));
          }

          for (const path of storagePaths) {
            try {
              await deleteObject(
                ref(storage, path)
              );
            } catch (error) {
              if (
                error.code !==
                  'storage/object-not-found'
              ) {
                throw error;
              }
            }
          }
        }
      );

      console.log('CLEANUP: PASS');
    } finally {
      await env.cleanup();
    }
  }

  console.log(
    '\n===== EVENT RULES SECURITY SUMMARY ====='
  );

  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  console.log('Total: ' + (passed + failed));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('FATAL:', error);
  process.exitCode = 1;
});
