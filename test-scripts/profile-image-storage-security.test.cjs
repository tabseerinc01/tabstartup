const fs = require('node:fs');
const assert = require('node:assert/strict');

if (
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !==
    '127.0.0.1:9199' ||
  process.env.VERCEL === '1'
) {
  throw new Error(
    'STOP: Local Storage emulator required.'
  );
}

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const {
  ref,
  uploadBytes,
  getBytes,
  listAll,
  deleteObject,
  updateMetadata,
} = require('firebase/storage');

const PROJECT_ID = 'demo-tabstartup';

const OWNER = 'profile-image-owner';
const OTHER = 'profile-image-other';

const MAX_BYTES = 5 * 1024 * 1024;

const bytes = new Uint8Array([1, 2, 3, 4]);

const metadata = {
  contentType: 'image/jpeg',
};

async function main() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: fs.readFileSync(
        'storage.rules',
        'utf8'
      ),
    },
  });

  let passed = 0;

  async function check(name, fn) {
    await fn();
    passed++;
    console.log('PASS:', name);
  }

  try {
    await env.clearStorage();

    const owner =
      env.authenticatedContext(OWNER).storage();

    const other =
      env.authenticatedContext(OTHER).storage();

    const guest =
      env.unauthenticatedContext().storage();

    const base = 'profile-images/' + OWNER + '/';

    const path = base + '1760000000001.jpg';

    await check('owner can create JPEG', async () => {
      await assertSucceeds(
        uploadBytes(
          ref(owner, path),
          bytes,
          metadata
        )
      );
    });

    await check('owner can create PNG', async () => {
      await assertSucceeds(
        uploadBytes(
          ref(owner, base + '1760000000002.png'),
          bytes,
          { contentType: 'image/png' }
        )
      );
    });

    await check('owner can create WebP', async () => {
      await assertSucceeds(
        uploadBytes(
          ref(owner, base + '1760000000003.webp'),
          bytes,
          { contentType: 'image/webp' }
        )
      );
    });

    await check('guest cannot upload', async () => {
      await assertFails(
        uploadBytes(
          ref(guest, base + '1760000000004.jpg'),
          bytes,
          metadata
        )
      );
    });

    await check('other user cannot upload', async () => {
      await assertFails(
        uploadBytes(
          ref(other, base + '1760000000005.jpg'),
          bytes,
          metadata
        )
      );
    });

    await check('empty file denied', async () => {
      await assertFails(
        uploadBytes(
          ref(owner, base + '1760000000006.jpg'),
          new Uint8Array(0),
          metadata
        )
      );
    });

    await check('oversized file denied', async () => {
      await assertFails(
        uploadBytes(
          ref(owner, base + '1760000000007.jpg'),
          new Uint8Array(MAX_BYTES + 1),
          metadata
        )
      );
    });

    await check('invalid filename denied', async () => {
      await assertFails(
        uploadBytes(
          ref(owner, base + 'photo.jpg'),
          bytes,
          metadata
        )
      );
    });

    await check('nested upload denied', async () => {
      await assertFails(
        uploadBytes(
          ref(
            owner,
            base + 'nested/1760000000008.jpg'
          ),
          bytes,
          metadata
        )
      );
    });

    await check('MIME mismatch denied', async () => {
      await assertFails(
        uploadBytes(
          ref(owner, base + '1760000000009.jpg'),
          bytes,
          { contentType: 'image/png' }
        )
      );
    });

    await check('SVG upload denied', async () => {
      await assertFails(
        uploadBytes(
          ref(owner, base + '1760000000010.svg'),
          bytes,
          { contentType: 'image/svg+xml' }
        )
      );
    });

    await check('owner overwrite denied', async () => {
      await assertFails(
        uploadBytes(
          ref(owner, path),
          bytes,
          metadata
        )
      );
    });

    await check('metadata update denied', async () => {
      await assertFails(
        updateMetadata(
          ref(owner, path),
          { contentType: 'image/png' }
        )
      );
    });

    await check('owner delete denied', async () => {
      await assertFails(
        deleteObject(ref(owner, path))
      );
    });

    await check('individual public read allowed', async () => {
      await assertSucceeds(
        getBytes(ref(guest, path))
      );
    });

    await check('owner listing denied', async () => {
      await assertFails(
        listAll(ref(owner, base))
      );
    });

    await check('guest listing denied', async () => {
      await assertFails(
        listAll(ref(guest, base))
      );
    });

    await check('private event upload denied', async () => {
      await assertFails(
        uploadBytes(
          ref(
            owner,
            'event-assets/private/test/banner.jpg'
          ),
          bytes,
          metadata
        )
      );
    });

    await check('public event upload denied', async () => {
      await assertFails(
        uploadBytes(
          ref(
            owner,
            'event-assets/public/test/banners/banner.jpg'
          ),
          bytes,
          metadata
        )
      );
    });

    await check('unknown storage path denied', async () => {
      await assertFails(
        uploadBytes(
          ref(owner, 'unknown/photo.jpg'),
          bytes,
          metadata
        )
      );
    });

    assert.equal(passed, 20);

    console.log('TOTAL PASSED:', passed);
  } finally {
    try {
      await env.clearStorage();
    } finally {
      await env.cleanup();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
