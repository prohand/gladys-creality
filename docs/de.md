# Creality

Diese Integration verbindet Gladys über dein lokales Netzwerk mit deinen
**Creality-3D-Druckern**. Du verfolgst jeden Druck in Gladys (Status,
Fortschritt, Restzeit, Temperaturen, Kamera), pausierst ihn, setzt ihn fort oder
brichst ihn ab, und deine Szenen reagieren darauf: eine Nachricht, wenn ein Druck
fertig ist, das Licht aus, wenn er fehlschlägt…

## Überblick

- **Unterstützte Drucker**: die Drucker mit **Creality OS**, dem auf Klipper
  basierenden System der neueren Modelle: K1, K1C, K1 Max, K1 SE, K2 (Plus / Pro),
  Ender-3 V3, Ender-3 V3 KE, Hi…
- **Nur lokal**: Die Integration spricht mit dem Drucker in deinem Netzwerk, auf
  seinem Port **9999**. Kein Creality-Cloud-Konto, kein Internet nötig, nichts auf
  dem Drucker zu installieren.
- **Nicht unterstützt**: ältere Drucker ohne Netzwerk (Ender-3 V2, Ender-5…) und
  Drucker, die nur über die Creality Wi-Fi Box oder Creality Cloud erreichbar
  sind.

Für jeden Drucker erhält Gladys ein Gerät mit:

| Funktion          | Was sie zeigt                                                             |
| ----------------- | ------------------------------------------------------------------------- |
| Druckstatus       | `idle`, `printing`, `paused`, `completed`, `failed`, `stopped`, `offline` |
| Fortschritt       | 0 bis 100 %                                                               |
| Gedruckte Datei   | der Name der G-Code-Datei                                                 |
| Restzeit          | in Minuten                                                                |
| Druckzeit         | in Minuten                                                                |
| Düsentemperatur   | °C                                                                        |
| Betttemperatur    | °C                                                                        |
| Bauraumtemperatur | °C (nur K1 Max, K2…)                                                      |
| Licht             | an / aus, **in Gladys schaltbar**                                         |

Die drei Temperaturen sind als **Fühler** angegeben: Sie zählen nie zur
Temperatur des Raums, in dem der Drucker steht.

Mit der Kamera-Option erhält jeder Drucker zusätzlich ein **Kamera**-Gerät.

## Voraussetzungen

1. **Gladys 5.3 oder neuer.**
2. Der Drucker ist mit deinem Netzwerk verbunden (WLAN oder Ethernet) und
   **eingeschaltet**.
3. **Gib dem Drucker eine feste Adresse** in deinem Router (eine
   „DHCP-Reservierung“). Die Integration erkennt einen Drucker an seiner Adresse:
   Ändert sich die Adresse, sieht Gladys einen neuen Drucker.
4. Du findest diese Adresse auf dem Bildschirm des Druckers: **Einstellungen →
   Netzwerk** (das genaue Menü hängt vom Modell ab).

## Konfiguration

Öffne in Gladys **Integrationen → Creality → Konfiguration**.

- **Drucker**: die Adresse jedes Druckers, durch Kommas getrennt. Mit `=` kannst
  du einen Namen vor eine Adresse setzen:

  ```
  K1 Werkstatt=192.168.1.40, 192.168.1.41
  ```

  Ohne Namen heißt der Drucker „Creality <Modell> (<Adresse>)“. Ein anderer Port
  als 9999 wird `192.168.1.40:9998` geschrieben.

- **Druckerkamera**: einschalten, wenn deine Drucker eine Kamera haben (K1C,
  K1 Max, K2…). Dann wird für jeden Drucker ein Kameragerät angelegt, jede Minute
  aktualisiert.
- **Kamera-Port**: 8080 unter Creality OS. Nur ändern, wenn du weißt, dass deiner
  anders ist.
- **Aktualisierungsintervall**: wie oft Temperaturen, Fortschritt und Zeiten an
  Gladys gesendet werden (standardmäßig 30 s). Eine Änderung des Druckstatus wird
  immer sofort gesendet.
- **Detaillierte Protokolle**: nur zur Fehlersuche, danach wieder ausschalten.

Speichern, dann auf **Verbindung testen** klicken: Du erhältst eine Zeile pro
Drucker, mit Modell, Status und Temperaturen. Öffne danach **Erkennung**, um die
Drucker zu Gladys hinzuzufügen.

