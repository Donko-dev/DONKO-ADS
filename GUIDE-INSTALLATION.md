# DONKO ADS — Guide d'installation

Tous les fichiers sont à plat (aucun dossier) : vous pouvez tout téléverser directement depuis votre téléphone sur GitHub. Un seul service à configurer (Google Sheets + Apps Script). Votre clé FedaPay est déjà intégrée dans le code.

## 1. Le Google Sheet (votre base de données)

1. Allez sur [sheets.google.com](https://sheets.google.com) → **Nouveau classeur** → nommez-le "Donko Ads".
2. Renommez l'onglet du bas en **Boutiques** (exactement ce nom, sensible à la casse).
3. En ligne 1, mettez ces en-têtes, une par colonne (A à W) :
   ```
   ID | Date | Nom | Categorie | Pays | Ville | Description | Prix | Adresse | Contact | Lien | Logo |
   Image1 | Image2 | Image3 | Image4 | VideoURL | Plan | PlanWeight |
   Expiration | Boost | BoostExpiration | TxnId
   ```

## 2. Le backend (Google Apps Script)

1. Dans ce même Sheet : menu **Extensions > Apps Script**.
2. Supprimez le code par défaut, collez tout le contenu de `apps-script-backend.gs`.
3. **Déployer > Nouveau déploiement** → icône engrenage → **Application Web**.
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
4. Cliquez **Déployer**, autorisez (c'est votre propre script), copiez l'URL qui finit par `/exec`.

## 3. Configurer `index.html`

Ouvrez `index.html`, cherchez `CONFIG` tout en haut du `<script>` :

```js
const CONFIG = {
  FEDAPAY_PUBLIC_KEY: 'pk_live_9iYiCnrfVLTqtOQ6-aDRynRV',  // déjà rempli
  APPS_SCRIPT_URL: 'VOTRE_URL_APPS_SCRIPT_/exec',           // ← à remplacer
  ADMIN_PASSCODE_HASH: '081c544d...72cc',                   // ← à remplacer (voir plus bas)
  ...
};
```

Remplacez `APPS_SCRIPT_URL` par l'URL copiée à l'étape 2.

⚠️ **Important, à lire avant de publier** : `index.html` est un fichier public — n'importe qui peut faire "Afficher le code source" sur votre site une fois en ligne. Pour cette raison, votre code d'accès pro n'est **jamais** stocké en clair, ni dans `index.html`, ni dans ce guide (qui sera lui aussi public dans votre dépôt) : seule son empreinte (hash SHA-256) apparaît dans le code, illisible pour qui la regarde.

**Pour définir votre propre code**, ouvrez la console de votre navigateur (F12, onglet "Console") sur n'importe quelle page, et collez ceci en remplaçant `VotreCodeSecret` par le code de votre choix :

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('VotreCodeSecret'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')));
```

Copiez le résultat affiché, collez-le comme valeur de `ADMIN_PASSCODE_HASH` dans `index.html`, enregistrez. Gardez votre code de côté (dans un gestionnaire de mots de passe par exemple) : lui seul déverrouille l'accès pro, l'empreinte ne peut pas être "retransformée" en code.

## 4. Personnaliser le message du ruban défilant

Juste après le bloc `CONFIG`, cherchez ce commentaire dans `index.html` :

```js
const RIBBON_MESSAGES = {
  fr: "👋 Bienvenue sur DONKO ADS — ...",
  en: "👋 Welcome to DONKO ADS — ..."
};
```

Remplacez simplement ces deux textes (français et anglais) chaque fois que vous voulez afficher un autre message à vos utilisateurs, puis republiez `index.html` sur GitHub.

## 5. Mettre en ligne (GitHub Pages, depuis votre téléphone)

1. Créez un nouveau dépôt GitHub (ou réutilisez un dépôt existant).
2. Décompressez ce ZIP : tous les fichiers sont à la racine, sans dossier — ajoutez-les un par un (ou en sélection multiple) via **Add file > Upload files** sur GitHub.
3. Paramètres du dépôt → **Pages** → activez GitHub Pages sur la branche principale.
4. Votre site sera accessible à `https://votre-compte.github.io/nom-du-depot`.
5. Pensez à corriger l'URL dans `robots.txt`, `sitemap.xml` et les balises `og:url`/`canonical` d'`index.html` avec votre adresse réelle une fois connue.

⚠️ Je ne peux pas effectuer cette mise en ligne à votre place : je n'ai pas accès à votre compte GitHub. Tout est prêt, il ne reste que ce dépôt à faire.

## Ce qui est inclus

- **index.html** — l'application complète, organisée en 3 vues (barre du bas) :
  - **Accueil** : ruban défilant, recherche, devise d'affichage (FCFA/EUR/USD/GBP), filtre catégorie, localisation (Pays → Ville en cascade, zone UEMOA), galerie 2 colonnes triée par mise en avant (Boost) puis par plan, prix affiché dans la devise choisie par le visiteur.
  - **Publier** (bouton + central) : nom, catégorie, Pays → Ville, adresse, téléphone pré-rempli selon le pays, prix + devise, logo, jusqu'à 4 images, vidéo. Limites : 3 boutiques (noms) maximum par appareil, 100 publications par boutique, 300 au total.
  - **Pro** : abonnement en cours + historique, les 8 plans (-15 %, prix barré + réduit, convertibles dans la devise choisie — le paiement réel reste toujours en FCFA via FedaPay), **Mes boutiques** avec boutons Booster et Supprimer sur chacune, sauvegarde/restauration, code d'accès pro (admin).
  - Boutons flottants WhatsApp/Email (vraies icônes SVG, clignotantes) en bas à droite partout.
  - Bouton d'installation qui clignote/vibre tant que l'app n'est pas installée, disparaît automatiquement une fois installée (détection du mode standalone + événement `appinstalled`), et réapparaît si l'utilisateur désinstalle l'app ou revient dans le navigateur.
  - Texte d'accroche animé façon "machine à écrire" (boucle continue, cycle complet en 1 minute).
  - Français/Anglais, thème clair/sombre, installation PWA, métadonnées SEO (description, Open Graph, Twitter Card, JSON-LD).
- **apps-script-backend.gs** — le code à coller dans Google Apps Script (ajout, boost, **renouvellement automatique**, suppression, octroi d'accès admin).
- **manifest.json** + **sw.js** — rendent l'app installable et utilisable hors connexion (sauf pour actualiser les annonces ou payer).
- **robots.txt** + **sitemap.xml** — pour l'indexation par les moteurs de recherche.
- Icônes : `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `logo-icon.svg`.

## Fonctionnement du mode Admin (vous, en illimité)

Sur la page **Pro**, cliquez sur « Accès pro », entrez le code que vous avez choisi (celui dont vous avez généré l'empreinte à l'étape 3). Depuis l'appareil où vous l'entrez, vous devenez un utilisateur illimité :
- publications sans limite (les plafonds 3 boutiques / 100 / 300 ne s'appliquent plus à vous) ;
- publication sans paiement, avec une durée personnalisée ;
- un outil **« Donner un accès à n'importe quel utilisateur »** apparaît : choisissez une boutique dans la liste (toutes celles actuellement chargées, pas seulement les vôtres), indiquez un nombre de jours, cliquez sur Appliquer — son accès est mis à jour instantanément, sans passer par le Google Sheet.
- vous pouvez aussi, si vous préférez, modifier directement la colonne **Expiration** de n'importe quelle ligne dans le Sheet.

## Renouvellement automatique des annonces

Quand un vendeur repaie un abonnement (quel que soit le plan), **toutes** ses boutiques déjà publiées depuis son appareil (même expirées) sont automatiquement réactivées avec le nouveau plan et son classement — sans qu'il ait besoin de tout republier. S'il veut modifier le contenu d'une annonce (texte, images, prix...), il republie simplement une nouvelle fiche : la limite de 300/100 par boutique en tient compte, il peut donc supprimer l'ancienne version avant d'en publier une nouvelle.

⚠️ Comme il n'y a pas de compte utilisateur, ce suivi ("mes boutiques") reste local à l'appareil qui a publié — un vendeur changeant de téléphone doit utiliser Sauvegarde/Restauration pour conserver ce lien.

## Devises et prix

Le champ "Prix" du formulaire est optionnel. Le vendeur choisit la devise dans laquelle il saisit son prix (FCFA, EUR, USD, GBP) ; il est automatiquement converti et stocké en FCFA. Tout visiteur peut ensuite choisir sa devise d'affichage préférée sur la page d'accueil (et sur la page Pro pour les plans), sans que cela affecte le vendeur. Le taux FCFA/EUR est un taux fixe réel (parité officielle 1 € = 655,957 FCFA) ; les taux USD et GBP sont indicatifs et approximatifs — vous pouvez les ajuster dans `index.html`, bloc `CURRENCIES`, si besoin.

## Référencement (SEO)

Le site inclut des métadonnées complètes (description, mots-clés, Open Graph, Twitter Card, JSON-LD, robots.txt, sitemap.xml) pour que **l'application elle-même** soit bien référencée sur Google et les réseaux sociaux. 

Point important à comprendre : DONKO ADS étant une application "tout en un fichier" qui charge les annonces dynamiquement depuis Google Sheets, les moteurs de recherche ne peuvent pas indexer chaque boutique individuellement comme une page à part (il n'y a pas d'URL unique par annonce). C'est un choix cohérent avec le principe "sans serveur, sans base de données à gérer" du projet — une indexation par annonce demanderait un vrai serveur générant une page par produit. 

La stratégie qui fonctionne avec cette architecture, et que je vous recommande : faites la promotion de DONKO ADS lui-même (réseaux sociaux, bouche-à-oreille, WhatsApp) plutôt que de chaque annonce. Les vendeurs viennent publier, les acheteurs viennent chercher directement dans l'app — exactement comme vous le proposiez.

## Points d'honnêteté technique (ajustements par rapport aux demandes initiales)

- **Blocage géographique par pays** : non implémenté par nationalité (un pays comme le Japon n'a rien de "dangereux") — la restriction réelle passe par FedaPay, qui ne prend en charge que certains pays pour le paiement. La consultation reste ouverte à tous.
- **Vidéo compressée automatiquement** : passe par un lien YouTube/Vimeo (déjà compressé par ces plateformes) plutôt qu'un fichier téléversé.
- **Envoi WhatsApp/Email "sans quitter l'app"** : le message est pré-rempli, prêt à envoyer en un tap — un vrai envoi silencieux nécessiterait un service payant tiers.
- **3 boutiques / 100 par boutique** : comme l'app n'a pas de compte utilisateur ni de vraie hiérarchie boutique→produits, une "boutique" correspond au nom saisi dans le champ "Nom de l'entreprise" (plusieurs annonces partageant exactement le même nom comptent comme la même boutique).
- **Durcissement du code** : le script est encapsulé (IIFE), sans minification agressive (risque de bugs sans outil fiable disponible) — une vraie protection contre le contournement de paiement nécessiterait un serveur.
- **Mise en production** : je ne peux pas publier à votre place sur GitHub (pas d'accès à votre compte) ; tout est prêt pour que vous le fassiez en quelques minutes.

## Tests effectués avant livraison

Testé automatiquement (navigateur headless) : ruban défilant, animation machine à écrire, bannière d'installation (visible/masquée selon le mode), cascade Pays→Ville→téléphone, changement de devise, soumission avec prix et limites (boutiques/annonces bloquées puis autorisées selon les seuils), suppression d'annonce, outil admin d'octroi d'accès. Aucune erreur JavaScript détectée dans ces scénarios.
