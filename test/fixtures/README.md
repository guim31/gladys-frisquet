# Test fixtures

Real answers of the Frisquet Connect cloud, anonymized: boiler ids, serial numbers, names,
postal codes, e-mails and phone numbers are made up. Temperatures, modes, selectors, schedules,
hot water modes and consumptions are kept as recorded.

| File                         | Source                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `site-two-zones.json`        | `test/fixtures/site.json` of [mgcrea/homebridge-frisquet-connect](https://github.com/mgcrea/homebridge-frisquet-connect) (Hydromotrix, two zones, hot water "Eco" scheduled whose glyph was lost, an installer note in `alarmes_pro`)                        |
| `login.json`                 | `test/fixtures/login.json` of the same project, with a second boiler added to the account                                                                                                                                                                    |
| `site-boost-derogation.json` | `tests/resources/sites.json` of [home-assistant-custom-components/frisquet-connect](https://github.com/home-assistant-custom-components/frisquet-connect) (one zone, boost available, override running, "Box Frisquet Connect déconnectée" alarm, `` glyph) |
| `conso.json`                 | `tests/resources/conso.json` of the same project (monthly kWh, heating and hot water)                                                                                                                                                                        |
| `order-response.json`        | `tests/resources/ordres/set_temperature_sleep/output.json` of the same project                                                                                                                                                                               |
| `site-heating-only.json`     | **Synthetic**, derived from `site-two-zones.json`: heating only (no hot water), no outdoor probe, holiday mode on, a third zone in frost protection at -0.5 °C                                                                                               |
| `gladys-feature-table.json`  | Extracted from the Gladys core (category/type couples, units, poll frequencies)                                                                                                                                                                              |

Both source projects are under the MIT license:

- homebridge-frisquet-connect — Copyright (c) 2026 Olivier Louvignes
- frisquet-connect (Home Assistant) — Copyright (c) 2025 Bruno TÊTE

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions: The above copyright notice
> and this permission notice shall be included in all copies or substantial portions of the
> Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
