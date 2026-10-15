// -----------------------------------------------------------------------------
// Scene trigger `alarm_raised` (a new alarm of the boiler, not a state the
// devices already carry: the alarm text names the fault) and the scene
// actions `set_zone_mode` and `set_hot_water_mode`.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { createFakeCloud } from './helpers/cloud.js';

const BOILER = 'ext:test-integration:boiler:00000000000001';
const Z1 = 'ext:test-integration:zone:00000000000001-Z1';
const Z2 = 'ext:test-integration:zone:00000000000001-Z2';

test('a new alarm fires alarm_raised once, with its text', async () => {
  const world = await createWorld();
  try {
    assert.deepEqual(world.fake.sceneEvents, [], 'no alarm at the first read');
    const site = world.cloud.sites.get('00000000000001');
    site.alarmes = [{ nom: 'Défaut allumage' }];
    await world.app.poller.cycle();
    await world.app.poller.cycle();
    assert.deepEqual(world.fake.sceneEvents, [
      { key: 'alarm_raised', data: { boiler: BOILER, alarm: 'Défaut allumage' } },
    ]);
    assert.equal(world.fake.lastState(`${BOILER}:alarm`), 'Défaut allumage');
    assert.equal(world.fake.lastState(`${BOILER}:alarm_active`), 1);

    site.alarmes = [];
    await world.app.poller.cycle();
    assert.equal(world.fake.sceneEvents.length, 1, 'the end of an alarm fires nothing');
    assert.equal(world.fake.lastState(`${BOILER}:alarm`), 'Aucune alarme');
    assert.equal(world.fake.lastState(`${BOILER}:alarm_active`), 0);
  } finally {
    await world.stop();
  }
});

test('an alarm already there at install or after a restart fires nothing', async () => {
  const cloud = createFakeCloud({ siteFiles: ['site-boost-derogation.json'] });
  const first = await createWorld({ fakeCloud: cloud });
  try {
    assert.deepEqual(first.fake.sceneEvents, []);
    assert.equal(
      first.fake.lastState('ext:test-integration:boiler:00000000000003:alarm'),
      'Box Frisquet Connect déconnectée',
    );
  } finally {
    await first.app.stop();
  }
  const second = await createWorld({ fakeCloud: cloud, dataDir: first.dir });
  try {
    await second.app.poller.cycle();
    assert.deepEqual(second.fake.sceneEvents, []);
  } finally {
    await second.stop();
    await first.stop();
  }
});

test('set_zone_mode on one zone', async () => {
  const world = await createWorld();
  try {
    const ack = await world.fake.sceneAction('set_zone_mode', { zone: Z2, mode: 'frost' });
    assert.deepEqual(ack, { success: true, data: { outputs: { mode: 'frost' } } });
    assert.deepEqual(world.cloud.orders, [{ cle: 'SELECTEUR_Z2', valeur: '8' }]);
  } finally {
    await world.stop();
  }
});

test('set_zone_mode on a boiler: every zone', async () => {
  const world = await createWorld();
  try {
    await world.fake.sceneAction('set_zone_mode', { zone: BOILER, mode: 'reduced' });
    assert.deepEqual(world.cloud.orders, [
      { cle: 'SELECTEUR_Z1', valeur: '7' },
      { cle: 'SELECTEUR_Z2', valeur: '7' },
    ]);
  } finally {
    await world.stop();
  }
});

test('set_zone_mode override: back on the programme first, one override order', async () => {
  const world = await createWorld();
  try {
    await world.fake.sceneAction('set_zone_mode', { zone: Z1, mode: 'frost' });
    world.cloud.orders.length = 0;
    await world.fake.sceneAction('set_zone_mode', { zone: BOILER, mode: 'comfort_override' });
    assert.deepEqual(world.cloud.orders, [
      { cle: 'SELECTEUR_Z1', valeur: '5' },
      { cle: 'MODE_DERO', valeur: '6' },
    ]);
    world.cloud.orders.length = 0;
    await world.fake.sceneAction('set_zone_mode', { zone: Z1, mode: 'end_override' });
    assert.deepEqual(world.cloud.orders, [{ cle: 'MODE_DERO', valeur: '0' }]);
  } finally {
    await world.stop();
  }
});

test('set_zone_mode refuses an unknown mode or device', async () => {
  const world = await createWorld();
  try {
    assert.equal(
      (await world.fake.sceneAction('set_zone_mode', { zone: Z1, mode: 'off' })).success,
      false,
    );
    assert.equal(
      (await world.fake.sceneAction('set_zone_mode', { zone: 'nope', mode: 'auto' })).success,
      false,
    );
    assert.equal(world.cloud.orders.length, 0);
  } finally {
    await world.stop();
  }
});

test('set_hot_water_mode: stop, then on restores the last mode', async () => {
  const world = await createWorld();
  try {
    await world.fake.sceneAction('set_hot_water_mode', { boiler: BOILER, mode: 'stop' });
    await world.fake.sceneAction('set_hot_water_mode', { boiler: Z1, mode: 'on' });
    assert.deepEqual(world.cloud.orders, [
      { cle: 'MODE_ECS', valeur: '5' },
      { cle: 'MODE_ECS', valeur: '2' },
    ]);
    const ack = await world.fake.sceneAction('set_hot_water_mode', { boiler: BOILER, mode: 'max' });
    assert.deepEqual(ack, { success: true, data: { outputs: { mode: 'max' } } });
  } finally {
    await world.stop();
  }
});

test('set_hot_water_mode on a heating-only boiler fails clearly', async () => {
  const world = await createWorld({ cloud: { siteFiles: ['site-heating-only.json'] } });
  try {
    const ack = await world.fake.sceneAction('set_hot_water_mode', {
      boiler: 'ext:test-integration:boiler:00000000000005',
      mode: 'stop',
    });
    assert.equal(ack.success, false);
    assert.match(ack.error, /no hot water/);
  } finally {
    await world.stop();
  }
});
