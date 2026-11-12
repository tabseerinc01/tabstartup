const fs = require('fs');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

const { setDoc,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  arrayUnion
} = require('firebase/firestore');

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw Error('Emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-tabstartup-signup',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firestore.rules', 'utf8')
    }
  });

  let passed = 0;

  const pass = (name) => {
    passed++;
    console.log('PASS: ' + name);
  };

  function profile(uid, email, code, role = 'founder') {
    return {
      uid,
      email,
      fullName: 'Test User',
      role,
      primaryRole: role,
      roles: [role],
      plan: 'basic',
      subscriptionStatus: 'inactive',
      referralCode: code,
      referralCount: 0,
      bonusLimits: {
        connections: 0,
        pitches: 0,
        contacts: 0,
        deals: 0,
        tasks: 0,
        invoices: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
  }

  function signup(db, uid, code, data) {
    return runTransaction(db, async tx => {
      const userRef = doc(db, 'users', uid);
      const codeRef = doc(db, 'referralCodes', code);

      await tx.get(userRef);
      await tx.get(codeRef);

      tx.set(userRef, data);
      tx.set(codeRef, {
        ownerUid: uid,
        createdAt: serverTimestamp()
      });
    });
  }

  try {
    await env.clearFirestore();

    for (const [i, role] of ['founder', 'investor', 'mentor'].entries()) {
      const uid = 'valid_' + role;
      const email = uid + '@example.com';
      const code = 'TAB-VALID0000' + i;
      const db = env.authenticatedContext(uid, { email }).firestore();

      await assertFails(
        signup(db, uid, code, profile(uid, email, code, role))
      );

      pass('Direct client ' + role + ' signup blocked');

      await env.withSecurityRulesDisabled(async ctx => {
        await signup(
          ctx.firestore(),
          uid,
          code,
          profile(uid, email, code, role)
        );
      });

      pass('Trusted ' + role + ' fixture prepared');
    }

    const attacks = [
      ['Forged UID', { uid: 'another_user' }],
      ['Forged email', { email: 'fake@example.com' }],
      ['Premium plan', { plan: 'premium' }],
      ['Active subscription', { subscriptionStatus: 'active' }],
      ['Inflated referral count', { referralCount: 999 }],
      ['Inflated bonus limits', { bonusLimits: { connections: 999 } }],
      ['Admin role', {
        role: 'admin',
        primaryRole: 'admin',
        roles: ['admin']
      }],
      ['Injected admin role', { roles: ['founder', 'admin'] }],
      ['Forged timestamp', { createdAt: new Date(0) }],
      ['Self-verified signup', { isVerified: true }],
      ['Invalid account status signup', { status: 'suspended' }]
    ];

    for (const [i, [name, changes]] of attacks.entries()) {
      const uid = 'attacker_' + i;
      const email = uid + '@example.com';
      const code = 'TAB-ATTACK' + String(i).padStart(4, '0');
      const db = env.authenticatedContext(uid, { email }).firestore();

      await assertFails(
        signup(db, uid, code, {
          ...profile(uid, email, code),
          ...changes
        })
      );

      pass(name + ' blocked');
    }

    const uid = 'valid_founder';
    const db = env.authenticatedContext(uid, {
      email: uid + '@example.com'
    }).firestore();

    const userRef = doc(db, 'users', uid);

    const updates = [
      ['Plan escalation', { plan: 'premium' }],
      ['Subscription escalation', { subscriptionStatus: 'active' }],
      ['Bonus manipulation', { 'bonusLimits.connections': 999 }],
      ['UID modification', { uid: 'another_user' }],
      ['Email modification', { email: 'fake@example.com' }],
      ['Referral count manipulation', { referralCount: 999 }],
      ['Referral code modification', { referralCode: 'TAB-FAKE000001' }],
      ['Primary role escalation', { primaryRole: 'admin' }],
      ['Role escalation', { role: 'admin' }],
      ['Admin role injection', { roles: arrayUnion('admin') }],
      ['Self-verification', { isVerified: true }],
      ['Self account status modification', { status: 'active' }]
    ];

    for (const [name, changes] of updates) {
      await assertFails(updateDoc(userRef, changes));
      pass(name + ' blocked');
    }

    await assertFails(updateDoc(userRef, {
      bio: 'Updated founder profile',
      updatedAt: serverTimestamp()
    }));

    pass('Direct owner profile update blocked');

    await assertFails(updateDoc(userRef, {
      roles: arrayUnion('investor'),
      updatedAt: serverTimestamp()
    }));

    pass('Direct owner multi-role activation blocked');

    const thiefUid = 'referral_thief';
    const thiefEmail = 'thief@example.com';
    const stolenCode = 'TAB-VALID00000';
    const thiefDb = env.authenticatedContext(thiefUid, {
      email: thiefEmail
    }).firestore();

    await assertFails(
      signup(
        thiefDb,
        thiefUid,
        stolenCode,
        profile(thiefUid, thiefEmail, stolenCode)
      )
    );

    pass('Unauthorized referral ownership blocked');

    await assertFails(setDoc(
      doc(thiefDb, 'users', thiefUid),
      profile(thiefUid, thiefEmail, 'TAB-DIRECT0001')
    ));

    pass('Standalone client user creation blocked');

    await assertFails(setDoc(
      doc(thiefDb, 'referralCodes', 'TAB-DIRECT0001'),
      {
        ownerUid: thiefUid,
        createdAt: serverTimestamp()
      }
    ));

    pass('Standalone client referral code creation blocked');

    await assertFails(setDoc(
      doc(thiefDb, 'referrals', 'referral_' + thiefUid),
      {
        referrerUid: uid,
        referredUid: thiefUid,
        referredProfileCompleted: false,
        rewardGranted: false,
        createdAt: serverTimestamp()
      }
    ));

    pass('Direct referral attribution blocked');


    const adminDb = env.authenticatedContext(
      'T2JnkPYdsoZGO8krUqcP3T5bvg62'
    ).firestore();

    const adminUserRef = doc(adminDb, 'users', uid);

    await assertFails(updateDoc(adminUserRef, {
      isVerified: true
    }));
    pass('Direct admin verification blocked');

    await assertFails(updateDoc(adminUserRef, {
      status: 'suspended'
    }));
    pass('Direct admin suspension blocked');

    await assertFails(updateDoc(adminUserRef, {
      roles: arrayUnion('admin')
    }));
    pass('Direct admin privilege assignment blocked');

    await assertFails(updateDoc(adminUserRef, {
      roles: ['mentor']
    }));
    pass('Direct admin professional role replacement blocked');

    await assertSucceeds(updateDoc(adminUserRef, {
      plan: 'pro'
    }));
    pass('Admin subscription management preserved');

    const ownerDb = env.authenticatedContext(uid).firestore();
    const ownerRef = doc(ownerDb, 'users', uid);

    await assertFails(updateDoc(ownerRef, {
      roles: ['founder']
    }));
    pass('Owner existing role removal blocked');

    await assertFails(updateDoc(ownerRef, {
      roles: []
    }));
    pass('Owner all-role removal blocked');

    await assertFails(updateDoc(ownerRef, {
      roles: ['founder', 'investor', 'admin']
    }));
    pass('Owner administrative role escalation blocked');

    await assertSucceeds(updateDoc(adminUserRef, {
      referralCount: 1
    }));
    pass('Admin referral management preserved');

    await assertFails(setDoc(
      doc(ownerDb, 'publicProfiles', uid),
      { uid, fullName: 'Unauthorized Profile' }
    ));
    pass('Owner direct public profile write blocked');

    await assertFails(setDoc(
      doc(adminDb, 'publicProfiles', uid),
      { uid, isVerified: true }
    ));
    pass('Admin direct public profile write blocked');

    await assertFails(setDoc(
      doc(env.unauthenticatedContext().firestore(),
        'publicProfiles', uid),
      { uid }
    ));
    pass('Guest public profile write blocked');


    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'users', uid), {
        status: 'suspended'
      });
    });
    pass('Suspended account fixture prepared');

    await assertFails(updateDoc(userRef, {
      status: 'active'
    }));
    pass('Suspended user cannot unsuspend account');

    console.log('\nTOTAL PASSED: ' + passed);
  } finally {
    await env.cleanup();
  }
})().catch(e => {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
});
