// -----------------------------------------------------------------------------
// Client of the Frisquet Connect cloud — the private API behind the official
// "Frisquet Connect" app (no public documentation). Reconstructed from the
// community projects credited in the README: mgcrea/homebridge-frisquet-connect
// (MIT, protocol notes and a probe run on a real boiler), and the Home
// Assistant integrations TheGui01/Frisquet-connect-for-home-assistant and
// home-assistant-custom-components/frisquet-connect (MIT).
//
//   POST /authentifications?app_id=…        sign in → token + the account's boilers
//   GET  /sites/{boiler}?token=…            the whole state of one boiler
//   GET  /sites/{boiler}/conso?token=…      monthly kWh, heating (CHF) and hot water (SAN)
//   POST /ordres/{boiler}?token=…           [{ cle, valeur }] — values are strings
//
// The token travels in the query string (the API has no header form): every
// URL that reaches a log line goes through redact(). It has no announced
// lifetime: a 401/403 drops it, signs in again and retries once.
//
// The cloud is slow by design (the Connect box relays to the boiler by radio,
// every few minutes) and throttles: requests are serialized with a minimum
// gap, and a 429 is a transient failure, never a reason to retry at once.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { ApiError, AuthError, UnavailableError } from './errors.js';

export const BASE_URL = 'https://fcutappli.frisquet.com/api/v1';

// Identifies the build of the official iOS app (not a secret), from the
// capture documented by homebridge-frisquet-connect.
export const APP_ID = 'fsmFOoGzGEz0q6MPLtvA_z';
const USER_AGENT =
  'Frisquet Connect/2.6.1 (com.frisquetsa.connect; build:54; iOS 26.1.0) Alamofire/5.9.1';

export const REQUEST_TIMEOUT_MS = 30_000;
export const MIN_REQUEST_GAP_MS = 500;

/**
 * Strip the credentials from a text about to be logged or shown.
 * @param {string} text
 */
export function redact(text) {
  return String(text).replace(/([?&](?:token|password|email)=)[^&\s]*/gi, '$1***');
}

/**
 * A stable fingerprint of the account, to tell whether a stored token belongs
 * to the e-mail currently configured — without storing the e-mail.
 * @param {string} email
 */
