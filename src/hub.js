// -----------------------------------------------------------------------------
// The integration's view of the Frisquet installations: it reads the cloud,
// keeps the last state of every boiler, publishes what changed to Gladys, and
// turns the user's commands into orders.
//
// The Frisquet cloud is slow: the Connect box relays the boiler by radio every
// few minutes. An accepted order is visible in the next read for the values
// it writes (SELECTEUR, CONS_*), while the values the boiler derives (MODE,
// CAMB) follow at its next uplink. So after an order the hub publishes the
// expected values at once, then reads the boiler again after RECHECK_DELAYS_MS.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { AuthError, UnavailableError } from './frisquet/errors.js';
import {
  ZONE_MODE,
  activeSetpointKey,
  orders,
  parseConsumption,
  parseSite,
} from './frisquet/model.js';
import {
  BOILER,
  BOILER_FEATURE,
  PRESET,
  SELECTOR_BY_PRESET,
  ZONE,
  ZONE_FEATURE,
  boilerIds,
  buildDevices,
  siteStates,
  zoneIds,
  zoneName,
} from './devices.js';
import { createIssueLog } from './issues.js';
import { TEXT, MESSAGES } from './i18n.js';

/** Re-read a boiler this long after an order (the box relays by radio). */
export const RECHECK_DELAYS_MS = [20_000, 180_000];
/** Gas consumption is monthly: read it every 6 hours. */
export const CONSUMPTION_PERIOD_MS = 6 * 3_600_000;
/** Re-publish an unchanged value at least this often (Gladys flags 48 h old values). */
export const HEARTBEAT_MS = 6 * 3_600_000;
/** After a refused password, wait this long before signing in again on our own. */
export const AUTH_RETRY_MS = 30 * 60_000;

export const SCENE_TRIGGER = { ALARM_RAISED: 'alarm_raised' };
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGER);

/** Zone modes a scene or the widget can ask for. */
export const ZONE_MODES = [
  'auto',
  'comfort',
  'reduced',
  'frost',
  'comfort_override',
  'reduced_override',
  'end_override',
];

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {ReturnType<import('./frisquet/client.js').createFrisquetClient>} options.client
 * @param {{ get: Function, set: Function }} options.store
 * @param {() => object} options.getConfig the current normalized config
 * @param {boolean} [options.timers] schedule the re-reads after an order
 * @param {() => number} [options.now]
 * @param {object} [options.logger]
 */
