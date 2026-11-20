# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one
runtime dependency: `@gladysassistant/integration-sdk`) for **Creality 3D printers
running Creality OS** (K1, K1C, K1 Max, K1 SE, K2, Ender-3 V3, Ender-3 V3 KE, Hi…).
It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js);
its CI and release workflows are the ones of
[prohand/gladys-devmel](https://github.com/prohand/gladys-devmel). Requires Gladys
5.3+.

**Local only** (manifest `transports: ["local"]`): the printers are reached on the
LAN, WebSocket on port 9999, camera snapshots on port 8080. No Creality Cloud. No
`countries` field on purpose: Creality sells worldwide, and the store reads an
absent field as "worldwide" (`test/manifest.test.js` pins it).

## Commands

```bash
npm install
npm test                                  # node --test (built-in runner)
LOG_LEVEL=silent npm test                 # same, without the log lines
node --test test/triggers.test.js         # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store --skip-image-check .   # store checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24; on pull requests it also runs the store admission checks and
builds the Docker image. Run the three commands before pushing.

## Architecture

```
index.js                     SDK bootstrap only: createApp(new GladysIntegration()), shutdown
src/app.js                   wiring: every Gladys handler, printer events -> states / scene events / widget
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults), normalization, printer list parser
src/creality/protocol.js     Creality OS fields -> normalized status, state codes, set commands
src/creality/connection.js   one WebSocket per printer: reconnect, heartbeat, silence detection
src/creality/camera.js       snapshot over HTTP (mjpg-streamer), JPEG check, 150 KB limit
src/printers.js              PrinterFleet: one entry per printer (connection, raw, status, trigger memory)
src/devices.js               Gladys devices (printer + optional camera), states, transport badges
src/publisher.js             publishChangedStates, throttled by refresh_interval
src/triggers.js              scene triggers: print_state_changed, print_progress, printer_error
src/scenes.js                scene actions: control_print, take_snapshot
src/widgets.js               dashboard widget `printer`
src/actions.js               manifest actions: test_connection, identify
src/commands.js              pause / resume / stop / light / blink, shared by every surface
src/snapshots.js             periodic camera push + last image for the widget
src/texts.js, src/i18n.js    user-facing words in en / fr / de / es
src/logging.js               debug_logs switch -> LOG_LEVEL
test/helpers/fakePrinter.js  fake printer WebSocket + fake fetch
.github/scripts/changelog-release.mjs   rolls CHANGELOG.md at release, tested in test/
```

## Rules

- **External ids are forever.** The printer id is built from its address
  (`printerId` in `src/config.js`) and used as `platformId` in
  `gladys.externalIds(type, platformId)`. Never change how it is built: Gladys keys
  devices, history, scenes and dashboards on it. The same goes for every key users
  store: `config_schema`, `actions`, widget, scene trigger / action keys, option
  values, feature keys (`FEATURES` in `src/devices.js`).
- **Every feature carries `name`, `min`, `max`, `read_only` and `has_feedback`**
  (NOT NULL in Gladys): `0`/`0` for text and image features. The fake Gladys of
  the SDK refuses a missing one; `test/devices.test.js` checks them.
- **Printer temperatures are `probe` temperatures**: they must never count in the
  room temperature.
- **The protocol is undocumented** (community knowledge of Creality OS). Stay
  tolerant: numbers may come as strings, fields may be missing per model, unknown
  state codes read as `unknown`. Never publish a missing value as 0.
- **Safety**: the integration never starts a print and never sets a temperature.
  Only pause / resume / stop and the light. Keep it that way unless the user asks
  explicitly; `stop` always asks for confirmation in the widget.
- **Scene triggers**: one event per transition, none on startup or reconnection
  (the first state seen is only remembered), `offline` / `unknown` are not print
  states. `data` only carries declared keys (fields + variables), all primitives
  (`test/triggers.test.js`). Never fire an event from a received action.
- **Rate limits**: 300 states/min per integration. Moving values go through
  `publishChangedStates` at `refresh_interval`; state, file and light at once.
- **The container rootfs is read-only.** Write only under `/data` (nothing is
  written today). Never log secrets.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag, by
  hand. `test/manifest.test.js` checks they agree. The first release from
  `0.0.0` should be `major` (→ 1.0.0).
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow does it.
- **Manifest.** Every text is `{ en, fr, de, es }` (`label`, `description`,
  `placeholder`, option labels…), checked by `test/manifest.test.js`. Catalog
  `description`: 10 to 100 characters per language. `keywords` need
  `gladys_version >=5.3.0`. Change the manifest and the code together: the tests
  tie actions, scene actions, triggers and widgets to their handlers.
- **User-facing text** is in four languages (`src/texts.js`, `src/i18n.js`), and
  so is the user documentation: `docs/en.md`, `docs/fr.md`, `docs/de.md`,
  `docs/es.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in
  English. Tests never touch the network: inject `WebSocketImpl`, `fetchImpl`,
  `now`, `sleep` (see `createApp`) and use `t.mock.timers`.
