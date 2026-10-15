// -----------------------------------------------------------------------------
// From the raw answers of Frisquet Connect to plain objects, and from the
// user's commands to the cloud's orders. Pure functions: tested on real,
// anonymized answers (test/fixtures/).
//
// What the payload means (see docs/ and CLAUDE.md for the sources):
//   - every temperature is in TENTHS of a degree (TAMB 189 = 18.9 °C), and 0
//     is a real reading (a frosty morning), never "no value";
//   - SELECTEUR is the mode the user chose: 5 auto (weekly programme),
//     6 comfort, 7 reduced, 8 frost protection — orders write it;
//   - MODE is the mode in effect (the boiler derives it from the programme
//     when SELECTEUR is auto) and CAMB the setpoint it applies: both are
//     read-only, recomputed by the boiler at its next uplink;
//   - DERO: a temporary override ("dérogation") runs until the next change of
//     the programme;
//   - `alarmes` are the faults shown to the user; `alarmes_pro` are standing
//     installer notes and are ignored.
// -----------------------------------------------------------------------------

/** Values shared by SELECTEUR (what the user chose) and MODE (what runs). */
export const ZONE_MODE = Object.freeze({ AUTO: 5, COMFORT: 6, REDUCED: 7, FROST: 8 });

/** The value of MODE_DERO that ends a temporary override. */
export const OVERRIDE_OFF = 0;

/** Setpoint bounds offered to the user, in °C (the cloud speaks tenths). */
export const SETPOINT_MIN = 5;
export const SETPOINT_MAX = 30;
export const SETPOINT_STEP = 0.5;

/**
 * Hot water modes, keyed by a stable name. The cloud lists the modes a boiler
 * offers in `modes_ecs` (name + id); the programmed variants carry a private
 * icon glyph (U+E809), sometimes lost on the way, which leaves a trailing space.
 */
export const HOT_WATER_MODES = [
  'max',
  'eco',
  'eco_timer',
  'eco_plus',
  'eco_plus_timer',
  'stop',
  'on',
];

const tenths = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) / 10 : null;

const epochSeconds = (value) => {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n > 0
    ? new Date(n * 1000)
    : null;
};

/**
 * Stable key of a hot water mode from its name in `modes_ecs`.
 * @param {string} name e.g. "Eco +", "Eco ", "Eco + " (glyph lost)
 * @param {number} id
 */
