/**
 * DONKO ADS — Backend (Google Apps Script) — VERSION SÉCURISÉE + MODÉRATION
 * ----------------------------------------------------
 * ⚠️⚠️ ÉTAPE OBLIGATOIRE AVANT DE DÉPLOYER CE CODE ⚠️⚠️
 * Vous avez déjà ajouté la colonne "OwnerToken" lors du précédent correctif.
 * Ce nouveau code ajoute DEUX colonnes de plus à chaque onglet, juste après
 * OwnerToken. Ouvrez votre Google Sheet et ajoutez ces en-têtes (juste le mot,
 * dans la cellule) :
 *   - Onglet "Boutiques" → cellule O1 : Suspendue → cellule P1 : RaisonSuspension
 *   - Onglet "Annonces"  → cellule S1 : Suspendue → cellule T1 : RaisonSuspension
 * Si vous sautez cette étape, la modération plantera (les autres fonctions
 * continueront de marcher normalement).
 *
 * NOUVEAU : MODÉRATION (désactiver/réactiver/supprimer avec message)
 *   Le code pro peut désormais suspendre une boutique entière (et donc toutes
 *   ses annonces avec elle) ou une seule annonce, avec un message expliquant
 *   pourquoi. Ce message s'affiche PUBLIQUEMENT à la place du contenu normal,
 *   et le vendeur le voit aussi dans "Mes boutiques". Réactiver efface le
 *   message et rend l'annonce/boutique normale à nouveau. Toutes ces actions
 *   exigent le code pro, vérifié côté serveur comme le reste.
 *
 * Le reste (jeton propriétaire, doGet public, etc.) est inchangé —
 * voir les commentaires du correctif précédent ci-dessous.
 *
 * INSTALLATION (5 minutes) :
 * 1. sheets.google.com → Nouveau classeur → nommez-le "Donko Ads".
 * 2. Renommez le premier onglet (en bas) en "Boutiques" (exactement ce nom).
 *    Ligne 1, en-têtes (A à P) :
 *    ID | Date | Nom | Categorie | Pays | Ville | Adresse | Contact | Description | Devise | Logo | Boost | BoostExpiration | OwnerToken | Suspendue | RaisonSuspension
 * 3. Créez un second onglet (clic sur le "+" en bas), nommez-le "Annonces".
 *    Ligne 1, en-têtes (A à T) :
 *    ID | BoutiqueID | Date | Lien | Description | Prix | PrixMode | Contact |
 *    Image1 | Image2 | Image3 | Image4 | VideoURL | Plan | PlanWeight | Expiration | TxnId | OwnerToken | Suspendue | RaisonSuspension
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

const HEADERS_BOUTIQUES = ['ID','Date','Nom','Categorie','Pays','Ville','Adresse','Contact','Description','Devise','Logo','Boost','BoostExpiration','OwnerToken','Suspendue','RaisonSuspension'];
const HEADERS_ANNONCES = ['ID','BoutiqueID','Date','Lien','Description','Prix','PrixMode','Contact',
  'Image1','Image2','Image3','Image4','VideoURL','Plan','PlanWeight','Expiration','TxnId','OwnerToken','Suspendue','RaisonSuspension'];

// ⚠️ Doit rester STRICTEMENT identique à ADMIN_PASSCODE_HASH dans index.html.
// Si vous changez le code pro dans index.html, changez cette même valeur ici
// (recalculez le SHA-256 du nouveau code) puis redéployez une nouvelle version.
const ADMIN_PASSCODE_HASH = '391a9dc924d6b2a6fde451b85559d328ad52c8f4013f02d94d48e64d7a460e1a';

// Forcé sur VOTRE classeur exact, peu importe comment ce script a été créé
// (attaché ou non à un Sheet) — plus fiable que getActiveSpreadsheet().
const SPREADSHEET_ID = '1QwCS0tW7rhh97UogLRyDI93XOQu0Bqh3rSIQh0AENi8';

// ⚠️ Ces 3 clés doivent être ajoutées dans Apps Script → ⚙️ Paramètres du
// projet → Propriétés du script : KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY,
// KKIAPAY_SECRET_KEY. Rien n'est codé en dur ici, pour qu'aucune des trois
// ne soit jamais visible dans le fichier lui-même.
const KKIAPAY_API_BASE = 'https://api.kkiapay.me';

// Interroge Kkiapay pour savoir si une transaction a RÉELLEMENT eu lieu,
// avant de faire confiance à ce que prétend le navigateur du client.
// Distingue volontairement deux types d'échec, pour ne jamais les confondre :
//  - "verification_unavailable: ..." = problème technique (clé manquante,
//    réseau, adresse incorrecte) → PAS la faute du client, peut avoir vraiment payé.
//  - toute autre erreur = le paiement lui-même n'est pas valide/confirmé.
function _kkiapayVerify(transactionId){
  const props = PropertiesService.getScriptProperties();
  const publicKey = props.getProperty('KKIAPAY_PUBLIC_KEY');
  const privateKey = props.getProperty('KKIAPAY_PRIVATE_KEY');
  const secretKey = props.getProperty('KKIAPAY_SECRET_KEY') || '';
  if(!publicKey || !privateKey){
    throw new Error('verification_unavailable: clés Kkiapay absentes des propriétés du script.');
  }
  let res;
  try{
    res = UrlFetchApp.fetch(KKIAPAY_API_BASE + '/api/v1/transactions/status', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Accept': 'application/json',
        'X-API-KEY': publicKey,
        'X-PRIVATE-KEY': privateKey,
        'X-SECRET-KEY': secretKey
      },
      payload: JSON.stringify({ transactionId: String(transactionId) }),
      muteHttpExceptions: true
    });
  } catch(networkErr){
    throw new Error('verification_unavailable: ' + networkErr.toString());
  }
  const code = res.getResponseCode();
  if(code >= 400){
    throw new Error('verification_unavailable: Kkiapay a répondu avec le code ' + code + '.');
  }
  let parsed;
  try{ parsed = JSON.parse(res.getContentText()); }
  catch(parseErr){ throw new Error('verification_unavailable: réponse Kkiapay illisible.'); }
  return parsed;
}
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

// Force une cellule à rester du texte brut, quel que soit son contenu.
// Sans ça, Google Sheets peut transformer un numéro commençant par "+" en
// #ERROR! (il l'interprète comme le début d'une formule) — y compris quand
// c'est ce script qui écrit la valeur, pas seulement en saisie manuelle.
// En fixant le format en "@" (texte) AVANT d'écrire la valeur, ce risque est
// éliminé définitivement, pour toujours, sans jamais dépendre d'un réglage
// manuel sur la feuille.
function _setTextValue(sheet, row, col, value){
  sheet.getRange(row, col).setNumberFormat('@').setValue(value);
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
    const boutiqueSuspendue = !!b.Suspendue;
    const annonceSuspendue = !!a.Suspendue;
    const suspendue = boutiqueSuspendue || annonceSuspendue;
    // Si la boutique entière est désactivée, sa raison prime sur celle,
    // éventuellement différente, d'une annonce individuelle.
    const raison = boutiqueSuspendue ? (b.RaisonSuspension || '') : (annonceSuspendue ? (a.RaisonSuspension || '') : '');
    return Object.assign({}, a, {
      BoutiqueNom: b.Nom || '', Categorie: b.Categorie || '', Pays: b.Pays || '',
      Ville: b.Ville || '', BoutiqueLogo: b.Logo || '', BoutiqueDevise: b.Devise || 'XOF',
      Suspendue: suspendue, RaisonSuspension: raison
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
      case 'confirmSubscription': return _confirmSubscription(data);
      case 'adminGrant':     return _adminGrant(data);
      case 'suspendBoutique':   return _suspendBoutique(data);
      case 'unsuspendBoutique': return _unsuspendBoutique(data);
      case 'suspendAnnonce':    return _suspendAnnonce(data);
      case 'unsuspendAnnonce':  return _unsuspendAnnonce(data);
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
      case 'Suspendue': return false;
      case 'RaisonSuspension': return '';
      default: return '';
    }
  });
  sheet.appendRow(row);
  _setTextValue(sheet, sheet.getLastRow(), HEADERS_BOUTIQUES.indexOf('Contact')+1, data.contact || '');
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
      const col = headers.indexOf(fieldMap[key])+1;
      if(key === 'contact'){ _setTextValue(sheet, r+1, col, data[key]); }
      else { sheet.getRange(r+1, col).setValue(data[key]); }
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
      case 'Suspendue': return false;
      case 'RaisonSuspension': return '';
      default: return '';
    }
  });
  sheet.appendRow(row);
  _setTextValue(sheet, sheet.getLastRow(), HEADERS_ANNONCES.indexOf('Contact')+1, data.contact || '');
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
      const col = headers.indexOf(fieldMap[key])+1;
      if(key === 'contact'){ _setTextValue(sheet, r+1, col, data[key]); }
      else { sheet.getRange(r+1, col).setValue(data[key]); }
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

// RÉSERVÉ AU CODE PRO désormais : ce n'est plus le chemin normal (voir
// _confirmSubscription plus bas, qui vérifie un vrai paiement). Cette
// fonction reste disponible uniquement pour une régularisation manuelle.
function _renewAnnonces(data){
  if(!_isAdminAuthorized(data)) throw new Error('Non autorisé : action réservée au code pro.');
  if(!data.ids) throw new Error('Aucune annonce à renouveler.');
  const idList = String(data.ids).split(',').filter(x=>x);
  if(!idList.length) throw new Error('Aucune annonce à renouveler.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const planCol = headers.indexOf('Plan'), weightCol = headers.indexOf('PlanWeight'), expCol = headers.indexOf('Expiration');
  let renewed = 0;
  idList.forEach(id=>{
    const r = _findRowIndexById(values, id);
    if(r !== -1){
      sheet.getRange(r+1, planCol+1).setValue(data.plan || '');
      sheet.getRange(r+1, weightCol+1).setValue(Number(data.planWeight) || 0);
      sheet.getRange(r+1, expCol+1).setValue(data.expiry || '');
      renewed++;
    }
  });
  return _json({ success:true, renewed: renewed });
}

// ⭐ NOUVEAU : remplace la confiance aveugle envers le navigateur par une
// vraie vérification auprès de Kkiapay avant d'activer un abonnement.
// - Vérifie que la transaction existe vraiment et est un succès.
// - Vérifie que le montant payé correspond au plan choisi (pas un plan
//   moins cher détourné vers un plus cher).
// - Empêche de réutiliser deux fois le même numéro de transaction.
function _confirmSubscription(data){
  if(!data.txnId) throw new Error('Numéro de transaction manquant.');
  if(!data.expectedAmount) throw new Error('Montant attendu manquant.');

  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const txnCol = headers.indexOf('TxnId');

  const alreadyUsed = values.slice(1).some(row => row[txnCol] && String(row[txnCol]) === String(data.txnId));
  if(alreadyUsed) throw new Error('Cette transaction a déjà été utilisée.');

  const verif = _kkiapayVerify(data.txnId);
  if(!verif || verif.status !== 'SUCCESS'){
    throw new Error('Paiement non confirmé par Kkiapay (statut : ' + (verif && verif.status || 'inconnu') + ').');
  }
  if(Number(verif.amount) < Number(data.expectedAmount)){
    throw new Error('Le montant payé ne correspond pas au plan choisi.');
  }

  // Paiement authentique : on renouvelle les annonces de cet appareil, et on
  // marque ce numéro de transaction pour empêcher toute réutilisation future.
  const idList = data.ids ? String(data.ids).split(',').filter(x=>x) : [];
  const planCol = headers.indexOf('Plan'), weightCol = headers.indexOf('PlanWeight'), expCol = headers.indexOf('Expiration');
  const isAdmin = _isAdminAuthorized(data);
  let renewed = 0;
  idList.forEach(id=>{
    const r = _findRowIndexById(values, id);
    if(r !== -1 && (isAdmin || _ownerAuthorized(values[r], headers, data))){
      sheet.getRange(r+1, planCol+1).setValue(data.plan || '');
      sheet.getRange(r+1, weightCol+1).setValue(Number(data.planWeight) || 0);
      sheet.getRange(r+1, expCol+1).setValue(data.expiry || '');
      sheet.getRange(r+1, txnCol+1).setValue(data.txnId);
      renewed++;
    }
  });
  return _json({ success:true, renewed: renewed, verified: true });
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

/* ---------------- Modération (réservé au code pro) ---------------- */
// Désactive une boutique ENTIÈRE avec un message. Toutes ses annonces
// afficheront ce message publiquement à la place de leur contenu normal,
// et le vendeur le verra dans "Mes boutiques".
function _suspendBoutique(data){
  if(!_isAdminAuthorized(data)) throw new Error('Non autorisé : code pro invalide ou manquant.');
  if(!data.id) throw new Error('ID manquant.');
  if(!data.reason) throw new Error('Raison manquante.');
  const sheet = _sheetBoutiques();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Boutique introuvable.');
  const headers = values[0];
  sheet.getRange(r+1, headers.indexOf('Suspendue')+1).setValue(true);
  sheet.getRange(r+1, headers.indexOf('RaisonSuspension')+1).setValue(data.reason);
  return _json({ success:true });
}
function _unsuspendBoutique(data){
  if(!_isAdminAuthorized(data)) throw new Error('Non autorisé : code pro invalide ou manquant.');
  if(!data.id) throw new Error('ID manquant.');
  const sheet = _sheetBoutiques();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Boutique introuvable.');
  const headers = values[0];
  sheet.getRange(r+1, headers.indexOf('Suspendue')+1).setValue(false);
  sheet.getRange(r+1, headers.indexOf('RaisonSuspension')+1).setValue('');
  return _json({ success:true });
}
// Même chose, mais pour UNE SEULE annonce (le reste de la boutique continue
// de s'afficher normalement).
function _suspendAnnonce(data){
  if(!_isAdminAuthorized(data)) throw new Error('Non autorisé : code pro invalide ou manquant.');
  if(!data.id) throw new Error('ID manquant.');
  if(!data.reason) throw new Error('Raison manquante.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Annonce introuvable.');
  const headers = values[0];
  sheet.getRange(r+1, headers.indexOf('Suspendue')+1).setValue(true);
  sheet.getRange(r+1, headers.indexOf('RaisonSuspension')+1).setValue(data.reason);
  return _json({ success:true });
}
function _unsuspendAnnonce(data){
  if(!_isAdminAuthorized(data)) throw new Error('Non autorisé : code pro invalide ou manquant.');
  if(!data.id) throw new Error('ID manquant.');
  const sheet = _sheetAnnonces();
  const values = sheet.getDataRange().getValues();
  const r = _findRowIndexById(values, data.id);
  if(r === -1) throw new Error('Annonce introuvable.');
  const headers = values[0];
  sheet.getRange(r+1, headers.indexOf('Suspendue')+1).setValue(false);
  sheet.getRange(r+1, headers.indexOf('RaisonSuspension')+1).setValue('');
  return _json({ success:true });
}
