/**
 * TabStartup professional profile projection tests.
 *
 * Pure unit tests.
 * No Firebase connection.
 * No production reads or writes.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadTS(file, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8');

  const compiled = ts.transpileModule(
    source,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText;

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

const legacyProfile = loadTS(
  'src/lib/legacy-startup-profile.ts'
);

const sharedValidation = loadTS(
  'src/lib/professional-profile-validation.ts'
);

const readiness = loadTS(
  'src/lib/profile-readiness.ts',
  {
    '@/lib/legacy-startup-profile':
      legacyProfile,
    '@/lib/professional-profile-validation':
      sharedValidation,
  }
);

const verification = loadTS(
  'src/lib/professional-verification.ts',
  {
    '@/lib/professional-profile-validation':
      sharedValidation,
  }
);

const professionalProfile = loadTS(
  'src/lib/professional-profile.ts',
  {
    '@/lib/profile-readiness':
      readiness,
    '@/lib/professional-profile-validation':
      sharedValidation,
    '@/lib/professional-verification':
      verification,
  }
);

const {
  getProfessionalProfileId,
  buildProfessionalProfile,
  PROFESSIONAL_PROFILES_COLLECTION,
  PROFESSIONAL_PROFILE_SCHEMA_VERSION,
} = professionalProfile;

const {
  buildPublicVerificationSummary,
} = verification;

/**
 * Trusted server context fixture.
 */
const context = Object.freeze({
  uid: 'test-user',
  emailVerified: true,
  accountActive: true,
  publicationAuthorized: true,
});

/**
 * Complete multi-role canonical profile fixture.
 */
function createProfile(overrides = {}) {
  return {
    uid: 'test-user',
    status: 'active',

    role: 'founder',
    primaryRole: 'founder',
    roles: [
      'founder',
      'investor',
      'mentor',
    ],

    fullName: 'Test Professional',
    imageUrl:
      'https://example.com/profile.jpg',
    coverImageUrl:
      'https://example.com/cover.jpg',
    headline:
      'Technology Professional',
    location: 'Dhaka, Bangladesh',

    bio: 'Building technology ventures.',
    skills: ['Product Development'],
    stage: 'Early Stage',
    whyBuilding: 'Solve real problems.',
    lookingFor: 'Strategic partners',
    lookingForCofounder: true,
    cofounderRole: 'Technical Co-founder',
    cofounderSkills: ['Engineering'],
    equityOffer: 'Negotiable',
    commitmentType: 'Full-time',

    investorHeadline:
      'Early-stage Technology Investor',
    investorBio:
      'Investing in technology startups.',
    investmentFocus: ['Technology'],
    preferredStage: ['Seed'],
    ticketSize: '$10,000 - $50,000',
    isOpenToPitches: true,

    mentorBio:
      'Supporting early-stage founders.',
    mentorSkills: ['Business Strategy'],
    yearsOfExperience: '10 years',
    mentorAvailability: 'Available',

    linkedinUrl:
      'https://linkedin.com/in/example',
    website:
      'https://example.com',

    socialLinks: {
      linkedin:
        'https://linkedin.com/in/example',
      website:
        'https://example.com',
      twitter:
        'https://x.com/example',
    },

    experience: [
      {
        company: 'Example Company',
        role: 'Technology Lead',
        duration: '2020 - 2025',
        description: 'Led product development.',
      },
    ],

    achievements: [
      'Built a technology product',
    ],

    availability: {
      openToInvestment: true,
      hiring: false,
      coFounder: true,
    },

    ...overrides,
  };
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

/**
 * Document identity tests.
 */

test('uses the expected collection name', () => {
  assert.equal(
    PROFESSIONAL_PROFILES_COLLECTION,
    'professionalProfiles'
  );
});

test('uses schema version 1', () => {
  assert.equal(
    PROFESSIONAL_PROFILE_SCHEMA_VERSION,
    1
  );
});

test('creates deterministic founder ID', () => {
  assert.equal(
    getProfessionalProfileId(
      'test-user',
      'founder'
    ),
    'founder_test-user'
  );
});

test('creates deterministic investor ID', () => {
  assert.equal(
    getProfessionalProfileId(
      'test-user',
      'investor'
    ),
    'investor_test-user'
  );
});

test('creates deterministic mentor ID', () => {
  assert.equal(
    getProfessionalProfileId(
      'test-user',
      'mentor'
    ),
    'mentor_test-user'
  );
});

test('same role and UID produce same ID', () => {
  const first = getProfessionalProfileId(
    'test-user',
    'founder'
  );

  const second = getProfessionalProfileId(
    'test-user',
    'founder'
  );

  assert.equal(first, second);
});

test('different roles have different IDs', () => {
  const ids = [
    'founder',
    'investor',
    'mentor',
  ].map(role =>
    getProfessionalProfileId(
      'test-user',
      role
    )
  );

  assert.equal(
    new Set(ids).size,
    3
  );
});

test('different users have different IDs', () => {
  assert.notEqual(
    getProfessionalProfileId(
      'user-one',
      'founder'
    ),
    getProfessionalProfileId(
      'user-two',
      'founder'
    )
  );
});

test('rejects invalid UID values', () => {
  const invalid = [
    '',
    null,
    undefined,
    123,
    {},
    [],
    ' user',
    'user ',
    'user/name',
    'user\nname',
    'user\u0000name',
    'user\u007fname',
    'x'.repeat(129),
  ];

  for (const uid of invalid) {
    assert.throws(
      () =>
        getProfessionalProfileId(
          uid,
          'founder'
        ),
      /INVALID_PROFESSIONAL_PROFILE_UID/
    );
  }
});

test('accepts UID at maximum length', () => {
  const uid = 'x'.repeat(128);

  assert.equal(
    getProfessionalProfileId(
      uid,
      'founder'
    ),
    'founder_' + uid
  );
});

test('rejects unsupported professional roles', () => {
  const invalid = [
    '',
    null,
    undefined,
    'admin',
    'eventOrganizer',
    'event_organizer',
    'Founder',
    'business',
    123,
  ];

  for (const role of invalid) {
    assert.throws(
      () =>
        getProfessionalProfileId(
          'test-user',
          role
        ),
      /INVALID_PROFESSIONAL_ROLE/
    );
  }
});

/**
 * Publication authorization and eligibility tests.
 */

test('builds an authorized complete founder profile', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'founder',
    context
  );

  assert.equal(result.uid, 'test-user');
  assert.equal(result.role, 'founder');
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.visibility, 'public');
  assert.equal(result.status, 'published');

  assert.deepEqual(
    result.verification,
    { email: true }
  );
});

test('builds an authorized complete investor profile', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'investor',
    context
  );

  assert.equal(result.role, 'investor');
  assert.equal(result.status, 'published');
  assert.equal(result.visibility, 'public');
});

test('builds an authorized complete mentor profile', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'mentor',
    context
  );

  assert.equal(result.role, 'mentor');
  assert.equal(result.status, 'published');
  assert.equal(result.visibility, 'public');
});

test('rejects missing publication context', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      undefined
    ),
    /INVALID_PUBLICATION_CONTEXT/
  );
});

test('rejects null publication context', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      null
    ),
    /INVALID_PUBLICATION_CONTEXT/
  );
});

test('rejects unauthorized publication', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      {
        ...context,
        publicationAuthorized: false,
      }
    ),
    /PROFILE_PUBLICATION_NOT_AUTHORIZED/
  );
});

test('rejects missing publication authorization', () => {
  const incompleteContext = {
    ...context,
  };

  delete incompleteContext.publicationAuthorized;

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      incompleteContext
    ),
    /PROFILE_PUBLICATION_NOT_AUTHORIZED/
  );
});

test('rejects non-boolean publication authorization', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      {
        ...context,
        publicationAuthorized: 'true',
      }
    ),
    /PROFILE_PUBLICATION_NOT_AUTHORIZED/
  );
});

test('rejects unverified email', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      {
        ...context,
        emailVerified: false,
      }
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects non-boolean email verification', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      {
        ...context,
        emailVerified: 'true',
      }
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('private email verification cannot bypass Auth context', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        emailVerified: true,
        isVerified: true,
      }),
      'founder',
      {
        ...context,
        emailVerified: false,
      }
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects globally inactive account', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      {
        ...context,
        accountActive: false,
      }
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects suspended canonical profile', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        status: 'suspended',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects unsupported canonical account status', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        status: 'unknown',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects canonical UID mismatch', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        uid: 'another-user',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects invalid context UID', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      {
        ...context,
        uid: 'invalid/user',
      }
    ),
    /INVALID_PROFESSIONAL_PROFILE_UID/
  );
});

test('rejects unsupported requested role', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'admin',
      context
    ),
    /INVALID_PROFESSIONAL_ROLE/
  );
});

test('rejects professional role not owned by user', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        roles: ['founder'],
      }),
      'investor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects malformed canonical role array', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        roles: 'founder',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects missing canonical profile', () => {
  assert.throws(
    () => buildProfessionalProfile(
      undefined,
      'founder',
      context
    ),
    /INVALID_CANONICAL_PROFILE/
  );
});

test('rejects array as canonical profile', () => {
  assert.throws(
    () => buildProfessionalProfile(
      [],
      'founder',
      context
    ),
    /INVALID_CANONICAL_PROFILE/
  );
});

test('rejects founder with incomplete required fields', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        bio: '',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects investor with incomplete required fields', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        investmentFocus: [],
      }),
      'investor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects mentor with incomplete required fields', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        mentorSkills: [],
      }),
      'mentor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects profile without required photo', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        imageUrl: '',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

/**
 * Multi-role professional profile isolation tests.
 */

const founderOnlyFields = [
  'bio',
  'skills',
  'stage',
  'whyBuilding',
  'lookingFor',
  'lookingForCofounder',
  'cofounderRole',
  'cofounderSkills',
  'equityOffer',
  'commitmentType',
  'availability',
];

const investorOnlyFields = [
  'investorHeadline',
  'investorBio',
  'investmentFocus',
  'preferredStage',
  'ticketSize',
  'isOpenToPitches',
];

const mentorOnlyFields = [
  'mentorBio',
  'mentorSkills',
  'yearsOfExperience',
  'mentorAvailability',
];

function assertFieldsAbsent(result, fields) {
  for (const field of fields) {
    assert.equal(
      Object.hasOwn(result, field),
      false,
      'Unexpected public field: ' + field
    );
  }
}

function assertFieldsPresent(result, fields) {
  for (const field of fields) {
    assert.equal(
      Object.hasOwn(result, field),
      true,
      'Missing public field: ' + field
    );
  }
}

test('founder projection preserves founder fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'founder',
    context
  );

  assertFieldsPresent(
    result,
    founderOnlyFields
  );

  assert.equal(
    result.bio,
    'Building technology ventures.'
  );

  assert.deepEqual(
    result.skills,
    ['Product Development']
  );
});

test('founder projection excludes investor fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'founder',
    context
  );

  assertFieldsAbsent(
    result,
    investorOnlyFields
  );
});

test('founder projection excludes mentor fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'founder',
    context
  );

  assertFieldsAbsent(
    result,
    mentorOnlyFields
  );
});

test('investor projection preserves investor fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'investor',
    context
  );

  assertFieldsPresent(
    result,
    investorOnlyFields
  );

  assert.deepEqual(
    result.investmentFocus,
    ['Technology']
  );

  assert.deepEqual(
    result.preferredStage,
    ['Seed']
  );
});

test('investor projection excludes founder fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'investor',
    context
  );

  assertFieldsAbsent(
    result,
    founderOnlyFields
  );
});

test('investor projection excludes mentor fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'investor',
    context
  );

  assertFieldsAbsent(
    result,
    mentorOnlyFields
  );
});

test('mentor projection preserves mentor fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'mentor',
    context
  );

  assertFieldsPresent(
    result,
    mentorOnlyFields
  );

  assert.deepEqual(
    result.mentorSkills,
    ['Business Strategy']
  );

  assert.equal(
    result.yearsOfExperience,
    '10 years'
  );
});

test('mentor projection excludes founder fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'mentor',
    context
  );

  assertFieldsAbsent(
    result,
    founderOnlyFields
  );
});

test('mentor projection excludes investor fields', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'mentor',
    context
  );

  assertFieldsAbsent(
    result,
    investorOnlyFields
  );
});

test('all professional roles preserve shared fields', () => {
  const sharedFields = [
    'fullName',
    'imageUrl',
    'coverImageUrl',
    'headline',
    'location',
    'linkedinUrl',
    'website',
    'socialLinks',
    'experience',
    'achievements',
  ];

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const result = buildProfessionalProfile(
      createProfile(),
      role,
      context
    );

    assertFieldsPresent(
      result,
      sharedFields
    );

    assert.equal(
      result.fullName,
      'Test Professional'
    );

    assert.equal(
      result.location,
      'Dhaka, Bangladesh'
    );
  }
});

test('investor uses investor-specific headline', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'investor',
    context
  );

  assert.equal(
    result.headline,
    'Early-stage Technology Investor'
  );
});

test('investor supports shared headline fallback', () => {
  const result = buildProfessionalProfile(
    createProfile({
      investorHeadline: '',
    }),
    'investor',
    context
  );

  assert.equal(
    result.headline,
    'Technology Professional'
  );

  assertFieldsAbsent(
    result,
    ['investorHeadline']
  );
});

test('founder does not inherit investor headline', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'founder',
    context
  );

  assert.equal(
    result.headline,
    'Technology Professional'
  );
});

test('mentor does not inherit investor headline', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'mentor',
    context
  );

  assert.equal(
    result.headline,
    'Technology Professional'
  );
});

