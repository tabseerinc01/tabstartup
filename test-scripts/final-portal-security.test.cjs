const fs = require('node:fs');

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} = require('firebase/firestore');

if (
  process.env.FIRESTORE_EMULATOR_HOST !==
    '127.0.0.1:8080' ||
  process.env.VERCEL === '1'
) {
  throw new Error('LOCAL_EMULATOR_REQUIRED');
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-tabstartup-final-portal',
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

  async function check(
    label,
    operation,
    allowed
  ) {
    if (allowed) {
      await assertSucceeds(operation);
    } else {
      await assertFails(operation);
    }

    passed++;
    console.log('PASS:', label);
  }

  try {
    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(
      async context => {
        const db = context.firestore();

        for (const uid of [
          'founder',
          'referred',
          'attacker',
        ]) {
          await setDoc(
            doc(db, 'users', uid),
            {
              uid,
              role: 'founder',
              roles: ['founder'],
              status: 'active',
              fullName: 'Test Founder',
              bio: 'Complete biography',
              location: 'Dhaka',
            }
          );

          await setDoc(
            doc(db, 'accountIdentities', uid),
            {
              uid,
              schemaVersion: 1,
              status: 'active',
            }
          );
        }

        for (const uid of [
          'adminOnly',
          'suspendedAdmin',
        ]) {
          await setDoc(
            doc(db, 'users', uid),
            {
              uid,
              role: 'admin',
              roles: ['admin'],
              status: 'active',
            }
          );

          await setDoc(
            doc(db, 'accountIdentities', uid),
            {
              uid,
              schemaVersion: 1,
              status: uid === 'suspendedAdmin'
                ? 'suspended'
                : 'active',
            }
          );
        }

        await setDoc(
          doc(
            db,
            'accountIdentities',
            'eventOrganizer'
          ),
          {
            uid: 'eventOrganizer',
            schemaVersion: 1,
            status: 'active',
          }
        );

        await setDoc(
          doc(
            db,
            'eventOrganizerProfiles',
            'eventOrganizer'
          ),
          {
            uid: 'eventOrganizer',
            schemaVersion: 1,
            status: 'active',
            organizerType: 'individual',
            verificationStatus: 'approved',
          }
        );

        await setDoc(
          doc(db, 'users', 'malformedRoles'),
          {
            uid: 'malformedRoles',
            role: 'founder',
            roles: 'founder',
            status: 'active',
          }
        );

        await setDoc(
          doc(db, 'referrals', 'referral1'),
          {
            referrerUid: 'founder',
            referredUid: 'referred',
            referredProfileCompleted: false,
            rewardGranted: false,
          }
        );

        for (const collection of [
          'communityPosts',
          'communityComments',
        ]) {
          for (const id of [
            'moderationUpdate',
            'moderationDelete',
          ]) {
            await setDoc(
              doc(db, collection, id),
              {
                authorUid: 'founder',
                content: 'Test community content',
              }
            );
          }
        }

        await setDoc(
          doc(
            db,
            'contacts',
            'malformedContact'
          ),
          {
            ownerUid: 'malformedRoles',
            name: 'Private Contact',
          }
        );
      }
    );

    const founder = testEnv
      .authenticatedContext('founder')
      .firestore();

    const referred = testEnv
      .authenticatedContext('referred')
      .firestore();

    const attacker = testEnv
      .authenticatedContext('attacker')
      .firestore();

    const admin = testEnv
      .authenticatedContext('adminOnly')
      .firestore();

    const suspendedAdmin = testEnv
      .authenticatedContext('suspendedAdmin')
      .firestore();

    const organizer = testEnv
      .authenticatedContext('eventOrganizer')
      .firestore();

    const malformed = testEnv
      .authenticatedContext('malformedRoles')
      .firestore();

    const guest = testEnv
      .unauthenticatedContext()
      .firestore();

    // Referral read permissions.

    await check(
      'Referrer can read own referral',
      getDoc(doc(founder, 'referrals', 'referral1')),
      true
    );

    await check(
      'Referred user can read own referral',
      getDoc(doc(referred, 'referrals', 'referral1')),
      true
    );

    await check(
      'Unrelated user cannot read referral',
      getDoc(doc(attacker, 'referrals', 'referral1')),
      false
    );

    await check(
      'Event Organizer-only cannot read referral',
      getDoc(doc(organizer, 'referrals', 'referral1')),
      false
    );

    await check(
      'Guest cannot read referral',
      getDoc(doc(guest, 'referrals', 'referral1')),
      false
    );

    // Referral qualification restrictions.

    for (const [label, db] of [
      ['Referred user', referred],
      ['Referrer', founder],
      ['Unrelated user', attacker],
      ['Event Organizer-only', organizer],
      ['Suspended admin', suspendedAdmin],
      ['Guest', guest],
    ]) {
      await check(
        label + ' cannot qualify referral directly',
        updateDoc(
          doc(db, 'referrals', 'referral1'),
          {
            referredProfileCompleted: true,
          }
        ),
        false
      );
    }

    await check(
      'Referred user cannot grant reward',
      updateDoc(
        doc(referred, 'referrals', 'referral1'),
        {
          rewardGranted: true,
        }
      ),
      false
    );

    await check(
      'Existing admin referral update preserved',
      updateDoc(
        doc(admin, 'referrals', 'referral1'),
        {
          referredProfileCompleted: true,
        }
      ),
      true
    );

    // Community moderation.

    for (const collection of [
      'communityPosts',
      'communityComments',
    ]) {
      for (const [label, db] of [
        ['Unrelated user', attacker],
        ['Event Organizer-only', organizer],
        ['Suspended admin', suspendedAdmin],
      ]) {
        await check(
          label + ' cannot moderate ' + collection,
          updateDoc(
            doc(
              db,
              collection,
              'moderationUpdate'
            ),
            {
              content: 'Unauthorized moderation',
            }
          ),
          false
        );
      }

      await check(
        'Admin-only can update ' + collection,
        updateDoc(
          doc(
            admin,
            collection,
            'moderationUpdate'
          ),
          {
            content: 'Moderated content',
          }
        ),
        true
      );

      await check(
        'Admin-only can delete ' + collection,
        deleteDoc(
          doc(
            admin,
            collection,
            'moderationDelete'
          )
        ),
        true
      );
    }

    // Moderation notification permissions.

    function notification(
      db,
      uid,
      id,
      type = 'moderation'
    ) {
      return setDoc(
        doc(db, 'notifications', id),
        {
          recipientUid: 'founder',
          actorUid: uid,
          type,
          title: 'Test Notification',
          message: 'Test moderation message',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
    }

    await check(
      'Admin-only can create moderation notification',
      notification(
        admin,
        'adminOnly',
        'adminModeration'
      ),
      true
    );

    await check(
      'Suspended admin cannot create moderation notification',
      notification(
        suspendedAdmin,
        'suspendedAdmin',
        'suspendedModeration'
      ),
      false
    );

    await check(
      'Founder cannot create moderation notification',
      notification(
        founder,
        'founder',
        'founderModeration'
      ),
      false
    );

    await check(
      'Event Organizer-only cannot create moderation notification',
      notification(
        organizer,
        'eventOrganizer',
        'organizerModeration'
      ),
      false
    );

    await check(
      'Event Organizer-only cannot create Startup notification',
      notification(
        organizer,
        'eventOrganizer',
        'organizerMessage',
        'message'
      ),
      false
    );

    await check(
      'Founder can create normal Startup notification',
      notification(
        founder,
        'founder',
        'founderMessage',
        'message'
      ),
      true
    );

    await check(
      'Admin cannot spoof notification actor',
      notification(
        admin,
        'founder',
        'spoofedActor'
      ),
      false
    );

    // Malformed professional role isolation.

    await check(
      'Malformed roles cannot read private Startup contact',
      getDoc(
        doc(
          malformed,
          'contacts',
          'malformedContact'
        )
      ),
      false
    );

    await check(
      'Malformed roles cannot update private Startup contact',
      updateDoc(
        doc(
          malformed,
          'contacts',
          'malformedContact'
        ),
        {
          name: 'Unauthorized Update',
        }
      ),
      false
    );

    console.log(
      'TOTAL FINAL PORTAL SECURITY CHECKS PASSED:',
      passed
    );

  } finally {
    try {
      await testEnv.clearFirestore();
    } finally {
      await testEnv.cleanup();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
