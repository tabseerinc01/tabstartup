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

const {
  syncPublicProfile,
  setUserProfessionalRole,
  setUserSuspension,
} = require(
  '../src/services/public-profile.service.ts'
);

const {
  buildProfessionalProfile,
  getProfessionalProfileId,
} = require(
  '../src/lib/professional-profile.ts'
);

const {
  Timestamp,
} = require('firebase-admin/firestore');

const {
  createAccountEmailVerification,
} = require(
  '../src/services/email/account-email-verification-schema.ts'
);

const {
  normalizeAuthAccountCreatedAt,
} = require(
  '../src/lib/email-verification.ts'
);

const {
  isCustomEmailVerificationPublicationReady,
} = require(
  '../src/services/email/email-verification-transaction.service.ts'
);

async function main() {
  const { adminDb, adminApp, adminAuth } =
    getFirebaseAdmin();

  const prefix =
    'profile-security-' + randomUUID();

  assert.equal(
    adminApp.options.projectId,
    'demo-tabstartup'
  );

  const cleanup = new Map();
  const authCleanup = new Set();

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

    const professionalRefs = Object.fromEntries(
      ['founder', 'investor', 'mentor'].map(role => [
        role,
        ref(
          'professionalProfiles',
          getProfessionalProfileId(uid, role)
        ),
      ])
    );

    if (options.auth !== false) {
      await adminAuth.createUser({
        uid,
        email: uid + '@example.test',
        emailVerified: options.emailVerified !== false,
        disabled: options.disabled === true,
      });

      authCleanup.add(uid);
    }

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
      professionalRefs,
    };
  }

  async function assertNoPublication(fixture) {
    const snapshots = await Promise.all([
      fixture.publicRef.get(),
      ...Object.values(
        fixture.professionalRefs
      ).map(document => document.get()),
    ]);

    for (const snapshot of snapshots) {
      assert.equal(
        snapshot.exists,
        false,
        'Unexpected publication: ' + snapshot.ref.path
      );
    }
  }

  const readyProfile = {
    fullName: 'Publication Test Founder',
    bio: 'Building a technology startup.',
    location: 'Dhaka',
    headline: 'Technology Founder',
    imageUrl: 'https://example.com/photo.jpg',
    skills: ['Technology'],
    investorBio: 'Investing in technology startups.',
    investmentFocus: ['Technology'],
    preferredStage: ['Seed'],
    ticketSize: '$10,000 - $50,000',
    mentorBio: 'Supporting startup founders.',
    mentorSkills: ['Business Strategy'],
    yearsOfExperience: '10 years',
    mentorAvailability: 'Available',
  };

  async function seedPublication(
    fixture,
    role,
    overrides = {}
  ) {
    const canonical = {
      ...(await fixture.userRef.get()).data(),
      ...overrides,
    };

    const projection = buildProfessionalProfile(
      canonical,
      role,
      {
        uid: fixture.uid,
        emailVerified: true,
        accountActive: true,
        publicationAuthorized: true,
      }
    );

    const publishedAt = Timestamp.now();

    await fixture.professionalRefs[role].set({
      ...projection,
      publishedAt,
      updatedAt: publishedAt,
    });

    return publishedAt;
  }

  async function seedEmailAuthority(
    fixture,
    options = {}
  ) {
    const authUser = await adminAuth.getUser(
      fixture.uid
    );

    assert.equal(authUser.uid, fixture.uid);
    assert.ok(authUser.email);
    assert.equal(authUser.disabled, false);

    const authorityRef = ref(
      'accountEmailVerifications',
      fixture.uid
    );

    const record =
      createAccountEmailVerification({
        uid: fixture.uid,
        email: authUser.email,
        authAccountCreatedAt:
          normalizeAuthAccountCreatedAt(
            authUser.metadata.creationTime
          ),
        challengeId: 'b'.repeat(64),
        nowMs: Date.now(),
      });

    if (options.revoked === true) {
      const revokedAt = Timestamp.fromMillis(
        Math.max(
          Date.now(),
          record.verifiedAt.toMillis()
        )
      );

      record.status = 'revoked';
      record.revokedAt = revokedAt;
      record.updatedAt = revokedAt;
    }

    await authorityRef.set(record);

    return authorityRef;
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

    await assertNoPublication(valid);

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

    await assertNoPublication(valid);

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

    // 18. Ready private profile must remain private.

    const draft = await seed('ready-draft', {
      startup: readyProfile,
    });

    await updateOwnProfile(draft.uid, {
      headline: 'Updated Technology Founder',
    });

    await syncPublicProfile(draft.uid);
    await assertNoPublication(draft);

    pass('Ready profile save and sync do not publish');

    // 19. Existing publication synchronization.

    const published = await seed('published', {
      startup: readyProfile,
    });

    const originalPublishedAt =
      await seedPublication(published, 'founder');

    await updateOwnProfile(published.uid, {
      headline: 'Updated Published Founder',
    });

    const updatedPublication = (
      await published.professionalRefs.founder.get()
    ).data();

    assert.equal(
      updatedPublication.headline,
      'Updated Published Founder'
    );

    assert.deepEqual(
      updatedPublication.publishedAt,
      originalPublishedAt
    );

    assert.equal(
      (await published.publicRef.get()).exists,
      false
    );

    pass('Published profile sync preserves publication time');

    // 20. Required field removal.

    await updateOwnProfile(published.uid, {
      bio: '',
    });

    await assertNoPublication(published);

    pass('Required field removal unpublishes founder');

    await updateOwnProfile(published.uid, {
      bio: readyProfile.bio,
    });

    await assertNoPublication(published);

    pass('Restoring readiness does not republish');

    // 21. Email verification loss.

    const unverified = await seed('unverified', {
      startup: readyProfile,
      emailVerified: false,
    });

    await seedPublication(unverified, 'founder');

    await updateOwnProfile(unverified.uid, {
      headline: 'Unverified Founder',
    });

    await assertNoPublication(unverified);

    pass('Unverified email removes existing publication');

    // 22. Stale publication on self role activation.

    const stale = await seed('stale-role', {
      startup: readyProfile,
    });

    await seedPublication(stale, 'mentor', {
      roles: ['founder', 'mentor'],
    });

    await activateOwnProfessionalRole(
      stale.uid,
      'mentor'
    );

    assert.ok(
      (await stale.userRef.get())
        .data().roles.includes('mentor')
    );

    await assertNoPublication(stale);

    pass('Self role activation removes stale publication');

    // 23. Admin role enablement does not publish.

    const adminRole = await seed('admin-role', {
      startup: readyProfile,
    });

    await setUserProfessionalRole(
      adminRole.uid,
      'mentor',
      true
    );

    await assertNoPublication(adminRole);

    pass('Admin role enablement does not publish');

    // 24. Role removal preserves other publications.

    await seedPublication(adminRole, 'founder');
    await seedPublication(adminRole, 'mentor');

    await setUserProfessionalRole(
      adminRole.uid,
      'mentor',
      false
    );

    assert.equal(
      (await adminRole.professionalRefs.mentor.get())
        .exists,
      false
    );

    assert.equal(
      (await adminRole.professionalRefs.founder.get())
        .exists,
      true
    );

    pass('Admin role removal preserves unaffected role');

    await assert.rejects(
      setUserProfessionalRole(
        adminRole.uid,
        'founder',
        false
      ),
      /LAST_PROFESSIONAL_ROLE/
    );

    pass('Last professional role removal denied');

    // 25. Legacy suspension and reactivation.

    const suspension = await seed('suspension', {
      startup: {
        ...readyProfile,
        roles: ['founder', 'investor', 'mentor'],
      },
    });

    for (const role of [
      'founder', 'investor', 'mentor'
    ]) {
      await seedPublication(suspension, role);
    }

    await suspension.publicRef.set({
      uid: suspension.uid,
      roles: ['founder', 'investor', 'mentor'],
    });

    await setUserSuspension(suspension.uid, true);

    await assertNoPublication(suspension);

    pass('Legacy suspension removes all publications');

    await setUserSuspension(suspension.uid, false);

    await assertNoPublication(suspension);

    pass('Legacy reactivation does not republish');

    // 26. Missing Auth account cleanup.

    const missingAuth = await seed('missing-auth', {
      startup: readyProfile,
      auth: false,
    });

    await seedPublication(missingAuth, 'founder');

    await missingAuth.publicRef.set({
      uid: missingAuth.uid,
      roles: ['founder'],
    });

    await syncPublicProfile(missingAuth.uid);

    await assertNoPublication(missingAuth);

    pass('Missing Auth account sync removes publications');

    await assert.rejects(
      setUserProfessionalRole(
        missingAuth.uid,
        'mentor',
        true
      ),
      /ACCOUNT_NOT_ACTIVE/
    );

    pass('Missing Auth account cannot enable role');

    // Missing Auth must also block self mutation.

    await assert.rejects(
      updateOwnProfile(
        missingAuth.uid,
        completedProfile
      ),
      /ACCOUNT_NOT_ACTIVE/
    );

    await assert.rejects(
      activateOwnProfessionalRole(
        missingAuth.uid,
        'mentor'
      ),
      /ACCOUNT_NOT_ACTIVE/
    );

    pass('Missing Auth account cannot mutate profile');

    // Internal administrative cleanup must remain
    // possible without an authentication record.

    const orphanRole = await seed(
      'orphan-role-removal',
      {
        auth: false,
        startup: {
          ...readyProfile,
          roles: ['founder', 'mentor'],
        },
      }
    );

    await seedPublication(orphanRole, 'founder');
    await seedPublication(orphanRole, 'mentor');

    await orphanRole.publicRef.set({
      uid: orphanRole.uid,
      roles: ['founder', 'mentor'],
    });

    await setUserProfessionalRole(
      orphanRole.uid,
      'mentor',
      false
    );

    assert.deepEqual(
      (await orphanRole.userRef.get()).data().roles,
      ['founder']
    );

    await assertNoPublication(orphanRole);

    pass('Missing Auth internal role removal cleans publications');

    // 27. Disabled Auth account.

    const disabled = await seed('disabled-auth', {
      startup: readyProfile,
      disabled: true,
    });

    await assert.rejects(
      updateOwnProfile(disabled.uid, completedProfile),
      /ACCOUNT_NOT_ACTIVE/
    );

    await assert.rejects(
      activateOwnProfessionalRole(disabled.uid, 'mentor'),
      /ACCOUNT_NOT_ACTIVE/
    );

    pass('Disabled Auth account cannot mutate profile');

    // 28. Frozen legacy projection.

    const frozen = await seed('frozen-legacy', {
      startup: readyProfile,
    });

    const legacyData = {
      uid: frozen.uid,
      fullName: 'Original Legacy Name',
      roles: ['founder'],
    };

    await frozen.publicRef.set(legacyData);

    await updateOwnProfile(frozen.uid, {
      fullName: 'New Private Name',
    });

    await activateOwnProfessionalRole(
      frozen.uid,
      'mentor'
    );

    await syncPublicProfile(frozen.uid);

    assert.deepEqual(
      (await frozen.publicRef.get()).data(),
      legacyData
    );

    pass('Legacy projection remains frozen');


    // 29. Custom OTP authority cannot authorize
    // publication while the release gate is closed.

    assert.equal(
      isCustomEmailVerificationPublicationReady(),
      false,
      'CUSTOM_PUBLICATION_GATE_MUST_REMAIN_CLOSED'
    );

    const customMutation = await seed(
      'custom-mutation',
      {
        startup: readyProfile,
        emailVerified: false,
      }
    );

    await seedEmailAuthority(customMutation);

    await seedPublication(
      customMutation,
      'founder'
    );

    await updateOwnProfile(
      customMutation.uid,
      {
        headline: 'Custom OTP Founder',
      }
    );

    await assertNoPublication(customMutation);

    assert.equal(
      (await adminAuth.getUser(
        customMutation.uid
      )).emailVerified,
      false
    );

    pass(
      'Custom OTP cannot preserve publication while gate closed'
    );

    // 30. Custom OTP cannot bypass public sync.

    const customSync = await seed(
      'custom-sync',
      {
        startup: readyProfile,
        emailVerified: false,
      }
    );

    await seedEmailAuthority(customSync);

    await seedPublication(
      customSync,
      'founder'
    );

    await syncPublicProfile(customSync.uid);

    await assertNoPublication(customSync);

    pass(
      'Custom OTP cannot bypass publication synchronization gate'
    );

    // 31. Role activation remains independent
    // from publication authorization.

    const customRole = await seed(
      'custom-role',
      {
        startup: readyProfile,
        emailVerified: false,
      }
    );

    await seedEmailAuthority(customRole);

    await activateOwnProfessionalRole(
      customRole.uid,
      'mentor'
    );

    const customRoleData =
      (await customRole.userRef.get()).data();

    assert.ok(
      customRoleData.roles.includes('mentor')
    );

    await assertNoPublication(customRole);

    pass(
      'Custom OTP role activation does not publish profiles'
    );

    // 32. Revoked authority cannot preserve
    // an existing professional publication.

    const revokedCustom = await seed(
      'revoked-custom',
      {
        startup: readyProfile,
        emailVerified: false,
      }
    );

    await seedEmailAuthority(
      revokedCustom,
      { revoked: true }
    );

    await seedPublication(
      revokedCustom,
      'founder'
    );

    await syncPublicProfile(revokedCustom.uid);

    await assertNoPublication(revokedCustom);

    pass(
      'Revoked custom authority removes existing publication'
    );

    // 33. Native verification remains independent
    // from malformed custom authority.

    const nativeMalformed = await seed(
      'native-malformed',
      {
        startup: readyProfile,
        emailVerified: true,
      }
    );

    await ref(
      'accountEmailVerifications',
      nativeMalformed.uid
    ).set({
      schemaVersion: 999,
      invalid: true,
    });

    const nativePublishedAt =
      await seedPublication(
        nativeMalformed,
        'founder'
      );

    await updateOwnProfile(
      nativeMalformed.uid,
      {
        headline: 'Native Verified Founder',
      }
    );

    const nativeMalformedSnap =
      await nativeMalformed
        .professionalRefs.founder.get();

    assert.equal(
      nativeMalformedSnap.exists,
      true
    );

    assert.equal(
      nativeMalformedSnap
        .data().headline,
      'Native Verified Founder'
    );

    assert.equal(
      nativeMalformedSnap
        .data().publishedAt.toMillis(),
      nativePublishedAt.toMillis()
    );

    pass(
      'Native verification survives malformed custom authority'
    );

    // 34. Revoking custom authority must not
    // revoke independent native verification.

    const nativeRevoked = await seed(
      'native-revoked',
      {
        startup: readyProfile,
        emailVerified: true,
      }
    );

    await seedEmailAuthority(
      nativeRevoked,
      { revoked: true }
    );

    const nativeRevokedPublishedAt =
      await seedPublication(
        nativeRevoked,
        'founder'
      );

    await syncPublicProfile(nativeRevoked.uid);

    const nativeRevokedSnap =
      await nativeRevoked
        .professionalRefs.founder.get();

    assert.equal(
      nativeRevokedSnap.exists,
      true
    );

    assert.equal(
      nativeRevokedSnap
        .data().publishedAt.toMillis(),
      nativeRevokedPublishedAt.toMillis()
    );

    assert.equal(
      (await adminAuth.getUser(
        nativeRevoked.uid
      )).emailVerified,
      true
    );

    pass(
      'Native verification survives revoked custom authority'
    );

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
      try {
        for (const uid of authCleanup) {
          await adminAuth.deleteUser(uid);
        }
      } finally {
        await deleteApp(adminApp);
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