export function hotWaterModeKey(name, id) {
  const raw = String(name ?? '');
  const programmed = raw.includes('') || /\s$/.test(raw);
  const base = raw.replace(//g, '').trim().toLowerCase().replace(/\s+/g, '');
  const key = { max: 'max', eco: 'eco', 'eco+': 'eco_plus', stop: 'stop', on: 'on' }[base];
  if (!key) {
    return `mode_${id}`;
  }
  return programmed && key.startsWith('eco') ? `${key}_timer` : key;
}

/**
 * The hot water of a boiler: which order key drives it, the mode it runs
 * and the modes it offers. null when the boiler produces no hot water
 * (heating only) or reports none.
 * @param {object} raw GET /sites answer
 */
export function parseHotWater(raw) {
  const ecs = raw?.ecs;
  if (!ecs) {
    return null;
  }
  // A boiler reports MODE_ECS; a heat pump install MODE_ECS_PAC instead.
  const orderKey = ecs.MODE_ECS ? 'MODE_ECS' : ecs.MODE_ECS_PAC ? 'MODE_ECS_PAC' : null;
  if (!orderKey) {
    return null;
  }
  const current = ecs[orderKey];
  const modes = [];
  const seen = new Set();
  for (const mode of raw.modes_ecs ?? []) {
    if (!Number.isInteger(mode?.id)) {
      continue;
    }
    const key = hotWaterModeKey(mode.nom, mode.id);
    if (!seen.has(key)) {
      seen.add(key);
      modes.push({ key, id: mode.id });
    }
  }
  const currentMode = modes.find((mode) => mode.id === current?.id) ?? null;
  return { orderKey, modes, mode: currentMode };
}

/**
 * One heating zone.
 * @param {object} zone an entry of `zones`
 */
export function parseZone(zone) {
  const c = zone?.carac_zone ?? {};
  return {
    id: String(zone.identifiant ?? `Z${zone.numero}`),
    number: Number(zone.numero),
    name: typeof zone.nom === 'string' && zone.nom.trim() !== '' ? zone.nom.trim() : null,
    temperature: tenths(c.TAMB),
    setpoint: tenths(c.CAMB),
    comfort: tenths(c.CONS_CONF),
    reduced: tenths(c.CONS_RED),
    frost: tenths(c.CONS_HG),
    selector: Number.isInteger(c.SELECTEUR) ? c.SELECTEUR : null,
    mode: Number.isInteger(c.MODE) ? c.MODE : null,
    override: c.DERO === true,
    boost: c.ACTIVITE_BOOST === true,
    boostAvailable: zone.boost_disponible === true,
  };
}

/**
 * One boiler ("site" in the API) and its zones.
 * @param {object} raw GET /sites answer
 */
export function parseSite(raw) {
  const product = raw?.produit ?? {};
  const model = [product.chaudiere, product.gamme, product.puissance]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .join(' ');
  return {
    id: String(raw.identifiant_chaudiere),
    name: typeof raw.nom === 'string' && raw.nom.trim() !== '' ? raw.nom.trim() : null,
    model: model || null,
    outdoorTemperature: tenths(raw.environnement?.T_EXT),
    standby: raw.carac_site?.CHAUDIERE_EN_VEILLE === true,
    lastUplink: epochSeconds(raw.date_derniere_remontee),
    holiday: {
      active: raw.vacances?.MODE_VACANCES === true,
      from: epochSeconds(raw.vacances?.DATE_DEP_VACANCES),
      to: epochSeconds(raw.vacances?.DATE_RET_VACANCES),
    },
    alarms: (raw.alarmes ?? [])
      .map((alarm) => (typeof alarm?.nom === 'string' ? alarm.nom.trim() : ''))
      .filter((name) => name !== ''),
    hotWater: parseHotWater(raw),
    zones: (raw.zones ?? [])
      .filter((zone) => Number.isInteger(zone?.numero) && zone.carac_zone)
      .map(parseZone)
      .sort((a, b) => a.number - b.number),
  };
}

/**
 * Gas used this month and this year, in kWh, from GET /sites/{id}/conso
 * (one entry per month: `{ valeur, mois, annee }`). A month with no entry
 * counts as 0; a type the answer lacks entirely is null.
 * @param {object} raw
 * @param {{ year: number, month: number }} today in the Gladys time zone
 */
export function parseConsumption(raw, { year, month }) {
  const totals = (entries) => {
    if (!Array.isArray(entries)) {
      return null;
    }
    let monthTotal = 0;
    let yearTotal = 0;
    for (const entry of entries) {
      const value = Number(entry?.valeur);
      if (!Number.isFinite(value) || value < 0 || Number(entry?.annee) !== year) {
        continue;
      }
      yearTotal += value;
      if (Number(entry.mois) === month) {
        monthTotal += value;
      }
    }
    return { month: Math.round(monthTotal), year: Math.round(yearTotal) };
  };
  return { heating: totals(raw?.CHF), hotWater: totals(raw?.SAN) };
}

/** A setpoint in °C to the cloud's tenths, on the 0.5 °C grid, as a string. */
export function toTenths(celsius) {
  const bounded = Math.min(SETPOINT_MAX, Math.max(SETPOINT_MIN, Number(celsius)));
  return String(Math.round(Math.round(bounded / SETPOINT_STEP) * SETPOINT_STEP * 10));
}

/** Which setpoint key the active mode follows (CAMB mirrors it). */
export function activeSetpointKey(zone, holiday = false) {
  if (holiday) {
    return 'CONS_HG';
  }
  return (
    { [ZONE_MODE.COMFORT]: 'CONS_CONF', [ZONE_MODE.FROST]: 'CONS_HG' }[zone.mode] ?? 'CONS_RED'
  );
}

export const orders = {
  /** One of the three setpoints of a zone ('CONS_CONF' | 'CONS_RED' | 'CONS_HG'). */
  setpoint(zone, key, celsius) {
    return [{ cle: `${key}_Z${zone.number}`, valeur: toTenths(celsius) }];
  },

  /**
   * The permanent mode of a zone (SELECTEUR). Going back to the programme
   * also ends a running override, or the zone would stay on it.
   */
  selector(zone, selector) {
    const list = [{ cle: `SELECTEUR_Z${zone.number}`, valeur: String(selector) }];
    if (selector === ZONE_MODE.AUTO && zone.override) {
      list.push({ cle: 'MODE_DERO', valeur: String(OVERRIDE_OFF) });
    }
    return list;
  },

  /**
   * A temporary override until the next change of the programme: comfort (6)
   * or reduced (7), 0 to end it. The cloud's MODE_DERO key carries no zone
   * number (see CLAUDE.md).
   */
  override(mode) {
    return [{ cle: 'MODE_DERO', valeur: String(mode) }];
  },

  boost(zone, on) {
    return [{ cle: `ACTIVITE_BOOST_Z${zone.number}`, valeur: on ? '1' : '0' }];
  },

  hotWater(hotWater, modeId) {
    return [{ cle: hotWater.orderKey, valeur: String(modeId) }];
  },
};
