// -----------------------------------------------------------------------------
// The Gladys devices of a Frisquet installation, and their states.
//
//   - one "boiler" device per boiler of the account: outdoor temperature,
//     hot water (on/off and mode), alarm, holiday mode, standby, gas used;
//   - one "zone" device per heating zone (Z1, Z2, Z3): room temperature,
//     setpoint, the three setpoints of the boiler (comfort, reduced, frost
//     protection), mode, override, boost when the zone offers it.
//
// External ids are built from the boiler id the cloud gives
// (identifiant_chaudiere) and the zone id (Z1…): never from a name. They are
// forever: changing one creates a new device in Gladys.
//
// The devices are published with `should_poll: false`: the cloud is read every
// 5 to 15 minutes, slower than any poll_frequency Gladys accepts (1 minute at
// most), so the container reads on its own timer (src/poller.js) and pushes
// the states.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { SETPOINT_MAX, SETPOINT_MIN, SETPOINT_STEP, ZONE_MODE } from './frisquet/model.js';
import { TEXT, namesFor, pick } from './i18n.js';

export const BOILER = 'boiler';
export const ZONE = 'zone';

/** Feature keys of the boiler device (part of the external ids: never rename). */
export const BOILER_FEATURE = Object.freeze({
  OUTDOOR_TEMPERATURE: 'outdoor_temperature',
  HOT_WATER: 'hot_water',
  HOT_WATER_MODE: 'hot_water_mode',
  ALARM: 'alarm',
  ALARM_ACTIVE: 'alarm_active',
  HOLIDAY: 'holiday',
  STANDBY: 'standby',
  HEATING_MONTH: 'heating_gas_month',
  HEATING_YEAR: 'heating_gas_year',
  HOT_WATER_MONTH: 'hot_water_gas_month',
  HOT_WATER_YEAR: 'hot_water_gas_year',
});

/** Feature keys of a zone device (part of the external ids: never rename). */
export const ZONE_FEATURE = Object.freeze({
  TEMPERATURE: 'temperature',
  SETPOINT: 'setpoint',
  COMFORT: 'comfort_setpoint',
  REDUCED: 'reduced_setpoint',
  FROST: 'frost_setpoint',
  PRESET: 'preset',
  OVERRIDE: 'override',
  BOOST: 'boost',
  STATUS: 'status',
});

/**
 * Gladys thermostat presets (THERMOSTAT_PRESET of the core, Gladys ≥ 5.2.0)
 * ↔ the permanent modes of a Frisquet zone (SELECTEUR). Réduit is Gladys'
 * "eco", as on a pilot wire: the lowered setpoint of the night or absence.
 */
export const PRESET = Object.freeze({ SCHEDULE: 0, FROST: 1, ECO: 3, COMFORT: 5 });
const PRESET_BY_SELECTOR = {
  [ZONE_MODE.AUTO]: PRESET.SCHEDULE,
  [ZONE_MODE.COMFORT]: PRESET.COMFORT,
  [ZONE_MODE.REDUCED]: PRESET.ECO,
  [ZONE_MODE.FROST]: PRESET.FROST,
};
export const SELECTOR_BY_PRESET = Object.fromEntries(
  Object.entries(PRESET_BY_SELECTOR).map(([selector, preset]) => [preset, Number(selector)]),
);

/** Label key (TEXT) of a running mode (MODE). */
export const MODE_TEXT = {
  [ZONE_MODE.COMFORT]: 'comfort',
  [ZONE_MODE.REDUCED]: 'reduced',
  [ZONE_MODE.FROST]: 'frost',
};

/** Ids of a boiler device. */
export function boilerIds(gladys, siteId) {
  return gladys.externalIds(BOILER, siteId);
}

/** Ids of a zone device: the boiler id and the zone id (Z1, Z2…). */
export function zoneIds(gladys, siteId, zoneId) {
  return gladys.externalIds(ZONE, `${siteId}-${zoneId}`);
}