export function createHub({
  gladys,
  client,
  store,
  getConfig,
  timers = true,
  now = () => Date.now(),
  logger = createLogger({ name: 'frisquet' }),
}) {
  const issues = createIssueLog(logger);
  /** Parsed state of each boiler, by boiler id. */
  const sites = new Map();
  /** Parsed /conso answer of each boiler, and when it was read. */
  const consumptions = new Map();
  const consumptionReadAt = new Map();
  /** When each boiler was last read (start of the read). */
  const readAt = new Map();
  /** Reads in progress, by boiler id. */
  const inFlight = new Map();
  /** Pending re-reads after an order, by boiler id. */
  const rechecks = new Map();
  let siteIds = [];
  let discovered = false;
  let authBlockedUntil = 0;
  let status = null; // last connection status sent, to send it once

  const language = () => getConfig().language;

  async function setStatus(connected, message) {
    const key = JSON.stringify([connected, message?.en ?? null]);
    if (key === status) {
      return;
    }
    status = key;
    await gladys.setConnectionStatus(connected, message).catch((err) => {
      logger.debug(`setConnectionStatus failed (${err.message})`);
      status = null;
    });
  }

  /** What to tell the user about a cloud failure, and how loudly to log it. */
  async function reportFailure(key, err) {
    if (err instanceof AuthError) {
      authBlockedUntil = now() + AUTH_RETRY_MS;
      issues.fail('auth', `Frisquet Connect refused the credentials (${err.message})`);
      await setStatus(false, TEXT.authFailed);
      return;
    }
    if (err instanceof UnavailableError && err.maintenance) {
      issues.fail('maintenance', 'Frisquet Connect is under maintenance');
      await setStatus(false, TEXT.maintenance);
      return;
    }
    issues.fail(key, `${key}: ${err.message}`);
    if (err instanceof UnavailableError) {
      await setStatus(false, MESSAGES.unavailable(err.message));
    }
  }

  async function reportSuccess(key) {
    issues.ok('auth', 'Frisquet Connect accepts the credentials again');
    issues.ok('maintenance', 'Frisquet Connect maintenance is over');
    issues.ok(key, `${key}: works again`);
    authBlockedUntil = 0;
    await setStatus(true);
  }

  /** Today in the Gladys time zone (the supervisor sets TZ). */
  function today() {
    const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'numeric' })
      .formatToParts(new Date(now()))
      .reduce((acc, part) => ({ ...acc, [part.type]: Number(part.value) }), {});
    return { year: parts.year, month: parts.month };
  }

  /** The boilers whose boiler or zone device the user added to Gladys. */
  function createdSiteIds() {
    const created = new Set((gladys.devices ?? []).map((device) => device.external_id));
    return siteIds.filter((id) => {
      if (created.has(boilerIds(gladys, id).device)) {
        return true;
      }
      const site = sites.get(id);
      return site?.zones.some((zone) => created.has(zoneIds(gladys, id, zone.id).device)) ?? false;
    });
  }

  async function readConsumption(siteId, { force = false } = {}) {
    const last = consumptionReadAt.get(siteId);
    if (!force && last !== undefined && now() - last < CONSUMPTION_PERIOD_MS) {
      return;
    }
    consumptionReadAt.set(siteId, now());
    try {
      const raw = await client.getConsumption(siteId);
      consumptions.set(siteId, parseConsumption(raw, today()));
      issues.ok(`consumption ${siteId}`, 'Gas consumption readable again');
    } catch (err) {
      // Not every account has it: the boiler keeps working without.
      if (err instanceof AuthError) {
        throw err;
      }
      issues.fail(`consumption ${siteId}`, `Gas consumption unavailable (${err.message})`);
    }
  }

  async function publishSite(site) {
    const created = new Set((gladys.devices ?? []).map((device) => device.external_id));
    const states = siteStates(gladys, site, {
      language: language(),
      consumption: consumptions.get(site.id) ?? null,
    }).filter((state) => created.has(state.device_feature_external_id.replace(/:[^:]+$/, '')));
    if (states.length === 0) {
      return;
    }
    const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    if (count > 0) {
      logger.debug(`${site.id}: ${count} state(s) published`);
    }
  }

  async function checkAlarms(site) {
    const known = (await store.get('alarms')) ?? {};
    const before = known[site.id];
    if (JSON.stringify(before) === JSON.stringify(site.alarms)) {
      return;
    }
    // The first read of a boiler sets the baseline: a restart or a first
    // install does not announce an alarm that was already there.
    if (Array.isArray(before)) {
      for (const alarm of site.alarms.filter((name) => !before.includes(name))) {
        logger.warn(`${site.name ?? site.id}: alarm "${alarm}"`);
        await gladys
          .publishSceneEvent(SCENE_TRIGGER.ALARM_RAISED, {
            boiler: boilerIds(gladys, site.id).device,
            alarm,
          })
          .catch((err) => logger.warn(`Alarm scene trigger refused (${err.message})`));
      }
      for (const alarm of before.filter((name) => !site.alarms.includes(name))) {
        logger.info(`${site.name ?? site.id}: alarm "${alarm}" cleared`);
      }
    }
    await store.set('alarms', { ...known, [site.id]: site.alarms });
  }

  /** The last hot water mode that was not "stop", for "turn it back on". */
  async function rememberHotWater(site) {
    const key = site.hotWater?.mode?.key;
    if (key && key !== 'stop') {
      const remembered = (await store.get('hotWater')) ?? {};
      await store.set('hotWater', { ...remembered, [site.id]: key });
    }
  }

  /** Read one boiler (and its gas use when due), publish what changed. */
  async function readSite(siteId, { forceConsumption = false } = {}) {
    const running = inFlight.get(siteId);
    if (running) {
      return running;
    }
    readAt.set(siteId, now());
    const run = (async () => {
      const site = parseSite(await client.getSite(siteId));
      await readConsumption(siteId, { force: forceConsumption });
      sites.set(siteId, site);
      await checkAlarms(site);
      await rememberHotWater(site);
      await publishSite(site);
      return site;
    })();
    inFlight.set(siteId, run);
    try {
      return await run;
    } finally {
      inFlight.delete(siteId);
    }
  }

  function scheduleRecheck(siteId) {
    if (!timers) {
      return;
    }
    for (const timer of rechecks.get(siteId) ?? []) {
      clearTimeout(timer);
    }
    rechecks.set(
      siteId,
      RECHECK_DELAYS_MS.map((delay) =>
        setTimeout(() => {
          api.refreshSite(siteId).catch(() => {});
        }, delay),
      ),
    );
  }

  /** Where a device external id points: its boiler, and its zone if any. */
  function locate(deviceExternalId) {
    for (const site of sites.values()) {
      if (boilerIds(gladys, site.id).device === deviceExternalId) {
        return { site, zone: null };
      }
      for (const zone of site.zones) {
        if (zoneIds(gladys, site.id, zone.id).device === deviceExternalId) {
          return { site, zone };
        }
      }
    }
    return null;
  }

  /** Send orders, apply their expected effect, publish it, re-read later. */
  async function send(site, list, applyLocally) {
    try {
      await client.sendOrders(site.id, list);
      await reportSuccess('orders');
    } catch (err) {
      await reportFailure('orders', err);
      throw err;
    }
    applyLocally?.();
    await publishSite(site).catch((err) => logger.warn(`Publishing failed (${err.message})`));
    scheduleRecheck(site.id);
  }

  const zoneLabel = (site, zone) =>
    zoneName(site, zone, language(), { manySites: siteIds.length > 1 });

  const api = {
    /** The parsed boilers, in the account order. */
    sites() {
      return siteIds.map((id) => sites.get(id)).filter(Boolean);
    },

    locate,

    /** Tell the Configuration screen (sent once per change). */
    setStatus,

    /** Whether the cloud may be called now (not after a refused password). */
    canRead() {
      return now() >= authBlockedUntil;
    },

    /** When a boiler was last read (ms since epoch), undefined if never. */
    lastReadAt(siteId) {
      return readAt.get(siteId);
    },

    /**
     * Sign in, read every boiler and its gas use, publish the devices.
     * @returns {Promise<{ boilers: number, zones: number }>}
     * @throws the cloud error (also reported in the Configuration screen)
     */
    async discover() {
      try {
        const list = await client.listSites();
        siteIds = list.map((entry) => String(entry.identifiant_chaudiere)).filter(Boolean);
        if (siteIds.length === 0) {
          await setStatus(false, TEXT.noBoiler);
          await gladys.publishDiscoveredDevices([]);
          return { boilers: 0, zones: 0 };
        }
        for (const id of siteIds) {
          sites.set(id, parseSite(await client.getSite(id)));
          readAt.set(id, now());
          await readConsumption(id, { force: true });
        }
        discovered = true;
        await reportSuccess('discovery');
      } catch (err) {
        await reportFailure('discovery', err);
        throw err;
      }
      const all = api.sites();
      await gladys.publishDiscoveredDevices(
        buildDevices(gladys, all, { language: language(), consumptions }),
      );
      for (const site of all) {
        await checkAlarms(site);
        await rememberHotWater(site);
        await publishSite(site);
      }
      const zones = all.reduce((sum, site) => sum + site.zones.length, 0);
      logger.info(`Frisquet Connect: ${all.length} boiler(s), ${zones} zone(s)`);
      return { boilers: all.length, zones };
    },

    /** Republish the devices from what is known (scan request). */
    async publishDevices() {
      await gladys.publishDiscoveredDevices(
        buildDevices(gladys, api.sites(), { language: language(), consumptions }),
      );
    },

    /**
     * Read one boiler now. Errors are reported (once while they last) and
     * thrown.
     */
    async refreshSite(siteId) {
      try {
        const site = await readSite(siteId);
        await reportSuccess(`read ${siteId}`);
        return site;
      } catch (err) {
        await reportFailure(`read ${siteId}`, err);
        throw err;
      }
    },

    /** One polling cycle: every boiler the user added to Gladys. Never throws. */
    async refreshAll() {
      if (!api.canRead()) {
        logger.debug('Credentials refused: waiting before signing in again');
        return;
      }
      if (!discovered) {
        // The cloud was down when the integration started: try again.
        await api.discover().catch(() => {});
        return;
      }
      for (const id of createdSiteIds()) {
        await api.refreshSite(id).catch(() => {});
      }
    },

    /**
     * Publish the states of the boiler a device belongs to (device just
     * added: the SDK forgot what it had sent for it, so all of it goes).
     */
    async republish(deviceExternalId) {
      const found = locate(deviceExternalId);
      if (found) {
        await publishSite(found.site);
      }
    },

    /**
     * A command from Gladys on a feature of one of the devices.
     * @param {{ external_id: string }} device
     * @param {{ external_id: string }} deviceFeature
     * @param {number|string} value
     */
    async setValue(device, deviceFeature, value) {
      const found = locate(device.external_id);
      if (!found) {
        throw new Error(`Unknown device ${device.external_id}: refresh the devices first`);
      }
      const { site, zone } = found;
      const key = deviceFeature.external_id.slice(device.external_id.length + 1);
      if (zone) {
        return api.setZoneFeature(site, zone, key, value);
      }
      if (key === BOILER_FEATURE.HOT_WATER) {
        return api.setHotWater(site, Number(value) === 1);
      }
      if (key === BOILER_FEATURE.HOT_WATER_MODE) {
        return api.setHotWaterMode(site, String(value));
      }
      throw new Error(`${key} is read-only`);
    },

    async setZoneFeature(site, zone, key, value) {
      const F = ZONE_FEATURE;
      const setpoints = {
        [F.COMFORT]: ['CONS_CONF', 'comfort'],
        [F.REDUCED]: ['CONS_RED', 'reduced'],
        [F.FROST]: ['CONS_HG', 'frost'],
      };
      if (key === F.SETPOINT || setpoints[key]) {
        const celsius = Number(value);
        if (!Number.isFinite(celsius)) {
          throw new Error(`Invalid setpoint ${value}`);
        }
        const orderKey =
          key === F.SETPOINT ? activeSetpointKey(zone, site.holiday.active) : setpoints[key][0];
        const list = orders.setpoint(zone, orderKey, celsius);
        const applied = Number(list[0].valeur) / 10;
        logger.info(`${zoneLabel(site, zone)}: ${orderKey} → ${applied} °C`);
        return send(site, list, () => {
          const field = { CONS_CONF: 'comfort', CONS_RED: 'reduced', CONS_HG: 'frost' }[orderKey];
          zone[field] = applied;
          if (orderKey === activeSetpointKey(zone, site.holiday.active)) {
            zone.setpoint = applied;
          }
        });
      }
      if (key === F.PRESET) {
        const selector = SELECTOR_BY_PRESET[Number(value)];
        if (selector === undefined) {
          throw new Error(`Unsupported preset ${value}`);
        }
        return api.setZoneMode(
          site,
          zone,
          { [PRESET.SCHEDULE]: 'auto', [PRESET.COMFORT]: 'comfort', [PRESET.ECO]: 'reduced' }[
            Number(value)
          ] ?? 'frost',
        );
      }
      if (key === F.BOOST && zone.boostAvailable) {
        const on = Number(value) === 1;
        logger.info(`${zoneLabel(site, zone)}: boost ${on ? 'on' : 'off'}`);
        return send(site, orders.boost(zone, on), () => {
          zone.boost = on;
        });
      }
      throw new Error(`${key} is read-only`);
    },

    /**
     * Change the mode of a zone (feature, widget, scene).
     * @param {string} mode one of ZONE_MODES
     */
    async setZoneMode(site, zone, mode) {
      const selectors = {
        auto: ZONE_MODE.AUTO,
        comfort: ZONE_MODE.COMFORT,
        reduced: ZONE_MODE.REDUCED,
        frost: ZONE_MODE.FROST,
      };
      logger.info(`${zoneLabel(site, zone)}: mode ${mode}`);
      if (selectors[mode] !== undefined) {
        const selector = selectors[mode];
        return send(site, orders.selector(zone, selector), () => {
          zone.selector = selector;
          if (selector === ZONE_MODE.AUTO) {
            zone.override = false;
          } else {
            // A permanent mode runs at once: its setpoint applies.
            zone.mode = selector;
            zone.setpoint =
              { [ZONE_MODE.COMFORT]: zone.comfort, [ZONE_MODE.REDUCED]: zone.reduced }[selector] ??
              zone.frost;
          }
        });
      }
      const overrides = {
        comfort_override: ZONE_MODE.COMFORT,
        reduced_override: ZONE_MODE.REDUCED,
        end_override: 0,
      };
      if (overrides[mode] !== undefined) {
        const list = [];
        // An override only exists on top of the programme.
        if (overrides[mode] !== 0 && zone.selector !== ZONE_MODE.AUTO) {
          list.push(...orders.selector(zone, ZONE_MODE.AUTO));
        }
        list.push(...orders.override(overrides[mode]));
        return send(site, list, () => {
          zone.selector = ZONE_MODE.AUTO;
          zone.override = overrides[mode] !== 0;
          if (zone.override) {
            zone.mode = overrides[mode];
            zone.setpoint = overrides[mode] === ZONE_MODE.COMFORT ? zone.comfort : zone.reduced;
          }
        });
      }
      throw new Error(`Unknown zone mode ${mode}`);
    },

    /** Hot water on (back to the last mode that was not "stop") or off ("stop"). */
    async setHotWater(site, on) {
      const hotWater = site.hotWater;
      const stop = hotWater?.modes.find((mode) => mode.key === 'stop');
      if (!stop) {
        throw new Error('This boiler offers no hot water to switch');
      }
      if (!on) {
        return api.setHotWaterMode(site, 'stop');
      }
      const remembered = ((await store.get('hotWater')) ?? {})[site.id];
      const fallback =
        hotWater.modes.find((mode) => mode.key === 'eco') ??
        hotWater.modes.find((mode) => mode.key !== 'stop');
      const target =
        hotWater.modes.find((mode) => mode.key === remembered && mode.key !== 'stop') ?? fallback;
      return api.setHotWaterMode(site, target.key);
    },

    /** @param {string} key one of the boiler's hot water mode keys */
    async setHotWaterMode(site, key) {
      const hotWater = site.hotWater;
      const target = hotWater?.modes.find((mode) => mode.key === key);
      if (!target) {
        throw new Error(`Hot water mode ${key} is not offered by this boiler`);
      }
      logger.info(`${site.name ?? site.id}: hot water mode ${key}`);
      await rememberHotWater(site);
      return send(site, orders.hotWater(hotWater, target.id), () => {
        hotWater.mode = target;
      });
    },

    /** A short sentence for an order accepted from the widget or a scene. */
    orderMessage(site, zone, what) {
      const target = zone ? zoneLabel(site, zone) : (site.name ?? 'Frisquet');
      return MESSAGES.orderSent(target, what);
    },

    /** Forget everything (new account). */
    async reset() {
      api.stop();
      sites.clear();
      consumptions.clear();
      consumptionReadAt.clear();
      readAt.clear();
      siteIds = [];
      discovered = false;
      authBlockedUntil = 0;
      status = null;
      await client.reset();
    },

    stop() {
      for (const list of rechecks.values()) {
        list.forEach((timer) => clearTimeout(timer));
      }
      rechecks.clear();
    },

    /** Device type of an external id: 'boiler', 'zone' or null. */
    kindOf(deviceExternalId) {
      const found = locate(deviceExternalId);
      if (!found) {
        return null;
      }
      return found.zone ? ZONE : BOILER;
    },
  };
  return api;
}
