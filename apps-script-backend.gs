/**
 * DONKO ADS — Backend (Google Apps Script)
 * ----------------------------------------------------
 * Ce script gère DEUX classeurs (onglets) dans le même Google Sheet :
 *  - "Boutiques" : le profil de chaque boutique créée par un vendeur.
 *  - "Annonces"  : les publicités/produits publiés, chacune rattachée à
 *                  une boutique (colonne BoutiqueID).
 *
 * INSTALLATION (5 minutes) :
 * 1. sheets.google.com → Nouveau classeur → nommez-le "Donko Ads".
 * 2. Renommez le premier onglet (en bas) en "Boutiques" (exactement ce nom).
 *    Ligne 1, en-têtes (A à M) :
 *    ID | Date | Nom | Categorie | Pays | Ville | Adresse | Contact | Description | Devise | Logo | Boost | BoostExpiration
 * 3. Créez un second onglet (clic sur le "+" en bas), nommez-le "Annonces".
 *    Ligne 1, en-têtes (A à Q) :
 *    ID | BoutiqueID | Date | Lien | Description | Prix | PrixMode | Contact |
 *    Image1 | Image2 | Image3 | Image4 | VideoURL | Plan | PlanWeight | Expiration | TxnId
 * 4. Extensions > Apps Script → collez tout ce fichier (remplacez le code par défaut).
 * 5. Déployer > Nouveau déploiement > icône engrenage > Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 * 6. Copiez l'URL /exec → collez-la dans CONFIG.APPS_SCRIPT_URL de index.html.
 *
 * ⚠️ TANT QUE CETTE URL N'EST PAS COLLÉE DANS index.html, L'APPLICATION NE PEUT
 * RIEN SAUVEGARDER NI PARTAGER : chaque "publication" échouera silencieusement
 * côté serveur (même si un message d'erreur clair s'affiche désormais côté
 * application). C'est ce script, une fois déployé, qui sert de base de données
 * commune : sans lui, aucun visiteur ne peut voir les boutiques/annonces des
 * autres, chacun ne verrait que sa propre copie locale (vide).
 *
 * GESTION MANUELLE (accès gratuit / réduction / suppression / modération) :
 * Vous êtes propriétaire de ce Google Sheet — vous pouvez à tout moment,
 * directement dans les cellules :
 *  - modifier "Expiration" (onglet Annonces) pour prolonger/raccourcir un accès ;
 *  - modifier "BoostExpiration" (onglet Boutiques) pour offrir/retirer une mise en avant ;
 *  - supprimer une ligne pour effacer définitivement une boutique ou une annonce.
 *
 * Pour republier une nouvelle version de ce code : Déployer > Gérer les déploiements
 * > crayon > Nouvelle version > Déployer (l'URL /exec ne change pas).
 */

const SHEET_BOUTIQUES = 'Boutiques';
const SHEET_ANNONCES = 'Annonces';

const HEADERS_BOUTIQUES = ['ID','Date','Nom','Categorie','Pays','Ville','Adresse','Contact','Description','Devise','Logo','Boost','BoostExpiration'];
const HEADERS_ANNONCES = ['ID','BoutiqueID','Date','Lien','Description','Prix','PrixMode','Contact',
  'Image1','Image2','Image3','Image4','VideoURL','Plan','PlanWeight','Expiration','TxnId'];

function _ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function _sheetBoutiques(){ return _ss().getSheetByName(SHEET_BOUTIQUES); }
function _sheetAnnonces(){ return _ss().getSheetByName(SHEET_ANNONCES); }

function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _rowsToObjects(values){
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => { const o = {}; headers.forEach((h,i)=>{ o[h]=row[i]; }); return o; });
}
function _findRowIndexById(values, id){
  const idCol = values[0].indexOf('ID');
  for (let r = 1; r < values.length; r++) if (values[r][idCol] === id) return r;
  return -1;
}