test('incomplete investor does not block founder projection', () => {
  const profile = createProfile({
    investorBio: '',
    investmentFocus: [],
    preferredStage: [],
    ticketSize: '',
  });

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.equal(
    result.role,
    'founder'
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'investor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('incomplete founder does not block mentor projection', () => {
  const profile = createProfile({
    bio: '',
    skills: [],
  });

  const result = buildProfessionalProfile(
    profile,
    'mentor',
    context
  );

  assert.equal(
    result.role,
    'mentor'
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('incomplete mentor does not block investor projection', () => {
  const profile = createProfile({
    mentorBio: '',
    mentorSkills: [],
    yearsOfExperience: '',
    mentorAvailability: '',
  });

  const result = buildProfessionalProfile(
    profile,
    'investor',
    context
  );

  assert.equal(
    result.role,
    'investor'
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'mentor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('other role bio cannot replace required founder bio', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        bio: '',
        investorBio: 'Complete investor bio',
        mentorBio: 'Complete mentor bio',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('supports authorized legacy single-role profile', () => {
  const profile = createProfile({
    role: 'founder',
  });

  delete profile.roles;

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.equal(
    result.role,
    'founder'
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'investor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('projection exposes only the selected role metadata', () => {
  const profile = createProfile({
    isMentor: true,
  });

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.equal(result.role, role);

    assertFieldsAbsent(
      result,
      [
        'roles',
        'primaryRole',
        'isMentor',
      ]
    );
  }
});

/**
 * Private data leakage security tests.
 */

const professionalRoles = [
  'founder',
  'investor',
  'mentor',
];

function assertPrivateFieldsExcluded(
  privateFields
) {
  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      createProfile(privateFields),
      role,
      context
    );

    assertFieldsAbsent(
      result,
      Object.keys(privateFields)
    );
  }
}

test('excludes private email and contact information', () => {
  assertPrivateFieldsExcluded({
    email: 'private@example.com',
    phone: 'PRIVATE_PHONE',
    phoneNumber: 'PRIVATE_PHONE_NUMBER',
    mobile: 'PRIVATE_MOBILE',
    whatsapp: 'PRIVATE_WHATSAPP',
    contactEmail: 'PRIVATE_CONTACT_EMAIL',
    contactPhone: 'PRIVATE_CONTACT_PHONE',
  });
});

test('excludes national identity information', () => {
  assertPrivateFieldsExcluded({
    nid: 'PRIVATE_NID',
    nidNumber: 'PRIVATE_NID_NUMBER',
    nationalId: 'PRIVATE_NATIONAL_ID',
    nationalIdNumber: 'PRIVATE_ID_NUMBER',
    passportNumber: 'PRIVATE_PASSPORT',
    passport: 'PRIVATE_PASSPORT_DATA',
    drivingLicense: 'PRIVATE_LICENSE',
    dateOfBirth: 'PRIVATE_DOB',
  });
});

test('excludes private residential address', () => {
  assertPrivateFieldsExcluded({
    address: 'PRIVATE_ADDRESS',
    residentialAddress: 'PRIVATE_RESIDENCE',
    permanentAddress: 'PRIVATE_PERMANENT_ADDRESS',
    streetAddress: 'PRIVATE_STREET',
    postalCode: 'PRIVATE_POSTAL_CODE',
    addressProof: 'PRIVATE_ADDRESS_PROOF',
  });
});

test('excludes private bank account information', () => {
  assertPrivateFieldsExcluded({
    bankAccount: {
      accountNumber: 'PRIVATE_ACCOUNT',
      routingNumber: 'PRIVATE_ROUTING',
    },
    bankAccountNumber: 'PRIVATE_ACCOUNT_NUMBER',
    bankName: 'PRIVATE_BANK_NAME',
    accountHolderName: 'PRIVATE_ACCOUNT_HOLDER',
    routingNumber: 'PRIVATE_ROUTING_NUMBER',
    iban: 'PRIVATE_IBAN',
    swiftCode: 'PRIVATE_SWIFT',
  });
});

test('excludes bank statements and financial evidence', () => {
  assertPrivateFieldsExcluded({
    bankStatement: 'PRIVATE_BANK_STATEMENT',
    bankStatementUrl:
      'https://example.com/private-statement.pdf',
    proofOfFunds: 'PRIVATE_PROOF_OF_FUNDS',
    financialDocuments: [
      'PRIVATE_FINANCIAL_DOCUMENT',
    ],
    bankBalance: 100000,
    financialCapacityAmount: 50000,
  });
});

test('excludes private identity verification documents', () => {
  assertPrivateFieldsExcluded({
    identityDocuments: [
      'PRIVATE_IDENTITY_DOCUMENT',
    ],
    verificationDocuments: [
      'PRIVATE_VERIFICATION_DOCUMENT',
    ],
    nidFrontUrl:
      'https://example.com/private-nid-front.jpg',
    nidBackUrl:
      'https://example.com/private-nid-back.jpg',
    passportUrl:
      'https://example.com/private-passport.pdf',
    selfieUrl:
      'https://example.com/private-selfie.jpg',
  });
});

test('excludes internal verification review metadata', () => {
  assertPrivateFieldsExcluded({
    verificationStatus: 'pending',
    verificationRequestId: 'PRIVATE_REQUEST_ID',
    verificationReviewNotes: 'PRIVATE_REVIEW_NOTES',
    verificationRejectedReason: 'PRIVATE_REASON',
    reviewedBy: 'PRIVATE_REVIEWER',
    verificationAuditLogs: [
      'PRIVATE_AUDIT_LOG',
    ],
    riskScore: 95,
    riskLevel: 'high',
  });
});

test('excludes subscription and referral metadata', () => {
  assertPrivateFieldsExcluded({
    plan: 'premium',
    subscriptionStatus: 'active',
    stripeCustomerId: 'PRIVATE_CUSTOMER_ID',
    referralCode: 'PRIVATE_REFERRAL_CODE',
    referredBy: 'PRIVATE_REFERRER',
    referralCount: 10,
    bonusLimits: {
      connections: 50,
    },
  });
});

test('excludes internal account authorization metadata', () => {
  assertPrivateFieldsExcluded({
    permissions: ['admin'],
    customClaims: {
      admin: true,
    },
    admin: true,
    isAdmin: true,
    accountIdentity: {
      status: 'active',
    },
    authProvider: 'password',
    lastLoginAt: 'PRIVATE_LOGIN_TIME',
    passwordHash: 'PRIVATE_PASSWORD_HASH',
    accessToken: 'PRIVATE_ACCESS_TOKEN',
  });
});

test('excludes private business verification evidence', () => {
  assertPrivateFieldsExcluded({
    tradeLicense: 'PRIVATE_TRADE_LICENSE',
    incorporationCertificate:
      'PRIVATE_INCORPORATION_CERTIFICATE',
    taxId: 'PRIVATE_TAX_ID',
    businessRegistrationNumber:
      'PRIVATE_REGISTRATION_NUMBER',
    ownershipDocuments: [
      'PRIVATE_OWNERSHIP_DOCUMENT',
    ],
    beneficialOwners: [
      {
        name: 'PRIVATE_OWNER',
        passport: 'PRIVATE_OWNER_PASSPORT',
      },
    ],
  });
});

test('social links exclude unapproved nested fields', () => {
  const profile = createProfile({
    socialLinks: {
      linkedin:
        'https://linkedin.com/in/example',
      website:
        'https://example.com',
      twitter:
        'https://x.com/example',
      email: 'PRIVATE_EMAIL',
      phone: 'PRIVATE_PHONE',
      passportUrl:
        'https://example.com/private-passport.pdf',
      bankAccount: 'PRIVATE_BANK_ACCOUNT',
    },
  });

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.deepEqual(
      result.socialLinks,
      {
        linkedin:
          'https://linkedin.com/in/example',
        website:
          'https://example.com/',
        twitter:
          'https://x.com/example',
      }
    );
  }
});

test('experience excludes unapproved nested fields', () => {
  const profile = createProfile({
    experience: [
      {
        company: 'Example Company',
        role: 'Technology Lead',
        duration: '2020 - 2025',
        description: 'Led product development.',
        salary: 'PRIVATE_SALARY',
        employeeId: 'PRIVATE_EMPLOYEE_ID',
        employmentContract: 'PRIVATE_CONTRACT',
        referencePhone: 'PRIVATE_REFERENCE_PHONE',
        bankAccount: 'PRIVATE_BANK_ACCOUNT',
      },
    ],
  });

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.deepEqual(
      result.experience,
      [
        {
          company: 'Example Company',
          role: 'Technology Lead',
          duration: '2020 - 2025',
          description: 'Led product development.',
        },
      ]
    );
  }
});

test('founder availability excludes private nested fields', () => {
  const result = buildProfessionalProfile(
    createProfile({
      availability: {
        openToInvestment: true,
        hiring: false,
        coFounder: true,
        privateSchedule: 'PRIVATE_SCHEDULE',
        privatePhone: 'PRIVATE_PHONE',
        privateAddress: 'PRIVATE_ADDRESS',
      },
    }),
    'founder',
    context
  );

  assert.deepEqual(
    result.availability,
    {
      openToInvestment: true,
      hiring: false,
      coFounder: true,
    }
  );
});

test('unknown private objects are not copied into projections', () => {
  const profile = createProfile({
    internalMetadata: {
      secret: 'PRIVATE_INTERNAL_SECRET',
    },
    privateProfile: {
      email: 'PRIVATE_EMAIL',
      phone: 'PRIVATE_PHONE',
    },
    privateDocuments: [
      {
        url: 'PRIVATE_DOCUMENT_URL',
      },
    ],
    unknownFutureField: {
      token: 'PRIVATE_TOKEN',
    },
  });

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assertFieldsAbsent(
      result,
      [
        'internalMetadata',
        'privateProfile',
        'privateDocuments',
        'unknownFutureField',
      ]
    );

    assert.equal(
      JSON.stringify(result).includes('PRIVATE_'),
      false
    );
  }
});

test('canonical metadata cannot override public projection metadata', () => {
  const profile = createProfile({
    schemaVersion: 999,
    visibility: 'private',
    publishedAt: 'FORGED_PUBLISHED_AT',
    updatedAt: 'FORGED_UPDATED_AT',
    documentId: 'FORGED_DOCUMENT_ID',
    publicationAuthorized: false,
    verification: {
      email: false,
      identity: true,
      bankAccount: true,
    },
  });

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.equal(result.schemaVersion, 1);
    assert.equal(result.uid, context.uid);
    assert.equal(result.role, role);
    assert.equal(result.visibility, 'public');
    assert.equal(result.status, 'published');

    assert.deepEqual(
      result.verification,
      { email: true }
    );

    assertFieldsAbsent(
      result,
      [
        'publishedAt',
        'updatedAt',
        'documentId',
        'publicationAuthorized',
      ]
    );
  }
});

/**
 * Sanitization and URL security tests.
 */

test('trims public text fields', () => {
  const result = buildProfessionalProfile(
    createProfile({
      fullName: '  Test Professional  ',
      headline: '  Technology Professional  ',
      bio: '  Building technology ventures.  ',
      location: '  Dhaka, Bangladesh  ',
    }),
    'founder',
    context
  );

  assert.equal(result.fullName, 'Test Professional');
  assert.equal(result.headline, 'Technology Professional');
  assert.equal(result.bio, 'Building technology ventures.');
  assert.equal(result.location, 'Dhaka, Bangladesh');
});

test('excludes whitespace-only optional fields', () => {
  const result = buildProfessionalProfile(
    createProfile({
      whyBuilding: '   ',
      lookingFor: '\n\t ',
      cofounderRole: '',
    }),
    'founder',
    context
  );

  assertFieldsAbsent(result, [
    'whyBuilding',
    'lookingFor',
    'cofounderRole',
  ]);
});

test('rejects whitespace-only required text', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        fullName: '   ',
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects oversized full name', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        fullName: 'x'.repeat(121),
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('excludes oversized optional text', () => {
  const result = buildProfessionalProfile(
    createProfile({
      whyBuilding: 'x'.repeat(10001),
    }),
    'founder',
    context
  );

  assertFieldsAbsent(result, ['whyBuilding']);
});

test('rejects oversized required bio', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        bio: 'x'.repeat(10001),
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('normalizes valid HTTPS URLs', () => {
  const result = buildProfessionalProfile(
    createProfile({
      website: '  HTTPS://EXAMPLE.COM  ',
      imageUrl: 'https://example.com/profile.jpg',
    }),
    'founder',
    context
  );

  assert.equal(
    result.website,
    'https://example.com/'
  );

  assert.equal(
    result.imageUrl,
    'https://example.com/profile.jpg'
  );
});

test('excludes unsafe optional URL schemes', () => {
  const invalidUrls = [
    'http://example.com',
    'javascript:alert(1)',
    'data:text/html,example',
    'file:///private/document',
    'ftp://example.com/file',
    '//example.com',
    '/relative/path',
  ];

  for (const url of invalidUrls) {
    const result = buildProfessionalProfile(
      createProfile({
        website: url,
        linkedinUrl: url,
        coverImageUrl: url,
      }),
      'founder',
      context
    );

    assertFieldsAbsent(result, [
      'website',
      'linkedinUrl',
      'coverImageUrl',
    ]);
  }
});

test('rejects unsafe required profile photo URLs', () => {
  const invalidUrls = [
    'http://example.com/photo.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,example',
    'file:///private/photo.jpg',
    '//example.com/photo.jpg',
    'not-a-url',
  ];

  for (const url of invalidUrls) {
    assert.throws(
      () => buildProfessionalProfile(
        createProfile({
          imageUrl: url,
        }),
        'founder',
        context
      ),
      /PROFESSIONAL_PROFILE_NOT_READY/
    );
  }
});

test('excludes URLs containing credentials', () => {
  const result = buildProfessionalProfile(
    createProfile({
      website:
        'https://user:password@example.com',
      linkedinUrl:
        'https://user@example.com',
    }),
    'founder',
    context
  );

  assertFieldsAbsent(result, [
    'website',
    'linkedinUrl',
  ]);
});

test('excludes malformed optional HTTPS URLs', () => {
  const invalidUrls = [
    'https://',
    'https://?',
    'https://exa mple.com',
    'https://[invalid',
    'https://example.com:99999',
  ];

  for (const url of invalidUrls) {
    const result = buildProfessionalProfile(
      createProfile({
        website: url,
      }),
      'founder',
      context
    );

    assertFieldsAbsent(result, ['website']);
  }
});

test('excludes URLs containing embedded control characters', () => {
  const result = buildProfessionalProfile(
    createProfile({
      website: 'https://exam\nple.com',
      linkedinUrl: 'https://exam\tple.com',
      coverImageUrl: 'https://example.com/\u0000photo',
    }),
    'founder',
    context
  );

  assertFieldsAbsent(result, [
    'website',
    'linkedinUrl',
    'coverImageUrl',
  ]);
});

test('rejects required photo removed by strict sanitization', () => {
  const invalidUrls = [
    'https:example.com/photo.jpg',
    'https://exam\nple.com/photo.jpg',
  ];

  for (const url of invalidUrls) {
    assert.throws(
      () => buildProfessionalProfile(
        createProfile({
          imageUrl: url,
        }),
        'founder',
        context
      ),
      /(?:SANITIZED_)?PROFESSIONAL_PROFILE_NOT_READY|SANITIZED_PROFILE_NOT_READY/
    );
  }
});

test('trims and deduplicates public string arrays', () => {
  const result = buildProfessionalProfile(
    createProfile({
      skills: [
        ' Engineering ',
        'Engineering',
        'Product Development',
        ' Product Development ',
      ],
    }),
    'founder',
    context
  );

  assert.deepEqual(
    result.skills,
    ['Engineering', 'Product Development']
  );
});

test('rejects required arrays with malformed items', () => {
  const invalidArrays = [
    ['Engineering', 123],
    ['Engineering', null],
    ['Engineering', {}],
    ['Engineering', ['Nested']],
    ['Engineering', '   '],
  ];

  for (const skills of invalidArrays) {
    assert.throws(
      () => buildProfessionalProfile(
        createProfile({ skills }),
        'founder',
        context
      ),
      /PROFESSIONAL_PROFILE_NOT_READY/
    );
  }
});

test('excludes malformed optional arrays entirely', () => {
  const result = buildProfessionalProfile(
    createProfile({
      achievements: [
        'Valid achievement',
        {
          privateValue: 'PRIVATE_DATA',
        },
      ],
      cofounderSkills: [
        'Engineering',
        123,
      ],
    }),
    'founder',
    context
  );

  assertFieldsAbsent(result, [
    'achievements',
    'cofounderSkills',
  ]);
});

test('rejects oversized required string arrays', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        skills: Array.from(
          { length: 101 },
          (_, index) => 'Skill ' + index
        ),
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects oversized required array items', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        skills: ['x'.repeat(1001)],
      }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );
});

