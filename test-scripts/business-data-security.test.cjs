const fs = require('fs');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

const {
  doc, collection, query, where,
  getDoc, getDocs, setDoc, updateDoc,
  getCountFromServer
} = require('firebase/firestore');

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw Error('Emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-tabstartup-business-data',
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

      const fixtures = {
        'venturePitches/pitch1': {
          senderUid: 'founder',
          recipientUid: 'investor',
          status: 'pending'
        },
        'contacts/contact1': {
          ownerUid: 'founder',
          name: 'Contact'
        },
        'startups/founder': {
          ownerUid: 'founder',
          status: 'active',
          slug: 'active-startup'
        },
        'startups/hiddenOwner': {
          ownerUid: 'hiddenOwner',
          status: 'hidden',
          slug: 'hidden-startup'
        },
        'startups/founder/views/view1': {
          viewedAt: 123
        },
        'startups/founder/interests/investor': {
          investorUid: 'investor'
        }
      };

      for (const [path, data] of Object.entries(fixtures)) {
        await setDoc(doc(db, path), data);
      }
    });

    const founder = env.authenticatedContext('founder').firestore();
    const investor = env.authenticatedContext('investor').firestore();
    const attacker = env.authenticatedContext('attacker').firestore();
    const hiddenOwner = env.authenticatedContext('hiddenOwner').firestore();
    const guest = env.unauthenticatedContext().firestore();

    const pitch = 'venturePitches/pitch1';
    const contact = 'contacts/contact1';
    const startup = 'startups/founder';
    const hidden = 'startups/hiddenOwner';
    const view = startup + '/views/view1';
    const interest = startup + '/interests/investor';

    // Venture Pitch Security
    await test('Pitch sender read', getDoc(doc(founder, pitch)));
    await test('Pitch recipient read', getDoc(doc(investor, pitch)));
    await test('Unauthorized pitch read blocked', getDoc(doc(attacker, pitch)), false);
    await test('Guest pitch read blocked', getDoc(doc(guest, pitch)), false);
    await test('Pitch status update', updateDoc(doc(investor, pitch), {status:'accepted'}));
    await test('Pitch sender modification blocked', updateDoc(doc(founder, pitch), {senderUid:'attacker'}), false);
    await test('Pitch recipient modification blocked', updateDoc(doc(investor, pitch), {recipientUid:'attacker'}), false);
    await test('Unauthorized pitch update blocked', updateDoc(doc(attacker, pitch), {status:'accepted'}), false);

    // Contact Security
    await test('Contact owner read', getDoc(doc(founder, contact)));
    await test('Contact unauthorized read blocked', getDoc(doc(attacker, contact)), false);
    await test('Contact normal update', updateDoc(doc(founder, contact), {name:'Updated'}));
    await test('Contact ownership modification blocked', updateDoc(doc(founder, contact), {ownerUid:'attacker'}), false);

    // Startup Visibility
    await test('Active startup public read', getDoc(doc(guest, startup)));
    await test('Hidden startup guest read blocked', getDoc(doc(guest, hidden)), false);
    await test('Hidden startup unauthorized read blocked', getDoc(doc(attacker, hidden)), false);
    await test('Hidden startup owner read', getDoc(doc(hiddenOwner, hidden)));
    await test('Startup ownership modification blocked', updateDoc(doc(founder, startup), {ownerUid:'attacker'}), false);
    await test('Startup normal update', updateDoc(doc(founder, startup), {name:'Updated Startup'}));

    await test('Active startup slug query', getDocs(query(
      collection(guest, 'startups'),
      where('slug', '==', 'active-startup'),
      where('status', '==', 'active')
    )));

    await test('Unrestricted slug query blocked', getDocs(query(
      collection(guest, 'startups'),
      where('slug', '==', 'hidden-startup')
    )), false);

    // Views Security
    await test('Startup owner views read', getDoc(doc(founder, view)));
    await test('Startup owner analytics count', getCountFromServer(collection(founder, startup + '/views')));
    await test('Unauthorized views read blocked', getDoc(doc(attacker, view)), false);
    await test('Guest views read blocked', getDoc(doc(guest, view)), false);
    await test('Guest view creation blocked', setDoc(doc(guest, startup + '/views/fake'), {fake:true}), false);
    await test('Authenticated view creation blocked', setDoc(doc(investor, startup + '/views/fake'), {fake:true}), false);

    // Legacy Interests Security
    await test('Investor own interest read', getDoc(doc(investor, interest)));
    await test('Startup owner interest read', getDoc(doc(founder, interest)));
    await test('Unauthorized interest read blocked', getDoc(doc(attacker, interest)), false);
    await test('Guest interest read blocked', getDoc(doc(guest, interest)), false);
    await test('Legacy interest write blocked', setDoc(doc(investor, interest), {modified:true}), false);

    console.log('\nTOTAL PASSED: ' + passed);

  } finally {
    await env.cleanup();
  }
})().catch(error => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});
