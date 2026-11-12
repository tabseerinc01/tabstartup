const fs = require('node:fs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

async function main() {
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  const env = await initializeTestEnvironment({
    projectId: 'tabstartup-rules-local-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules
    }
  });

  try {
    console.log('SUCCESS: Firestore Rules loaded into emulator.');
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exitCode = 1;
});
