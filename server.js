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

// === SUGGEST LURES ===
function suggestLures(species, structure, conditions, spotType, temperature = null) {
  species = (species || "").toLowerCase();
  structure = (structure || "").toLowerCase();
  conditions = (conditions || "").toLowerCase();
  spotType = (spotType || "").toLowerCase();
  saveSpot(spotType);

  const list = [];
  const depthAdvice = [];
  const techniqueAdvice = [];

  const mois = new Date().getMonth() + 1;
  let saison = [12, 1, 2].includes(mois) ? "hiver" :
              [3, 4, 5].includes(mois) ? "printemps" :
              [6, 7, 8].includes(mois) ? "été" : "automne";

  if (temperature !== null) {
    if (temperature < 10) saison += " froid";
    else if (temperature > 20) saison += " chaud";
  }

  // Patterns appris
  const learnedLures = learnedPatterns[species]?.[saison]?.[conditions]?.[spotType];
  if (learnedLures && learnedLures.length > 0) {
    learnedLures.forEach(lure => list.push(`${lure} (appris des sessions)`));
  }

  // Cas ultra-ciblés (tes conditions originales)
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
  if (species.includes('lieu') || species.includes('pollachius')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver → appâts naturels (vers, crabes, crevettes) et leurres lents au fond sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → lieu actif, leurres souples et powerfishing excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → leurres de surface, traîne et powerfishing performants");
  } else {
    techniqueAdvice.push("Automne → gros lieux nourriciers, leurres lourds et appâts naturels");
  }

  // HIVER / EAU FROIDE (< 10–12 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Vers de sable ou ver américain en grappe – surfcasting ou posé profond");
    list.push("Crabes mous ou morceaux de crabe – posé statique sur digue / bateau");
    list.push("Crevettes ou petits poissons (lançon, sprat) – traîné lent ou posé");
    list.push("Leurres souples 10-15 cm – animation très lente + longues pauses au fond");
    list.push("Jig head 20-50 g + shad – grattage fond ou vertical");
    depthAdvice.push("Fond 5-20 m – cassures, épaves, tombants rocheux");
  }

  // PRINTEMPS (montée en activité, lieu très agressif)
  else if (saison === "printemps") {
    list.push("Leurres souples 10-18 cm (shad, slug) – tête 20-60 g, animation lente + pauses");
    list.push("Jigging spoon ou lame vibrante – grattage fond près structures");
    list.push("Minnow / jerkbait 10-14 cm – twitchs + pauses longues mi-eau");
    list.push("Vif ou ver – traîné ou posé près cassures");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Powerfishing – leurres souples lourds près tombants");
    }
    if (spotType.includes('bateau')) {
      list.push("Verticale ou traîne lente avec shad ou jig");
    }
    depthAdvice.push("5-15 m – cassures, épaves, zones rocheuses");
  }

  // ÉTÉ (eau chaude, lieu actif en surface et mi-eau)
  else if (saison === "été") {
    list.push("Popper ou stickbait surface – récupération saccadée avec pauses (explosif !)");
    list.push("Leurres souples 12-20 cm – powerfishing près roches / épaves");
    list.push("Gros swimbait ou jig vibrant – animation vive mi-eau");
    list.push("Vif (sprat, maquereau, lançon) – traîné rapide ou posé de nuit");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Powerfishing agressif – jig vibrant ou shad lourd");
    }
    if (spotType.includes('plage') || spotType.includes('digue')) {
      list.push("Surfcasting vif ou leurre souple – lancé loin + récupération lente");
    }
    if (spotType.includes('bateau')) {
      list.push("Traîne ou verticale – gros shad ou jig sur épaves");
    }
    depthAdvice.push("Surface à mi-eau (0-10 m) – roches, épaves, courants");
  }

  // AUTOMNE (gros lieux nourriciers, très actifs)
  else if (saison === "automne") {
    list.push("Leurres souples 15-25 cm tête lourde 40-80 g – grattage fond + pauses longues");
    list.push("Jig vibrant ou lame vibrante – powerfishing sur tombants / épaves");
    list.push("Vif gros (sprat, maquereau) – traîné lent ou posé profond");
    list.push("Calamar ou ver – surfcasting ou digue de nuit");
    if (conditions.includes('pluie') || conditions.includes('vent')) {
      list.push("Leurres lourds – powerfishing près cassures / structures");
    }
    depthAdvice.push("Fond à mi-eau (10-30 m) – épaves, tombants, zones rocheuses");
  }

  // Message final
  list.push("Leurres souples 12-18 cm et vif restent des valeurs sûres toute l'année pour le lieu");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('maquereau') || species.includes('maquerau') || species.includes('scomber')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → appâts naturels (vers, petits poissons) et traîne lente sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → maquereau arrive en bancs, leurres rapides et traîne excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → surface explosive (petits leurres, traîne), pêche très active en bancs");
  } else {
    techniqueAdvice.push("Automne → gros maquereaux nourriciers, traîne et leurres rapides");
  }

  // HIVER / EAU FROIDE (< 10 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Petits vers de sable ou morceaux de ver – traîné lent ou posé depuis digue");
    list.push("Petit lançon ou sprat vif – traîné très lent ou posé");
    list.push("Calamar ou morceaux – traîné lent en profondeur");
    list.push("Petits leurres souples 5-8 cm – animation lente + pauses");
    list.push("Plumes ou sabiki avec appât – traîne légère ou vertical");
    depthAdvice.push("Mi-fond à fond (5-20 m) – bancs profonds, zones calmes");
  }

  // PRINTEMPS (arrivée des bancs, maquereau très actif)
  else if (saison === "printemps") {
    list.push("Plumes ou sabiki – traîne rapide ou vertical (très productif)");
    list.push("Petits leurres souples 5-10 cm – récupération saccadée mi-eau");
    list.push("Cuillère ondulante ou jig micro 10-20 g – animation vive");
    list.push("Petit lançon ou sprat – traîné ou posé près surface");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Plumes ou sabiki – traîne en surface ou mi-eau");
    }
    if (spotType.includes('bateau')) {
      list.push("Traîne ou verticale plumes/sabiki – trouve les bancs");
    }
    depthAdvice.push("Surface à mi-eau (0-10 m) – bancs en chasse");
  }

  // ÉTÉ (eau chaude, maquereau très actif en surface et bancs)
  else if (saison === "été") {
    list.push("Plumes ou sabiki – traîne rapide ou vertical (explosif en bancs)");
    list.push("Petits leurres de surface (popper, petit stickbait) – récupération saccadée");
    list.push("Cuillère ondulante ou micro jig 10-30 g – animation rapide mi-eau");
    list.push("Petit lançon, sprat ou sardine – traîné vif ou posé");
    list.push("Feather lures ou turlutte – traîne en surface");
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Plumes ou sabiki – traîne en surface ou mi-eau (bancs actifs)");
    }
    if (spotType.includes('plage') || spotType.includes('digue') || spotType.includes('jetée')) {
      list.push("Lancer plumes ou petit leurre – récupération saccadée en surface");
    }
    if (spotType.includes('bateau')) {
      list.push("Traîne plumes/sabiki ou petits leurres – trouve les chasses en surface");
    }
    depthAdvice.push("Surface à mi-eau (0-8 m) – bancs en chasse, souvent visibles");
  }

  // AUTOMNE (gros maquereaux nourriciers, très actifs)
  else if (saison === "automne") {
    list.push("Plumes ou sabiki – traîne rapide ou vertical en profondeur");
    list.push("Leurres souples 8-12 cm – powerfishing mi-eau ou fond");
    list.push("Cuillère ondulante ou jig 20-40 g – animation saccadée");
    list.push("Petit vif ou morceaux de poisson – traîné ou posé");
    if (conditions.includes('pluie') || conditions.includes('vent')) {
      list.push("Plumes ou sabiki – traîne en surface ou mi-eau");
    }
    depthAdvice.push("Mi-eau à fond (5-15 m) – bancs nourriciers, zones rocheuses");
  }

  // Message final
  list.push("Plumes/sabiki et petits leurres rapides restent des valeurs sûres toute l'année pour le maquereau");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('dorade') || species.includes('daurade') || species.includes('spar') || species.includes('aurata')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 12) {
    techniqueAdvice.push("En hiver ou eau froide → appâts naturels digestes + amorçage très léger sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → dorade se rapproche des côtes, appâts naturels + amorçage modéré");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → appâts variés (vers, crabes, mollusques), amorçage copieux, pêche active");
  } else {
    techniqueAdvice.push("Automne → gros sujets nourriciers, appâts riches + amorçage important");
  }

  // HIVER / EAU FROIDE (< 12 °C)
  if (saison === "hiver" || temperature < 12) {
    list.push("Petits vers de vase ou morceaux de ver – posé léger ou flotteur");
    list.push("Petits crabes mous ou morceaux de crabe – amorçage très léger");
    list.push("Crevettes décortiquées ou petits coquillages – présenté sur flotteur ou posé");
    list.push("Petites bouillettes digestes 8-12 mm ou pâte – hair rig simple");
    list.push("Maïs doux ou pellets solubles – très peu d’amorce");
    depthAdvice.push("Fond 2-8 m – zones vaseuses, roches, estuaires abrités");
  }

  // PRINTEMPS (réveil progressif, dorade se rapproche des côtes)
  else if (saison === "printemps") {
    list.push("Vers de vase ou vers américains – flotteur ou posé près bordures");
    list.push("Crabes mous ou morceaux – amorçage modéré PVA ou spod léger");
    list.push("Crevettes ou petits coquillages – présenté sur flotteur ou hair rig");
    list.push("Maïs doux + pellets solubles – amorçage modéré");
    list.push("Petites bouillettes digestes 10-15 mm – attractants doux");
    if (conditions.includes('marée haute') || conditions.includes('courant')) {
      list.push("Flotteur ou leger feeder – vers/crabes dans zones courantes");
    }
    depthAdvice.push("Fond 1-6 m – bordures vaseuses, roches, zones qui se réchauffent");
  }

  // ÉTÉ / AUTOMNE (dorade très active, gros sujets en bancs)
  else {
    list.push("Vers de vase, crabes ou crevettes – flotteur ou posé en zones rocheuses");
    list.push("Maïs doux + pellets + graines + petits coquillages – amorçage copieux spod ou PVA bag");
    list.push("Bouillettes spécifiques dorade 12-18 mm (scopex, fruity, crab…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles");
    list.push("Petits poissons (gobie, lançon) – posé ou traîné lent");
    if (spotType.includes('plage') || spotType.includes('digue')) {
      list.push("Surfcasting vers/crabes ou leger feeder – lancé loin");
    }
    if (spotType.includes('bateau')) {
      list.push("Posé ou flotteur – amorçage copieux autour du poste");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange vers + crabes + bouillettes");
    }
    depthAdvice.push("Fond 2-10 m – zones vaseuses, roches, herbiers légers, bancs");
  }

  // Message final
  list.push("Vers de vase, crabes et maïs doux restent des valeurs sûres toute l'année pour la dorade");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('bar') || species.includes('loup')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → appâts naturels (vif, ver, calamar) et leurres très lents sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → bar agressif pré/post-repro, leurres souples et finesse excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → surface (popper, stickbait) et powerfishing très performants, surtout de nuit");
  } else {
    techniqueAdvice.push("Automne → gros bars nourriciers, leurres lourds et appâts naturels");
  }

  // HIVER / EAU FROIDE (< 10–12 °C)
  if (saison === "hiver" || temperature < 10) {
    list.push("Petit vif (gardon, mulet, lançon, éperlan) – traîné lent ou posé profond");
    list.push("Ver de sable / ver américain en grappe – surfcasting ou posé sur digue/estuaire");
    list.push("Calamar frais ou morceaux – posé statique ou traîné très lent");
    list.push("Leurres souples 7-12 cm – animation ultra lente + longues pauses");
    list.push("Jig head finesse 5-15 g + petit shad – vertical ou lent près structures");
    depthAdvice.push("Fond 3-8 m – estuaires profonds, tombants, zones abritées");
  }

  // PRINTEMPS (pré et post-repro, bar très agressif)
  else if (saison === "printemps") {
    list.push("Leurres souples 10-15 cm (shad, slug) – tête 10-30 g, animation lente + pauses longues");
    list.push("Minnow / jerkbait 9-12 cm – twitchs + pauses longues près bordures");
    list.push("Finesse rig (ned rig, drop shot) ver ou petit shad – ultra lent");
    list.push("Vif ou ver de sable – traîné ou posé près structures");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Leurres souples – récupération lente près obstacles / herbiers");
    }
    if (spotType.includes('estuaire') || spotType.includes('rivière')) {
      list.push("Petit vif dans courant faible ou zones calmes");
    }
    depthAdvice.push("1-5 m – bordures, estuaires, roches, herbiers naissants");
  }

  // ÉTÉ (eau chaude, bar actif en surface et près herbiers)
  else if (saison === "été") {
    list.push("Popper ou stickbait surface – récupération saccadée avec pauses (explosif de nuit !)");
    list.push("Leurres souples 10-18 cm – powerfishing près herbiers / roches / digues");
    list.push("Gros swimbait ou jerkbait – animation vive mi-eau");
    list.push("Vif (mulet, lançon, sardine) – traîné rapide ou posé de nuit");
    if (conditions.includes('nuageux') || conditions.includes('pluie') || conditions.includes('vent')) {
      list.push("Powerfishing agressif – leurres souples lourds, chatterbait marin");
    }
    if (spotType.includes('plage') || spotType.includes('digue')) {
      list.push("Surfcasting vif ou leurre souple – lancé loin + récupération lente");
    }
    if (spotType.includes('bateau')) {
      list.push("Verticale ou traîne lente avec gros shad / swimbait");
    }
    depthAdvice.push("Surface à mi-eau (0-4 m) – herbiers, roches, estuaires la nuit");
  }

  // AUTOMNE (gros bars nourriciers, très actifs)
  else if (saison === "automne") {
    list.push("Leurres souples 12-18 cm tête lourde 20-40 g – grattage fond + pauses longues");
    list.push("Jerkbait ou minnow 10-15 cm – récupération saccadée près structures");
    list.push("Vif gros (mulet, gardon, sardine) – traîné lent ou posé profond");
    list.push("Calamar ou ver de sable – surfcasting ou digue de nuit");
    if (conditions.includes('pluie') || conditions.includes('vent')) {
      list.push("Leurres lourds – powerfishing près cassures / tombants");
    }
    depthAdvice.push("Fond à mi-eau (3-10 m) – cassures, tombants, estuaires");
  }

  // Message final
  list.push("Leurres souples 10-15 cm et vif restent des valeurs sûres toute l'année pour le bar");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('ablette') || species.includes('alburnus')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau très froide → appâts naturels fins et toc très lent sont les plus efficaces");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → ablettes en bancs actifs, flotteur et petits leurres rapides excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → surface et ultra-léger très performants, pêche en toc ou flotteur actif");
  } else {
    techniqueAdvice.push("Automne → ablettes nourricières, toc et petits leurres rapides");
  }

  // HIVER / EAU FROIDE (< 8 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Petits vers de vase ou teignes – toc très lent ou flotteur ultra-léger");
    list.push("Asticots ou pâte fine – présenté sur flotteur dans courant faible");
    list.push("Micro-nymphe ou petite mouche – dérive lente au toc");
    list.push("Pain ou semoule – amorçage très léger + flotteur");
    list.push("Micro-leurre finesse 2-4 cm – ultra lent près bordures");
    depthAdvice.push("Mi-eau à surface (0-1.5 m) – courant faible, zones calmes");
  }

  // PRINTEMPS (montée en activité, bancs très agressifs)
  else if (saison === "printemps") {
    list.push("Flotteur ultra-léger avec asticots ou teignes – animation saccadée");
    list.push("Toc avec ver de terre ou teigne – dérive naturelle dans courant");
    list.push("Petite cuillère n°0-1 argentée – récupération rapide mi-eau");
    list.push("Micro-spinner ou cuillère tournante – linéaire vif près surface");
    list.push("Pain ou semoule – amorçage modéré + flotteur actif");
    if (conditions.includes('montante') || conditions.includes('pluie')) {
      list.push("Flotteur avec asticots – courant moyen, bancs actifs");
    }
    depthAdvice.push("Surface à mi-eau (0-1 m) – zones de courant modéré");
  }

  // ÉTÉ (eau chaude, ablettes très actives en surface)
  else if (saison === "été") {
    list.push("Flotteur actif avec asticots, teignes ou pain – animation saccadée");
    list.push("Toc ultra-léger avec ver ou teigne – dérive rapide près surface");
    list.push("Micro-cuillère n°0-1 argentée ou or – récupération très rapide");
    list.push("Petit micro-spinner ou fly ultra-léger – linéaire vif en surface");
    list.push("Pain ou semoule – amorçage copieux + flotteur en surface");
    list.push("Leurres insectes (mouche sèche, hopper) – surface en soirée");
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Micro-cuillère ou spinner – récupération rapide pour réactions");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Toc ou flotteur – asticots/teigne dans courant moyen");
    }
    depthAdvice.push("Surface (0-0.8 m) – courant modéré, bordures, zones calmes");
  }

  // AUTOMNE (ablettes nourricières, gros bancs)
  else if (saison === "automne") {
    list.push("Flotteur avec asticots ou teigne – animation saccadée mi-eau");
    list.push("Toc avec ver ou pain – dérive lente près bordures");
    list.push("Micro-cuillère n°0-1 – récupération rapide en surface");
    list.push("Pain ou semoule – amorçage copieux + flotteur actif");
    if (conditions.includes('pluie') || conditions.includes('nuageux')) {
      list.push("Flotteur ou toc – asticots dans courant");
    }
    depthAdvice.push("Surface à mi-eau (0-1.5 m) – bancs nourriciers, courant");
  }

  // Message final
  list.push("Flotteur ultra-léger avec asticots ou micro-cuillère restent des valeurs sûres toute l'année pour l'ablette");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('alose') || species.includes('alosa')) {
  // Message introductif selon saison (l'alose est surtout active au printemps)
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver → alose quasi absente (migration terminée), appâts naturels très rares");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → montée massive, leurres rapides et appâts naturels excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → alose redescend ou reste en mer, pêche difficile sauf estuaires");
  } else {
    techniqueAdvice.push("Automne → alose rare (pré-migration), privilégie les zones d'estuaires");
  }

  // PRINTEMPS (montée principale, alose très agressive)
  if (saison === "printemps" && (temperature > 10 && temperature < 18)) {
    list.push("Cuillère lourde n°3-5 argentée ou flashy – récupération rapide en linéaire ou lancer-ramener");
    list.push("Jerkbait ou minnow 7-12 cm – twitching saccadé + pauses (déclenche réactions)");
    list.push("Leurres de surface (popper ou stickbait) – récupération saccadée en surface");
    list.push("Petit vif (éperlan, sprat) – traîné lent ou posé près barrages");
    list.push("Devon ou cuillère tournante – traîne ou lancer en zones de courant fort");
    if (conditions.includes('montante') || conditions.includes('pluie')) {
      list.push("Montée active → leurres rapides en surface ou mi-eau");
    }
    if (spotType.includes('fleuve') || spotType.includes('estuaire') || spotType.includes('barrage')) {
      list.push("Lancer loin + récupération saccadée près obstacles ou courant");
    }
    depthAdvice.push("Surface à mi-eau (0-3 m) – zones de courant fort, barrages, passes");
  }

  // HIVER / AUTOMNE (alose rare ou en mer)
  else if (saison === "hiver" || saison === "automne" || temperature < 8 || temperature > 20) {
    list.push("Alose quasi absente en eau douce (migration terminée ou pas commencée)");
    list.push("Essaie en estuaire ou mer proche avec petit vif ou leurre rapide");
    list.push("Cuillère ou micro-jig – récupération vive mi-eau (si présence rare)");
    list.push("Petit vif ou ver – traîné lent près embouchures");
    depthAdvice.push("Mi-eau à surface – estuaires, embouchures de fleuves");
  }

  // Message final
  list.push("Cuillère lourde flashy et jerkbait saccadé restent les valeurs sûres en montée pour l'alose");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('amour') || species.includes('amour blanc') || species.includes('ctenopharyngodon')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau froide → amour blanc peu actif, appâts digestes + amorçage très léger");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → amour blanc se réveille, herbe fraîche et amorçage modéré excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → amour blanc très actif, herbe, maïs et amorçage copieux ultra-efficaces");
  } else {
    techniqueAdvice.push("Automne → amour blanc nourricier, appâts végétaux + amorçage important");
  }

  // HIVER / EAU FROIDE (< 8 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Petits pellets solubles ou maïs doux – amorçage très léger (quelques graines)");
    list.push("Pain ou semoule – présenté sur flotteur ou posé simple");
    list.push("Pâte à carpe digestes ou bouillettes végétales 8-12 mm – hair rig");
    list.push("Petits morceaux d’herbe ou algues – posé lent");
    depthAdvice.push("Fond (1-3 m) – zones calmes, vaseuses, peu de courant");
  }

  // PRINTEMPS (réveil progressif, amour blanc se rapproche des bordures)
  else if (saison === "printemps") {
    list.push("Herbe fraîche ou algues – présenté sur flotteur ou posé près bordures");
    list.push("Maïs doux + pellets solubles – amorçage modéré PVA ou spod léger");
    list.push("Pain ou semoule – flotteur ou posé");
    list.push("Petites bouillettes végétales 10-15 mm – hair rig simple");
    list.push("Pellets + maïs – présenté sur method feeder ou flotteur");
    if (conditions.includes('pluie') || conditions.includes('montante')) {
      list.push("Herbe ou maïs – flotteur dans zones vaseuses");
    }
    depthAdvice.push("Fond ou mi-eau (1-3 m) – bordures, zones qui se réchauffent");
  }

  // ÉTÉ / AUTOMNE (amour blanc très actif, gros sujets en bancs)
  else {
    list.push("Herbe fraîche, algues ou feuilles de salade – flotteur ou posé en zones végétalisées");
    list.push("Maïs doux + pellets + graines + bouillettes végétales – amorçage copieux spod ou PVA bag");
    list.push("Bouillettes spécifiques amour blanc 15-20 mm (maïs, scopex végétal…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles");
    list.push("Pain ou semoule en grappe – flotteur actif ou method feeder");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Method feeder ou flotteur – maïs + pellets + herbe");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Flotteur ou leger feeder – maïs/herbe dans courant faible");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange maïs + pellets + herbe");
    }
    depthAdvice.push("Fond ou mi-eau (1-4 m) – zones végétalisées, herbiers, bordures");
  }

  // Message final
  list.push("Herbe fraîche, maïs doux et pellets restent des valeurs sûres toute l'année pour l'amour blanc");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('carrassin') || species.includes('carassin') || species.includes('carassius')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau froide → carassin peu actif, appâts digestes + amorçage très léger");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → carassin se réveille, appâts naturels + amorçage modéré excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → carassin très actif, appâts variés + amorçage copieux en étang calme");
  } else {
    techniqueAdvice.push("Automne → carassin nourricier, appâts riches + amorçage important");
  }

  // HIVER / EAU FROIDE (< 8 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Petits vers de terre coupés ou asticots – flotteur ultra-léger ou posé");
    list.push("Pain ou semoule – présenté sur flotteur simple ou posé");
    list.push("Maïs doux ou pellets solubles – amorçage très léger (quelques graines)");
    list.push("Pâte à carpe digestes ou bouillettes végétales 8-12 mm – hair rig");
    depthAdvice.push("Fond vaseux (1-3 m) – zones calmes, peu de courant");
  }

  // PRINTEMPS (réveil progressif, carassin se rapproche des bordures)
  else if (saison === "printemps") {
    list.push("Vers de terre ou asticots – flotteur ou posé près bordures");
    list.push("Maïs doux + pellets solubles – amorçage modéré PVA ou spod léger");
    list.push("Pain ou semoule – flotteur actif ou posé");
    list.push("Petites bouillettes digestes 10-15 mm – hair rig simple");
    list.push("Pellets + maïs – présenté sur method feeder ou flotteur");
    if (conditions.includes('pluie') || conditions.includes('montante')) {
      list.push("Asticots ou ver – flotteur dans zones vaseuses");
    }
    depthAdvice.push("Fond ou mi-eau (1-3 m) – bordures, zones qui se réchauffent");
  }

  // ÉTÉ / AUTOMNE (carassin très actif, gros sujets en bancs)
  else {
    list.push("Vers de terre, asticots ou teigne – flotteur ou posé en zones vaseuses");
    list.push("Maïs doux + pellets + graines + bouillettes – amorçage copieux spod ou PVA bag");
    list.push("Bouillettes spécifiques carassin 12-18 mm (scopex, fruity, maïs…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles");
    list.push("Pain ou semoule en grappe – flotteur actif ou method feeder");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Method feeder ou flotteur – maïs + pellets + asticots");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Flotteur ou leger feeder – ver/astico/maïs dans courant faible");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange maïs + pellets + vers");
    }
    depthAdvice.push("Fond vaseux ou mi-eau (1-4 m) – zones calmes, herbiers légers, bordures");
  }

  // Message final
  list.push("Vers de terre, maïs doux et pellets restent des valeurs sûres toute l'année pour le carassin");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('esturgeon') || species.includes('sturgeon') || species.includes('acipenser')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau froide → esturgeon très peu actif, appâts digestes + posé statique profond");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → esturgeon se réveille lentement, gros appâts + amorçage léger");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → esturgeon actif, gros appâts naturels + posé profond ou traîne lente");
  } else {
    techniqueAdvice.push("Automne → esturgeon nourricier, appâts riches + amorçage copieux");
  }

  // HIVER / EAU FROIDE (< 8 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Gros ver de terre ou morceaux de poisson – posé statique profond");
    list.push("Petits pellets digestes ou bouillettes solubles – amorçage très léger");
    list.push("Calamar ou morceaux de seiche – présenté sur hair rig lourd");
    list.push("Petits crabes ou crevettes – posé lent au fond");
    list.push("Bouillettes digestes 12-18 mm – très peu d’amorce");
    depthAdvice.push("Fond profond (4-10 m) – zones calmes, vaseuses ou sableuses");
  }

  // PRINTEMPS (réveil progressif, esturgeon se rapproche du fond)
  else if (saison === "printemps") {
    list.push("Gros vers de terre ou asticots en grappe – posé ou traîné lent");
    list.push("Poisson mort ou vif (gardon, brème) – montage posé profond");
    list.push("Bouillettes digestes 15-20 mm – amorçage modéré PVA ou spod léger");
    list.push("Calamar frais ou crevettes – hair rig ou posé");
    list.push("Pellets + maïs – présenté sur method feeder lourd");
    if (temperature > 10) {
      list.push("Augmente légèrement l’amorçage – esturgeon commence à bouger");
    }
    depthAdvice.push("Fond ou mi-fond (3-8 m) – zones vaseuses, cassures");
  }

  // ÉTÉ / AUTOMNE (esturgeon très actif, gros sujets nourriciers)
  else {
    list.push("Gros poisson mort ou vif (carpeau, gardon) – posé profond ou traîné lent");
    list.push("Gros vers de terre ou lombrics en grappe – hair rig lourd");
    list.push("Bouillettes protéinées 18-25 mm (poisson, liver, monster crab…) – amorçage copieux");
    list.push("Calamar entier ou gros morceaux – posé statique au fond");
    list.push("Pellets + tiger nuts + graines – spod massif près structures");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Posé lourd ou method feeder – gros appâts + amorçage important");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Traîné lent ou posé dans courant faible – gros vif ou poisson mort");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange poisson + bouillettes + pellets");
    }
    depthAdvice.push("Fond profond (4-12 m) – zones vaseuses, cassures, structures");
  }

  // Message final
  list.push("Gros appâts naturels (poisson mort/vif, vers) et bouillettes restent des valeurs sûres pour l'esturgeon");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('gardon') || species.includes('rutilus')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 6) {
    techniqueAdvice.push("En hiver ou eau très froide → gardon peu actif, appâts naturels fins + amorçage très léger");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → gardon en bancs actifs, flotteur et toc excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → gardon très actif en surface/mid-eau, flotteur actif + amorçage copieux");
  } else {
    techniqueAdvice.push("Automne → gardon nourricier, flotteur et appâts riches très performants");
  }

  // HIVER / EAU FROIDE (< 6–8 °C)
  if (saison === "hiver" || temperature < 6) {
    list.push("Petits asticots ou morceaux de ver – flotteur ultra-léger ou posé");
    list.push("Pain ou semoule – présenté sur flotteur simple ou posé");
    list.push("Maïs doux ou pellets solubles – amorçage très léger (quelques graines)");
    list.push("Pâte fine ou bouillettes digestes 6-10 mm – hair rig ou flotteur");
    depthAdvice.push("Fond ou mi-fond (1-3 m) – zones calmes, vaseuses, courant faible");
  }

  // PRINTEMPS (montée en activité, gardon en bancs près bordures)
  else if (saison === "printemps") {
    list.push("Asticots ou vers de terre – flotteur ou toc dans courant faible");
    list.push("Maïs doux + pellets – amorçage modéré PVA ou spod léger");
    list.push("Pain ou semoule – flotteur actif ou posé près bordures");
    list.push("Petites bouillettes digestes 8-12 mm – hair rig simple");
    list.push("Pellets + maïs – présenté sur method feeder ou flotteur");
    if (conditions.includes('pluie') || conditions.includes('montante')) {
      list.push("Asticots ou ver – flotteur dans courant modéré");
    }
    depthAdvice.push("Mi-eau à surface (0.5-2 m) – bordures, zones qui se réchauffent");
  }

  // ÉTÉ / AUTOMNE (gardon très actif, gros bancs nourriciers)
  else {
    list.push("Asticots, vers de terre ou teigne – flotteur actif ou posé");
    list.push("Maïs doux + pellets + graines + bouillettes – amorçage copieux spod ou PVA bag");
    list.push("Bouillettes spécifiques gardon 10-15 mm (maïs, scopex, fruity…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles");
    list.push("Pain ou semoule en grappe – flotteur actif ou method feeder");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Method feeder ou flotteur – maïs + pellets + asticots");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Flotteur ou toc – asticots/ver/maïs dans courant faible à moyen");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange maïs + pellets + asticots");
    }
    depthAdvice.push("Surface à mi-eau (0-2.5 m) – bancs, zones calmes, bordures");
  }

  // Message final
  list.push("Asticots, maïs doux et flotteur actif restent des valeurs sûres toute l'année pour le gardon");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('lote') || species.includes('lotte') || species.includes('lota')) {
  // Message introductif selon saison (la lote est surtout active en eau froide)
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver ou eau froide → lote très active, appâts naturels (poisson mort, vers) + posé profond excellents");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → lote encore active, appâts naturels + traîné lent très performants");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → lote peu active (eau chaude), pêche difficile sauf zones profondes et de nuit");
  } else {
    techniqueAdvice.push("Automne → lote recommence à s’activer, privilégie appâts naturels en profondeur");
  }

  // HIVER / EAU FROIDE (< 10 °C) – meilleure période
  if (saison === "hiver" || temperature < 10) {
    list.push("Poisson mort (gardon, perche, ablette) – posé statique ou mort manié au fond");
    list.push("Gros vers de terre ou lombrics en grappe – hair rig lourd ou posé profond");
    list.push("Crevettes ou morceaux de crabe – présenté sur flotteur subaquatique ou posé");
    list.push("Calamar frais ou morceaux – posé statique en profondeur");
    list.push("Petit vif (éperlan, ablette) – traîné très lent près structures");
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Posé ou traîné lent dans zones profondes ou courant faible");
    }
    if (!isDay) {
      list.push("Pêche de nuit → très efficace, lote chasse activement");
    }
    depthAdvice.push("Fond profond (3-10 m) – cassures, tombants, zones vaseuses ou rocheuses");
  }

  // PRINTEMPS (encore bonne activité, mais eau qui se réchauffe)
  else if (saison === "printemps") {
    list.push("Poisson mort ou vif – traîné lent ou posé profond");
    list.push("Gros vers de terre ou lombrics – hair rig ou posé près obstacles");
    list.push("Crevettes ou petits crabes – présenté sur flotteur subaquatique");
    list.push("Calamar ou morceaux – posé statique en zones profondes");
    if (temperature < 12) {
      list.push("Continue les appâts naturels – lote encore très active");
    }
    depthAdvice.push("Fond à mi-fond (2-8 m) – zones profondes, cassures");
  }

  // ÉTÉ / AUTOMNE (lote moins active, souvent en profondeur)
  else {
    list.push("Poisson mort ou gros ver – posé profond ou traîné très lent (de nuit)");
    list.push("Calamar ou crevettes – présenté en profondeur près structures");
    list.push("Petit vif – traîné lent dans zones fraîches ou profondes");
    list.push("Bouillettes digestes ou pellets – très peu d’amorce");
    if (!isDay) {
      list.push("Pêche de nuit → meilleure chance, lote descend en profondeur");
    }
    depthAdvice.push("Fond profond (4-12 m) – zones vaseuses, tombants, eau fraîche");
  }

  // Message final
  list.push("Poisson mort ou gros vers posés au fond restent des valeurs sûres pour la lote (surtout de nuit)");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('omble') || species.includes('salvelinus') || species.includes('omble chevalier')) {
  // Message introductif selon saison (l'omble préfère l'eau très froide)
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau très froide → omble très actif, finesse, toc et appâts naturels excellents");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → omble agressif, mouche, toc et petits leurres performants");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → omble descend en profondeur (eau froide), verticale et finesse profonde");
  } else {
    techniqueAdvice.push("Automne → omble remonte, toc et mouche très efficaces");
  }

  // HIVER / EAU FROIDE (< 8 °C) – meilleure période
  if (saison === "hiver" || temperature < 8) {
    list.push("Nymphe lourde (perdigon, stonefly) – toc profond ou verticale lente");
    list.push("Petit vairon ou éperlan vif – traîné lent ou posé profond");
    list.push("Ver de terre ou teigne – toc ou flotteur subaquatique");
    list.push("Micro-leurre finesse 3-6 cm (shad, minnow) – animation très lente");
    list.push("Mouche noyée ou streamer petit – dérive lente ou verticale");
    if (!isDay) {
      list.push("Pêche de nuit ou crépuscule → omble chasse activement près fond");
    }
    depthAdvice.push("Fond profond (4-15 m) – zones fraîches, cassures, tombants rocheux");
  }

  // PRINTEMPS (montée en activité, omble agressif)
  else if (saison === "printemps") {
    list.push("Mouche sèche ou émergente – surface pendant éclosions");
    list.push("Nymphe (pheasant tail, perdigon) – nymphe au fil ou toc");
    list.push("Petit minnow ou jerkbait 5-8 cm – twitching saccadé mi-eau");
    list.push("Cuillère légère n°0-2 argentée – récupération lente");
    list.push("Ver ou teigne – toc ou flotteur près bordures");
    if (conditions.includes('montante') || conditions.includes('pluie')) {
      list.push("Nymphe ou mouche – eau trouble = dérive au fil");
    }
    depthAdvice.push("Surface à mi-fond (0-5 m) – zones de courant modéré, bordures");
  }

  // ÉTÉ (eau chaude en surface, omble descend en profondeur)
  else if (saison === "été") {
    list.push("Verticale avec nymphe lourde ou petit shad – animation lente au fond");
    list.push("Drop shot ou ned rig finesse 4-7 cm – ultra lent en profondeur");
    list.push("Mouche noyée ou streamer – dérive lente en couches fraîches");
    list.push("Petit vairon ou éperlan – traîné lent en profondeur");
    list.push("Cuillère ou micro-jig 5-15 g – verticale ou traîné profond");
    if (temperature > 15) {
      list.push("Pêche en profondeur (8 m+) → omble fuit la chaleur de surface");
    }
    depthAdvice.push("Fond profond (6-20 m) – zones fraîches, thermocline, tombants");
  }

  // AUTOMNE (omble remonte, activité bonne)
  else if (saison === "automne") {
    list.push("Nymphe ou mouche noyée – toc ou dérive lente");
    list.push("Petit minnow ou leurre souple 5-8 cm – twitching mi-eau");
    list.push("Ver de terre ou teigne – toc ou flotteur");
    list.push("Cuillère légère – récupération saccadée près bordures");
    depthAdvice.push("Mi-eau à fond (2-8 m) – zones qui se refroidissent");
  }

  // Message final
  list.push("Nymphe lourde au toc et finesse profonde restent des valeurs sûres pour l'omble chevalier");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('ombre') || species.includes('thymallus')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau très froide → ombre peu active, appâts naturels fins + toc très lent");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → ombre en pleine montée, mouche sèche et nymphe excellentes");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → ombre très sélective en surface, mouche sèche et micro-leurres rapides");
  } else {
    techniqueAdvice.push("Automne → ombre nourricière, nymphe et streamer performants");
  }

  // HIVER / EAU FROIDE (< 8 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Nymphe lourde (perdigon, stonefly) – toc profond ou lent au fil");
    list.push("Petit ver de terre ou teigne – toc très lent près fond");
    list.push("Asticot ou pâte fine – flotteur ultra-léger ou posé");
    list.push("Micro-nymphe ou petite mouche noyée – dérive lente");
    list.push("Micro-leurre finesse 3-5 cm – animation ultra lente");
    depthAdvice.push("Fond ou mi-fond (0.5-2.5 m) – courant faible, zones calmes");
  }

  // PRINTEMPS (montée en activité, ombre très agressive)
  else if (saison === "printemps") {
    list.push("Mouche sèche (CDC, elk hair caddis, mayfly) – surface pendant éclosions");
    list.push("Nymphe légère (pheasant tail, perdigon, caddis) – nymphe au fil / toc");
    list.push("Ver de terre ou teigne – toc ou flotteur léger en rivière montante");
    list.push("Petite cuillère n°0-2 argentée – récupération lente mi-eau");
    list.push("Micro-spinner ou micro-cuillère – animation saccadée près bordures");
    if (conditions.includes('montante') || conditions.includes('pluie')) {
      list.push("Mouche sèche ou nymphe – eau trouble = surface ou nymphe");
    }
    depthAdvice.push("Surface à mi-eau (0-1.5 m) – courant modéré, zones d’éclosions");
  }

  // ÉTÉ (eau plus chaude, ombre sélective en surface)
  else if (saison === "été") {
    list.push("Mouche sèche imitative (caddis, mayfly, hopper) – surface matin/soir");
    list.push("Nymphe (perdigon, hare’s ear) – dérive naturelle au fil dans courant");
    list.push("Streamer petit ou mouche noyée – animation saccadée mi-eau");
    list.push("Micro-cuillère n°0-1 argentée – récupération rapide en surface");
    list.push("Petit micro-leurre finesse (minnow 4-6 cm) – twitching mi-eau");
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Mouche sèche ou nymphe – eau claire = imitations précises");
    }
    if (spotType.includes('rivière') || spotType.includes('courant')) {
      list.push("Nymphe ou mouche sèche – dérive naturelle dans courant");
    }
    depthAdvice.push("Surface (0-0.8 m) matin/soir ou mi-eau (0.5-1.5 m) en journée");
  }

  // AUTOMNE (ombre nourricière, bonne activité)
  else if (saison === "automne") {
    list.push("Nymphe (pheasant tail, perdigon) – toc ou dérive lente près fond");
    list.push("Streamer coloré (woolly bugger, zonker) – animation saccadée mi-eau");
    list.push("Ver de terre ou teigne – toc dans zones calmes ou courant faible");
    list.push("Petite cuillère ou micro-spinner – récupération saccadée");
    depthAdvice.push("Mi-eau à fond (0.5-2.5 m) – zones de courant faible, obstacles");
  }

  // Message final
  list.push("Mouche sèche et nymphe au fil restent des valeurs sûres toute l'année pour l'ombre");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('rotengle') || species.includes('scardinius')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 6) {
    techniqueAdvice.push("En hiver ou eau très froide → rotengle peu actif, appâts naturels fins + amorçage très léger");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → rotengle en bancs actifs près surface, flotteur et toc excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → rotengle très actif en surface/mid-eau, flotteur actif + amorçage copieux");
  } else {
    techniqueAdvice.push("Automne → rotengle nourricier, flotteur et appâts riches très performants");
  }

  // HIVER / EAU FROIDE (< 6–8 °C)
  if (saison === "hiver" || temperature < 6) {
    list.push("Petits asticots ou morceaux de ver – flotteur ultra-léger ou posé");
    list.push("Pain ou semoule – présenté sur flotteur simple ou posé");
    list.push("Maïs doux ou pellets solubles – amorçage très léger (quelques graines)");
    list.push("Pâte fine ou bouillettes digestes 6-10 mm – hair rig ou flotteur");
    depthAdvice.push("Fond ou mi-fond (1-3 m) – zones calmes, vaseuses, courant faible");
  }

  // PRINTEMPS (montée en activité, rotengle en bancs près bordures)
  else if (saison === "printemps") {
    list.push("Asticots ou vers de terre – flotteur ou toc dans courant faible");
    list.push("Maïs doux + pellets – amorçage modéré PVA ou spod léger");
    list.push("Pain ou semoule – flotteur actif ou posé près bordures");
    list.push("Petites bouillettes digestes 8-12 mm – hair rig simple");
    list.push("Pellets + maïs – présenté sur method feeder ou flotteur");
    if (conditions.includes('pluie') || conditions.includes('montante')) {
      list.push("Asticots ou ver – flotteur dans courant modéré");
    }
    depthAdvice.push("Mi-eau à surface (0.5-2 m) – bordures, zones qui se réchauffent");
  }

  // ÉTÉ / AUTOMNE (rotengle très actif, gros bancs nourriciers)
  else {
    list.push("Asticots, vers de terre ou teigne – flotteur actif ou posé");
    list.push("Maïs doux + pellets + graines + bouillettes – amorçage copieux spod ou PVA bag");
    list.push("Bouillettes spécifiques rotengle 10-15 mm (maïs, scopex, fruity…) – hair rig");
    list.push("Pellets + tiger nuts fermentés – amorçage lourd près obstacles");
    list.push("Pain ou semoule en grappe – flotteur actif ou method feeder");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Method feeder ou flotteur – maïs + pellets + asticots");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Flotteur ou toc – asticots/ver/maïs dans courant faible à moyen");
    }
    if (conditions.includes('vent') || conditions.includes('pluie')) {
      list.push("Amorçage copieux – mélange maïs + pellets + asticots");
    }
    depthAdvice.push("Surface à mi-eau (0-2.5 m) – bancs, zones calmes, bordures");
  }

  // Message final
  list.push("Asticots, maïs doux et flotteur actif restent des valeurs sûres toute l'année pour le rotengle");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('arc en ciel') || species.includes('arc-en-ciel') || species.includes('rainbow') || species.includes('oncorhynchus')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 8) {
    techniqueAdvice.push("En hiver ou eau froide → arc-en-ciel active au fond, appâts naturels + toc lent excellents");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → arc-en-ciel très agressive, mouche sèche/nymphe et toc au top");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → arc-en-ciel sélective en surface (soir/matin), mouche sèche + micro-leurres");
  } else {
    techniqueAdvice.push("Automne → arc-en-ciel nourricière, streamer et appâts naturels performants");
  }

  // HIVER / EAU FROIDE (< 8 °C)
  if (saison === "hiver" || temperature < 8) {
    list.push("Ver de terre ou teigne – toc lent ou flotteur subaquatique");
    list.push("Nymphe lourde (perdigon, stonefly) – toc profond ou verticale lente");
    list.push("Petit vairon ou éperlan vif – traîné lent ou posé");
    list.push("Micro-leurre finesse 4-7 cm (shad, minnow) – animation ultra lente");
    list.push("Mouche noyée ou petit streamer – dérive lente au fond");
    depthAdvice.push("Fond ou mi-fond (1-4 m) – zones profondes, courant faible");
  }

  // PRINTEMPS (montée en activité, éclosions possibles)
  else if (saison === "printemps") {
    list.push("Mouche sèche (CDC, elk hair caddis, mayfly) – surface pendant éclosions");
    list.push("Nymphe (pheasant tail, perdigon, caddis) – nymphe au fil / toc");
    list.push("Petite cuillère n°0-2 argentée – récupération lente mi-eau");
    list.push("Ver de terre ou teigne – toc ou flotteur léger en rivière montante");
    list.push("Micro-spinner ou micro-cuillère – animation saccadée près bordures");
    if (conditions.includes('montante') || conditions.includes('pluie')) {
      list.push("Nymphe ou mouche – eau trouble = surface ou nymphe");
    }
    depthAdvice.push("Surface à mi-eau (0-2 m) – courant modéré, zones d’éclosions");
  }

  // ÉTÉ (eau plus chaude, arc-en-ciel sélective en surface)
  else if (saison === "été") {
    list.push("Mouche sèche imitative (caddis, mayfly, hopper) – surface matin/soir");
    list.push("Nymphe (perdigon, hare’s ear) – dérive naturelle au fil dans courant");
    list.push("Streamer petit ou mouche noyée – animation saccadée mi-eau");
    list.push("Micro-cuillère n°0-2 argentée ou or – récupération rapide en surface");
    list.push("Petit micro-leurre finesse (minnow 4-7 cm) – twitching mi-eau");
    if (conditions.includes('soleil') || conditions.includes('clair')) {
      list.push("Mouche sèche ou nymphe – eau claire = imitations précises");
    }
    if (spotType.includes('rivière') || spotType.includes('courant')) {
      list.push("Nymphe ou mouche sèche – dérive naturelle dans courant");
    }
    depthAdvice.push("Surface (0-1 m) matin/soir ou mi-eau (0.5-2 m) en journée");
  }

  // AUTOMNE (ombre nourricière, bonne activité)
  else if (saison === "automne") {
    list.push("Nymphe (pheasant tail, perdigon) – toc ou dérive lente près fond");
    list.push("Streamer coloré (woolly bugger, zonker) – animation saccadée mi-eau");
    list.push("Ver de terre ou teigne – toc dans zones calmes ou courant faible");
    list.push("Petite cuillère ou micro-spinner – récupération saccadée");
    depthAdvice.push("Mi-eau à fond (1-3 m) – zones de courant faible, obstacles");
  }

  // Message final
  list.push("Mouche sèche et nymphe au fil restent des valeurs sûres toute l'année pour la truite arc-en-ciel");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('congre') || species.includes('conger')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 10) {
    techniqueAdvice.push("En hiver → congre très actif de nuit, gros appâts naturels posés au fond excellents");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → congre commence à chasser, appâts naturels + traîné lent performants");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → congre très actif de nuit, gros appâts + posé profond ou traîne");
  } else {
    techniqueAdvice.push("Automne → congre nourricier, appâts riches + posé profond de nuit");
  }

  // HIVER / EAU FROIDE (< 10 °C) – bonne période
  if (saison === "hiver" || temperature < 10) {
    list.push("Gros poisson mort (gardon, maquereau, tacaud) – posé statique profond");
    list.push("Calamar frais entier ou en morceaux – hair rig lourd ou posé");
    list.push("Gros vers de sable / américain en grappe – présenté sur flotteur subaquatique ou posé");
    list.push("Petit vif (gardon, lançon) – traîné lent ou posé près structures");
    list.push("Crevettes ou crabes en grappe – posé de nuit");
    if (!isDay) {
      list.push("Pêche de nuit → très efficace, congre chasse activement");
    }
    depthAdvice.push("Fond profond (5-20 m) – cassures, épaves, roches, zones vaseuses");
  }

  // PRINTEMPS (activité croissante, congre sort de ses trous)
  else if (saison === "printemps") {
    list.push("Gros poisson mort ou vif – traîné lent ou posé profond");
    list.push("Calamar frais ou morceaux – hair rig ou posé près obstacles");
    list.push("Gros vers ou lombrics – présenté sur flotteur subaquatique");
    list.push("Petit crabe ou crevettes – posé statique de nuit");
    depthAdvice.push("Fond à mi-fond (4-15 m) – zones rocheuses, épaves, tombants");
  }

  // ÉTÉ / AUTOMNE (congre très actif, gros sujets nourriciers)
  else {
    list.push("Gros poisson mort entier (maquereau, gardon, tacaud) – posé profond de nuit");
    list.push("Calamar frais ou poulpe – hair rig lourd ou posé");
    list.push("Gros vif (gardon, lançon) – traîné lent près structures");
    list.push("Gros vers de sable ou lombrics – présenté en profondeur");
    list.push("Crevettes ou crabes en grappe – posé statique");
    if (!isDay) {
      list.push("Pêche de nuit → combo explosif, congre chasse agressivement");
    }
    if (spotType.includes('digue') || spotType.includes('plage') || spotType.includes('bateau')) {
      list.push("Posé lourd ou traîné – gros appâts + amorçage odorant");
    }
    depthAdvice.push("Fond profond (6-25 m) – épaves, roches, cassures, zones vaseuses");
  }

  // Message final
  list.push("Gros poisson mort ou calamar posés au fond de nuit restent des valeurs sûres pour le congre");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('barracuda') || species.includes('barracuda') || species.includes('sphyraena')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 14) {
    techniqueAdvice.push("En hiver ou eau froide → barracuda peu actif, traîne lente ou appâts naturels profonds");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → barracuda commence à chasser, leurres rapides et traîne excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → barracuda ultra-agressif, surface (popper, stickbait) et powerfishing explosifs");
  } else {
    techniqueAdvice.push("Automne → barracuda nourricier, leurres rapides + traîne très performants");
  }

  // HIVER / EAU FROIDE (< 14 °C) – activité faible
  if (saison === "hiver" || temperature < 14) {
    list.push("Petit vif (maquereau, sardine) – traîné très lent ou posé profond");
    list.push("Gros leurre souple 10-15 cm – animation ultra lente + pauses longues");
    list.push("Calamar ou morceaux – posé statique ou traîné lent");
    list.push("Jig head 20-40 g + shad – grattage fond ou verticale lente");
    depthAdvice.push("Mi-fond à fond (5-15 m) – zones profondes, cassures, roches");
  }

  // PRINTEMPS (activité croissante, barracuda chasse en bancs)
  else if (saison === "printemps") {
    list.push("Leurres souples 10-18 cm (shad, slug) – tête 20-50 g, récupération saccadée");
    list.push("Minnow / jerkbait 10-15 cm – twitchs rapides + pauses");
    list.push("Cuillère lourde ou jig vibrant – powerfishing mi-eau");
    list.push("Petit vif ou maquereau – traîné rapide ou lancé");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Powerfishing agressif – leurres rapides en surface");
    }
    depthAdvice.push("Surface à mi-eau (0-8 m) – bancs, zones rocheuses");
  }

  // ÉTÉ (eau chaude, barracuda hyper agressif en surface)
  else if (saison === "été") {
    list.push("Popper ou stickbait surface – récupération saccadée explosive (très spectaculaire !)");
    list.push("Leurres souples 12-20 cm – powerfishing rapide près roches / herbiers");
    list.push("Gros swimbait ou jerkbait – animation vive mi-eau");
    list.push("Traîne rapide avec maquereau ou leurre souple – zones ouvertes");
    list.push("Cuillère ou jig vibrant – lancer loin + récupération rapide");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Surface très efficace – popper ou stickbait en chasses");
    }
    if (spotType.includes('bateau')) {
      list.push("Traîne ou verticale – gros leurres en surface/mi-eau");
    }
    depthAdvice.push("Surface à mi-eau (0-6 m) – chasses visibles, roches, courants");
  }

  // AUTOMNE (barracuda nourricier, très actif)
  else if (saison === "automne") {
    list.push("Leurres souples 15-25 cm tête lourde – powerfishing saccadé");
    list.push("Jerkbait ou minnow 12-18 cm – twitching rapide + pauses");
    list.push("Gros vif (maquereau, sardine) – traîné ou lancé");
    list.push("Popper surface ou stickbait – récupération agressive");
    depthAdvice.push("Surface à mi-eau (0-10 m) – zones rocheuses, bancs nourriciers");
  }

  // Message final
  list.push("Popper surface et leurres souples rapides restent des valeurs sûres pour le barracuda (surtout de jour en été)");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('snook') || species.includes('centropomus')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 18) {
    techniqueAdvice.push("En hiver ou eau froide → snook peu actif, traîne lente ou appâts naturels profonds");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → snook commence à chasser agressivement, leurres rapides et traîne excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → snook ultra-agressif, surface (popper, stickbait) et powerfishing explosifs");
  } else {
    techniqueAdvice.push("Automne → snook nourricier, leurres rapides + traîne très performants");
  }

  // HIVER / EAU FROIDE (< 18 °C) – activité faible
  if (saison === "hiver" || temperature < 18) {
    list.push("Petit vif (mulet, sardine) – traîné très lent ou posé profond");
    list.push("Gros leurre souple 10-15 cm – animation ultra lente + pauses longues");
    list.push("Calamar ou morceaux – posé statique ou traîné lent");
    list.push("Jig head 20-50 g + shad – grattage fond ou verticale lente");
    depthAdvice.push("Mi-fond à fond (4-12 m) – zones profondes, estuaires abrités");
  }

  // PRINTEMPS (activité croissante, snook chasse en estuaires)
  else if (saison === "printemps") {
    list.push("Leurres souples 10-18 cm (shad, slug) – tête 15-40 g, récupération saccadée");
    list.push("Minnow / jerkbait 9-14 cm – twitchs rapides + pauses longues");
    list.push("Cuillère lourde ou jig vibrant – powerfishing mi-eau");
    list.push("Petit vif ou mulet – traîné rapide ou lancé près mangroves");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Powerfishing agressif – leurres rapides en surface");
    }
    depthAdvice.push("Surface à mi-eau (0-6 m) – estuaires, mangroves, herbiers");
  }

  // ÉTÉ (eau chaude, snook hyper agressif en surface)
  else if (saison === "été") {
    list.push("Popper ou stickbait surface – récupération saccadée explosive (très spectaculaire !)");
    list.push("Leurres souples 12-20 cm – powerfishing rapide près mangroves / herbiers");
    list.push("Gros swimbait ou jerkbait – animation vive mi-eau");
    list.push("Traîne rapide avec vif ou leurre souple – zones ouvertes");
    list.push("Cuillère ou jig vibrant – lancer loin + récupération rapide");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Surface très efficace – popper ou stickbait en chasses");
    }
    if (spotType.includes('bateau')) {
      list.push("Traîne ou verticale – gros leurres en surface/mi-eau");
    }
    if (spotType.includes('plage') || spotType.includes('digue')) {
      list.push("Lancer popper ou leurre souple – récupération saccadée");
    }
    depthAdvice.push("Surface à mi-eau (0-5 m) – chasses visibles, mangroves, herbiers");
  }

  // AUTOMNE (snook nourricier, très actif)
  else if (saison === "automne") {
    list.push("Leurres souples 15-25 cm tête lourde – powerfishing saccadé");
    list.push("Jerkbait ou minnow 12-18 cm – twitching rapide + pauses");
    list.push("Gros vif (mulet, sardine) – traîné ou lancé");
    list.push("Popper surface ou stickbait – récupération agressive");
    depthAdvice.push("Surface à mi-eau (0-8 m) – zones rocheuses, bancs nourriciers");
  }

  // Message final
  list.push("Popper surface et leurres souples rapides restent des valeurs sûres pour le snook (surtout de jour en été)");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('tarpon') || species.includes('megalops')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 20) {
    techniqueAdvice.push("En hiver ou eau froide → tarpon peu actif ou migré, traîne lente ou appâts naturels profonds");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → tarpon commence à chasser, leurres rapides et traîne excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → tarpon ultra-agressif, surface (popper, stickbait) et powerfishing explosifs");
  } else {
    techniqueAdvice.push("Automne → tarpon nourricier, leurres rapides + traîne très performants");
  }

  // HIVER / EAU FROIDE (< 20 °C) – activité faible
  if (saison === "hiver" || temperature < 20) {
    list.push("Petit vif (mulet, sardine, crab) – traîné très lent ou posé profond");
    list.push("Gros leurre souple 15-25 cm – animation ultra lente + pauses longues");
    list.push("Calamar ou morceaux – posé statique ou traîné lent");
    list.push("Jig head 30-80 g + shad – grattage fond ou verticale lente");
    depthAdvice.push("Mi-fond à fond (5-15 m) – zones profondes, estuaires abrités");
  }

  // PRINTEMPS (activité croissante, tarpon arrive en estuaires)
  else if (saison === "printemps") {
    list.push("Leurres souples 15-25 cm (shad, slug) – tête 30-70 g, récupération saccadée");
    list.push("Minnow / jerkbait 12-20 cm – twitchs rapides + pauses explosives");
    list.push("Cuillère lourde ou jig vibrant – powerfishing mi-eau");
    list.push("Petit vif ou mulet – traîné rapide ou lancé près mangroves");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Powerfishing agressif – leurres rapides en surface");
    }
    depthAdvice.push("Surface à mi-eau (0-8 m) – estuaires, mangroves, herbiers");
  }

  // ÉTÉ (eau chaude, tarpon hyper agressif en surface)
  else if (saison === "été") {
    list.push("Popper ou stickbait surface – récupération saccadée explosive (sauts spectaculaires !)");
    list.push("Leurres souples 18-30 cm – powerfishing rapide près mangroves / herbiers");
    list.push("Gros swimbait ou jerkbait – animation vive mi-eau");
    list.push("Traîne rapide avec vif ou leurre souple – zones ouvertes");
    list.push("Cuillère ou jig vibrant – lancer loin + récupération rapide");
    if (conditions.includes('nuageux') || conditions.includes('pluie')) {
      list.push("Surface très efficace – popper ou stickbait en chasses");
    }
    if (spotType.includes('bateau')) {
      list.push("Traîne ou verticale – gros leurres en surface/mi-eau");
    }
    if (spotType.includes('plage') || spotType.includes('digue')) {
      list.push("Lancer popper ou leurre souple – récupération saccadée");
    }
    depthAdvice.push("Surface à mi-eau (0-6 m) – chasses visibles, mangroves, estuaires");
  }

  // AUTOMNE (tarpon nourricier, très actif)
  else if (saison === "automne") {
    list.push("Leurres souples 20-30 cm tête lourde – powerfishing saccadé");
    list.push("Jerkbait ou minnow 15-25 cm – twitching rapide + pauses");
    list.push("Gros vif (mulet, sardine) – traîné ou lancé");
    list.push("Popper surface ou stickbait – récupération agressive");
    depthAdvice.push("Surface à mi-eau (0-10 m) – zones rocheuses, bancs nourriciers");
  }

  // Message final
  list.push("Popper surface et gros leurres souples rapides restent des valeurs sûres pour le tarpon (surtout de jour en été)");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('arapaima') || species.includes('pirarucu') || species.includes('gigas')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 20) {
    techniqueAdvice.push("En hiver ou eau froide → arapaima peu actif, gros appâts naturels posés au fond");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → arapaima commence à s’activer, gros appâts + traîné lent");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → arapaima très actif, surface explosive (popper géant) + gros leurres");
  } else {
    techniqueAdvice.push("Automne → arapaima nourricier, gros appâts posés ou traîne");
  }

  // HIVER / EAU FROIDE (< 20 °C) – activité faible
  if (saison === "hiver" || temperature < 20) {
    list.push("Gros poisson mort entier (tilapia, carpeau, gardon) – posé statique profond");
    list.push("Gros vif (tilapia, carassin) – traîné très lent ou posé");
    list.push("Gros calamar ou morceaux de poisson – hair rig lourd ou posé");
    list.push("Gros ver de terre ou lombrics en grappe – présenté au fond");
    list.push("Gros appât végétal (fruits, manioc) – posé lent (technique amazonienne)");
    depthAdvice.push("Fond profond (3-8 m) – zones calmes, vaseuses ou herbeuses");
  }

  // PRINTEMPS (activité croissante, arapaima remonte respirer)
  else if (saison === "printemps") {
    list.push("Gros poisson mort ou vif – traîné lent ou posé profond");
    list.push("Gros leurre souple 20-30 cm – animation lente + pauses longues");
    list.push("Gros swimbait ou jerkbait géant – récupération saccadée mi-eau");
    list.push("Gros appât naturel (tilapia, carpeau) – hair rig ou traîné");
    if (temperature > 22) {
      list.push("Commence à prospecter en surface – arapaima remonte respirer");
    }
    depthAdvice.push("Fond à mi-eau (2-6 m) – zones herbeuses, cassures");
  }

  // ÉTÉ / AUTOMNE (arapaima très actif, gros sujets nourriciers)
  else {
    list.push("Popper géant ou stickbait surface – récupération saccadée explosive (sauts incroyables !)");
    list.push("Gros leurres souples 25-40 cm – powerfishing rapide près herbiers");
    list.push("Gros swimbait ou jerkbait – animation vive mi-eau");
    list.push("Gros vif (tilapia, poisson-chat) – traîné ou posé près surface");
    list.push("Gros appât naturel (poisson entier, fruits) – traîné lent ou posé");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Posé lourd ou traîne – gros appâts près herbiers / zones respirantes");
    }
    if (!isDay) {
      list.push("Pêche de nuit ou crépuscule → arapaima chasse activement en surface");
    }
    depthAdvice.push("Surface à mi-eau (0-5 m) – zones herbeuses, zones où il remonte respirer");
  }

  // Message final
  list.push("Gros popper surface ou poisson mort entier posés restent des valeurs sûres pour l'arapaima (surtout en eau chaude)");
  list.push("Enregistre ta session pour affiner les conseils !");
}
  if (species.includes('snakehead') || species.includes('channa')) {
  // Message introductif selon saison
  if (saison === "hiver" || temperature < 15) {
    techniqueAdvice.push("En hiver ou eau froide → snakehead peu actif, gros appâts naturels posés au fond");
  } else if (saison === "printemps") {
    techniqueAdvice.push("Printemps → snakehead commence à chasser, leurres de surface et powerfishing excellents");
  } else if (saison === "été") {
    techniqueAdvice.push("Été → snakehead ultra-agressif, surface (frog, popper) et gros leurres explosifs");
  } else {
    techniqueAdvice.push("Automne → snakehead nourricier, surface + powerfishing très performants");
  }

  // HIVER / EAU FROIDE (< 15 °C) – activité faible
  if (saison === "hiver" || temperature < 15) {
    list.push("Gros poisson mort ou vif (tilapia, gardon) – posé statique profond");
    list.push("Gros ver de terre ou lombrics en grappe – hair rig lourd ou posé");
    list.push("Calamar ou morceaux de poisson – présenté au fond");
    list.push("Gros appât naturel (grenouille, écrevisse) – posé lent près herbiers");
    list.push("Gros leurre souple 15-25 cm – animation ultra lente + pauses");
    depthAdvice.push("Fond profond (2-6 m) – zones vaseuses, herbiers denses");
  }

  // PRINTEMPS (activité croissante, snakehead sort de ses trous)
  else if (saison === "printemps") {
    list.push("Frog ou leurre de surface – récupération saccadée avec pauses dans herbiers");
    list.push("Gros leurre souple 15-25 cm – tête 20-50 g, animation saccadée");
    list.push("Gros swimbait ou jerkbait – récupération vive mi-eau");
    list.push("Gros vif ou poisson mort – traîné lent ou posé près structures");
    list.push("Jig vibrant ou chatterbait – powerfishing près obstacles");
    depthAdvice.push("Surface à mi-eau (0-4 m) – herbiers, zones végétalisées");
  }

  // ÉTÉ / AUTOMNE (snakehead très actif, gros sujets nourriciers)
  else {
    list.push("Frog ou leurre de surface – récupération saccadée explosive dans herbiers (ferrage puissant !)");
    list.push("Gros leurres souples 20-35 cm – powerfishing rapide près végétation");
    list.push("Gros popper ou stickbait – animation agressive en surface");
    list.push("Gros vif (tilapia, poisson-chat) – traîné ou lancé près herbiers");
    list.push("Gros swimbait ou jerkbait géant – récupération saccadée mi-eau");
    if (spotType.includes('étang') || spotType.includes('lac')) {
      list.push("Surface + powerfishing – gros appâts dans herbiers denses");
    }
    if (spotType.includes('rivière') || spotType.includes('canal')) {
      list.push("Traîné lent ou posé – gros appâts dans courant faible");
    }
    if (!isDay) {
      list.push("Pêche de nuit ou crépuscule → snakehead chasse activement en surface");
    }
    depthAdvice.push("Surface à mi-eau (0-5 m) – zones herbeuses, végétation dense");
  }

  // Message final
  list.push("Frog surface et gros leurres souples restent des valeurs sûres pour le snakehead (surtout en eau chaude)");
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

  // === 2 CONSEILS RANDOM PAR ESPÈCE (SANS FALLBACK BROCHET) ===
const randomParEspece = {
  brochet: [
    "Jerkbait suspending avec pauses très longues en eau profonde.",
    "Gros shad souple 20cm en linéaire ultra-lent au fond.",
    "Blade bait en yo-yo lent sur tombants rocheux.",
    "Rubber jig lourd avec trailer volumineux en verticale.",
    "Dead sticking avec gros tube posé plusieurs minutes.",
    "Lipless lourd en récupération stop and go.",
    "Swimbait slow sinking en pauses longues.",
    "Jig vibrant posé au fond avec twitchs rares.",
    "Texas rig gros worm gratté lentement sur roche.",
    "Balancier métallique lourd en verticale lac.",
    "Gros shad line-thru en linéaire glacial.",
    "Jerkbait longbill countdown structures profondes.",
    "Gros tailworm drop shot lourd cassures.",
    "Rubber jig football traîné gravier profond.",
    "Leurre souple 20cm screw head posé.",
    "Blade bait vibration minimale eau claire froide.",
    "Verticale gros spoon récupération morte.",
    "Texas rig creature dandine verticale.",
    "Jerkbait suspending naturel pauses 90s.",
    "Gros swimbait jointed slow sinking profond.",
    "Lipless lourd eau trouble pauses.",
    "Shad finesse linéaire ultra-lent soirée.",
    "Rubber jig 50g gros trailer dandine.",
    "Dead slow jerkbait long 10m+.",
    "Verticale tailspin lourd hiver.",
    "Leurre souple 25cm texan 40g gratté.",
    "Blade bait eau teintée vibration faible.",
    "Swimbait réaliste pause 60s+.",
    "Gros rubber jig nuit glaciale trailer volumineux.",
    "Lipless 60g stop and go structures.",
    "Texas rig gros creature gratté lent.",
    "Verticale gros tube zone profonde.",
    "Shad 18cm weighted hook posé.",
    "Jerkbait long pauses très longues.",
    "Blade bait yo-yo minimal radiers.",
    "Gros swimbait 8-figure lent profond.",
    "Rubber jig living rubber trailer gros.",
    "Lipless lourd vibration minimale.",
    "Texas rig gros worm poids lourd gratté.",
    "Verticale gros balancier lac gelé.",
    "Jerkbait suspending eau froide claire.",
    "Gros shad souple 20cm linéaire mort.",
    "Blade bait faible vibration.",
    "Swimbait 25cm slow sinking profond.",
    "Rubber jig 60g trailer énorme.",
    "Lipless récupération morte.",
    "Texas rig 22cm worm texan lourd.",
    "Verticale gros tail plombé.",
    "Jerkbait suspending parfait.",
    "Gros tube dandine verticale.",
    "Blade bait vibration faible.",
    "Swimbait 20cm lent profond.",
    "Rubber jig 50g black/blue.",
    "Lipless lourd stop and go.",
    "Texas rig creature 20cm.",
    "Verticale gros spoon.",
    "Jerkbait long pause 60s.",
    "Gros tailworm screw lock 40g.",
    "Blade bait yo-yo lent.",
    "Swimbait 25cm slow sinking.",
    "Rubber jig football 70g.",
    "Lipless 70g vibration minimale.",
    "Texas rig 25cm worm.",
    "Verticale gros tail.",
    "Jerkbait suspending naturel.",
    "Gros shad 22cm linéaire glacial.",
    "Blade bait faible vibration.",
    "Swimbait réaliste pause longue.",
    "Rubber jig 60g trailer gros.",
    "Lipless stop and go profond.",
    "Texas rig gros creature gratté.",
    "Verticale gros tube zone profonde.",
    "Shad weighted posé.",
    "Jerkbait pauses 90s.",
    "Blade bait yo-yo.",
    "Gros swimbait jointed profond.",
    "Rubber jig dandine.",
    "Lipless vibration faible.",
    "Texas rig 20cm worm.",
    "Verticale balancier lourd.",
    "Jerkbait countdown profond.",
    "Gros shad screw head.",
    "Blade bait chromé lent.",
    "Swimbait slow sinking pause.",
    "Rubber jig football traîné.",
    "Lipless stop and go.",
    "Texas rig creature dandine.",
    "Verticale spoon récupération morte.",
    "Jerkbait suspending 90s.",
    "Gros tailworm drop shot.",
    "Blade bait vibration minimale.",
    "Swimbait réaliste 60s pause.",
    "Rubber jig night glaciale.",
    "Lipless 60g stop and go.",
    "Texas rig brush hog gratté.",
    "Verticale gros tube zone profonde.",
    "Shad 18cm weighted posé.",
    "Jerkbait long pauses très longues.",
    "Blade bait yo-yo minimal.",
    "Gros swimbait 8-figure lent profond.",
    "Rubber jig living trailer gros.",
    "Lipless vibration minimale eau trouble.",
    "Texas rig sweet beaver gratté lent.",
    "Verticale jigging rap naturel.",
    "Leurre souple 22cm line-thru glacial.",
    "Jerkbait pointer suspending.",
    "Gros blade bait yo-yo.",
    "Swimbait slide swimmer slow sinking.",
    "Rubber jig dirty black/blue.",
    "Lipless vibration minimale.",
    "Texas rig rage poids lourd.",
    "Verticale gros balancier lac.",
    "Jerkbait suspending eau froide claire.",
    "Gros shad linéaire très lent.",
    "Blade bait faible vibration.",
    "Swimbait 25cm slow sinking.",
    "Rubber jig 60g trailer énorme.",
    "Lipless récupération morte.",
    "Texas rig 22cm worm texan lourd.",
    "Verticale gros tail plombé.",
    "Jerkbait suspending parfait.",
    "Gros tube dandine verticale.",
    "Blade bait vibration faible.",
    "Swimbait 20cm lent profond.",
    "Rubber jig 50g black/blue.",
    "Lipless lourd stop and go.",
    "Texas rig creature 20cm.",
    "Verticale gros spoon chromé.",
    "Jerkbait long pause 60s.",
    "Gros tailworm screw lock 40g.",
    "Blade bait yo-yo lent.",
    "Swimbait 25cm slow sinking.",
    "Rubber jig football 70g.",
    "Lipless 70g vibration minimale.",
    "Texas rig 25cm worm.",
    "Verticale gros tail.",
    "Jerkbait suspending naturel.",
    "Gros shad 22cm linéaire glacial.",
    "Blade bait faible vibration.",
    "Swimbait réaliste pause longue.",
    "Rubber jig 60g trailer gros.",
    "Lipless stop and go profond.",
    "Texas rig gros creature gratté.",
    "Verticale gros tube zone profonde.",
    "Shad weighted posé.",
    "Jerkbait pauses 90s.",
    "Blade bait yo-yo.",
    "Gros swimbait jointed profond.",
    "Rubber jig dandine.",
    "Lipless vibration faible.",
    "Texas rig 20cm worm.",
    "Verticale balancier lourd.",
    "Jerkbait countdown profond.",
    "Gros shad screw head.",
    "Blade bait chromé lent.",
    "Swimbait slow sinking pause.",
    "Rubber jig football traîné.",
    "Lipless stop and go.",
    "Texas rig creature dandine.",
    "Verticale spoon récupération morte.",
    "Jerkbait suspending 90s.",
    "Gros tailworm drop shot.",
    "Blade bait vibration minimale.",
    "Swimbait réaliste 60s pause.",
    "Rubber jig night glaciale.",
    "Lipless 60g stop and go.",
    "Texas rig brush hog gratté.",
    "Verticale gros tube zone profonde.",
    "Shad 18cm weighted posé.",
    "Jerkbait long pauses très longues.",
    "Blade bait yo-yo minimal.",
    "Gros swimbait 8-figure lent profond.",
    "Rubber jig living trailer gros.",
    "Lipless vibration minimale eau trouble.",
    "Texas rig sweet beaver gratté lent.",
    "Verticale jigging rap naturel.",
    "Leurre souple 22cm line-thru glacial.",
    "Jerkbait pointer suspending.",
    "Gros blade bait yo-yo.",
    "Swimbait slide swimmer slow sinking.",
    "Rubber jig dirty black/blue."
  ],
  perche: [
    "Micro-jig ou drop shot en verticale sur tombants rocheux.",
    "Petits crankbaits en récupération variée.",
    "Leurres souples finesse en linéaire lent imitant écrevisses.",
    "Ned rig avec pauses longues sur fonds propres.",
    "Cuillère ondulante fine en récupération variée.",
    "Finesse jig tête ronde en dandine verticale.",
    "Dandine avec petit shad sous branches noyées.",
    "Wacky rig en weightless autour obstacles.",
    "Micro spinnerbait en récupération lente.",
    "Petit tube jig en verticale.",
    "Drop shot finesse worm en pause longue.",
    "Micro crankbait shallow en prospection rapide.",
    "Leurre souple 5-7cm en texan léger herbiers.",
    "Petite lame vibrante en récupération régulière.",
    "Ned rig mushroom head avec finesse worm.",
    "Micro jigging spoon en verticale hiver.",
    "Petit swimbait 7cm en linéaire lent.",
    "Tube jig 6cm en dandine rochers.",
    "Finesse spinnerbait en slow roll bordure.",
    "Leurre souple dropshot shad imitation alevin.",
    "Micro lipless en récupération rapide hauts-fonds.",
    "Wacky rig senko en chute libre.",
    "Petit jerkbait SP en twitching rapide.",
    "Cuillère n°1 en récupération variée rivière.",
    "Finesse football jig avec trailer craw gravier.",
    "Micro crankbait squarebill fouille souches.",
    "Leurre souple finesse en weightless obstacles.",
    "Petit chatterbait en zone peu profonde.",
    "Tail spin en verticale perchoirs.",
    "Drop shot smallie beaver imitation gobie.",
    "Micro crankbait flat side en twitching.",
    "Leurre souple curly tail linéaire lent.",
    "Ned rig mushroom head elaztech worm.",
    "Petit lipless chrome soleil plateaux.",
    "Tube jig en free rig eau moyenne.",
    "Finesse jig arkie head trailer chunk.",
    "Micro spinnerbait double willow burn léger.",
    "Leurre souple shad 8cm weighted hook.",
    "Petit topwater pencil en walking.",
    "Drop shot finesse worm pause très longue.",
    "Micro blade bait yo-yo lent.",
    "Leurre souple creature bait ned rig.",
    "Petit crankbait lipless red craw.",
    "Wacky rig yamamoto style green pumpkin.",
    "Micro jig ronde dandine branches.",
    "Tube small skipping.",
    "Finesse swimbait keitech style linéaire lent.",
    "Petit jerkbait vision junior twitching.",
    "Cuillère n°2 or eau trouble.",
    "Drop shot roboworm straight tail.",
    "Micro chatterbait trailer ménure finesse.",
    "Leurre souple jackall clone fry imitation alevin.",
    "Ned rig half shell finesse craw.",
    "Petit lipless jackall TN38 vibration fine.",
    "Tube jig coffee style.",
    "Finesse football jig baby rage craw.",
    "Micro crankbait duo realis.",
    "Leurre souple deathadder 6cm no sinker.",
    "Petit spinnerbait micro slow roll.",
    "Drop shot osp dolive stick pause longue.",
    "Micro blade bait damiki vault verticale.",
    "Leurre souple geecrack bellows shad linéaire.",
    "Ned rig missile baits shockwave.",
    "Petit topwater illex chubby popper matin.",
    "Tube strike king coffee tube.",
    "Finesse jig pitchin yamamoto hula grub.",
    "Micro lipless yo-zuri 3DB récupération variée.",
    "Leurre souple keitech swing impact fat 3.3.",
    "Petit jerkbait megabass x-80 twitching.",
    "Cuillère mepps black fury n°2 eau teintée.",
    "Drop shot jackall crosstail shad.",
    "Micro crankbait lucky craft bevy shallow.",
    "Leurre souple z-man finesse shroomz.",
    "Ned rig berkley powerbait maxscent flat worm.",
    "Petit chatterbait z-man micro finesse.",
    "Tube big bite baits smallie tube.",
    "Finesse swimbait basstrix trailer jig.",
    "Micro lipless rapala rippin rap ultra light.",
    "Leurre souple strike king rage menace ned.",
    "Petit jerkbait yo-zuri pins minnow.",
    "Cuillère savage gear rotabell n°1.",
    "Drop shot reins swamp mover.",
    "Micro blade bait b fish n pulse-r.",
    "Leurre souple deps basirisky weightless.",
    "Ned rig xzone muscle back finesse craw.",
    "Petit topwater rebel pop-r micro.",
    "Tube missile baits mini tube.",
    "Finesse jig arky head keitech little spider.",
    "Micro crankbait panther martin inline.",
    "Leurre souple jackall rhythm wag.",
    "Petit spinnerbait strike king mini king.",
    "Drop shot big bite baits trick stick.",
    "Micro lipless hed don blade bait.",
    "Leurre souple geecrack dum dum hog.",
    "Ned rig zoom beatdown.",
    "Petit jerkbait rapala x-rap 6.",
    "Cuillère blue fox vibrax shallow.",
    "Drop shot berkley gulp minnow.",
    "Micro chatterbait booyah boss pop micro.",
    "Leurre souple z-man TRD ticklerz.",
    "Tube strike king bitsy tube.",
    "Finesse swimbait damiki air pocket."
  ],
  sandre: [
    "Pêche au fond avec jig ou texas rig en animation très lente.",
    "Verticale avec shad ou finesse jig sur cassures profondes.",
    "Linéaire lent avec gros leurre souple par faible luminosité.",
    "Dead slow avec jerkbait suspendu en soirée.",
    "Leurre souple vibrant gratté sur le fond.",
    "Shad en linéaire très lent près des piles de pont.",
    "Lame vibrante en récupération lente sur plateaux.",
    "Verticale avec tailworm en période froide.",
    "Jigging rap ou balancier en hiver profond.",
    "Leurre souple monté en drop shot sur tombants.",
    "Finesse shad 10-12cm en linéaire ultra-lent au crépuscule.",
    "Texas rig worm 15cm gratté sur fonds sableux.",
    "Verticale finesse jig près des obstacles en soirée.",
    "Leurre souple curly tail en traction lente au fond.",
    "Jerkbait longbill en pauses longues en eau profonde.",
    "Blade bait en récupération lente sur cassures.",
    "Shad plombé en verticale sous le bateau en hiver.",
    "Carolina rig lizard sur plaines graveleuses.",
    "Leurre souple imitant poissonnet mort en dead sticking.",
    "Jig vibrant posé au fond avec longues pauses.",
    "Finesse tube en dandine autour des rochers en soirée.",
    "Linéaire très lent avec swimbait réaliste.",
    "Drop shot finesse worm sur tombants profonds.",
    "Leurre souple en texan léger gratté près des piles.",
    "Jerkbait suspending en twitching minimaliste par eau froide.",
    "Verticale balancier métallique en hiver.",
    "Shad 12cm linéaire lent le long des berges abruptes.",
    "Texas rig creature bait en flipping dans bois noyés.",
    "Lame vibrante slow roll sur plateaux sableux.",
    "Leurre souple en dead ringing posé au fond la nuit.",
    "Verticale avec gros finesse jig en période post-frontal.",
    "Jerkbait suspending naturel en eau claire froide.",
    "Shad monté en screw head en linéaire lent.",
    "Finesse jig arkie avec trailer chunk sur fonds durs.",
    "Leurre souple tail en verticale sur cassures.",
    "Blade bait chromé en yo-yo sur radiers.",
    "Drop shot avec straight worm en pause très longue.",
    "Texas rig 10cm en skipping sous branches surplombantes.",
    "Jerkbait deep diver en counting down sur fosses.",
    "Leurre souple paddle tail en traction sur fond.",
    "Verticale avec petit swimbait plombé en hiver.",
    "Lame vibrante lourde en récupération lente en courant.",
    "Shad finesse en linéaire au ras du fond en soirée.",
    "Jig football avec trailer craw sur gravier.",
    "Leurre souple en free rig en eau profonde.",
    "Dead sticking avec finesse worm sur tombants.",
    "Verticale avec jigging spoon en lac profond.",
    "Texas rig finesse avec small creature en post-frontal.",
    "Jerkbait en eau froide claire.",
    "Leurre souple vibrating jig en trailer fin.",
    "Drop shot avec small shad en imitation alevin.",
    "Lame vibrante argentée en soleil sur plateaux.",
    "Shad 15cm en texan dans obstacles submergés.",
    "Verticale avec rubber jig finesse en hiver.",
    "Linéaire lent avec jerkbait suspending.",
    "Blade bait noir en eau trouble.",
    "Texas rig lizard en carolina sur flats.",
    "Leurre souple tube en dandine verticale.",
    "Jerkbait long en pauses 30 secondes par eau très froide.",
    "Finesse swimbait en linéaire lent en soirée.",
    "Drop shot straight tail en green pumpkin.",
    "Verticale avec tailworm monté offset.",
    "Leurre souple en screw lock pour meilleure tenue.",
    "Jig vibrating en récupération stop and go.",
    "Shad finesse en weighted hook près des structures.",
    "Texas rig small beaver en imitation écrevisse.",
    "Lame vibrante or en eau teintée.",
    "Verticale avec balancier en couleur perch.",
    "Leurre souple curly en dead slow au fond.",
    "Jerkbait en suspending parfait.",
    "Drop shot avec finesse craw en zone rocailleuse.",
    "Blade bait firetiger en période active.",
    "Texas rig 12cm worm en linéaire très lent.",
    "Verticale avec gros tube en hiver profond.",
    "Leurre souple paddle tail en screw head gratté.",
    "Jig arkie avec trailer twin tail.",
    "Shad 10cm en linéaire au ras du fond en nuit.",
    "Drop shot avec flat worm en pause longue.",
    "Lame vibrante black en eau trouble.",
    "Texas rig finesse en zone claire post-frontal.",
    "Verticale avec jigging rap en couleur naturelle.",
    "Leurre souple en texan léger sur tombants.",
    "Jerkbait en twitching fin.",
    "Blade bait chrome/blue en soleil.",
    "Shad finesse en drop shot en eau froide.",
    "Texas rig small lizard en carolina rig.",
    "Verticale avec tail en couleur chartreuse.",
    "Leurre souple vibrating en trailer shad.",
    "Jig football en traîne lente sur gravier.",
    "Drop shot avec straight worm en green pumpkin.",
    "Lame vibrante slow en récupération variée.",
    "Shad 12cm en linéaire lent en hiver profond.",
    "Texas rig creature en flipping léger.",
    "Verticale avec balancier en couleur perch.",
    "Leurre souple en dead sticking sur fond propre.",
    "Jerkbait en suspending.",
    "Blade bait gold en eau claire.",
    "Drop shot avec smallie beaver en imitation gobie.",
    "Texas rig 10cm en skipping en zone boisée.",
    "Verticale avec finesse jig en soirée d'hiver."
  ],
  blackbass: [
    "Flipping & pitching avec jig ou texas dans herbiers épais.",
    "Topwater frog ou popper au lever/coucher du soleil.",
    "Crankbait profond sur structures submergées.",
    "Finesse shakey head ou wacky rig quand c'est dur.",
    "Swimbait en linéaire moyen pour imiter les proies.",
    "Spinnerbait slow roll le long des bordures boisées.",
    "Carolina rig sur plaines graveleuses.",
    "Buzzbait en surface dans zones peu profondes.",
    "Tube jig en dandine autour des rochers.",
    "Chatterbait dans herbiers clairsemés.",
    "Punching jig gros poids dans mats d'herbiers.",
    "Topwater walking bait en zone calme au lever du jour.",
    "Crankbait squarebill pour fouiller souches et obstacles.",
    "Swimbait glide bait en pauses longues près des cassures.",
    "Jig football avec trailer écrevisse sur fonds durs.",
    "Wacky rig senko en chute libre autour des docks.",
    "Spinnerbait willow tandem en burn en période active.",
    "Drop shot finesse sur tombants en post-frontal.",
    "Chatterbait avec trailer swimbait en zone venteuse.",
    "Texas rig worm 20cm en linéaire lent sur flats.",
    "Topwater whopper plopper en prospection rapide.",
    "Crankbait lipless rouge en automne sur herbiers mourants.",
    "Jig skipping sous branches surplombantes.",
    "Finesse ned rig sur zones graveleuses propres.",
    "Swimbait paddletail en slow sinking le long des berges.",
    "Buzzbait noir en soirée dans zones sombres.",
    "Tube en free rig autour des rochers en eau claire.",
    "Carolina rig lizard en traîne lente sur flats.",
    "Jerkbait finesse en twitching minimal en eau froide.",
    "Big worm texas en pitching précis dans poches d'herbiers.",
    "Chatterbait jackhammer style en trailer parfait.",
    "Topwater spook en zig-zag rapide.",
    "Crankbait flat side en twitching en eau peu profonde.",
    "Swimbait huddleston en 8-figure lent.",
    "Jig living rubber avec trailer chunk.",
    "Spinnerbait double colorado en slow roll eau trouble.",
    "Texas rig rage craw en flipping.",
    "Drop shot roboworm en straight tail.",
    "Topwater frog booyah pad crasher en herbiers.",
    "Crankbait rapala DT en profondeurs.",
    "Chatterbait z-man en trailer diezel.",
    "Wacky rig yamamoto senko green pumpkin.",
    "Swimbait keitech swing impact fat.",
    "Jig arkie avec hula grub.",
    "Buzzbait booyah counter strike clacker.",
    "Tube strike king coffee tube.",
    "Carolina rig zoom lizard.",
    "Finesse shakey head missile baits.",
    "Topwater river2sea rover.",
    "Crankbait strike king 6XD.",
    "Spinnerbait war eagle spot remover.",
    "Texas rig zoom ol' monster.",
    "Drop shot jackall crosstail.",
    "Chatterbait evergreen jack hammer.",
    "Swimbait deps basirisky.",
    "Jig dirty jigs tour level.",
    "Topwater savage gear 3D suicide duck.",
    "Crankbait lucky craft LC silent.",
    "Tube big bite baits salt tube.",
    "Wacky rig z-man zinkerz.",
    "Spinnerbait booyah pond magic.",
    "Carolina rig strike king rage lizard.",
    "Finesse ned rig z-man finesse TRD.",
    "Topwater illex bonnie.",
    "Crankbait megabass deep-x.",
    "Chatterbait booyah boss pop.",
    "Texas rig berkley powerbait chigger craw.",
    "Swimbait savage gear 4D line thru.",
    "Jig pitchin' with yamamoto flappin hog.",
    "Drop shot reins rockvibe shad.",
    "Buzzbait cavitron.",
    "Tube xzone muscle back.",
    "Wacky rig gary yamamoto fat senko.",
    "Spinnerbait strike king premier pro.",
    "Carolina rig netbait paca craw.",
    "Finesse football jig keitech tungsten.",
    "Topwater deps buzzjet.",
    "Crankbait spro little john DD.",
    "Chatterbait thunder cricket.",
    "Texas rig strike king rage menace.",
    "Swimbait basstrix paddle tail.",
    "Jig no jack flipping jig.",
    "Drop shot osp dolive stick.",
    "Buzzbait double blade d&m.",
    "Tube missile baits bomb shot.",
    "Wacky rig zoom finesse worm.",
    "Spinnerbait revenge double willow.",
    "Carolina rig missle baits baby d bomb."
  ],
  chevesne: [
    "Petits leurres de surface ou insectes pour attaques en surface.",
    "Cuillère ou micro-crank en récupération rapide dans le courant.",
    "Lame vibrante ou petit spinner pour les chasses.",
    "Petit popper ou stickbait en zone calme.",
    "Leurre souple imitant poissonnet en linéaire rapide.",
    "Micro jig sous les branches surplombantes.",
    "Petit crankbait shallow en eau peu profonde.",
    "Insecte en mousse en sèche par beau temps.",
    "Petit jerkbait en twitching rapide.",
    "Cuillère ultra-légère en récupération continue.",
    "Micro lipless en récupération rapide sur les radiers.",
    "Petit poisson nageur sinking en linéaire dans le courant.",
    "Leurre souple 3-5cm en drop shot sous les arbres.",
    "Micro spinner en burn pour déclencher les attaques.",
    "Petit topwater pencil en walking the dog en été.",
    "Cuillère n°0 argentée en récupération variée en rivière.",
    "Insecte dur cicada ou beetle en surface par temps chaud.",
    "Micro crankbait en twitching près des obstacles.",
    "Petit stickbait sinking en jerks courts.",
    "Leurre souple imitant ver en linéaire lent sous surface.",
    "Lame vibrante ultra-légère en récupération continue.",
    "Petit popper en zone calme au lever du jour.",
    "Micro jig tête ronde en dandine sous les berges.",
    "Cuillère ondulante fine argentée en soleil.",
    "Leurre de surface tiny torpedo en zone calme.",
    "Micro crankbait lipless pour chasses en surface.",
    "Micro swimbait en linéaire rapide dans veines de courant.",
    "Insecte flottant en dead drifting sous branches.",
    "Petit jerkbait SP en pauses longues en eau calme.",
    "Cuillère rotating légère en récupération saccadée.",
    "Micro popper en skipping sous les arbres.",
    "Petit crankbait sinking en traîne derrière rocher.",
    "Leurre souple 4cm vairon en linéaire naturel.",
    "Micro blade bait en yo-yo sur radiers.",
    "Insecte dur grasshopper en surface en été.",
    "Petit lipless en vibration forte pour chasses.",
    "Cuillère n°1 or en eau trouble.",
    "Micro jerkbait en twitching ultra-rapide.",
    "Leurre souple imitant sauterelle en surface.",
    "Petit spinnerbait en burn léger en courant.",
    "Micro topwater chugger en popping en zone calme.",
    "Cuillère blue fox vibrax n°0 en eau claire.",
    "Petit poisson nageur jointed en linéaire rapide.",
    "Insecte en foam beetle en dead drift.",
    "Micro crankbait squarebill pour obstacles.",
    "Leurre souple 3cm en drop shot finesse.",
    "Petit stickbait en zig-zag rapide.",
    "Cuillère savage gear rotabell n°0.",
    "Micro lipless jackall TN38 en vibration.",
    "Petit popper illex chubby en matin.",
    "Leurre souple imitant moucheron en surface.",
    "Micro spinner mepps comet n°0.",
    "Petit crankbait yo-zuri pins minnow.",
    "Insecte dur ant ou bee en sèche.",
    "Micro jig en skipping sous branches.",
    "Cuillère panther martin n°1 en couleur naturelle.",
    "Petit topwater rebel crickhopper.",
    "Leurre souple 4cm en weightless sous surface.",
    "Micro blade bait damiki vault.",
    "Petit jerkbait rapala x-rap 4.",
    "Cuillère acme phoebe ultra-légère.",
    "Micro popper hed don tiny chugger.",
    "Leurre souple imitant guêpe en surface.",
    "Micro spinner strike king micro king.",
    "Petit crankbait rebel bumble bug.",
    "Insecte foam cicada en été chaud.",
    "Micro lipless yo-zuri 3DB pencil micro.",
    "Petit stickbait sinking en jerks violents.",
    "Cuillère worden's rooster tail n°1/16.",
    "Micro topwater torpédo baby.",
    "Leurre souple 3cm en linéaire rapide.",
    "Micro jig ronde en dandine en courant.",
    "Petit popper arbogast jitterbug baby.",
    "Cuillère blue fox pixee spoon micro.",
    "Micro crankbait duo realis crank micro.",
    "Insecte dur japanese beetle.",
    "Micro spinner panther martin deluxe.",
    "Petit jerkbait lucky craft bevy pencil micro.",
    "Leurre souple imitant fourmi en surface.",
    "Micro lipless rapala ultra light rippin rap.",
    "Petit topwater hed don baby torpedo.",
    "Cuillère acme kastmaster micro.",
    "Micro popper rebel pop-r tiny.",
    "Leurre souple 2.5cm en drop shot ultra-finesse.",
    "Micro blade bait b fish n h20.",
    "Petit crankbait rebel teeny wee.",
    "Insecte foam hopper en rivière.",
    "Micro spinner yakima rooster tail.",
    "Petit stickbait yo-zuri snap beans.",
    "Cuillère mepps bug.",
    "Micro topwater zara spook puppy.",
    "Leurre souple imitant abeille.",
    "Micro jig en skipping ultra-léger.",
    "Petit popper cotton cordell boy howdy.",
    "Cuillère thomas buoyant micro.",
    "Micro crankbait strike king bitsy minnow.",
    "Insecte dur cricket en été.",
    "Micro spinner worden's lures tiny.",
    "Petit jerkbait rapala countdown micro.",
    "Leurre souple 3cm en weightless surface.",
    "Micro lipless evergreen little max.",
    "Petit topwater illex tiny fry popper.",
    "Cuillère savage gear nail micro."
  ],
  silure: [
    "Gros leurres souples ou vifs au fond avec longues pauses.",
    "Fireball ou clonk avec gros shad en verticale.",
    "Swimbait XXL en linéaire lent près des trous.",
    "Gros jig vibrant posé au fond avec pauses.",
    "Leurre souple 20cm+ en texan dans les obstacles.",
    "Verticale avec un gros shad plombé lourd.",
    "Clonk + vif en été profond.",
    "Gros spinnerbait slow roll près des caches.",
    "Leurre souple articulé en traction lente.",
    "Gros rubber jig 50-100g avec trailer souple au fond.",
    "Fireball avec vif ou calamar en verticale nocturne.",
    "Swimbait jointed 25cm+ en linéaire très lent.",
    "Gros octopus ou twister 20cm en texan lourd.",
    "Clonk seul pour attirer puis présenter un vif.",
    "Leurre souple shad 30cm en line-thru pour monstres.",
    "Verticale avec gros tail en période chaude.",
    "Gros blade bait ou spoon en traction sur fond.",
    "Leurre souple tube XXL en dandine dans trous.",
    "Gros crankbait lipless lourd en récupération lente.",
    "Verticale jigging avec gros silicone vibrant.",
    "Leurre souple calamar ou poulpe en texan dans obstacles.",
    "Swimbait réaliste 30cm en slow sinking près caches.",
    "Gros chatterbait avec trailer énorme en zone trouble.",
    "Fireball avec morceaux de poisson en été nocturne.",
    "Leurre souple worm géant en carolina rig profond.",
    "Verticale avec gros rubber jig par eau froide.",
    "Leurre souple articulé 40cm en traction très lente.",
    "Gros fireball avec seiche ou calamar en verticale.",
    "Swimbait 35cm paddletail en linéaire lent.",
    "Gros texas rig avec trailer squid.",
    "Clonk rythmé + gros shad en présentation.",
    "Leurre souple 25cm en screw lock lourd.",
    "Verticale avec gros twister curly tail.",
    "Gros lipless 100g+ en vibration au fond.",
    "Leurre souple octopus 30cm en texan.",
    "Verticale avec gros tail en période chaude.",
    "Gros blade bait ou spoon en traction sur fond.",
    "Leurre souple tube XXL en dandine dans trous.",
    "Gros crankbait lipless lourd en récupération lente.",
    "Verticale jigging avec gros silicone vibrant.",
    "Leurre souple calamar ou poulpe en texan dans obstacles.",
    "Swimbait réaliste 30cm en slow sinking près caches.",
    "Gros chatterbait avec trailer énorme en zone trouble.",
    "Fireball avec morceaux de poisson en été nocturne.",
    "Leurre souple worm géant en carolina rig profond.",
    "Verticale avec gros rubber jig par eau froide.",
    "Leurre souple articulé 40cm en traction très lente.",
    "Gros fireball avec seiche ou calamar en verticale.",
    "Swimbait 35cm paddletail en linéaire lent.",
    "Gros texas rig avec trailer squid.",
    "Clonk rythmé + gros shad en présentation.",
    "Leurre souple 25cm en screw lock lourd.",
    "Verticale avec gros twister curly tail.",
    "Gros lipless 100g+ en vibration au fond.",
    "Leurre souple octopus 30cm en texan.",
    "Verticale avec gros tail en période chaude.",
    "Gros blade bait ou spoon en traction sur fond.",
    "Leurre souple tube XXL en dandine dans trous.",
    "Gros crankbait lipless lourd en récupération lente.",
    "Verticale jigging avec gros silicone vibrant.",
    "Leurre souple calamar ou poulpe en texan dans obstacles.",
    "Swimbait réaliste 30cm en slow sinking près caches.",
    "Gros chatterbait avec trailer énorme en zone trouble.",
    "Fireball avec morceaux de poisson en été nocturne.",
    "Leurre souple worm géant en carolina rig profond.",
    "Verticale avec gros rubber jig par eau froide.",
    "Leurre souple articulé 40cm en traction très lente.",
    "Gros fireball avec seiche ou calamar en verticale.",
    "Swimbait 35cm paddletail en linéaire lent.",
    "Gros texas rig avec trailer squid.",
    "Clonk rythmé + gros shad en présentation.",
    "Leurre souple 25cm en screw lock lourd.",
    "Verticale avec gros twister curly tail.",
    "Gros lipless 100g+ en vibration au fond.",
    "Leurre souple octopus 30cm en texan.",
    "Verticale avec gros tail en période chaude.",
    "Gros blade bait ou spoon en traction sur fond.",
    "Leurre souple tube XXL en dandine dans trous.",
    "Gros crankbait lipless lourd en récupération lente.",
    "Verticale jigging avec gros silicone vibrant.",
    "Leurre souple calamar ou poulpe en texan dans obstacles.",
    "Swimbait réaliste 30cm en slow sinking près caches.",
    "Gros chatterbait avec trailer énorme en zone trouble.",
    "Fireball avec morceaux de poisson en été nocturne.",
    "Leurre souple worm géant en carolina rig profond.",
    "Verticale avec gros rubber jig par eau froide.",
    "Leurre souple articulé 40cm en traction très lente.",
    "Gros fireball avec seiche ou calamar en verticale.",
    "Swimbait 35cm paddletail en linéaire lent.",
    "Gros texas rig avec trailer squid.",
    "Clonk rythmé + gros shad en présentation.",
    "Leurre souple 25cm en screw lock lourd.",
    "Verticale avec gros twister curly tail.",
    "Gros lipless 100g+ en vibration au fond.",
    "Leurre souple octopus 30cm en texan.",
    "Verticale avec gros tail en période chaude.",
    "Gros blade bait ou spoon en traction sur fond.",
    "Leurre souple tube XXL en dandine dans trous.",
    "Gros crankbait lipless lourd en récupération lente.",
    "Verticale jigging avec gros silicone vibrant.",
    "Leurre souple calamar ou poulpe en texan dans obstacles.",
    "Swimbait réaliste 30cm en slow sinking près caches.",
    "Gros chatterbait avec trailer énorme en zone trouble.",
    "Fireball avec morceaux de poisson en été nocturne.",
    "Leurre souple worm géant en carolina rig profond.",
    "Verticale avec gros rubber jig par eau froide."
  ],
  truite: [
    "Cuillère ondulante ou rotating en rivière avec courant.",
    "Leurre souple imitant vairon en récupération naturelle.",
    "Micro-jig ou spinner en zone calme.",
    "Petit crankbait en eau claire.",
    "Nymphe ou streamer en pêches fines.",
    "Cuillère légère en récupération variée.",
    "Petit poisson nageur en linéaire lent.",
    "Micro crankbait shallow en ruisseau.",
    "Leurre souple finesse en drop shot.",
    "Rotating ultra-légère en eau vive.",
    "Cuillère n°0 argentée en récupération saccadée dans pools.",
    "Petit jerkbait SP en twitching en eau calme.",
    "Leurre souple 5cm vairon en linéaire naturel.",
    "Micro lipless ou lame vibrante en récupération rapide.",
    "Spinner Mepps Aglia n°1 naturel.",
    "Petit crankbait sinking en traîne derrière rocher.",
    "Cuillère ondulante fine argentée en soleil.",
    "Leurre souple insecte en surface par éclosions.",
    "Micro jig tête ronde en dandine en poches profondes.",
    "Petit stickbait sinking en jerks courts.",
    "Rotating Black Fury n°1 en eau teintée.",
    "Leurre souple finesse worm en drop shot sous berges.",
    "Cuillère lourde en récupération lente en trous profonds.",
    "Petit popper ou insecte dur en zone calme.",
    "Crankbait ultra-light en linéaire en ruisseau.",
    "Micro spoon en récupération continue en courant fort.",
    "Leurre souple vairon monté en texan léger.",
    "Spinner Comet naturel en eau claire.",
    "Petit jigging spoon en verticale en lac.",
    "Cuillère ondulante cuivrée par temps couvert.",
    "Micro crankbait shallow en prospection rapide.",
    "Leurre souple 4cm en weightless sous surface.",
    "Spinner Panther Martin n°2 argent.",
    "Petit poisson nageur jointed en linéaire lent.",
    "Cuillère Blue Fox Vibrax n°1 en couleur firetiger.",
    "Micro jerkbait en twitching rapide en eau claire.",
    "Leurre souple insecte dur en surface été.",
    "Drop shot finesse avec micro worm.",
    "Cuillère Savage Gear Rotabell n°1.",
    "Petit crankbait Yo-Zuri Pins Minnow.",
    "Rotating Mepps XD en eau profonde.",
    "Leurre souple vairon 6cm en linéaire naturel.",
    "Micro blade bait en yo-yo en poches.",
    "Spinner Worden's Rooster Tail n°1/8.",
    "Petit topwater insecte en zone calme.",
    "Cuillère Acme Phoebe micro.",
    "Micro crankbait Rapala Countdown.",
    "Leurre souple 3cm en drop shot ultra-finesse.",
    "Spinner Blue Fox Pixee spoon.",
    "Petit jerkbait Lucky Craft Bevy.",
    "Cuillère Thomas Buoyant micro.",
    "Micro lipless Jackall TN38.",
    "Leurre souple imitant nymphe en subsurface.",
    "Spinner Panther Martin Deluxe.",
    "Petit crankbait Duo Realis Crank.",
    "Cuillère Mepps Bug en imitation insecte.",
    "Micro jig en skipping en ruisseau.",
    "Leurre souple 4cm vairon en weighted hook.",
    "Spinner Yakima Bait Rooster Tail.",
    "Petit popper Rebel Crickhopper.",
    "Cuillère Worden's Tiny.",
    "Micro crankbait Strike King Bitsy.",
    "Leurre souple insecte foam hopper.",
    "Spinner Savage Gear Nail.",
    "Petit jerkbait Rapala X-Rap micro.",
    "Cuillère Acme Kastmaster micro.",
    "Micro topwater Heddon Tiny Torpedo.",
    "Leurre souple 3.5cm en linéaire lent.",
    "Spinner Mepps Timber Doodle.",
    "Petit crankbait Rebel Teeny Wee.",
    "Cuillère Blue Fox Vibrax Shallow.",
    "Micro lipless Yo-Zuri 3DB.",
    "Leurre souple vairon 5cm en drop shot.",
    "Spinner Panther Martin Holographic.",
    "Petit poisson nageur Yo-Zuri Snap Beans.",
    "Cuillère Mepps Comet Mino.",
    "Micro jerkbait Duo Spearhead.",
    "Leurre souple insecte cicada.",
    "Spinner Blue Fox Minnow Spin.",
    "Petit crankbait Illex Tiny Fry.",
    "Cuillère Savage Gear Sticklebait.",
    "Micro topwater Illex Chubby Popper.",
    "Leurre souple 4cm en no sinker.",
    "Spinner Mepps Flying C.",
    "Petit jerkbait Megabass Baby Griffon.",
    "Cuillère Thomas Speedee.",
    "Micro crankbait Jackall Chubby.",
    "Leurre souple vairon 6cm en texan light.",
    "Spinner Worden's Lil' Rooster.",
    "Petit popper Arbogast Jitterbug Baby.",
    "Cuillère Acme Little Cleo micro.",
    "Micro lipless Evergreen Little Max.",
    "Leurre souple insecte beetle.",
    "Spinner Blue Fox Vibrax Bullet.",
    "Petit crankbait Rapala Ultra Light Minnow.",
    "Cuillère Mepps Aglia Long.",
    "Micro topwater Rebel Bumble Bug.",
    "Leurre souple 3cm en subsurface.",
    "Spinner Panther Martin Spinnerbait micro.",
    "Petit jerkbait Yo-Zuri Crystal Minnow micro.",
    "Cuillère Savage Gear Seeker.",
    "Micro crankbait Duo Realis Spinbait."
  ]
};

  // Normalisation robuste
  let normalized = species.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, '');

  const speciesMap = {
    brochet: 'brochet',
    perche: 'perche',
    sandre: 'sandre',
    blackbass: 'blackbass',
    bass: 'blackbass',
    chevesne: 'chevesne',
    aspe: 'aspe',
    silure: 'silure',
    truite: 'truite'
  };

  let matched = null;
  for (const key in speciesMap) {
    if (normalized.includes(key)) {
      matched = speciesMap[key];
      break;
    }
  }

  if (matched && randomParEspece[matched]) {
    const conseils = randomParEspece[matched];
    let random1 = conseils[Math.floor(Math.random() * conseils.length)];
    let random2 = conseils[Math.floor(Math.random() * conseils.length)];
    while (random2 === random1 && conseils.length > 1) {
      random2 = conseils[Math.floor(Math.random() * conseils.length)];
    }
    list.push(random1);
    list.push(random2);
  } else {
    // Conseils génériques si espèce inconnue
    const generiques = [
      "Prospection variée avec un leurre souple naturel en linéaire.",
      "Essaie un crankbait moyen pour couvrir de l'eau rapidement.",
      "Pêche en réaction avec une lame vibrante ou un spinner.",
      "Animation lente au fond avec un jig ou un texas rig.",
      "Varie les profondeurs jusqu'à trouver les poissons actifs."
    ];
    let random1 = generiques[Math.floor(Math.random() * generiques.length)];
    let random2 = generiques[Math.floor(Math.random() * generiques.length)];
    while (random2 === random1) random2 = generiques[Math.floor(Math.random() * generiques.length)];
    list.push(random1);
    list.push(random2);
  }

  list.push("🎣Essaie un leurre souple de 7cm c'est une valeur sure !");
  list.push("💶 Va en bas pour trouver les leurres les moins cher ! ")
  list.push("💪Enregistre ta session pour faire progresser l'IA !");

  // Profondeur

  if (temperature !== null) {
    if (species.includes('perche')) {
      if (temperature < 10) depthAdvice.push("Profondeur 3-5m, jigs verticaux et dropshot");
      else if (temperature < 18) depthAdvice.push("Profondeur 1-3m, micro-leurres");
      else depthAdvice.push("Proche de la surface 0-1m, leurres légers");
    }
    if (species.includes('brochet')) {
      if (temperature < 8) depthAdvice.push("Profondeur 4-6m, leurres souples volumineux");
      else if (temperature < 15) depthAdvice.push("Profondeur 2-4m, jerkbait et spinnerbait");
      else depthAdvice.push("Bordure et surface 0-2m, frog et cuillère");
    }
  }

  return { lures: list, depthAdvice };
}
// === GUIDE UTILISATION LEURRES ===
const lureGuides = {
  popper: [
    "Animation : Récupération saccadée avec coups de canne courts et secs (pop-pop-pop).",
    "Coup de canne : Oui, pour créer des éclaboussures et attirer l'attention.",
    "Vitesse : Lente à moyenne, avec pauses entre les pops.",
    "Pause : Oui, longues pauses (5-10s) après chaque série de pops pour laisser le poisson attaquer.",
    "Laisser couler : Non, garder en surface (topwater).",
    "Profondeur : Surface (0 m), idéal pour eaux calmes ou herbiers.",
    "Conseils extras : Parfait pour bass, brochet ou bar en été. Utilise un leader fluoro pour discrétion."
  ],
  propbait: [
    "Animation : Récupération linéaire constante ou saccadée pour faire tourner l'hélice.",
    "Coup de canne : Oui, coups légers pour éclaboussures et bruit.",
    "Vitesse : Moyenne à rapide, pour maximiser le bruit de l'hélice.",
    "Pause : Oui, courtes pauses (2-5s) pour varier.",
    "Laisser couler : Non, rester en surface.",
    "Profondeur : Surface (0 m), pour zones ouvertes ou bordures.",
    "Conseils extras : Idéal pour brochet ou bass par temps couvert. Choisis modèles avec hélice arrière pour plus de bruit."
  ],
  stickbait: [
    "Animation : Walking-the-dog (zigzag) avec coups de canne latéraux rythmés.",
    "Coup de canne : Oui, coups courts et alternés pour le zigzag.",
    "Vitesse : Moyenne, pour un mouvement fluide.",
    "Pause : Oui, pauses longues (5-10s) après zigzag pour déclencher l'attaque.",
    "Laisser couler : Non, garder en surface.",
    "Profondeur : Surface (0 m), pour eaux calmes ou chasses visibles.",
    "Conseils extras : Super pour bar, snook ou tarpon en mer. Utilise un trebles de qualité pour ferrage."
  ],
  slider: [
    "Animation : Récupération linéaire lente avec twitches occasionnels.",
    "Coup de canne : Oui, légers twitches pour un mouvement erratique.",
    "Vitesse : Lente à moyenne.",
    "Pause : Oui, pauses courtes (2-5s) pour laisser planer.",
    "Laisser couler : Oui, légèrement (slow sinking).",
    "Profondeur : Surface à mi-eau (0-2 m).",
    "Conseils extras : Bon pour bass ou brochet en eau claire. Variante de stickbait pour eaux agitées."
  ],
  frog: [
    "Animation : Récupération saccadée par à-coups (hop-hop) dans herbiers.",
    "Coup de canne : Oui, coups secs pour faire sauter comme une grenouille.",
    "Vitesse : Lente, pour imitation naturelle.",
    "Pause : Oui, longues pauses (5-15s) dans les trouées.",
    "Laisser couler : Non, garder en surface (weedless).",
    "Profondeur : Surface (0 m), sur herbiers denses.",
    "Conseils extras : Idéal pour bass ou snakehead en végétation. Ferre fort après 2-3s pour avaler."
  ],
  buzzbait: [
    "Animation : Récupération linéaire constante pour faire tourner l'hélice en surface.",
    "Coup de canne : Non, récupération régulière.",
    "Vitesse : Moyenne à rapide, pour bruit et éclaboussures.",
    "Pause : Non, garder en mouvement constant.",
    "Laisser couler : Non, rester en surface.",
    "Profondeur : Surface (0 m), pour bordures ou herbiers.",
    "Conseils extras : Bon pour bass par temps nuageux. Ajoute trailer pour plus d'attrait."
  ],
  jerk: [
    "Animation : Twitching saccadé avec pauses (jerk-jerk-pause).",
    "Coup de canne : Oui, coups secs et courts.",
    "Vitesse : Variable, rapide pendant jerks.",
    "Pause : Oui, longues pauses (5-10s) pour déclencher.",
    "Laisser couler : Oui, suspending ou sinking.",
    "Profondeur : Mi-eau à fond (1-5 m).",
    "Conseils extras : Pour brochet, sandre ou bar. Utilise suspending en eau froide."
  ],
  jerkminnow: [
    "Animation : Twitching saccadé avec pauses (minnow style).",
    "Coup de canne : Oui, coups latéraux courts.",
    "Vitesse : Moyenne pendant twitches.",
    "Pause : Oui, pauses longues (5-15s).",
    "Laisser couler : Oui, suspending.",
    "Profondeur : Surface à mi-eau (0-3 m).",
    "Conseils extras : Idéal pour aspe, chevesne ou truite. Parfait en rivière."
  ],
  crankbait: [
    "Animation : Récupération linéaire constante ou stop-and-go.",
    "Coup de canne : Non, sauf pour stop-and-go.",
    "Vitesse : Moyenne à rapide, pour vibration.",
    "Pause : Oui, courtes pour lipless, longues pour diving.",
    "Laisser couler : Non, garder en nage.",
    "Profondeur : Selon modèle (shallow 0-2 m, medium 2-4 m, deep 4+ m).",
    "Conseils extras : Pour bass, brochet, sandre. Choisis lipless pour herbiers."
  ],
  lipless: [
    "Animation : Récupération linéaire avec vibrations, stop-and-go.",
    "Coup de canne : Oui, pour yo-yo ou grattage.",
    "Vitesse : Moyenne à rapide.",
    "Pause : Oui, laisser couler pendant pauses.",
    "Laisser couler : Oui, sinking rapide.",
    "Profondeur : Mi-eau à fond (2-6 m).",
    "Conseils extras : Pour sandre, perche, brochet en hiver. Vibrant pour eau froide."
  ],
  swimbait: [
    "Animation : Récupération linéaire constante ou saccadée.",
    "Coup de canne : Oui, légers twitches pour mouvement nageoire.",
    "Vitesse : Lente à moyenne.",
    "Pause : Oui, courtes pauses pour planer.",
    "Laisser couler : Oui, selon modèle (slow sinking).",
    "Profondeur : Mi-eau à fond (1-6 m).",
    "Conseils extras : Pour gros brochet, silure ou bass. Choisis jointed pour plus de nage."
  ],
  glidebait: [
    "Animation : Glissade latérale avec coups de canne longs.",
    "Coup de canne : Oui, coups lents et larges pour glide.",
    "Vitesse : Lente.",
    "Pause : Oui, longues pauses (5-10s).",
    "Laisser couler : Oui, slow sinking.",
    "Profondeur : Mi-eau (1-4 m).",
    "Conseils extras : Pour gros bass ou brochet. Parfait en eau claire."
  ],
  cuillertournante: [
    "Animation : Récupération linéaire constante pour tourner.",
    "Coup de canne : Non, sauf pour stop-and-go.",
    "Vitesse : Moyenne.",
    "Pause : Oui, courtes pour couler.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Surface à mi-eau (0-2 m).",
    "Conseils extras : Pour truite, perche, chevesne. Argentée en soleil."
  ],
  ondulante: [
    "Animation : Récupération linéaire avec ondulations, ou yo-yo.",
    "Coup de canne : Oui, pour yo-yo.",
    "Vitesse : Lente à moyenne.",
    "Pause : Oui, laisser planer pendant pauses.",
    "Laisser couler : Oui, sinking rapide.",
    "Profondeur : Mi-eau à fond (2-6 m).",
    "Conseils extras : Pour sandre, brochet, silure. Parfait en profondeur."
  ],
  lamevibrante: [
    "Animation : Récupération linéaire avec vibrations, stop-and-go.",
    "Coup de canne : Oui, pour yo-yo ou grattage.",
    "Vitesse : Moyenne à rapide.",
    "Pause : Oui, laisser couler pendant pauses.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Mi-eau à fond (1-5 m).",
    "Conseils extras : Pour perche, chevesne, aspe. Vibrant pour eau trouble."
  ],
  jig: [
    "Animation : Grattage fond avec sauts (hop-hop-pause).",
    "Coup de canne : Oui, coups secs pour sauter.",
    "Vitesse : Lente.",
    "Pause : Oui, longues pauses au fond.",
    "Laisser couler : Oui, rapide au fond.",
    "Profondeur : Fond (2-10 m).",
    "Conseils extras : Pour sandre, black-bass, silure. Ajoute trailer pour nage."
  ],
  spinnerbait: [
    "Animation : Récupération linéaire constante ou slow-roll.",
    "Coup de canne : Non, sauf pour stop-and-go.",
    "Vitesse : Moyenne.",
    "Pause : Oui, courtes pour couler.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Mi-eau (1-4 m).",
    "Conseils extras : Pour black-bass, brochet. Bon en herbiers."
  ],
  chatterbait: [
    "Animation : Récupération linéaire avec vibrations.",
    "Coup de canne : Oui, twitches pour plus de vibration.",
    "Vitesse : Moyenne à rapide.",
    "Pause : Oui, courtes pauses.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Mi-eau (1-4 m).",
    "Conseils extras : Pour black-bass, brochet. Ajoute trailer shad."
  ],
  shad: [
    "Animation : Récupération linéaire ou saccadée avec pauses.",
    "Coup de canne : Oui, twitches pour nage tail.",
    "Vitesse : Lente à moyenne.",
    "Pause : Oui, longues pour descente.",
    "Laisser couler : Oui, avec tête plombée.",
    "Profondeur : Mi-eau à fond (1-6 m).",
    "Conseils extras : Pour sandre, brochet, perche. Tête 10-30g selon profondeur."
  ],
  grub: [
    "Animation : Récupération linéaire avec tail curl.",
    "Coup de canne : Oui, légers twitches.",
    "Vitesse : Moyenne.",
    "Pause : Oui, courtes.",
    "Laisser couler : Oui, avec jig head.",
    "Profondeur : Mi-eau (1-4 m).",
    "Conseils extras : Pour perche, sandre. Bon en finesse."
  ],
  finesse: [
    "Animation : Dandine lente ou grattage fond.",
    "Coup de canne : Oui, petits twitches.",
    "Vitesse : Ultra lente.",
    "Pause : Oui, longues pauses.",
    "Laisser couler : Oui, slow sinking.",
    "Profondeur : Fond (2-6 m).",
    "Conseils extras : Pour black-bass, perche en eau froide. Ned rig ou drop shot."
  ],
  worm: [
    "Animation : Grattage fond ou dandine.",
    "Coup de canne : Oui, coups lents pour wiggle.",
    "Vitesse : Lente.",
    "Pause : Oui, longues au fond.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Fond (1-5 m).",
    "Conseils extras : Pour black-bass, truite. Texas rig ou wacky."
  ],
  dropshot: [
    "Animation : Dandine verticale ou grattage léger.",
    "Coup de canne : Oui, petits shakes.",
    "Vitesse : Ultra lente.",
    "Pause : Oui, longues pauses.",
    "Laisser couler : Oui, au fond.",
    "Profondeur : Fond (2-8 m).",
    "Conseils extras : Pour perche, sandre, finesse en eau froide."
  ],
  nedrig: [
    "Animation : Grattage lent au fond avec shakes.",
    "Coup de canne : Oui, légers twitches.",
    "Vitesse : Ultra lente.",
    "Pause : Oui, longues au fond.",
    "Laisser couler : Oui, slow sinking.",
    "Profondeur : Fond (1-5 m).",
    "Conseils extras : Pour black-bass, perche. Très efficace en eau claire."
  ],
  // Additions utiles
  buzztoad: [
    "Animation : Récupération linéaire constante pour bruit.",
    "Coup de canne : Non.",
    "Vitesse : Moyenne à rapide.",
    "Pause : Non.",
    "Laisser couler : Non, surface.",
    "Profondeur : Surface (0 m).",
    "Conseils extras : Pour bass en herbiers. Variante buzzbait avec toad."
  ],
  rubberjig: [
    "Animation : Grattage fond avec sauts.",
    "Coup de canne : Oui, coups secs.",
    "Vitesse : Lente.",
    "Pause : Oui, longues.",
    "Laisser couler : Oui, rapide.",
    "Profondeur : Fond (2-8 m).",
    "Conseils extras : Pour black-bass, silure. Ajoute trailer craw."
  ],
  texasrig: [
    "Animation : Grattage fond ou punching herbiers.",
    "Coup de canne : Oui, coups lents.",
    "Vitesse : Lente.",
    "Pause : Oui, longues.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Fond (1-5 m).",
    "Conseils extras : Pour bass en végétation. Bullet weight pour weedless."
  ],
  carolinarig: [
    "Animation : Traîné lent au fond.",
    "Coup de canne : Oui, légers twitches.",
    "Vitesse : Lente.",
    "Pause : Oui, longues.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Fond (2-6 m).",
    "Conseils extras : Pour bass, sandre. Long leader pour finesse."
  ],
  wackyrig: [
    "Animation : Dandine ou grattage avec wiggle.",
    "Coup de canne : Oui, shakes légers.",
    "Vitesse : Ultra lente.",
    "Pause : Oui, longues.",
    "Laisser couler : Oui, slow sinking.",
    "Profondeur : Fond (1-4 m).",
    "Conseils extras : Pour black-bass. Hook au milieu du worm."
  ],
  spoon: [
    "Animation : Récupération linéaire ou yo-yo.",
    "Coup de canne : Oui, pour yo-yo.",
    "Vitesse : Moyenne.",
    "Pause : Oui, laisser planer.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Mi-eau à fond (2-8 m).",
    "Conseils extras : Pour silure, sandre. Bon en verticale."
  ],
  tailspin: [
    "Animation : Récupération linéaire avec tail spin.",
    "Coup de canne : Oui, twitches pour vibration.",
    "Vitesse : Moyenne.",
    "Pause : Oui, courtes.",
    "Laisser couler : Oui, sinking.",
    "Profondeur : Mi-eau (1-4 m).",
    "Conseils extras : Pour perche, chevesne. Petite version pour finesse."
  ]
};

