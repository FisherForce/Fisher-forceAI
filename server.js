
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');

app.use(express.json());

// === Initialisation lowdb ===
const adapter = new FileSync('db.json');
const db = lowdb(adapter);
db.defaults({ users: [], spots: [] }).write();

const secretKey = 'your-secret-key'; // À CHANGER EN PROD (process.env.JWT_SECRET)

// === Multer pour photos profil ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });


// Crée dossier uploads
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// === REGISTER ===
app.post('/api/register', upload.single('photo'), async (req, res) => {
  const { pseudo, password } = req.body;
  const photo = req.file ? req.file.path : null;
  if (db.get('users').find({ pseudo }).value()) return res.status(400).json({ error: 'Pseudo pris' });
  const hashedPass = await bcrypt.hash(password, 10);
  const user = { pseudo, password: hashedPass, photo, xp: 0, friends: [] };
  db.get('users').push(user).write();
  res.json({ success: true });
});

// === LOGIN ===
app.post('/api/login', async (req, res) => {
  const { pseudo, password } = req.body;
  const user = db.get('users').find({ pseudo }).value();
  if (!user) return res.status(400).json({ error: 'Utilisateur non trouvé' });
  if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: 'Mot de passe faux' });
  const token = jwt.sign({ pseudo }, secretKey, { expiresIn: '7d' });
  res.json({ token, user: { pseudo: user.pseudo, photo: user.photo, xp: user.xp } });
});

