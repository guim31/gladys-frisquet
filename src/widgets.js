// -----------------------------------------------------------------------------
// Dashboard widget "zones" (manifest `widgets`, Gladys ≥ 5.1).
//
//   - with a zone chosen in its settings: the room temperature and the setpoint
//     (live tiles), the mode and the setpoints, and four buttons — back to the
//     programme, permanent comfort, permanent reduced, and the Frisquet
//     "dérogation" (the opposite of the running period, until the next change
//     of the programme) or its end;
//   - without (or with a boiler): every zone at a glance, temperature and
//     setpoint tiles, one status line per zone.
//
// Budget of the core: 8 components, 6 tiles, 2 texts, 1 status, 4 buttons:
// a zone is heading + 2 tiles + status + 4 buttons, the overview heading +
// 6 tiles + status.
// The current choice is shown by the icon (check-circle), never by the
// `primary` style, invisible in dark mode (Gladys#3153). Action keys are
// unique within a content (the core drops a duplicate).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ZONE_MODE } from './frisquet/model.js';
import { ZONE_FEATURE, zoneIds, zoneName, zoneStatusText } from './devices.js';
import { TEXT, pick } from './i18n.js';

export const WIDGET = { ZONES: 'zones' };

const MAX_TILES = 6;

const fmt = (value) => (value === null || value === undefined ? '—' : `${value} °C`);

/** Pick the language of the request; the content is cached per language. */
const t = (key, language) => pick(TEXT[key], language);

/** Feature external ids of the devices the user added (a tile needs one). */
function createdFeatures(gladys) {
  const ids = new Set();
  for (const device of gladys.devices ?? []) {
    for (const feature of device.features ?? []) {
      ids.add(feature.external_id);
    }
  }
  return ids;
}

function tile(created, featureId, label, value, unit = '°C') {
  return created.has(featureId)
    ? { type: 'value', device_feature: featureId, label }
    : { type: 'value', value: value ?? '—', unit: value === null ? undefined : unit, label };
}

/** The buttons of one zone: programme, comfort, reduced, override. */
function zoneButtons(zoneDevice, zone, language) {
  const current = (selector) =>
    zone.selector === selector && !(selector === ZONE_MODE.AUTO && zone.override);
  const button = (key, label, icon, selector) => ({
    type: 'button',
    label,
    icon: current(selector) ? 'check-circle' : icon,
    style: 'secondary',
    action: { key, params: { zone: zoneDevice } },
  });
  const overrideButton = zone.override
    ? {
        type: 'button',
        label: t('endOverride', language),
        icon: 'x-circle',
        style: 'secondary',
        action: { key: 'end_override', params: { zone: zoneDevice } },
      }
    : {
        type: 'button',
        label: t('override', language),
        icon: 'clock',
        style: 'secondary',
        action: { key: 'override', params: { zone: zoneDevice } },
      };
  return [
    button('mode_auto', t('schedule', language), 'calendar', ZONE_MODE.AUTO),
    button('mode_comfort', t('comfort', language), 'sun', ZONE_MODE.COMFORT),
    button('mode_reduced', t('reduced', language), 'moon', ZONE_MODE.REDUCED),
    overrideButton,
  ];
}

function alarmItems(site, language) {
  return site.alarms.map((alarm) => ({
    label: t('alarm', language),
    value: alarm.slice(0, 40),
    icon: 'alert-triangle',
    color: WIDGET_COLORS.DANGER,
  }));
}

/** A zone mode in every language, for the toast of an order. */
export function modeText(mode) {
  const base = {
    auto: TEXT.schedule,
    comfort: TEXT.comfort,
    reduced: TEXT.reduced,
    frost: TEXT.frost,
    comfort_override: TEXT.comfort,
    reduced_override: TEXT.reduced,
    end_override: TEXT.endOverride,
  }[mode];
  if (mode !== 'comfort_override' && mode !== 'reduced_override') {
    return base;
  }
  return Object.fromEntries(
    Object.entries(base).map(([lang, text]) => [lang, `${text} (${TEXT.byOverride[lang]})`]),
  );
}

