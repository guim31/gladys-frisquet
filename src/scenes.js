// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys ≥ 5.1).
//
//   - set_zone_mode     : programme, permanent comfort / reduced / frost
//                         protection, or a temporary override, on one zone or
//                         on every zone of a boiler;
//   - set_hot_water_mode: hot water mode of a boiler, "on" restoring the last
//                         mode that was not "stop".
//
// The setpoints need no action of their own: they are device features, which
// the core's "set a device value" action already drives. The trigger
// (`alarm_raised`) is fired by the hub when a new alarm appears.
// Keys are forever once published.
// -----------------------------------------------------------------------------

import { ZONE_MODES } from './hub.js';

export const HOT_WATER_TARGETS = [
  'on',
  'stop',
  'max',
  'eco',
  'eco_timer',
  'eco_plus',
  'eco_plus_timer',
];

/** The zones a device stands for: itself, or every zone of a boiler. */
function zonesOf(hub, deviceExternalId) {
  const found = hub.locate(deviceExternalId);
  if (!found) {
    throw new Error(`Unknown Frisquet device ${deviceExternalId}`);
  }
  return { site: found.site, zones: found.zone ? [found.zone] : found.site.zones };
}

export function createSceneActions(hub) {
  return {
    async set_zone_mode(fields) {
      const mode = String(fields.mode);
      if (!ZONE_MODES.includes(mode)) {
        throw new Error(`Unknown zone mode ${mode}`);
      }
      const { site, zones } = zonesOf(hub, String(fields.zone));
      // The override order carries no zone: once is enough for a boiler.
      const once = mode.endsWith('override') ? zones.slice(0, 1) : zones;
      for (const zone of once) {
        await hub.setZoneMode(site, zone, mode);
      }
      return { mode };
    },

    async set_hot_water_mode(fields) {
      const target = String(fields.mode);
      if (!HOT_WATER_TARGETS.includes(target)) {
        throw new Error(`Unknown hot water mode ${target}`);
      }
      const { site } = zonesOf(hub, String(fields.boiler));
      if (target === 'on' || target === 'stop') {
        await hub.setHotWater(site, target === 'on');
      } else {
        await hub.setHotWaterMode(site, target);
      }
      return { mode: site.hotWater?.mode?.key ?? target };
    },
  };
}

/** The scene action keys, for the manifest test. */
export const SCENE_ACTION_KEYS = Object.keys(createSceneActions(null));
