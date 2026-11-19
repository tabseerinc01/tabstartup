const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadTS(file, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8');

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = { exports: {} };

  new Function(
    'require',
    'module',
    'exports',
    compiled
  )(
    name => {
      if (Object.hasOwn(dependencies, name)) {
        return dependencies[name];
      }

      throw new Error(
        'Unexpected dependency: ' + name
      );
    },
    mod,
    mod.exports
  );

  return mod.exports;
}

const legacy = loadTS(
  'src/lib/legacy-startup-profile.ts'
);

const validation = loadTS(
  'src/lib/professional-profile-validation.ts'
);

const readiness = loadTS(
  'src/lib/profile-readiness.ts',
  {
    '@/lib/legacy-startup-profile': legacy,
    '@/lib/professional-profile-validation': validation,
  }
);

const verification = loadTS(
  'src/lib/professional-verification.ts',
  {
    '@/lib/professional-profile-validation': validation,
  }
);

const projection = loadTS(
  'src/lib/professional-profile.ts',
  {
    '@/lib/profile-readiness': readiness,
    '@/lib/professional-profile-validation': validation,
    '@/lib/professional-verification': verification,
  }
);

const {
  Timestamp,
  FieldValue,
} = require('firebase-admin/firestore');

const UID = 'test-user';
const TOKEN = 'mock-valid-token';

const ROLES = [
  'founder',
  'investor',
  'mentor',
];

const context = {
  uid: UID,
  accountActive: true,
  emailVerified: true,
};

function createProfile(overrides = {}) {
  return {
    uid: UID,
    status: 'active',
    role: 'founder',
    roles: [...ROLES],
    fullName: 'Test Professional',
    imageUrl: 'https://example.com/photo.jpg',
    location: 'Dhaka, Bangladesh',
    headline: 'Technology Professional',
    bio: 'Building technology ventures.',
    skills: ['Product Development'],

    investorHeadline: 'Technology Investor',
    investorBio: 'Investing in startups.',
    investmentFocus: ['Technology'],
    preferredStage: ['Seed'],
    ticketSize: '$10,000 - $50,000',

    mentorBio: 'Supporting founders.',
    mentorSkills: ['Business Strategy'],
    yearsOfExperience: '10 years',
    mentorAvailability: 'Available',

    email: 'private@example.com',
    phone: 'private-phone',

    ...overrides,
  };
}

function profilePath(role) {
  return 'professionalProfiles/' +
    role + '_' + UID;
}

function makePublished(role, overrides = {}) {
  return {
    ...projection.buildProfessionalProfile(
      createProfile(),
      role,
      {
        ...context,
        publicationAuthorized: true,
      }
    ),
    publishedAt: Timestamp.fromMillis(1000),
    updatedAt: Timestamp.fromMillis(2000),
    ...overrides,
  };
}