test('rejects sparse required arrays after sanitization', () => {
  const skills = new Array(2);
  skills[0] = 'Engineering';

  assert.throws(
    () => buildProfessionalProfile(
      createProfile({ skills }),
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY|SANITIZED_PROFILE_NOT_READY/
  );
});

test('excludes non-boolean optional role flags', () => {
  const profile = createProfile({
    lookingForCofounder: 'true',
    isOpenToPitches: 1,
  });

  const founder = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  const investor = buildProfessionalProfile(
    profile,
    'investor',
    context
  );

  assertFieldsAbsent(founder, [
    'lookingForCofounder',
  ]);

  assertFieldsAbsent(investor, [
    'isOpenToPitches',
  ]);
});

test('preserves explicit false boolean flags', () => {
  const profile = createProfile({
    lookingForCofounder: false,
    isOpenToPitches: false,
  });

  const founder = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  const investor = buildProfessionalProfile(
    profile,
    'investor',
    context
  );

  assert.equal(
    founder.lookingForCofounder,
    false
  );

  assert.equal(
    investor.isOpenToPitches,
    false
  );
});

test('sanitizes malformed nested social links', () => {
  const result = buildProfessionalProfile(
    createProfile({
      socialLinks: {
        linkedin: 'javascript:alert(1)',
        website: 'https://example.com',
        twitter: 123,
      },
    }),
    'founder',
    context
  );

  assert.deepEqual(
    result.socialLinks,
    {
      website: 'https://example.com/',
    }
  );
});

test('excludes invalid nested object containers', () => {
  const invalidValues = [
    null,
    undefined,
    'invalid',
    123,
    [],
    new Date(),
  ];

  for (const value of invalidValues) {
    const result = buildProfessionalProfile(
      createProfile({
        socialLinks: value,
        availability: value,
      }),
      'founder',
      context
    );

    assertFieldsAbsent(result, [
      'socialLinks',
      'availability',
    ]);
  }
});

test('sanitizes malformed experience entries', () => {
  const result = buildProfessionalProfile(
    createProfile({
      experience: [
        {
          company: ' Example Company ',
          role: ' Technology Lead ',
          duration: 123,
          description: '   ',
        },
        {
          privateField: 'PRIVATE_DATA',
        },
      ],
    }),
    'mentor',
    context
  );

  assert.deepEqual(
    result.experience,
    [
      {
        company: 'Example Company',
        role: 'Technology Lead',
      },
    ]
  );
});

test('excludes invalid or oversized experience arrays', () => {
  const invalidValues = [
    'invalid',
    {},
    [null],
    ['invalid'],
    [
      {
        company: 'Valid Company',
      },
      null,
    ],
    Array.from(
      { length: 51 },
      () => ({
        company: 'Example Company',
      })
    ),
  ];

  for (const experience of invalidValues) {
    const result = buildProfessionalProfile(
      createProfile({ experience }),
      'mentor',
      context
    );

    assertFieldsAbsent(result, [
      'experience',
    ]);
  }
});

/**
 * Verification forgery security tests.
 */

test('defines the expected verification schema version', () => {
  assert.equal(
    verification.PROFESSIONAL_VERIFICATION_VERSION,
    1
  );
});

test('defines exactly seven verification categories', () => {
  assert.deepEqual(
    verification.PROFESSIONAL_VERIFICATION_CLAIMS,
    [
      'email',
      'identity',
      'address',
      'business',
      'bankAccount',
      'financialCapacity',
      'professional',
    ]
  );
});

test('trusted verified email produces positive claim', () => {
  assert.deepEqual(
    buildPublicVerificationSummary({
      emailVerified: true,
    }),
    {
      email: true,
    }
  );
});

test('unverified email produces no public claim', () => {
  assert.deepEqual(
    buildPublicVerificationSummary({
      emailVerified: false,
    }),
    {}
  );
});

test('missing email verification produces no claim', () => {
  assert.deepEqual(
    buildPublicVerificationSummary({}),
    {}
  );
});

test('non-boolean email verification produces no claim', () => {
  const invalidValues = [
    'true',
    1,
    'verified',
    {},
    [],
    null,
    undefined,
  ];

  for (const emailVerified of invalidValues) {
    assert.deepEqual(
      buildPublicVerificationSummary({
        emailVerified,
      }),
      {}
    );
  }
});

test('rejects missing verification context', () => {
  assert.throws(
    () => buildPublicVerificationSummary(
      undefined
    ),
    /INVALID_VERIFICATION_CONTEXT/
  );
});

test('rejects null verification context', () => {
  assert.throws(
    () => buildPublicVerificationSummary(
      null
    ),
    /INVALID_VERIFICATION_CONTEXT/
  );
});

test('rejects primitive verification contexts', () => {
  const invalidValues = [
    true,
    false,
    1,
    'verified',
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => buildPublicVerificationSummary(value),
      /INVALID_VERIFICATION_CONTEXT/
    );
  }
});

test('unsupported verification claims remain disabled', () => {
  const result = buildPublicVerificationSummary({
    emailVerified: true,
    identity: true,
    address: true,
    business: true,
    bankAccount: true,
    financialCapacity: true,
    professional: true,
    identityVerified: true,
    addressVerified: true,
    businessVerified: true,
    bankAccountVerified: true,
    financialCapacityVerified: true,
    professionalVerified: true,
  });

  assert.deepEqual(
    result,
    {
      email: true,
    }
  );
});

test('legacy isVerified cannot grant identity verification', () => {
  const profile = createProfile({
    isVerified: true,
  });

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.deepEqual(
      result.verification,
      { email: true }
    );

    assertFieldsAbsent(result, [
      'isVerified',
    ]);
  }
});

test('legacy startup verification cannot grant business claim', () => {
  const result = buildProfessionalProfile(
    createProfile({
      startupVerified: true,
      businessVerified: true,
    }),
    'founder',
    context
  );

  assert.deepEqual(
    result.verification,
    { email: true }
  );

  assertFieldsAbsent(result, [
    'startupVerified',
    'businessVerified',
  ]);
});

test('investor bio cannot grant financial verification', () => {
  const result = buildProfessionalProfile(
    createProfile({
      investorBio:
        'Experienced investor with available capital.',
      isInvestorVerified: true,
      investorVerified: true,
      financialCapacityVerified: true,
    }),
    'investor',
    context
  );

  assert.deepEqual(
    result.verification,
    { email: true }
  );

  assertFieldsAbsent(result, [
    'isInvestorVerified',
    'investorVerified',
    'financialCapacityVerified',
  ]);
});

test('mentor experience cannot grant professional verification', () => {
  const result = buildProfessionalProfile(
    createProfile({
      yearsOfExperience: '25 years',
      mentorVerified: true,
      professionalVerified: true,
    }),
    'mentor',
    context
  );

  assert.deepEqual(
    result.verification,
    { email: true }
  );

  assertFieldsAbsent(result, [
    'mentorVerified',
    'professionalVerified',
  ]);
});

test('forged canonical verification object is ignored', () => {
  const profile = createProfile({
    verification: {
      email: false,
      identity: true,
      address: true,
      business: true,
      bankAccount: true,
      financialCapacity: true,
      professional: true,
    },
  });

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.deepEqual(
      result.verification,
      { email: true }
    );
  }
});

test('forged verification flags cannot bypass unverified email', () => {
  const profile = createProfile({
    emailVerified: true,
    isVerified: true,
    identityVerified: true,
    verification: {
      email: true,
      identity: true,
    },
  });

  for (const role of professionalRoles) {
    assert.throws(
      () => buildProfessionalProfile(
        profile,
        role,
        {
          ...context,
          emailVerified: false,
        }
      ),
      /PROFESSIONAL_PROFILE_NOT_READY/
    );
  }
});

test('verified email cannot bypass publication authorization', () => {
  assert.throws(
    () => buildProfessionalProfile(
      createProfile({
        isVerified: true,
      }),
      'founder',
      {
        ...context,
        publicationAuthorized: false,
      }
    ),
    /PROFILE_PUBLICATION_NOT_AUTHORIZED/
  );
});

test('extra build context verification claims are ignored', () => {
  const result = buildProfessionalProfile(
    createProfile(),
    'investor',
    {
      ...context,
      identityVerified: true,
      bankAccountVerified: true,
      financialCapacityVerified: true,
      verification: {
        identity: true,
        financialCapacity: true,
      },
    }
  );

  assert.deepEqual(
    result.verification,
    { email: true }
  );
});

test('private trust scores cannot become public verification', () => {
  const profile = createProfile({
    trustScore: 100,
    profileStrength: 100,
    verificationScore: 100,
    trustLevel: 'verified',
    verificationStatus: 'approved',
    verifiedAt: 'FORGED_VERIFICATION_TIME',
  });

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.deepEqual(
      result.verification,
      { email: true }
    );

    assertFieldsAbsent(result, [
      'trustScore',
      'profileStrength',
      'verificationScore',
      'trustLevel',
      'verificationStatus',
      'verifiedAt',
    ]);
  }
});

test('verification summary excludes private evidence metadata', () => {
  const result = buildPublicVerificationSummary({
    emailVerified: true,
    documents: [
      'PRIVATE_DOCUMENT',
    ],
    reviewedBy: 'PRIVATE_REVIEWER',
    reviewNotes: 'PRIVATE_REVIEW_NOTES',
    bankAccountNumber: 'PRIVATE_ACCOUNT',
    verificationRequestId: 'PRIVATE_REQUEST',
    status: 'approved',
  });

  assert.deepEqual(
    result,
    { email: true }
  );

  assert.equal(
    JSON.stringify(result).includes('PRIVATE_'),
    false
  );
});

/**
 * Data integrity and serialization tests.
 */

function deepFreeze(value) {
  if (
    value &&
    typeof value === 'object' &&
    !Object.isFrozen(value)
  ) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }

    Object.freeze(value);
  }

  return value;
}

function assertSerializableValue(
  value,
  path = 'projection'
) {
  if (
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }

  if (typeof value === 'number') {
    assert.equal(
      Number.isFinite(value),
      true,
      'Non-finite number at ' + path
    );

    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assert.equal(
        Object.hasOwn(value, i),
        true,
        'Sparse array at ' + path
      );

      assertSerializableValue(
        value[i],
        path + '[' + i + ']'
      );
    }

    return;
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    assert.equal(
      Object.getPrototypeOf(value),
      Object.prototype,
      'Unexpected object type at ' + path
    );

    for (const [key, item] of Object.entries(value)) {
      assertSerializableValue(
        item,
        path + '.' + key
      );
    }

    return;
  }

  assert.fail(
    'Unsupported value at ' + path
  );
}

test('projection does not mutate canonical profile', () => {
  const profile = createProfile();
  const before = structuredClone(profile);

  for (const role of professionalRoles) {
    buildProfessionalProfile(
      profile,
      role,
      context
    );
  }

  assert.deepEqual(profile, before);
});

test('supports deeply frozen canonical profile', () => {
  const profile = deepFreeze(
    createProfile()
  );

  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.equal(result.role, role);
  }
});

test('projection does not mutate trusted context', () => {
  const trustedContext = {
    ...context,
  };

  const before = structuredClone(
    trustedContext
  );

  buildProfessionalProfile(
    createProfile(),
    'founder',
    trustedContext
  );

  assert.deepEqual(
    trustedContext,
    before
  );
});

test('same input produces deterministic projection', () => {
  const profile = createProfile();

  for (const role of professionalRoles) {
    const first = buildProfessionalProfile(
      profile,
      role,
      context
    );

    const second = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.deepEqual(first, second);

    assert.notStrictEqual(
      first,
      second
    );
  }
});

test('public arrays do not share canonical references', () => {
  const profile = createProfile();

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.notStrictEqual(
    result.skills,
    profile.skills
  );

  assert.notStrictEqual(
    result.achievements,
    profile.achievements
  );

  result.skills.push(
    'Public mutation'
  );

  result.achievements.push(
    'Public achievement mutation'
  );

  assert.deepEqual(
    profile.skills,
    ['Product Development']
  );

  assert.deepEqual(
    profile.achievements,
    ['Built a technology product']
  );
});

test('social links do not share canonical references', () => {
  const profile = createProfile();

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.notStrictEqual(
    result.socialLinks,
    profile.socialLinks
  );

  result.socialLinks.website =
    'https://changed.example.com';

  assert.equal(
    profile.socialLinks.website,
    'https://example.com'
  );
});

test('experience entries do not share canonical references', () => {
  const profile = createProfile();

  const result = buildProfessionalProfile(
    profile,
    'mentor',
    context
  );

  assert.notStrictEqual(
    result.experience,
    profile.experience
  );

  assert.notStrictEqual(
    result.experience[0],
    profile.experience[0]
  );

  result.experience[0].company =
    'Changed Company';

  assert.equal(
    profile.experience[0].company,
    'Example Company'
  );
});

test('availability does not share canonical references', () => {
  const profile = createProfile();

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.notStrictEqual(
    result.availability,
    profile.availability
  );

  result.availability.hiring = true;

  assert.equal(
    profile.availability.hiring,
    false
  );
});

test('separate role projections do not share mutable fields', () => {
  const profile = createProfile();

  const founder = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  const investor = buildProfessionalProfile(
    profile,
    'investor',
    context
  );

  founder.achievements.push(
    'Founder-only mutation'
  );

  founder.socialLinks.website =
    'https://changed.example.com';

  founder.experience[0].company =
    'Changed Company';

  assert.deepEqual(
    investor.achievements,
    ['Built a technology product']
  );

  assert.equal(
    investor.socialLinks.website,
    'https://example.com/'
  );

  assert.equal(
    investor.experience[0].company,
    'Example Company'
  );
});

test('verification summaries do not share mutable references', () => {
  const first = buildPublicVerificationSummary({
    emailVerified: true,
  });

  const second = buildPublicVerificationSummary({
    emailVerified: true,
  });

  assert.notStrictEqual(
    first,
    second
  );

  first.identity = true;

  assert.deepEqual(
    second,
    { email: true }
  );
});

test('all role projections contain serializable values', () => {
  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      createProfile(),
      role,
      context
    );

    assertSerializableValue(result);
  }
});

