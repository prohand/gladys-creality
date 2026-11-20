# Gladys Assistant – Creality

External integration for [Gladys Assistant](https://gladysassistant.com) that
follows and controls **Creality 3D printers running Creality OS** (K1, K1C,
K1 Max, K1 SE, K2, Ender-3 V3, Ender-3 V3 KE, Hi…) over the **local network**. No
Creality Cloud account.

Built from the official
[integration template](https://github.com/GladysAssistant/integration-template-js)
and the [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## What it does

| Surface                      | Content                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Device (one per printer)     | print state, progress, file, time left, print time, nozzle / bed / chamber temperatures (probes), light (switchable)             |
| Camera device (optional)     | snapshot every minute + fresh capture on demand (`http://<printer>:8080/?action=snapshot`)                                       |
| Transport badge              | `local` when the printer answers, `unreachable` otherwise (manifest `transports: ["local"]`)                                     |
| Scene triggers               | `print_state_changed`, `print_progress` (25 / 50 / 75 / 90 %), `printer_error`                                                   |
| Scene actions                | `control_print` (pause / resume / stop), `take_snapshot`                                                                         |
| Dashboard widget             | `printer`: progress gauge, live temperatures, camera image, state, file, time left, layer, pause / resume / stop / light buttons |
| Configuration screen actions | `test_connection`, `identify` (blinks the light)                                                                                 |
| Languages                    | English, French, German, Spanish (manifest, messages, widget, docs)                                                              |

Catalog: category `appliances`, search keywords, no `countries` (worldwide).
Requires **Gladys ≥ 5.3.0**.

## How it talks to the printer

Creality OS printers serve a WebSocket on port **9999**. The printer pushes JSON
objects carrying only the fields that changed (`state`, `printProgress`,
`nozzleTemp`, `bedTemp0`, `boxTemp`, `printFileName`, `printLeftTime`,
`lightSw`, `err`…) and accepts `{ "method": "set", "params": { … } }` commands
(`lightSw`, `pause`, `stop`). The integration keeps one link per printer,
reconnects by itself and sends a heartbeat every 10 s. See
[`src/creality/protocol.js`](src/creality/protocol.js).

This protocol is not documented by Creality: field names come from what the
printers send. The code is tolerant to missing fields and to unknown codes.

## Project structure

```
.
├─ index.js                          # SDK bootstrap (createApp + shutdown)
├─ src/
│  ├─ app.js                         # wiring of every handler
│  ├─ config.js                      # defaults, normalization, printer list
│  ├─ creality/                      # protocol, WebSocket link, camera
│  ├─ printers.js                    # the fleet of printer links
│  ├─ devices.js                     # Gladys devices and states
│  ├─ publisher.js                   # throttled state publication
│  ├─ triggers.js / scenes.js        # scene triggers / scene actions
│  ├─ widgets.js / actions.js        # dashboard widget / manifest actions
│  └─ texts.js, i18n.js              # en / fr / de / es texts
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake Gladys + fake printers
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for assistants & contributors
├─ SECURITY.md                       # private vulnerability reporting
└─ .github/                          # CI, build, release, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit + end-to-end tests, no network
npm run lint           # ESLint
npm run format:check   # Prettier
```

Run it against a real Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="creality" \
LOG_LEVEL=debug \
npm start
```

Check the store rules locally before a release:

```bash
npx github:GladysAssistant/integration-store --skip-image-check .
```

## Workflows

Same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`): Prettier, ESLint and tests on Node 22 and 24; on pull
  requests, store admission checks and a Docker build.
- **Release** (`release.yml`): Actions → Release → `patch` / `minor` / `major`.
  Bumps `package.json`, the manifest `version` and `docker_image`, rolls
  `CHANGELOG.md`, tags, builds the `linux/amd64` + `linux/arm64` image to
  `ghcr.io/prohand/gladys-creality`, publishes the GitHub Release, then runs the
  full store checks. The repository starts at `0.0.0`: pick **major** for the
  first release (→ 1.0.0).
- **Build** (`build.yml`): multi-arch image, on a tag, by hand or called by the
  release.
- **GitHub releases** (`github-release.yml`): creates the missing Releases.
- **Dependabot**: npm weekly, GitHub Actions and Docker monthly.

## Publish

1. Add the GitHub topic `gladys-assistant-integration` to the repository.
2. Turn on **Private vulnerability reporting** (Settings → Security):
   [`SECURITY.md`](SECURITY.md) sends reporters there.
3. Make the `ghcr.io/prohand/gladys-creality` package public after the first
   build.
4. Run **Actions → Release**. The store indexer picks the new version within the
   hour.

## License

Apache-2.0
