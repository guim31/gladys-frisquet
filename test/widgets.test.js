// -----------------------------------------------------------------------------
// The "zones" widget: every content passes the SDK's validator (rendered as
// sent, within the core's budget), its live tiles point at features the
// devices really publish, its buttons have unique keys and send the right
// orders.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createWorld } from './helpers/world.js';

const Z1 = 'ext:test-integration:zone:00000000000001-Z1';
const BOILER = 'ext:test-integration:boiler:00000000000001';
const LANGS = ['en', 'fr', 'de', 'es'];

async function content(world, settings = {}, language = 'fr') {
  const ack = await world.fake.widgetGet('zones', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
}

function check(world, widget) {
  assert.deepEqual(validateWidgetContent(widget), []);
  const features = new Set(
    world.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
  );
  for (const component of widget.components) {
    if (component.device_feature) {
      assert.ok(features.has(component.device_feature), `unknown ${component.device_feature}`);
    }
  }
  const keys = widget.components.filter((c) => c.action).map((c) => c.action.key);
  assert.equal(new Set(keys).size, keys.length, 'unique action keys');
  assert.ok(
    widget.components.every((c) => c.type !== 'button' || c.style !== 'primary'),
    'no primary style (invisible in dark mode)',
  );
}

test('one zone: live tiles, mode, setpoints, outdoor, four buttons', async () => {
  const world = await createWorld();
  try {
    for (const language of LANGS) {
      const widget = await content(world, { zone: Z1 }, language);
      check(world, widget);
      const types = widget.components.map((c) => c.type);
      assert.deepEqual(types.filter((t) => t === 'value').length, 2);
      assert.deepEqual(types.filter((t) => t === 'button').length, 4);
    }
    const widget = await content(world, { zone: Z1 });
    assert.equal(widget.components[0].text, 'Chambres');
    const status = widget.components.find((c) => c.type === 'status');
    assert.equal(status.items[0].value, 'Confort (programme)');
    assert.equal(status.items[1].value, '19 °C / 19 °C');
    assert.deepEqual(status.items[3], { label: 'Extérieur', value: '10.5 °C', icon: 'cloud' });
    const programme = widget.components.find((c) => c.action?.key === 'mode_auto');
    assert.equal(programme.icon, 'check-circle', 'the current mode is shown by its icon');
  } finally {
    await world.stop();
  }
});

test('overview: every zone, within the tile budget', async () => {
  const world = await createWorld({
    cloud: {
      siteFiles: ['site-two-zones.json', 'site-boost-derogation.json', 'site-heating-only.json'],
    },
  });
  try {
    for (const language of LANGS) {
      const widget = await content(world, {}, language);
      check(world, widget);
      assert.ok(widget.components.filter((c) => c.type === 'value').length <= 6);
      const status = widget.components.find((c) => c.type === 'status');
      assert.equal(status.items.length, 7, '6 zones and the alarm of the second boiler');
    }
    const boilerOnly = await content(world, { zone: BOILER });
    check(world, boilerOnly);
    assert.equal(boilerOnly.components.find((c) => c.type === 'status').items.length, 2);
  } finally {
    await world.stop();
  }
});

test('tiles without an added device show the value itself', async () => {
  const world = await createWorld({ addDevices: false });
  try {
    const widget = await content(world, { zone: Z1 });
    check(world, widget);
    const tiles = widget.components.filter((c) => c.type === 'value');
    assert.ok(tiles.every((c) => c.device_feature === undefined));
    assert.equal(tiles[0].value, 18.9);
  } finally {
    await world.stop();
  }
});

test('not configured: one sentence', async () => {
  const world = await createWorld({ config: { email: '' }, addDevices: false });
  try {
    const widget = await content(world);
    check(world, widget);
    assert.match(widget.components[0].text.fr, /e-mail/);
  } finally {
    await world.stop();
  }
});

test('the buttons send the orders and answer with a toast', async () => {
  const world = await createWorld();
  try {
    let ack = await world.fake.widgetAction(
      'zones',
      'mode_comfort',
      { zone: Z1 },
      { settings: {} },
    );
    assert.equal(ack.success, true);
    assert.deepEqual(world.cloud.orders, [{ cle: 'SELECTEUR_Z1', valeur: '6' }]);
    const toast = ack.data.message ?? ack.data;
    assert.match(toast.fr, /^Chambres : Confort demandé/);
    assert.ok(Object.values(toast).every((text) => text.length <= 200));

    // On the programme, during a comfort period, the override asks for reduced.
    await world.fake.widgetAction('zones', 'mode_auto', { zone: Z1 }, { settings: {} });
    world.cloud.orders.length = 0;
    ack = await world.fake.widgetAction('zones', 'override', { zone: Z1 }, { settings: {} });
    assert.deepEqual(world.cloud.orders, [{ cle: 'MODE_DERO', valeur: '7' }]);
    assert.match((ack.data.message ?? ack.data).fr, /Réduit \(dérogation\)/);

    const widget = await content(world, { zone: Z1 });
    const end = widget.components.find((c) => c.action?.key === 'end_override');
    assert.ok(end, 'the override can be ended from the widget');
    world.cloud.orders.length = 0;
    await world.fake.widgetAction('zones', 'end_override', { zone: Z1 }, { settings: {} });
    assert.deepEqual(world.cloud.orders, [{ cle: 'MODE_DERO', valeur: '0' }]);
  } finally {
    await world.stop();
  }
});

test('an unknown zone or action is refused', async () => {
  const world = await createWorld();
  try {
    let ack = await world.fake.widgetAction(
      'zones',
      'mode_auto',
      { zone: 'nope' },
      { settings: {} },
    );
    assert.equal(ack.success, false);
    ack = await world.fake.widgetAction('zones', 'explode', { zone: Z1 }, { settings: {} });
    assert.equal(ack.success, false);
    assert.equal(world.cloud.orders.length, 0);
  } finally {
    await world.stop();
  }
});
