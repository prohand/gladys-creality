# Security policy

## Supported versions

Only the latest release of the Creality integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version        | Supported |
| -------------- | --------- |
| latest release | Yes       |
| older releases | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-creality](https://github.com/prohand/gladys-creality/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration, of Gladys and the printer model / firmware;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove addresses and personal data first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the
printers and their firmware (report to Creality), and Creality Cloud.

## What users should know

- The printers' local WebSocket (port 9999) and camera server (port 8080) have
  **no authentication**: anyone on the same network can read and control the
  printer. That is how Creality OS works, not something this integration adds.
  Keep the printers on a trusted network, never expose those ports to the
  Internet, and put them on a separate VLAN if your network has guests.
- The integration only talks to the addresses you list in its configuration, on
  your local network. It never contacts Creality Cloud or any other service.
- It never starts a print and never sets a temperature: the orders it can send are
  pause, resume, stop and the light.
- Keep Gladys and the integration up to date.
