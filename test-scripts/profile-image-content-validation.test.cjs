const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const sharp = require('sharp');
const { test } = require('node:test');

const MAX_BYTES = 5 * 1024 * 1024;

const source = fs.readFileSync(
  'src/services/profile-image-content-validation.service.ts',
  'utf8'
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
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
    if (name === 'server-only') return {};
    if (name === 'sharp') return sharp;

    if (name === '@/lib/profile-image-validation') {
      return {
        PROFILE_IMAGE_MAX_BYTES: MAX_BYTES,
      };
    }

    throw new Error('Unexpected dependency: ' + name);
  },
  mod,
  mod.exports
);

const {
  validateProfileImageContent: validate,
} = mod.exports;

async function makeImage(
  format,
  width = 64,
  height = 64
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#336699',
    },
  })
    .toFormat(format)
    .toBuffer();
}

for (const format of ['jpeg', 'png', 'webp']) {
  test('accepts valid ' + format, async () => {
    const bytes = await makeImage(format);

    assert.equal(
      await validate(bytes, format),
      true
    );
  });
}

test('rejects empty image', async () => {
  assert.equal(
    await validate(Buffer.alloc(0), 'png'),
    false
  );
});

test('rejects non-buffer input', async () => {
  assert.equal(
    await validate('not an image', 'png'),
    false
  );
});

test('rejects oversized file', async () => {
  assert.equal(
    await validate(
      Buffer.alloc(MAX_BYTES + 1),
      'jpeg'
    ),
    false
  );
});

test('rejects fake image content', async () => {
  assert.equal(
    await validate(
      Buffer.from('<html>fake image</html>'),
      'jpeg'
    ),
    false
  );
});

test('rejects SVG content', async () => {
  const bytes = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="10" height="10"></svg>'
  );

  assert.equal(
    await validate(bytes, 'png'),
    false
  );
});

test('rejects format mismatch', async () => {
  const bytes = await makeImage('png');

  assert.equal(
    await validate(bytes, 'jpeg'),
    false
  );
});

test('rejects truncated JPEG', async () => {
  const bytes = await makeImage('jpeg');

  assert.equal(
    await validate(
      bytes.subarray(0, 32),
      'jpeg'
    ),
    false
  );
});

test('rejects truncated PNG', async () => {
  const bytes = await makeImage('png');

  assert.equal(
    await validate(
      bytes.subarray(0, 32),
      'png'
    ),
    false
  );
});

test('rejects excessive width', async () => {
  const bytes = await makeImage('png', 8193, 1);

  assert.equal(
    await validate(bytes, 'png'),
    false
  );
});

test('rejects excessive height', async () => {
  const bytes = await makeImage('png', 1, 8193);

  assert.equal(
    await validate(bytes, 'png'),
    false
  );
});

test('rejects excessive pixel count', async () => {
  const bytes = await makeImage('png', 4001, 4000);

  assert.equal(
    await validate(bytes, 'png'),
    false
  );
});
