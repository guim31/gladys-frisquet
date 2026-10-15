// -----------------------------------------------------------------------------
// Reading the real (anonymized) answers of Frisquet Connect, and writing the
// orders. The fixtures come from the community projects credited in
// test/fixtures/README.md.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONE_MODE,
  activeSetpointKey,
  hotWaterModeKey,
  orders,
  parseConsumption,
  parseSite,
  toTenths,
} from '../src/frisquet/model.js';
import { fixture } from './helpers/cloud.js';

test('a two-zone boiler: tenths of a degree, chosen mode and running mode', () => {
  const site = parseSite(fixture('site-two-zones.json'));
  assert.equal(site.id, '00000000000001');
  assert.equal(site.name, 'Maison');
  assert.equal(site.model, 'Hydromotrix Condensation 25 kW');
  assert.equal(site.outdoorTemperature, 10.5);
  assert.equal(site.standby, false);
  assert.equal(site.holiday.active, false);
  assert.deepEqual(site.alarms, [], 'alarmes_pro are installer notes, not alarms');
  assert.equal(site.lastUplink.toISOString(), '2025-12-22T12:38:18.000Z');
  assert.deepEqual(
    site.zones.map((zone) => [zone.id, zone.number, zone.name]),
    [
      ['Z1', 1, 'Chambres'],
      ['Z2', 2, 'Séjour'],
    ],
  );
  assert.deepEqual(site.zones[0], {
    id: 'Z1',
    number: 1,
    name: 'Chambres',
    temperature: 18.9,
    setpoint: 19,
    comfort: 19,
    reduced: 19,
    frost: 12,
    selector: ZONE_MODE.AUTO,
    mode: ZONE_MODE.COMFORT,
    override: false,
    boost: false,
    boostAvailable: false,
  });
});

test('a boiler with boost, an override running and the Connect box alarm', () => {
  const site = parseSite(fixture('site-boost-derogation.json'));
  const [zone] = site.zones;
  assert.equal(zone.boostAvailable, true);
  assert.equal(zone.override, true);
  assert.equal(zone.selector, ZONE_MODE.AUTO);
  assert.equal(zone.mode, ZONE_MODE.REDUCED);
  assert.equal(zone.setpoint, 18.5);
  assert.equal(zone.frost, 8);
  assert.equal(site.outdoorTemperature, 3.4);
  assert.deepEqual(site.alarms, ['Box Frisquet Connect déconnectée']);
  assert.equal(zone.name, 'Zone 1');
});

