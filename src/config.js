// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';

export { LANGUAGES };

// Minutes between two reads of the boilers. The Connect box relays the boiler
// to the cloud every few minutes: reading faster returns the same data and
// risks a 429.
export const POLL_INTERVALS_MINUTES = ['5', '10', '15'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  language: 'fr', // language of the feature names and of the container's texts
  poll_interval: '5', // minutes, one of POLL_INTERVALS_MINUTES
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  const interval = String(raw.poll_interval ?? DEFAULT_CONFIG.poll_interval);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    email: String(raw.email ?? '').trim(),
    // A password may legitimately start or end with a space: kept as typed.
    password: String(raw.password ?? ''),
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    poll_interval: POLL_INTERVALS_MINUTES.includes(interval)
      ? interval
      : DEFAULT_CONFIG.poll_interval,
  };
}

/** The cloud can only be reached once both credentials are set. */
export function isConfigured(config) {
  return Boolean(config.email && config.password);
}

/** @returns {number} milliseconds between two reads */
export function pollIntervalMs(config) {
  return Number(config.poll_interval) * 60_000;
}
