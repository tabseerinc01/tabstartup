const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

if (
  process.env.FIRESTORE_EMULATOR_HOST !==
    '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !==
    '127.0.0.1:9099' ||
  process.env.VERCEL === '1'
) {
  throw new Error('LOCAL_EMULATOR_REQUIRED');
}

require('./identity-runtime-loader.cjs');

const {
  getFirebaseAdmin,
} = require('../src/firebase/admin.ts');

const {
  updateOwnProfile,
  activateOwnProfessionalRole,
} = require(
  '../src/services/profile-mutation.service.ts'
);

const {
  deleteApp,
} = require('firebase-admin/app');

async function main() {
  const { adminDb, adminApp } =
    getFirebaseAdmin();

  const prefix =
    'profile-security-' + randomUUID();

  const cleanup = new Map();

  let passed = 0;

  function pass(label) {
    passed++;
    console.log('PASS:', label);
  }

  function ref(collection, id) {
    const document = adminDb
      .collection(collection)
      .doc(id);

    cleanup.set(document.path, document);

    return document;
  }

  async function seed(
    name,
    options = {}
  ) {
    const uid = prefix + '-' + name;

    const userRef = ref('users', uid);
    const publicRef = ref('publicProfiles', uid);
    const identityRef = ref('accountIdentities', uid);

    if (options.startup !== false) {
      await userRef.set({
        uid,
        email: uid + '@example.test',
        fullName: 'Test Founder',
        role: 'founder',
        roles: ['founder'],
        status: 'active',
        bio: '',
        location: '',
        ...options.startup,
      });
    }

    if (options.identity !== false) {
      await identityRef.set({
        uid,
        email: uid + '@example.test',
        schemaVersion: 1,
        status: 'active',
        ...options.identity,
      });
    }

    if (options.eventOrganizer) {
      await ref(
        'eventOrganizerProfiles',
        uid
      ).set({
        uid,
        schemaVersion: 1,
        status: 'active',
        organizerType: 'individual',
        displayName: 'Test Event Organizer',
        verificationStatus: 'approved',
      });
    }

    return {
      uid,
      userRef,
      publicRef,
      identityRef,
    };
  }

  async function referral(
    uid,
    suffix = 'primary'
  ) {
    const document = ref(
      'referrals',
      uid + '-' + suffix
    );

    await document.set({
      referrerUid: prefix + '-referrer',
      referredUid: uid,
      referredProfileCompleted: false,
      rewardGranted: false,
    });

    return document;
  }

  const completedProfile = {
    fullName: 'Updated Founder',
    bio: 'Building a technology startup.',
    location: 'Dhaka',
  };

  try {
    // 1. Valid Startup profile update.

    const valid = await seed('valid');

    await updateOwnProfile(
      valid.uid,
      completedProfile
    );

    const validData =
      (await valid.userRef.get()).data();

    assert.equal(
      validData.bio,
      completedProfile.bio
    );

    assert.equal(
      (await valid.publicRef.get()).exists,
      true
    );

    pass('Valid Startup profile mutation');

    // 2. Valid professional role activation.

    await activateOwnProfessionalRole(
      valid.uid,
      'mentor'
    );

    assert.ok(
      (await valid.userRef.get())
        .data().roles.includes('mentor')
    );

    pass('Valid professional role activation');

    // 3. Unauthorized role escalation.

    await assert.rejects(
      activateOwnProfessionalRole(
        valid.uid,
        'admin'
      ),
      /INVALID_ROLE/
    );

    pass('Admin role self-activation denied');

    // 4. Event Organizer-only account.

    const organizer = await seed(
      'event-organizer-only',
      {
        startup: false,
        eventOrganizer: true,
      }
    );

    await assert.rejects(
      updateOwnProfile(
        organizer.uid,
        completedProfile
      ),
      /USER_NOT_FOUND/
    );

    pass('Event Organizer-only mutation denied');

    await assert.rejects(
      activateOwnProfessionalRole(
        organizer.uid,
        'founder'
      ),
      /USER_NOT_FOUND/
    );

    pass('Event Organizer-only role activation denied');

    // 5. Global suspension.

    const suspended = await seed(
      'global-suspended',
      {
        identity: {
          status: 'suspended',
        },
      }
    );

    await assert.rejects(
      updateOwnProfile(
        suspended.uid,
        completedProfile
      ),
      /USER_SUSPENDED/
    );

    pass('Global suspension blocks profile mutation');

    await assert.rejects(
      activateOwnProfessionalRole(
        suspended.uid,
        'mentor'
      ),
      /USER_SUSPENDED/
    );

    pass('Global suspension blocks role activation');

    // 6. Legacy suspension.

    const legacySuspended = await seed(
      'legacy-suspended',
      {
        startup: {
          status: 'suspended',
        },
      }
    );

    await assert.rejects(
      updateOwnProfile(
        legacySuspended.uid,
        completedProfile
      ),
      /USER_SUSPENDED/
    );

    pass('Legacy suspension blocks mutation');

    // 7. Invalid global identity.

    const invalidIdentity = await seed(
      'invalid-identity',
      {
        identity: {
          schemaVersion: 999,
        },
      }
    );

    await assert.rejects(
      updateOwnProfile(
        invalidIdentity.uid,
        completedProfile
      ),
      /INVALID_ACCOUNT_IDENTITY/
    );

    pass('Malformed global identity denied');

    // 8. Malformed professional roles.

    const malformed = await seed(
      'malformed-roles',
      {
        startup: {
          roles: 'founder',
        },
      }
    );

    await assert.rejects(
      updateOwnProfile(
        malformed.uid,
        completedProfile
      ),
      /INVALID_STARTUP_PROFILE/
    );

    pass('Malformed professional roles denied');

    await assert.rejects(
      activateOwnProfessionalRole(
        malformed.uid,
        'mentor'
      ),
      /INVALID_STARTUP_PROFILE/
    );

    pass('Malformed roles cannot activate new role');

    // 9. Non-professional account.

    const nonProfessional = await seed(
      'non-professional',
      {
        startup: {
          role: 'user',
          roles: ['user'],
        },
      }
    );

    await assert.rejects(
      updateOwnProfile(
        nonProfessional.uid,
        completedProfile
      ),
      /INVALID_STARTUP_PROFILE/
    );

    pass('Non-professional Startup mutation denied');

    // 10. Historical profile compatibility.

    const historical = await seed(
      'historical',
      {
        identity: false,
      }
    );

    await historical.userRef.set({
      fullName: 'Historical Founder',
      role: 'founder',
    });

    await updateOwnProfile(
      historical.uid,
      completedProfile
    );

    pass('Historical professional profile supported');

    // 11. Complete referral qualification.

    const qualified = await seed('qualified');

    const qualifiedReferral =
      await referral(qualified.uid);

    await updateOwnProfile(
      qualified.uid,
      completedProfile
    );

    let qualifiedData =
      (await qualifiedReferral.get()).data();

    assert.equal(
      qualifiedData.referredProfileCompleted,
      true
    );

    pass('Complete profile qualifies referral');

    assert.equal(
      qualifiedData.rewardGranted,
      false
    );

    pass('Qualification does not grant reward');

    // 12. Idempotency.

    await updateOwnProfile(
      qualified.uid,
      completedProfile
    );

    qualifiedData =
      (await qualifiedReferral.get()).data();

    assert.equal(
      qualifiedData.referredProfileCompleted,
      true
    );

    assert.equal(
      qualifiedData.rewardGranted,
      false
    );

    pass('Repeated qualification is idempotent');

    // 13. Incomplete profile.

    const incomplete = await seed('incomplete');

    const incompleteReferral =
      await referral(incomplete.uid);

    await updateOwnProfile(
      incomplete.uid,
      {
        bio: 'Startup description',
      }
    );

    assert.equal(
      (await incompleteReferral.get())
        .data().referredProfileCompleted,
      false
    );

    pass('Incomplete profile remains pending');

    // 14. Whitespace-only profile field.

    const whitespace = await seed('whitespace');

    const whitespaceReferral =
      await referral(whitespace.uid);

    await updateOwnProfile(
      whitespace.uid,
      {
        ...completedProfile,
        bio: '   ',
      }
    );

    assert.equal(
      (await whitespaceReferral.get())
        .data().referredProfileCompleted,
      false
    );

    pass('Whitespace-only profile cannot qualify');

    // 15. Duplicate referral records.

    const duplicate = await seed('duplicate');

    const duplicateA =
      await referral(duplicate.uid, 'a');

    const duplicateB =
      await referral(duplicate.uid, 'b');

    await updateOwnProfile(
      duplicate.uid,
      completedProfile
    );

    assert.equal(
      (await duplicateA.get())
        .data().referredProfileCompleted,
      false
    );

    assert.equal(
      (await duplicateB.get())
        .data().referredProfileCompleted,
      false
    );

    pass('Duplicate referrals are not auto-qualified');

    // 16. Suspended account cannot qualify.

    const suspendedReferral =
      await referral(suspended.uid);

    await assert.rejects(
      updateOwnProfile(
        suspended.uid,
        completedProfile
      ),
      /USER_SUSPENDED/
    );

    assert.equal(
      (await suspendedReferral.get())
        .data().referredProfileCompleted,
      false
    );

    pass('Suspended account cannot qualify referral');

    // 17. Unauthorized field mutation.

    await assert.rejects(
      updateOwnProfile(
        valid.uid,
        {
          roles: ['admin'],
        }
      ),
      /INVALID_PROFILE_UPDATE/
    );

    pass('Direct role field mutation denied');

    await assert.rejects(
      updateOwnProfile(
        valid.uid,
        {
          referralCount: 999,
        }
      ),
      /INVALID_PROFILE_UPDATE/
    );

    pass('Direct referral count mutation denied');

    await assert.rejects(
      updateOwnProfile(
        valid.uid,
        {
          rewardGranted: true,
        }
      ),
      /INVALID_PROFILE_UPDATE/
    );

    pass('Direct reward field mutation denied');

    console.log(
      'TOTAL PROFILE MUTATION SECURITY CHECKS PASSED:',
      passed
    );

  } finally {
    try {
      const documents =
        Array.from(cleanup.values());

      for (
        let i = 0;
        i < documents.length;
        i += 400
      ) {
        const batch = adminDb.batch();

        for (
          const document of
          documents.slice(i, i + 400)
        ) {
          batch.delete(document);
        }

        await batch.commit();
      }
    } finally {
      await deleteApp(adminApp);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