/* ================== doGet : lecture publique ================== */
function doGet(e) {
  const now = new Date();

  const boutiques = _rowsToObjects(_sheetBoutiques().getDataRange().getValues());
  let annonces = _rowsToObjects(_sheetAnnonces().getDataRange().getValues())
    .filter(a => !a.Expiration || new Date(a.Expiration) > now);

  // On "joint" chaque annonce avec les infos utiles de sa boutique, pour que
  // l'application n'ait pas à faire une seconde requête.
  const boutiquesById = {};
  boutiques.forEach(b => { boutiquesById[b.ID] = b; });
  annonces = annonces.map(a => {
    const b = boutiquesById[a.BoutiqueID] || {};
    return Object.assign({}, a, {
      BoutiqueNom: b.Nom || '', Categorie: b.Categorie || '', Pays: b.Pays || '',
      Ville: b.Ville || '', BoutiqueLogo: b.Logo || '', BoutiqueDevise: b.Devise || 'XOF'
    });
  });

  // Boutiques actuellement boostées (visibles publiquement en "vitrine")
  const boutiquesBoostees = boutiques.filter(b => b.Boost && b.BoostExpiration && new Date(b.BoostExpiration) > now);

  return _json({ success: true, annonces: annonces, boutiques: boutiques, boutiquesBoostees: boutiquesBoostees });
}

/* ================== doPost : écriture ================== */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'addBoutique':    return _addBoutique(data);
      case 'updateBoutique': return _updateBoutique(data);
      case 'deleteBoutique': return _deleteBoutique(data);
      case 'boostBoutique':  return _boostBoutique(data);
      case 'addAnnonce':     return _addAnnonce(data);
      case 'updateAnnonce':  return _updateAnnonce(data);
      case 'deleteAnnonce':  return _deleteAnnonce(data);
      case 'renew':          return _renewAnnonces(data);
      case 'adminGrant':     return _adminGrant(data);
      default: throw new Error('Action inconnue : ' + data.action);
    }
  } catch (err) {
    return _json({ success: false, error: err.toString() });
  }
}

/* ---------------- Boutiques ---------------- */
function _addBoutique(data){
  if(!data.name || !data.category) throw new Error('Nom ou catégorie manquant.');
  const sheet = _sheetBoutiques();
  const id = Utilities.getUuid();
  const row = HEADERS_BOUTIQUES.map(h => {
    switch(h){
      case 'ID': return id;
      case 'Date': return new Date();
      case 'Nom': return data.name || '';
      case 'Categorie': return data.category || '';
      case 'Pays': return data.country || '';
      case 'Ville': return data.city || '';
      case 'Adresse': return data.address || '';
      case 'Contact': return data.contact || '';
      case 'Description': return data.description || '';
      case 'Devise': return data.currency || 'XOF';
      case 'Logo': return data.logo || '';
      case 'Boost': return false;
      case 'BoostExpiration': return '';
      default: return '';
    }
  });
  sheet.appendRow(row);
  return _json({ success:true, id: id });
}

function _updateBoutique(data){
  if(!data.id) throw new Error('ID manquant.');
  const sheet = _sheetBoutiques();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Boutique introuvable.');
  const headers = values[0];
  const fieldMap = { name:'Nom', category:'Categorie', country:'Pays', city:'Ville', address:'Adresse',
    contact:'Contact', description:'Description', currency:'Devise', logo:'Logo' };
  Object.keys(fieldMap).forEach(key=>{
    if(typeof data[key] !== 'undefined'){
      sheet.getRange(r+1, headers.indexOf(fieldMap[key])+1).setValue(data[key]);
    }
  });
  return _json({ success:true });
}

function _deleteBoutique(data){
  if(!data.id) throw new Error('ID manquant.');
  const bSheet = _sheetBoutiques();
  const bValues = bSheet.getDataRange().getValues();
  const r = _findRowIndexById(bValues, data.id);
  if(r === -1) throw new Error('Boutique introuvable.');
  bSheet.deleteRow(r+1);

  // Supprime en cascade toutes les annonces de cette boutique.
  const aSheet = _sheetAnnonces();
  const aValues = aSheet.getDataRange().getValues();
  const boutiqueCol = aValues[0].indexOf('BoutiqueID');
  for(let i = aValues.length - 1; i >= 1; i--){
    if(aValues[i][boutiqueCol] === data.id) aSheet.deleteRow(i+1);
  }
  return _json({ success:true });
}

