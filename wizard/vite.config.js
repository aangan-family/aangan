import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// The template, the sample family and the one-paste database setup are served from the wizard itself,
// so the page never needs to fetch anything from another site (its CSP forbids it).
const FILES = {
  'family-tree-template.xlsx': '../templates/family-tree-template.xlsx',
  'sample-family.xlsx': '../templates/sample-family.xlsx',
  'setup.sql': '../supabase/setup.sql',
};

export default defineConfig({
  base: './',
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  plugins: [{
    name: 'aangan-files',
    generateBundle() {
      for (const [fileName, path] of Object.entries(FILES))
        this.emitFile({ type: 'asset', fileName: `files/${fileName}`, source: readFileSync(new URL(path, import.meta.url)) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/files\/([\w.-]+)$/.exec(req.url || '');
        if (!m || !FILES[m[1]]) return next();
        res.end(readFileSync(new URL(FILES[m[1]], import.meta.url)));
      });
    },
  }],
});