test('malformed optional values do not enter public projection', () => {
  const profile = createProfile({
    coverImageUrl: undefined,
    linkedinUrl: null,
    website: new Date(),
    achievements: [
      undefined,
    ],
    whyBuilding: NaN,
    lookingFor: Infinity,
    experience: [
      {
        company: 'Valid Company',
        role: undefined,
        duration: null,
        description: new Date(),
      },
    ],
  });

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assertSerializableValue(result);

  assertFieldsAbsent(result, [
    'coverImageUrl',
    'linkedinUrl',
    'website',
    'achievements',
    'whyBuilding',
    'lookingFor',
  ]);

  assert.deepEqual(
    result.experience,
    [
      {
        company: 'Valid Company',
      },
    ]
  );
});

test('all role projections survive JSON round trip', () => {
  for (const role of professionalRoles) {
    const result = buildProfessionalProfile(
      createProfile(),
      role,
      context
    );

    const restored = JSON.parse(
      JSON.stringify(result)
    );

    assert.deepEqual(
      restored,
      result
    );
  }
});

test('removed optional fields do not persist in rebuilt projection', () => {
  const profile = createProfile();

  const first = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assertFieldsPresent(first, [
    'coverImageUrl',
    'website',
    'achievements',
    'experience',
    'socialLinks',
  ]);

  delete profile.coverImageUrl;
  delete profile.website;
  delete profile.achievements;
  delete profile.experience;
  delete profile.socialLinks;

  const second = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assertFieldsAbsent(second, [
    'coverImageUrl',
    'website',
    'achievements',
    'experience',
    'socialLinks',
  ]);
});

test('failed publication does not mutate canonical data', () => {
  const profile = createProfile({
    bio: '',
  });

  const before = structuredClone(profile);

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'founder',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );

  assert.deepEqual(
    profile,
    before
  );
});

/**
 * Professional profile test runner.
 *
 * Run explicitly during the scheduled
 * full security test phase.
 */



/**
 * SHARED VALIDATION HARDENING REGRESSION TESTS
 *
 * Step 11.6.3A
 *
 * Runtime execution deferred to Step 23.
 */

const {
  PROFESSIONAL_UID_MAX_LENGTH,
  isValidProfessionalProfileUid,
  isPlainProfessionalRecord,
  getOwnProfessionalValue,
  hasOwnProfessionalTrue,
} = sharedValidation;

// UID validation: 10 tests.

test('shared UID validator accepts normal UID', () => {
  assert.equal(
    isValidProfessionalProfileUid('test-user'),
    true
  );
});

test('shared UID validator enforces maximum length contract', () => {
  assert.equal(
    PROFESSIONAL_UID_MAX_LENGTH,
    128
  );

  assert.equal(
    isValidProfessionalProfileUid(
      'a'.repeat(128)
    ),
    true
  );

  assert.equal(
    isValidProfessionalProfileUid(
      'a'.repeat(129)
    ),
    false
  );
});

test('shared UID validator rejects non-string values', () => {
  for (const value of [
    null,
    undefined,
    123,
    true,
    {},
    [],
  ]) {
    assert.equal(
      isValidProfessionalProfileUid(value),
      false
    );
  }
});

test('shared UID validator rejects empty UID', () => {
  assert.equal(
    isValidProfessionalProfileUid(''),
    false
  );
});

test('shared UID validator rejects surrounding whitespace', () => {
  for (const value of [
    ' test-user',
    'test-user ',
    '   ',
  ]) {
    assert.equal(
      isValidProfessionalProfileUid(value),
      false
    );
  }
});

test('shared UID validator rejects path separators', () => {
  for (const value of [
    'user/child',
    '/user',
    'user/',
  ]) {
    assert.equal(
      isValidProfessionalProfileUid(value),
      false
    );
  }
});

test('shared UID validator rejects dot document IDs', () => {
  for (const value of ['.', '..']) {
    assert.equal(
      isValidProfessionalProfileUid(value),
      false
    );
  }
});

test('shared UID validator rejects reserved document IDs', () => {
  for (const value of [
    '____',
    '__name__',
    '__reserved__',
  ]) {
    assert.equal(
      isValidProfessionalProfileUid(value),
      false
    );
  }
});

test('shared UID validator rejects control characters', () => {
  for (const value of [
    'user\u0000id',
    'user\nid',
    'user\rid',
    'user\tid',
    'user\u001Fid',
    'user\u007Fid',
  ]) {
    assert.equal(
      isValidProfessionalProfileUid(value),
      false
    );
  }
});

test('shared UID validator accepts ordinary non-reserved underscores', () => {
  for (const value of [
    'user_id',
    '__user',
    'user__',
    'user-123',
  ]) {
    assert.equal(
      isValidProfessionalProfileUid(value),
      true
    );
  }
});

// Plain object validation: 6 tests.

test('shared record validator accepts ordinary objects', () => {
  assert.equal(
    isPlainProfessionalRecord({ uid: 'test-user' }),
    true
  );
});

test('shared record validator accepts frozen objects', () => {
  assert.equal(
    isPlainProfessionalRecord(
      Object.freeze({ emailVerified: true })
    ),
    true
  );
});

test('shared record validator accepts null-prototype records', () => {
  assert.equal(
    isPlainProfessionalRecord(
      Object.create(null)
    ),
    true
  );
});

test('shared record validator rejects arrays and dates', () => {
  for (const value of [[], new Date()]) {
    assert.equal(
      isPlainProfessionalRecord(value),
      false
    );
  }
});

test('shared record validator rejects custom prototypes', () => {
  class CustomContext {}

  for (const value of [
    new CustomContext(),
    Object.create({ emailVerified: true }),
  ]) {
    assert.equal(
      isPlainProfessionalRecord(value),
      false
    );
  }
});

test('shared record validator rejects primitive values', () => {
  for (const value of [
    null,
    undefined,
    'text',
    123,
    true,
    () => {},
  ]) {
    assert.equal(
      isPlainProfessionalRecord(value),
      false
    );
  }
});

// Own data property validation: 5 tests.

test('shared own property reader returns explicit own value', () => {
  assert.equal(
    getOwnProfessionalValue(
      { uid: 'test-user' },
      'uid'
    ),
    'test-user'
  );
});

test('shared own property reader ignores missing properties', () => {
  assert.equal(
    getOwnProfessionalValue({}, 'uid'),
    undefined
  );
});

test('shared own property reader ignores inherited properties', () => {
  const value = Object.create({
    uid: 'test-user',
  });

  assert.equal(
    getOwnProfessionalValue(value, 'uid'),
    undefined
  );

  assert.equal(
    getOwnProfessionalValue({}, 'toString'),
    undefined
  );
});

test('shared own property reader does not invoke getters', () => {
  let getterCalls = 0;

  const value = {};

  Object.defineProperty(value, 'uid', {
    enumerable: true,
    get() {
      getterCalls++;
      return 'test-user';
    },
  });

  assert.equal(
    getOwnProfessionalValue(value, 'uid'),
    undefined
  );

  assert.equal(getterCalls, 0);
});

test('shared own property reader accepts null-prototype data properties', () => {
  const value = Object.create(null);

  value.uid = 'test-user';

  assert.equal(
    getOwnProfessionalValue(value, 'uid'),
    'test-user'
  );
});

// Strict boolean validation: 4 tests.

test('shared strict boolean validator accepts own true', () => {
  assert.equal(
    hasOwnProfessionalTrue(
      { emailVerified: true },
      'emailVerified'
    ),
    true
  );
});

test('shared strict boolean validator rejects false and missing flags', () => {
  for (const value of [
    {},
    { emailVerified: false },
    { emailVerified: undefined },
  ]) {
    assert.equal(
      hasOwnProfessionalTrue(
        value,
        'emailVerified'
      ),
      false
    );
  }
});

test('shared strict boolean validator rejects truthy non-booleans', () => {
  for (const flag of [
    'true',
    '1',
    1,
    {},
    [],
    new Boolean(true),
  ]) {
    assert.equal(
      hasOwnProfessionalTrue(
        { emailVerified: flag },
        'emailVerified'
      ),
      false
    );
  }
});

test('shared strict boolean validator rejects inherited and accessor flags', () => {
  const inherited = Object.create({
    emailVerified: true,
  });

  assert.equal(
    hasOwnProfessionalTrue(
      inherited,
      'emailVerified'
    ),
    false
  );

  let getterCalls = 0;

  const accessor = {};

  Object.defineProperty(
    accessor,
    'emailVerified',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    }
  );

  assert.equal(
    hasOwnProfessionalTrue(
      accessor,
      'emailVerified'
    ),
    false
  );

  assert.equal(getterCalls, 0);
});



/**
 * READINESS CONTEXT HARDENING REGRESSION TESTS
 *
 * Step 11.6.3B
 *
 * Runtime execution deferred to Step 23.
 */

function assertReadinessAccountBlocked(
  result
) {
  assert.equal(result.ready, false);
  assert.equal(result.eligible, false);

  assert.ok(
    result.blockers.includes(
      'ACCOUNT_NOT_ACTIVE'
    )
  );
}

// Invalid UID protection: 6 tests.

test('hardened readiness rejects oversized UID', () => {
  const uid = 'a'.repeat(129);

  const result =
    readiness.evaluateProfileReadiness(
      createProfile({ uid }),
      'founder',
      { ...context, uid }
    );

  assertReadinessAccountBlocked(result);
});

test('hardened readiness rejects surrounding UID whitespace', () => {
  for (const uid of [
    ' test-user',
    'test-user ',
  ]) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile({ uid }),
        'founder',
        { ...context, uid }
      );

    assertReadinessAccountBlocked(result);
  }
});

test('hardened readiness rejects dot document IDs', () => {
  for (const uid of ['.', '..']) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile({ uid }),
        'founder',
        { ...context, uid }
      );

    assertReadinessAccountBlocked(result);
  }
});

test('hardened readiness rejects reserved document IDs', () => {
  for (const uid of [
    '__name__',
    '__reserved__',
    '____',
  ]) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile({ uid }),
        'founder',
        { ...context, uid }
      );

    assertReadinessAccountBlocked(result);
  }
});

test('hardened readiness rejects UID control characters', () => {
  for (const uid of [
    'user\u0000id',
    'user\nid',
    'user\tid',
    'user\u007Fid',
  ]) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile({ uid }),
        'founder',
        { ...context, uid }
      );

    assertReadinessAccountBlocked(result);
  }
});

test('hardened readiness rejects missing and malformed UID', () => {
  for (const uid of [
    undefined,
    null,
    '',
    123,
    {},
    [],
    'user/child',
  ]) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile(),
        'founder',
        { ...context, uid }
      );

    assertReadinessAccountBlocked(result);
  }
});

// Malformed context protection: 4 tests.

test('hardened readiness rejects null and primitive contexts', () => {
  for (const invalidContext of [
    null,
    undefined,
    'context',
    123,
    true,
  ]) {
    assert.throws(
      () => readiness.evaluateProfileReadiness(
        createProfile(),
        'founder',
        invalidContext
      ),
      { message: 'INVALID_READINESS_CONTEXT' }
    );
  }
});

test('hardened readiness rejects array context with trusted flags', () => {
  const invalidContext =
    Object.assign([], context);

  assert.throws(
    () => readiness.evaluateProfileReadiness(
      createProfile(),
      'founder',
      invalidContext
    ),
    { message: 'INVALID_READINESS_CONTEXT' }
  );
});

test('hardened readiness rejects date and class contexts', () => {
  class CustomReadinessContext {}

  for (const invalidContext of [
    Object.assign(new Date(), context),
    Object.assign(
      new CustomReadinessContext(),
      context
    ),
  ]) {
    assert.throws(
      () => readiness.evaluateProfileReadiness(
        createProfile(),
        'founder',
        invalidContext
      ),
      { message: 'INVALID_READINESS_CONTEXT' }
    );
  }
});

test('hardened readiness rejects inherited trusted context', () => {
  const invalidContext =
    Object.create(context);

  assert.throws(
    () => readiness.evaluateProfileReadiness(
      createProfile(),
      'founder',
      invalidContext
    ),
    { message: 'INVALID_READINESS_CONTEXT' }
  );
});

// Trusted property and getter protection: 6 tests.

test('hardened readiness never invokes UID getter', () => {
  let getterCalls = 0;

  const invalidContext = {
    ...context,
  };

  Object.defineProperty(
    invalidContext,
    'uid',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return 'test-user';
      },
    }
  );

  const result =
    readiness.evaluateProfileReadiness(
      createProfile(),
      'founder',
      invalidContext
    );

  assertReadinessAccountBlocked(result);
  assert.equal(getterCalls, 0);
});

test('hardened readiness never invokes account active getter', () => {
  let getterCalls = 0;

  const invalidContext = {
    ...context,
  };

  Object.defineProperty(
    invalidContext,
    'accountActive',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    }
  );

  const result =
    readiness.evaluateProfileReadiness(
      createProfile(),
      'founder',
      invalidContext
    );

  assertReadinessAccountBlocked(result);
  assert.equal(getterCalls, 0);
});

test('hardened readiness never invokes email verification getter', () => {
  let getterCalls = 0;

  const invalidContext = {
    ...context,
  };

  Object.defineProperty(
    invalidContext,
    'emailVerified',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    }
  );

  const result =
    readiness.evaluateProfileReadiness(
      createProfile(),
      'founder',
      invalidContext
    );

  assert.equal(result.ready, false);
  assert.equal(result.eligible, true);

  assert.ok(
    result.missingFields.includes(
      'emailVerified'
    )
  );

  assert.equal(getterCalls, 0);
});

test('hardened readiness rejects missing account active flag', () => {
  const invalidContext = {
    uid: context.uid,
    emailVerified: true,
  };

  const result =
    readiness.evaluateProfileReadiness(
      createProfile(),
      'founder',
      invalidContext
    );

  assertReadinessAccountBlocked(result);
});

test('hardened readiness rejects truthy non-boolean account flags', () => {
  for (const accountActive of [
    'true',
    1,
    {},
    [],
    new Boolean(true),
  ]) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile(),
        'founder',
        { ...context, accountActive }
      );

    assertReadinessAccountBlocked(result);
  }
});

test('hardened readiness rejects missing and non-boolean email flags', () => {
  for (const emailVerified of [
    undefined,
    null,
    'true',
    1,
    {},
    [],
    new Boolean(true),
  ]) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile(),
        'founder',
        { ...context, emailVerified }
      );

    assert.equal(result.ready, false);

    assert.ok(
      result.missingFields.includes(
        'emailVerified'
      )
    );
  }
});

// Valid context compatibility: 2 tests.

test('hardened readiness accepts valid null-prototype context', () => {
  const validContext = Object.assign(
    Object.create(null),
    context
  );

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const result =
      readiness.evaluateProfileReadiness(
        createProfile(),
        role,
        validContext
      );

    assert.equal(result.ready, true);
    assert.equal(result.eligible, true);
    assert.equal(result.completionPercent, 100);
  }
});

