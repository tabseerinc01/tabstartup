const fs = require('fs');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  runTransaction,
  serverTimestamp
} = require('firebase/firestore');

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('Safety check failed: Emulator host not configured.');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-tabstartup-security',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firestore.rules', 'utf8')
    }
  });

  try {
    await env.clearFirestore();
    console.log('CHECKPOINT: Emulator test data cleared');
    const founderUid = 'test_founder_f2287';
    const investorUid = 'test_investor_f2287';
    const connectionId = 'test_connection_f2287';
    const dealId = 'funding_' + founderUid + '_' + investorUid;

    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();

      await setDoc(doc(db, 'connections', connectionId), {
        initiatorUid: investorUid,
        recipientUid: founderUid,
        type: 'investor',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });

    const founderDb = env.authenticatedContext(founderUid).firestore();

    await assertSucceeds(
      runTransaction(founderDb, async transaction => {
        const connectionRef = doc(
          founderDb, 'connections', connectionId
        );

        const dealRef = doc(
          founderDb, 'dealRooms', dealId
        );

        const connectionSnap = await transaction.get(connectionRef);

        if (!connectionSnap.exists()) {
          throw new Error('Connection missing.');
        }

        if (connectionSnap.data().status !== 'pending') {
          throw new Error('Connection is not pending.');
        }

        transaction.update(connectionRef, {
          status: 'accepted',
          updatedAt: serverTimestamp()
        });

        transaction.set(dealRef, {
          startupId: founderUid,
          founderUid,
          investorUid,
          connectionId,
          status: 'Discovery',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        transaction.set(
          doc(founderDb, 'dealRooms', dealId, 'timeline', 'deal_init'),
          {
            type: 'deal_init',
            details: 'Investment Deal Room initialized.',
            createdAt: serverTimestamp()
          }
        );
      })
    );

    const dealSnap = await getDoc(
      doc(founderDb, 'dealRooms', dealId)
    );

    if (!dealSnap.exists()) {
      throw new Error('Deal Room was not created.');
    }


    console.log('CHECKPOINT: First transaction and Deal Room read succeeded');

    const secondConnectionId = 'test_connection_duplicate_f2299';

    await env.withSecurityRulesDisabled(async context => {
      await setDoc(
        doc(context.firestore(), 'connections', secondConnectionId),
        {
          initiatorUid: investorUid,
          recipientUid: founderUid,
          type: 'investor',
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      );
    });

    const originalConnectionId = dealSnap.data().connectionId;

    let overwriteDenied = false;

    try {
      await runTransaction(founderDb, async transaction => {
        const connectionRef = doc(
          founderDb, 'connections', secondConnectionId
        );

        const connectionSnap = await transaction.get(connectionRef);

        if (!connectionSnap.exists()) {
          throw new Error('Second connection missing.');
        }

        transaction.update(connectionRef, {
          status: 'accepted',
          updatedAt: serverTimestamp()
        });

        transaction.set(doc(founderDb, 'dealRooms', dealId), {
          startupId: founderUid,
          founderUid,
          investorUid,
          connectionId: secondConnectionId,
          status: 'Discovery',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      if (error.code !== 'permission-denied') {
        throw error;
      }
      overwriteDenied = true;
    }

    if (!overwriteDenied) {
      throw new Error('SECURITY FAILURE: Duplicate overwrite was allowed.');
    }

    const preservedDeal = await getDoc(
      doc(founderDb, 'dealRooms', dealId)
    );

    if (preservedDeal.data().connectionId !== originalConnectionId) {
      throw new Error('SECURITY FAILURE: Original Deal Room changed.');
    }

    const secondConnectionSnap = await getDoc(
      doc(founderDb, 'connections', secondConnectionId)
    );

    if (secondConnectionSnap.data()?.status !== 'pending') {
      throw new Error('SECURITY FAILURE: Rejected connection was modified.');
    }

    const investorDb = env.authenticatedContext(investorUid).firestore();

    await assertFails(setDoc(
      doc(investorDb, 'dealRooms', 'funding_' + founderUid + '_unauthorized'),
      {
        startupId: founderUid,
        founderUid,
        investorUid,
        connectionId,
        status: 'Discovery',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    ));

    const pendingInvestorUid = 'test_pending_investor_f2317';
    const pendingConnectionId = 'test_pending_connection_f2317';

    await env.withSecurityRulesDisabled(async context => {
      await setDoc(
        doc(context.firestore(), 'connections', pendingConnectionId),
        {
          initiatorUid: pendingInvestorUid,
          recipientUid: founderUid,
          type: 'investor',
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      );
    });

    await assertFails(setDoc(
      doc(founderDb, 'dealRooms',
        'funding_' + founderUid + '_' + pendingInvestorUid),
      {
        startupId: founderUid,
        founderUid,
        investorUid: pendingInvestorUid,
        connectionId: pendingConnectionId,
        status: 'Discovery',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    ));

    const unrelatedUid = 'test_unrelated_user_f2319';
    const unrelatedDb = env.authenticatedContext(unrelatedUid).firestore();

    await assertFails(getDoc(
      doc(unrelatedDb, 'dealRooms', dealId)
    ));

    const founderRead = await assertSucceeds(
      getDoc(doc(founderDb, 'dealRooms', dealId))
    );
    const investorRead = await assertSucceeds(
      getDoc(doc(investorDb, 'dealRooms', dealId))
    );

    if (!founderRead.exists() || !investorRead.exists()) {
      throw new Error('SECURITY FAILURE: Authorized Deal Room missing.');
    }

    await assertFails(updateDoc(
      doc(unrelatedDb, 'dealRooms', dealId),
      {
        status: 'Committed',
        updatedAt: serverTimestamp()
      }
    ));

    for (const collectionName of ['notes', 'documents', 'checklist', 'timeline']) {
      await assertFails(getDoc(
        doc(unrelatedDb, 'dealRooms', dealId, collectionName, 'security_test_doc')
      ));
    }

    for (const name of ['notes', 'documents', 'checklist', 'timeline']) {
      await assertFails(setDoc(
        doc(unrelatedDb, 'dealRooms', dealId, name, 'unauthorized_test'),
        { text: 'Unauthorized write attempt' }
      ));
    }

    const notePath = ['dealRooms', dealId, 'notes', 'authorized_test'];

    await assertSucceeds(setDoc(
      doc(founderDb, ...notePath),
      { text: 'Authorized founder note' }
    ));

    const investorNote = await assertSucceeds(
      getDoc(doc(investorDb, ...notePath))
    );

    if (!investorNote.exists() ||
        investorNote.data().text !== 'Authorized founder note') {
      throw new Error('SECURITY FAILURE: Investor cannot read founder note.');
    }

    for (const name of ['documents', 'checklist', 'timeline']) {
      const ref = doc(founderDb, 'dealRooms', dealId, name, 'authorized_test');
      await assertSucceeds(setDoc(ref, { text: 'Authorized ' + name }));
      const result = await assertSucceeds(getDoc(
        doc(investorDb, 'dealRooms', dealId, name, 'authorized_test')
      ));
      if (!result.exists() || result.data().text !== 'Authorized ' + name) {
        throw new Error('Authorized access failed: ' + name);
      }
    }

    console.log('PASS: Remaining Subcollections Authorized Access');

    console.log('PASS: Founder and Investor Authorized Notes Access');

    console.log('PASS: Subcollection Unauthorized Writes Blocked');

    console.log('PASS: Subcollection Unauthorized Reads Blocked');

    console.log('PASS: Unrelated User Write Blocked');

    console.log('PASS: Founder and Investor Authorized Read');

    console.log('PASS: Unrelated User Deal Room Read Blocked');

    console.log('PASS: Pending Connection Creation Blocked');

    console.log('PASS: Investor Unauthorized Creation Blocked');

    console.log('PASS: Rejected Transaction Is Atomic');

    console.log('PASS: Duplicate Deal Room Overwrite Blocked');

    console.log('PASS: Atomic Investor Acceptance');
    console.log('PASS: Deterministic Deal Room Creation');
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error('TEST FAILED:', error);
  process.exitCode = 1;
});
