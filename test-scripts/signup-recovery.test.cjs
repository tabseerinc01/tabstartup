const fs = require('fs');
const assert = require('node:assert/strict');

const frontend = fs.readFileSync(
  'src/app/signup/page.tsx', 'utf8'
);

const api = fs.readFileSync(
  'src/app/api/auth/signup/route.ts', 'utf8'
);

const service = fs.readFileSync(
  'src/services/signup.service.ts', 'utf8'
);

let passed = 0;

function pass(name) {
  passed++;
  console.log('PASS: ' + name);
}

assert.match(frontend, /fetch\(['"]\/api\/auth\/signup['"]/);
pass('Trusted Signup API integration present');

assert.doesNotMatch(frontend, /createUserWithEmailAndPassword/);
pass('Client-side account creation removed');

assert.doesNotMatch(frontend, /\b(setDoc|runTransaction)\s*\(/);
pass('Client-side profile creation removed');

assert.match(api, /adminAuth\.createUser\s*\(/);
pass('Server-side account creation present');

assert.match(api, /auth\/email-already-exists/);
assert.match(api, /ACCOUNT_ALREADY_EXISTS/);
pass('Existing account conflict handling present');

assert.match(api, /RECOVERY_VERIFICATION_REQUIRED/);
pass('Incomplete signup recovery response present');

assert.doesNotMatch(api, /adminAuth\.(deleteUser|updateUser)\s*\(/);
pass('No automatic account deletion or overwrite');

assert.match(service, /PROFILE_ALREADY_EXISTS/);
pass('Existing profile conflict guard present');

assert.match(service, /\.runTransaction\s*\(/);
assert.match(service, /\.create\s*\(/);
pass('Transactional profile creation present');

assert.match(frontend, /SIGNUP_IDENTITY_MISMATCH/);
pass('Signup identity mismatch handling present');

assert.match(
  frontend,
  /if\s*\(!savedProfile\.exists\(\)\)/
);
assert.match(frontend, /RECOVERY_VERIFICATION_REQUIRED/);
pass('Incomplete profile recovery guard present');

console.log('\nTOTAL PASSED:', passed);
