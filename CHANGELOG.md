# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Frisquet boilers with the Frisquet Connect box, through the cloud of the official app: sign in
  with the e-mail and password of the Frisquet Connect app.
- One device per heating zone: room temperature, setpoint in effect, comfort / reduced / frost
  protection setpoints, mode (schedule, comfort, reduced, frost protection), override running,
  boost when the zone offers it, and the current mode in words.
- One device per boiler: outdoor temperature, hot water on/off and mode, alarm, holiday mode,
  standby, gas used this month and this year for heating and hot water.
- Dashboard widget "Frisquet heating": one zone with schedule, comfort, reduced and override
  buttons, or every zone at a glance.
- Scene actions "Frisquet heating mode" and "Frisquet hot water", scene trigger "Frisquet boiler
  alarm".
- The integration reads the boilers on its own every 5, 10 or 15 minutes, and again after each
  command; it only publishes what changed.
- Every text in English, French, German and Spanish, documentation included.

[Unreleased]: https://github.com/guim31/gladys-frisquet/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-frisquet/releases/tag/v1.0.1
