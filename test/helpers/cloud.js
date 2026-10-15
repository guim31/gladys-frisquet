// -----------------------------------------------------------------------------
// A fake Frisquet Connect cloud, served through an injected fetch: no network.
//
// It answers like the real API documented by the community projects (see
// test/fixtures/README.md): a form login returning a token, GET /sites/{id},
// GET /sites/{id}/conso, POST /ordres/{id}. Like the real cloud, an accepted
// order changes the value it writes (SELECTEUR, CONS_*, MODE_ECS, DERO,
// ACTIVITE_BOOST) and leaves the derived MODE/CAMB to the boiler's next uplink
// (`cloud.uplink()` recomputes them).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

export const EMAIL = 'jane@example.com';
export const PASSWORD = 'Sup3r-s3cret!';
export const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/**
 * @param {object} [options]
 * @param {string[]} [options.siteFiles] fixtures of the account's boilers
 * @param {object|null} [options.conso] answer of /conso (null: 404)
 */
export function createFakeCloud({
  siteFiles = ['site-two-zones.json'],
  conso = fixture('conso.json'),
} = {}) {
  const sites = new Map(
    siteFiles.map((file) => {
      const raw = fixture(file);
      return [raw.identifiant_chaudiere, raw];
    }),
  );
  const cloud = {
    sites,
    conso,
    requests: [],
    orders: [],
    logins: 0,
    token: TOKEN,
    /** Next answers to force, e.g. { status: 503 } or { status: 401 }. */
    failures: [],
    loginStatus: 201,
    maintenance: false,
    down: false,

    /** The boiler's uplink: recompute MODE and CAMB from SELECTEUR/DERO. */
    uplink() {
      for (const site of sites.values()) {
        for (const zone of site.zones) {
          const c = zone.carac_zone;
          if (c.SELECTEUR !== 5) {
            c.MODE = c.SELECTEUR;
          }
          c.CAMB = { 6: c.CONS_CONF, 7: c.CONS_RED, 8: c.CONS_HG }[c.MODE];
        }
      }
    },

    async fetch(input, init = {}) {
      const url = new URL(String(input));
      const method = init.method ?? 'GET';
      const body =
        init.body instanceof URLSearchParams
          ? Object.fromEntries(init.body)
          : init.body
            ? JSON.parse(init.body)
            : undefined;
      cloud.requests.push({ method, url: url.toString(), body });
      if (cloud.down) {
        throw new TypeError('fetch failed: getaddrinfo ENOTFOUND fcutappli.frisquet.com');
      }
      const forced = cloud.failures.shift();
      if (forced) {
        return json(forced.status, forced.body ?? { message: 'error' });
      }
      const path = url.pathname.replace('/api/v1', '');
      if (method === 'POST' && path === '/authentifications') {
        cloud.logins += 1;
        if (body.email !== EMAIL || body.password !== PASSWORD) {
          return json(cloud.loginStatus === 201 ? 401 : cloud.loginStatus, {
            message: 'Identifiants invalides',
          });
        }
        const login = fixture('login.json');
        login.token = cloud.token;
        login.maintenance_en_cours = cloud.maintenance;
        login.utilisateur.sites = [...sites.values()].map((site) => ({
          identifiant_chaudiere: site.identifiant_chaudiere,
          nom: site.nom,
          alarmes: site.alarmes,
        }));
        return json(201, login);
      }
      if (url.searchParams.get('token') !== cloud.token) {
        return json(403, { message: 'Token invalide' });
      }
      const [, kind, id, extra] = path.split('/');
      const site = sites.get(decodeURIComponent(id ?? ''));
      if (!site) {
        return json(404, { message: 'Site inconnu' });
      }
      if (method === 'GET' && kind === 'sites' && extra === 'conso') {
        return cloud.conso ? json(200, cloud.conso) : json(404, { message: 'Pas de conso' });
      }
      if (method === 'GET' && kind === 'sites' && extra === undefined) {
        return json(200, structuredClone(site));
      }
      if (method === 'POST' && kind === 'ordres') {
        cloud.orders.push(...body);
        applyOrders(site, body);
        return json(200, fixture('order-response.json'));
      }
      return json(404, { message: 'Route inconnue' });
    },
  };
  cloud.fetch = cloud.fetch.bind(cloud);
  return cloud;
}

function applyOrders(site, orders) {
  for (const { cle, valeur } of orders) {
    const value = Number(valeur);
    const zoneMatch = cle.match(/^(SELECTEUR|CONS_CONF|CONS_RED|CONS_HG|ACTIVITE_BOOST)_Z(\d)$/);
    if (zoneMatch) {
      const zone = site.zones.find((z) => z.numero === Number(zoneMatch[2]));
      if (!zone) {
        continue; // like the real cloud: accepted, ignored
      }
      const field = zoneMatch[1];
      zone.carac_zone[field] = field === 'ACTIVITE_BOOST' ? value === 1 : value;
      if (field === 'SELECTEUR' && value !== 5) {
        zone.carac_zone.DERO = false;
      }
      continue;
    }
    if (cle === 'MODE_DERO') {
      // The cloud's MODE_DERO carries no zone: modelled here on zone 1.
      const zone = site.zones[0];
      zone.carac_zone.DERO = value !== 0;
      if (value !== 0) {
        zone.carac_zone.MODE = value;
      }
      continue;
    }
    if (cle === 'MODE_ECS' || cle === 'MODE_ECS_PAC') {
      const mode = site.modes_ecs.find((m) => m.id === value);
      if (mode) {
        site.ecs[cle] = { ...mode };
      }
    }
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
