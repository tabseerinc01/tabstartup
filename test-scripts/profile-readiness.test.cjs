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

  new Function('require', 'module', 'exports', compiled)(
    name => {
      if (Object.hasOwn(dependencies, name)) {
        return dependencies[name];
      }

      throw new Error('Unexpected dependency: ' + name);
    },
    mod,
    mod.exports
  );

  return mod.exports;
}

const legacyProfile = loadTS(
  'src/lib/legacy-startup-profile.ts'
);

const {
  evaluateProfileReadiness,
  evaluateAllProfileReadiness,
  isProfessionalProfileRole,
  PROFILE_READINESS_VERSION,
} = loadTS(
  'src/lib/profile-readiness.ts',
  {
    '@/lib/legacy-startup-profile': legacyProfile,
  }
);

const context = {
  uid: 'test-user',
  emailVerified: true,
  accountActive: true,
};

const shared = {
  uid: 'test-user',
  status: 'active',
  fullName: 'Test Professional',
  imageUrl: 'https://example.com/photo.jpg',
  headline: 'Technology Professional',
  location: 'Dhaka, Bangladesh',
};

const founder = {
  ...shared,
  role: 'founder',
  roles: ['founder'],
  bio: 'Building innovative technology products.',
  skills: ['Leadership', 'Product Development'],
};

const investor = {
  ...shared,
  role: 'investor',
  roles: ['investor'],
  investorHeadline: 'Early Stage Investor',
  investorBio: 'Investing in innovative startups.',
  investmentFocus: ['Fintech', 'SaaS'],
  preferredStage: ['Seed'],
  ticketSize: '$10,000 - $50,000',
};

const mentor = {
  ...shared,
  role: 'mentor',
  roles: ['mentor'],
  mentorBio: 'Helping founders build businesses.',
  mentorSkills: ['Strategy', 'Fundraising'],
  yearsOfExperience: '10',
  mentorAvailability: 'Available',
};

const tests = [];

function test(name, run) {
  tests.push([name, run]);
}

function evaluate(profile, role, overrides = {}) {
  return evaluateProfileReadiness(
    profile,
    role,
    { ...context, ...overrides }
  );
}

function expectMissing(profile, role, field) {
  const result = evaluate(profile, role);

  assert.equal(result.ready, false);
  assert.ok(
    result.missingFields.includes(field),
    'Expected missing field: ' + field
  );
}

// Founder readiness: 5

test('Complete founder is ready', () => {
  const result = evaluate(founder, 'founder');

  assert.equal(result.ready, true);
  assert.equal(result.eligible, true);
  assert.equal(result.completionPercent, 100);
  assert.equal(result.requiredCount, 7);
  assert.equal(result.completedCount, 7);
  assert.equal(result.version, PROFILE_READINESS_VERSION);
  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.blockers, []);
});

test('Founder without startup is ready', () => {
  assert.equal(
    evaluate(founder, 'founder').ready,
    true
  );
});

test('Founder bio is required', () => {
  expectMissing(
    { ...founder, bio: '' },
    'founder',
    'bio'
  );
});

test('Founder skills are required', () => {
  expectMissing(
    { ...founder, skills: [] },
    'founder',
    'skills'
  );
});

test('Founder cannot substitute investor bio', () => {
  expectMissing(
    {
      ...founder,
      bio: '',
      investorBio: 'Investor biography',
    },
    'founder',
    'bio'
  );
});

// Investor readiness: 5

test('Complete investor is ready', () => {
  const result = evaluate(investor, 'investor');

  assert.equal(result.ready, true);
  assert.equal(result.requiredCount, 9);
  assert.equal(result.completionPercent, 100);
});

test('Investor bio is required', () => {
  expectMissing(
    { ...investor, investorBio: '' },
    'investor',
    'investorBio'
  );
});

test('Investment focus is required', () => {
  expectMissing(
    { ...investor, investmentFocus: [] },
    'investor',
    'investmentFocus'
  );
});

test('Preferred stage is required', () => {
  expectMissing(
    { ...investor, preferredStage: [] },
    'investor',
    'preferredStage'
  );
});

test('Ticket size is required', () => {
  expectMissing(
    { ...investor, ticketSize: '' },
    'investor',
    'ticketSize'
  );
});

// Mentor readiness: 5

test('Complete mentor is ready', () => {
  const result = evaluate(mentor, 'mentor');

  assert.equal(result.ready, true);
  assert.equal(result.requiredCount, 9);
  assert.equal(result.completionPercent, 100);
});

test('Mentor bio is required', () => {
  expectMissing(
    { ...mentor, mentorBio: '' },
    'mentor',
    'mentorBio'
  );
});

test('Mentor skills are required', () => {
  expectMissing(
    { ...mentor, mentorSkills: [] },
    'mentor',
    'mentorSkills'
  );
});

test('Years of experience is required', () => {
  expectMissing(
    { ...mentor, yearsOfExperience: '' },
    'mentor',
    'yearsOfExperience'
  );
});

test('Mentor availability is required', () => {
  expectMissing(
    { ...mentor, mentorAvailability: '' },
    'mentor',
    'mentorAvailability'
  );
});

// Shared field validation: 10

test('Whitespace-only name rejected', () => {
  expectMissing(
    { ...founder, fullName: '   ' },
    'founder',
    'fullName'
  );
});

test('Name exceeding 120 characters rejected', () => {
  expectMissing(
    { ...founder, fullName: 'A'.repeat(121) },
    'founder',
    'fullName'
  );
});