function _boostBoutique(data){
  if(!data.id || !data.boostExpiration) throw new Error('ID ou date de boost manquant.');
  const sheet = _sheetBoutiques();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Boutique introuvable.');
  const headers = values[0];
  sheet.getRange(r+1, headers.indexOf('Boost')+1).setValue(true);
  sheet.getRange(r+1, headers.indexOf('BoostExpiration')+1).setValue(data.boostExpiration);
  return _json({ success:true });
}

/* ---------------- Annonces ---------------- */
function _addAnnonce(data){
  if(!data.boutiqueId || !data.description) throw new Error('Boutique ou description manquante.');
  const sheet = _sheetAnnonces();
  const id = Utilities.getUuid();
  const row = HEADERS_ANNONCES.map(h=>{
    switch(h){
      case 'ID': return id;
      case 'BoutiqueID': return data.boutiqueId;
      case 'Date': return new Date();
      case 'Lien': return data.link || '';
      case 'Description': return data.description || '';
      case 'Prix': return data.price || '';
      case 'PrixMode': return data.priceMode || 'nonbarre';
      case 'Contact': return data.contact || '';
      case 'Image1': return data.image1 || '';
      case 'Image2': return data.image2 || '';
      case 'Image3': return data.image3 || '';
      case 'Image4': return data.image4 || '';
      case 'VideoURL': return data.videoUrl || '';
      case 'Plan': return data.plan || '';
      case 'PlanWeight': return data.planWeight || 0;
      case 'Expiration': return data.expiry || '';
      case 'TxnId': return data.txnId || '';
      default: return '';
    }
  });
  sheet.appendRow(row);
  return _json({ success:true, id: id });
}

function _updateAnnonce(data){
  if(!data.id) throw new Error('ID manquant.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Annonce introuvable.');
  const headers = values[0];
  const fieldMap = { link:'Lien', description:'Description', price:'Prix', priceMode:'PrixMode',
    contact:'Contact', image1:'Image1', image2:'Image2', image3:'Image3', image4:'Image4', videoUrl:'VideoURL' };
  Object.keys(fieldMap).forEach(key=>{
    if(typeof data[key] !== 'undefined'){
      sheet.getRange(r+1, headers.indexOf(fieldMap[key])+1).setValue(data[key]);
    }
  });
  return _json({ success:true });
}

function _deleteAnnonce(data){
  if(!data.id) throw new Error('ID manquant.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Annonce introuvable.');
  sheet.deleteRow(r+1);
  return _json({ success:true });
}

// Réactive automatiquement une ou plusieurs annonces (même expirées) avec le
// nouveau plan payé, sans que le vendeur ait à tout republier.
function _renewAnnonces(data){
  if(!data.ids || !data.ids.length) throw new Error('Aucune annonce à renouveler.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const planCol = headers.indexOf('Plan'), weightCol = headers.indexOf('PlanWeight'), expCol = headers.indexOf('Expiration');
  let renewed = 0;
  data.ids.forEach(id=>{
    const r = _findRowIndexById(values, id);
    if(r !== -1){
      sheet.getRange(r+1, planCol+1).setValue(data.plan || '');
      sheet.getRange(r+1, weightCol+1).setValue(data.planWeight || 0);
      sheet.getRange(r+1, expCol+1).setValue(data.expiry || '');
      renewed++;
    }
  });
  return _json({ success:true, renewed: renewed });
}

// Outil admin : accorder/modifier l'accès de n'importe quelle annonce depuis l'app.
function _adminGrant(data){
  if(!data.id) throw new Error('ID manquant.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Annonce introuvable.');
  const headers = values[0];
  if(data.expiry) sheet.getRange(r+1, headers.indexOf('Expiration')+1).setValue(data.expiry);
  if(data.plan) sheet.getRange(r+1, headers.indexOf('Plan')+1).setValue(data.plan);
  if(typeof data.planWeight !== 'undefined') sheet.getRange(r+1, headers.indexOf('PlanWeight')+1).setValue(data.planWeight);
  return _json({ success:true });
}
