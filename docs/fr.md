# Creality

Cette intégration relie Gladys à vos **imprimantes 3D Creality** sur votre réseau
local. Vous suivez chaque impression depuis Gladys (état, progression, temps
restant, températures, caméra), vous la mettez en pause, la reprenez ou l'arrêtez,
et vos scènes y réagissent : un message quand l'impression est finie, la lumière
éteinte en cas d'échec…

## Présentation

- **Imprimantes prises en charge** : les imprimantes sous **Creality OS**, le
  système basé sur Klipper des modèles récents : K1, K1C, K1 Max, K1 SE, K2
  (Plus / Pro), Ender-3 V3, Ender-3 V3 KE, Hi…
- **En local uniquement** : l'intégration parle à l'imprimante sur votre réseau,
  sur son port **9999**. Pas de compte Creality Cloud, pas besoin d'Internet, rien
  à installer sur l'imprimante.
- **Non pris en charge** : les anciennes imprimantes sans réseau (Ender-3 V2,
  Ender-5…), et celles joignables seulement via la Creality Wi-Fi Box ou Creality
  Cloud.

Pour chaque imprimante, Gladys reçoit un appareil avec :

| Fonctionnalité            | Ce qu'elle affiche                                                        |
| ------------------------- | ------------------------------------------------------------------------- |
| État d'impression         | `idle`, `printing`, `paused`, `completed`, `failed`, `stopped`, `offline` |
| Progression               | 0 à 100 %                                                                 |
| Fichier imprimé           | le nom du fichier G-code                                                  |
| Temps restant             | en minutes                                                                |
| Durée d'impression        | en minutes                                                                |
| Température de la buse    | °C                                                                        |
| Température du plateau    | °C                                                                        |
| Température de l'enceinte | °C (K1 Max, K2… seulement)                                                |
| Lumière                   | allumée / éteinte, **pilotable depuis Gladys**                            |

Les trois températures sont déclarées comme des **sondes** : elles ne comptent
jamais dans la température de la pièce où se trouve l'imprimante.

Avec l'option caméra, chaque imprimante reçoit aussi un appareil **caméra**.

## Prérequis

1. **Gladys 5.3 ou plus récent.**
2. L'imprimante est reliée à votre réseau (Wi-Fi ou Ethernet) et **allumée**.
3. **Donnez une adresse fixe à l'imprimante** dans votre box (une « réservation
   DHCP »). L'intégration reconnaît une imprimante à son adresse : si l'adresse
   change, Gladys voit une nouvelle imprimante.
4. Trouvez cette adresse sur l'écran de l'imprimante : **Paramètres → Réseau** (le
   menu exact dépend du modèle).

## Configuration

Dans Gladys, ouvrez **Intégrations → Creality → Configuration**.

- **Imprimantes** : l'adresse de chaque imprimante, séparées par des virgules.
  Vous pouvez mettre un nom devant une adresse avec `=` :

  ```
  K1 Atelier=192.168.1.40, 192.168.1.41
  ```

  Sans nom, l'imprimante s'appelle « Creality <modèle> (<adresse>) ». Un port
  autre que 9999 s'écrit `192.168.1.40:9998`.

- **Caméra de l'imprimante** : activez-la si vos imprimantes ont une caméra (K1C,
  K1 Max, K2…). Un appareil caméra est alors créé pour chaque imprimante,
  rafraîchi chaque minute.
- **Port de la caméra** : 8080 sous Creality OS. Ne le changez que si vous savez
  que le vôtre est différent.
- **Intervalle de rafraîchissement** : fréquence d'envoi des températures, de la
  progression et des temps à Gladys (30 s par défaut). Un changement d'état
  d'impression est toujours envoyé tout de suite.
- **Journaux détaillés** : seulement pour un dépannage, puis désactivez-les.

Enregistrez, puis cliquez sur **Tester la connexion** : vous obtenez une ligne par
imprimante, avec son modèle, son état et ses températures. Ouvrez ensuite
**Découverte** pour ajouter les imprimantes à Gladys.