test('Profile photo is required', () => {
  expectMissing(
    { ...founder, imageUrl: '' },
    'founder',
    'imageUrl'
  );
});

test('Malformed photo URL rejected', () => {
  expectMissing(
    { ...founder, imageUrl: 'invalid-url' },
    'founder',
    'imageUrl'
  );
});

test('Non-HTTPS photo URL rejected', () => {
  expectMissing(
    {
      ...founder,
      imageUrl: 'http://example.com/photo.jpg',
    },
    'founder',
    'imageUrl'
  );
});

test('Photo URL with credentials rejected', () => {
  expectMissing(
    {
      ...founder,
      imageUrl: 'https://user:pass@example.com/photo.jpg',
    },
    'founder',
    'imageUrl'
  );
});

test('Whitespace-only location rejected', () => {
  expectMissing(
    { ...founder, location: '   ' },
    'founder',
    'location'
  );
});

test('Professional headline is required', () => {
  expectMissing(
    { ...founder, headline: '' },
    'founder',
    'headline'
  );
});

test('Invalid array items rejected', () => {
  for (const skills of [
    [''],
    ['   '],
    ['Valid', 123],
    ['A'.repeat(1001)],
    Array(101).fill('Skill'),
  ]) {
    expectMissing(
      { ...founder, skills },
      'founder',
      'skills'
    );
  }
});

test('Optional professional links are not required', () => {
  assert.equal(
    evaluate({
      ...founder,
      website: '',
      linkedinUrl: '',
      coverImageUrl: '',
      referralCount: 0,
      isVerified: false,
    }, 'founder').ready,
    true
  );
});

// Account and role security: 9

test('Unverified email blocks publishing', () => {
  const result = evaluate(
    founder,
    'founder',
    { emailVerified: false }
  );

  assert.equal(result.ready, false);
  assert.ok(
    result.missingFields.includes('emailVerified')
  );
});

test('Private profile email flag cannot bypass verification', () => {
  const result = evaluate(
    { ...founder, emailVerified: true },
    'founder',
    { emailVerified: false }
  );

  assert.equal(result.ready, false);
});

test('Suspended global account is blocked', () => {
  const result = evaluate(
    founder,
    'founder',
    { accountActive: false }
  );

  assert.equal(result.ready, false);
  assert.equal(result.completionPercent, 100);
  assert.ok(
    result.blockers.includes('ACCOUNT_NOT_ACTIVE')
  );
});

test('Suspended legacy profile is blocked', () => {
  const result = evaluate(
    { ...founder, status: 'suspended' },
    'founder'
  );

  assert.equal(result.ready, false);
  assert.equal(result.eligible, false);
});

test('Unowned professional role is blocked', () => {
  const result = evaluate(
    { ...investor, roles: ['founder'] },
    'investor'
  );

  assert.equal(result.ready, false);
  assert.ok(
    result.blockers.includes('ROLE_NOT_OWNED')
  );
});

test('Missing private profile is blocked', () => {
  const result = evaluate(undefined, 'founder');

  assert.equal(result.ready, false);
  assert.equal(result.eligible, false);
});

test('Mismatched UID is blocked', () => {
  const result = evaluate(
    { ...founder, uid: 'another-user' },
    'founder'
  );

  assert.equal(result.ready, false);
  assert.equal(result.eligible, false);
});

test('Invalid account status is blocked', () => {
  const result = evaluate(
    { ...founder, status: 'unknown' },
    'founder'
  );

  assert.equal(result.ready, false);
});

test('Non-professional role is rejected', () => {
  for (const role of [
    'admin',
    'eventOrganizer',
    'unknown',
    '',
    null,
  ]) {
    assert.equal(
      isProfessionalProfileRole(role),
      false
    );

    assert.throws(
      () => evaluate(founder, role),
      /INVALID_PROFESSIONAL_ROLE/
    );
  }
});

// Multiple roles and legacy compatibility: 5

test('Multiple roles evaluated independently', () => {
  const results = evaluateAllProfileReadiness(
    {
      ...founder,
      roles: ['founder', 'investor', 'mentor'],
    },
    context
  );

  assert.equal(results.length, 3);

  const byRole = Object.fromEntries(
    results.map(result => [result.role, result])
  );

  assert.equal(byRole.founder.ready, true);
  assert.equal(byRole.investor.ready, false);
  assert.equal(byRole.mentor.ready, false);
});

test('Complete multi-role profile is ready for each role', () => {
  const results = evaluateAllProfileReadiness(
    {
      ...founder,
      ...investor,
      ...mentor,
      roles: ['founder', 'investor', 'mentor'],
    },
    context
  );

  assert.equal(results.length, 3);
  assert.ok(results.every(result => result.ready));
});

test('Legacy single role remains supported', () => {
  const profile = { ...founder };

  delete profile.roles;
  delete profile.uid;
  delete profile.status;

  assert.equal(
    evaluate(profile, 'founder').ready,
    true
  );
});

test('Malformed roles do not fall back to legacy role', () => {
  const result = evaluate(
    { ...founder, roles: 'founder' },
    'founder'
  );

  assert.equal(result.ready, false);
  assert.ok(
    result.blockers.includes('ROLE_NOT_OWNED')
  );
});

test('Investor supports shared headline fallback', () => {
  assert.equal(
    evaluate(
      { ...investor, investorHeadline: '' },
      'investor'
    ).ready,
    true
  );
});

for (const [name, run] of tests) {
  run();
  console.log('PASS:', name);
}

console.log(
  `\nSUCCESS: ${tests.length}/${tests.length} tests passed`
);