/** One zone in detail. */
export function buildZoneContent(gladys, site, zone, { language, manySites = false }) {
  const created = createdFeatures(gladys);
  const ids = zoneIds(gladys, site.id, zone.id);
  const tiles = [
    tile(
      created,
      ids.feature(ZONE_FEATURE.TEMPERATURE),
      t('temperatureShort', language),
      zone.temperature,
    ),
    tile(created, ids.feature(ZONE_FEATURE.SETPOINT), t('setpointShort', language), zone.setpoint),
  ];
  const items = [
    {
      label: t('mode', language),
      value: zoneStatusText(site, zone, language),
      icon: 'thermometer',
    },
    {
      label: t('setpoints', language),
      value: `${fmt(zone.comfort)} / ${fmt(zone.reduced)}`,
      icon: 'sliders',
    },
    { label: t('frost', language), value: fmt(zone.frost), icon: 'shield' },
  ];
  if (site.outdoorTemperature !== null) {
    items.push({
      label: t('outdoorShort', language),
      value: fmt(site.outdoorTemperature),
      icon: 'cloud',
    });
  }
  if (site.holiday.active) {
    items.push({
      label: t('holiday', language),
      value: t('frost', language),
      icon: 'briefcase',
      color: WIDGET_COLORS.INFO,
    });
  }
  items.push(...alarmItems(site, language));
  return {
    ttl_seconds: 300,
    components: [
      { type: 'text', variant: 'heading', text: zoneName(site, zone, language, { manySites }) },
      ...tiles,
      { type: 'status', items: items.slice(0, 10) },
      ...zoneButtons(ids.device, zone, language),
    ],
  };
}

/** Every zone of the given boilers at a glance. */
export function buildOverviewContent(gladys, sites, { language }) {
  const created = createdFeatures(gladys);
  const manySites = sites.length > 1;
  const zones = sites.flatMap((site) => site.zones.map((zone) => ({ site, zone })));
  const tiles = [];
  for (const { site, zone } of zones) {
    if (tiles.length + 2 > MAX_TILES) {
      break;
    }
    const ids = zoneIds(gladys, site.id, zone.id);
    const name = zoneName(site, zone, language, { manySites }).slice(0, 24);
    tiles.push(
      tile(created, ids.feature(ZONE_FEATURE.TEMPERATURE), name, zone.temperature),
      tile(
        created,
        ids.feature(ZONE_FEATURE.SETPOINT),
        `${t('setpointShort', language)}`.slice(0, 24),
        zone.setpoint,
      ),
    );
  }
  const items = zones.map(({ site, zone }) => ({
    label: zoneName(site, zone, language, { manySites }).slice(0, 40),
    value: zoneStatusText(site, zone, language).slice(0, 40),
    icon: 'thermometer',
  }));
  for (const site of sites) {
    items.push(...alarmItems(site, language));
  }
  return {
    ttl_seconds: 300,
    components: [
      { type: 'text', variant: 'heading', text: t('zones', language) },
      ...tiles,
      { type: 'status', items: items.slice(0, 10) },
    ],
  };
}

/** A content made of one sentence (not configured, nothing yet, cloud down). */
export function messageContent(text) {
  return { ttl_seconds: 60, components: [{ type: 'text', variant: 'body', text }] };
}

/**
 * @param {object} options
 * @param {object} options.gladys
 * @param {ReturnType<import('./hub.js').createHub>} options.hub
 * @param {() => object} options.getConfig
 * @param {(config: object) => boolean} options.isConfigured
 */
export function createZonesWidget({ gladys, hub, getConfig, isConfigured }) {
  return {
    async get({ settings = {}, language = 'en' } = {}) {
      if (!isConfigured(getConfig())) {
        return messageContent(TEXT.notConfigured);
      }
      const sites = hub.sites();
      const chosen = settings.zone ? hub.locate(String(settings.zone)) : null;
      if (chosen?.zone) {
        return buildZoneContent(gladys, chosen.site, chosen.zone, {
          language,
          manySites: sites.length > 1,
        });
      }
      const shown = chosen ? [chosen.site] : sites;
      if (shown.every((site) => site.zones.length === 0)) {
        return messageContent(TEXT.noZone);
      }
      return buildOverviewContent(gladys, shown, { language });
    },

    async action(actionKey, params = {}) {
      const found = hub.locate(String(params.zone));
      if (!found?.zone) {
        throw new Error('This zone is no longer known: refresh the widget');
      }
      const { site, zone } = found;
      const mode =
        {
          mode_auto: 'auto',
          mode_comfort: 'comfort',
          mode_reduced: 'reduced',
          end_override: 'end_override',
        }[actionKey] ??
        (actionKey === 'override'
          ? zone.mode === ZONE_MODE.COMFORT
            ? 'reduced_override'
            : 'comfort_override'
          : null);
      if (!mode) {
        throw new Error(`Unknown action ${actionKey}`);
      }
      await hub.setZoneMode(site, zone, mode);
      return hub.orderMessage(site, zone, modeText(mode));
    },
  };
}
