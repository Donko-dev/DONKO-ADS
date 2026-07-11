/**
 * DONKO ADS — Backend (Google Apps Script)
 * ----------------------------------------------------
 * INSTALLATION (5 minutes) :
 * 1. sheets.google.com → Nouveau classeur → nommez-le "Donko Ads".
 * 2. Renommez l'onglet du bas en "Boutiques" (exactement ce nom).
 * 3. Ligne 1, collez ces en-têtes, une par colonne (A à W) :
 *    ID | Date | Nom | Categorie | Pays | Ville | Description | Prix | Adresse | Contact | Lien | Logo |
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
 *  - modifier "BoostExpiration" pour offrir ou retirer la mise en avant ;
 *  - supprimer directement la ligne pour effacer définitivement une annonce.
 * Aucune formule requise : une date au format ISO (ex: 2026-12-31) suffit.
 *
 * Pour republier une nouvelle version de ce code : Déployer > Gérer les déploiements
 * > crayon > Nouvelle version > Déployer (l'URL /exec ne change pas).
 */

const SHEET_NAME = 'Boutiques';
const HEADERS = ['ID','Date','Nom','Categorie','Pays','Ville','Description','Prix','Adresse','Contact','Lien','Logo',
  'Image1','Image2','Image3','Image4','VideoURL','Plan','PlanWeight',
  'Expiration','Boost','BoostExpiration','TxnId'];

function _sheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}
function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _findRowById(values, id){
  const idCol = values[0].indexOf('ID');
  for (let r = 1; r < values.length; r++) {
    if (values[r][idCol] === id) return r; // index dans "values" (0-based, ligne réelle = r+1)
  }
  return -1;
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

  return _json({ success: true, listings: listings });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = _sheet();

    switch (data.action) {
      case 'boost':  return _handleBoost(sheet, data);
      case 'renew':  return _handleRenew(sheet, data);
      case 'delete': return _handleDelete(sheet, data);
      case 'adminGrant': return _handleAdminGrant(sheet, data);
      default:       return _handleAdd(sheet, data);
    }
  } catch (err) {
    return _json({ success: false, error: err.toString() });
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
      case 'Prix': return data.price || '';
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
  return _json({ success: true, id: id });
}

function _handleBoost(sheet, data) {
  if (!data.id || !data.boostExpiration) throw new Error('ID ou date de boost manquant.');
  const values = sheet.getDataRange().getValues();
  const r = _findRowById(values, data.id);
  if (r === -1) throw new Error('Annonce introuvable pour ce boost.');
  const headers = values[0];
  sheet.getRange(r + 1, headers.indexOf('Boost') + 1).setValue(true);
  sheet.getRange(r + 1, headers.indexOf('BoostExpiration') + 1).setValue(data.boostExpiration);
  return _json({ success: true });
}

// Réactive automatiquement une ou plusieurs annonces existantes (même expirées)
// avec le nouveau plan payé, SANS que le vendeur ait à republier son contenu.
function _handleRenew(sheet, data) {
  if (!data.ids || !data.ids.length) throw new Error('Aucune annonce à renouveler.');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const planCol = headers.indexOf('Plan');
  const weightCol = headers.indexOf('PlanWeight');
  const expCol = headers.indexOf('Expiration');
  let renewed = 0;

  data.ids.forEach(id => {
    const r = _findRowById(values, id);
    if (r !== -1) {
      sheet.getRange(r + 1, planCol + 1).setValue(data.plan || '');
      sheet.getRange(r + 1, weightCol + 1).setValue(data.planWeight || 0);
      sheet.getRange(r + 1, expCol + 1).setValue(data.expiry || '');
      renewed++;
    }
  });
  return _json({ success: true, renewed: renewed });
}

function _handleDelete(sheet, data) {
  if (!data.id) throw new Error('ID manquant.');
  const values = sheet.getDataRange().getValues();
  const r = _findRowById(values, data.id);
  if (r === -1) throw new Error('Annonce introuvable.');
  sheet.deleteRow(r + 1);
  return _json({ success: true });
}

// Permet à l'administrateur (vous) d'accorder ou de modifier l'accès de N'IMPORTE
// QUELLE annonce directement depuis l'application (section Admin de la page Pro),
// sans avoir besoin d'ouvrir le Google Sheet.
function _handleAdminGrant(sheet, data) {
  if (!data.id) throw new Error('ID manquant.');
  const values = sheet.getDataRange().getValues();
  const r = _findRowById(values, data.id);
  if (r === -1) throw new Error('Annonce introuvable.');
  const headers = values[0];
  if (data.expiry) sheet.getRange(r + 1, headers.indexOf('Expiration') + 1).setValue(data.expiry);
  if (data.plan) sheet.getRange(r + 1, headers.indexOf('Plan') + 1).setValue(data.plan);
  if (typeof data.planWeight !== 'undefined') sheet.getRange(r + 1, headers.indexOf('PlanWeight') + 1).setValue(data.planWeight);
  return _json({ success: true });
}
