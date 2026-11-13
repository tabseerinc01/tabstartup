const fs = require('fs');

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} = require('firebase/firestore');

async function main() {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !==
      '127.0.0.1:8080' ||
    process.env.VERCEL === '1'
  ) {
    throw new Error('Local emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-tabstartup-portal-isolation',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(
        'firestore.rules',
        'utf8'
      ),
    },
  });

  let passed = 0;

  async function test(name, operation, allowed) {
    await (
      allowed
        ? assertSucceeds(operation)
        : assertFails(operation)
    );

    passed++;
    console.log('PASS: ' + name);
  }

  const identity = (uid, status = 'active') => ({
    uid,
    email: uid + '@example.com',
    schemaVersion: 1,
    status,
  });

  const startup = (
    uid,
    role = 'founder',
    status = 'active'
  ) => ({
    uid,
    role,
    roles: [role],
    status,
  });

  const eventOrganizer = (
    uid,
    status = 'active'
  ) => ({
    uid,
    displayName: 'Test Event Organizer',
    organizerType: 'individual',
    verificationStatus: 'approved',
    schemaVersion: 1,
    status,
  });

  try {
    await env.clearFirestore();

    await env.withSecurityRulesDisabled(
      async context => {
        const db = context.firestore();

        const fixtures = {
          'users/founder':
            startup('founder'),

          'users/investor':
            startup('investor', 'investor'),

          'users/mentor':
            startup('mentor', 'mentor'),

          'users/dual':
            startup('dual'),

          'users/globalSuspended':
            startup('globalSuspended'),

          'users/legacySuspended':
            startup(
              'legacySuspended',
              'founder',
              'suspended'
            ),

          'users/historical': {
            role: 'founder',
          },

          'users/invalidUid':
            startup('differentUid'),

          'users/invalidStatus':
            startup(
              'invalidStatus',
              'founder',
              'unknown'
            ),

          'users/invalidIdentity':
            startup('invalidIdentity'),

          'users/noProfessionalRole':
            startup(
              'noProfessionalRole',
              'user'
            ),

          'users/admin':
            startup('admin', 'admin'),

          'users/suspendedAdmin':
            startup(
              'suspendedAdmin',
              'admin'
            ),

          'accountIdentities/founder':
            identity('founder'),

          'accountIdentities/investor':
            identity('investor'),

          'accountIdentities/mentor':
            identity('mentor'),

          'accountIdentities/eventOrganizerOnly':
            identity('eventOrganizerOnly'),

          'accountIdentities/dual':
            identity('dual'),

          'accountIdentities/globalSuspended':
            identity(
              'globalSuspended',
              'suspended'
            ),

          'accountIdentities/legacySuspended':
            identity('legacySuspended'),

          'accountIdentities/invalidIdentity': {
            ...identity('invalidIdentity'),
            schemaVersion: 999,
          },

          'accountIdentities/suspendedAdmin':
            identity(
              'suspendedAdmin',
              'suspended'
            ),

          'eventOrganizerProfiles/eventOrganizerOnly':
            eventOrganizer('eventOrganizerOnly'),

          'eventOrganizerProfiles/dual':
            eventOrganizer('dual', 'suspended'),

          'eventOrganizerProfiles/globalSuspended':
            eventOrganizer('globalSuspended'),

          'publicProfiles/founder': {
            uid: 'founder',
            fullName: 'Test Founder',
            roles: ['founder'],
          },

          'startups/founder': {
            ownerUid: 'founder',
            status: 'active',
            slug: 'public-startup',
          },
        };

        for (
          const [path, data]
          of Object.entries(fixtures)
        ) {
          await setDoc(doc(db, path), data);
        }

        // Give each test account an existing private
        // contact to test isolation independently
        // of ownership checks.

        for (const uid of [
          'founder',
          'investor',
          'mentor',
          'dual',
          'eventOrganizerOnly',
          'globalSuspended',
          'legacySuspended',
          'historical',
          'invalidUid',
          'invalidStatus',
          'invalidIdentity',
          'noProfessionalRole',
          'authOnly',
        ]) {
          await setDoc(
            doc(db, 'contacts', uid),
            {
              ownerUid: uid,
              name: 'Private Contact',
            }
          );
        }
      }
    );

    const dbFor = uid =>
      env.authenticatedContext(uid).firestore();

    // 1. Legitimate Startup accounts.

    for (const uid of [
      'founder',
      'investor',
      'mentor',
      'dual',
      'historical',
    ]) {
      const db = dbFor(uid);

      await test(
        uid + ': own private contact read',
        getDoc(doc(db, 'contacts', uid)),
        true
      );

      await test(
        uid + ': own private contact update',
        updateDoc(
          doc(db, 'contacts', uid),
          { name: 'Updated Contact' }
        ),
        true
      );
    }

    // 2. Denied Startup accounts.

    for (const uid of [
      'eventOrganizerOnly',
      'globalSuspended',
      'legacySuspended',
      'invalidUid',
      'invalidStatus',
      'invalidIdentity',
      'noProfessionalRole',
      'authOnly',
    ]) {
      const db = dbFor(uid);

      await test(
        uid + ': private contact read blocked',
        getDoc(doc(db, 'contacts', uid)),
        false
      );

      await test(
        uid + ': private contact create blocked',
        setDoc(
          doc(db, 'contacts', uid + '-new'),
          {
            ownerUid: uid,
            name: 'New Contact',
          }
        ),
        false
      );

      await test(
        uid + ': private contact update blocked',
        updateDoc(
          doc(db, 'contacts', uid),
          { name: 'Unauthorized Update' }
        ),
        false
      );

      await test(
        uid + ': private contact delete blocked',
        deleteDoc(doc(db, 'contacts', uid)),
        false
      );
    }

    // 3. Existing ownership boundaries.

    await test(
      'Founder cannot read investor contact',
      getDoc(
        doc(dbFor('founder'), 'contacts', 'investor')
      ),
      false
    );

    // 4. Public content remains accessible.

    const guest =
      env.unauthenticatedContext().firestore();

    for (const [name, db] of [
      ['guest', guest],
      ['Event Organizer', dbFor('eventOrganizerOnly')],
      ['suspended account', dbFor('globalSuspended')],
    ]) {
      await test(
        name + ': public profile readable',
        getDoc(doc(db, 'publicProfiles', 'founder')),
        true
      );

      await test(
        name + ': public startup readable',
        getDoc(doc(db, 'startups', 'founder')),
        true
      );
    }

    // 5. Trusted-server-only profile collections.

    for (const uid of [
      'founder',
      'eventOrganizerOnly',
      'dual',
      'admin',
    ]) {
      const db = dbFor(uid);

      for (const collection of [
        'accountIdentities',
        'eventOrganizerProfiles',
      ]) {
        const ref = doc(db, collection, uid);

        await test(
          uid + ': ' + collection + ' read blocked',
          getDoc(ref),
          false
        );

        await test(
          uid + ': ' + collection + ' write blocked',
          setDoc(ref, { status: 'active' }),
          false
        );

        await test(
          uid + ': ' + collection + ' delete blocked',
          deleteDoc(ref),
          false
        );
      }
    }

    // 6. Admin suspension.

    await test(
      'Active admin can read user profile',
      getDoc(doc(dbFor('admin'), 'users', 'founder')),
      true
    );

    await test(
      'Globally suspended admin blocked',
      getDoc(
        doc(
          dbFor('suspendedAdmin'),
          'users',
          'founder'
        )
      ),
      false
    );

    console.log(
      'TOTAL PORTAL ISOLATION CHECKS PASSED: ' +
      passed
    );
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
