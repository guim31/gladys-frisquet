// -----------------------------------------------------------------------------
// The container's own polling timer.
//
// Gladys cannot poll these devices: its scheduler only knows poll frequencies
// up to one minute, and the Frisquet cloud must be read every 5 to 15 minutes
// (the Connect box relays the boiler every few minutes; reading faster returns
// the same data and risks a 429). On top of that, Gladys 5.2.x never polls a
// device created without `should_poll` (GladysAssistant/Gladys#3198). So the
// devices are published with `should_poll: false`, and the container reads the
// cloud on its own timer and pushes the states.
//
// The core's onPoll stays registered as a fallback (a device that kept polling
// fields from elsewhere): it reads the boiler only when the timer has not
// done it for 90 % of a period. One read covers a boiler and all its zones.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { pollIntervalMs } from './config.js';

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {ReturnType<import('./hub.js').createHub>} options.hub
 * @param {() => object} options.getConfig the current normalized config
 * @param {() => Promise<void>} [options.onDeviceAdded] after the states of a new device are sent
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {() => number} [options.now]
 * @param {object} [options.logger]
 */
export function createPoller({
  gladys,
  hub,
  getConfig,
  onDeviceAdded,
  timers = true,
  now = () => Date.now(),
  logger = createLogger({ name: 'poller' }),
}) {
  let timer = null;
  let stopped = true;

  const periodMs = () => pollIntervalMs(getConfig());

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await api.cycle();
      } catch (err) {
        logger.error(`Polling cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, periodMs());
  }

  const api = {
    /**
     * Register the polling handlers: the core's onPoll (fallback), and an
     * immediate publication when the user adds or updates a device — the SDK
     * forgot what it had sent for it, and Gladys dropped the states of a
     * device it did not know yet.
     */
    register() {
      gladys.onPoll((device) => api.pollFromCore(device));
      gladys.onDeviceCreated((device) => api.deviceAdded(device));
      gladys.onDeviceUpdated((device) => api.deviceAdded(device));
    },

    /** One cycle: every boiler with an added device. Never throws. */
    async cycle() {
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: poll skipped');
        return;
      }
      await hub.refreshAll();
    },

    /** (Re)start the timer: first cycle one period from now. */
    start() {
      stopped = false;
      schedule();
    },

    /** The core's onPoll (fallback): read unless the timer just did. */
    async pollFromCore(device) {
      const found = hub.locate(device.external_id);
      if (!found || !hub.canRead()) {
        return;
      }
      const last = hub.lastReadAt(found.site.id);
      if (last !== undefined && now() - last < periodMs() * 0.9) {
        logger.debug(`onPoll skipped for ${device.external_id}: read ${now() - last} ms ago`);
        return;
      }
      await hub.refreshSite(found.site.id).catch(() => {});
    },

    /** A device was just added: send all its states now. Never throws. */
    async deviceAdded(device) {
      try {
        await hub.republish(device.external_id);
        await onDeviceAdded?.();
      } catch (err) {
        logger.warn(`Publishing the states of ${device.external_id} failed (${err.message})`);
      }
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
  return api;
}
