import fs from 'node:fs';
import assert from 'node:assert/strict';
import { builtinPlugins } from './builtin-plugins.mjs';

const schema = JSON.parse(fs.readFileSync(new URL('../shared/core/plugin-capabilities.schema.json', import.meta.url), 'utf8'));
const allowed = new Set(schema?.properties?.capabilities?.items?.enum || []);
assert.equal(schema.schemaVersion ?? schema.properties?.schemaVersion?.const, '1.0.0');
assert.ok(allowed.size > 0, 'Capability schema must define allowed capability identifiers');

for (const plugin of builtinPlugins) {
  assert.ok(Array.isArray(plugin.capabilities) && plugin.capabilities.length > 0, `${plugin.id} must expose capabilities`);
  for (const capability of plugin.capabilities) {
    assert.ok(allowed.has(capability), `${plugin.id} uses capability not present in shared schema: ${capability}`);
  }
  assert.equal(new Set(plugin.capabilities).size, plugin.capabilities.length, `${plugin.id} contains duplicate capabilities`);
}

console.log('Plugin capability contract tests passed');