**Identifier une imprimante** fait clignoter la lumière de l'imprimante choisie :
pratique avec plusieurs imprimantes identiques.

## Scènes

### Déclencheurs

- **L'état d'impression change** : une impression a démarré, a été mise en pause,
  a repris, s'est terminée, a échoué ou a été arrêtée. Filtrez sur l'imprimante et
  sur le nouvel état. Variables : nom de l'imprimante, nouvel état, état
  précédent, nom du fichier, progression.
- **Progression d'impression atteinte** : l'impression a atteint 25, 50, 75 ou
  90 %, une fois par palier et par impression. Variables : nom de l'imprimante,
  progression, nom du fichier, temps restant.
- **Erreur de l'imprimante** : l'imprimante signale un code d'erreur. Variables :
  nom de l'imprimante, code d'erreur.

Un redémarrage de Gladys ou de l'intégration ne déclenche jamais rien tout seul :
une imprimante trouvée « en impression » au démarrage n'a pas démarré à
l'instant.

Exemple : _« Quand l'état d'impression de la K1 devient Terminée, envoie-moi un
message : `{{triggerEvent.data.file_name}}` est fini. »_

### Actions

- **Piloter une impression** : met en pause, reprend ou arrête l'impression en
  cours. L'action n'échoue jamais parce que l'imprimante est éteinte ou n'a rien à
  mettre en pause : elle renvoie **Commande envoyée** (oui / non) et l'état avant
  la commande, que les actions suivantes peuvent tester.
- **Prendre une photo de l'imprimante** : rafraîchit l'image de la caméra, par
  exemple juste avant l'action Gladys « Envoyer une image de caméra ».

La lumière est une fonctionnalité normale de l'appareil : pilotez-la avec l'action
habituelle « Contrôler un appareil ».

## Widget du tableau de bord

Le widget **Imprimante 3D** affiche, pour l'imprimante choisie (la première si
vous n'en choisissez aucune) : la progression, les températures de la buse et du
plateau (en direct), la dernière image de la caméra, l'état, le fichier, le temps
restant et la couche, ainsi que les boutons **Pause** / **Reprendre**, **Arrêter
l'impression** (avec confirmation) et la lumière.

## Dépannage

- **« injoignable sur le port 9999 »** : vérifiez l'adresse sur l'écran de
  l'imprimante, qu'elle est allumée, et que Gladys et l'imprimante sont sur le
  même réseau (pas de Wi-Fi invité, pas de VLAN entre les deux). Depuis la machine
  Gladys, `curl -i http://192.168.1.40:9999` doit répondre quelque chose.
- **L'imprimante passe « offline » de temps en temps** : le Wi-Fi des imprimantes
  est souvent faible. L'intégration se reconnecte toute seule (après 2 s, puis
  jusqu'à chaque minute) ; un câble Ethernet ou un point d'accès plus proche aide.
- **Une imprimante apparaît deux fois** : son adresse a changé. Faites une
  réservation DHCP, puis supprimez l'ancien appareil dans Gladys.
- **Pas d'image de caméra** : l'option caméra doit être activée, et l'imprimante
  doit avoir une caméra. Ouvrez `http://<adresse>:8080/?action=snapshot` dans un
  navigateur : vous devez voir une image. Gladys accepte 150 Ko au plus par
  image : baissez la résolution de la caméra dans les réglages de l'imprimante si
  besoin.
- **Pause / arrêt ne fait rien** : ces ordres ne sont envoyés que pendant une
  impression (ou une pause, pour « reprendre »). Avec les **journaux détaillés**,
  chaque ordre envoyé apparaît dans les journaux de l'intégration.
- **Une valeur manque** (température de l'enceinte sur une K1C…) : l'imprimante ne
  l'envoie pas ; l'intégration la laisse vide plutôt que d'inventer un 0.

Le protocole des imprimantes n'est pas documenté par Creality : cette intégration
utilise ce que les imprimantes envoient sur votre réseau local. Une mise à jour du
firmware peut changer un champ ; ouvrez une issue sur le dépôt GitHub si quelque
chose ne marche plus.