// === AJOUT AMI / SPOTS / RANKING ===
app.post('/api/add-friend', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const { pseudo } = jwt.verify(token, secretKey);
    const friendPseudo = req.body.friend;
    const user = db.get('users').find({ pseudo }).value();
    const friend = db.get('users').find({ pseudo: friendPseudo }).value();
    if (!friend) return res.status(400).json({ error: 'Ami non trouvé' });
    if (!user.friends.includes(friendPseudo)) user.friends.push(friendPseudo);
    db.get('users').find({ pseudo }).assign({ friends: user.friends }).write();
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/add-spot', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const { pseudo } = jwt.verify(token, secretKey);
    const { name, lat, lng } = req.body;
    const spot = { name, lat, lng, author: pseudo, date: new Date().toISOString() };
    db.get('spots').push(spot).write();
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.get('/api/spots', (req, res) => res.json(db.get('spots').value()));

app.get('/api/ranking', (req, res) => {
  const users = db.get('users').value();
  const ranking = users.sort((a, b) => b.xp - a.xp).map(u => ({ pseudo: u.pseudo, xp: u.xp }));
  res.json(ranking);
});

// === APPRENTISSAGE V12 ===
const LEARNING_FILE = 'learning-data-v12.json';
if (!fs.existsSync(LEARNING_FILE)) {
  fs.writeFileSync(LEARNING_FILE, JSON.stringify([], null, 2));
}

app.post('/api/learn', async (req, res) => {
  try {
    const session = { ...req.body, receivedAt: new Date().toISOString(), ip: req.ip || "unknown" };
    let data = [];
    try {
      data = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
    } catch (e) { data = []; }
    data.push(session);
    fs.writeFileSync(LEARNING_FILE, JSON.stringify(data, null, 2));
    console.log(`IA V12 → Session apprise (${data.length} total)`);
    res.json({ success: true, totalSessions: data.length, message: "Session apprise avec succès (V12)" });
  } catch (err) {
    console.error("Erreur /api/learn :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get('/download-learning-data', (req, res) => {
  if (req.query.key !== "thao2026") return res.status(403).send("Accès refusé");
  res.download(LEARNING_FILE, 'fisherforce-learning-data-v12.json');
});

// === learn.js fallback ===
let learn = {
  saveSession: () => {},
  analyzeAndUpdatePatterns: () => {},
  loadSessions: () => [],
  loadLearnedPatterns: () => ({}),
  loadSpots: () => []
};
try {
  learn = require('./learn');
} catch (err) {
  console.warn("learn.js non trouvé, apprentissage désactivé.");
}

// === spots.json ===
const spotFile = path.join(__dirname, 'spots.json');
let spotDatabase = [];
if (fs.existsSync(spotFile)) {
  try {
    spotDatabase = JSON.parse(fs.readFileSync(spotFile, 'utf-8'));
  } catch (e) {
    console.error("Erreur lecture spots.json", e);
    spotDatabase = [];
  }
} else {
  fs.writeFileSync(spotFile, JSON.stringify([]));
}
function saveSpot(spotName) {
  if (spotName && !spotDatabase.includes(spotName)) {
    spotDatabase.push(spotName);
    fs.writeFileSync(spotFile, JSON.stringify(spotDatabase, null, 2));
    console.log(`Spot "${spotName}" ajouté à la base.`);
  }
}

let learnedPatterns = {};
try {
  learnedPatterns = learn.loadLearnedPatterns();
} catch (err) {
  console.warn("Pas de patterns appris");
}
//SUGGEST LURE //
// === SUGGEST LURES – VERSION FONCTIONNELLE & CLAIRE ===

function suggestLures(species, structure, conditions, spotType, temperature = null) {
  species    = (species    || "").toLowerCase().trim();
  structure  = (structure  || "").toLowerCase().trim();
  conditions = (conditions || "").toLowerCase().trim();
  spotType   = (spotType   || "").toLowerCase().trim();

  saveSpot(spotType);

  const list = [];
  const depthAdvice = [];

  const mois = new Date().getMonth() + 1;
  let saison = [12,1,2].includes(mois) ? "hiver" :
               [3,4,5].includes(mois) ? "printemps" :
               [6,7,8].includes(mois) ? "été" : "automne";

  if (temperature !== null) {
    if (temperature < 10) saison += " froid";
    else if (temperature > 20) saison += " chaud";
  }

  // Patterns appris (on garde ça, c'est utile)
  const learned = learnedPatterns[species]?.[saison]?.[conditions]?.[spotType];
  if (learned && learned.length > 0) {
    learned.forEach(l => list.push(`${l} (appris des sessions)`));
  }

  // ────────────────────────────────────────────────
  // BROCHET – conseils généraux (leurres par défaut)
  // ────────────────────────────────────────────────
if (species.includes('perche')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → privilégie les appâts naturels et la finesse très lente");
  } else {
    techniqueAdvice.push("Le reste de l'année → leurres actifs, finesse et micro-leurres marchent très bien");
  }

  // CONSEILS HIVER / EAU FROIDE (< 10–12 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Ver de terre ou teigne en grappe – flotteur ou posé au fond (classique efficace)");
    list.push("Petit vairon ou lombrics – amorçage léger + montage simple");
    list.push("Dropshot ou ned rig ver finesse 5-7 cm – ultra lent / dandine près structures");
    list.push("Micro jig 2-5 g – animation verticale lente");
    depthAdvice.push("3-6 m – vertical, dropshot ou posé lent");
  }

  // PRINTEMPS (montée en activité, eau qui se réchauffe)
  else if (saison === "printemps") {
    list.push("Cuillère Mepps / Aglià n°2-3 argentée ou rouge – récupération lente juste sous la surface");
    list.push("Petit shad 5-8 cm ou micro-perch – tête 3-7 g");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Cuillère n°2 coloris or ou argent – linéaire lent ou alterné avec pauses");
    }
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Leurre souple 5 cm brun ou naturel – récupération lente sous la surface");
    }
    depthAdvice.push("1-4 m – micro-leurres ou dropshot près bordures");
  }

  // ÉTÉ (eau chaude, perche active mais souvent en surface ou près obstacles)
  else if (saison === "été") {
    list.push("Popper ou stickbait surface – matin / soir (explosif par temps calme)");
    list.push("Leurre souple 4-8 cm (coloris gardon ou naturel) – récupération rapide avec pauses");
    if (structure.includes('branch') || structure.includes('bois') || structure.includes('arbre')) {
      list.push("Leurre souple 5-7 cm en dropshot ou ned rig – dandine dans les obstacles");
    }
    if (spotType.includes('rivière') && conditions.includes('soleil')) {
      list.push("Cuillère n°2 argentée puis leurre souple 5 cm puis crank – juste sous la surface");
    }
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Leurre souple 7-8 cm coloris gardon – récupération rapide avec pauses");
    }
    depthAdvice.push("0-2 m surface (topwater) ou 1-4 m (micro-leurres / dropshot)");
  }

  // AUTOMNE (gros perches, activité sur le fond et près structures)
  else if (saison === "automne") {
    list.push("Leurre souple 5-7 cm pailleté – ned rig ou dropshot – très lent sur le fond");
    list.push("Lame vibrante ou micro jig – prospecter les obstacles et tombants");
    if (conditions.includes('pluie') || conditions.includes('nuageux')) {
      list.push("Leurre souple 7 cm ned rig – tente les grosses perches sur le fond");
    }
    if (conditions.includes('soleil')) {
      list.push("Leurre souple 4-6 cm ou crankbait – récupération rapide avec pauses près obstacles");
    }
    depthAdvice.push("Fond ou mi-eau – structures, branches, bois morts");
  }

  // Message final
  list.push("Un micro-leurre ou finesse reste une valeur sûre toute l'année pour la perche");
  list.push("Enregistre ta session pour m'aider à affiner les conseils !");
}
if (species.includes('brochet')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau très froide → privilégie appâts naturels + leurres très lents / finesse");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → brochet agressif, leurres réactifs et animations saccadées excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → surface et powerfishing très efficaces par temps nuageux ou chaud");
  } else {
    techniqueAdvice.push("Automne → gros poissons actifs, mélange gros leurres et finesse sur le fond");
  }

  // HIVER / EAU FROIDE (< 10–12 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Gros leurre souple 16-25 cm – animation très lente ou verticale (drop shot style)");
    list.push("Shad lourd 16-20 cm – récupération ultra lente avec longues pauses");
    list.push("Poisson mort ou vif (gros gardon, ablette) – montage mort manié ou posé profond");
    list.push("Gros ver de terre ou morceaux de poisson – en eau très froide");
    depthAdvice.push("4-8 m – fond ou mi-fond, animation minimale");
  }

  // PRINTEMPS (montée en activité, pré-reproduction puis post-repro)
  else if (saison === "printemps") {
    list.push("Jerkbait / minnow 12-15 cm – twitchs courts + pauses longues (très efficace)");
    list.push("Propbait ou wakebait – récupération rapide avec pauses près bordures");
    list.push("Cuillère lourde n°4 – récupération lente juste sous la surface");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Jerk-minnow 12-15 cm – animation saccadée en surface");
    }
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Leurre souple 6-10 cm naturel – récupération lente près obstacles");
    }
    depthAdvice.push("1-4 m – bordures, herbiers, structures peu profondes");
  }

  // ÉTÉ (eau chaude, brochet en surface ou près herbiers)
  else if (saison === "été") {
    list.push("Frog ou leurre de surface – récupération saccadée avec pauses dans les herbiers / nénuphars");
    list.push("Leurres souples 10-15 cm puis cuillère n°4 puis spinnerbait – power fishing près obstacles");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Power fishing agressif – spinnerbait, chatterbait, gros shad");
    }
    if (structure.includes('nénuphar') || structure.includes('herbe') || structure.includes('végétation')) {
      list.push("Frog – récup par à-coups + pauses dans les trouées (ferrage puissant !)");
    }
    depthAdvice.push("0-3 m – surface, bordures, herbiers denses la nuit ou par temps couvert");
  }

  // AUTOMNE (gros poissons nourriciers, activité sur fond et surface)
  else if (saison === "automne") {
    list.push("Swimbait 15-25 cm – récupération lente en surface ou mi-eau");
    list.push("Shad 20 cm – récupération lente avec pauses près structures");
    list.push("Lipless crank ou lame vibrante – prospecter le fond");
    if (conditions.includes('pluie') || conditions.includes('nuageux')) {
      list.push("Shad lourd 20 cm – récupération lente en surface puis descente progressive");
    }
    if (conditions.includes('vent')) {
      list.push("Crankbait 8-12 cm – récupération lente avec descente dans la couche d’eau");
    }
    depthAdvice.push("Fond à mi-eau – structures, cassures, herbiers en déclin");
  }

  // Message final
  list.push("Un gros leurre souple reste une valeur sûre toute l'année pour le brochet");
  list.push("Enregistre ta session pour affiner les conseils !");
}
if (species.includes('bass') || species.includes('black-bass')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 12) {
    techniqueAdvice.push("En hiver ou eau froide → finesse ultra-lente + appâts naturels sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → bass agressif avant/après frai, spinnerbait et crank excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → surface (frog), punching herbiers/bois, finesse dans obstacles");
  } else {
    techniqueAdvice.push("Automne → gros bass nourriciers, punching et gros leurres très performants");
  }

  // HIVER / EAU FROIDE (< 12 °C)
  if (saison === "hiver" || temperature < 12) {
    list.push("Ned rig ou drop shot ver finesse 5-10 cm – ultra lent / dandine près structures");
    list.push("Tube texan ou shaky head petit ver – récupération très lente sur le fond");
    list.push("Petit vif ou ver de terre – posé lent ou flotteur subaquatique");
    list.push("Micro jig 3-7 g – animation verticale minimale");
    depthAdvice.push("3-7 m – fond, tombants, structures profondes");
  }

  // PRINTEMPS (pré et post-frai)
  else if (saison === "printemps") {
    list.push("Spinnerbait ou chatterbait – récupération lente sous la surface près bordures");
    list.push("Crankbait shallow ou medium diver – prospecter herbiers et rochers");
    list.push("Jerkbait 10-12 cm – twitchs + pauses longues (post-frai)");
    if (conditions.includes('vent')) {
      list.push("Spinnerbait – récupération lente sous la surface (vent = bass actif)");
    }
    depthAdvice.push("1-4 m – bordures, herbiers, structures pré-frai");
  }

  // ÉTÉ (eau chaude, bass dans herbiers / obstacles / surface)
  else if (saison === "été") {
    list.push("Frog ou leurre de surface – récupération saccadée avec pauses dans herbiers / nénuphars");
    list.push("Wacky rig ou senko – dandine lente dans les branches / bois morts");
    list.push("Tube texan ou punching rig – dans herbiers denses ou obstacles");
    list.push("Leurres imitatifs (vers, écrevisses, insectes) – récupération lente près structures");
    if (structure.includes('herbe') || structure.includes('nénuphar') || structure.includes('végétation')) {
      list.push("Frog – récup par à-coups + pauses dans les trouées (ferrage puissant !)");
    }
    if (structure.includes('bois') || structure.includes('branch')) {
      list.push("Worm marron ou tube – dandine dans les bois morts / branches");
    }
    if (spotType.includes('canal') || spotType.includes('rivière')) {
      list.push("Écrevisse en punching ou finesse rig – dans herbiers / structures");
    }
    depthAdvice.push("0-3 m surface (frog) ou 1-4 m (finesse / punching dans obstacles)");
  }

  // AUTOMNE (gros bass nourriciers)
  else if (saison === "automne") {
    list.push("Swimbait 10-15 cm ou gros shad – récupération lente mi-eau");
    list.push("Jerkbait ou lipless crank – prospecter cassures et structures");
    list.push("Punching rig lourd (1/2–1 oz) – dans herbiers / bois denses");
    list.push("Crankbait medium diver – récupération avec pauses près obstacles");
    depthAdvice.push("Fond à mi-eau – structures, cassures, herbiers en déclin");
  }

  // Message final
  list.push("Un worm finesse ou ned rig reste une valeur sûre toute l'année pour le black-bass");
  list.push("Enregistre ta session pour affiner les conseils !");
}
if (species.includes('chevesne')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → appâts naturels et finesse lente sont les plus efficaces");
  } else {
    techniqueAdvice.push("Le reste de l'année → leurres actifs (lames, cuillères, insectes) + appâts naturels en rivière");
  }

  // HIVER / EAU FROIDE (< 10–12 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Ver de terre ou teigne – toc ou flotteur léger (classique très efficace)");
    list.push("Petit vairon ou ablette vive – traîné lent ou posé dans courant faible");
    list.push("Micro-leurre finesse 3-5 cm ou ned rig – ultra lent près bordures");
    list.push("Lombrics en grappe – amorçage léger + montage simple");
    depthAdvice.push("Fond ou mi-eau – zones de courant faible, obstacles immergés");
  }

  // PRINTEMPS (montée en activité, chevesne très agressif)
  else if (saison === "printemps") {
    list.push("Lame vibrante ou micro-spinner – récupération rapide avec pauses près obstacles");
    list.push("Cuillère légère n°0-2 – linéaire vif ou alterné avec saccades");
    list.push("Leurres insectes (cricket, hopper) – récupération par à-coups en surface");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Lame vibrante – prospecter courant moyen et bordures");
    }
    depthAdvice.push("Surface à mi-eau – zones de courant, obstacles, bordures");
  }

  // ÉTÉ (eau chaude, chevesne actif en surface et courant)
  else if (saison === "été") {
    list.push("Lame vibrante – récupération rapide avec pauses près obstacles (déclenche réactions)");
    list.push("Cuillère n°1-3 argentée ou colorée – récupération vive en surface ou juste dessous");
    list.push("Leurres insectes (sauterelle, grillon, cigale) – récupération saccadée en surface");
    list.push("Micro-leurre 3-5 cm (minnow ou shad) – animation rapide avec twitches");
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Cuillère ou micro-leurre – récupération rapide pour attaques de réaction");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Leurres insectes ou popper léger – récupération par à-coups en surface");
    }
    depthAdvice.push("Surface à 1 m – courant moyen, bordures, obstacles immergés");
  }

  // AUTOMNE (chevesne nourricier, gros sujets près fond)
  else if (saison === "automne") {
    list.push("Lame vibrante ou lipless – prospecter fond et cassures");
    list.push("Leurres souples 5-7 cm naturel – récupération lente avec pauses");
    list.push("Ver de terre ou teigne – toc ou flotteur dans courant faible");
    if (conditions.includes('pluie') || conditions.includes('nuageux')) {
      list.push("Lame vibrante – récupération rapide près bordures");
    }
    depthAdvice.push("Fond à mi-eau – obstacles, cassures, zones de courant");
  }

  // Message final
  list.push("La lame vibrante et les leurres insectes restent des valeurs sûres pour le chevesne");
  list.push("Enregistre ta session pour affiner les conseils !");
}
if (species.includes('sandre')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → appâts naturels et finesse lente sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → sandre actif, vertical et shad lent excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → powerfishing et vertical de nuit très performants");
  } else {
    techniqueAdvice.push("Automne → gros sandres nourriciers, grattage fond + longues pauses");
  }

  // HIVER / EAU FROIDE (< 10–12 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Poisson mort ou vif (gros gardon, ablette) – montage posé profond ou mort manié");
    list.push("Gros ver de terre ou morceaux de poisson – posé lent sur fond dur");
    list.push("Drop shot ou ned rig petit shad 7-10 cm – ultra lent / dandine");
    list.push("Micro jig 5-10 g – animation verticale très lente");
    depthAdvice.push("4-8 m – fond dur, cassures, tombants profonds");
  }

  // PRINTEMPS (montée en activité, pré-repro puis post-repro)
  else if (saison === "printemps") {
    list.push("Shad 10-15 cm tête plombée 15-30 g – animation lente + longues pauses au fond");
    list.push("Vibro tail ou lipless crank – grattage fond avec pauses");
    list.push("Drop shot ver finesse ou mini-shad – vertical près cassures");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Shad blanc ou chartreuse – récupération lente sur fond");
    }
    depthAdvice.push("3-7 m – fond dur, structures, cassures");
  }

  // ÉTÉ (eau chaude, sandre en profondeur ou actif de nuit)
  else if (saison === "été") {
    list.push("Gros shad 12-18 cm tête lourde 20-40 g – animation lente + pauses longues");
    list.push("Vibro tail ou lipless crank – powerfishing sur fond dur ou cassures");
    list.push("Drop shot ou ned rig 7-12 cm – vertical de nuit ou zones profondes");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Powerfishing agressif – vibro tail ou shad lourd");
    }
    if (temperature > 20) {
      list.push("Vertical de nuit – shad 12-15 cm sur tête 20-30 g");
    }
    depthAdvice.push("4-10 m – fond dur, cassures, tombants, zones profondes");
  }

  // AUTOMNE (gros sandres nourriciers, très actifs sur fond)
  else if (saison === "automne") {
    list.push("Shad 12-18 cm blanc ou chartreuse – grattage fond + longues pauses");
    list.push("Vibro tail ou lipless – récupération lente avec pauses près structures");
    list.push("Gros ver de terre ou poisson mort – posé profond près cassures");
    if (spotType.includes('rivière') && (conditions.includes('pluie') || conditions.includes('nuageux'))) {
      list.push("Shad 7-12 cm blanc – grattage fond + longues pauses près ponts/cassures");
    }
    if (structure.includes('pont') || structure.includes('tombant')) {
      list.push("Shad lourd ou vibro – prospecter les zones ombragées sous ponts");
    }
    depthAdvice.push("Fond à mi-eau – cassures, ponts, tombants, zones de courant faible");
  }

  // Message final
  list.push("Un shad 10-15 cm sur tête lourde reste une valeur sûre toute l'année pour le sandre");
  list.push("Enregistre ta session pour affiner les conseils !");
}
if (species.includes('aspe')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → appâts naturels et finesse lente sont les plus efficaces");
  } else {
    techniqueAdvice.push("Le reste de l'année → leurres rapides et animations vives pour déclencher les attaques de réaction");
  }

  // HIVER / EAU FROIDE (< 10–12 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Petit vairon ou ablette vive – traîné lent ou posé dans courant faible");
    list.push("Ver de terre ou teigne – toc ou flotteur léger près bordures");
    list.push("Micro-leurre finesse 3-5 cm ou ned rig – ultra lent dans zones calmes");
    depthAdvice.push("Fond ou mi-eau – courant faible, bordures, obstacles immergés");
  }

  // PRINTEMPS (montée en activité, aspe très agressif)
  else if (saison === "printemps") {
    list.push("Jerkminnow 7-10 cm – récupération très rapide avec twitches saccadés");
    list.push("Cuillère légère n°1-3 argentée – linéaire vif en surface ou juste dessous");
    list.push("Leurres insectes (sauterelle, grillon) – récupération par à-coups en surface");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Jerkminnow ou micro-spinner – animation rapide près bordures");
    }
    depthAdvice.push("Surface à mi-eau – zones de courant, obstacles, bordures");
  }

  // ÉTÉ (eau chaude, aspe très actif en surface et courant)
  else if (saison === "été") {
    list.push("Jerkminnow 7-10 cm – ramène très vite avec twitches agressifs (déclenche réactions)");
    list.push("Lame vibrante ou lipless crank – récupération rapide près obstacles");
    list.push("Leurres insectes (cigale, grillon, sauterelle) – récupération saccadée en surface");
    list.push("Micro-leurre 4-7 cm (minnow ou popper) – animation vive avec pauses");
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Cuillère ou micro-leurre – récupération rapide pour attaques de réaction");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Leurres insectes ou jerkminnow – récupération par à-coups en surface");
    }
    depthAdvice.push("Surface à 1 m – courant moyen à rapide, bordures, obstacles");
  }

  // AUTOMNE (aspe nourricier, gros sujets actifs en surface et courant)
  else if (saison === "automne") {
    list.push("Jerkminnow 7-12 cm – récupération très rapide avec twitches près bordures");
    list.push("Lame vibrante ou micro-spinner – prospecter courant et obstacles");
    list.push("Leurres insectes ou petit vif – récupération saccadée en surface");
    if (conditions.includes('pluie') || conditions.includes('nuageux')) {
      list.push("Jerkminnow ou lame vibrante – animation rapide près cassures");
    }
    depthAdvice.push("Surface à mi-eau – zones de courant, obstacles, bordures");
  }

  // Message final
  list.push("Le jerkminnow rapide et les leurres insectes restent des valeurs sûres pour l'aspe");
  list.push("Je ne suis pas encore spécialiste de l'aspe, enregistre ta session pour me faire progresser !");
}
  if (species.includes('truite')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau très froide → appâts naturels et nymphes lourdes au toc sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → éclosions, mouche sèche en surface + nymphes au fil");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → mouche sèche en surface (soir/matin) + nymphes / streamers en rivière");
  } else {
    techniqueAdvice.push("Automne → nymphes et streamers, appâts naturels si eau froide");
  }

  // HIVER / EAU FROIDE (< 8–10 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Ver de terre ou teigne – toc ou flotteur léger (classique très efficace)");
    list.push("Nymphe lourde (perdigon, stonefly) – toc profond ou lent au fil");
    list.push("Asticot ou pâte – posé ou flotteur dans eau calme / étang");
    list.push("Micro-leurre finesse 3-5 cm – ultra lent près bordures (rare mais possible)");
    depthAdvice.push("Fond (0.5-2 m) – zones calmes, courant faible");
  }

  // PRINTEMPS (éclosions massives, truite très active en surface)
  else if (saison === "printemps") {
    list.push("Mouche sèche (CDC, elk hair caddis, mayfly) – surface pendant éclosions");
    list.push("Nymphe légère (perdigon, pheasant tail, caddis) – nymphe au fil / toc");
    list.push("Ver de terre ou teigne – toc ou flotteur léger en rivière montante");
    if (conditions.includes('montante') || conditions.includes('pluie')) {
      list.push("Nymphe ou mouche sèche – eau trouble = surface ou nymphe");
    }
    if (conditions.includes('clair') || conditions.includes('soleil')) {
      list.push("Mouche sèche imitative – éclosions en eau claire");
    }
    depthAdvice.push("Surface (0-0.5 m) ou fond léger (0.5-1.5 m) – zones de courant modéré");
  }

  // ÉTÉ (eau chaude, truite plus sélective, souvent en surface le soir/matin)
  else if (saison === "été") {
    list.push("Mouche sèche (caddis, mayfly, hopper) – surface matin/soir ou éclosions");
    list.push("Nymphe (perdigon, hare’s ear) – dérive naturelle au fil dans courant");
    list.push("Streamer petit (clouser minnow, woolly bugger) – animation saccadée en rivière");
    list.push("Maïs doux ou pâte – posé ou flotteur léger en étang calme");
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Mouche sèche ou nymphe – eau claire = imitations précises");
    }
    if (spotType.includes('rivière') || spotType.includes('courant')) {
      list.push("Nymphe ou streamer – dérive ou animation dans courant");
    }
    depthAdvice.push("Surface (0-0.5 m) soir/matin ou 0.5-1.5 m fond (nymphe)");
  }

  // AUTOMNE (truite nourricière, eau qui se refroidit)
  else if (saison === "automne") {
    list.push("Nymphe (pheasant tail, perdigon) – toc ou dérive lente près fond");
    list.push("Streamer coloré (woolly bugger, zonker) – animation saccadée mi-eau");
    list.push("Ver de terre ou teigne – toc dans zones calmes ou courant faible");
    if (temperature < 12) {
      list.push("Appâts naturels – privilégie ver/teigne en eau qui refroidit");
    }
    depthAdvice.push("Fond à mi-eau – zones de courant faible, obstacles");
  }

  // Message final
  list.push("La mouche sèche et la nymphe au fil restent des valeurs sûres toute l'année pour la truite");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('carpe')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → appâts digestes + amorçage très léger / soluble");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → appâts digestes, amorçage modéré, petits appâts");
  } else {
    techniqueAdvice.push("Été / automne → appâts protéinés, amorçage copieux, bouillettes grosses");
  }

  // HIVER / EAU FROIDE (< 10 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Petites bouillettes digestes 10-15 mm ou pellets solubles – amorçage très léger");
    list.push("Maïs doux + pellets baby corn ou stickmix – peu d’amorce, appâts petits");
    list.push("Tiger nuts ou maïs fermenté – posé simple ou PVA bag");
    list.push("Vers de terre ou asticots – en eau très froide, amorçage minimal");
    depthAdvice.push("Fond principalement – zones calmes, peu de mouvement");
  }

  // PRINTEMPS (eau qui se réchauffe, carpe se réveille lentement)
  else if (saison === "printemps") {
    list.push("Bouillettes digestes 12-18 mm (protéines moyennes + attractants doux)");
    list.push("Maïs doux, pellets, tiger nuts – amorçage modéré PVA ou spod léger");
    list.push("Pellets solubles + stickmix – amorçage progressif");
    list.push("Petit boilie + pop-up – présentation haute sur fond vaseux");
    depthAdvice.push("Fond ou mi-eau – zones qui se réchauffent, bordures");
  }

  // ÉTÉ / AUTOMNE (eau chaude, carpe très active, gros appétit)
  else {
    list.push("Grosse bouillette 18-24 mm protéinée (poisson, birdfood, monster crab…) – amorçage copieux");
    list.push("Maïs doux + pellets + graines + bouillettes – spod ou PVA bag massif");
    list.push("Tiger nuts ou maïs fermenté – en mélange avec pellets et bouillettes");
    list.push("Pop-up + snowman rig – sur fond vaseux ou herbeux");
    if (conditions.includes('chaud') || temperature > 20) {
      list.push("Amorçage lourd – mélange bouillettes + pellets + graines");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Bouillettes + pellets solubles – amorçage en ligne ou PVA bag dans courant faible");
    }
    depthAdvice.push("Fond principalement – parfois mi-eau si amorçage en surface");
  }

  // Message final
  list.push("Bouillettes + amorçage intelligent reste la clé toute l'année pour la carpe");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('barbeau')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau très froide → appâts naturels + amorçage très léger sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → barbeau actif, appâts naturels + amorçage modéré au toc ou posé");
  } else {
    techniqueAdvice.push("Été / automne → appâts variés, amorçage copieux, toc ou flotteur en rivière");
  }

  // HIVER / EAU FROIDE (< 8–10 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Ver de terre ou asticots – toc ou posé très lent sur fond dur");
    list.push("Teigne ou morceaux de ver – amorçage très léger (quelques poignées)");
    list.push("Pellets solubles ou maïs doux – présenté sur hair rig simple");
    list.push("Nymphe lourde ou appât naturel – dérive lente dans courant faible");
    depthAdvice.push("Fond (1-2 m) – zones de courant faible, gravier/galets");
  }

  // PRINTEMPS (montée en activité, barbeau commence à se nourrir)
  else if (saison === "printemps") {
    list.push("Ver de terre en grappe ou asticots – toc ou flotteur léger");
    list.push("Maïs doux + pellets – amorçage modéré + hair rig simple");
    list.push("Teigne ou pâte à barbeau – posé ou toc près obstacles");
    if (conditions.includes('pluie') || conditions.includes('montante')) {
      list.push("Ver de terre ou asticots – toc dans courant modéré");
    }
    depthAdvice.push("Fond à mi-eau – zones de courant, gravier, bordures");
  }

  // ÉTÉ / AUTOMNE (barbeau très actif, gros sujets nourriciers)
  else {
    list.push("Ver de terre, asticots ou teigne – toc ou flotteur dans courant");
    list.push("Maïs doux + pellets + graines – amorçage copieux en spod ou PVA bag");
    list.push("Bouillettes spécifiques barbeau (scopex, monster crab…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles");
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Toc ou flotteur – ver/astico/maïs dans courant moyen à fort");
    }
    if (conditions.includes('pluie') || conditions.includes('nuageux')) {
      list.push("Amorçage copieux – maïs + pellets + bouillettes");
    }
    depthAdvice.push("Fond (1-2 m) – gravier, galets, zones de courant, obstacles");
  }

  // Message final
  list.push("Le ver de terre et le maïs doux restent des valeurs sûres toute l'année pour le barbeau");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('brème') || species.includes('brême')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau froide → appâts digestes + amorçage très léger / soluble sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → appâts digestes, amorçage modéré, flotteur ou posé");
  } else {
    techniqueAdvice.push("Été / automne → appâts variés, amorçage copieux, flotteur ou feeder");
  }

  // HIVER / EAU FROIDE (< 8–10 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Petits pellets solubles ou maïs doux – amorçage très léger (quelques poignées)");
    list.push("Ver de terre ou asticots – présenté sur flotteur ou posé simple");
    list.push("Pâte à brème ou bouillettes digestes 8-12 mm – hair rig ou posé");
    list.push("Vers de farine ou morceaux de ver – en eau très froide");
    depthAdvice.push("Fond vaseux (1-3 m) – zones calmes, peu de courant");
  }

  // PRINTEMPS (réveil progressif, brème se rapproche des bordures)
  else if (saison === "printemps") {
    list.push("Maïs doux + pellets solubles – amorçage modéré PVA ou spod léger");
    list.push("Ver de terre ou asticots – flotteur ou posé près bordures");
    list.push("Pâte à brème ou bouillettes digestes 10-15 mm – hair rig simple");
    list.push("Pellets + maïs – présenté sur method feeder ou flotteur");
    if (conditions.includes('pluie') || conditions.includes('montante')) {
      list.push("Asticots ou ver – flotteur dans courant faible");
    }
    depthAdvice.push("Fond ou mi-eau (1-3 m) – bordures, zones qui se réchauffent");
  }

  // ÉTÉ / AUTOMNE (brème très active, gros sujets en bancs)
  else {
    list.push("Maïs doux + pellets + graines + bouillettes – amorçage copieux spod ou PVA bag");
    list.push("Ver de terre, asticots ou teigne – flotteur ou method feeder");
    list.push("Bouillettes spécifiques brème 12-18 mm (scopex, fruity…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Method feeder ou flotteur – maïs + pellets + asticots");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Flotteur ou leger feeder – ver/astico/maïs dans courant faible");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange maïs + pellets + bouillettes");
    }
    depthAdvice.push("Fond vaseux ou mi-fond (1-4 m) – bancs, zones calmes");
  }

  // Message final
  list.push("Le maïs doux et les vers de terre restent des valeurs sûres toute l'année pour la brème");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('tanche')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau froide → appâts digestes + amorçage très léger / soluble sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → appâts digestes, amorçage modéré, petits appâts");
  } else {
    techniqueAdvice.push("Été / automne → appâts variés, amorçage copieux, flotteur ou posé en étang");
  }

  // HIVER / EAU FROIDE (< 8–10 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Petits pellets solubles ou maïs doux – amorçage très léger (quelques graines)");
    list.push("Ver de terre coupé ou asticots – présenté sur flotteur ou posé simple");
    list.push("Pâte à tanche ou bouillettes digestes 8-12 mm – hair rig ou posé");
    list.push("Vers de farine ou morceaux de ver – en eau très froide");
    depthAdvice.push("Fond vaseux (1-3 m) – zones calmes, peu de mouvement");
  }

  // PRINTEMPS (réveil progressif, tanche se rapproche des bordures)
  else if (saison === "printemps") {
    list.push("Maïs doux + pellets solubles – amorçage modéré PVA ou spod léger");
    list.push("Ver de terre ou asticots – flotteur ou posé près bordures vaseuses");
    list.push("Pâte à tanche ou bouillettes digestes 10-15 mm – hair rig simple");
    list.push("Pellets + maïs – présenté sur method feeder ou flotteur");
    if (conditions.includes('pluie') || conditions.includes('montante')) {
      list.push("Asticots ou ver – flotteur dans zones vaseuses");
    }
    depthAdvice.push("Fond vaseux ou mi-eau (1-3 m) – bordures, zones qui se réchauffent");
  }

  // ÉTÉ / AUTOMNE (tanche très active, gros sujets en bancs)
  else {
    list.push("Maïs doux + pellets + graines + bouillettes – amorçage copieux spod ou PVA bag");
    list.push("Ver de terre, asticots ou teigne – flotteur ou method feeder");
    list.push("Bouillettes spécifiques tanche 12-18 mm (scopex, fruity, liver…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles vaseux");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Method feeder ou flotteur – maïs + pellets + asticots");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Flotteur ou leger feeder – ver/astico/maïs dans courant faible");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange maïs + pellets + bouillettes");
    }
    depthAdvice.push("Fond vaseux (1-4 m) – zones calmes, herbiers légers, bordures");
  }

  // Message final
  list.push("Le maïs doux, les vers de terre et la pâte à tanche restent des valeurs sûres toute l'année");
  list.push("Enregistre ta session pour affiner les conseils !");
}
if (species.includes('silure')) {
  // Conseil de base (toute l'année)
  list.push("Essaie une ondulante de 50g – ramène-la proche du fond avec de longues pauses");

  // Hiver : priorité très forte aux appâts naturels
  if (saison === "hiver" || temperature < 12) {
    list.push("En hiver → appâts naturels presque exclusivement (eau froide = silure peu actif sur leurres)");
    list.push("Foie de volaille posé sur le fond ou en flotteur subaquatique – très odorant et efficace");
    list.push("Gros ver de farine ou boulettes de foie + farine – montage posé de nuit");
    list.push("Poisson mort entier (gardon, brème, carpeau > 15 cm) – traîné lent ou posé profond");
  }
  // Hors hiver : mix leurres + appâts
  else {
    list.push("Gros leurre souple 20-30 cm ou swimbait – animation très lente + pauses longues");
    list.push("Big bait shad sur tête lourde 80-150 g – zones profondes ou cassures");
    list.push("Poisson vif (gardon, ablette) – montage traîné ou posé (très bon en été)");
  }

  // Cas particulier : rivière + pluie (abris courants)
  if (spotType.includes('rivière') && conditions.includes('pluie')) {
    list.push("Pêche avec un très gros vif dans une zone inondée ou un silure pourrait venir s’abriter du courant");
    list.push("Zone de courant faible après crue = spot à fort potentiel");
  }

  // Profondeur et astuces générales
  depthAdvice.push("Fond profond (> 5-8 m) – fosses, tombants, ponts, arbres noyés");
  if (temperature > 20) {
    depthAdvice.push("La nuit → monte parfois en surface / bordures herbeuses (0-3 m)");
  }

  // Message final
  list.push("Je ne suis pas encore spécialiste du silure, enregistre ta session pour me faire progresser !");
}
      
      



  // ────────────────────────────────────────────────
  // FALLBACK GÉNÉRAL
  // ────────────────────────────────────────────────
 if (list.length === 0) {
    list.push("Espèce non reconnue – Demande a ce que elle soit ajoutée ! ");
    list.push("Ou enregistre ta session pour aider l'IA à apprendre !");
  }

  // Messages génériques finaux (plus besoin de tester technique)
  list.push("Un leurre souple 7-10 cm reste une valeur sûre dans beaucoup de cas");
  list.push("Enregistre ta sortie pour faire progresser FisherForce AI !");

  // Fermeture brochet (simplifiée, sans tester technique)
  const now = new Date();
  if (now.getMonth() < 4 && species.includes('brochet')) {
    list.unshift(
      "⚠️ Période de fermeture brochet active ! Toute prise = infraction.",
      "Privilégie appâts naturels ou finesse sur perche/truite/carpe/silure..."
    );
  }

  return { lures: list, depthAdvice };
}

