const fs = require('fs');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

const {
  doc, getDoc, setDoc, updateDoc
} = require('firebase/firestore');

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw Error('Emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-tabstartup-admin',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firestore.rules', 'utf8')
    }
  });

  let passed = 0;

  async function test(name, operation, allowed = true) {
    await (allowed ? assertSucceeds(operation) : assertFails(operation));
    passed++;
    console.log('PASS: ' + name);
  }

  try {
    await env.clearFirestore();

    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();

      await setDoc(doc(db, 'users', 'normalUser'), {
        uid: 'normalUser',
        role: 'founder',
        primaryRole: 'founder',
        roles: ['founder'],
        plan: 'basic'
      });

      await setDoc(doc(db, 'users', 'databaseAdmin'), {
        role: 'admin',
        roles: ['admin']
      });

      await setDoc(doc(db, 'deals', 'privateDeal'), {
        ownerUid: 'owner',
        title: 'Private Deal'
      });

      await setDoc(doc(db, 'deals/privateDeal/notes/note1'), {
        text: 'Confidential'
      });
    });

    const normal = env.authenticatedContext('normalUser').firestore();

    const unverified = env.authenticatedContext('unverifiedUser', {
      email: 'shahmubaruk05@gmail.com',
      email_verified: false
    }).firestore();

    const verified = env.authenticatedContext('verifiedUser', {
      email: 'shahmubaruk05@gmail.com',
      email_verified: true
    }).firestore();

    const hardcoded = env.authenticatedContext(
      'T2JnkPYdsoZGO8krUqcP3T5bvg62'
    ).firestore();

    const admin = env.authenticatedContext('databaseAdmin').firestore();
    const guest = env.unauthenticatedContext().firestore();

    const note = 'deals/privateDeal/notes/note1';

    await test('Normal user admin access blocked',
      getDoc(doc(normal, note)), false);

    await test('Guest admin access blocked',
      getDoc(doc(guest, note)), false);

    await test('Unverified admin email blocked',
      getDoc(doc(unverified, note)), false);

    await test('Verified admin email allowed',
      getDoc(doc(verified, note)));

    await test('Hardcoded admin UID allowed',
      getDoc(doc(hardcoded, note)));

    await test('Database admin role allowed',
      getDoc(doc(admin, note)));

    await test('Self role escalation blocked',
      updateDoc(doc(normal, 'users/normalUser'), {
        role: 'admin'
      }), false);

    await test('Self primaryRole escalation blocked',
      updateDoc(doc(normal, 'users/normalUser'), {
        primaryRole: 'super_admin'
      }), false);

    await test('Self roles escalation blocked',
      updateDoc(doc(normal, 'users/normalUser'), {
        roles: ['founder', 'admin']
      }), false);

    await test('Direct multi-role activation blocked',
      updateDoc(doc(normal, 'users/normalUser'), {
        roles: ['founder', 'investor']
      }), false);

    await test('Admin access remains blocked after rejected role activation',
      getDoc(doc(normal, note)), false);

    console.log('\nTOTAL PASSED: ' + passed);

  } finally {
    await env.cleanup();
  }
})().catch(error => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});
