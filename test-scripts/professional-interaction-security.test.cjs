const fs = require('node:fs');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

const {
  doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp
} = require('firebase/firestore');

async function main() {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.VERCEL === '1'
  ) {
    throw new Error('Local emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-tabstartup',
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
    console.log('PASS:', name);
  }

  try {
    await env.clearFirestore();

    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();

      const accounts = [
        ['founder', ['founder'], 'founder', 'active'],
        ['investor', ['investor'], 'investor', 'active'],
        ['mentor', ['mentor'], 'mentor', 'active'],
        ['unpublished', ['founder'], null, 'active'],
        ['suspended', ['investor'], 'investor', 'suspended'],
        ['multi1', ['founder','investor','mentor'], 'mentor', 'active'],
        ['multi2', ['founder','investor','mentor'], 'mentor', 'active']
      ];

      for (const [uid, roles, published, status] of accounts) {
        await setDoc(doc(db, 'users', uid), {
          uid,
          role: roles[0],
          roles,
          status: 'active'
        });

        await setDoc(doc(db, 'accountIdentities', uid), {
          uid,
          schemaVersion: 1,
          status
        });

        if (published) {
          await setDoc(doc(db, 'professionalEligibility', uid), {
            uid,
            schemaVersion: 1,
            publishedRoles: [published]
          });
        }

        if (published) {
          await setDoc(
            doc(db, 'professionalProfiles', published + '_' + uid),
            {
              uid,
              role: published,
              schemaVersion: 1,
              status: 'published',
              visibility: 'public'
            }
          );
        }
      }
    });

    const db = uid => env.authenticatedContext(uid).firestore();

    function connection(from, to, type) {
      const id = type === 'investor'
        ? 'investor_' + from + '_' + to
        : type + '_' + from + '_' + to;

      return setDoc(doc(db(from), 'connections', id), {
        initiatorUid: from,
        recipientUid: to,
        type,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    function chat(from, to) {
      return setDoc(
        doc(db(from), 'chats', from + '_' + to),
        {
          participants: [from, to],
          lastMessage: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );
    }

    function pitch(from, to) {
      return setDoc(
        doc(db(from), 'venturePitches', from + '_' + to),
        {
          senderUid: from,
          recipientUid: to,
          status: 'pending'
        }
      );
    }

    function mentorship(from, to) {
      return setDoc(
        doc(db(from), 'mentorshipRequests', from + '_' + to),
        {
          founderUid: from,
          mentorUid: to,
          startupId: from,
          subject: 'Test mentorship',
          message: 'Mentorship request',
          goals: 'Business growth',
          status: 'Pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );
    }

    await test('Published investor to founder',
      connection('investor', 'founder', 'investor'));

    await test('Unpublished recipient denied',
      connection('investor', 'unpublished', 'investor'), false);

    await test('Unpublished initiator denied',
      connection('unpublished', 'mentor', 'mentor'), false);

    await test('Suspended investor denied',
      connection('suspended', 'founder', 'investor'), false);

    await test('Wrong recipient role denied',
      connection('investor', 'mentor', 'investor'), false);

    await test('Multi-role connection access budget',
      connection('multi1', 'multi2', 'mentor'));

    await test('Published participants chat',
      chat('founder', 'investor'));

    await test('Unpublished chat recipient denied',
      chat('founder', 'unpublished'), false);

    await test('Unpublished chat initiator denied',
      chat('unpublished', 'founder'), false);

    await test('Suspended chat recipient denied',
      chat('founder', 'suspended'), false);

    await test('Multi-role chat access budget',
      chat('multi1', 'multi2'));

    await test('Published founder venture pitch',
      pitch('founder', 'investor'));

    await test('Unpublished founder pitch denied',
      pitch('unpublished', 'investor'), false);

    await test('Suspended investor pitch denied',
      pitch('founder', 'suspended'), false);

    await test('Wrong pitch recipient role denied',
      pitch('founder', 'mentor'), false);

    await test('Published founder mentorship request',
      mentorship('founder', 'mentor'));

    await test('Unpublished founder mentorship denied',
      mentorship('unpublished', 'mentor'), false);

    await test('Wrong mentor role denied',
      mentorship('founder', 'investor'), false);

    const guest = env.unauthenticatedContext().firestore();

    const indexRef = (client, uid) =>
      doc(client, 'professionalEligibility', uid);

    const forgedIndex = uid => ({
      uid,
      schemaVersion: 1,
      publishedRoles: ['founder', 'investor', 'mentor']
    });

    await test('Guest eligibility read denied',
      getDoc(indexRef(guest, 'founder')), false);

    await test('Owner eligibility read denied',
      getDoc(indexRef(db('founder'), 'founder')), false);

    await test('Other eligibility read denied',
      getDoc(indexRef(db('investor'), 'founder')), false);

    await test('Eligibility collection list denied',
      getDocs(collection(db('founder'), 'professionalEligibility')), false);

    await test('Guest eligibility creation denied',
      setDoc(indexRef(guest, 'guest'), forgedIndex('guest')), false);

    await test('Unpublished account self-grant denied',
      setDoc(indexRef(db('unpublished'), 'unpublished'),
        forgedIndex('unpublished')), false);

    await test('Owner eligibility modification denied',
      updateDoc(indexRef(db('founder'), 'founder'), {
        publishedRoles: ['founder', 'investor']
      }), false);

    await test('Other account eligibility modification denied',
      updateDoc(indexRef(db('investor'), 'founder'), {
        publishedRoles: ['investor']
      }), false);

    await test('Owner eligibility deletion denied',
      deleteDoc(indexRef(db('founder'), 'founder')), false);

    await test('Other account eligibility deletion denied',
      deleteDoc(indexRef(db('investor'), 'founder')), false);

    console.log('TOTAL PASSED:', passed);
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
