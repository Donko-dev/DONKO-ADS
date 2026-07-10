/**
 * DONKO ADS — Backend (Google Apps Script)
 * ----------------------------------------------------
 * INSTALLATION (5 minutes) :
 * 1. sheets.google.com → Nouveau classeur → nommez-le "Donko Ads".
 * 2. Renommez l'onglet du bas en "Boutiques" (exactement ce nom).
 * 3. Ligne 1, collez ces en-têtes, une par colonne (A à V) :
 *    ID | Date | Nom | Categorie | Pays | Ville | Description | Adresse | Contact | Lien | Logo |
 *    Image1 | Image2 | Image3 | Image4 | VideoURL | Plan | PlanWeight |
 *    Expiration | Boost | BoostExpiration | TxnId
 * 4. Extensions > Apps Script → collez tout ce fichier (remplacez le code par défaut).
 * 5. Déployer > Nouveau déploiement > icône engrenage > Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 * 6. Copiez l'URL /exec → collez-la dans CONFIG.APPS_SCRIPT_URL de index.html.
 *
 * GESTION MANUELLE (accès gratuit / réduction / suppression) :
 * Vous êtes propriétaire de ce Google Sheet — vous pouvez à tout moment,
 * directement dans les cellules :
 *  - modifier la colonne "Expiration" d'une ligne pour prolonger ou raccourcir un accès ;
 *  - vider la colonne "Expiration" pour désactiver une annonce immédiatement ;
 *  - modifier "BoostExpiration" pour offrir ou retirer la mise en avant.
 * Aucune formule requise : une date au format ISO (ex: 2026-12-31) suffit.
 *
 * Pour republier une nouvelle version de ce code : Déployer > Gérer les déploiements
 * > crayon > Nouvelle version > Déployer (l'URL /exec ne change pas).
 */

const SHEET_NAME = 'Boutiques';
const HEADERS = ['ID','Date','Nom','Categorie','Pays','Ville','Description','Adresse','Contact','Lien','Logo',
  'Image1','Image2','Image3','Image4','VideoURL','Plan','PlanWeight',
  'Expiration','Boost','BoostExpiration','TxnId'];

function _sheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function doGet(e) {
  const sheet = _sheet();
  const range = sheet.getDataRange().getValues();
  const headers = range.shift();
  const now = new Date();

  const listings = range
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    })
    .filter(item => !item.Expiration || new Date(item.Expiration) > now);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, listings: listings }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = _sheet();

    if (data.action === 'boost') {
      return _handleBoost(sheet, data);
    }
    return _handleAdd(sheet, data);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function _handleAdd(sheet, data) {
  if (!data.name || !data.description || !data.category) {
    throw new Error('Champs requis manquants (nom, description ou catégorie).');
  }
  const id = Utilities.getUuid();
  const now = new Date();

  const row = HEADERS.map(h => {
    switch (h) {
      case 'ID': return id;
      case 'Date': return now;
      case 'Nom': return data.name || '';
      case 'Categorie': return data.category || '';
      case 'Pays': return data.country || '';
      case 'Ville': return data.city || '';
      case 'Description': return data.description || '';
      case 'Adresse': return data.address || '';
      case 'Contact': return data.contact || '';
      case 'Lien': return data.link || '';
      case 'Logo': return data.logo || '';
      case 'Image1': return data.image1 || '';
      case 'Image2': return data.image2 || '';
      case 'Image3': return data.image3 || '';
      case 'Image4': return data.image4 || '';
      case 'VideoURL': return data.videoUrl || '';
      case 'Plan': return data.plan || '';
      case 'PlanWeight': return data.planWeight || 0;
      case 'Expiration': return data.expiry || '';
      case 'Boost': return false;
      case 'BoostExpiration': return '';
      case 'TxnId': return data.txnId || '';
      default: return '';
    }
  });

  sheet.appendRow(row);
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, id: id }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _handleBoost(sheet, data) {
  if (!data.id || !data.boostExpiration) {
    throw new Error('ID ou date de boost manquant.');
  }
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('ID');
  const boostCol = headers.indexOf('Boost');
  const boostExpCol = headers.indexOf('BoostExpiration');

  for (let r = 1; r < values.length; r++) {
    if (values[r][idCol] === data.id) {
      sheet.getRange(r + 1, boostCol + 1).setValue(true);
      sheet.getRange(r + 1, boostExpCol + 1).setValue(data.boostExpiration);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  throw new Error('Annonce introuvable pour ce boost.');
}