function createHarness(options = {}) {
  const documents = new Map();

  const calls = {
    auth: 0,
    getUser: 0,
    transactions: 0,
    reads: 0,
    sets: 0,
    deletes: 0,
  };

  documents.set(
    'users/' + UID,
    options.profile ?? createProfile()
  );

  documents.set(
    'accountIdentities/' + UID,
    {
      uid: UID,
      status: 'active',
      schemaVersion: 1,
      ...options.identity,
    }
  );

  function makeRef(path) {
    return {
      path,
      id: path.split('/').at(-1),
    };
  }

  function makeSnapshot(ref) {
    const data = documents.get(ref.path);

    return {
      ref,
      id: ref.id,
      exists: documents.has(ref.path),
      data: () => data,
    };
  }

  function createTransaction(readOnly = false) {
    let writeStarted = false;
    const pending = [];

    function assertReadable() {
      assert.equal(
        writeStarted,
        false,
        'Transaction read after write'
      );
    }

    function assertWritable() {
      assert.equal(
        readOnly,
        false,
        'Write in read-only transaction'
      );

      writeStarted = true;
    }

    return {
      pending,

      async get(ref) {
        assertReadable();
        calls.reads++;
        return makeSnapshot(ref);
      },

      async getAll(...refs) {
        assertReadable();
        calls.reads += refs.length;
        return refs.map(makeSnapshot);
      },

      set(ref, data) {
        assertWritable();
        calls.sets++;

        pending.push({
          kind: 'set',
          ref,
          data,
        });

        return this;
      },

      delete(ref) {
        assertWritable();
        calls.deletes++;

        pending.push({
          kind: 'delete',
          ref,
        });

        return this;
      },
    };
  }

  const adminDb = {
    collection(name) {
      return {
        doc(id) {
          return makeRef(name + '/' + id);
        },
      };
    },

    async runTransaction(callback, config) {
      calls.transactions++;

      const transaction = createTransaction(
        config?.readOnly === true
      );

      const result = await callback(transaction);

      for (const action of transaction.pending) {
        if (action.kind === 'set') {
          documents.set(
            action.ref.path,
            action.data
          );
        } else {
          documents.delete(action.ref.path);
        }
      }

      return result;
    },
  };

  const adminAuth = {
    async getUser(uid) {
      calls.getUser++;

      return {
        uid,
        email: "private@example.com",
        metadata: {
          creationTime: "Thu, 01 Jan 2026 00:00:00 GMT",
        },
        disabled: options.disabled === true,
        emailVerified:
          options.emailVerified !== false,
      };
    },
  };

  const service = loadTS(
    'src/services/professional-profile-publishing.service.ts',
    {
      'server-only': {},

      'firebase-admin/firestore': {
        Timestamp,
        FieldValue,
      },

      '@/firebase/admin': {
        getFirebaseAdmin: () => ({
          adminDb,
          adminAuth,
        }),
      },

      '@/lib/account-identity': {
        ACCOUNT_IDENTITIES_COLLECTION:
          'accountIdentities',
      },

      '@/services/email/email-verification-transaction.service': {
        async readTransactionalEmailVerification(input) {
          assert.equal(input.uid, UID);
          assert.equal(input.db, adminDb);
          assert.ok(input.transaction);

          if (
            !input.accountActive ||
            !input.authUser ||
            input.authUser.uid !== input.uid ||
            input.authUser.disabled !== false
          ) {
            return {
              emailVerified: false,
              source: 'none',
              reason: 'account_not_active',
            };
          }

          // Exercise the caller's transaction contract.
          // Actual verification logic is tested separately.
          await input.transaction.get(
            input.db
              .collection('accountEmailVerifications')
              .doc(input.uid)
          );

          return input.authUser.emailVerified === true
            ? {
                emailVerified: true,
                source: 'firebase_auth',
              }
            : {
                emailVerified: false,
                source: 'none',
                reason: 'verification_missing',
              };
        },
      },

      '@/lib/profile-readiness': readiness,

      '@/lib/professional-profile': projection,

      '@/lib/professional-profile-validation':
        validation,

      '@/services/account-authorization.service': {
        async requirePortalAccess(token, portal) {
          calls.auth++;

          assert.equal(portal, 'startup');

          if (token !== TOKEN) {
            throw new Error('UNAUTHENTICATED');
          }

          if (options.denyPortal) {
            throw new Error('PORTAL_ACCESS_DENIED');
          }

          return {
            uid: UID,
          };
        },
      },

      '@/services/professional-profile-image-readiness.service':
        loadTS(
          'src/services/professional-profile-image-readiness.service.ts',
          {
            'server-only': {},
            '@/lib/profile-readiness': readiness,
            '@/services/profile-image-verification.service': {
              async verifyTrustedProfileImage(value, uid) {
                assert.equal(uid, UID);

                if (options.imageVerificationUnavailable) {
                  throw new Error(
                    'PROFILE_IMAGE_VERIFICATION_UNAVAILABLE'
                  );
                }

                if (
                  options.invalidImage ||
                  value !== 'https://example.com/photo.jpg'
                ) {
                  return {
                    valid: false,
                    reason: 'invalid_reference',
                  };
                }

                return { valid: true };
              },
            },
          }
        ),

      '@/services/account-suspension-guard.service': {
        isGlobalAccountEligible(uid, snapshot) {
          if (snapshot.id !== uid) {
            return false;
          }

          if (!snapshot.exists) {
            return true;
          }

          const data = snapshot.data();

          return data.uid === uid &&
            data.schemaVersion === 1 &&
            data.status === 'active';
        },
      },
    }
  );

  async function sync(
    canonical,
    syncContext = context
  ) {
    return adminDb.runTransaction(
      async transaction => {
        const snapshots =
          await service
            .readProfessionalPublicationSnapshots(
              transaction,
              adminDb,
              UID
            );

        const actions =
          await service.prepareVerifiedProfessionalPublicationSync(
            canonical,
            snapshots,
            syncContext
          );

        const result =
          service.applyProfessionalPublicationSync(
            transaction,
            actions
          );

        return { actions, result };
      }
    );
  }

  return {
    service,
    documents,
    calls,
    adminDb,
    sync,
  };
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// Authentication and authorization.

test('invalid token cannot publish', async () => {
  const h = createHarness();

  await assert.rejects(
    h.service.publishOwnProfessionalProfile(
      'invalid',
      'founder'
    ),
    /UNAUTHENTICATED/
  );

  assert.equal(h.calls.transactions, 0);
});

test('invalid role rejected before authentication', async () => {
  const h = createHarness();

  await assert.rejects(
    h.service.publishOwnProfessionalProfile(
      TOKEN,
      'admin'
    ),
    /INVALID_PROFESSIONAL_ROLE/
  );

  assert.equal(h.calls.auth, 0);
});

test('disabled auth account cannot publish', async () => {
  const h = createHarness({ disabled: true });

  await assert.rejects(
    h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    ),
    /ACCOUNT_NOT_ACTIVE/
  );

  assert.equal(h.calls.transactions, 0);
});