test('hardened readiness accepts valid maximum length UID', () => {
  const uid = 'a'.repeat(128);

  const result =
    readiness.evaluateProfileReadiness(
      createProfile({ uid }),
      'founder',
      { ...context, uid }
    );

  assert.equal(result.ready, true);
  assert.equal(result.eligible, true);
});

// All-role context protection: 2 tests.

test('hardened all-role readiness rejects malformed context without roles', () => {
  assert.throws(
    () => readiness.evaluateAllProfileReadiness(
      undefined,
      null
    ),
    { message: 'INVALID_READINESS_CONTEXT' }
  );

  assert.throws(
    () => readiness.evaluateAllProfileReadiness(
      { roles: [] },
      []
    ),
    { message: 'INVALID_READINESS_CONTEXT' }
  );
});

test('hardened all-role readiness blocks every role for invalid UID', () => {
  const uid = '__reserved__';

  const results =
    readiness.evaluateAllProfileReadiness(
      createProfile({ uid }),
      { ...context, uid }
    );

  assert.equal(results.length, 3);

  assert.deepEqual(
    results.map(result => result.role),
    ['founder', 'investor', 'mentor']
  );

  for (const result of results) {
    assertReadinessAccountBlocked(result);
  }
});



/**
 * PUBLICATION AND VERIFICATION HARDENING REGRESSION TESTS
 *
 * Step 11.6.3C
 *
 * Runtime execution deferred to Step 23.
 */

// Publication UID protection: 4 tests.

test('hardened publication rejects dot document IDs', () => {
  for (const uid of ['.', '..']) {
    for (const role of [
      'founder',
      'investor',
      'mentor',
    ]) {
      assert.throws(
        () => getProfessionalProfileId(
          uid,
          role
        ),
        {
          message:
            'INVALID_PROFESSIONAL_PROFILE_UID',
        }
      );

      assert.throws(
        () => buildProfessionalProfile(
          createProfile({ uid }),
          role,
          { ...context, uid }
        ),
        {
          message:
            'INVALID_PROFESSIONAL_PROFILE_UID',
        }
      );
    }
  }
});

test('hardened publication rejects reserved document IDs', () => {
  for (const uid of [
    '____',
    '__name__',
    '__reserved__',
  ]) {
    for (const role of [
      'founder',
      'investor',
      'mentor',
    ]) {
      assert.throws(
        () => getProfessionalProfileId(
          uid,
          role
        ),
        {
          message:
            'INVALID_PROFESSIONAL_PROFILE_UID',
        }
      );

      assert.throws(
        () => buildProfessionalProfile(
          createProfile({ uid }),
          role,
          { ...context, uid }
        ),
        {
          message:
            'INVALID_PROFESSIONAL_PROFILE_UID',
        }
      );
    }
  }
});

test('hardened publication rejects missing own UID', () => {
  const invalidContext = {
    emailVerified: true,
    accountActive: true,
    publicationAuthorized: true,
  };

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'INVALID_PROFESSIONAL_PROFILE_UID',
    }
  );
});

test('hardened publication accepts maximum length UID consistently', () => {
  const uid = 'a'.repeat(128);

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const result =
      buildProfessionalProfile(
        createProfile({ uid }),
        role,
        { ...context, uid }
      );

    assert.equal(result.uid, uid);
    assert.equal(result.role, role);

    assert.equal(
      getProfessionalProfileId(uid, role),
      role + '_' + uid
    );
  }
});

// Malformed publication context: 4 tests.

test('hardened publication rejects array context with valid flags', () => {
  const invalidContext =
    Object.assign([], context);

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'INVALID_PUBLICATION_CONTEXT',
    }
  );
});

test('hardened publication rejects date context with valid flags', () => {
  const invalidContext =
    Object.assign(new Date(), context);

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'INVALID_PUBLICATION_CONTEXT',
    }
  );
});

test('hardened publication rejects class instance context', () => {
  class CustomPublicationContext {}

  const invalidContext =
    Object.assign(
      new CustomPublicationContext(),
      context
    );

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'INVALID_PUBLICATION_CONTEXT',
    }
  );
});

test('hardened publication rejects inherited trusted context', () => {
  const invalidContext =
    Object.create(context);

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'INVALID_PUBLICATION_CONTEXT',
    }
  );
});

// Publication getter protection: 4 tests.

test('hardened publication never invokes UID getter', () => {
  let getterCalls = 0;

  const invalidContext = {
    ...context,
  };

  Object.defineProperty(
    invalidContext,
    'uid',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return 'test-user';
      },
    }
  );

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'INVALID_PROFESSIONAL_PROFILE_UID',
    }
  );

  assert.equal(getterCalls, 0);
});

test('hardened publication never invokes authorization getter', () => {
  let getterCalls = 0;

  const invalidContext = {
    ...context,
  };

  Object.defineProperty(
    invalidContext,
    'publicationAuthorized',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    }
  );

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'PROFILE_PUBLICATION_NOT_AUTHORIZED',
    }
  );

  assert.equal(getterCalls, 0);
});

test('hardened publication never invokes account active getter', () => {
  let getterCalls = 0;

  const invalidContext = {
    ...context,
  };

  Object.defineProperty(
    invalidContext,
    'accountActive',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    }
  );

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_NOT_READY',
    }
  );

  assert.equal(getterCalls, 0);
});

test('hardened publication never invokes email verification getter', () => {
  let getterCalls = 0;

  const invalidContext = {
    ...context,
  };

  Object.defineProperty(
    invalidContext,
    'emailVerified',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    }
  );

  assert.throws(
    () => buildProfessionalProfile(
      createProfile(),
      'founder',
      invalidContext
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_NOT_READY',
    }
  );

  assert.equal(getterCalls, 0);
});

// Publication context compatibility: 2 tests.

test('hardened publication accepts valid null-prototype context', () => {
  const validContext =
    Object.assign(
      Object.create(null),
      context
    );

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const result =
      buildProfessionalProfile(
        createProfile(),
        role,
        validContext
      );

    assert.equal(
      result.uid,
      context.uid
    );

    assert.equal(result.role, role);
    assert.equal(result.status, 'published');

    assert.deepEqual(
      result.verification,
      { email: true }
    );
  }
});

test('hardened publication accepts frozen trusted context', () => {
  const validContext =
    Object.freeze({
      ...context,
    });

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const result =
      buildProfessionalProfile(
        createProfile(),
        role,
        validContext
      );

    assert.equal(
      result.uid,
      context.uid
    );

    assert.equal(result.role, role);
    assert.equal(result.visibility, 'public');

    assert.deepEqual(
      result.verification,
      { email: true }
    );
  }
});

// Verification context protection: 4 tests.

test('hardened verification rejects array context with email flag', () => {
  const invalidContext =
    Object.assign([], {
      emailVerified: true,
    });

  assert.throws(
    () => buildPublicVerificationSummary(
      invalidContext
    ),
    {
      message:
        'INVALID_VERIFICATION_CONTEXT',
    }
  );
});

test('hardened verification rejects date context with email flag', () => {
  const invalidContext =
    Object.assign(new Date(), {
      emailVerified: true,
    });

  assert.throws(
    () => buildPublicVerificationSummary(
      invalidContext
    ),
    {
      message:
        'INVALID_VERIFICATION_CONTEXT',
    }
  );
});

test('hardened verification rejects class instance context', () => {
  class CustomVerificationContext {
    constructor() {
      this.emailVerified = true;
    }
  }

  assert.throws(
    () => buildPublicVerificationSummary(
      new CustomVerificationContext()
    ),
    {
      message:
        'INVALID_VERIFICATION_CONTEXT',
    }
  );
});

test('hardened verification rejects inherited email verification', () => {
  const invalidContext =
    Object.create({
      emailVerified: true,
    });

  assert.throws(
    () => buildPublicVerificationSummary(
      invalidContext
    ),
    {
      message:
        'INVALID_VERIFICATION_CONTEXT',
    }
  );
});

// Verification claim protection: 4 tests.

test('hardened verification never invokes email verification getter', () => {
  let getterCalls = 0;

  const invalidContext = {};

  Object.defineProperty(
    invalidContext,
    'emailVerified',
    {
      enumerable: true,
      get() {
        getterCalls++;
        return true;
      },
    }
  );

  assert.deepEqual(
    buildPublicVerificationSummary(
      invalidContext
    ),
    {}
  );

  assert.equal(getterCalls, 0);
});

test('hardened verification accepts own true on null-prototype context', () => {
  const validContext =
    Object.create(null);

  validContext.emailVerified = true;

  assert.deepEqual(
    buildPublicVerificationSummary(
      validContext
    ),
    { email: true }
  );
});

test('hardened verification accepts frozen context without mutation', () => {
  const validContext =
    Object.freeze({
      emailVerified: true,
    });

  const result =
    buildPublicVerificationSummary(
      validContext
    );

  assert.deepEqual(
    result,
    { email: true }
  );

  assert.deepEqual(
    validContext,
    { emailVerified: true }
  );
});

test('hardened verification never evaluates unsupported claim getters', () => {
  let getterCalls = 0;

  const validContext = {
    emailVerified: true,
  };

  for (const field of [
    'identity',
    'address',
    'business',
    'bankAccount',
    'financialCapacity',
    'professional',
    'identityVerified',
    'financialCapacityVerified',
  ]) {
    Object.defineProperty(
      validContext,
      field,
      {
        enumerable: true,
        get() {
          getterCalls++;
          return true;
        },
      }
    );
  }

  assert.deepEqual(
    buildPublicVerificationSummary(
      validContext
    ),
    { email: true }
  );

  assert.equal(getterCalls, 0);
});



/**
 * UTF-8 PROJECTION SIZE REGRESSION TESTS
 *
 * Step 11.6.3D
 *
 * Runtime execution deferred to Step 23.
 */

const {
  PROFESSIONAL_PROFILE_MAX_JSON_BYTES,
} = professionalProfile;

function measureProjectionJsonBytes(value) {
  return Buffer.byteLength(
    JSON.stringify(value),
    'utf8'
  );
}

/**
 * Generate a valid ASCII profile whose projected
 * JSON has an exact target byte length.
 *
 * Every experience description remains within
 * the individual 10,000-character limit.
 *
 * Use Buffer.byteLength as an independent
 * measurement of the TextEncoder-based guard.
 */
function createExactSizeProfile(
  targetBytes,
  role = 'founder'
) {
  const experience = Array.from(
    { length: 50 },
    (_, index) => ({
      company: 'Company ' + index,
      role: 'Professional',
      duration: '2020 - 2025',
      description: 'a',
    })
  );

  const profile = createProfile({
    experience,
    achievements: Array.from(
      { length: 100 },
      (_, index) =>
        String(index).padStart(3, '0') +
        'b'.repeat(997)
    ),
  });

  const baseline =
    buildProfessionalProfile(
      profile,
      role,
      context
    );

  const baselineBytes =
    measureProjectionJsonBytes(
      baseline
    );

  let remaining =
    targetBytes - baselineBytes;

  assert.ok(
    remaining >= 0,
    'Target must exceed baseline size'
  );

  for (const entry of experience) {
    const available =
      10000 - entry.description.length;

    const increment =
      Math.min(available, remaining);

    entry.description +=
      'a'.repeat(increment);

    remaining -= increment;

    if (remaining === 0) {
      break;
    }
  }

  assert.equal(
    remaining,
    0,
    'Fixture cannot reach requested size'
  );

  return profile;
}

// Size budget contract: 1 test.

test('projection size budget is exactly 512 KiB', () => {
  assert.equal(
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES,
    524288
  );
});

// Normal profile compatibility: 2 tests.

test('projection size guard accepts normal profiles for every role', () => {
  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const result =
      buildProfessionalProfile(
        createProfile(),
        role,
        context
      );

    assert.equal(result.role, role);
    assert.equal(result.status, 'published');

    assert.ok(
      measureProjectionJsonBytes(result) <
      PROFESSIONAL_PROFILE_MAX_JSON_BYTES
    );
  }
});

test('projection size guard preserves ordinary Unicode content', () => {
  const profile = createProfile({
    fullName: 'বাংলা নাম',
    bio: 'বাংলাদেশের প্রযুক্তি উদ্যোক্তা',
    location: 'ঢাকা, বাংলাদেশ',
    achievements: [
      'প্রযুক্তি উদ্যোগ',
      'Innovation 🚀',
      'مرحبا',
    ],
  });

  const result =
    buildProfessionalProfile(
      profile,
      'founder',
      context
    );

  assert.equal(
    result.fullName,
    profile.fullName
  );

  assert.equal(
    result.bio,
    profile.bio
  );

  assert.deepEqual(
    result.achievements,
    profile.achievements
  );
});

// Exact size boundary: 3 tests.

test('projection size guard accepts one byte below budget', () => {
  const target =
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES - 1;

  const result =
    buildProfessionalProfile(
      createExactSizeProfile(target),
      'founder',
      context
    );

  assert.equal(
    measureProjectionJsonBytes(result),
    target
  );
});

test('projection size guard accepts exact byte budget', () => {
  const target =
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES;

  const result =
    buildProfessionalProfile(
      createExactSizeProfile(target),
      'founder',
      context
    );

  assert.equal(
    measureProjectionJsonBytes(result),
    target
  );
});

test('projection size guard rejects one byte above budget', () => {
  const profile =
    createExactSizeProfile(
      PROFESSIONAL_PROFILE_MAX_JSON_BYTES
    );

  const boundaryProjection =
    buildProfessionalProfile(
      profile,
      'founder',
      context
    );

  assert.equal(
    measureProjectionJsonBytes(
      boundaryProjection
    ),
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES
  );

  const entry =
    profile.experience.find(
      item =>
        item.description.length < 10000
    );

  assert.ok(entry);

  entry.description += 'a';

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'founder',
      context
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_TOO_LARGE',
    }
  );
});

// Unicode byte measurement: 3 tests.

test('projection size guard measures Bangla UTF-8 bytes', () => {
  const profile =
    createExactSizeProfile(
      PROFESSIONAL_PROFILE_MAX_JSON_BYTES
    );

  const baseline =
    buildProfessionalProfile(
      profile,
      'founder',
      context
    );

  assert.equal(
    measureProjectionJsonBytes(baseline),
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES
  );

  const entry = profile.experience[0];

  const originalLength =
    entry.description.length;

  entry.description =
    'ক' + entry.description.slice(1);

  assert.equal(
    entry.description.length,
    originalLength
  );

  assert.equal(
    Buffer.byteLength('ক', 'utf8'),
    3
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'founder',
      context
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_TOO_LARGE',
    }
  );
});

test('projection size guard measures emoji UTF-8 bytes', () => {
  const profile =
    createExactSizeProfile(
      PROFESSIONAL_PROFILE_MAX_JSON_BYTES
    );

  const baseline =
    buildProfessionalProfile(
      profile,
      'founder',
      context
    );

  assert.equal(
    measureProjectionJsonBytes(baseline),
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES
  );

  const entry = profile.experience[0];

  const originalLength =
    entry.description.length;

  entry.description =
    '🚀' + entry.description.slice(2);

  assert.equal(
    entry.description.length,
    originalLength
  );

  assert.equal(
    Buffer.byteLength('🚀', 'utf8'),
    4
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'founder',
      context
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_TOO_LARGE',
    }
  );
});