// ROUTE /api/advice – simple et robuste
app.post('/api/advice', (req, res) => {
  try {
    let {
      targetSpecies: species = "",
      structure = "",
      conditions = "",
      spotType = "",
      temperature,
      failedLures = []
      // ← PAR DÉFAUT LEURRES COMME TU VEUX   ← commentaire OK ici, après la virgule implicite
    } = req.body;

    // Normalisation
    species    = (species    || "").toLowerCase().trim();
    structure  = (structure  || "").toLowerCase().trim();
    conditions = (conditions || "").toLowerCase().trim();
    spotType   = (spotType   || "").toLowerCase().trim();

    if (!structure || !conditions) {
      return res.status(400).json({ error: 'structure et conditions obligatoires' });
    }

    const result = suggestLures(species, structure, conditions, spotType, temperature);

    let filteredLures = result.lures.filter(lure => {
      const name = lure.split('—')[0]?.trim().toLowerCase() || "";
      return !failedLures.some(f => f.toLowerCase().includes(name));
    });

    if (filteredLures.length === 0) {
      filteredLures = [
        "Aucun leurre/appât précédent n'a fonctionné...",
        "Essaie taille/couleur/profondeur différente",
        "Change de technique ou montage",
        "Enregistre ta session pour aider l'IA !"
      ];
    }

    res.json({
      adviceText: "Voici mes meilleurs conseils :",
      lures: filteredLures,
      depthAdvice: result.depthAdvice || []
    });
  } catch (err) {
    console.error("Erreur /api/advice :", err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Si tu n'as pas encore la fonction suggestLures, voici une version adaptée qui gère technique

app.post('/api/suggest', (req, res) => {
  let { targetSpecies: species = "", structure, conditions, spotType, temperature } = req.body;
  const result = suggestLures(species, structure, conditions, spotType, temperature);
  res.json(result);
});


app.post('/api/compare-lure', async (req, res) => {
  const { lure } = req.body;
  if (!lure) return res.status(400).json({ error: 'Nom du leurre requis' });

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;

    if (!apiKey || !cx) {
      return res.status(500).json({ error: 'Configuration Google API manquante' });
    }

    // Recherche Google via Custom Search JSON API
    const searchQuery = `acheter ${lure} pas cher site:.fr OR site:.com OR site:.eu`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(searchQuery)}&num=10`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Erreur Google API:', data.error);
      return res.status(500).json({ error: 'Erreur recherche Google' });
    }

    const deals = [];
    if (data.items && data.items.length > 0) {
      data.items.slice(0, 5).forEach(item => {
        // Extraction prix approximatif depuis snippet (pas parfait, mais rapide)
        const priceMatch = item.snippet.match(/€\d+[,.]?\d*/);
        deals.push({
          site: item.title,
          link: item.link,
          price: priceMatch ? priceMatch[0] : 'Prix non trouvé (clique pour voir)'
        });
      });
    }

    // Recherche image rapide (premier résultat Google Images)
    const imageQuery = `${lure} fishing lure`;
    const imageUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(imageQuery)}&searchType=image&num=1`;
    const imageResponse = await fetch(imageUrl);
    const imageData = await imageResponse.json();
    const image = imageData.items && imageData.items[0] ? imageData.items[0].link : null;

    res.json({ deals, image });
  } catch (error) {
    console.error('Erreur serveur:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});
app.post('/api/activate-premium', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), secretKey);
    const pseudo = decoded.pseudo;

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code requis' });

    const codeUpper = code.trim().toUpperCase();

    // Recherche le code
    const codeEntry = db.get('premiumCodes').find({ code: codeUpper }).value();

    if (!codeEntry) {
      return res.status(400).json({ error: 'Code incorrect' });
    }

    // Supprime le code (usage unique)
    db.get('premiumCodes').remove({ code: codeUpper }).write();

    // Upgrade l'utilisateur à premium
    db.get('users').find({ pseudo }).assign({ premium: true }).write();

    res.json({ 
      success: true, 
      message: 'Premium activé ! +100 XP. Le code a été supprimé pour éviter les réutilisations.' 
    });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});
// === SERVEUR STATIQUE + CATCH-ALL POUR SPA (IMPORTANT !) ===
app.use(express.static('public')); // si tes fichiers sont dans /public

// Route catch-all : pour toutes les URLs qui ne sont pas /api/*, renvoie index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});




// Serve les fichiers statiques depuis /public
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all : pour TOUTES les routes non-API, renvoie index.html
app.get('*', (req, res) => {
  // Exclut les routes API pour éviter les conflits
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API non trouvée' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Voir profil d'un autre utilisateur
app.get('/api/user/:pseudo', (req, res) => {
  const { pseudo } = req.params;
  const user = db.get('users').find({ pseudo }).value();

  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  res.json({
    pseudo: user.pseudo,
    xp: user.xp,
    premium: user.premium,
    followers: user.followers.length,
    following: user.following.length,
    journal: user.journal // prises publiques
  });
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


