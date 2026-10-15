// -----------------------------------------------------------------------------
// The commands of the Gladys features, turned into Frisquet orders: setpoints,
// mode (thermostat preset), boost, hot water. After an accepted order the
// expected value is published at once (the boiler takes a few minutes); a
// refused order publishes nothing.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { createFakeCloud } from './helpers/cloud.js';
import { PRESET } from '../src/devices.js';

const ID = 'ext:test-integration';
const Z1 = `${ID}:zone:00000000000001-Z1`;
const BOILER = `${ID}:boiler:00000000000001`;

function featureOf(world, featureId) {
  for (const device of world.fake.discoveredDevices) {
    const feature = device.features.find((f) => f.external_id === featureId);
    if (feature) {
      return { device, feature };
    }
  }
  throw new Error(`no feature ${featureId}`);
}

async function set(world, featureId, value) {
  const { device, feature } = featureOf(world, featureId);
  return world.fake.setValue(device, feature, value);
}

test('the setpoint writes the setpoint of the running mode, rounded to 0.5 °C', async () => {
  const world = await createWorld();
  try {
    // Z1 runs comfort (MODE 6) under the programme.
    assert.deepEqual(await set(world, `${Z1}:setpoint`, 20.3), { success: true });
    assert.deepEqual(world.cloud.orders, [{ cle: 'CONS_CONF_Z1', valeur: '205' }]);
    assert.equal(world.fake.lastState(`${Z1}:setpoint`), 20.5);
    assert.equal(world.fake.lastState(`${Z1}:comfort_setpoint`), 20.5);
    assert.equal(world.fake.lastState(`${Z1}:reduced_setpoint`), 19, 'untouched');
  } finally {
    await world.stop();
  }
});

test('the three setpoints are written one by one', async () => {
  const world = await createWorld();
  try {
    await set(world, `${Z1}:reduced_setpoint`, 17);
    await set(world, `${Z1}:frost_setpoint`, 7.5);
    await set(world, `${Z1}:comfort_setpoint`, 21);
    assert.deepEqual(world.cloud.orders, [
      { cle: 'CONS_RED_Z1', valeur: '170' },
      { cle: 'CONS_HG_Z1', valeur: '75' },
      { cle: 'CONS_CONF_Z1', valeur: '210' },
    ]);
    assert.equal(world.fake.lastState(`${Z1}:setpoint`), 21, 'comfort runs: setpoint follows');
    // And the next read agrees with what was published.
    world.cloud.uplink();
    await world.app.poller.cycle();
    assert.equal(world.fake.lastState(`${Z1}:reduced_setpoint`), 17);
    assert.equal(world.fake.lastState(`${Z1}:setpoint`), 21);
  } finally {
    await world.stop();
  }
});

test('the mode (thermostat preset) writes SELECTEUR', async () => {
  const world = await createWorld();
  try {
    await set(world, `${Z1}:preset`, PRESET.FROST);
    await set(world, `${Z1}:preset`, PRESET.ECO);
    await set(world, `${Z1}:preset`, PRESET.COMFORT);
    await set(world, `${Z1}:preset`, PRESET.SCHEDULE);
    assert.deepEqual(world.cloud.orders, [
      { cle: 'SELECTEUR_Z1', valeur: '8' },
      { cle: 'SELECTEUR_Z1', valeur: '7' },
      { cle: 'SELECTEUR_Z1', valeur: '6' },
      { cle: 'SELECTEUR_Z1', valeur: '5' },
    ]);
    assert.equal(world.fake.lastState(`${Z1}:preset`), PRESET.SCHEDULE);
  } finally {
    await world.stop();
  }
});

test('a permanent mode shows its setpoint at once', async () => {
  const world = await createWorld();
  try {
    await set(world, `${Z1}:preset`, PRESET.FROST);
    assert.equal(world.fake.lastState(`${Z1}:setpoint`), 12);
    assert.equal(world.fake.lastState(`${Z1}:status`), 'Hors-gel (permanent)');
  } finally {
    await world.stop();
  }
});

test('back to the programme ends a running override', async () => {
  const world = await createWorld({ cloud: { siteFiles: ['site-boost-derogation.json'] } });
  const zone = `${ID}:zone:00000000000003-Z1`;
  try {
    assert.equal(world.fake.lastState(`${zone}:override`), 1);
    assert.equal(world.fake.lastState(`${zone}:status`), 'Réduit (dérogation)');
    await set(world, `${zone}:preset`, PRESET.SCHEDULE);
    assert.deepEqual(world.cloud.orders, [
      { cle: 'SELECTEUR_Z1', valeur: '5' },
      { cle: 'MODE_DERO', valeur: '0' },
    ]);
    assert.equal(world.fake.lastState(`${zone}:override`), 0);
  } finally {
    await world.stop();
  }
});