test('a heating-only boiler on holiday, without outdoor probe', () => {
  const site = parseSite(fixture('site-heating-only.json'));
  assert.equal(site.hotWater, null);
  assert.equal(site.outdoorTemperature, null);
  assert.equal(site.holiday.active, true);
  assert.equal(site.holiday.from.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(site.zones.length, 3);
  // A negative and a 0 reading are readings, not "no value".
  assert.equal(site.zones[2].temperature, -0.5);
  const raw = fixture('site-heating-only.json');
  raw.zones[0].carac_zone.TAMB = 0;
  raw.environnement.T_EXT = 0;
  const frosty = parseSite(raw);
  assert.equal(frosty.zones[0].temperature, 0);
  assert.equal(frosty.outdoorTemperature, 0);
});

test('hot water modes get stable keys, the scheduled ones included', () => {
  const twoZones = parseSite(fixture('site-two-zones.json')).hotWater;
  assert.equal(twoZones.orderKey, 'MODE_ECS');
  // "Eco " and "Eco + ": the schedule glyph was lost, its space remains.
  assert.deepEqual(
    twoZones.modes.map((mode) => [mode.key, mode.id]),
    [
      ['max', 0],
      ['eco', 1],
      ['eco_timer', 2],
      ['eco_plus', 3],
      ['eco_plus_timer', 4],
      ['stop', 5],
    ],
  );
  assert.deepEqual(twoZones.mode, { key: 'eco_timer', id: 2 });
  // "Eco ": the glyph itself.
  const boost = parseSite(fixture('site-boost-derogation.json')).hotWater;
  assert.deepEqual(
    boost.modes.map((mode) => mode.key),
    ['max', 'eco', 'eco_timer', 'stop'],
  );
  assert.equal(boost.mode.key, 'eco_timer');
  assert.equal(hotWaterModeKey('On', 5), 'on');
  assert.equal(hotWaterModeKey('Turbo', 9), 'mode_9');
});

test('a heat pump install drives MODE_ECS_PAC', () => {
  const raw = fixture('site-two-zones.json');
  raw.ecs.MODE_ECS = null;
  raw.ecs.MODE_ECS_PAC = { nom: 'On', id: 1 };
  raw.modes_ecs = [
    { nom: 'On', id: 1 },
    { nom: 'Stop', id: 5 },
  ];
  const hotWater = parseSite(raw).hotWater;
  assert.equal(hotWater.orderKey, 'MODE_ECS_PAC');
  assert.deepEqual(hotWater.mode, { key: 'on', id: 1 });
  assert.deepEqual(orders.hotWater(hotWater, 5), [{ cle: 'MODE_ECS_PAC', valeur: '5' }]);
});

test('gas used this month and this year, in kWh', () => {
  const raw = fixture('conso.json');
  assert.deepEqual(parseConsumption(raw, { year: 2025, month: 1 }), {
    heating: { month: 1387, year: 1387 },
    hotWater: { month: 196, year: 196 },
  });
  assert.deepEqual(parseConsumption(raw, { year: 2024, month: 12 }), {
    heating: { month: 1530, year: 1908 + 780 + 334 + 683 + 0 + 21 + 73 + 979 + 1530 },
    hotWater: { month: 259, year: 314 + 273 + 91 + 219 + 18 + 8 + 36 + 229 + 259 },
  });
  // A month without entry counts 0; a type the answer lacks is unknown.
  assert.deepEqual(parseConsumption({ CHF: [] }, { year: 2025, month: 2 }), {
    heating: { month: 0, year: 0 },
    hotWater: null,
  });
});

test('orders: string values, keys suffixed with the zone number', () => {
  const zone = parseSite(fixture('site-two-zones.json')).zones[1];
  assert.deepEqual(orders.setpoint(zone, 'CONS_CONF', 19.5), [
    { cle: 'CONS_CONF_Z2', valeur: '195' },
  ]);
  assert.deepEqual(orders.selector(zone, ZONE_MODE.FROST), [{ cle: 'SELECTEUR_Z2', valeur: '8' }]);
  assert.deepEqual(orders.boost(zone, true), [{ cle: 'ACTIVITE_BOOST_Z2', valeur: '1' }]);
  assert.deepEqual(orders.override(ZONE_MODE.COMFORT), [{ cle: 'MODE_DERO', valeur: '6' }]);
});

test('back to the programme also ends a running override', () => {
  const zone = parseSite(fixture('site-boost-derogation.json')).zones[0];
  assert.deepEqual(orders.selector(zone, ZONE_MODE.AUTO), [
    { cle: 'SELECTEUR_Z1', valeur: '5' },
    { cle: 'MODE_DERO', valeur: '0' },
  ]);
});

test('setpoints are rounded to 0.5 °C and kept within 5-30 °C', () => {
  assert.equal(toTenths(19.26), '195');
  assert.equal(toTenths(19.2), '190');
  assert.equal(toTenths(2), '50');
  assert.equal(toTenths(45), '300');
});

test('the setpoint in effect follows the running mode, frost protection on holiday', () => {
  const zone = parseSite(fixture('site-boost-derogation.json')).zones[0];
  assert.equal(activeSetpointKey(zone), 'CONS_RED');
  assert.equal(activeSetpointKey({ ...zone, mode: ZONE_MODE.COMFORT }), 'CONS_CONF');
  assert.equal(activeSetpointKey({ ...zone, mode: ZONE_MODE.FROST }), 'CONS_HG');
  assert.equal(activeSetpointKey(zone, true), 'CONS_HG');
});