test('projection size guard accepts Unicode at exact byte boundary', () => {
  const profile =
    createExactSizeProfile(
      PROFESSIONAL_PROFILE_MAX_JSON_BYTES - 2
    );

  const entry = profile.experience[0];

  entry.description =
    'ক' + entry.description.slice(1);

  const result =
    buildProfessionalProfile(
      profile,
      'founder',
      context
    );

  assert.equal(
    measureProjectionJsonBytes(result),
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES
  );

  assert.ok(
    result.experience[0]
      .description.startsWith('ক')
  );
});

// Oversized projection protection: 3 tests.

test('projection size guard rejects oversized founder experience', () => {
  const profile = createProfile({
    experience: Array.from(
      { length: 50 },
      () => ({
        company: 'a'.repeat(10000),
        role: 'b'.repeat(10000),
        duration: 'c'.repeat(10000),
        description: 'd'.repeat(10000),
      })
    ),
  });

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'founder',
      context
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_TOO_LARGE',
    }
  );
});

test('projection size guard rejects oversized investor experience', () => {
  const profile = createProfile({
    experience: Array.from(
      { length: 50 },
      () => ({
        company: 'a'.repeat(10000),
        role: 'b'.repeat(10000),
        duration: 'c'.repeat(10000),
        description: 'd'.repeat(10000),
      })
    ),
  });

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'investor',
      context
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_TOO_LARGE',
    }
  );
});

test('projection size guard rejects oversized mentor Unicode experience', () => {
  const profile = createProfile({
    experience: Array.from(
      { length: 50 },
      () => ({
        company: 'ক'.repeat(10000),
        role: 'খ'.repeat(10000),
        duration: 'গ'.repeat(10000),
        description: 'ঘ'.repeat(10000),
      })
    ),
  });

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'mentor',
      context
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_TOO_LARGE',
    }
  );
});

// Canonical data and privacy preservation: 3 tests.

test('projection size guard ignores excluded private fields', () => {
  const normalProfile =
    createProfile();

  const privateProfile =
    createProfile({
      bankStatement:
        'PRIVATE_'.repeat(100000),

      identityDocuments: {
        document:
          'PRIVATE_'.repeat(100000),
      },
    });

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const normal =
      buildProfessionalProfile(
        normalProfile,
        role,
        context
      );

    const result =
      buildProfessionalProfile(
        privateProfile,
        role,
        context
      );

    assert.deepEqual(result, normal);

    assert.equal(
      measureProjectionJsonBytes(result),
      measureProjectionJsonBytes(normal)
    );

    assert.equal(
      Object.hasOwn(result, 'bankStatement'),
      false
    );

    assert.equal(
      Object.hasOwn(result, 'identityDocuments'),
      false
    );
  }
});

test('projection size guard does not mutate rejected canonical profile', () => {
  const profile =
    createExactSizeProfile(
      PROFESSIONAL_PROFILE_MAX_JSON_BYTES + 1
    );

  const before =
    JSON.stringify(profile);

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'founder',
      context
    ),
    {
      message:
        'PROFESSIONAL_PROFILE_TOO_LARGE',
    }
  );

  assert.equal(
    JSON.stringify(profile),
    before
  );
});

test('projection size guard never truncates accepted boundary profile', () => {
  const profile =
    createExactSizeProfile(
      PROFESSIONAL_PROFILE_MAX_JSON_BYTES
    );

  const before =
    JSON.stringify(profile);

  const result =
    buildProfessionalProfile(
      profile,
      'founder',
      context
    );

  assert.deepEqual(
    result.experience,
    profile.experience
  );

  assert.deepEqual(
    result.achievements,
    profile.achievements
  );

  assert.equal(
    measureProjectionJsonBytes(result),
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES
  );

  assert.equal(
    JSON.stringify(profile),
    before
  );
});


// ==================================================
// SAFE ARRAY AND IDENTITY SNAPSHOT REGRESSION TESTS
// ==================================================

const safeArrayItem =
  sharedValidation.getOwnProfessionalArrayItem;

const safeStringArray =
  sharedValidation.sanitizePublicStringArray;

const safeIdentitySnapshot =
  sharedValidation.buildProfessionalIdentitySnapshot;

const safeRoleArrayLimit =
  sharedValidation.PROFESSIONAL_ROLE_ARRAY_MAX_ITEMS;

// --------------------------------------------------
// Safe array item reader: 7 tests
// --------------------------------------------------

test('safe array reader returns own data item', () => {
  assert.equal(
    safeArrayItem(['founder'], 0),
    'founder'
  );
});

test('safe array reader rejects non-array input', () => {
  assert.equal(
    safeArrayItem({ 0: 'founder' }, 0),
    undefined
  );
});

test('safe array reader rejects invalid indexes', () => {
  const values = ['founder'];

  for (const index of [
    -1, 1, 0.5, NaN, Infinity, '0',
  ]) {
    assert.equal(
      safeArrayItem(values, index),
      undefined
    );
  }
});

test('safe array reader rejects sparse items', () => {
  const values = new Array(1);

  assert.equal(
    safeArrayItem(values, 0),
    undefined
  );
});

test('safe array reader rejects inherited items', () => {
  const values = new Array(1);
  const prototype = Object.create(Array.prototype);

  prototype[0] = 'founder';

  Object.setPrototypeOf(values, prototype);

  assert.equal(
    safeArrayItem(values, 0),
    undefined
  );
});

test('safe array reader never invokes item getter', () => {
  const values = ['founder'];
  let calls = 0;

  Object.defineProperty(values, '0', {
    get() {
      calls++;
      return 'investor';
    },
  });

  assert.equal(
    safeArrayItem(values, 0),
    undefined
  );

  assert.equal(calls, 0);
});

test('safe array reader supports frozen arrays', () => {
  const values = Object.freeze(['mentor']);

  assert.equal(
    safeArrayItem(values, 0),
    'mentor'
  );
});

// --------------------------------------------------
// String array sanitizer: 5 tests
// --------------------------------------------------

test('string sanitizer rejects accessor array items', () => {
  const values = ['Engineering'];
  let calls = 0;

  Object.defineProperty(values, '0', {
    get() {
      calls++;
      return 'Engineering';
    },
  });

  assert.equal(
    safeStringArray(values),
    undefined
  );

  assert.equal(calls, 0);
});

test('string sanitizer rejects inherited array items', () => {
  const values = new Array(1);
  const prototype = Object.create(Array.prototype);

  prototype[0] = 'Engineering';

  Object.setPrototypeOf(values, prototype);

  assert.equal(
    safeStringArray(values),
    undefined
  );
});

test('string sanitizer ignores custom source iterator', () => {
  const values = ['Engineering'];
  let calls = 0;

  Object.defineProperty(values, Symbol.iterator, {
    value() {
      calls++;
      throw new Error('UNSAFE_ITERATOR');
    },
  });

  assert.deepEqual(
    safeStringArray(values),
    ['Engineering']
  );

  assert.equal(calls, 0);
});

test('string sanitizer preserves frozen array compatibility', () => {
  const values = Object.freeze([
    ' Engineering ',
    'Engineering',
    'Product',
  ]);

  assert.deepEqual(
    safeStringArray(values),
    ['Engineering', 'Product']
  );
});

test('string sanitizer rejects partially sparse arrays', () => {
  const values = ['Engineering'];
  values.length = 2;

  assert.equal(
    safeStringArray(values),
    undefined
  );
});

// --------------------------------------------------
// Identity snapshot: 18 tests
// --------------------------------------------------

test('identity snapshot copies only identity fields', () => {
  const result = safeIdentitySnapshot({
    uid: 'test-user',
    status: 'active',
    roles: ['founder'],
    role: 'founder',
    email: 'private@example.com',
    bankAccountNumber: 'PRIVATE_BANK',
    fullName: 'Private Name',
  });

  assert.deepEqual(
    Object.keys(result).sort(),
    ['role', 'roles', 'status', 'uid']
  );

  assert.equal(
    Object.getPrototypeOf(result),
    null
  );
});

test('identity snapshot preserves missing legacy uid and status', () => {
  const result = safeIdentitySnapshot({
    role: 'founder',
  });

  assert.equal(
    Object.hasOwn(result, 'uid'),
    false
  );

  assert.equal(
    Object.hasOwn(result, 'status'),
    false
  );

  assert.equal(result.role, 'founder');
});

test('identity snapshot preserves explicit undefined legacy fields', () => {
  const result = safeIdentitySnapshot({
    uid: undefined,
    status: undefined,
    roles: undefined,
    role: 'founder',
  });

  for (const field of [
    'uid', 'status', 'roles',
  ]) {
    assert.equal(
      Object.hasOwn(result, field),
      true
    );

    assert.equal(
      result[field],
      undefined
    );
  }
});

test('identity snapshot preserves explicit invalid identity values', () => {
  const result = safeIdentitySnapshot({
    uid: null,
    status: 'unknown',
    roles: 'founder',
    role: 'founder',
  });

  assert.equal(result.uid, null);
  assert.equal(result.status, 'unknown');
  assert.equal(result.roles, 'founder');
});

test('identity snapshot preserves suspended status', () => {
  const result = safeIdentitySnapshot({
    uid: 'test-user',
    status: 'suspended',
    roles: ['founder'],
  });

  assert.equal(
    result.status,
    'suspended'
  );
});

test('identity snapshot rejects non-plain records', () => {
  class InvalidProfile {}

  for (const value of [
    undefined,
    null,
    'founder',
    123,
    [],
    new Date(),
    new InvalidProfile(),
  ]) {
    assert.equal(
      safeIdentitySnapshot(value),
      undefined
    );
  }
});

test('identity snapshot rejects uid getter without execution', () => {
  const profile = {
    roles: ['founder'],
  };

  let calls = 0;

  Object.defineProperty(profile, 'uid', {
    get() {
      calls++;
      return 'test-user';
    },
  });

  assert.equal(
    safeIdentitySnapshot(profile),
    undefined
  );

  assert.equal(calls, 0);
});

test('identity snapshot rejects status getter without execution', () => {
  const profile = {
    uid: 'test-user',
    roles: ['founder'],
  };

  let calls = 0;

  Object.defineProperty(profile, 'status', {
    get() {
      calls++;
      return 'active';
    },
  });

  assert.equal(
    safeIdentitySnapshot(profile),
    undefined
  );

  assert.equal(calls, 0);
});

test('identity snapshot rejects roles getter without execution', () => {
  const profile = {
    uid: 'test-user',
    role: 'founder',
  };

  let calls = 0;

  Object.defineProperty(profile, 'roles', {
    get() {
      calls++;
      return ['founder'];
    },
  });

  assert.equal(
    safeIdentitySnapshot(profile),
    undefined
  );

  assert.equal(calls, 0);
});

test('identity snapshot rejects legacy role getter', () => {
  const profile = {
    uid: 'test-user',
    roles: ['founder'],
  };

  let calls = 0;

  Object.defineProperty(profile, 'role', {
    get() {
      calls++;
      return 'founder';
    },
  });

  assert.equal(
    safeIdentitySnapshot(profile),
    undefined
  );

  assert.equal(calls, 0);
});

test('identity snapshot rejects inherited identity fields', () => {
  const profile = Object.create({
    uid: 'test-user',
    status: 'active',
    roles: ['founder'],
  });

  assert.equal(
    safeIdentitySnapshot(profile),
    undefined
  );
});

test('identity snapshot rejects role array item getter', () => {
  const roles = ['founder'];
  let calls = 0;

  Object.defineProperty(roles, '0', {
    get() {
      calls++;
      return 'investor';
    },
  });

  assert.equal(
    safeIdentitySnapshot({ roles }),
    undefined
  );

  assert.equal(calls, 0);
});

test('identity snapshot rejects inherited role array items', () => {
  const roles = new Array(1);
  const prototype = Object.create(Array.prototype);

  prototype[0] = 'founder';

  Object.setPrototypeOf(roles, prototype);

  assert.equal(
    safeIdentitySnapshot({ roles }),
    undefined
  );
});

test('identity snapshot rejects sparse role arrays', () => {
  const roles = ['founder'];
  roles.length = 2;

  assert.equal(
    safeIdentitySnapshot({ roles }),
    undefined
  );
});

test('identity snapshot ignores source role array methods', () => {
  const roles = ['founder'];
  let calls = 0;

  Object.defineProperty(roles, 'includes', {
    value() {
      calls++;
      return true;
    },
  });

  Object.defineProperty(roles, Symbol.iterator, {
    value() {
      calls++;
      throw new Error('UNSAFE_ITERATOR');
    },
  });

  const result = safeIdentitySnapshot({ roles });

  assert.deepEqual(
    result.roles,
    ['founder']
  );

  assert.equal(
    result.roles.includes('investor'),
    false
  );

  assert.equal(calls, 0);
});

test('identity snapshot enforces role array size limit', () => {
  assert.equal(safeRoleArrayLimit, 100);

  const accepted = Array(100).fill('founder');
  const rejected = Array(101).fill('founder');

  assert.equal(
    safeIdentitySnapshot({
      roles: accepted,
    }).roles.length,
    100
  );

  assert.equal(
    safeIdentitySnapshot({
      roles: rejected,
    }),
    undefined
  );
});

test('identity snapshot supports null-prototype records', () => {
  const profile = Object.assign(
    Object.create(null),
    {
      uid: 'test-user',
      status: 'active',
      roles: ['founder', 'mentor'],
    }
  );

  const result = safeIdentitySnapshot(profile);

  assert.equal(
    result.uid,
    'test-user'
  );

  assert.deepEqual(
    result.roles,
    ['founder', 'mentor']
  );
});

test('identity snapshot copies frozen role arrays without mutation', () => {
  const roles = Object.freeze([
    'founder',
    'investor',
    'mentor',
  ]);

  const profile = Object.freeze({
    uid: 'test-user',
    status: 'active',
    roles,
  });

  const result = safeIdentitySnapshot(profile);

  assert.deepEqual(result.roles, roles);
  assert.notEqual(result.roles, roles);

  result.roles.push('other');

  assert.equal(profile.roles.length, 3);
});


// ==================================================
// CANONICAL READINESS BOUNDARY REGRESSION TESTS
// ==================================================

function evaluateCanonicalReadiness(
  profile,
  role = 'founder'
) {
  return readiness.evaluateProfileReadiness(
    profile,
    role,
    context
  );
}

function assertCanonicalIdentityBlocked(
  result
) {
  assert.equal(result.ready, false);
  assert.equal(result.eligible, false);

  assert.ok(
    result.blockers.includes(
      'ACCOUNT_NOT_ACTIVE'
    )
  );

  assert.ok(
    result.blockers.includes(
      'ROLE_NOT_OWNED'
    )
  );
}

