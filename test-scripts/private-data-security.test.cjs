const fs = require('fs');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc
} = require('firebase/firestore');

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw Error('Emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-tabstartup-private-data',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firestore.rules', 'utf8')
    }
  });

  let passed = 0;

  const pass = name => {
    passed++;
    console.log('PASS: ' + name);
  };

  try {
    await env.clearFirestore();

    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();

      await setDoc(doc(db, 'deals', 'deal1'), {
        ownerUid: 'owner',
        title: 'Private Deal'
      });

      await setDoc(doc(db, 'tasks', 'task1'), {
        ownerUid: 'owner',
        title: 'Private Task'
      });
    });

    const owner = env.authenticatedContext('owner').firestore();
    const attacker = env.authenticatedContext('attacker').firestore();
    const guest = env.unauthenticatedContext().firestore();

    const paths = [
      'deals/deal1/notes/note1',
      'deals/deal1/activities/activity1',
      'tasks/task1/activities/activity1'
    ];

    for (const path of paths) {
      const ownerRef = doc(owner, path);
      const attackerRef = doc(attacker, path);

      await assertSucceeds(setDoc(ownerRef, { text: 'Private data' }));
      pass(path + ': owner create');

      await assertSucceeds(getDoc(ownerRef));
      pass(path + ': owner read');

      await assertSucceeds(updateDoc(ownerRef, { text: 'Updated' }));
      pass(path + ': owner update');

      await assertFails(getDoc(attackerRef));
      pass(path + ': unauthorized read blocked');

      await assertFails(updateDoc(attackerRef, { text: 'Hacked' }));
      pass(path + ': unauthorized update blocked');

      await assertFails(deleteDoc(attackerRef));
      pass(path + ': unauthorized delete blocked');

      await assertFails(getDoc(doc(guest, path)));
      pass(path + ': guest read blocked');

      await assertSucceeds(deleteDoc(ownerRef));
      pass(path + ': owner delete');

      await assertFails(setDoc(attackerRef, { text: 'Injected' }));
      pass(path + ': unauthorized create blocked');
    }

    for (const path of ['deals/deal1', 'tasks/task1']) {
      await assertSucceeds(updateDoc(doc(owner, path), {
        title: 'Updated title'
      }));
      pass(path + ': normal update allowed');

      await assertFails(updateDoc(doc(owner, path), {
        ownerUid: 'attacker'
      }));
      pass(path + ': ownership modification blocked');
    }

    console.log('\nTOTAL PASSED: ' + passed);
  } finally {
    await env.cleanup();
  }
})().catch(e => {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
});
