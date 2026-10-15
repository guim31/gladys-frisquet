// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures: a two-zone boiler with hot water, a one-zone boiler with boost
// and an alarm, a heating-only boiler on holiday without outdoor probe, two
// boilers on one account, a heat pump hot water — in every feature-name
// language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorld } from './helpers/world.js';
import { createFakeCloud } from './helpers/cloud.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

function heatPumpCloud() {
  const cloud = createFakeCloud();
  const raw = cloud.sites.get('00000000000001');
  raw.ecs.MODE_ECS = null;
  raw.ecs.MODE_ECS_PAC = { nom: 'On', id: 1 };
  raw.modes_ecs = [
    { nom: 'On', id: 1 },
    { nom: 'Stop', id: 5 },
  ];
  return cloud;
}

const ALL = ['site-two-zones.json', 'site-boost-derogation.json', 'site-heating-only.json'];

const scenarios = [
  { label: 'two zones, hot water', cloud: { siteFiles: ['site-two-zones.json'] }, devices: 3 },
  { label: 'boost and alarm', cloud: { siteFiles: ['site-boost-derogation.json'] }, devices: 2 },
  { label: 'heating only', cloud: { siteFiles: ['site-heating-only.json'] }, devices: 4 },
  { label: 'no gas consumption', cloud: { siteFiles: ALL, conso: null }, devices: 9 },
  { label: 'heat pump hot water', fakeCloud: heatPumpCloud(), devices: 3 },
  {
    label: 'three boilers, English',
    cloud: { siteFiles: ALL },
    config: { language: 'en' },
    devices: 9,
  },
  {
    label: 'three boilers, French',
    cloud: { siteFiles: ALL },
    config: { language: 'fr' },
    devices: 9,
  },
  {
    label: 'three boilers, German',
    cloud: { siteFiles: ALL },
    config: { language: 'de' },
    devices: 9,
  },
  {
    label: 'three boilers, Spanish',
    cloud: { siteFiles: ALL },
    config: { language: 'es' },
    devices: 9,
  },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const world = await createWorld({
      cloud: scenario.cloud,
      fakeCloud: scenario.fakeCloud,
      config: scenario.config,
    });
    try {
      const devices = world.fake.discoveredDevices;
      assert.equal(devices.length, scenario.devices, 'one boiler device + one device per zone');

      const deviceIds = new Set();
      const deviceNames = new Set();
      for (const device of devices) {
        const where = device.name;
        assert.ok(!deviceIds.has(device.external_id), `${where}: duplicate device external_id`);
        deviceIds.add(device.external_id);
        assert.ok(!deviceNames.has(device.name), `${where}: duplicate device name`);
        deviceNames.add(device.name);

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
            const allowed = table.units_by_category[feature.category];
            if (allowed) {
              assert.ok(allowed.includes(feature.unit), `${at}: unit ${feature.unit} not offered`);
            }
          }
          assert.ok(feature.name.length <= 40, `${at}: name longer than 40 characters`);

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(
            feature.external_id.startsWith(`${device.external_id}:`),
            `${at}: feature id outside its device`,
          );
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }

      // Every state published refers to a published feature, with a value of the right kind.
      const features = new Map(
        devices.flatMap((device) => device.features.map((f) => [f.external_id, f])),
      );
      assert.ok(world.fake.states.length > 0, 'states were published');
      for (const state of world.fake.states) {
        const feature = features.get(state.device_feature_external_id);
        assert.ok(feature, `state for an unknown feature ${state.device_feature_external_id}`);
        if (feature.category === 'text') {
          assert.equal(typeof state.text, 'string', `${feature.name}: text state`);
          assert.ok(state.text.length > 0, `${feature.name}: empty text`);
        } else {
          assert.equal(typeof state.state, 'number', `${feature.name}: numeric state`);
          assert.ok(
            state.state >= feature.min && state.state <= feature.max,
            `${feature.name}: ${state.state} outside ${feature.min}-${feature.max}`,
          );
        }
        if (feature.supported_options && feature.category !== 'text') {
          assert.ok(
            feature.supported_options.some((option) => option.value === state.state),
            `${feature.name}: ${state.state} is not one of its options`,
          );
        }
        if (feature.supported_options && feature.category === 'text') {
          assert.ok(
            feature.supported_options.some((option) => option.value === state.text),
            `${feature.name}: "${state.text}" is not one of its options`,
          );
        }
      }
    } finally {
      await world.stop();
    }
  });
}