function assertCanonicalFieldMissing(
  result,
  field
) {
  assert.equal(result.ready, false);
  assert.equal(result.eligible, true);

  assert.ok(
    result.missingFields.includes(field)
  );
}

function installCanonicalTestGetter(
  target,
  field,
  returnedValue
) {
  let calls = 0;

  Object.defineProperty(target, field, {
    configurable: true,
    enumerable: true,

    get() {
      calls++;
      return returnedValue;
    },
  });

  return () => calls;
}

// --------------------------------------------------
// Canonical identity protection: 8 tests
// --------------------------------------------------

test('canonical readiness rejects uid getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'uid',
    'test-user'
  );

  assertCanonicalIdentityBlocked(
    evaluateCanonicalReadiness(profile)
  );

  assert.equal(calls(), 0);
});

test('canonical readiness rejects status getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'status',
    'active'
  );

  assertCanonicalIdentityBlocked(
    evaluateCanonicalReadiness(profile)
  );

  assert.equal(calls(), 0);
});

test('canonical readiness rejects roles getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'roles',
    ['founder']
  );

  assertCanonicalIdentityBlocked(
    evaluateCanonicalReadiness(profile)
  );

  assert.equal(calls(), 0);
});

test('canonical readiness rejects legacy role getter', () => {
  const profile = createProfile();

  delete profile.roles;

  const calls = installCanonicalTestGetter(
    profile,
    'role',
    'founder'
  );

  assertCanonicalIdentityBlocked(
    evaluateCanonicalReadiness(profile)
  );

  assert.equal(calls(), 0);
});

test('canonical readiness rejects inherited identity', () => {
  const profile = Object.create(
    createProfile()
  );

  assertCanonicalIdentityBlocked(
    evaluateCanonicalReadiness(profile)
  );
});

test('canonical readiness rejects role item getter', () => {
  const roles = ['founder'];

  const calls = installCanonicalTestGetter(
    roles,
    '0',
    'founder'
  );

  const profile = createProfile({ roles });

  assertCanonicalIdentityBlocked(
    evaluateCanonicalReadiness(profile)
  );

  assert.equal(calls(), 0);
});

test('canonical readiness rejects sparse role array', () => {
  const roles = ['founder'];

  roles.length = 2;

  const profile = createProfile({ roles });

  assertCanonicalIdentityBlocked(
    evaluateCanonicalReadiness(profile)
  );
});

test('canonical readiness ignores forged role includes method', () => {
  const roles = ['founder'];
  let calls = 0;

  Object.defineProperty(roles, 'includes', {
    value() {
      calls++;
      return true;
    },
  });

  const profile = createProfile({ roles });

  const founder =
    evaluateCanonicalReadiness(
      profile,
      'founder'
    );

  const investor =
    evaluateCanonicalReadiness(
      profile,
      'investor'
    );

  assert.equal(founder.ready, true);
  assert.equal(investor.ready, false);
  assert.equal(investor.eligible, false);

  assert.ok(
    investor.blockers.includes(
      'ROLE_NOT_OWNED'
    )
  );

  assert.equal(calls, 0);
});

// --------------------------------------------------
// Required field getter protection: 7 tests
// --------------------------------------------------

test('canonical readiness excludes full name getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'fullName',
    'Valid Name'
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(profile),
    'fullName'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes photo getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'imageUrl',
    'https://example.com/photo.jpg'
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(profile),
    'imageUrl'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes location getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'location',
    'Dhaka'
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(profile),
    'location'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes founder headline getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'headline',
    'Technology Founder'
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(profile),
    'headline'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes founder bio getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'bio',
    'Valid Founder Bio'
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(profile),
    'bio'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes investor bio getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'investorBio',
    'Valid Investor Bio'
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(
      profile,
      'investor'
    ),
    'investorBio'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes mentor bio getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'mentorBio',
    'Valid Mentor Bio'
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(
      profile,
      'mentor'
    ),
    'mentorBio'
  );

  assert.equal(calls(), 0);
});

// --------------------------------------------------
// Required array protection: 3 tests
// --------------------------------------------------

test('canonical readiness excludes founder skills getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'skills',
    ['Engineering']
  );

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(profile),
    'skills'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes investor array item getter', () => {
  const investmentFocus = ['Technology'];

  const calls = installCanonicalTestGetter(
    investmentFocus,
    '0',
    'Technology'
  );

  const profile = createProfile({
    investmentFocus,
  });

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(
      profile,
      'investor'
    ),
    'investmentFocus'
  );

  assert.equal(calls(), 0);
});

test('canonical readiness excludes inherited mentor skill item', () => {
  const mentorSkills = new Array(1);

  const prototype =
    Object.create(Array.prototype);

  prototype[0] = 'Business Strategy';

  Object.setPrototypeOf(
    mentorSkills,
    prototype
  );

  const profile = createProfile({
    mentorSkills,
  });

  assertCanonicalFieldMissing(
    evaluateCanonicalReadiness(
      profile,
      'mentor'
    ),
    'mentorSkills'
  );
});

// --------------------------------------------------
// All-role readiness protection: 4 tests
// --------------------------------------------------

test('all-role canonical readiness rejects roles getter', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'roles',
    ['founder', 'investor', 'mentor']
  );

  const results =
    readiness.evaluateAllProfileReadiness(
      profile,
      context
    );

  assert.deepEqual(results, []);
  assert.equal(calls(), 0);
});

test('all-role canonical readiness rejects oversized role array', () => {
  const profile = createProfile({
    roles: Array(101).fill('founder'),
  });

  const results =
    readiness.evaluateAllProfileReadiness(
      profile,
      context
    );

  assert.deepEqual(results, []);
});

test('all-role canonical readiness preserves role-specific isolation', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'investorBio',
    'Valid Investor Bio'
  );

  const results =
    readiness.evaluateAllProfileReadiness(
      profile,
      context
    );

  assert.equal(results.length, 3);

  const founder = results.find(
    result => result.role === 'founder'
  );

  const investor = results.find(
    result => result.role === 'investor'
  );

  const mentor = results.find(
    result => result.role === 'mentor'
  );

  assert.equal(founder.ready, true);
  assert.equal(mentor.ready, true);

  assertCanonicalFieldMissing(
    investor,
    'investorBio'
  );

  assert.equal(calls(), 0);
});

test('all-role canonical readiness ignores custom role iterator', () => {
  const roles = [
    'founder',
    'investor',
    'mentor',
  ];

  let calls = 0;

  Object.defineProperty(
    roles,
    Symbol.iterator,
    {
      value() {
        calls++;
        throw new Error(
          'UNSAFE_ROLE_ITERATOR'
        );
      },
    }
  );

  const profile = createProfile({ roles });

  const results =
    readiness.evaluateAllProfileReadiness(
      profile,
      context
    );

  assert.equal(results.length, 3);

  assert.ok(
    results.every(result => result.ready)
  );

  assert.equal(calls, 0);
});

// --------------------------------------------------
// Legacy compatibility: 3 tests
// --------------------------------------------------

test('canonical readiness preserves legacy single-role profile', () => {
  const profile = createProfile();

  delete profile.uid;
  delete profile.status;
  delete profile.roles;

  profile.role = 'founder';

  const result =
    evaluateCanonicalReadiness(profile);

  assert.equal(result.ready, true);
  assert.equal(result.eligible, true);

  const results =
    readiness.evaluateAllProfileReadiness(
      profile,
      context
    );

  assert.equal(results.length, 1);
  assert.equal(results[0].role, 'founder');
  assert.equal(results[0].ready, true);
});

test('canonical readiness preserves null-prototype compatibility', () => {
  const profile = Object.assign(
    Object.create(null),
    createProfile()
  );

  const results =
    readiness.evaluateAllProfileReadiness(
      profile,
      context
    );

  assert.equal(results.length, 3);

  assert.ok(
    results.every(
      result =>
        result.ready &&
        result.eligible &&
        result.completionPercent === 100
    )
  );
});

test('canonical readiness preserves frozen profile compatibility', () => {
  const profile = createProfile();

  Object.freeze(profile.roles);
  Object.freeze(profile.skills);
  Object.freeze(profile.investmentFocus);
  Object.freeze(profile.preferredStage);
  Object.freeze(profile.mentorSkills);
  Object.freeze(profile);

  const results =
    readiness.evaluateAllProfileReadiness(
      profile,
      context
    );

  assert.equal(results.length, 3);

  assert.ok(
    results.every(
      result =>
        result.ready &&
        result.eligible
    )
  );
});


// ==================================================
// PUBLIC FIELD COPIER SECURITY REGRESSION TESTS
// ==================================================

function assertProjectionGetterExcluded(
  field,
  returnedValue,
  role = 'founder'
) {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    field,
    returnedValue
  );

  const result = buildProfessionalProfile(
    profile,
    role,
    context
  );

  assert.equal(
    Object.hasOwn(result, field),
    false
  );

  assert.equal(calls(), 0);
}

function assertProjectionGetterBlocked(
  field,
  returnedValue,
  role = 'founder'
) {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    field,
    returnedValue
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      role,
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );

  assert.equal(calls(), 0);
}

// --------------------------------------------------
// Optional string getter protection: 5 tests
// --------------------------------------------------

test('projection excludes cover image getter', () => {
  assertProjectionGetterExcluded(
    'coverImageUrl',
    'https://example.com/cover.jpg'
  );
});

test('projection excludes linkedin URL getter', () => {
  assertProjectionGetterExcluded(
    'linkedinUrl',
    'https://linkedin.com/in/example'
  );
});

test('projection excludes website getter', () => {
  assertProjectionGetterExcluded(
    'website',
    'https://example.com'
  );
});

test('founder projection excludes optional stage getter', () => {
  assertProjectionGetterExcluded(
    'stage',
    'Seed'
  );
});

test('founder projection excludes optional equity getter', () => {
  assertProjectionGetterExcluded(
    'equityOffer',
    '10 percent'
  );
});

// --------------------------------------------------
// Optional array protection: 5 tests
// --------------------------------------------------

test('projection excludes achievements getter', () => {
  assertProjectionGetterExcluded(
    'achievements',
    ['Achievement']
  );
});

test('founder projection excludes cofounder skills getter', () => {
  assertProjectionGetterExcluded(
    'cofounderSkills',
    ['Engineering']
  );
});

test('projection excludes optional array with item getter', () => {
  const achievements = ['Achievement'];

  const calls = installCanonicalTestGetter(
    achievements,
    '0',
    'PRIVATE_GETTER_VALUE'
  );

  const profile = createProfile({
    achievements,
  });

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.equal(
    Object.hasOwn(result, 'achievements'),
    false
  );

  assert.equal(calls(), 0);
});

test('projection excludes optional array with inherited item', () => {
  const achievements = new Array(1);

  const prototype =
    Object.create(Array.prototype);

  prototype[0] = 'Inherited Achievement';

  Object.setPrototypeOf(
    achievements,
    prototype
  );

  const result = buildProfessionalProfile(
    createProfile({ achievements }),
    'founder',
    context
  );

  assert.equal(
    Object.hasOwn(result, 'achievements'),
    false
  );
});

test('projection ignores optional array custom iterator', () => {
  const achievements = [
    'Built a product',
  ];

  let calls = 0;

  Object.defineProperty(
    achievements,
    Symbol.iterator,
    {
      value() {
        calls++;

        throw new Error(
          'UNSAFE_ACHIEVEMENT_ITERATOR'
        );
      },
    }
  );

  const result = buildProfessionalProfile(
    createProfile({ achievements }),
    'founder',
    context
  );

  assert.deepEqual(
    result.achievements,
    ['Built a product']
  );

  assert.equal(calls, 0);
});

// --------------------------------------------------
// Boolean getter protection: 4 tests
// --------------------------------------------------

test('founder projection excludes cofounder boolean getter', () => {
  assertProjectionGetterExcluded(
    'lookingForCofounder',
    true,
    'founder'
  );
});

test('investor projection excludes pitch boolean getter', () => {
  assertProjectionGetterExcluded(
    'isOpenToPitches',
    true,
    'investor'
  );
});

test('projection prevents changing boolean getter from leaking object', () => {
  const profile = createProfile();

  let calls = 0;

  Object.defineProperty(
    profile,
    'lookingForCofounder',
    {
      configurable: true,
      enumerable: true,

      get() {
        calls++;

        if (calls === 1) {
          return true;
        }

        return {
          bankAccountNumber:
            'PRIVATE_BOOLEAN_GETTER',
        };
      },
    }
  );

  const result = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.equal(
    Object.hasOwn(
      result,
      'lookingForCofounder'
    ),
    false
  );

  assert.equal(calls, 0);

  assert.equal(
    JSON.stringify(result).includes(
      'PRIVATE_BOOLEAN_GETTER'
    ),
    false
  );
});

test('projection preserves own false boolean values', () => {
  const profile = createProfile({
    lookingForCofounder: false,
    isOpenToPitches: false,
  });

  const founder = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  const investor = buildProfessionalProfile(
    profile,
    'investor',
    context
  );

  assert.equal(
    founder.lookingForCofounder,
    false
  );

  assert.equal(
    investor.isOpenToPitches,
    false
  );
});

// --------------------------------------------------
// Required field publication rejection: 5 tests
// --------------------------------------------------

test('publication rejects required full name getter', () => {
  assertProjectionGetterBlocked(
    'fullName',
    'Valid Professional'
  );
});

test('publication rejects required profile photo getter', () => {
  assertProjectionGetterBlocked(
    'imageUrl',
    'https://example.com/photo.jpg'
  );
});

test('founder publication rejects required skills getter', () => {
  assertProjectionGetterBlocked(
    'skills',
    ['Engineering'],
    'founder'
  );
});

test('investor publication rejects required investor bio getter', () => {
  assertProjectionGetterBlocked(
    'investorBio',
    'Valid Investor Bio',
    'investor'
  );
});

test('mentor publication rejects required mentor skills getter', () => {
  assertProjectionGetterBlocked(
    'mentorSkills',
    ['Business Strategy'],
    'mentor'
  );
});

// --------------------------------------------------
// Identity publication protection: 4 tests
// --------------------------------------------------

test('publication rejects canonical uid getter', () => {
  assertProjectionGetterBlocked(
    'uid',
    'test-user'
  );
});

test('publication rejects canonical status getter', () => {
  assertProjectionGetterBlocked(
    'status',
    'active'
  );
});

test('publication rejects canonical roles getter', () => {
  assertProjectionGetterBlocked(
    'roles',
    ['founder']
  );
});

