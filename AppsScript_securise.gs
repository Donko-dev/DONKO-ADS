/**
 * DONKO ADS — Backend (Google Apps Script) — VERSION SÉCURISÉE
 * ----------------------------------------------------
 * ⚠️⚠️ ÉTAPE OBLIGATOIRE AVANT DE DÉPLOYER CE CODE ⚠️⚠️
 * Ce code ajoute une nouvelle colonne "OwnerToken" à chaque onglet.
 * AVANT de déployer une nouvelle version, ouvrez votre Google Sheet et
 * ajoutez manuellement l'en-tête suivant (juste le mot, dans la cellule) :
 *   - Onglet "Boutiques" → cellule N1 → écrivez : OwnerToken
 *   - Onglet "Annonces"  → cellule R1 → écrivez : OwnerToken
 * Si vous sautez cette étape, le script plantera dès la première
 * modification/suppression (erreur "colonne introuvable").
 *
 * CE QUI A CHANGÉ ET POURQUOI :
 *
 * 1) JETON PROPRIÉTAIRE (OwnerToken) — la faille la plus grave.
 *    Avant, n'importe qui connaissant (ou devinant) l'ID d'une boutique ou
 *    d'une annonce — visible publiquement via doGet() — pouvait la modifier
 *    ou la supprimer, sans être son créateur. Désormais, chaque boutique et
 *    chaque annonce enregistre le "jeton" secret généré par l'appareil qui
 *    l'a créée. Modifier/supprimer/booster/renouveler exige de fournir ce
 *    même jeton. Un vendeur ne peut donc plus toucher à la fiche d'un autre.
 *    Les lignes déjà existantes (créées avant ce correctif) n'ont pas de
 *    jeton : elles restent modifiables sans jeton, par transition — c'est
 *    la seule limite technique, inévitable pour des données déjà en place.
 *
 * 2) VÉRIFICATION SERVEUR DU CODE PRO — la faille "accès pro".
 *    Avant, l'action "adminGrant" (donner un accès gratuit à vie à
 *    n'importe quelle annonce) n'était protégée par RIEN côté serveur :
 *    le code pro que vous tapez dans l'app ne servait qu'à afficher le
 *    panneau localement, mais n'importe qui pouvait appeler cette action
 *    directement sans jamais connaître ce code. Désormais, la même
 *    empreinte SHA-256 que dans index.html est aussi vérifiée ICI, côté
 *    serveur, avant d'exécuter quoi que ce soit. Le code pro protège pour
 *    de vrai, pas seulement à l'écran.
 *
 * Le reste (installation des onglets, doGet public, etc.) est inchangé —
 * voir les commentaires d'origine ci-dessous.
 *
 * INSTALLATION (5 minutes) :
 * 1. sheets.google.com → Nouveau classeur → nommez-le "Donko Ads".
 * 2. Renommez le premier onglet (en bas) en "Boutiques" (exactement ce nom).
 *    Ligne 1, en-têtes (A à N) :
 *    ID | Date | Nom | Categorie | Pays | Ville | Adresse | Contact | Description | Devise | Logo | Boost | BoostExpiration | OwnerToken
 * 3. Créez un second onglet (clic sur le "+" en bas), nommez-le "Annonces".
 *    Ligne 1, en-têtes (A à R) :
 *    ID | BoutiqueID | Date | Lien | Description | Prix | PrixMode | Contact |
 *    Image1 | Image2 | Image3 | Image4 | VideoURL | Plan | PlanWeight | Expiration | TxnId | OwnerToken
 * 4. Extensions > Apps Script → collez tout ce fichier (remplacez le code par défaut).
 * 5. Déployer > Nouveau déploiement > icône engrenage > Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 * 6. Copiez l'URL /exec → collez-la dans CONFIG.APPS_SCRIPT_URL de index.html.
 *
 * Pour republier une nouvelle version : Déployer > Gérer les déploiements
 * > crayon > Nouvelle version > Déployer (l'URL /exec ne change pas).
 */

const SHEET_BOUTIQUES = 'Boutiques';
const SHEET_ANNONCES = 'Annonces';