test('denied startup portal cannot publish', async () => {
  const h = createHarness({ denyPortal: true });

  await assert.rejects(
    h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    ),
    /PORTAL_ACCESS_DENIED/
  );

  assert.equal(h.calls.transactions, 0);
});

test('unowned role cannot publish', async () => {
  const h = createHarness({
    profile: createProfile({
      roles: ['founder'],
    }),
  });

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'investor'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(h.calls.sets, 0);
});

test('global suspension prevents publication', async () => {
  const h = createHarness({
    identity: { status: 'suspended' },
  });

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(h.calls.sets, 0);
});

test('legacy suspended account cannot publish', async () => {
  const h = createHarness({
    profile: createProfile({
      status: 'suspended',
    }),
  });

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(h.calls.sets, 0);
});

test('unverified email cannot publish', async () => {
  const h = createHarness({
    emailVerified: false,
  });

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(h.calls.sets, 0);
});

// Explicit publication.

for (const role of ROLES) {
  test('explicit publish: ' + role, async () => {
    const h = createHarness();

    const result =
      await h.service.publishOwnProfessionalProfile(
        TOKEN,
        role
      );

    assert.equal(result.status, 'published');

    const data = h.documents.get(
      profilePath(role)
    );

    assert.equal(data.uid, UID);
    assert.equal(data.role, role);
    assert.equal(data.status, 'published');

    assert.equal(
      Object.hasOwn(data, 'email'),
      false
    );

    assert.equal(
      Object.hasOwn(data, 'phone'),
      false
    );

    assert.equal(h.calls.sets, 1);

    for (const other of ROLES) {
      if (other !== role) {
        assert.equal(
          h.documents.has(profilePath(other)),
          false
        );
      }
    }
  });
}

test('incomplete profile cannot publish', async () => {
  const h = createHarness({
    profile: createProfile({ bio: '' }),
  });

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(h.calls.sets, 0);
});

test('not-ready publish removes stale projection', async () => {
  const h = createHarness({
    profile: createProfile({ bio: '' }),
  });

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(result.publicationRemoved, true);

  assert.equal(
    h.documents.has(profilePath('founder')),
    false
  );
});