**Drucker identifizieren** lässt das Licht des gewählten Druckers blinken:
praktisch bei mehreren gleichen Druckern.

## Szenen

### Auslöser

- **Druckstatus geändert**: Ein Druck wurde gestartet, pausiert, fortgesetzt,
  beendet, ist fehlgeschlagen oder wurde abgebrochen. Filter auf den Drucker und
  den neuen Status. Variablen: Druckername, neuer Status, vorheriger Status,
  Dateiname, Fortschritt.
- **Druckfortschritt erreicht**: Der Druck hat 25, 50, 75 oder 90 % erreicht,
  einmal pro Stufe und Druck. Variablen: Druckername, Fortschritt, Dateiname,
  Restzeit.
- **Druckerfehler**: Der Drucker meldet einen Fehlercode. Variablen: Druckername,
  Fehlercode.

Ein Neustart von Gladys oder der Integration löst nie von selbst etwas aus: Ein
beim Start „druckender“ Drucker hat nicht gerade erst angefangen.

Beispiel: _„Wenn der Druckstatus des K1 Fertig wird, schicke mir eine Nachricht:
`{{triggerEvent.data.file_name}}` ist fertig.“_

### Aktionen

- **Druck steuern**: pausiert, setzt fort oder bricht den laufenden Druck ab. Die
  Aktion schlägt nie fehl, weil der Drucker aus ist oder nichts zu pausieren hat:
  Sie liefert **Befehl gesendet** (ja / nein) und den Status vor dem Befehl, den
  die folgenden Aktionen prüfen können.
- **Druckerbild aufnehmen**: aktualisiert das Kamerabild, z. B. direkt vor der
  Gladys-Aktion „Kamerabild senden“.

Das Licht ist eine normale Gerätefunktion: Schalte es mit der üblichen Aktion
„Gerät steuern“.

## Dashboard-Widget

Das Widget **3D-Drucker** zeigt für den gewählten Drucker (den ersten, wenn du
keinen wählst): Fortschritt, Düsen- und Betttemperatur (live), das letzte
Kamerabild, Status, Datei, Restzeit und Schicht, dazu die Tasten **Pause** /
**Fortsetzen**, **Druck abbrechen** (mit Bestätigung) und das Licht.

## Fehlerbehebung

- **„nicht erreichbar auf Port 9999“**: Prüfe die Adresse auf dem Bildschirm des
  Druckers, ob er eingeschaltet ist und ob Gladys und Drucker im selben Netzwerk
  sind (kein Gast-WLAN, kein VLAN dazwischen). Vom Gladys-Rechner aus sollte
  `curl -i http://192.168.1.40:9999` etwas antworten.
- **Der Drucker ist ab und zu „offline“**: Das WLAN der Drucker ist oft schwach.
  Die Integration verbindet sich selbst neu (nach 2 s, dann bis zu jede Minute);
  ein Ethernet-Kabel oder ein näherer Access Point hilft.
- **Ein Drucker erscheint doppelt**: Seine Adresse hat sich geändert. Richte eine
  DHCP-Reservierung ein und lösche das alte Gerät in Gladys.
- **Kein Kamerabild**: Die Kamera-Option muss eingeschaltet sein und der Drucker
  eine Kamera haben. Öffne `http://<Adresse>:8080/?action=snapshot` im Browser:
  Du solltest ein Bild sehen. Gladys nimmt höchstens 150 KB pro Bild: Senke bei
  Bedarf die Kameraauflösung in den Druckereinstellungen.
- **Pause / Abbruch tut nichts**: Diese Befehle werden nur während eines Drucks
  gesendet (oder einer Pause, für „Fortsetzen“). Mit **Detaillierten
  Protokollen** steht jeder gesendete Befehl in den Protokollen der Integration.
- **Ein Wert fehlt** (Bauraumtemperatur beim K1C…): Der Drucker sendet ihn nicht;
  die Integration lässt ihn leer, statt eine 0 zu erfinden.

Das Protokoll der Drucker ist von Creality nicht dokumentiert: Diese Integration
nutzt, was die Drucker in deinem lokalen Netzwerk senden. Ein Firmware-Update kann
ein Feld ändern; eröffne ein Issue im GitHub-Repository, wenn etwas nicht mehr
funktioniert.
