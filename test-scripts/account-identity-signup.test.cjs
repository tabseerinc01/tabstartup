require('./identity-runtime-loader.cjs');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deleteApp } = require('firebase-admin/app');

const {
  getFirebaseAdmin,
} = require('../src/firebase/admin.ts');

const {
  createSignupProfile,
} = require('../src/services/signup.service.ts');

const {
  validateSignup,
} = require('../src/lib/signup-validation.ts');

const {
  resolveAccountIdentity,
} = require('../src/services/account-identity.service.ts');

async function main() {
  const {
    adminApp,
    adminAuth,
    adminDb,
  } = getFirebaseAdmin();

  assert.equal(
    adminApp.options.projectId,
    'demo-tabstartup'
  );

  const prefix =
    'identity_signup_test_' +
    randomUUID().replace(/-/g, '');

  const fixtures = [];
  const authUsers = [];

  let passed = 0;

  function pass(name) {
    passed++;
    console.log('PASS: ' + name);
  }

  async function seed(name, role = 'founder') {
    const uid = prefix + '_' + name;

    const validated = validateSignup({
      fullName: 'Test ' + name,
      email: uid + '@example.com',
      password: 'LocalTestPassword123!',
      role,
    });

    const { password, ...input } = validated;

    const refs = {
      identity: adminDb
        .collection('accountIdentities').doc(uid),

      startup: adminDb
        .collection('users').doc(uid),

      public: adminDb
        .collection('publicProfiles').doc(uid),

      referral: adminDb
        .collection('referrals')
        .doc('referral_' + uid),
    };

    const fixture = {
      uid,
      input,
      refs,
    };

    fixtures.push(fixture);

    await adminAuth.createUser({
      uid,
      email: input.email,
      password,
      displayName: input.fullName,
    });

    authUsers.push(uid);

    return fixture;
  }

  async function signup(fixture, referralCode = null) {
    return createSignupProfile(
      fixture.uid,
      {
        ...fixture.input,
        referralCode,
      }
    );
  }

  async function verifySuccess(
    fixture,
    result,
    referralApplied = false
  ) {
    assert.equal(result.success, true);
    assert.equal(result.uid, fixture.uid);

    assert.equal(
      result.referralApplied,
      referralApplied
    );

    assert.match(
      result.referralCode,
      /^TAB-[A-Z0-9]{10}$/
    );

    const codeRef = adminDb
      .collection('referralCodes')
      .doc(result.referralCode);

    const [
      identity,
      startup,
      publicProfile,
      code,
      referral,
    ] = await adminDb.getAll(
      fixture.refs.identity,
      fixture.refs.startup,
      fixture.refs.public,
      codeRef,
      fixture.refs.referral
    );

    assert.equal(identity.exists, true);
    assert.equal(startup.exists, true);
    assert.equal(publicProfile.exists, true);
    assert.equal(code.exists, true);

    assert.equal(
      referral.exists,
      referralApplied
    );

    const identityData = identity.data();
    const startupData = startup.data();
    const publicData = publicProfile.data();

    assert.equal(identityData.uid, fixture.uid);
    assert.equal(identityData.email, fixture.input.email);
    assert.equal(identityData.status, 'active');
    assert.equal(identityData.schemaVersion, 1);

    assert.ok(identityData.createdAt);
    assert.ok(identityData.updatedAt);

    assert.equal(startupData.uid, fixture.uid);
    assert.equal(startupData.email, fixture.input.email);
    assert.equal(startupData.role, fixture.input.role);

    assert.equal(
      startupData.primaryRole,
      fixture.input.role
    );

    assert.deepEqual(
      startupData.roles,
      [fixture.input.role]
    );

    assert.equal(
      startupData.isMentor,
      fixture.input.role === 'mentor'
    );

    assert.equal(startupData.status, 'active');
    assert.equal(startupData.plan, 'basic');
    assert.equal(startupData.isVerified, false);

    assert.equal(
      startupData.referralCode,
      result.referralCode
    );

    assert.equal(publicData.uid, fixture.uid);
    assert.equal(publicData.role, fixture.input.role);
    assert.equal(publicData.isVerified, false);

    assert.equal(
      code.data().ownerUid,
      fixture.uid
    );

    const resolved =
      await resolveAccountIdentity(fixture.uid);

    assert.equal(resolved.status, 'active');
    assert.equal(resolved.source, 'global_identity');

    assert.deepEqual(resolved.profiles, {
      hasStartupProfile: true,
      hasEventOrganizerProfile: false,
    });
  }

  async function verifyBlocked(
    fixture,
    expectedError
  ) {
    const refs = Object.values(fixture.refs);

    const before = await adminDb.getAll(...refs);

    await assert.rejects(
      () => signup(fixture),
      expectedError
    );

    const after = await adminDb.getAll(...refs);

    for (let i = 0; i < refs.length; i++) {
      assert.equal(
        after[i].exists,
        before[i].exists
      );

      if (before[i].exists) {
        assert.deepEqual(
          after[i].data(),
          before[i].data()
        );
      }
    }

    const ownedCodes = await adminDb
      .collection('referralCodes')
      .where('ownerUid', '==', fixture.uid)
      .get();

    assert.equal(ownedCodes.size, 0);
  }

  try {
    const founder = await seed(
      'founder',
      'founder'
    );

    const founderResult = await signup(founder);

    await verifySuccess(founder, founderResult);

    pass('founder_atomic_signup');

    const investor = await seed(
      'investor',
      'investor'
    );

    await verifySuccess(
      investor,
      await signup(investor)
    );

    pass('investor_atomic_signup');

    const mentor = await seed(
      'mentor',
      'mentor'
    );

    await verifySuccess(
      mentor,
      await signup(mentor)
    );

    pass('mentor_atomic_signup');

    const referred = await seed('referred');

    const referredResult = await signup(
      referred,
      founderResult.referralCode
    );

    await verifySuccess(
      referred,
      referredResult,
      true
    );

    const referral =
      (await referred.refs.referral.get()).data();

    assert.equal(
      referral.referrerUid,
      founder.uid
    );

    assert.equal(
      referral.referredUid,
      referred.uid
    );

    assert.equal(
      referral.referredProfileCompleted,
      false
    );

    assert.equal(
      referral.rewardGranted,
      false
    );

    pass('valid_referral_atomic_signup');

    const unknown = await seed(
      'unknown_referral'
    );

    const unknownCode =
      'TAB-' +
      randomUUID()
        .replace(/-/g, '')
        .slice(0, 10)
        .toUpperCase();

    assert.equal(
      (await adminDb
        .collection('referralCodes')
        .doc(unknownCode)
        .get()).exists,
      false
    );

    await verifySuccess(
      unknown,
      await signup(unknown, unknownCode)
    );

    pass('unknown_referral_ignored');

    const suspendedReferrer = await seed(
      'suspended_referrer'
    );

    const suspendedResult =
      await signup(suspendedReferrer);

    await suspendedReferrer.refs.startup.update({
      status: 'suspended',
    });

    const blockedReferral = await seed(
      'blocked_referral'
    );

    await verifySuccess(
      blockedReferral,
      await signup(
        blockedReferral,
        suspendedResult.referralCode
      )
    );

    pass('suspended_referrer_ignored');

    const founderRefs =
      Object.values(founder.refs);

    const founderBefore =
      await adminDb.getAll(...founderRefs);

    await assert.rejects(
      () => signup(founder),
      /PROFILE_ALREADY_EXISTS/
    );

    const founderAfter =
      await adminDb.getAll(...founderRefs);

    for (let i = 0; i < founderRefs.length; i++) {
      assert.deepEqual(
        founderAfter[i].data(),
        founderBefore[i].data()
      );
    }

    const founderCodes = await adminDb
      .collection('referralCodes')
      .where('ownerUid', '==', founder.uid)
      .get();

    assert.equal(founderCodes.size, 1);

    pass('duplicate_signup_preserves_documents');

    const existingIdentity = await seed(
      'existing_identity'
    );

    await existingIdentity.refs.identity.set({
      uid: existingIdentity.uid,
      email: existingIdentity.input.email,
      status: 'active',
      schemaVersion: 1,
    });

    await verifyBlocked(
      existingIdentity,
      /RECOVERY_VERIFICATION_REQUIRED/
    );

    pass('existing_global_identity_protected');

    const existingPublic = await seed(
      'existing_public'
    );

    await existingPublic.refs.public.set({
      uid: existingPublic.uid,
      role: 'founder',
    });

    await verifyBlocked(
      existingPublic,
      /RECOVERY_VERIFICATION_REQUIRED/
    );

    pass('existing_public_profile_protected');

    const existingReferral = await seed(
      'existing_referral'
    );

    await existingReferral.refs.referral.set({
      referredUid: existingReferral.uid,
      referrerUid: founder.uid,
      rewardGranted: false,
    });

    await verifyBlocked(
      existingReferral,
      /RECOVERY_VERIFICATION_REQUIRED/
    );

    pass('existing_referral_record_protected');

    const concurrent = await seed(
      'concurrent_signup'
    );

    const results = await Promise.allSettled(
      Array.from(
        { length: 5 },
        () => signup(concurrent)
      )
    );

    const fulfilled = results.filter(
      r => r.status === 'fulfilled'
    );

    const rejected = results.filter(
      r => r.status === 'rejected'
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 4);

    for (const result of rejected) {
      assert.match(
        result.reason.message,
        /PROFILE_ALREADY_EXISTS/
      );
    }

    await verifySuccess(
      concurrent,
      fulfilled[0].value
    );

    const concurrentCodes = await adminDb
      .collection('referralCodes')
      .where('ownerUid', '==', concurrent.uid)
      .get();

    assert.equal(concurrentCodes.size, 1);

    pass('concurrent_signup_single_creation');

    for (const uid of ['', 'invalid/uid']) {
      await assert.rejects(
        () => createSignupProfile(
          uid,
          founder.input
        ),
        /INVALID_USER/
      );
    }

    pass('invalid_signup_uid_rejected');

    assert.throws(
      () => validateSignup({
        ...founder.input,
        password: 'LocalTestPassword123!',
        role: 'event_organizer',
      }),
      /INVALID_SIGNUP_ROLE/
    );

    pass('event_organizer_role_rejected');

    console.log('\nTOTAL PASSED: ' + passed);

  } finally {
    const cleanupErrors = [];

    for (const fixture of fixtures) {
      try {
        const codes = await adminDb
          .collection('referralCodes')
          .where('ownerUid', '==', fixture.uid)
          .get();

        const batch = adminDb.batch();

        for (const ref of Object.values(fixture.refs)) {
          batch.delete(ref);
        }

        for (const code of codes.docs) {
          batch.delete(code.ref);
        }

        await batch.commit();

      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    for (const uid of authUsers) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    await deleteApp(adminApp);

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        'Signup test cleanup failed'
      );
    }

    console.log(
      'CLEANUP: Signup test documents removed.'
    );

    console.log(
      'CLEANUP: Auth test accounts removed.'
    );
  }
}

main().catch(error => {
  console.error('FAILED:', error);
  process.exitCode = 1;
});
