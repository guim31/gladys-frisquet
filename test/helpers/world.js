// -----------------------------------------------------------------------------
// The integration running on the SDK's fake Gladys, against the fake cloud,
// with its /data in a temporary folder and its logs captured.
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { EMAIL, PASSWORD, createFakeCloud } from './cloud.js';

/** A logger that records every line, by level. */
export function createRecordingLogger() {
  const lines = [];
  const record =
    (level) =>
    (...args) =>
      lines.push({
        level,
        text: args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' '),
      });
  const logger = {
    lines,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    at: (level) => lines.filter((line) => line.level === level).map((line) => line.text),
  };
  logger.child = () => logger;
  return logger;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] merged over a valid configuration
 * @param {boolean} [options.addDevices] add every discovered device to Gladys
 * @param {Parameters<typeof createFakeCloud>[0]} [options.cloud]
 * @param {string} [options.dataDir] reuse a /data folder (restart)
 * @param {ReturnType<typeof createFakeCloud>} [options.fakeCloud] share a cloud (restart)
 * @param {{ now: number }} [options.clock] a clock the test moves
 * @param {boolean} [options.timers] run the real timers (with mocked setTimeout)
 */
export async function createWorld({
  config = {},
  addDevices = true,
  cloud: cloudOptions,
  dataDir,
  fakeCloud,
  clock,
  timers = false,
} = {}) {
  const cloud = fakeCloud ?? createFakeCloud(cloudOptions);
  const dir = dataDir ?? (await mkdtemp(join(tmpdir(), 'frisquet-')));
  const logger = createRecordingLogger();
  const gladys = createFakeGladys({
    config: { email: EMAIL, password: PASSWORD, ...config },
  });
  const app = createApp({
    gladys,
    fetchImpl: cloud.fetch,
    dataDir: dir,
    timers,
    minGapMs: 0,
    now: clock ? () => clock.now : undefined,
    logger,
  });
  await gladys.connect();
  if (addDevices) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
  }
  return {
    gladys,
    fake: gladys.fake,
    app,
    cloud,
    logger,
    dir,
    device: (externalIdEnd) =>
      gladys.fake.discoveredDevices.find((d) => d.external_id.endsWith(externalIdEnd)),
    async stop({ keepData = false } = {}) {
      await app.stop();
      if (!keepData && !dataDir) {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