// Fonction pour récupérer les conseils (normalise le nom)
function getLureGuide(lureName) {
  const normalized = lureName.toLowerCase().trim().replace(/ /g, '');
  const guide = lureGuides[normalized] || lureGuides['finesse']; // fallback si inconnu

  if (guide) {
    return guide.map((tip, index) => `${index + 1}. ${tip}`);
  } else {
    return [
      "Leurre inconnu – essaie un leurre souple en récupération lente avec pauses.",
      "Conseils généraux : Coup de canne léger, vitesse moyenne, pause 5s, laisser couler non, profondeur mi-eau."
    ];
  }
}

// Exemple d'utilisation
console.log(getLureGuide('popper'));




// === ROUTES ===



app.post('/api/suggest', (req, res) => {
  let { targetSpecies: species = "", structure, conditions, spotType, temperature } = req.body;
  const result = suggestLures(species, structure, conditions, spotType, temperature);
  res.json(result);
});

app.post('/api/advice', (req, res) => {
  try {
    // Déstructure TOUT D'ABORD
    let {
      targetSpecies: species = "",
      structure = "",
      conditions = "",
      spotType = "",
      temperature,
      failedLures = []
    } = req.body || {};  // ← sécurité si req.body est undefined

    // Normalisation APRES déstructuration
    species    = (species    || "").toLowerCase().trim();
    structure  = (structure  || "").toLowerCase().trim();
    conditions = (conditions || "").toLowerCase().trim();
    spotType   = (spotType   || "").toLowerCase().trim();
    failedLures = Array.isArray(failedLures) ? failedLures.map(l => l.trim().toLowerCase()) : [];

    // Maintenant tu peux utiliser species en sécurité
    console.log('[DEBUG] Espèce reçue et normalisée :', species);


    if (!structure || !conditions) {
      return res.status(400).json({ error: 'Champs requis manquants : structure et conditions.' });
    }

    const result = suggestLures(species, structure, conditions, spotType, temperature);

    let filteredLures = result.lures.filter(lure => {
      const lureName = lure.split(' — ')[0].trim().toLowerCase();
      return !failedLures.includes(lureName);
    });

    if (filteredLures.length === 0) {
      filteredLures = [
        "Aucun leurre précédent n'a fonctionné dans ces conditions...",
        "Essaie un leurre totalement différent (taille, couleur, vibration)",
        "Change radicalement d'animation ou de profondeur",
        "Enregistre une nouvelle session pour faire progresser l'IA !"
      ];
    }

    res.json({
      adviceText: "Voici mes meilleurs conseils pour ces conditions :",
      lures: filteredLures,
      depthAdvice: result.depthAdvice || []
    });
  } catch (err) {
    console.error("Erreur dans /api/advice :", err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
const fetch = require('node-fetch'); // Assure-toi d'avoir installé node-fetch si pas déjà fait : npm install node-fetch

app.post('/api/lure-guide', (req, res) => {
  const { lure } = req.body;
  const guide = getLureGuide(lure.toLowerCase().trim());
  res.json(guide);
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