function feature(ids, key, name, category, type, extra = {}) {
  return {
    name,
    external_id: ids.feature(key),
    selector: ids.feature(key),
    category,
    type,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: 1,
    ...extra,
  };
}

// A command whose result the integration reports itself (read back from the
// cloud, published at once after an accepted order).
const command = { read_only: false, has_feedback: true };

const temperature = (min, max) => ({ unit: UNIT.CELSIUS, min, max });
const setpoint = {
  ...command,
  unit: UNIT.CELSIUS,
  min: SETPOINT_MIN,
  max: SETPOINT_MAX,
  step: SETPOINT_STEP,
};
const kwh = { unit: UNIT.KILOWATT_HOUR, min: 0, max: 1_000_000 };
// A text: min/max are NOT NULL in Gladys (a 422 without them): 0/0.
const text = { min: 0, max: 0 };

/** Name of a boiler device: the name the user gave the installation, if any. */
export function boilerName(site, language) {
  const base = namesFor(language).boiler;
  return site.name ? `${base} ${site.name}` : `${base} Frisquet`;
}

/** Name of a zone device; prefixed with the installation when several share the account. */
export function zoneName(site, zone, language, { manySites = false } = {}) {
  const own = zone.name ?? `${namesFor(language).zone} ${zone.number}`;
  return manySites && site.name ? `${site.name} ${own}` : own;
}

/**
 * The boiler device. `consumption` is the last parsed /conso answer (null
 * while unknown): the gas features exist only for the types the cloud reports.
 */
export function buildBoilerDevice(gladys, site, { language, consumption = null }) {
  const ids = boilerIds(gladys, site.id);
  const n = namesFor(language);
  const F = BOILER_FEATURE;
  const features = [];
  if (site.outdoorTemperature !== null) {
    features.push(
      feature(
        ids,
        F.OUTDOOR_TEMPERATURE,
        n.outdoorTemperature,
        CATEGORY.TEMPERATURE_SENSOR,
        TYPE.SENSOR.DECIMAL,
        temperature(-40, 50),
      ),
    );
  }
  if (site.hotWater) {
    if (site.hotWater.modes.some((mode) => mode.key === 'stop')) {
      features.push(
        feature(
          ids,
          F.HOT_WATER,
          n.hotWater,
          CATEGORY.WATER_HEATER,
          TYPE.WATER_HEATER.BINARY,
          command,
        ),
      );
    }
    if (site.hotWater.modes.length > 0) {
      features.push(
        feature(ids, F.HOT_WATER_MODE, n.hotWaterMode, CATEGORY.TEXT, TYPE.TEXT.SELECT, {
          ...command,
          ...text,
          supported_options: site.hotWater.modes.map((mode, index) => ({
            value: mode.key,
            label: hotWaterLabel(mode, language),
            sort_order: index,
          })),
        }),
      );
    }
  }
  features.push(
    feature(ids, F.ALARM, n.alarm, CATEGORY.TEXT, TYPE.TEXT.TEXT, text),
    feature(ids, F.ALARM_ACTIVE, n.alarmActive, CATEGORY.INPUT, TYPE.SENSOR.BINARY),
    feature(ids, F.HOLIDAY, n.holiday, CATEGORY.INPUT, TYPE.SENSOR.BINARY),
    feature(ids, F.STANDBY, n.standby, CATEGORY.INPUT, TYPE.SENSOR.BINARY),
  );
  const gas = [
    [consumption?.heating, F.HEATING_MONTH, F.HEATING_YEAR, n.heatingMonth, n.heatingYear],
    [
      site.hotWater ? consumption?.hotWater : null,
      F.HOT_WATER_MONTH,
      F.HOT_WATER_YEAR,
      n.hotWaterMonth,
      n.hotWaterYear,
    ],
  ];
  for (const [totals, monthKey, yearKey, monthName, yearName] of gas) {
    if (totals) {
      // Not an energy-sensor index on purpose: Gladys attaches every index to
      // the main ELECTRIC meter, and would count this gas as electricity.
      features.push(
        feature(ids, monthKey, monthName, CATEGORY.COUNTER_SENSOR, TYPE.SENSOR.INTEGER, kwh),
        feature(ids, yearKey, yearName, CATEGORY.COUNTER_SENSOR, TYPE.SENSOR.INTEGER, kwh),
      );
    }
  }
  return {
    name: boilerName(site, language),
    external_id: ids.device,
    selector: ids.device,
    should_poll: false,
    features,
    params: [
      { name: 'BOILER_ID', value: site.id },
      ...(site.model ? [{ name: 'MODEL', value: site.model }] : []),
    ],
  };
}

