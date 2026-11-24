// Test-only compiler; the production TypeScript 7 CLI remains unchanged.
const fs = require('node:fs');
const path = require('node:path');
const version = '5.8.3';
function compatible() {
  // npm exec --package=typescript@5.8.3 exposes its bin directory in PATH.
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    try {
      const bin = fs.realpathSync(path.join(dir, 'tsc'));
      const pkg = path.resolve(path.dirname(bin), '..');
      const manifest = require(path.join(pkg, 'package.json'));
      if (manifest.name !== 'typescript' || manifest.version !== version) continue;
      const compiler = require(pkg);
      if (typeof compiler.transpileModule === 'function') return compiler;
    } catch { /* another PATH entry may contain the pinned compiler */ }
  }
  throw new Error('Use npm exec --yes --package=typescript@5.8.3 -- node --test tests/d2-leads.test.cjs tests/d3-conversations.test.cjs tests/d4-meta.test.cjs tests/d5-campaigns.test.cjs');
}
module.exports = compatible();