test('publication ignores forged role ownership method', () => {
  const roles = ['founder'];

  let calls = 0;

  Object.defineProperty(
    roles,
    'includes',
    {
      value() {
        calls++;
        return true;
      },
    }
  );

  const profile = createProfile({ roles });

  const founder = buildProfessionalProfile(
    profile,
    'founder',
    context
  );

  assert.equal(
    founder.role,
    'founder'
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'investor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );

  assert.throws(
    () => buildProfessionalProfile(
      profile,
      'mentor',
      context
    ),
    /PROFESSIONAL_PROFILE_NOT_READY/
  );

  assert.equal(calls, 0);
});

// --------------------------------------------------
// Valid profile compatibility: 2 tests
// --------------------------------------------------

test('investor projection safely falls back from headline getter', () => {
  const profile = createProfile({
    headline: 'Valid Shared Headline',
  });

  const calls = installCanonicalTestGetter(
    profile,
    'investorHeadline',
    'Getter Investor Headline'
  );

  const result = buildProfessionalProfile(
    profile,
    'investor',
    context
  );

  assert.equal(
    result.headline,
    'Valid Shared Headline'
  );

  assert.equal(
    Object.hasOwn(
      result,
      'investorHeadline'
    ),
    false
  );

  assert.equal(calls(), 0);
});

test('projection preserves null-prototype canonical profile compatibility', () => {
  const profile = Object.assign(
    Object.create(null),
    createProfile()
  );

  for (const role of [
    'founder',
    'investor',
    'mentor',
  ]) {
    const expected = buildProfessionalProfile(
      createProfile(),
      role,
      context
    );

    const actual = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assert.deepEqual(
      actual,
      expected
    );
  }
});


// ==================================================
// NESTED PROJECTION SECURITY REGRESSION TESTS
// ==================================================

function buildNestedTestProjection(
  overrides,
  role = 'founder'
) {
  return buildProfessionalProfile(
    createProfile(overrides),
    role,
    context
  );
}

function assertNestedFieldAbsent(
  result,
  field
) {
  assert.equal(
    Object.hasOwn(result, field),
    false
  );
}

// --------------------------------------------------
// Nested container protection: 6 tests
// --------------------------------------------------

test('nested projection excludes social links container getter', () => {
  assertProjectionGetterExcluded(
    'socialLinks',
    {
      linkedin:
        'https://linkedin.com/in/example',
    }
  );
});

test('nested projection excludes experience container getter', () => {
  assertProjectionGetterExcluded(
    'experience',
    [{ company: 'Example Company' }]
  );
});

test('nested projection excludes availability container getter', () => {
  assertProjectionGetterExcluded(
    'availability',
    { openToInvestment: true }
  );
});

test('nested projection rejects custom prototype social links', () => {
  const socialLinks = Object.create({
    linkedin:
      'https://linkedin.com/in/example',
  });

  socialLinks.website =
    'https://example.com';

  const result = buildNestedTestProjection({
    socialLinks,
  });

  assertNestedFieldAbsent(
    result,
    'socialLinks'
  );
});

test('nested projection rejects non-array experience container', () => {
  const result = buildNestedTestProjection({
    experience: {
      company: 'Example Company',
    },
  });

  assertNestedFieldAbsent(
    result,
    'experience'
  );
});

test('nested projection rejects class instance availability', () => {
  class Availability {
    constructor() {
      this.openToInvestment = true;
    }
  }

  const result = buildNestedTestProjection({
    availability: new Availability(),
  });

  assertNestedFieldAbsent(
    result,
    'availability'
  );
});

// --------------------------------------------------
// Social links protection: 5 tests
// --------------------------------------------------

test('nested social links exclude linkedin getter', () => {
  const socialLinks = {
    website: 'https://example.com/',
  };

  const calls = installCanonicalTestGetter(
    socialLinks,
    'linkedin',
    'https://linkedin.com/in/private'
  );

  const result = buildNestedTestProjection({
    socialLinks,
  });

  assert.deepEqual(
    result.socialLinks,
    {
      website: 'https://example.com/',
    }
  );

  assert.equal(calls(), 0);
});

test('nested social links exclude website getter', () => {
  const socialLinks = {
    linkedin:
      'https://linkedin.com/in/example',
  };

  const calls = installCanonicalTestGetter(
    socialLinks,
    'website',
    'https://example.com/private'
  );

  const result = buildNestedTestProjection({
    socialLinks,
  });

  assertNestedFieldAbsent(
    result.socialLinks,
    'website'
  );

  assert.equal(calls(), 0);
});

test('nested social links omit getter-only container', () => {
  const socialLinks = {};

  const calls = installCanonicalTestGetter(
    socialLinks,
    'twitter',
    'https://x.com/example'
  );

  const result = buildNestedTestProjection({
    socialLinks,
  });

  assertNestedFieldAbsent(
    result,
    'socialLinks'
  );

  assert.equal(calls(), 0);
});

test('nested social links never read unknown private getter', () => {
  const socialLinks = {
    website: 'https://example.com/',
  };

  const calls = installCanonicalTestGetter(
    socialLinks,
    'privateToken',
    'PRIVATE_SOCIAL_TOKEN'
  );

  const result = buildNestedTestProjection({
    socialLinks,
  });

  assertNestedFieldAbsent(
    result.socialLinks,
    'privateToken'
  );

  assert.equal(calls(), 0);

  assert.equal(
    JSON.stringify(result).includes(
      'PRIVATE_SOCIAL_TOKEN'
    ),
    false
  );
});

test('nested social links preserve frozen null-prototype records', () => {
  const socialLinks = Object.freeze(
    Object.assign(
      Object.create(null),
      {
        website: 'https://example.com/',
        twitter: 'https://x.com/example',
      }
    )
  );

  const result = buildNestedTestProjection({
    socialLinks,
  });

  assert.deepEqual(
    result.socialLinks,
    {
      website: 'https://example.com/',
      twitter: 'https://x.com/example',
    }
  );
});

// --------------------------------------------------
// Experience array protection: 8 tests
// --------------------------------------------------

test('nested experience excludes accessor array item', () => {
  const experience = [
    { company: 'Example Company' },
  ];

  const calls = installCanonicalTestGetter(
    experience,
    '0',
    { company: 'Getter Company' }
  );

  const result = buildNestedTestProjection({
    experience,
  });

  assertNestedFieldAbsent(
    result,
    'experience'
  );

  assert.equal(calls(), 0);
});

test('nested experience rejects sparse array', () => {
  const experience = new Array(1);

  const result = buildNestedTestProjection({
    experience,
  });

  assertNestedFieldAbsent(
    result,
    'experience'
  );
});

test('nested experience rejects partially sparse array', () => {
  const experience = [
    { company: 'Valid Company' },
  ];

  experience.length = 2;

  const result = buildNestedTestProjection({
    experience,
  });

  assertNestedFieldAbsent(
    result,
    'experience'
  );
});

test('nested experience rejects inherited array item', () => {
  const experience = new Array(1);

  const prototype =
    Object.create(Array.prototype);

  prototype[0] = {
    company: 'Inherited Company',
  };

  Object.setPrototypeOf(
    experience,
    prototype
  );

  const result = buildNestedTestProjection({
    experience,
  });

  assertNestedFieldAbsent(
    result,
    'experience'
  );
});

test('nested experience ignores custom source iterator', () => {
  const experience = [
    { company: 'Valid Company' },
  ];

  let calls = 0;

  Object.defineProperty(
    experience,
    Symbol.iterator,
    {
      value() {
        calls++;
        throw new Error(
          'UNSAFE_EXPERIENCE_ITERATOR'
        );
      },
    }
  );

  const result = buildNestedTestProjection({
    experience,
  });

  assert.deepEqual(
    result.experience,
    [{ company: 'Valid Company' }]
  );

  assert.equal(calls, 0);
});

test('nested experience ignores iterator property getter', () => {
  const experience = [
    { company: 'Valid Company' },
  ];

  const calls = installCanonicalTestGetter(
    experience,
    Symbol.iterator,
    function* () {
      yield {
        company: 'Forged Company',
      };
    }
  );

  const result = buildNestedTestProjection({
    experience,
  });

  assert.deepEqual(
    result.experience,
    [{ company: 'Valid Company' }]
  );

  assert.equal(calls(), 0);
});

test('nested experience rejects entire array with invalid entry', () => {
  const experience = [
    { company: 'Valid Company' },
    null,
  ];

  const result = buildNestedTestProjection({
    experience,
  });

  assertNestedFieldAbsent(
    result,
    'experience'
  );
});

test('nested experience preserves fifty-entry limit', () => {
  const experience = Array.from(
    { length: 50 },
    (_, index) => ({
      company: 'Company ' + index,
    })
  );

  const accepted = buildNestedTestProjection({
    experience,
  });

  assert.equal(
    accepted.experience.length,
    50
  );

  const rejected = buildNestedTestProjection({
    experience: [
      ...experience,
      { company: 'Company 51' },
    ],
  });

  assertNestedFieldAbsent(
    rejected,
    'experience'
  );
});

// --------------------------------------------------
// Experience field protection: 6 tests
// --------------------------------------------------

test('nested experience excludes company getter', () => {
  const entry = {
    role: 'Engineer',
  };

  const calls = installCanonicalTestGetter(
    entry,
    'company',
    'Private Company'
  );

  const result = buildNestedTestProjection({
    experience: [entry],
  });

  assert.deepEqual(
    result.experience,
    [{ role: 'Engineer' }]
  );

  assert.equal(calls(), 0);
});

test('nested experience excludes description getter', () => {
  const entry = {
    company: 'Example Company',
  };

  const calls = installCanonicalTestGetter(
    entry,
    'description',
    'PRIVATE_EXPERIENCE_DESCRIPTION'
  );

  const result = buildNestedTestProjection({
    experience: [entry],
  });

  assert.deepEqual(
    result.experience,
    [{ company: 'Example Company' }]
  );

  assert.equal(calls(), 0);

  assert.equal(
    JSON.stringify(result).includes(
      'PRIVATE_EXPERIENCE_DESCRIPTION'
    ),
    false
  );
});

test('nested experience excludes role and duration getters', () => {
  const entry = {
    company: 'Example Company',
  };

  const roleCalls =
    installCanonicalTestGetter(
      entry,
      'role',
      'Private Role'
    );

  const durationCalls =
    installCanonicalTestGetter(
      entry,
      'duration',
      '2020 - 2025'
    );

  const result = buildNestedTestProjection({
    experience: [entry],
  });

  assert.deepEqual(
    result.experience,
    [{ company: 'Example Company' }]
  );

  assert.equal(roleCalls(), 0);
  assert.equal(durationCalls(), 0);
});

test('nested experience drops getter-only entry', () => {
  const entry = {};

  const calls = installCanonicalTestGetter(
    entry,
    'company',
    'Getter Company'
  );

  const result = buildNestedTestProjection({
    experience: [
      entry,
      { company: 'Valid Company' },
    ],
  });

  assert.deepEqual(
    result.experience,
    [{ company: 'Valid Company' }]
  );

  assert.equal(calls(), 0);
});

test('nested experience never reads unknown private getter', () => {
  const entry = {
    company: 'Example Company',
  };

  const calls = installCanonicalTestGetter(
    entry,
    'salaryDocument',
    'PRIVATE_SALARY_DOCUMENT'
  );

  const result = buildNestedTestProjection({
    experience: [entry],
  });

  assert.deepEqual(
    result.experience,
    [{ company: 'Example Company' }]
  );

  assert.equal(calls(), 0);

  assert.equal(
    JSON.stringify(result).includes(
      'PRIVATE_SALARY_DOCUMENT'
    ),
    false
  );
});

test('nested experience preserves frozen null-prototype entries', () => {
  const entry = Object.freeze(
    Object.assign(
      Object.create(null),
      {
        company: 'Example Company',
        role: 'Engineer',
      }
    )
  );

  const experience = Object.freeze([
    entry,
  ]);

  const result = buildNestedTestProjection({
    experience,
  });

  assert.deepEqual(
    result.experience,
    [{
      company: 'Example Company',
      role: 'Engineer',
    }]
  );

  assert.notEqual(
    result.experience,
    experience
  );

  assert.notEqual(
    result.experience[0],
    entry
  );
});

// --------------------------------------------------
// Founder availability protection: 5 tests
// --------------------------------------------------

test('nested availability excludes boolean getter and preserves false', () => {
  const availability = {
    hiring: false,
  };

  const calls = installCanonicalTestGetter(
    availability,
    'openToInvestment',
    true
  );

  const result = buildNestedTestProjection({
    availability,
  });

  assert.deepEqual(
    result.availability,
    { hiring: false }
  );

  assert.equal(calls(), 0);
});

test('nested availability prevents changing getter object leakage', () => {
  const availability = {
    hiring: true,
  };

  let calls = 0;

  Object.defineProperty(
    availability,
    'coFounder',
    {
      enumerable: true,

      get() {
        calls++;

        if (calls === 1) {
          return true;
        }

        return {
          privateDocument:
            'PRIVATE_AVAILABILITY_DOCUMENT',
        };
      },
    }
  );

  const result = buildNestedTestProjection({
    availability,
  });

  assert.deepEqual(
    result.availability,
    { hiring: true }
  );

  assert.equal(calls, 0);

  assert.equal(
    JSON.stringify(result).includes(
      'PRIVATE_AVAILABILITY_DOCUMENT'
    ),
    false
  );
});

test('nested availability excludes getter-only container', () => {
  const availability = {};

  const calls = installCanonicalTestGetter(
    availability,
    'hiring',
    true
  );

  const result = buildNestedTestProjection({
    availability,
  });

  assertNestedFieldAbsent(
    result,
    'availability'
  );

  assert.equal(calls(), 0);
});

test('nested availability preserves frozen null-prototype booleans', () => {
  const availability = Object.freeze(
    Object.assign(
      Object.create(null),
      {
        openToInvestment: true,
        hiring: false,
        coFounder: false,
      }
    )
  );

  const result = buildNestedTestProjection({
    availability,
  });

  assert.deepEqual(
    result.availability,
    {
      openToInvestment: true,
      hiring: false,
      coFounder: false,
    }
  );
});

test('nested availability is never read for investor or mentor', () => {
  const profile = createProfile();

  const calls = installCanonicalTestGetter(
    profile,
    'availability',
    { openToInvestment: true }
  );

  for (const role of [
    'investor',
    'mentor',
  ]) {
    const result = buildProfessionalProfile(
      profile,
      role,
      context
    );

    assertNestedFieldAbsent(
      result,
      'availability'
    );
  }

  assert.equal(calls(), 0);
});

async function runProfessionalProfileTests() {
  let passed = 0;
  let failed = 0;

  console.log(
    '===== PROFESSIONAL PROFILE SECURITY TESTS ====='
  );

  console.log(
    'TOTAL TESTS:',
    tests.length
  );

  for (const entry of tests) {
    try {
      await entry.fn();

      passed++;

      console.log(
        'PASS:',
        entry.name
      );
    } catch (error) {
      failed++;

      console.error(
        'FAIL:',
        entry.name
      );

      console.error(error);
    }
  }

  console.log(
    '\n===== TEST SUMMARY ====='
  );

  console.log('TOTAL:', tests.length);
  console.log('PASSED:', passed);
  console.log('FAILED:', failed);

  if (
    failed > 0 ||
    tests.length === 0
  ) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runProfessionalProfileTests().catch(
    error => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
