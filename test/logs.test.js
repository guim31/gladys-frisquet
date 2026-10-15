// -----------------------------------------------------------------------------
// Quiet logs (Guilhem, 13/10/2026): nothing at info level for a normal cycle;
// a failure that repeats writes one line when it starts and one when it ends;
// never the e-mail, the password nor the token of the account — in the
// integration's logger nor on the console.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { EMAIL, PASSWORD, TOKEN, createFakeCloud } from './helpers/cloud.js';
import { PRESET } from '../src/devices.js';

const SECRETS = [EMAIL, PASSWORD, TOKEN, encodeURIComponent(EMAIL)];

function captureConsole(t) {
  const lines = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    t.mock.method(console, method, (...args) => lines.push(args.map(String).join(' ')));
  }
  return lines;
}

function assertNoSecret(texts, where) {
  for (const text of texts) {
    for (const secret of SECRETS) {
      assert.ok(!text.includes(secret), `${where}: a secret leaked in "${text}"`);
    }
  }
}

test('a normal polling cycle writes nothing at info level', async () => {
  const world = await createWorld();
  try {
    const startup = world.logger.at('info');
    assert.ok(startup.length <= 2, `startup says little: ${startup}`);
    world.logger.lines.length = 0;
    for (let i = 0; i < 3; i += 1) {
      world.cloud.sites.get('00000000000001').zones[0].carac_zone.TAMB += 1;
      await world.app.poller.cycle();
    }
    assert.ok(world.fake.states.length > 0);
    assert.deepEqual(world.logger.at('info'), []);
    assert.deepEqual(world.logger.at('warn'), []);
    assert.deepEqual(world.logger.at('error'), []);
  } finally {
    await world.stop();
  }
});

test('one info line per user action', async () => {
  const world = await createWorld();
  try {
    world.logger.lines.length = 0;
    const zone = world.device('zone:00000000000001-Z1');
    const preset = zone.features.find((f) => f.external_id.endsWith(':preset'));
    await world.fake.setValue(zone, preset, PRESET.COMFORT);
    assert.deepEqual(world.logger.at('info'), ['Chambres: mode comfort']);
  } finally {
    await world.stop();
  }
});

test('a failure that lasts is logged once, its end once', async () => {
  const world = await createWorld();
  try {
    world.logger.lines.length = 0;
    world.cloud.down = true;
    for (let i = 0; i < 4; i += 1) {
      await world.app.poller.cycle();
    }
    assert.equal(world.logger.at('warn').length, 1, world.logger.at('warn').join('\n'));
    assert.match(world.logger.at('warn')[0], /unreachable/);
    assert.equal(world.fake.connectionStatus.connected, false);
    world.cloud.down = false;
    await world.app.poller.cycle();
    await world.app.poller.cycle();
    assert.equal(world.logger.at('info').length, 1, world.logger.at('info').join('\n'));
    assert.equal(world.fake.connectionStatus.connected, true);
  } finally {
    await world.stop();
  }
});

test('a refused password: said once, and no sign-in storm', async () => {
  const cloud = createFakeCloud();
  const world = await createWorld({ fakeCloud: cloud, config: { password: 'wrong-one' } });
  try {
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.fr, /mot de passe/);
    const logins = cloud.logins;
    for (let i = 0; i < 5; i += 1) {
      await world.app.poller.cycle();
    }
    assert.equal(cloud.logins, logins, 'no new sign-in before 30 minutes');
    assert.equal(world.logger.at('warn').length, 1);
    // Fixing the password in the configuration starts over at once.
    await world.fake.configUpdated({ email: EMAIL, password: PASSWORD });
    assert.equal(world.fake.connectionStatus.connected, true);
  } finally {
    await world.stop();
  }
});

test('no secret in any log line, whatever happens', async (t) => {
  const consoleLines = captureConsole(t);
  const cloud = createFakeCloud({
    siteFiles: ['site-two-zones.json', 'site-boost-derogation.json'],
  });
  const world = await createWorld({ fakeCloud: cloud });
  try {
    const zone = world.device('zone:00000000000001-Z1');
    const setpoint = zone.features.find((f) => f.external_id.endsWith(':setpoint'));
    await world.fake.setValue(zone, setpoint, 21);
    cloud.token = 'ffffffffffffffffffffffffffffffff'; // expired token: sign in again
    await world.app.poller.cycle();
    cloud.failures.push({ status: 429 }, { status: 500 });
    await world.app.poller.cycle();
    cloud.down = true;
    await world.app.poller.cycle();
    cloud.down = false;
    await world.fake.action('test_connection', {});
    await world.fake.configUpdated({ email: EMAIL, password: 'not-the-password' });
    await world.app.poller.cycle();
    await world.fake.configUpdated({ email: EMAIL, password: PASSWORD });

    assert.ok(world.logger.lines.length > 10, 'something was logged');
    assertNoSecret(
      world.logger.lines.map((line) => line.text),
      'logger',
    );
    assertNoSecret(consoleLines, 'console');
    assertNoSecret(
      world.fake.connectionStatuses.map((s) => JSON.stringify(s)),
      'connection status',
    );
  } finally {
    await world.stop();
  }
});

test('debug level shows the reads, with the token masked', async () => {
  const world = await createWorld();
  try {
    world.logger.lines.length = 0;
    await world.app.poller.cycle();
    const reads = world.logger.at('debug').filter((text) => text.startsWith('GET '));
    assert.ok(reads.length >= 1);
    assert.ok(reads.every((text) => text.includes('token=***')));
  } finally {
    await world.stop();
  }
});

test('the Configuration screen follows the configuration back and forth', async () => {
  const world = await createWorld();
  try {
    assert.equal(world.fake.connectionStatus.connected, true);
    await world.fake.configUpdated({ email: EMAIL, password: '' });
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.en, /Enter the e-mail/);
    await world.fake.configUpdated({ email: EMAIL, password: PASSWORD });
    assert.equal(world.fake.connectionStatus.connected, true);
  } finally {
    await world.stop();
  }
});
