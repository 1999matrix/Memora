import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, relative } from 'path';

const root = join(import.meta.dirname, '..', 'src');

const deleteGlobs = [
  /\.controller\.ts$/,
  /\.module\.ts$/,
  /\.processor\.ts$/,
  /jwt\.strategy\.ts$/,
  /\.spec\.ts$/,
  /redis-throttler\.storage\.ts$/,
];

const deleteDirs = [
  join(root, 'domain', 'common', 'guards'),
  join(root, 'domain', 'common', 'decorators'),
  join(root, 'domain', 'common', 'interceptors'),
  join(root, 'domain', 'common', 'filters'),
  join(root, 'domain', 'common', 'middleware'),
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (name.endsWith('.ts')) files.push(p);
  }
  return files;
}

function depthFromSrc(file) {
  const rel = relative(root, file).replace(/\\/g, '/');
  return rel.split('/').length - 1;
}

function httpErrorsImportPath(file) {
  const up = '../'.repeat(depthFromSrc(file));
  return `${up}lib/http-errors.js`;
}

function loggerImportPath(file) {
  const up = '../'.repeat(depthFromSrc(file));
  return `${up}lib/logger.js`;
}

for (const d of deleteDirs) {
  try {
    for (const name of readdirSync(d)) {
      unlinkSync(join(d, name));
    }
  } catch {
    /* missing */
  }
}

const files = walk(join(root, 'domain'));
for (const f of [...files, join(root, 'http', 'middleware', 'auth.ts'), join(root, 'http', 'middleware', 'error-handler.ts')]) {
  try {
    statSync(f);
  } catch {
    continue;
  }
  if (deleteGlobs.some((re) => re.test(f))) {
    unlinkSync(f);
    continue;
  }

  let s = readFileSync(f, 'utf8');
  const errPath = httpErrorsImportPath(f);
  const logPath = loggerImportPath(f);

  s = s.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]@nestjs\/bullmq['"];?\s*\n/g,
    '',
  );
  s = s.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]@nestjs\/throttler[^'"]*['"];?\s*\n/g,
    '',
  );

  const nestImport =
    /import\s*\{([^}]+)\}\s*from\s*['"]@nestjs\/common['"];?\s*\n/g;
  const needed = new Set();
  let m;
  while ((m = nestImport.exec(s))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^type\s+/, '');
      if (
        name &&
        name !== 'Injectable' &&
        name !== 'Inject' &&
        name !== 'OnModuleInit' &&
        name !== 'OnModuleDestroy'
      ) {
        needed.add(name);
      }
    }
  }
  s = s.replace(nestImport, '');

  const imports = [];
  const exceptions = [...needed].filter((n) => n.endsWith('Exception'));
  const wantsLogger = needed.has('Logger') || s.includes('new Logger(');
  if (exceptions.length) {
    imports.push(
      `import { ${exceptions.join(', ')} } from '${errPath}';`,
    );
  }
  if (wantsLogger) {
    imports.push(`import { Logger } from '${logPath}';`);
  }
  if (imports.length) {
    s = imports.join('\n') + '\n' + s;
  }

  s = s.replace(/^\s*@Injectable\(\)\s*\n/gm, '');
  s = s.replace(/^\s*@Inject\([^)]+\)\s*\n/gm, '');
  s = s.replace(/^\s*@InjectQueue\([^)]+\)\s*\n/gm, '');
  s = s.replace(/^\s*@Processor\([^)]+\)\s*\n/gm, '');
  s = s.replace(/implements OnModuleInit/g, '');
  s = s.replace(/implements OnModuleDestroy/g, '');
  s = s.replace(/, OnModuleInit/g, '');
  s = s.replace(/, OnModuleDestroy/g, '');

  writeFileSync(f, s);
}

console.log('denest: stripped Nest imports/decorators and removed Nest-only files');