const HEADERS_BOUTIQUES = ['ID','Date','Nom','Categorie','Pays','Ville','Adresse','Contact','Description','Devise','Logo','Boost','BoostExpiration','OwnerToken'];
const HEADERS_ANNONCES = ['ID','BoutiqueID','Date','Lien','Description','Prix','PrixMode','Contact',
  'Image1','Image2','Image3','Image4','VideoURL','Plan','PlanWeight','Expiration','TxnId','OwnerToken'];

// ⚠️ Doit rester STRICTEMENT identique à ADMIN_PASSCODE_HASH dans index.html.
// Si vous changez le code pro dans index.html, changez cette même valeur ici
// (recalculez le SHA-256 du nouveau code) puis redéployez une nouvelle version.
const ADMIN_PASSCODE_HASH = '391a9dc924d6b2a6fde451b85559d328ad52c8f4013f02d94d48e64d7a460e1a';

// Forcé sur VOTRE classeur exact, peu importe comment ce script a été créé
// (attaché ou non à un Sheet) — plus fiable que getActiveSpreadsheet().
const SPREADSHEET_ID = '1QwCS0tW7rhh97UogLRyDI93XOQu0Bqh3rSIQh0AENi8';
function _ss(){ return SpreadsheetApp.openById(SPREADSHEET_ID); }
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

/* ================== SÉCURITÉ : jeton propriétaire + code pro ================== */