/** The device of one heating zone. */
export function buildZoneDevice(gladys, site, zone, { language, manySites = false }) {
  const ids = zoneIds(gladys, site.id, zone.id);
  const n = namesFor(language);
  const F = ZONE_FEATURE;
  const presetOptions = [
    [PRESET.SCHEDULE, 'schedule'],
    [PRESET.COMFORT, 'comfort'],
    [PRESET.ECO, 'reduced'],
    [PRESET.FROST, 'frost'],
  ].map(([value, label], index) => ({
    value,
    label: pick(TEXT[label], language),
    sort_order: index,
  }));
  const features = [
    feature(
      ids,
      F.TEMPERATURE,
      n.temperature,
      CATEGORY.TEMPERATURE_SENSOR,
      TYPE.SENSOR.DECIMAL,
      temperature(-20, 50),
    ),
    feature(
      ids,
      F.SETPOINT,
      n.setpoint,
      CATEGORY.THERMOSTAT,
      TYPE.THERMOSTAT.TARGET_TEMPERATURE,
      setpoint,
    ),
    feature(
      ids,
      F.COMFORT,
      n.comfort,
      CATEGORY.THERMOSTAT,
      TYPE.THERMOSTAT.TARGET_TEMPERATURE,
      setpoint,
    ),
    feature(
      ids,
      F.REDUCED,
      n.reduced,
      CATEGORY.THERMOSTAT,
      TYPE.THERMOSTAT.TARGET_TEMPERATURE,
      setpoint,
    ),
    feature(
      ids,
      F.FROST,
      n.frost,
      CATEGORY.THERMOSTAT,
      TYPE.THERMOSTAT.TARGET_TEMPERATURE,
      setpoint,
    ),
    feature(ids, F.PRESET, n.preset, CATEGORY.THERMOSTAT, TYPE.THERMOSTAT.PRESET, {
      ...command,
      min: 0,
      max: 5,
      supported_options: presetOptions,
    }),
    feature(ids, F.OVERRIDE, n.override, CATEGORY.INPUT, TYPE.SENSOR.BINARY),
  ];
  if (zone.boostAvailable) {
    features.push(feature(ids, F.BOOST, n.boost, CATEGORY.SWITCH, TYPE.SWITCH.BINARY, command));
  }
  features.push(feature(ids, F.STATUS, n.status, CATEGORY.TEXT, TYPE.TEXT.TEXT, text));
  return {
    name: zoneName(site, zone, language, { manySites }),
    external_id: ids.device,
    selector: ids.device,
    should_poll: false,
    features,
    params: [
      { name: 'BOILER_ID', value: site.id },
      { name: 'ZONE_ID', value: zone.id },
    ],
  };
}

/** Every device of the account. */
export function buildDevices(gladys, sites, { language, consumptions = new Map() }) {
  const manySites = sites.length > 1;
  return sites.flatMap((site) => [
    buildBoilerDevice(gladys, site, { language, consumption: consumptions.get(site.id) ?? null }),
    ...site.zones.map((zone) => buildZoneDevice(gladys, site, zone, { language, manySites })),
  ]);
}

/** Label of a hot water mode, in the configured language. */
export function hotWaterLabel(mode, language) {
  const known = TEXT[`hw_${mode.key}`];
  return known ? pick(known, language) : `${pick(TEXT.mode, language)} ${mode.id}`;
}

