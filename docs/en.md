# Creality

This integration connects Gladys to your **Creality 3D printers** over your local
network. You follow each print from Gladys (state, progress, time left,
temperatures, camera), you pause, resume or stop it, and your scenes react to
it: a message when a print is done, the light switched off when it fails…

## Overview

- **Supported printers**: the printers running **Creality OS**, the Klipper-based
  system of the recent models: K1, K1C, K1 Max, K1 SE, K2 (Plus / Pro), Ender-3 V3,
  Ender-3 V3 KE, Hi…
- **Local only**: the integration talks to the printer on your network, on its
  port **9999**. No Creality Cloud account, no Internet access needed, nothing to
  install on the printer.
- **Not supported**: the older printers without a network (Ender-3 V2, Ender-5…),
  and the printers only reachable through the Creality Wi-Fi Box or Creality
  Cloud.

For each printer, Gladys gets one device with:

| Feature             | What it shows                                                             |
| ------------------- | ------------------------------------------------------------------------- |
| Print state         | `idle`, `printing`, `paused`, `completed`, `failed`, `stopped`, `offline` |
| Print progress      | 0 to 100 %                                                                |
| Printed file        | the name of the G-code file                                               |
| Time left           | in minutes                                                                |
| Print time          | in minutes                                                                |
| Nozzle temperature  | °C                                                                        |
| Bed temperature     | °C                                                                        |
| Chamber temperature | °C (K1 Max, K2… only)                                                     |
| Light               | on / off, **switchable from Gladys**                                      |

The three temperatures are declared as **probes**: they are never counted in the
temperature of the room the printer sits in.

With the camera option, each printer also gets a **camera** device.

## Prerequisites

1. **Gladys 5.3 or newer.**
2. The printer is connected to your network (Wi-Fi or Ethernet) and **switched
   on**.
3. **Give the printer a fixed address** in your router (a "DHCP reservation").
   The integration identifies a printer by its address: if the address changes,
   Gladys sees a new printer.
4. Find that address on the printer screen: **Settings → Network** (the exact menu
   depends on the model).

## Configuration

In Gladys, open **Integrations → Creality → Configuration**.

- **Printers**: the address of each printer, separated by commas. You can put a
  name before an address with `=`:

  ```
  Workshop K1=192.168.1.40, 192.168.1.41
  ```

  Without a name, the printer is called "Creality <model> (<address>)". A port
  other than 9999 is written `192.168.1.40:9998`.

- **Printer camera**: turn it on if your printers have a camera (K1C, K1 Max,
  K2…). A camera device is then created for each printer, refreshed every minute.
- **Camera port**: 8080 on Creality OS. Leave it unless you know yours differs.
- **Refresh interval**: how often temperatures, progress and times are sent to
  Gladys (30 s by default). A change of print state is always sent at once.
- **Detailed logs**: for troubleshooting only, then turn it off again.

Save, then click **Test the connection**: you get one line per printer, with its
model, its state and its temperatures. Then open **Discovery** to add the
printers to Gladys.

**Identify a printer** blinks the light of the printer you pick: handy with
several identical printers.

## Scenes

### Triggers

- **Print state changed**: a print started, was paused, resumed, completed,
  failed or was stopped. Filter on the printer and on the new state. Variables:
  printer name, new state, previous state, file name, progress.
- **Print progress reached**: the print reached 25, 50, 75 or 90 %, once per
  step and per print. Variables: printer name, progress, file name, time left.
- **Printer error**: the printer raised an error code. Variables: printer name,
  error code.

A restart of Gladys or of the integration never fires a trigger by itself: a
printer found "printing" at startup was not just started.

Example: _"When the print state of the K1 becomes Completed, send me a message:
`{{triggerEvent.data.file_name}}` is done."_

### Actions

- **Control a print**: pause, resume or stop the current print. The action never
  fails because the printer is off or has nothing to pause: it returns **Command
  sent** (yes / no) and the state before the command, so the next actions can
  test it.
- **Take a printer snapshot**: refreshes the camera image, for example just before
  the Gladys action "Send a camera image".

The light is a normal device feature: switch it with the usual "Control a device"
action.

## Dashboard widget

The **3D printer** widget shows, for the printer you pick (the first one if you
pick none): progress, nozzle and bed temperatures (live), the last camera image,
the state, the file, the time left and the layer, plus the buttons **Pause** /
**Resume**, **Stop the print** (with a confirmation) and the light.

## Troubleshooting

- **"not reachable on port 9999"**: check the address on the printer screen, that
  the printer is on, and that Gladys and the printer are on the same network (no
  guest Wi-Fi, no VLAN in between). From the Gladys machine,
  `curl -i http://192.168.1.40:9999` should answer something.
- **The printer goes "offline" from time to time**: Wi-Fi on printers is often
  weak. The integration reconnects by itself (after 2 s, then up to every
  minute); an Ethernet cable or a closer access point helps.
- **A printer appeared twice**: its address changed. Set a DHCP reservation, then
  delete the old device in Gladys.
- **No camera image**: the camera option must be on, and the printer must have a
  camera. Open `http://<address>:8080/?action=snapshot` in a browser: you should
  see an image. Gladys takes at most 150 KB per image: lower the camera resolution
  in the printer settings if needed.
- **Pause / stop does nothing**: those orders are only sent while a print is
  running (or paused for "resume"). With **Detailed logs** on, every order sent is
  in the integration logs.
- **A value is missing** (chamber temperature on a K1C…): the printer does not
  send it; the integration leaves it empty rather than inventing a 0.

The protocol of the printers is not documented by Creality: this integration uses
what the printers send on their local network. A firmware update may change a
field; open an issue on the GitHub repository if something breaks.
