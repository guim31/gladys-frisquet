# Frisquet Connect for Gladys Assistant

External [Gladys Assistant](https://gladysassistant.com) integration for **Frisquet boilers**
fitted with the **Frisquet Connect** box, through the cloud of the official "Frisquet Connect" app.

> **Not affiliated with Frisquet.** Frisquet and Frisquet Connect are trademarks of their owner.
> This is a community project, built on an unofficial, undocumented API.
>
> **Developed without the hardware: feedback welcome.** No Frisquet boiler nor account was
> available while writing it: the API answers come from the community projects credited below,
> which recorded them on real boilers. Please open an issue if something behaves differently from
> the app.

Requires **Gladys 5.2.0 or later** (the zone mode uses the thermostat presets added in 5.2.0).

## What it does

| Device                        | Features                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Boiler**                    | Outdoor temperature (when a probe is fitted), hot water on/off and mode, alarm text and flag, holiday mode, standby, gas used this month / this year for heating and hot water (kWh)                                                            |
| **Heating zone** (Z1, Z2, Z3) | Room temperature, setpoint in effect (writable), comfort / reduced / frost protection setpoints (writable), mode (schedule, comfort, reduced, frost protection), override running, boost (when offered), a sentence describing the current mode |

- **Dashboard widget** "Frisquet heating": one zone in detail with buttons (schedule, comfort,
  reduced, override / end of override), or every zone at a glance.
- **Scene actions**: "Frisquet heating mode" (a zone or every zone of a boiler: schedule,
  permanent comfort / reduced / frost protection, override until the next change, end of
  override) and "Frisquet hot water" (on with the last mode, off, MAX, Eco…).
- **Scene trigger**: "Frisquet boiler alarm", with the alarm text as a variable.
- **Configuration action**: "Test the connection".

User documentation, in four languages, re-hosted by Gladys: [`docs/en.md`](docs/en.md),
[`docs/fr.md`](docs/fr.md), [`docs/de.md`](docs/de.md), [`docs/es.md`](docs/es.md).

## Requirements

- A Frisquet boiler with the Frisquet Connect box, and a Frisquet Connect app account.
- Gladys Assistant 5.2.0 or later, with Internet access (cloud only, nothing on the LAN).

## Installation

1. In Gladys: **Integrations → Install from GitHub**, with the URL of this repository
   (`https://github.com/guim31/gladys-frisquet`), or install it from the store once listed.
2. **Configuration** tab: the e-mail and password of the Frisquet Connect app, the language of
   the feature names (French by default), the refresh interval (5, 10 or 15 minutes).
3. **Test the connection**, then add the boiler and the zones from the **Discover** tab.

## How it works

- **Cloud API** (`https://fcutappli.frisquet.com/api/v1`, the one of the official app):
  `POST /authentifications` (form: e-mail, password) returns a token; `GET /sites/{boiler}`
  returns the whole state; `GET /sites/{boiler}/conso` the monthly gas use; `POST /ordres/{boiler}`
  takes `[{ "cle": "SELECTEUR_Z1", "valeur": "6" }]`. Temperatures are tenths of a degree.
- **Pace**: the Connect box relays the boiler by radio every few minutes. The integration reads
  every 5 minutes by default on its own timer (the devices use `should_poll: false`: no Gladys poll
  frequency is that slow, and Gladys#3198), the gas use every 6 hours, and reads a boiler again 20 s
  and 3 min after an order. Requests are serialized, half a second apart at least.
- **Credentials**: the e-mail and password stay in the Gladys configuration; the token lives in
  `/data/frisquet.json` (0600) with a hash of the e-mail, never in the logs.
- **Gas use** is published as `counter-sensor` kWh, not as an `energy-sensor` index: Gladys
  attaches every index to the main **electric** meter and would count the gas as electricity.

## Limits

- Holiday mode is read-only (the order to schedule it is not documented).
- The override order (`MODE_DERO`) carries no zone number: on a multi-zone boiler it may apply to
  zone 1 or to every zone.
- The weekly programme is followed, not editable. Solar hot water modes are not handled.
- Cloud only: without Frisquet's service, Gladys no longer sees the boiler.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store . --skip-image-check   # store checks
node scripts/probe.mjs        # real cloud, read-only (needs the network)
```

`scripts/probe.mjs` signs in with a made-up account and checks the cloud refuses it; with
`FRISQUET_EMAIL` and `FRISQUET_PASSWORD` set it reads a real account, read-only, without printing
anything sensitive. The tests run the integration on the SDK's fake Gladys against a fake cloud
fed with real, anonymized answers ([`test/fixtures/`](test/fixtures/README.md)), and never touch
the network.

Releases go through the Release workflow (Actions → Release): never edit the versions by hand.

## Credits

The Frisquet Connect protocol was reconstructed by these projects, all under the MIT license; the
test fixtures are anonymized copies of their captures:

- [mgcrea/homebridge-frisquet-connect](https://github.com/mgcrea/homebridge-frisquet-connect) by
  Olivier Louvignes — protocol notes, `MODE` versus `SELECTEUR`, request pacing, a probe verified
  on a real boiler.
- [TheGui01/Frisquet-connect-for-home-assistant](https://github.com/TheGui01/Frisquet-connect-for-home-assistant)
  by Guillaume Sourd — the most used Home Assistant integration: presets, hot water, consumption.
- [home-assistant-custom-components/frisquet-connect](https://github.com/home-assistant-custom-components/frisquet-connect)
  by Bruno Tête — order fixtures, boost, override.

Built from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js) and the
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

## License

[Apache-2.0](LICENSE)