/** The sentence describing what a zone runs now, and why. */
export function zoneStatusText(site, zone, language) {
  const modeKey = site.holiday.active ? 'frost' : MODE_TEXT[zone.mode];
  if (!modeKey) {
    return pick(TEXT.unknownMode, language);
  }
  let why = 'permanent';
  if (site.holiday.active) {
    why = 'byHoliday';
  } else if (zone.boost) {
    why = 'byBoost';
  } else if (zone.override) {
    why = 'byOverride';
  } else if (zone.selector === ZONE_MODE.AUTO) {
    why = 'byProgramme';
  }
  return `${pick(TEXT[modeKey], language)} (${pick(TEXT[why], language)})`;
}

const numeric = (id, value) =>
  value === null || value === undefined ? [] : [{ device_feature_external_id: id, state: value }];
const textual = (id, value) => [{ device_feature_external_id: id, text: value }];

/** States of a boiler device (only the features it was published with). */
export function boilerStates(gladys, site, { language, consumption = null }) {
  const ids = boilerIds(gladys, site.id);
  const F = BOILER_FEATURE;
  const states = [
    ...numeric(ids.feature(F.OUTDOOR_TEMPERATURE), site.outdoorTemperature),
    ...textual(
      ids.feature(F.ALARM),
      site.alarms.length > 0 ? site.alarms.join(' ; ') : pick(TEXT.noAlarm, language),
    ),
    ...numeric(ids.feature(F.ALARM_ACTIVE), site.alarms.length > 0 ? 1 : 0),
    ...numeric(ids.feature(F.HOLIDAY), site.holiday.active ? 1 : 0),
    ...numeric(ids.feature(F.STANDBY), site.standby ? 1 : 0),
  ];
  const hotWater = site.hotWater;
  if (hotWater?.mode) {
    if (hotWater.modes.some((mode) => mode.key === 'stop')) {
      states.push(...numeric(ids.feature(F.HOT_WATER), hotWater.mode.key === 'stop' ? 0 : 1));
    }
    states.push(...textual(ids.feature(F.HOT_WATER_MODE), hotWater.mode.key));
  }
  if (consumption?.heating) {
    states.push(
      ...numeric(ids.feature(F.HEATING_MONTH), consumption.heating.month),
      ...numeric(ids.feature(F.HEATING_YEAR), consumption.heating.year),
    );
  }
  if (site.hotWater && consumption?.hotWater) {
    states.push(
      ...numeric(ids.feature(F.HOT_WATER_MONTH), consumption.hotWater.month),
      ...numeric(ids.feature(F.HOT_WATER_YEAR), consumption.hotWater.year),
    );
  }
  return states;
}

/** States of a zone device. */
export function zoneStates(gladys, site, zone, { language }) {
  const ids = zoneIds(gladys, site.id, zone.id);
  const F = ZONE_FEATURE;
  return [
    ...numeric(ids.feature(F.TEMPERATURE), zone.temperature),
    ...numeric(ids.feature(F.SETPOINT), zone.setpoint),
    ...numeric(ids.feature(F.COMFORT), zone.comfort),
    ...numeric(ids.feature(F.REDUCED), zone.reduced),
    ...numeric(ids.feature(F.FROST), zone.frost),
    ...numeric(ids.feature(F.PRESET), PRESET_BY_SELECTOR[zone.selector]),
    ...numeric(ids.feature(F.OVERRIDE), zone.override ? 1 : 0),
    ...(zone.boostAvailable ? numeric(ids.feature(F.BOOST), zone.boost ? 1 : 0) : []),
    ...textual(ids.feature(F.STATUS), zoneStatusText(site, zone, language)),
  ];
}

/** Every state of one boiler and its zones. */
export function siteStates(gladys, site, { language, consumption = null }) {
  return [
    ...boilerStates(gladys, site, { language, consumption }),
    ...site.zones.flatMap((zone) => zoneStates(gladys, site, zone, { language })),
  ];
}