test('valid publication timestamp is preserved', async () => {
  const h = createHarness();
  const original = makePublished('founder');

  h.documents.set(
    profilePath('founder'),
    original
  );

  await h.service.publishOwnProfessionalProfile(
    TOKEN,
    'founder'
  );

  assert.equal(
    h.documents.get(
      profilePath('founder')
    ).publishedAt,
    original.publishedAt
  );
});

test('malformed timestamp is not preserved', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('founder'),
    makePublished('founder', {
      publishedAt: 'malformed',
    })
  );

  await h.service.publishOwnProfessionalProfile(
    TOKEN,
    'founder'
  );

  assert.notEqual(
    h.documents.get(
      profilePath('founder')
    ).publishedAt,
    'malformed'
  );
});

test('explicit publish rebuilds invalid metadata', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('founder'),
    {
      uid: 'wrong-owner',
      privateToken: 'secret',
    }
  );

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'published');

  const data = h.documents.get(
    profilePath('founder')
  );

  assert.equal(data.uid, UID);
  assert.equal(
    Object.hasOwn(data, 'privateToken'),
    false
  );
});

// Unpublication.

test('unpublish removes only selected role', async () => {
  const h = createHarness();

  for (const role of ROLES) {
    h.documents.set(
      profilePath(role),
      makePublished(role)
    );
  }

  const original = h.documents.get(
    'users/' + UID
  );

  const result =
    await h.service.unpublishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.changed, true);

  assert.equal(
    h.documents.has(profilePath('founder')),
    false
  );

  assert.equal(
    h.documents.has(profilePath('investor')),
    true
  );

  assert.equal(
    h.documents.has(profilePath('mentor')),
    true
  );

  assert.equal(
    h.documents.get('users/' + UID),
    original
  );
});

test('repeated unpublish is idempotent', async () => {
  const h = createHarness();

  const result =
    await h.service.unpublishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.changed, false);
  assert.equal(h.calls.deletes, 0);
});

test('owner can remove malformed publication', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('founder'),
    { malformed: true }
  );

  const result =
    await h.service.unpublishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.changed, true);

  assert.equal(
    h.documents.has(profilePath('founder')),
    false
  );
});

test('email verification not required to unpublish', async () => {
  const h = createHarness({
    emailVerified: false,
  });

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  const result =
    await h.service.unpublishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.changed, true);
});

// Read-only publication status.

test('status read does not publish', async () => {
  const h = createHarness();

  const result =
    await h.service
      .getOwnProfessionalPublicationStatus(TOKEN);

  assert.equal(result.roles.length, 3);

  for (const role of result.roles) {
    assert.equal(
      role.publicationStatus,
      'unpublished'
    );

    assert.equal(
      role.storedPublicationStatus,
      'absent'
    );
  }

  assert.equal(h.calls.sets, 0);
  assert.equal(h.calls.deletes, 0);
});

test('status distinguishes stale publication', async () => {
  const h = createHarness({
    profile: createProfile({ bio: '' }),
  });

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  const result =
    await h.service
      .getOwnProfessionalPublicationStatus(TOKEN);

  const founder = result.roles.find(
    item => item.role === 'founder'
  );

  assert.equal(
    founder.publicationStatus,
    'unpublished'
  );

  assert.equal(
    founder.storedPublicationStatus,
    'published'
  );

  assert.equal(
    founder.requiresReconciliation,
    true
  );

  assert.equal(h.calls.deletes, 0);
});

// Transactional synchronization.

test('ready unpublished roles remain absent', async () => {
  const h = createHarness();

  const { result } = await h.sync(
    createProfile()
  );

  assert.deepEqual(result, {
    updated: 0,
    removed: 0,
    unchanged: 3,
  });

  assert.equal(h.calls.sets, 0);
});

test('sync updates only published role', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  const { result } = await h.sync(
    createProfile({
      headline: 'Updated Founder Headline',
    })
  );

  assert.equal(result.updated, 1);
  assert.equal(result.unchanged, 2);

  assert.equal(
    h.documents.get(
      profilePath('founder')
    ).headline,
    'Updated Founder Headline'
  );

  assert.equal(h.calls.sets, 1);
});

