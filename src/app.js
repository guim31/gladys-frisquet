// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client: the real one (index.js) or the
// SDK's fake Gladys (tests). Every handler is registered here, before
// connect(); the Frisquet work lives in src/hub.js and src/frisquet/.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_DATA_DIR, createStore } from './store.js';
import { normalizeConfig, isConfigured } from './config.js';
import { createFrisquetClient, accountHash } from './frisquet/client.js';
import { createHub } from './hub.js';
import { createPoller } from './poller.js';
import { createSceneActions } from './scenes.js';
import { WIDGET, createZonesWidget } from './widgets.js';
import { MESSAGES, TEXT } from './i18n.js';
import { AuthError } from './frisquet/errors.js';

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration or createFakeGladys()
 * @param {typeof fetch} [options.fetchImpl] the HTTP client (tests: a fake cloud)
 * @param {string} [options.dataDir] the writable volume
 * @param {boolean} [options.timers] run the polling and re-read timers
 * @param {number} [options.minGapMs] gap between two cloud requests
 * @param {() => number} [options.now] the clock (tests)
 * @param {object} [options.logger]
 */
export function createApp({
  gladys,
  fetchImpl,
  dataDir = process.env.FRISQUET_DATA_DIR || DEFAULT_DATA_DIR,
  timers = true,
  minGapMs,
  now = () => Date.now(),
  logger = createLogger({ name: 'frisquet' }),
}) {
  let config = normalizeConfig();
  const getConfig = () => config;
  const store = createStore({ dir: dataDir, logger });
  const client = createFrisquetClient({
    credentials: () => ({ email: config.email, password: config.password }),
    store,
    fetchImpl,
    logger,
    minGapMs,
  });
  const hub = createHub({ gladys, client, store, getConfig, timers, now, logger });
  const refreshWidget = () => gladys.requestWidgetRefresh?.(WIDGET.ZONES);
  const poller = createPoller({
    gladys,
    hub,
    getConfig,
    timers,
    now,
    logger,
    onDeviceAdded: refreshWidget,
  });
  const widget = createZonesWidget({ gladys, hub, getConfig, isConfigured });

  /** Sign in, read the boilers, publish the devices; report in the Configuration screen. */
  async function setup() {
    poller.stop();
    if (!isConfigured(config)) {
      logger.info('Not configured yet: waiting for the Frisquet Connect e-mail and password');
      await hub.setStatus(false, TEXT.notConfigured);
      return;
    }
    try {
      await hub.discover();
    } catch (err) {
      // Already reported by the hub (status + one log line); the timer retries.
      logger.debug(`Discovery failed (${err.message})`);
      if (!(err instanceof AuthError) && err.name === 'GladysApiError') {
        await hub.setStatus(false, MESSAGES.publishFailed(err.message));
      }
    }
    refreshWidget();
    poller.start();
  }

  // --- Discovery: Gladys asks for the list of devices ------------------------
  gladys.onScanRequest(async () => {
    logger.info('Scan requested: reading the Frisquet account again');
    await setup();
  });

  // --- Commands --------------------------------------------------------------
  gladys.onSetValue(async (device, feature, value) => {
    await hub.setValue(device, feature, value);
    refreshWidget();
  });

  // --- Polling (own timer, onPoll as a fallback) ------------------------------
  poller.register();

  // --- Configuration screen action -----------------------------------------
  gladys.onAction('test_connection', async () => {
    if (!isConfigured(config)) {
      return TEXT.notConfigured;
    }
    try {
      const { boilers, zones } = await hub.discover();
      return boilers === 0 ? TEXT.noBoiler : MESSAGES.testOk(boilers, zones);
    } catch (err) {
      if (err instanceof AuthError) {
        return TEXT.authFailed;
      }
      return MESSAGES.unavailable(err.message);
    }
  });

  // --- Scene actions ---------------------------------------------------------
  for (const [key, handler] of Object.entries(createSceneActions(hub))) {
    gladys.onSceneAction(key, async (fields) => {
      const outputs = await handler(fields);
      refreshWidget();
      return outputs;
    });
  }

  // --- Dashboard widget ------------------------------------------------------
  gladys.onWidgetGet(WIDGET.ZONES, (request) => widget.get(request));
  gladys.onWidgetAction(WIDGET.ZONES, (actionKey, params) => widget.action(actionKey, params));

  // --- Configuration updated by the user -------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    logger.info('Configuration updated');
    if (accountHash(previous.email) !== accountHash(config.email)) {
      await hub.reset();
    } else if (previous.password !== config.password) {
      await client.reset();
    }
    await setup();
  });

  // --- Connection lifecycle --------------------------------------------------
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await setup();
    } catch (err) {
      logger.error(`Post-connection initialization failed (${err.message})`);
      await hub.setStatus(false, TEXT.initFailed);
    }
  });

  gladys.on('disconnected', () => poller.stop());

  return {
    hub,
    poller,
    store,
    getConfig,
    async start() {
      gladys.handleShutdown(() => {
        logger.info('Shutting down');
        poller.stop();
        hub.stop();
      });
      logger.info('Starting the Frisquet Connect integration');
      await gladys.connect();
    },
    async stop() {
      poller.stop();
      hub.stop();
      await gladys.disconnect?.();
    },
  };
}
