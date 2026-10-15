// -----------------------------------------------------------------------------
// The states refresh on the container's own timer, never waiting for the core's
// onPoll (Gladys#3198, and no poll_frequency slow enough anyway); onPoll is a
// fallback that does not read the cloud twice; only the boilers the user added
// are read; a device just added gets its states at once; nothing unchanged is
// published again before the heartbeat.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';

const Z1 = 'zone:00000000000001-Z1';
const temperatureOf = (world) => world.fake.lastState(`ext:test-integration:${Z1}:temperature`);
const reads = (world) =>
  world.cloud.requests.filter(
    (r) => r.method === 'GET' && /\/sites\/\d+$/.test(new URL(r.url).pathname),
  ).length;

/** Let the timer's async callback and the fake requests settle. */
async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('the timer refreshes the states every 5 minutes, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  try {
    // No gladys.fake.poll() anywhere in this test: the core never polls.
    assert.equal(temperatureOf(world), 18.9);

    world.cloud.sites.get('00000000000001').zones[0].carac_zone.TAMB = 201;
    t.mock.timers.tick(4 * 60_000);
    await settle();
    assert.equal(temperatureOf(world), 18.9, 'not before the period');

    t.mock.timers.tick(60_000);
    await settle();
    assert.equal(temperatureOf(world), 20.1, 'refreshed by the timer');

    world.cloud.sites.get('00000000000001').zones[0].carac_zone.TAMB = 195;
    t.mock.timers.tick(5 * 60_000);
    await settle();
    assert.equal(temperatureOf(world), 19.5, 'and again one period later');
  } finally {
    await world.stop();
  }
});

test('the configured interval is honoured (15 minutes)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true, config: { poll_interval: '15' } });
  try {
    const before = reads(world);
    t.mock.timers.tick(10 * 60_000);
    await settle();
    assert.equal(reads(world), before);
    t.mock.timers.tick(5 * 60_000);
    await settle();
    assert.equal(reads(world), before + 1);
  } finally {
    await world.stop();
  }
});

test('one read covers a boiler and all its zones', async () => {
  const world = await createWorld();
  try {
    const before = reads(world);
    await world.app.poller.cycle();
    assert.equal(reads(world), before + 1);
  } finally {
    await world.stop();
  }
});

test("the core's onPoll is a fallback: no second read right after the timer's", async () => {
  const clock = { now: Date.parse('2025-01-20T10:00:00Z') };
  const world = await createWorld({ clock });
  try {
    const zone = world.device(Z1);
    const before = reads(world);
    assert.deepEqual(await world.fake.poll(zone), { success: true });
    assert.equal(reads(world), before, 'read at startup, less than 90 % of a period ago');

    clock.now += 5 * 60_000;
    world.cloud.sites.get('00000000000001').zones[0].carac_zone.TAMB = 177;
    await world.fake.poll(zone);
    assert.equal(reads(world), before + 1, 'the timer stalled: the core takes over');
    assert.equal(temperatureOf(world), 17.7);
  } finally {
    await world.stop();
  }
});

test('only the boilers with a device added to Gladys are read', async () => {
  const world = await createWorld({ addDevices: false });
  try {
    const before = reads(world);
    await world.app.poller.cycle();
    assert.equal(reads(world), before, 'nothing added: no read');
    assert.equal(world.fake.states.length, 0, 'and no state for unknown devices');

    await world.fake.deviceCreated(world.device(Z1));
    await world.app.poller.cycle();
    assert.equal(reads(world), before + 1);
  } finally {
    await world.stop();
  }
});

test('a device just added gets all its states at once, and the widget is nudged', async () => {
  const world = await createWorld({ addDevices: false });
  try {
    assert.equal(world.fake.states.length, 0);
    await world.fake.deviceCreated(world.device(Z1));
    const published = world.fake.states.map((s) => s.device_feature_external_id);
    assert.ok(published.length >= 8);
    assert.ok(
      published.every((id) => id.includes(Z1)),
      'only the added device',
    );
    assert.ok(world.fake.widgetRefreshes.includes('zones'));
  } finally {
    await world.stop();
  }
});

test('an unchanged value is not published again', async () => {
  const world = await createWorld();
  try {
    const count = world.fake.states.length;
    await world.app.poller.cycle();
    assert.equal(world.fake.states.length, count);
    world.cloud.sites.get('00000000000001').environnement.T_EXT = 99;
    await world.app.poller.cycle();
    assert.deepEqual(world.fake.states.slice(count), [
      {
        device_feature_external_id:
          'ext:test-integration:boiler:00000000000001:outdoor_temperature',
        state: 9.9,
      },
    ]);
  } finally {
    await world.stop();
  }
});

test('a heartbeat re-publishes the unchanged values every 6 hours', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2025-01-20T10:00:00Z') });
  const world = await createWorld();
  try {
    const count = world.fake.states.length;
    t.mock.timers.setTime(Date.parse('2025-01-20T15:00:00Z'));
    await world.app.poller.cycle();
    assert.equal(world.fake.states.length, count, 'not after 5 hours');
    t.mock.timers.setTime(Date.parse('2025-01-20T16:01:00Z'));
    await world.app.poller.cycle();
    assert.equal(world.fake.states.length, count * 2, 'everything again after 6 hours');
  } finally {
    await world.stop();
  }
});

test('the gas consumption is read every 6 hours, not at every cycle', async () => {
  const clock = { now: Date.parse('2025-01-20T10:00:00Z') };
  const world = await createWorld({ clock });
  try {
    const conso = () => world.cloud.requests.filter((r) => r.url.includes('/conso')).length;
    assert.equal(
      world.fake.lastState('ext:test-integration:boiler:00000000000001:heating_gas_month'),
      1387,
    );
    assert.equal(
      world.fake.lastState('ext:test-integration:boiler:00000000000001:hot_water_gas_year'),
      196,
    );
    const before = conso();
    clock.now += 5 * 60_000;
    await world.app.poller.cycle();
    assert.equal(conso(), before);
    clock.now += 6 * 3_600_000;
    await world.app.poller.cycle();
    assert.equal(conso(), before + 1);
  } finally {
    await world.stop();
  }
});

test('a cloud down at startup is retried by the timer', async () => {
  const { createFakeCloud } = await import('./helpers/cloud.js');
  const cloud = createFakeCloud();
  cloud.down = true;
  const world = await createWorld({ fakeCloud: cloud, addDevices: false });
  try {
    assert.equal(world.fake.discoveredDevices.length, 0);
    assert.equal(world.fake.connectionStatus.connected, false);
    cloud.down = false;
    await world.app.poller.cycle();
    assert.equal(world.fake.discoveredDevices.length, 3);
    assert.equal(world.fake.connectionStatus.connected, true);
  } finally {
    await world.stop();
  }
});