test('readiness loss removes only affected role', async () => {
  const h = createHarness();

  for (const role of ROLES) {
    h.documents.set(
      profilePath(role),
      makePublished(role)
    );
  }

  const { result } = await h.sync(
    createProfile({ investorBio: '' })
  );

  assert.equal(result.removed, 1);
  assert.equal(result.updated, 2);

  assert.equal(
    h.documents.has(profilePath('investor')),
    false
  );
});

test('role removal deletes matching projection', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('mentor'),
    makePublished('mentor')
  );

  const { result } = await h.sync(
    createProfile({
      roles: ['founder', 'investor'],
    })
  );

  assert.equal(result.removed, 1);
  assert.equal(result.updated, 0);
});

test('new role activation never auto-publishes', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  await h.sync(createProfile());

  assert.equal(
    h.documents.has(profilePath('mentor')),
    false
  );

  assert.equal(
    h.documents.has(profilePath('investor')),
    false
  );
});

for (const scenario of [
  {
    name: 'account suspension',
    profile: createProfile(),
    context: {
      ...context,
      accountActive: false,
    },
  },
  {
    name: 'email verification loss',
    profile: createProfile(),
    context: {
      ...context,
      emailVerified: false,
    },
  },
  {
    name: 'canonical profile deletion',
    profile: undefined,
    context,
  },
]) {
  test(
    scenario.name + ' removes all publications',
    async () => {
      const h = createHarness();

      for (const role of ROLES) {
        h.documents.set(
          profilePath(role),
          makePublished(role)
        );
      }

      const { result } = await h.sync(
        scenario.profile,
        scenario.context
      );

      assert.equal(result.removed, 3);
      assert.equal(result.updated, 0);
      assert.equal(h.calls.sets, 0);
    }
  );
}

test('invalid projection removed during sync', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('founder'),
    { uid: 'wrong-owner' }
  );

  const { result } = await h.sync(
    createProfile()
  );

  assert.equal(result.removed, 1);
  assert.equal(result.updated, 0);
});

test('oversized projection removed during sync', async () => {
  const h = createHarness();

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  const experience = Array.from(
    { length: 50 },
    () => ({
      company: 'a'.repeat(10000),
      role: 'b'.repeat(10000),
      duration: 'c'.repeat(10000),
      description: 'd'.repeat(10000),
    })
  );

  const { result } = await h.sync(
    createProfile({ experience })
  );

  assert.equal(result.removed, 1);
  assert.equal(result.updated, 0);
});

test('mandatory removal helper removes all roles', async () => {
  const h = createHarness();

  for (const role of ROLES) {
    h.documents.set(
      profilePath(role),
      makePublished(role)
    );
  }

  const result = await h.adminDb.runTransaction(
    async transaction => {
      const snapshots =
        await h.service
          .readProfessionalPublicationSnapshots(
            transaction,
            h.adminDb,
            UID
          );

      const actions =
        h.service
          .prepareProfessionalPublicationRemoval(
            snapshots,
            UID
          );

      return h.service
        .applyProfessionalPublicationSync(
          transaction,
          actions
        );
    }
  );

  assert.equal(result.removed, 3);
  assert.equal(h.calls.sets, 0);
});

test('mismatched snapshot path fails closed', async () => {
  const h = createHarness();

  await assert.rejects(
    h.adminDb.runTransaction(
      async transaction => {
        const snapshots =
          await h.service
            .readProfessionalPublicationSnapshots(
              transaction,
              h.adminDb,
              UID
            );

        snapshots[0].ref = {
          path: 'users/another-user',
        };

        await h.service
          .prepareVerifiedProfessionalPublicationSync(
            createProfile(),
            snapshots,
            context
          );
      }
    ),
    /INVALID_PUBLICATION_SNAPSHOT/
  );

  assert.equal(h.calls.sets, 0);
  assert.equal(h.calls.deletes, 0);
});


test('invalid image blocks explicit publication', async () => {
  const h = createHarness({ invalidImage: true });

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(result.readiness.ready, false);
  assert.ok(
    result.readiness.missingFields.includes('imageUrl')
  );
  assert.equal(h.calls.sets, 0);
  assert.equal(
    h.documents.has(profilePath('founder')),
    false
  );
});

