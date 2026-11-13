const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadTS(file, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
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

const publicProfile = loadTS('src/lib/public-profile.ts');

const { validateProfileUpdate } = loadTS(
  'src/lib/profile-update-validation.ts',
  { '@/lib/public-profile': publicProfile }
);

const tests = [
  ['Valid full name', () => {
    assert.equal(
      validateProfileUpdate({ fullName: 'Test Founder' }).fullName,
      'Test Founder'
    );
  }],
  ['Empty full name rejected', () => {
    assert.throws(
      () => validateProfileUpdate({ fullName: '' }),
      /INVALID_PROFILE_UPDATE/
    );
  }],
  ['Whitespace name rejected', () => {
    assert.throws(
      () => validateProfileUpdate({ fullName: '   ' }),
      /INVALID_PROFILE_UPDATE/
    );
  }],
  ['Long name rejected', () => {
    assert.throws(
      () => validateProfileUpdate({ fullName: 'A'.repeat(121) }),
      /INVALID_PROFILE_UPDATE/
    );
  }],
  ['Name trimmed correctly', () => {
    assert.equal(
      validateProfileUpdate({ fullName: '  Test Founder  ' }).fullName,
      'Test Founder'
    );
  }],
  ['Photo-only update accepted', () => {
    const result = validateProfileUpdate({
      imageUrl: 'https://example.com/photo.jpg'
    });
    assert.equal(result.imageUrl, 'https://example.com/photo.jpg');
    assert.equal(Object.hasOwn(result, 'fullName'), false);
  }],
  ['Optional bio can be cleared', () => {
    assert.equal(validateProfileUpdate({ bio: '' }).bio, '');
  }],
  ['Private role update rejected', () => {
    assert.throws(
      () => validateProfileUpdate({ role: 'admin' }),
      /INVALID_PROFILE_UPDATE/
    );
  }],
  ['Public profile preserves name', () => {
    const result = publicProfile.buildPublicProfile('test-user', {
      fullName: 'Test Founder',
      role: 'founder',
      email: 'private@example.com'
    });
    assert.equal(result.fullName, 'Test Founder');
    assert.equal(Object.hasOwn(result, 'email'), false);
  }]
];

for (const [name, test] of tests) {
  test();
  console.log('PASS:', name);
}

console.log(`\nSUCCESS: ${tests.length}/${tests.length} tests passed`);
