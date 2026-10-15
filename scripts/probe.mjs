#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real Frisquet Connect cloud, READ-ONLY, for a machine that has
// the network (the development sessions do not reach fcutappli.frisquet.com).
//
//   node scripts/probe.mjs
//       Signs in with a made-up account and checks the cloud refuses it the
//       way src/frisquet/client.js expects (an AuthError, not a crash).
//
//   FRISQUET_EMAIL=… FRISQUET_PASSWORD=… node scripts/probe.mjs
//       With a real account: signs in, reads every boiler and its gas
//       consumption, parses them like the integration, and prints the
//       summary. No order is ever sent.
//
// Nothing sensitive is printed: no e-mail, no password, no token, and the
// boiler ids are masked. The token is kept in memory only (no /data).
// -----------------------------------------------------------------------------

import { createFrisquetClient, redact } from '../src/frisquet/client.js';
import { AuthError, UnavailableError } from '../src/frisquet/errors.js';
import { parseConsumption, parseSite } from '../src/frisquet/model.js';

const realAccount = Boolean(process.env.FRISQUET_EMAIL && process.env.FRISQUET_PASSWORD);
const credentials = realAccount
  ? { email: process.env.FRISQUET_EMAIL, password: process.env.FRISQUET_PASSWORD }
  : { email: `probe-${Date.now()}@example.invalid`, password: 'not-a-real-password' };

const mask = (id) => `${String(id).slice(0, 2)}…${String(id).slice(-2)}`;
const logger = {
  debug: (message) => process.env.PROBE_DEBUG && console.log(`  · ${redact(message)}`),
};

const client = createFrisquetClient({ credentials: () => credentials, logger });

async function main() {
  console.log(`Frisquet Connect probe (${realAccount ? 'real account' : 'made-up account'})`);
  let sites;
  try {
    sites = await client.listSites();
  } catch (err) {
    if (err instanceof AuthError && !realAccount) {
      console.log('✓ the cloud answers and refuses a made-up account (AuthError), as expected');
      return 0;
    }
    if (err instanceof UnavailableError) {
      console.log(`✗ cloud unavailable: ${redact(err.message)}`);
      return 2;
    }
    console.log(`✗ ${err.name}: ${redact(err.message)}`);
    return 1;
  }
  if (!realAccount) {
    console.log('✗ the cloud ACCEPTED a made-up account: the sign-in check is wrong');
    return 1;
  }
  console.log(`✓ signed in, ${sites.length} boiler(s)`);
  const now = new Date();
  for (const entry of sites) {
    const site = parseSite(await client.getSite(entry.identifiant_chaudiere));
    console.log(`\nBoiler ${mask(site.id)}: ${site.model ?? 'unknown model'}`);
    console.log(`  outdoor ${site.outdoorTemperature ?? 'no probe'} °C, standby ${site.standby}`);
    console.log(`  holiday ${site.holiday.active}, alarms ${site.alarms.join(' ; ') || 'none'}`);
    console.log(`  last uplink ${site.lastUplink?.toISOString() ?? 'unknown'}`);
    if (site.hotWater) {
      console.log(
        `  hot water ${site.hotWater.orderKey} = ${site.hotWater.mode?.key ?? '?'} ` +
          `(offers ${site.hotWater.modes.map((m) => `${m.key}:${m.id}`).join(', ')})`,
      );
    } else {
      console.log('  no hot water');
    }
    for (const zone of site.zones) {
      console.log(
        `  ${zone.id} #${zone.number}: ${zone.temperature} °C, setpoint ${zone.setpoint} °C, ` +
          `selector ${zone.selector}, mode ${zone.mode}, override ${zone.override}, ` +
          `boost ${zone.boost} (available ${zone.boostAvailable}), ` +
          `comfort ${zone.comfort} / reduced ${zone.reduced} / frost ${zone.frost}`,
      );
    }
    try {
      const gas = parseConsumption(await client.getConsumption(site.id), {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
      console.log(
        `  gas heating ${JSON.stringify(gas.heating)}, hot water ${JSON.stringify(gas.hotWater)} kWh`,
      );
    } catch (err) {
      console.log(`  gas consumption unavailable: ${redact(err.message)}`);
    }
  }
  return 0;
}

process.exitCode = await main();
