# DONKO ADS — Guide d'installation

Un seul service à configurer (Google Sheets + Apps Script). Votre clé FedaPay est déjà intégrée dans le code.

## 1. Le Google Sheet (votre base de données)

1. Allez sur [sheets.google.com](https://sheets.google.com) → **Nouveau classeur** → nommez-le "Donko Ads".
2. Renommez l'onglet du bas en **Boutiques** (exactement ce nom, sensible à la casse).
3. En ligne 1, mettez ces en-têtes, une par colonne (A à V) :
   ```
   ID | Date | Nom | Categorie | Pays | Ville | Description | Adresse | Contact | Lien | Logo |
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
  ADMIN_PASSCODE: 'donko2026',                              // ← changez ce code secret
  ...
};
```

Remplacez `APPS_SCRIPT_URL` par l'URL copiée à l'étape 2, et changez `ADMIN_PASSCODE` pour un code que vous seul connaissez. Enregistrez.

## 4. Mettre en ligne (GitHub Pages, comme Kalcul)

1. Créez un nouveau dépôt GitHub (ou réutilisez un dépôt existant).
2. Décompressez ce ZIP et déposez **tous les fichiers en gardant leur arborescence** (le dossier `icons/` doit rester à la racine, à côté de `index.html`).
3. Paramètres du dépôt → **Pages** → activez GitHub Pages sur la branche principale.
4. Votre site sera accessible à `https://votre-compte.github.io/nom-du-depot`.

⚠️ Je ne peux pas effectuer cette mise en ligne à votre place : je n'ai pas accès à votre compte GitHub. Tout est prêt, il ne reste que ce dépôt à faire.

## Ce qui est inclus

- **index.html** — l'application complète, organisée en 3 vues (accessibles depuis la barre du bas) pour ne pas mélanger les annonces avec la gestion du compte :
  - **Accueil** : recherche, filtre par catégorie, localisation (Pays → Ville en cascade, zone UEMOA), galerie 2 colonnes triée par mise en avant (Boost) puis par plan.
  - **Publier (bouton + central)** : création de boutique — nom, catégorie, **Pays puis Ville** (la ville affichée dépend du pays choisi), adresse, **téléphone pré-rempli avec l'indicatif et un exemple du pays choisi**, logo, jusqu'à 4 images, vidéo. Affiche le nombre de publications gratuites restantes.
  - **Pro** : abonnement en cours + historique des abonnements et boosts, les 8 plans (-15 % supplémentaire, prix barré + prix réduit), **Mes boutiques** avec un bouton « Booster » directement sur chacune, sauvegarde/restauration, code d'accès pro (admin).
  - Deux boutons ronds clignotants (WhatsApp / Email) flottent en bas à droite sur toutes les pages pour envoyer une suggestion sans quitter l'app.
  - Français/Anglais, thème clair/sombre, installation PWA.
- **apps-script-backend.gs** — le code à coller dans Google Apps Script.
- **manifest.json** + **sw.js** — rendent l'app installable et utilisables hors connexion (sauf pour actualiser les annonces ou payer).
- **icons/** — logo aux formats favicon, PWA (192/512), Apple touch icon.

## Fonctionnement du mode Admin (accès pro)

Cliquez sur « Accès pro » en bas du formulaire, entrez le code défini dans `ADMIN_PASSCODE`. Depuis l'appareil où vous l'entrez :
- vous pouvez publier sans paiement, avec une durée personnalisée ;
- pour offrir un accès gratuit ou une réduction à un client précis, ouvrez simplement le Google Sheet et modifiez la colonne **Expiration** de sa ligne (aucune formule requise, juste une date).

## Points d'honnêteté technique (ce qui a été ajusté par rapport à votre demande initiale)

- **Blocage géographique par pays** : non implémenté tel quel — un blocage par nationalité (incluant des pays comme le Japon, qui n'a rien d'un pays « à risque ») serait à la fois inexact et discriminatoire. La restriction réelle se fait naturellement via FedaPay : seule la publication (paiement) est limitée aux pays qu'il couvre. La consultation du site reste ouverte à tous.
- **Vidéo compressée automatiquement** : la vidéo passe par un lien YouTube/Vimeo (déjà compressé par ces plateformes), et non par un fichier téléversé — un vrai moteur de compression vidéo dans le navigateur serait trop lourd et peu fiable sur mobile.
- **Envoi WhatsApp/Email "sans quitter l'app"** : techniquement impossible sans backend d'envoi (coût, compte professionnel Meta, etc.). Le message est pré-rempli et prêt à envoyer en un tap dans WhatsApp ou votre client mail.
- **Durcissement du code** : le script est encapsulé (IIFE, pas de variables globales) et un message d'avertissement s'affiche dans la console. Une vraie protection contre le contournement de paiement nécessiterait un serveur — ce que ce projet n'a pas, par choix.
- **Mise en production** : je ne peux pas publier à votre place sur GitHub (pas d'accès à votre compte) ; tout est prêt pour que vous le fassiez en quelques minutes (étape 4 ci-dessus).

## Tests effectués avant livraison

Le fichier a été testé automatiquement (navigateur headless) : chargement sans erreur, changement de langue/thème, ouverture des modales, filtre par catégorie, recherche, tri (boost puis plan), soumission du formulaire avec compression d'image, calcul des prix (-15 %). Tout fonctionne comme prévu dans ces scénarios.