test('invalid image removes stale publication', async () => {
  const h = createHarness({ invalidImage: true });

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  const result =
    await h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    );

  assert.equal(result.status, 'not_ready');
  assert.equal(result.publicationRemoved, true);
  assert.equal(
    h.documents.has(profilePath('founder')),
    false
  );
});

test('invalid image sync removes existing roles', async () => {
  const h = createHarness({ invalidImage: true });

  for (const role of ROLES) {
    h.documents.set(
      profilePath(role),
      makePublished(role)
    );
  }

  await h.sync(createProfile());

  for (const role of ROLES) {
    assert.equal(
      h.documents.has(profilePath(role)),
      false
    );
  }

  assert.equal(h.calls.sets, 0);
});

test('image verification outage blocks publication', async () => {
  const h = createHarness({
    imageVerificationUnavailable: true,
  });

  await assert.rejects(
    h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    ),
    /PROFILE_IMAGE_VERIFICATION_UNAVAILABLE/
  );

  assert.equal(h.calls.sets, 0);
  assert.equal(h.calls.deletes, 0);
});

test('image verification outage preserves existing publication', async () => {
  const h = createHarness({
    imageVerificationUnavailable: true,
  });

  const path = profilePath('founder');
  const original = makePublished('founder');

  h.documents.set(path, original);

  await assert.rejects(
    h.service.publishOwnProfessionalProfile(
      TOKEN,
      'founder'
    ),
    /PROFILE_IMAGE_VERIFICATION_UNAVAILABLE/
  );

  assert.deepEqual(
    h.documents.get(path),
    original
  );

  assert.equal(h.calls.sets, 0);
  assert.equal(h.calls.deletes, 0);
});

test('image verification outage aborts sync atomically', async () => {
  const h = createHarness({
    imageVerificationUnavailable: true,
  });

  for (const role of ROLES) {
    h.documents.set(
      profilePath(role),
      makePublished(role)
    );
  }

  const before = new Map(h.documents);

  await assert.rejects(
    h.sync(createProfile()),
    /PROFILE_IMAGE_VERIFICATION_UNAVAILABLE/
  );

  assert.deepEqual(h.documents, before);
  assert.equal(h.calls.sets, 0);
  assert.equal(h.calls.deletes, 0);
});


test('status detects invalid image without writing', async () => {
  const h = createHarness({ invalidImage: true });

  const path = profilePath('founder');
  const original = makePublished('founder');

  h.documents.set(path, original);

  const result =
    await h.service
      .getOwnProfessionalPublicationStatus(TOKEN);

  const founder = result.roles.find(
    item => item.role === 'founder'
  );

  assert.ok(founder);
  assert.equal(founder.readiness.ready, false);

  assert.ok(
    founder.readiness.missingFields.includes('imageUrl')
  );

  assert.equal(
    founder.publicationStatus,
    'unpublished'
  );

  assert.equal(
    founder.storedPublicationStatus,
    'published'
  );

  assert.equal(
    founder.requiresReconciliation,
    true
  );

  assert.deepEqual(
    h.documents.get(path),
    original
  );

  assert.equal(h.calls.sets, 0);
  assert.equal(h.calls.deletes, 0);
});

test('status fails safely during image verification outage', async () => {
  const h = createHarness({
    imageVerificationUnavailable: true,
  });

  h.documents.set(
    profilePath('founder'),
    makePublished('founder')
  );

  const before = new Map(h.documents);

  await assert.rejects(
    h.service
      .getOwnProfessionalPublicationStatus(TOKEN),
    /PROFILE_IMAGE_VERIFICATION_UNAVAILABLE/
  );

  assert.deepEqual(h.documents, before);
  assert.equal(h.calls.sets, 0);
  assert.equal(h.calls.deletes, 0);
});

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log('PASS:', name);
    } catch (error) {
      failed++;
      console.error('FAIL:', name);
      console.error(error);
    }
  }

  console.log('');
  console.log('TOTAL:', tests.length);
  console.log('PASSED:', passed);
  console.log('FAILED:', failed);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
