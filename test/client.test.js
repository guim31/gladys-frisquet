// -----------------------------------------------------------------------------
// The Frisquet Connect client against the fake cloud: sign-in, the token kept
// in /data and reused, one new sign-in on a refused token, the failures sorted
// into AuthError / UnavailableError / ApiError, and no credential in a URL that
// may be logged.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFrisquetClient, redact, accountHash } from '../src/frisquet/client.js';
import { AuthError, UnavailableError, ApiError } from '../src/frisquet/errors.js';
import { createStore } from '../src/store.js';
import { EMAIL, PASSWORD, TOKEN, createFakeCloud } from './helpers/cloud.js';

async function setup({ email = EMAIL, password = PASSWORD, cloud = createFakeCloud() } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'frisquet-client-'));
  const store = createStore({ dir });
  const credentials = { email, password };
  const client = createFrisquetClient({
    credentials: () => credentials,
    store,
    fetchImpl: cloud.fetch,
    minGapMs: 0,
  });
  return {
    client,
    cloud,
    store,
    dir,
    credentials,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test('signs in with a form, like the official app, and lists the boilers', async () => {
  const { client, cloud, cleanup } = await setup();
  try {
    const sites = await client.listSites();
    assert.deepEqual(
      sites.map((site) => site.identifiant_chaudiere),
      ['00000000000001'],
    );
    const [login] = cloud.requests;
    assert.equal(login.method, 'POST');
    assert.match(login.url, /\/api\/v1\/authentifications\?app_id=/);
    assert.deepEqual(login.body, {
      locale: 'fr',
      email: EMAIL,
      password: PASSWORD,
      type_client: 'IOS',
    });
  } finally {
    await cleanup();
  }
});

test('reads a boiler with the token in the query string', async () => {
  const { client, cloud, cleanup } = await setup();
  try {
    const raw = await client.getSite('00000000000001');
    assert.equal(raw.identifiant_chaudiere, '00000000000001');
    const read = cloud.requests.at(-1);
    assert.equal(read.method, 'GET');
    assert.equal(new URL(read.url).searchParams.get('token'), TOKEN);
  } finally {
    await cleanup();
  }
});

test('asks the gas consumption for heating and hot water', async () => {
  const { client, cloud, cleanup } = await setup();
  try {
    const raw = await client.getConsumption('00000000000001');
    assert.ok(Array.isArray(raw.CHF));
    const url = new URL(cloud.requests.at(-1).url);
    assert.equal(url.pathname, '/api/v1/sites/00000000000001/conso');
    assert.deepEqual(url.searchParams.getAll('types[]'), ['CHF', 'SAN']);
  } finally {
    await cleanup();
  }
});

test('sends orders as a JSON array of string values', async () => {
  const { client, cloud, cleanup } = await setup();
  try {
    await client.sendOrders('00000000000001', [{ cle: 'CONS_CONF_Z1', valeur: '195' }]);
    const order = cloud.requests.at(-1);
    assert.equal(order.method, 'POST');
    assert.equal(new URL(order.url).pathname, '/api/v1/ordres/00000000000001');
    assert.deepEqual(order.body, [{ cle: 'CONS_CONF_Z1', valeur: '195' }]);
    assert.equal(cloud.sites.get('00000000000001').zones[0].carac_zone.CONS_CONF, 195);
  } finally {
    await cleanup();
  }
});

test('keeps the token in /data, 0600, without the e-mail nor the password', async () => {
  const { client, cloud, dir, cleanup } = await setup();
  try {
    await client.getSite('00000000000001');
    const path = join(dir, 'frisquet.json');
    const saved = await readFile(path, 'utf8');
    assert.ok(!saved.includes(EMAIL), 'the e-mail is not stored');
    assert.ok(!saved.includes(PASSWORD), 'the password is not stored');
    assert.deepEqual(JSON.parse(saved).session, { token: TOKEN, account: accountHash(EMAIL) });
    assert.equal((await stat(path)).mode & 0o777, 0o600);

    // A restart reuses it: no second sign-in.
    const again = createFrisquetClient({
      credentials: () => ({ email: EMAIL, password: PASSWORD }),
      store: createStore({ dir }),
      fetchImpl: cloud.fetch,
      minGapMs: 0,
    });
    await again.getSite('00000000000001');
    assert.equal(cloud.logins, 1);
  } finally {
    await cleanup();
  }
});

test('a token stored for another account is not used', async () => {
  const { client, cloud, credentials, cleanup } = await setup();
  try {
    await client.getSite('00000000000001');
    credentials.email = 'someone.else@example.com';
    await assert.rejects(client.getSite('00000000000001'), AuthError);
    assert.equal(cloud.logins, 2);
  } finally {
    await cleanup();
  }
});

test('a refused token means one new sign-in, then the request again', async () => {
  const { client, cloud, cleanup } = await setup();
  try {
    await client.getSite('00000000000001');
    cloud.token = 'ffffffffffffffffffffffffffffffff'; // the old one expired
    const raw = await client.getSite('00000000000001');
    assert.equal(raw.identifiant_chaudiere, '00000000000001');
    assert.equal(cloud.logins, 2);
  } finally {
    await cleanup();
  }
});

test('a token refused twice in a row is an AuthError, not a loop', async () => {
  const cloud = createFakeCloud();
  let reads = 0;
  const client = createFrisquetClient({
    credentials: () => ({ email: EMAIL, password: PASSWORD }),
    fetchImpl: async (input, init) => {
      if (String(input).includes('/sites/')) {
        reads += 1;
        return new Response('{}', { status: 401 });
      }
      return cloud.fetch(input, init);
    },
    minGapMs: 0,
  });
  await assert.rejects(client.getSite('00000000000001'), AuthError);
  assert.equal(reads, 2, 'one read, one retry after a new sign-in, no loop');
  assert.equal(cloud.logins, 2);
});

test('a wrong password is an AuthError', async () => {
  const { client, cleanup } = await setup({ password: 'wrong' });
  try {
    await assert.rejects(client.listSites(), AuthError);
  } finally {
    await cleanup();
  }
});

test('missing credentials never reach the cloud', async () => {
  const { client, cloud, cleanup } = await setup({ email: '' });
  try {
    await assert.rejects(client.listSites(), AuthError);
    assert.equal(cloud.requests.length, 0);
  } finally {
    await cleanup();
  }
});

test('5xx, 429, maintenance and network errors are transient', async () => {
  const { client, cloud, cleanup } = await setup();
  try {
    await client.listSites();
    for (const status of [429, 500, 503]) {
      cloud.failures.push({ status });
      await assert.rejects(client.getSite('00000000000001'), (err) => {
        assert.ok(err instanceof UnavailableError);
        assert.equal(err.status, status);
        return true;
      });
    }
    cloud.down = true;
    await assert.rejects(client.getSite('00000000000001'), UnavailableError);
    cloud.down = false;
    await client.reset();
    cloud.maintenance = true;
    await assert.rejects(
      client.listSites(),
      (err) => err instanceof UnavailableError && err.maintenance,
    );
  } finally {
    await cleanup();
  }
});

test('an unknown boiler is an ApiError', async () => {
  const { client, cleanup } = await setup();
  try {
    await assert.rejects(client.getSite('99999999999999'), ApiError);
  } finally {
    await cleanup();
  }
});

test('requests are spaced and never run in parallel', async () => {
  const cloud = createFakeCloud();
  const starts = [];
  let running = 0;
  let overlap = false;
  const fetchImpl = async (...args) => {
    starts.push(Date.now());
    running += 1;
    overlap ||= running > 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return cloud.fetch(...args);
  };
  const client = createFrisquetClient({
    credentials: () => ({ email: EMAIL, password: PASSWORD }),
    fetchImpl,
    minGapMs: 40,
  });
  await Promise.all([client.getSite('00000000000001'), client.getConsumption('00000000000001')]);
  assert.equal(overlap, false);
  for (let i = 1; i < starts.length; i += 1) {
    assert.ok(starts[i] - starts[i - 1] >= 35, `gap ${starts[i] - starts[i - 1]} ms`);
  }
});

test('redact() hides the token, the e-mail and the password of a URL', () => {
  assert.equal(
    redact(`https://x/api/v1/sites/1?token=${TOKEN}&a=1&email=${EMAIL}&password=x`),
    'https://x/api/v1/sites/1?token=***&a=1&email=***&password=***',
  );
});
