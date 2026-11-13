const fs = require('node:fs');

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-tabstartup-identity-security';

async function main() {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !==
    '127.0.0.1:8080'
  ) {
    throw new Error('Local Firestore Emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  let passed = 0;

  function pass(name) {
    passed++;
    console.log('PASS: ' + name);
  }

  const ownerUid = 'identity_owner';
  const otherUid = 'identity_other';
  const adminUid = 'identity_admin';

  function identity(uid) {
    return {
      uid,
      email: uid + '@example.com',
      status: 'active',
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  try {
    await env.clearFirestore();

    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();

      await assertSucceeds(
        setDoc(
          doc(db, 'accountIdentities', ownerUid),
          identity(ownerUid)
        )
      );

      await setDoc(doc(db, 'users', adminUid), {
        uid: adminUid,
        role: 'admin',
        roles: ['admin'],
        status: 'active',
      });
    });

    pass('Trusted identity fixture creation');

    const clients = [
      [
        'Guest',
        env.unauthenticatedContext().firestore(),
      ],
      [
        'Account owner',
        env.authenticatedContext(ownerUid).firestore(),
      ],
      [
        'Other user',
        env.authenticatedContext(otherUid).firestore(),
      ],
      [
        'Database admin',
        env.authenticatedContext(adminUid).firestore(),
      ],
      [
        'Hardcoded admin',
        env.authenticatedContext(
          'T2JnkPYdsoZGO8krUqcP3T5bvg62'
        ).firestore(),
      ],
      [
        'Event Organizer-only UID',
        env.authenticatedContext(
          'event_organizer_only'
        ).firestore(),
      ],
    ];

    for (const [name, db] of clients) {
      const ref = doc(
        db,
        'accountIdentities',
        ownerUid
      );

      await assertFails(getDoc(ref));
      pass(name + ': identity read blocked');

      await assertFails(
        getDocs(collection(db, 'accountIdentities'))
      );
      pass(name + ': identity list blocked');

      await assertFails(
        setDoc(
          doc(
            db,
            'accountIdentities',
            'unauthorized_identity'
          ),
          identity('unauthorized_identity')
        )
      );
      pass(name + ': identity creation blocked');

      await assertFails(
        updateDoc(ref, { status: 'suspended' })
      );
      pass(name + ': status update blocked');

      await assertFails(
        updateDoc(ref, {
          email: 'forged@example.com',
        })
      );
      pass(name + ': email modification blocked');

      await assertFails(deleteDoc(ref));
      pass(name + ': identity deletion blocked');
    }

    const ownerDb = env
      .authenticatedContext(ownerUid)
      .firestore();

    await assertFails(
      setDoc(
        doc(ownerDb, 'accountIdentities', ownerUid),
        identity(ownerUid)
      )
    );

    pass('Owner identity overwrite blocked');

    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      const ref = doc(
        db,
        'accountIdentities',
        ownerUid
      );

      const snapshot = await assertSucceeds(
        getDoc(ref)
      );

      if (
        !snapshot.exists() ||
        snapshot.data().status !== 'active'
      ) {
        throw new Error('Identity fixture corrupted');
      }

      pass('Trusted identity read');

      await assertSucceeds(
        updateDoc(ref, {
          status: 'suspended',
          updatedAt: serverTimestamp(),
        })
      );

      const updated = await getDoc(ref);

      if (updated.data()?.status !== 'suspended') {
        throw new Error('Status update not persisted');
      }

      pass('Trusted identity status update');
    });

    await assertFails(
      updateDoc(
        doc(ownerDb, 'accountIdentities', ownerUid),
        { status: 'active' }
      )
    );

    pass('Suspended owner self-reactivation blocked');

    console.log('\nTOTAL PASSED: ' + passed);
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error('FAILED:', error);
  process.exitCode = 1;
});
