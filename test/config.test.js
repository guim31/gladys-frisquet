// -----------------------------------------------------------------------------
// Configuration: defaults, normalization of what the form sends.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, pollIntervalMs } from '../src/config.js';

test('defaults: French names, a read every 5 minutes, not configured', () => {
  const config = normalizeConfig();
  assert.equal(config.language, 'fr');
  assert.equal(pollIntervalMs(config), 5 * 60_000);
  assert.equal(isConfigured(config), false);
  assert.deepEqual(normalizeConfig({}), { ...DEFAULT_CONFIG });
});

test('the e-mail is trimmed, the password kept as typed', () => {
  const config = normalizeConfig({ email: '  jane@example.com ', password: ' pass ' });
  assert.equal(config.email, 'jane@example.com');
  assert.equal(config.password, ' pass ');
  assert.equal(isConfigured(config), true);
});

test('an unknown language or interval falls back to the default', () => {
  const config = normalizeConfig({ language: 'it', poll_interval: '1' });
  assert.equal(config.language, 'fr');
  assert.equal(config.poll_interval, '5');
  assert.equal(pollIntervalMs(normalizeConfig({ poll_interval: 15 })), 15 * 60_000);
});