export function accountHash(email) {
  return createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

/**
 * @param {object} options
 * @param {() => { email: string, password: string }} options.credentials read at each login
 * @param {{ get: Function, set: Function }} [options.store] keeps the token across restarts
 * @param {typeof fetch} [options.fetchImpl]
 * @param {{ debug: Function }} [options.logger]
 * @param {number} [options.minGapMs]
 */
export function createFrisquetClient({
  credentials,
  store,
  fetchImpl = globalThis.fetch,
  logger,
  minGapMs = MIN_REQUEST_GAP_MS,
}) {
  let session = null; // { token, account }
  let loginInFlight = null;
  let queue = Promise.resolve();
  let lastRequestAt = 0;

  /** Serialize the requests, at least minGapMs apart (start to start). */
  function paced(task) {
    const run = queue.then(async () => {
      const wait = lastRequestAt + minGapMs - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      lastRequestAt = Date.now();
      return task();
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function send(url, init) {
    try {
      return await paced(() =>
        fetchImpl(url, {
          ...init,
          headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...init.headers },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }),
      );
    } catch (err) {
      // DNS, TLS, reset, timeout: the cloud is unreachable for now.
      throw new UnavailableError(`Frisquet Connect unreachable (${redact(err.message)})`);
    }
  }

  async function readJson(response, what) {
    const text = await response.text();
    if (text === '') {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(`${what}: the answer is not JSON`, response.status);
    }
  }

  function failOnStatus(response, what) {
    if (response.status === 429 || response.status >= 500) {
      throw new UnavailableError(`${what}: Frisquet Connect answered HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new ApiError(
        `${what}: Frisquet Connect answered HTTP ${response.status}`,
        response.status,
      );
    }
  }

  async function storedSession(account) {
    if (!store) {
      return null;
    }
    const saved = await store.get('session');
    return saved?.account === account && typeof saved.token === 'string' ? saved : null;
  }

  async function login() {
    const { email, password } = credentials();
    if (!email || !password) {
      throw new AuthError('E-mail or password missing in the configuration');
    }
    const account = accountHash(email);
    const url = new URL(`${BASE_URL}/authentifications`);
    url.searchParams.set('app_id', APP_ID);
    logger?.debug('Signing in to Frisquet Connect');
    const response = await send(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ locale: 'fr', email, password, type_client: 'IOS' }),
    });
    if ([400, 401, 403, 404].includes(response.status)) {
      throw new AuthError();
    }
    failOnStatus(response, 'Sign-in');
    const body = await readJson(response, 'Sign-in');
    if (body?.maintenance_en_cours === true) {
      throw new UnavailableError('Frisquet Connect is under maintenance', { maintenance: true });
    }
    if (typeof body?.token !== 'string' || body.token === '') {
      throw new ApiError('Sign-in: no token in the answer', response.status);
    }
    session = { token: body.token, account };
    await store?.set('session', session);
    return { session, sites: body.utilisateur?.sites ?? [] };
  }

  /** The current token: in memory, else stored for this account, else a login. */
  async function token() {
    const account = accountHash(credentials().email);
    if (session?.account === account) {
      return session.token;
    }
    session = await storedSession(account);
    if (session) {
      return session.token;
    }
    loginInFlight ??= login().finally(() => {
      loginInFlight = null;
    });
    return (await loginInFlight).session.token;
  }

  async function forgetToken(rejected) {
    if (session?.token === rejected) {
      session = null;
      await store?.set('session', undefined);
    }
  }

  /**
   * One authenticated request, with one new sign-in on a refused token.
   * @param {string} what for the error messages
   * @param {string} path below BASE_URL
   * @param {{ method?: string, query?: [string, string][], body?: unknown }} [options]
   */
  async function call(what, path, { method = 'GET', query = [], body } = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await token();
      const url = new URL(`${BASE_URL}${path}`);
      for (const [key, value] of query) {
        url.searchParams.append(key, value);
      }
      url.searchParams.set('token', current);
      logger?.debug(`${method} ${redact(url.toString())}`);
      const response = await send(url, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        await forgetToken(current);
        if (attempt === 0) {
          logger?.debug(`${what}: token refused, signing in again`);
          continue;
        }
        throw new AuthError(`${what}: Frisquet Connect refused the new session`);
      }
      failOnStatus(response, what);
      return readJson(response, what);
    }
    return undefined;
  }

  return {
    /**
     * Sign in now (configuration test, startup): the boilers of the account.
     * @returns {Promise<{ identifiant_chaudiere: string, nom?: string }[]>}
     */
    async listSites() {
      loginInFlight ??= login().finally(() => {
        loginInFlight = null;
      });
      return (await loginInFlight).sites;
    },

    /** @param {string} boilerId */
    getSite(boilerId) {
      return call('Boiler state', `/sites/${encodeURIComponent(boilerId)}`);
    },

    /** @param {string} boilerId */
    getConsumption(boilerId) {
      return call('Gas consumption', `/sites/${encodeURIComponent(boilerId)}/conso`, {
        query: [
          ['types[]', 'CHF'],
          ['types[]', 'SAN'],
        ],
      });
    },

    /**
     * Send orders to a boiler. A wrong key is accepted with a 200 and ignored
     * by the cloud: the next read is the only proof.
     * @param {string} boilerId
     * @param {{ cle: string, valeur: string }[]} orders
     */
    sendOrders(boilerId, orders) {
      return call('Order', `/ordres/${encodeURIComponent(boilerId)}`, {
        method: 'POST',
        body: orders,
      });
    },

    /** Drop the session (new credentials). */
    async reset() {
      session = null;
      await store?.set('session', undefined);
    },
  };
}