// Calcule le SHA-256 d'une chaîne (même algorithme que côté navigateur en JS).
function _sha256Hex(text){
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

// Vrai uniquement si le code pro envoyé par le client correspond réellement
// à l'empreinte enregistrée. C'est la SEULE vérification qui compte : celle
// affichée dans l'app n'est qu'un confort d'interface.
function _isAdminAuthorized(data){
  return !!data.adminSecret && _sha256Hex(data.adminSecret) === ADMIN_PASSCODE_HASH;
}

// Vrai si le jeton fourni par le client correspond au jeton enregistré sur la
// ligne (donc c'est bien l'appareil qui a créé cet élément), OU si la ligne
// est une ancienne ligne sans jeton (créée avant ce correctif — transition).
function _ownerAuthorized(row, headers, data){
  const tokenCol = headers.indexOf('OwnerToken');
  const storedToken = tokenCol > -1 ? row[tokenCol] : '';
  if(!storedToken) return true;
  return !!data.ownerToken && data.ownerToken === storedToken;
}

// Jeton propriétaire d'une boutique (utile pour vérifier qu'une annonce est
// bien publiée par le créateur de la boutique visée).
function _boutiqueOwnerToken(boutiqueId){
  const values = _sheetBoutiques().getDataRange().getValues();
  const r = _findRowIndexById(values, boutiqueId);
  if(r === -1) return null;
  const tokenCol = values[0].indexOf('OwnerToken');
  return tokenCol > -1 ? values[r][tokenCol] : '';
}

/* ================== doGet : lecture publique (inchangé) ================== */
function doGet(e) {
  const now = new Date();

  const boutiques = _rowsToObjects(_sheetBoutiques().getDataRange().getValues());
  let annonces = _rowsToObjects(_sheetAnnonces().getDataRange().getValues())
    .filter(a => !a.Expiration || new Date(a.Expiration) > now);

  const boutiquesById = {};
  boutiques.forEach(b => { boutiquesById[b.ID] = b; });
  annonces = annonces.map(a => {
    const b = boutiquesById[a.BoutiqueID] || {};
    return Object.assign({}, a, {
      BoutiqueNom: b.Nom || '', Categorie: b.Categorie || '', Pays: b.Pays || '',
      Ville: b.Ville || '', BoutiqueLogo: b.Logo || '', BoutiqueDevise: b.Devise || 'XOF'
    });
  });

  const boutiquesBoostees = boutiques.filter(b => b.Boost && b.BoostExpiration && new Date(b.BoostExpiration) > now);

  return _json({ success: true, annonces: annonces, boutiques: boutiques, boutiquesBoostees: boutiquesBoostees });
}

/* ================== doPost : écriture ================== */
function doPost(e) {
  try {
    const data = e.parameter;
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
      case 'OwnerToken': return data.ownerToken || '';
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
  if(!_ownerAuthorized(values[r], headers, data) && !_isAdminAuthorized(data)){
    throw new Error('Non autorisé : cette boutique ne vous appartient pas.');
  }
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
  if(!_ownerAuthorized(bValues[r], bValues[0], data) && !_isAdminAuthorized(data)){
    throw new Error('Non autorisé : cette boutique ne vous appartient pas.');
  }
  bSheet.deleteRow(r+1);

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
  if(!_ownerAuthorized(values[r], headers, data) && !_isAdminAuthorized(data)){
    throw new Error('Non autorisé : cette boutique ne vous appartient pas.');
  }
  sheet.getRange(r+1, headers.indexOf('Boost')+1).setValue(true);
  sheet.getRange(r+1, headers.indexOf('BoostExpiration')+1).setValue(data.boostExpiration);
  return _json({ success:true });
}

/* ---------------- Annonces ---------------- */
function _addAnnonce(data){
  if(!data.boutiqueId || !data.description) throw new Error('Boutique ou description manquante.');
  const shopToken = _boutiqueOwnerToken(data.boutiqueId);
  if(shopToken === null) throw new Error('Boutique introuvable.');
  if(shopToken && shopToken !== data.ownerToken && !_isAdminAuthorized(data)){
    throw new Error('Non autorisé : cette boutique ne vous appartient pas.');
  }
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
      case 'PlanWeight': return Number(data.planWeight) || 0;
      case 'Expiration': return data.expiry || '';
      case 'TxnId': return data.txnId || '';
      case 'OwnerToken': return data.ownerToken || '';
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
  if(!_ownerAuthorized(values[r], headers, data) && !_isAdminAuthorized(data)){
    throw new Error('Non autorisé : cette annonce ne vous appartient pas.');
  }
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
  const headers = values[0];
  if(!_ownerAuthorized(values[r], headers, data) && !_isAdminAuthorized(data)){
    throw new Error('Non autorisé : cette annonce ne vous appartient pas.');
  }
  sheet.deleteRow(r+1);
  return _json({ success:true });
}

// Réactive automatiquement une ou plusieurs annonces (même expirées) avec le
// nouveau plan payé. Seules les annonces appartenant réellement à l'appareil
// (même jeton) — ou toutes, si c'est l'admin — sont renouvelées ; les autres
// sont ignorées silencieusement plutôt que bloquer toute l'opération.
function _renewAnnonces(data){
  if(!data.ids) throw new Error('Aucune annonce à renouveler.');
  const idList = String(data.ids).split(',').filter(x=>x);
  if(!idList.length) throw new Error('Aucune annonce à renouveler.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const planCol = headers.indexOf('Plan'), weightCol = headers.indexOf('PlanWeight'), expCol = headers.indexOf('Expiration');
  const isAdmin = _isAdminAuthorized(data);
  let renewed = 0;
  idList.forEach(id=>{
    const r = _findRowIndexById(values, id);
    if(r !== -1 && (isAdmin || _ownerAuthorized(values[r], headers, data))){
      sheet.getRange(r+1, planCol+1).setValue(data.plan || '');
      sheet.getRange(r+1, weightCol+1).setValue(Number(data.planWeight) || 0);
      sheet.getRange(r+1, expCol+1).setValue(data.expiry || '');
      renewed++;
    }
  });
  return _json({ success:true, renewed: renewed });
}

// Outil admin : accorder/modifier l'accès de n'importe quelle annonce depuis
// l'app. RÉSERVÉ AU CODE PRO — c'est la vérification qui manquait totalement
// avant ce correctif. Sans le bon code, cette action est désormais refusée.
function _adminGrant(data){
  if(!_isAdminAuthorized(data)){
    throw new Error('Non autorisé : code pro invalide ou manquant.');
  }
  if(!data.id) throw new Error('ID manquant.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Annonce introuvable.');
  const headers = values[0];
  if(data.expiry) sheet.getRange(r+1, headers.indexOf('Expiration')+1).setValue(data.expiry);
  if(data.plan) sheet.getRange(r+1, headers.indexOf('Plan')+1).setValue(data.plan);
  if(typeof data.planWeight !== 'undefined' && data.planWeight !== '') sheet.getRange(r+1, headers.indexOf('PlanWeight')+1).setValue(Number(data.planWeight));
  return _json({ success:true });
}
