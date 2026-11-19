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

const {
  createAccountEmailVerification,
  parseAccountEmailVerification,
} = require('../src/services/email/account-email-verification-schema.ts');

const {
  createPendingEmailOtpChallenge,
} = require('../src/services/email/email-otp-schema.ts');

const {
  ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION,
  EMAIL_VERIFICATION_CHALLENGES_COLLECTION,
} = require('../src/lib/email-verification.ts');

const {
  revokeTransactionalEmailVerification,
} = require('../src/services/email/email-verification-revocation.service.ts');

const {
  prepareEmailOtpRateLimit,
} = require('../src/services/email/email-otp-rate-limit.service.ts');

const {
  createEmailOtpRateLimitKey,
} = require('../src/services/email/email-otp-crypto.service.ts');

const {
  EMAIL_VERIFICATION_RATE_LIMITS_COLLECTION,
  EMAIL_OTP_POLICY,
} = require('../src/lib/email-verification.ts');

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

  async function seedOtp(fixture, malformed = false) {
    const authorityRef = adminDb
      .collection(ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION)
      .doc(fixture.uid);

    const challengeRef = adminDb
      .collection(EMAIL_VERIFICATION_CHALLENGES_COLLECTION)
      .doc(fixture.uid);

    fixtures.push(authorityRef, challengeRef);

    const nowMs = Date.now();

    const binding = {
      uid: fixture.uid,
      email: fixture.uid + '@example.com',
      authAccountCreatedAt:
        new Date(nowMs - 86400000).toISOString(),
    };

    const authority = createAccountEmailVerification({
      ...binding,
      challengeId: 'a'.repeat(64),
      nowMs,
    });

    const challenge = createPendingEmailOtpChallenge({
      ...binding,
      challengeId: 'b'.repeat(64),
      codeDigest: 'c'.repeat(64),
      nowMs,
    });

    const batch = adminDb.batch();

    batch.set(
      authorityRef,
      malformed
        ? { ...authority, schemaVersion: 999 }
        : authority
    );

    batch.set(challengeRef, challenge);

    await batch.commit();

    return { authorityRef, challengeRef, authority };
  }

  async function assertOtpRevoked(fixture, otp) {
    const snapshot = await otp.authorityRef.get();

    assert.equal(snapshot.exists, true);

    const record = parseAccountEmailVerification(
      fixture.uid,
      snapshot.data()
    );

    assert.equal(record.status, 'revoked');
    assert.equal(
      record.verifiedEmail,
      otp.authority.verifiedEmail
    );

    assert.equal(
      record.verificationChallengeId,
      otp.authority.verificationChallengeId
    );

    assert.deepEqual(
      record.verifiedAt,
      otp.authority.verifiedAt
    );

    assert.ok(record.revokedAt);

    assert.equal(
      (await otp.challengeRef.get()).exists,
      false
    );

    await assertNoPublication(fixture);

    return record;
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

    const otpFixture = await seed('otp_revocation', {
      startup: {},
      eventOrganizer: {},
      publications: true,
    });

    const otp = await seedOtp(otpFixture);

    const organizerBeforeOtp =
      await otpFixture.eventOrganizerRef.get();

    await setGlobalAccountStatus(
      otpFixture.uid,
      'suspended'
    );

    const revoked = await assertOtpRevoked(
      otpFixture,
      otp
    );

    pass('global_suspension_revokes_otp_authority');
    pass('global_suspension_invalidates_otp_challenge');

    await setGlobalAccountStatus(
      otpFixture.uid,
      'active'
    );

    const reactivatedAuthority =
      await assertOtpRevoked(otpFixture, otp);

    assert.deepEqual(reactivatedAuthority, revoked);

    assert.deepEqual(
      (await otpFixture.eventOrganizerRef.get()).data(),
      organizerBeforeOtp.data()
    );

    pass('reactivation_does_not_restore_otp_authority');
    pass('otp_revocation_preserves_organizer_profile');

    const malformedFixture = await seed(
      'malformed_otp_authority',
      { startup: {}, publications: true }
    );

    const malformedOtp = await seedOtp(
      malformedFixture,
      true
    );

    await setGlobalAccountStatus(
      malformedFixture.uid,
      'suspended'
    );

    assert.equal(
      (await malformedOtp.authorityRef.get()).exists,
      false
    );

    assert.equal(
      (await malformedOtp.challengeRef.get()).exists,
      false
    );

    await assertNoPublication(malformedFixture);

    pass('malformed_otp_authority_removed_on_suspension');

    const concurrentOtpFixture = await seed(
      'concurrent_otp_revocation',
      { startup: {}, publications: true }
    );

    const concurrentOtp = await seedOtp(
      concurrentOtpFixture
    );

    const concurrentOtpResults = await Promise.all(
      Array.from(
        { length: 5 },
        () => setGlobalAccountStatus(
          concurrentOtpFixture.uid,
          'suspended'
        )
      )
    );

    assert.equal(
      concurrentOtpResults.filter(r => r.changed).length,
      1
    );

    await assertOtpRevoked(
      concurrentOtpFixture,
      concurrentOtp
    );

    pass('concurrent_suspension_revokes_otp_safely');

    const replacementFixture = await seed(
      'otp_atomic_replacement',
      { startup: {}, publications: true }
    );

    const replacementOtp =
      await seedOtp(replacementFixture);

    const freshChallenge =
      createPendingEmailOtpChallenge({
        uid: replacementFixture.uid,
        email: 'changed-' + replacementFixture.uid + '@example.com',
        authAccountCreatedAt:
          replacementOtp.authority.authAccountCreatedAt,
        challengeId: 'd'.repeat(64),
        codeDigest: 'e'.repeat(64),
        nowMs: Date.now(),
      });

    await adminDb.runTransaction(async transaction => {
      const result =
        await revokeTransactionalEmailVerification({
          transaction,
          db: adminDb,
          uid: replacementFixture.uid,
          publicationPolicy: 'remove',
        });

      assert.equal(result.authorityRevoked, true);
      assert.equal(result.challengeInvalidated, true);
      assert.equal(result.publicationsRemoved, 3);

      transaction.set(
        replacementOtp.challengeRef,
        freshChallenge
      );
    });

    const replacedAuthority =
      parseAccountEmailVerification(
        replacementFixture.uid,
        (await replacementOtp.authorityRef.get()).data()
      );

    assert.equal(replacedAuthority.status, 'revoked');

    const replacedChallenge =
      (await replacementOtp.challengeRef.get()).data();

    assert.deepEqual(replacedChallenge, freshChallenge);

    for (const ref of replacementFixture.professionalRefs) {
      assert.equal((await ref.get()).exists, false);
    }

    pass('atomic_revocation_and_fresh_challenge_replacement');

    const rollbackFixture = await seed(
      'otp_revocation_rollback',
      { startup: {}, publications: true }
    );

    const rollbackOtp = await seedOtp(rollbackFixture);

    const beforeAuthority =
      (await rollbackOtp.authorityRef.get()).data();

    const beforeChallenge =
      (await rollbackOtp.challengeRef.get()).data();

    await assert.rejects(
      () => adminDb.runTransaction(async transaction => {
        await revokeTransactionalEmailVerification({
          transaction,
          db: adminDb,
          uid: rollbackFixture.uid,
          publicationPolicy: 'remove',
        });

        throw new Error('INTENTIONAL_ROLLBACK');
      }),
      /INTENTIONAL_ROLLBACK/
    );

    assert.deepEqual(
      (await rollbackOtp.authorityRef.get()).data(),
      beforeAuthority
    );

    assert.deepEqual(
      (await rollbackOtp.challengeRef.get()).data(),
      beforeChallenge
    );

    for (const ref of rollbackFixture.professionalRefs) {
      assert.equal((await ref.get()).exists, true);
    }

    pass('failed_transaction_preserves_authority_and_challenge');

    // Test-only HMAC secret. Never use production credentials.
    process.env.EMAIL_OTP_SECRET = 'f'.repeat(64);

    const rateFixture = await seed(
      'otp_rate_concurrency',
      { startup: {} }
    );

    const rateInput = {
      action: 'send',
      uid: rateFixture.uid,
      email: rateFixture.uid + '@example.com',
      ip: '192.0.2.10',
    };

    const rateRefs = [
      ['uid', rateInput.uid],
      ['email', rateInput.email],
      ['ip', rateInput.ip],
    ].map(([scope, value]) =>
      adminDb
        .collection(EMAIL_VERIFICATION_RATE_LIMITS_COLLECTION)
        .doc(createEmailOtpRateLimitKey('send', scope, value))
    );

    // Fail safely if the test namespace already exists.
    for (const ref of rateRefs) {
      assert.equal((await ref.get()).exists, false);
    }

    fixtures.push(...rateRefs);

    const rateResults = await Promise.all(
      Array.from(
        { length: EMAIL_OTP_POLICY.maxSendPerUid + 2 },
        () => adminDb.runTransaction(async transaction => {
          const limit = await prepareEmailOtpRateLimit(
            transaction,
            adminDb,
            rateInput,
            Date.now()
          );

          if (limit.result.allowed) {
            limit.apply();
          }

          return limit.result;
        })
      )
    );

    assert.equal(
      rateResults.filter(r => r.allowed).length,
      EMAIL_OTP_POLICY.maxSendPerUid
    );

    assert.equal(
      rateResults.filter(r => !r.allowed).length,
      2
    );

    for (const ref of rateRefs) {
      assert.equal(
        (await ref.get()).data().count,
        EMAIL_OTP_POLICY.maxSendPerUid
      );
    }

    pass('concurrent_otp_rate_limit_enforced');

    const rateBefore = await Promise.all(
      rateRefs.map(ref => ref.get())
    );

    const blocked = await adminDb.runTransaction(
      async transaction => {
        const limit = await prepareEmailOtpRateLimit(
          transaction,
          adminDb,
          rateInput,
          Date.now()
        );

        assert.equal(limit.result.allowed, false);

        assert.throws(
          () => limit.apply(),
          /EMAIL_OTP_RATE_LIMIT_EXCEEDED/
        );

        return limit.result;
      }
    );

    assert.ok(blocked.retryAfterSeconds > 0);

    for (let i = 0; i < rateRefs.length; i++) {
      assert.deepEqual(
        (await rateRefs[i].get()).data(),
        rateBefore[i].data()
      );
    }

    pass('blocked_rate_limit_does_not_modify_counters');

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