test('boost, where the zone offers it', async () => {
  const world = await createWorld({ cloud: { siteFiles: ['site-boost-derogation.json'] } });
  const zone = `${ID}:zone:00000000000003-Z1`;
  try {
    await set(world, `${zone}:boost`, 1);
    assert.deepEqual(world.cloud.orders, [{ cle: 'ACTIVITE_BOOST_Z1', valeur: '1' }]);
    assert.equal(world.fake.lastState(`${zone}:boost`), 1);
    assert.equal(world.fake.lastState(`${zone}:status`), 'Réduit (boost)');
    await set(world, `${zone}:boost`, 0);
    assert.equal(world.fake.lastState(`${zone}:boost`), 0);
  } finally {
    await world.stop();
  }
});

test('hot water off is "Stop"; on restores the last mode', async () => {
  const world = await createWorld();
  try {
    assert.equal(world.fake.lastState(`${BOILER}:hot_water_mode`), 'eco_timer');
    await set(world, `${BOILER}:hot_water`, 0);
    assert.deepEqual(world.cloud.orders.at(-1), { cle: 'MODE_ECS', valeur: '5' });
    assert.equal(world.fake.lastState(`${BOILER}:hot_water`), 0);
    assert.equal(world.fake.lastState(`${BOILER}:hot_water_mode`), 'stop');

    await world.app.poller.cycle(); // the cloud now says Stop
    await set(world, `${BOILER}:hot_water`, 1);
    assert.deepEqual(world.cloud.orders.at(-1), { cle: 'MODE_ECS', valeur: '2' });
    assert.equal(world.fake.lastState(`${BOILER}:hot_water_mode`), 'eco_timer');
  } finally {
    await world.stop();
  }
});

test('hot water on after a restart still restores the last mode (kept in /data)', async () => {
  const cloud = createFakeCloud();
  const first = await createWorld({ fakeCloud: cloud });
  try {
    await set(first, `${BOILER}:hot_water_mode`, 'max');
    await set(first, `${BOILER}:hot_water`, 0);
  } finally {
    await first.app.stop();
  }
  const second = await createWorld({ fakeCloud: cloud, dataDir: first.dir });
  try {
    await set(second, `${BOILER}:hot_water`, 1);
    assert.deepEqual(cloud.orders.at(-1), { cle: 'MODE_ECS', valeur: '0' });
  } finally {
    await second.stop();
    await first.stop();
  }
});

test('the hot water mode select sends the mode id', async () => {
  const world = await createWorld();
  try {
    await set(world, `${BOILER}:hot_water_mode`, 'eco_plus');
    assert.deepEqual(world.cloud.orders, [{ cle: 'MODE_ECS', valeur: '3' }]);
    const ack = await set(world, `${BOILER}:hot_water_mode`, 'turbo');
    assert.equal(ack.success, false);
  } finally {
    await world.stop();
  }
});

test('a read-only feature refuses a command', async () => {
  const world = await createWorld();
  try {
    const ack = await set(world, `${Z1}:temperature`, 30);
    assert.equal(ack.success, false);
    assert.match(ack.error, /read-only/);
    assert.equal(world.cloud.orders.length, 0);
  } finally {
    await world.stop();
  }
});

test('a refused order fails the command and publishes nothing', async () => {
  const world = await createWorld();
  try {
    const count = world.fake.states.length;
    world.cloud.failures.push({ status: 503 });
    const ack = await set(world, `${Z1}:comfort_setpoint`, 22);
    assert.equal(ack.success, false);
    assert.equal(world.fake.states.length, count);
    assert.equal(world.fake.connectionStatus.connected, false);
    // The next successful exchange says the cloud is back.
    await set(world, `${Z1}:comfort_setpoint`, 22);
    assert.equal(world.fake.connectionStatus.connected, true);
  } finally {
    await world.stop();
  }
});

test('the boiler is read again after an order', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  try {
    const reads = () =>
      world.cloud.requests.filter(
        (r) => r.method === 'GET' && /\/sites\/\d+$/.test(r.url.split('?')[0]),
      ).length;
    const before = reads();
    await set(world, `${Z1}:preset`, PRESET.COMFORT);
    world.cloud.uplink();
    t.mock.timers.tick(20_000);
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(reads(), before + 1, 'read again 20 s later');
    assert.equal(world.fake.lastState(`${Z1}:status`), 'Confort (permanent)');
  } finally {
    await world.stop();
  }
});
