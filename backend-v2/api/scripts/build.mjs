import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main.ts', 'src/worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  packages: 'external',
  sourcemap: true,
  target: 'node20',
});

console.log('built dist/main.js and dist/worker.js');
