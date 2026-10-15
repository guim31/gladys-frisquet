// -----------------------------------------------------------------------------
// Entry point of the Frisquet Connect integration for Gladys Assistant.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
//   - TZ                          (the time zone of Gladys)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// Everything else is wired in src/app.js, which the tests run on the SDK's
// fake Gladys.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const app = createApp({ gladys: new GladysIntegration() });

app.start().catch((err) => {
  logger.error(`Initial connection failed (${err.message})`);
  process.exit(1);
});
