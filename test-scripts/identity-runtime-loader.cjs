const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

if (
  process.env.FIRESTORE_EMULATOR_HOST !==
    '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !==
    '127.0.0.1:9099' ||
  process.env.VERCEL === '1'
) {
  throw new Error(
    'STOP: Isolated local emulators are required.'
  );
}

const root = path.resolve(__dirname, '..');
const srcRoot = path.join(root, 'src');

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

Module._resolveFilename = function (
  request,
  parent,
  isMain,
  options
) {
  if (request.startsWith('@/')) {
    request = path.join(
      srcRoot,
      request.slice(2)
    );
  }

  return originalResolve.call(
    this,
    request,
    parent,
    isMain,
    options
  );
};

Module._load = function (
  request,
  parent,
  isMain
) {
  if (request === 'server-only') {
    return {};
  }

  return originalLoad.call(
    this,
    request,
    parent,
    isMain
  );
};

require.extensions['.ts'] = function (
  module,
  filename
) {
  const relative = path.relative(
    srcRoot,
    filename
  );

  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      'TypeScript loading outside src is blocked.'
    );
  }

  const source = fs.readFileSync(
    filename,
    'utf8'
  );

  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });

  const errors = (
    result.diagnostics || []
  ).filter(
    diagnostic =>
      diagnostic.category ===
      ts.DiagnosticCategory.Error
  );

  if (errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(
        errors,
        {
          getCanonicalFileName: file => file,
          getCurrentDirectory: () => root,
          getNewLine: () => '\n',
        }
      )
    );
  }

  module._compile(
    result.outputText,
    filename
  );
};

console.log(
  'SUCCESS: Isolated identity runtime loader ready.'
);
