// -----------------------------------------------------------------------------
// What the integration keeps between two restarts, in /data/frisquet.json —
// the only writable place of the container (the rootfs is read-only):
//   - session   : the Frisquet Connect token and a hash of the e-mail it
//                 belongs to (never the e-mail nor the password, which stay
//                 in the Gladys configuration);
//   - hotWater  : per boiler, the last hot water mode that was not "Stop", so
//                 "turn the hot water back on" restores it;
//   - alarms    : per boiler, the alarms already seen, so a restart does not
//                 fire the "alarm raised" scene trigger again.
// The file is written 0600 and replaced atomically (write, then rename).
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_DATA_DIR = '/data';
const FILE_NAME = 'frisquet.json';

/**
 * @param {{ dir?: string, logger?: { debug: Function, warn: Function } }} [options]
 */
export function createStore({ dir = DEFAULT_DATA_DIR, logger } = {}) {
  const path = join(dir, FILE_NAME);
  let data = null;
  let writing = Promise.resolve();

  async function load() {
    if (data) {
      return data;
    }
    try {
      data = JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger?.warn(`Stored state unreadable, starting afresh (${err.message})`);
      }
      data = {};
    }
    return data;
  }

  async function save() {
    const snapshot = JSON.stringify(data, null, 2);
    // Writes are chained: two quick saves never interleave their renames.
    writing = writing.then(async () => {
      try {
        await mkdir(dir, { recursive: true });
        const tmp = `${path}.tmp`;
        await writeFile(tmp, snapshot, { mode: 0o600 });
        await rename(tmp, path);
      } catch (err) {
        // A read-only or full volume must not stop the heating control.
        logger?.warn(`Could not save the state to ${dir} (${err.message})`);
      }
    });
    return writing;
  }

  return {
    /** @param {string} key */
    async get(key) {
      return (await load())[key];
    },

    /**
     * @param {string} key
     * @param {unknown} value undefined removes the key
     */
    async set(key, value) {
      await load();
      if (JSON.stringify(data[key]) === JSON.stringify(value)) {
        return;
      }
      if (value === undefined) {
        delete data[key];
      } else {
        data[key] = value;
      }
      await save();
    },
  };
}
