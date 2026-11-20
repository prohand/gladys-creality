# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [0.0.1] - 2026-11-20

### Added

- First version of the Creality integration, built from the official Gladys
  integration template.
- Local link to the Creality OS printers (K1, K1C, K1 Max, K1 SE, K2,
  Ender-3 V3, Ender-3 V3 KE, Hi...) over their WebSocket on port 9999: no
  Creality Cloud account. Reconnects by itself, transport badge `local` /
  `unreachable`.
- One Gladys device per printer: print state, progress, file, time left, print
  time, nozzle / bed / chamber temperatures (as probes, out of the room
  average) and the light, switchable from Gladys.
- Optional camera device per printer (K1C, K1 Max, K2...), refreshed every
  minute and on demand.
- Scene triggers: print state changed, print progress reached (25 / 50 / 75 /
  90 %), printer error.
- Scene actions: control a print (pause, resume, stop), take a snapshot.
- "3D printer" dashboard widget: progress, temperatures, camera image, state,
  pause / resume / stop and light buttons.
- Actions: "Test the connection", "Identify a printer" (blinks its light).
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/prohand/gladys-creality/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/prohand/gladys-creality/releases/tag/v0.0.1
