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
    list.push('Cuillère Argentée à points rouges N°2, ce leurre est un classique, à ramener à vitesse moyenne');
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuageux'))
      list.push('Dropshot — Animation lente proche des structures');
    if (saison === "hiver" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Ned Rig — Animation lente sur le fond dans les contre-courants');
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('nuageux'))
      list.push('Cuillère N°2 — Récupération lente juste sous la surface');
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Leurre souple 5cm Brun — Récupération lente juste sous la surface');
    if (saison === "printemps" && spotType === "étang" && conditions.includes('clair'))
      list.push('Cuillère N°2, coloris Or — Pêche en linéaire lent');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil') && structure.includes('branch'))
      list.push('Leurre souple de 5cm— Dandine dans les branches ');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil') && structure.includes('bois'))
      list.push('Leurre souple de 5cm— Dandine dans les bois morts ');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil') && structure.includes('arbre'))
      list.push('Leurre souple de 5cm— Dandine dans les bois morts ');
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Cuillère N°2 argentée puis Leurre souple de 5cm puis crank puis micro-leurre — Animation juste sous la surface');
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuageux'))
      list.push('Leurre souple de 7 à 8cm coloris gardon — Récupération rapide avec pauses');
    if (saison === "été" && spotType === "étang" && conditions.includes('nuageux'))
      list.push('Leurre souple de 4 à 6cm — Récupération rapide avec pauses');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Leurre souple de 4 à 6cm en dropshot — Récupération lente et dandine proche des obstacles');
    if (saison === "automne" && spotType === "étang" && conditions.includes('nuageux') && structure.includes('branch'))
      list.push('Leurre souple pailleté de 5cm en Ned Rig— Ramène très lentement sur le fond');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Leurre souple de 4 à 6cm ou Crankbait — Récupération rapide avec des pauses proche des obstacles');
    if (saison === "automne" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Leurre souple de 7cm en dropshot — Tente les grosses perches dans les obstacles');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('pluie'))
      list.push('Leurre souple de 7cm en Ned Rig ou Lame Vibrante — Tente les grosses perches sur le fond');
    if (saison === "automne" && spotType === "étang" && conditions.includes('pluie'))
      list.push('Leurre souple de 7cm en Ned Rig — Tente les grosses perches dans les obstacles');
  }
  if (species.includes('brochet')) {
    list.push('Grub de 12cm tête rouge corps blanc— Récupération à vitesse moyenne avec des pauses proche des obstacles');
    if (saison === "été" && spotType === "étang" && conditions.includes('nuageux'))
      list.push('Leurres souples de 10cm puis Cuiller N°4 puis Spinner Bait — Power Fishing proche des obstacles');
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuageux'))
      list.push('Leurres souples de 10cm puis Cuiller N°4 puis Spinner Bait — Power Fishing proche des obstacles');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Leurres souples de 6cm — Quand il y a du soleil les brochets visent les petites proies');
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Propbait — Récupération rapide avec des pauses proche des obstacles');
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('nuageux'))
      list.push('Jerk-Minnow de 12 à 15cm — Twitchs courts avec des pauses en surface, envoie des coups de jerk comme si la cnne était un fouet');
    if (saison === "printemps" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Cuillère N°4 — Récupération lente en surface');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil') && structure.includes('nénuphar'))
      list.push('Frog — Récupération par a coups avec pauses dans les trouées, attention faut ferrer comme si tu voulait envoyer le poisson sur la lune !');
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil') && structure.includes('nénuphar'))
      list.push('Frog — Récupération par a coups avec pauses dans les trouées , attention faut ferrer super fort');
    if (saison === "hiver" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Shad de 16cm — Récupération lente');
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuageux'))
      list.push('Lipless ou spintail ou lame vibrante — Récupération lente ou dandine en verticale');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('nuageux'))
      list.push('Swimbait de 15cm — Récupération lente en surface');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('pluie'))
      list.push('Shad de 20CM — Récupération lente en surface, puis descends dans la couche d\'eau');
    if (saison === "automne" && spotType === "étang" && conditions.includes('vent'))
      list.push('Crankbait de 8cm — Récupération lente en surface, puis descends dans la couche d\'eau au fur et à mesure du temps');
  }
  if (species.includes('bass')) {
    list.push('Utiliser des leurres imitatifs des plus petites proies comme les vers, les insectes ou encore les écrevisses— Récupération lente avec des pauses proche ou dans des obstacles');
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuageux'))
      list.push('Ned Rig ou ver manié — Récupération lente ou dandine en verticale');
    if (saison === "printemps" && spotType === "étang" && conditions.includes('vent'))
      list.push('Spinner-bait — Récupération lente sous la surface');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Worm en wacky ou Tube texan ou Frog ou finesse Rb — Récupération par à-coups ou en dandine');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil') && structure.includes('herbiers'))
      list.push('Worm marron — Dandine dans les branches et les herbiers ');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil') && structure.includes('bois'))
      list.push('Worm marron — Dandine dans les branches et les herbiers ');
    if (saison === "été" && spotType === "canal" && conditions.includes('soleil') && structure.includes('bois'))
      list.push('Worm marron — Dandine dans les branches et les herbiers, envoie un vrai ferrage sans trop d\'emballer ');
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuageux'))
      list.push('Écrevisses en punching — Dans les herbiers');
  }
  if (species.includes('chevesne')) {
    list.push('Lame Vibrante — Récupération rapide avec des pauses proche des obstacles');
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Cuillère ou micro-leurre — Récupération rapide pour déclencher des attaques de réaction');
    if (saison === "été" && spotType === "rivière")
      list.push('Leurres Insectes — Récupération par à coups pour déclencher des attaques de réaction');
  }
  if (species.includes('sandre')) {
    list.push('Leurre souple jaune — Toujours ramener au ras du fond enregistre ta session je te donnerais de meilleurs conseils !');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('pluie') && structure.includes('pont'))
      list.push('Leurre souple de 7cm blanc — Gratte le fond et fais de longues pauses ');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('nuageux') && structure.includes('pont'))
      list.push('Leurre souple de 7cm blanc — Gratte le fond et fais de longues pauses ');
  }
  if (species.includes('aspe')) {
    list.push('Essaie un jerkminnow de 7cm — Ramène le très vite, puis un jig de 10G à utiliser près du fond, je ne suis pas spécialiste de ce poisson alors enregistre ta session pour me faire progresser !');
  }
  if (species.includes('silure')) {
    list.push('Essaie une ondulante de 50g — Ramène la proche du fond avec de longues pauses, je ne suis pas spécialiste de ce poisson alors enregistre ta session pour me faire progresser !');
  }
  if (species.includes('truite')) {
    list.push('Essaie une ondulante de 5g — Lance dans les courants et ramène sans pause pour déclencher des attaques de réaction, je ne suis pas spécialiste de ce poisson alors enregistre ta session pour me faire progresser !');
  }
  if (species.includes('carpe')) {
    list.push('Je suis désolée — je ne donne des conseils que pour la pêche au leurre , mais peut-être que un jour je pourrais donner des conseils pour touts les types de pêche ');
  }

  // === 2 CONSEILS RANDOM PAR ESPÈCE (SANS FALLBACK BROCHET) ===
const randomParEspece = {
  brochet: [
    "Prospection rapide en surface avec un gros popper ou stickbait quand l'eau est calme.",
    "Power fishing agressif autour des structures avec gros swimbaits ou jerkbaits XXL.",
    "Twitching violent avec un glider ou un jerkbait long dans les bordures herbeuses.",
    "Réaction pure avec spinnerbait ou chatterbait dans les zones venteuses.",
    "Pêche finesse en période difficile : weightless ou drop shot avec shad 10cm.",
    "Longs lancers parallèles aux bordures avec un swimbait articulé naturel.",
    "Pêche en punching dans les herbiers épais avec un gros texas rig.",
    "Topwater à l'aube ou au crépuscule avec un buzzbait bruyant.",
    "Linéaire rapide avec un lipless dans les plateaux herbeux.",
    "Jerkbait suspendu en pauses longues par eau froide.",
    "Gros chatterbait avec trailer souple dans les nénuphars clairsemés.",
    "Swimbait paddletail 15-18cm en linéaire lent au-dessus des herbiers.",
    "Big bait en gliding (type Spro BBZ ou Deps Slide Swimmer) près des obstacles.",
    "Crankbait lipless vibrant en récupération rapide sur les hauts-fonds.",
    "Jerkbait long et fin en twitching saccadé en hiver profond.",
    "Gros spinnerbait tandem willow en burn près des cassures.",
    "Shad 20cm en texan lourd gratté sur les fonds rocheux.",
    "Topwater crawler ou whopper plopper en zone calme au coucher du soleil.",
    "Pêche en traction avec un rubber jig 30-50g dans les bois morts.",
    "Gros frog en skipping dans les poches d'herbiers inaccessibles.",
    "Swimbait jointed en slow sinking pour les bordures abruptes.",
    "Blade bait ou tailspin en verticale sur les tombants en hiver.",
    "Gros crankbait squarebill pour débusquer les poissons cachés dans les souches.",
    "Leurre souple 25cm+ monté en line-thru pour les gros sujets post-frontal.",
    "Buzzbait slow roll le long des berges ombragées en soirée.",
    "Jerkbait articulé en pauses très longues par eau très froide.",
    "Gros tube ou creature bait en flipping dans les mats d'herbiers.",
    "Chatterbait heavy avec gros trailer en zone venteuse et trouble.",
    "Swimbait réaliste en récupération régulière sur les plateaux.",
    "Gros lipless rouge/orange en automne pour imiter les écrevisses.",
    "Jerkbait suspending en twitching minimal en début de saison froide.",
    "Gros swimbait glide bait en pauses longues près des cassures profondes.",
    "Spinnerbait colorado/indiana en slow roll par eau trouble.",
    "Texas rig 15cm avec poids lourd dans les obstacles submergés.",
    "Topwater frog hollow body en walking dans les trous d'herbiers.",
    "Lipless crankbait en yo-yo sur les fonds herbeux en pré-spawn.",
    "Gros jerkbait soft en linéaire lent en été profond.",
    "Rubber jig avec trailer chunk en flipping autour des arbres noyés.",
    "Swimbait hard 20cm en burn en surface en période active.",
    "Chatterbait vibrant avec paddle tail en zone venteuse.",
    "Jerkbait longbill en counting down sur les tombants.",
    "Gros buzzbait double blade en soirée dans les zones peu profondes.",
    "Leurre souple shad 18cm en weighted hook près des structures.",
    "Topwater prop bait en zone calme pour les attaques explosives.",
    "Crankbait deep diver en trolling lent sur les fosses.",
    "Gros spinnerbait en trailer twin tail par eau colorée.",
    "Punching jig avec creature bait dans les herbiers denses.",
    "Swimbait line-thru en linéaire moyen en automne.",
    "Jerkbait finesse en pauses longues en hiver clair.",
    "Gros frog soft body en dandine dans les nénuphars.",
    "Lipless gold/black en récupération variée en printemps.",
    "Texas rig beaver en skipping sous les branches surplombantes.",
    "Big swimbait réaliste en slow retrieve sur les plateaux.",
    "Chatterbait bladed jig en trailer ménure en finesse.",
    "Jerkbait suspending naturel en eau claire froide.",
    "Gros crankbait rattling en contact avec les obstacles.",
    "Swimbait segmented en 8-figure près des berges.",
    "Rubber jig football en traîne sur les fonds durs.",
    "Topwater walking bait en zone calme au lever du jour.",
    "Lipless firetiger en burn en période de chasse.",
    "Gros shad en texan dans les bois morts en été.",
    "Spinnerbait chartreuse/white en eau trouble venteuse.",
    "Jerkbait blueback herring en imitation gardon.",
    "Punching avec weight 50g+ dans les mats épais.",
    "Swimbait hollow belly en surface en été chaud.",
    "Crankbait flat side en twitching en eau peu profonde.",
    "Gros tube jig en dandine verticale en hiver.",
    "Chatterbait avec trailer craw en imitation écrevisse.",
    "Jerkbait long en countdown sur les structures profondes.",
    "Topwater mouse ou rat en nuit d'été près des berges.",
    "Lipless chrome/blue en soleil sur les hauts-fonds.",
    "Texas rig sweet beaver en couleur green pumpkin.",
    "Swimbait boot tail en linéaire lent en post-frontal.",
    "Gros buzzbait clacker en zone trouble.",
    "Jerkbait vision 110 en twitching saccadé.",
    "Rubber jig black/blue en flipping nocturne.",
    "Crankbait knocker en récupération stop and go.",
    "Gros frog popper en popping dans les trous.",
    "Spinnerbait double willow en burn en surface.",
    "Leurre souple 30cm en line-thru pour les méga brochets.",
    "Chatterbait jackhammer en trailer parfait.",
    "Jerkbait megabass en pauses très longues.",
    "Topwater dawg en walking the dog en soirée.",
    "Lipless sexy shad en vibration forte en automne.",
    "Texas rig brush hog en punching lourd.",
    "Swimbait huddleston en 8-figure lent.",
    "Gros crankbait 10XD en profondeurs extrêmes.",
    "Buzzbait tandem blade en eau chaude.",
    "Jerkbait pointer 128 en eau froide claire.",
    "Rubber jig living rubber en trailer chunk.",
    "Topwater spook en zig-zag rapide.",
    "Lipless red craw en imitation écrevisse.",
    "Texas rig rage craw en flipping précis.",
    "Swimbait savage gear 4D en réalisme total.",
    "Chatterbait Z-Man en trailer diezel minnowz.",
    "Jerkbait duo realis en twitching fin.",
    "Gros frog booyah pad crasher en herbiers.",
    "Spinnerbait war eagle en couleur spot remover.",
    "Leurre souple westin ricky the roach en linéaire.",
    "Crankbait rapala DT20 en profondeurs.",
    "Topwater river2sea rover en nuit.",
    "Lipless jackall TN70 en vibration.",
    "Texas rig zoom ol' monster en poids lourd.",
    "Swimbait deps silent killer en gliding.",
    "Jerkbait lucky craft staysee en suspending parfait.",
    "Gros buzzbait booyah counter strike en clacker."
  ],
  perche: [
    "Micro-jig ou drop shot en verticale sur les tombants rocheux.",
    "Petits crankbaits ou lipless pour déclencher des attaques réflexes.",
    "Leurres souples en linéaire lent imitant écrevisses ou petits poissons.",
    "Ned rig ou tube sur fond propre avec pauses longues.",
    "Cuillère ondulante ou rotating en récupération variée.",
    "Finesse jig tête football sur les zones graveleuses.",
    "Dandine avec un petit shad sous les branches noyées.",
    "Wacky rig en weightless autour des obstacles.",
    "Micro spinnerbait en récupération lente près des structures.",
    "Petit topwater popper en été au lever du soleil.",
    "Drop shot avec finesse worm 8-10cm en pause longue.",
    "Micro crankbait shallow en prospection rapide sur les plateaux.",
    "Leurre souple 5-7cm en texan léger dans les herbiers clairsemés.",
    "Petite lame vibrante en récupération régulière sur les radiers.",
    "Ned rig avec z-man TRD sur fonds propres.",
    "Micro jigging spoon en verticale en hiver profond.",
    "Petit swimbait 7cm en linéaire lent au-dessus des herbiers.",
    "Tube jig 6cm en dandine autour des rochers.",
    "Finesse spinnerbait 7g en slow roll le long des bordures.",
    "Leurre souple dropshot shad en imitation alevin.",
    "Micro lipless en récupération rapide sur les hauts-fonds.",
    "Wacky rig senko 10cm en chute libre près des docks.",
    "Petit jerkbait SP en twitching rapide en eau claire.",
    "Cuillère n°1 argentée en récupération variée en rivière.",
    "Finesse football jig avec trailer craw sur fonds graveleux.",
    "Micro crankbait squarebill pour fouiller les souches.",
    "Leurre souple finesse en weightless texas dans les obstacles.",
    "Petit chatterbait 7g avec trailer fin en zone peu profonde.",
    "Tail spin en verticale sur les perchoirs en hiver.",
    "Drop shot avec smallie beaver en imitation écrevisse.",
    "Micro crankbait flat side en twitching en eau calme.",
    "Leurre souple curly tail 6cm en linéaire lent.",
    "Ned rig mushroom head avec elaztech worm.",
    "Petit lipless chrome en soleil sur les plateaux.",
    "Tube jig en free rig autour des piles de pont.",
    "Finesse jig arkie head avec trailer chunk.",
    "Micro spinnerbait double willow en burn léger.",
    "Leurre souple shad 8cm en weighted hook près des structures.",
    "Petit topwater pencil en walking en été calme.",
    "Drop shot finesse worm en pause très longue post-frontal.",
    "Micro blade bait en yo-yo sur les cassures.",
    "Leurre souple creature bait en ned rig sur gravier.",
    "Petit crankbait lipless red craw en automne.",
    "Wacky rig yamamoto senko en couleur green pumpkin.",
    "Micro jig ronde en dandine sous les branches.",
    "Tube small en skipping sous les arbres surplombants.",
    "Finesse swimbait keitech en linéaire lent.",
    "Petit jerkbait vision one ten junior en twitching.",
    "Cuillère n°2 or en eau trouble.",
    "Drop shot avec roboworm straight tail.",
    "Micro chatterbait en trailer ménure finesse.",
    "Leurre souple jackall clone fry en imitation alevin.",
    "Ned rig half shell avec finesse craw.",
    "Petit lipless jackall TN38 en vibration fine.",
    "Tube jig z-man en couleur the deal.",
    "Finesse football jig avec baby rage craw.",
    "Micro crankbait duo realis en eau claire.",
    "Leurre souple deps deathadder 6cm en no sinker.",
    "Petit spinnerbait booyah micro en slow roll.",
    "Drop shot osp dolive stick en pause longue.",
    "Micro blade bait damiki vault en verticale.",
    "Leurre souple geecrack bellows shad en linéaire.",
    "Ned rig missile baits shockwave.",
    "Petit topwater illex chubby popper en matin.",
    "Tube jig strike king coffee tube.",
    "Finesse jig pitchin' avec yamamoto hula grub.",
    "Micro lipless yo-zuri 3DB en récupération variée.",
    "Leurre souple keitech swing impact fat 3.3.",
    "Petit jerkbait megabass x-80 en twitching.",
    "Cuillère mepps black fury n°2 en eau teintée.",
    "Drop shot jackall crosstail shad.",
    "Micro crankbait lucky craft bevy en shallow.",
    "Leurre souple z-man finesse shroomz.",
    "Ned rig berkley powerbait maxscent flat worm.",
    "Petit chatterbait z-man micro finesse.",
    "Tube big bite baits smallie tube.",
    "Finesse swimbait basstrix en trailer jig.",
    "Micro lipless rapala rippin rap ultra light.",
    "Leurre souple strike king rage menace en ned.",
    "Petit jerkbait yo-zuri pins minnow.",
    "Cuillère savage gear rotabell n°1.",
    "Drop shot reins swamp mover.",
    "Micro blade bait b fish n pulse-r.",
    "Leurre souple deps basirisky en weightless.",
    "Ned rig xzone muscle back finesse craw.",
    "Petit topwater rebel pop-r micro.",
    "Tube missile baits mini tube.",
    "Finesse jig arky head avec keitech little spider.",
    "Micro crankbait panther martin inline.",
    "Leurre souple jackall rhythm wag.",
    "Petit spinnerbait strike king mini king.",
    "Drop shot big bite baits finesse worm.",
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
    "Verticale avec shad ou finesse jig sur les cassures.",
    "Linéaire lent avec gros leurre souple par faible luminosité.",
    "Dead slow avec jerkbait suspendu en soirée.",
    "Leurre souple vibrant gratté sur le fond.",
    "Shad en linéaire très lent près des piles de pont.",
    "Lame vibrante en récupération lente sur les plateaux.",
    "Verticale avec un tailworm en période froide.",
    "Jigging rap ou balancier en hiver profond.",
    "Leurre souple monté en drop shot sur les tombants.",
    "Finesse shad 10-12cm en linéaire ultra-lent au crépuscule.",
    "Texas rig worm 15cm gratté sur fonds sableux.",
    "Verticale finesse jig près des obstacles en soirée.",
    "Leurre souple curly tail en traction lente au fond.",
    "Jerkbait longbill en pauses longues en eau profonde.",
    "Blade bait en récupération lente sur les cassures.",
    "Shad plombé en verticale sous le bateau en hiver.",
    "Carolina rig lizard sur plaines graveleuses.",
    "Leurre souple imitant poissonnet mort en dead sticking.",
    "Jig vibrant posé au fond avec longues pauses.",
    "Finesse tube en dandine autour des rochers en soirée.",
    "Linéaire très lent avec swimbait réaliste en automne.",
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
    "Jerkbait vision 110 en eau froide claire.",
    "Leurre souple vibrating jig en trailer fin.",
    "Drop shot avec small shad en imitation alevin.",
    "Lame vibrante argentée en soleil sur plateaux.",
    "Shad 15cm en texan dans obstacles submergés.",
    "Verticale avec rubber jig finesse en hiver.",
    "Linéaire lent avec jerkbait suspending en automne.",
    "Blade bait noir en eau trouble.",
    "Texas rig lizard en carolina sur flats.",
    "Leurre souple tube en dandine verticale.",
    "Jerkbait long en pauses 30 secondes par eau très froide.",
    "Finesse swimbait en linéaire lent en soirée.",
    "Drop shot roboworm en straight tail.",
    "Verticale avec tailworm monté offset.",
    "Leurre souple en screw lock pour meilleure tenue.",
    "Jig vibrating en récupération stop and go.",
    "Shad finesse en weighted hook près des structures.",
    "Texas rig small beaver en imitation écrevisse.",
    "Lame vibrante or en eau teintée.",
    "Verticale avec balancier plombé en lac.",
    "Leurre souple curly en dead slow au fond.",
    "Jerkbait megabass one ten en suspending parfait.",
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
    "Jerkbait duo realis en twitching fin.",
    "Blade bait chrome/blue en soleil.",
    "Shad finesse en drop shot en eau froide.",
    "Texas rig small lizard en carolina rig.",
    "Verticale avec tail en couleur chartreuse.",
    "Leurre souple vibrating en trailer shad.",
    "Jig football en traîne lente sur gravier.",
    "Drop shot avec straight worm en green pumpkin.",
    "Lame vibrante slow en récupération variée.",
    "Shad 12cm en linéaire lent en automne profond.",
    "Texas rig creature en flipping léger.",
    "Verticale avec balancier en couleur perch.",
    "Leurre souple en dead sticking sur fond propre.",
    "Jerkbait lucky craft pointer en suspending.",
    "Blade bait gold en eau claire.",
    "Drop shot avec smallie beaver en imitation gobie.",
    "Texas rig 10cm en skipping en zone boisée.",
    "Verticale avec finesse jig en soirée d'été.",
    "Leurre souple tailworm en screw lock."
  ],
  blackbass: [
    "Flipping & pitching avec jig ou texas dans les herbiers épais.",
    "Topwater frog ou popper au lever/coucher du soleil.",
    "Crankbait profond sur les structures submergées.",
    "Finesse shakey head ou wacky rig quand c'est dur.",
    "Swimbait en linéaire moyen pour imiter les proies.",
    "Spinnerbait slow roll le long des bordures boisées.",
    "Carolina rig sur les plaines graveleuses.",
    "Buzzbait en surface dans les zones peu profondes.",
    "Tube jig en dandine autour des rochers.",
    "Chatterbait dans les herbiers clairsemés.",
    "Punching jig gros poids dans les mats d'herbiers.",
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
    "Chatterbait jackhammer en trailer parfait.",
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
    "Carolina rig zoom brush hog.",
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
    "Carolina rig netbait paca craw.",
    "Finesse shakey head spot sticker.",
    "Topwater jackall kaera frog.",
    "Crankbait 13 fishing magic man.",
    "Chatterbait freedom tackle.",
    "Texas rig googan baits krackin craw.",
    "Swimbait huddleston deluxe.",
    "Jig dirty jigs luke clausen.",
    "Drop shot big bite baits trick stick.",
    "Buzzbait strike king tri-wing.",
    "Tube z-man goat toadz.",
    "Wacky rig strike king ocho.",
    "Spinnerbait nichols pulsar.",
    "Carolina rig missle baits baby d bomb."
  ],
  chevesne: [
    "Petits leurres de surface ou insectes pour attaques en surface.",
    "Cuillère ou micro-crank en récupération rapide dans le courant.",
    "Lame vibrante ou petit spinner pour les chasses.",
    "Petit popper ou stickbait en zone calme.",
    "Leurre souple imitant un poissonnet en linéaire rapide.",
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
    "Petit crankbait sinking en traîne derrière rochers.",
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
  aspe: [
    "Jerkminnow ou popper en récupération très rapide pour déclencher l'agressivité.",
    "Petits crankbaits ou lipless dans les zones rapides.",
    "Leurres de surface bruyants en été.",
    "Spinnerbait en burn pour les chasses.",
    "Stickbait en walking the dog en surface.",
    "Petit swimbait en linéaire rapide.",
    "Lame vibrante en récupération continue dans le courant.",
    "Topwater pencil pour les attaques explosives.",
    "Jig tête football gratté sur les fonds durs.",
    "Crankbait shallow en eau peu profonde.",
    "Petit jerkbait en twitching ultra-rapide en surface.",
    "Lipless vibrant en burn dans les zones de courant.",
    "Micro popper ou chugger en été chaud.",
    "Spinnerbait compact en récupération rapide le long des berges.",
    "Petit crankbait lipless rouge/orange pour les chasses.",
    "Topwater prop bait en zone calme pour les attaques folles.",
    "Jerkminnow slim en linéaire ultra-rapide.",
    "Lame vibrante lourde en récupération continue sur les radiers.",
    "Petit stickbait sinking en jerks violents.",
    "Crankbait shallow running en burn près des structures.",
    "Micro chatterbait en récupération rapide dans le courant.",
    "Leurre souple 7-9cm en linéaire rapide avec pauses.",
    "Topwater crawler en zone peu profonde en soirée.",
    "Petit lipless en vibration forte pour déclencher l'agressivité.",
    "Spinnerbait tandem en burn sous la surface.",
    "Jerkbait finesse en twitching rapide en eau claire.",
    "Petit popper en skipping sous les branches.",
    "Crankbait squarebill en contact avec les obstacles.",
    "Lame vibrante compacte en récupération variée.",
    "Topwater whopper plopper mini pour les attaques réflexes.",
    "Petit jerkminnow en surface en été chaud.",
    "Lipless firetiger en burn en période de chasse.",
    "Micro topwater pencil en walking rapide.",
    "Spinnerbait willow en récupération ultra-rapide.",
    "Petit crankbait lipless en vibration forte.",
    "Topwater buzzbait mini en zone trouble.",
    "Jerkbait shallow en twitching saccadé.",
    "Lame vibrante silver en soleil sur radiers.",
    "Petit swimbait paddletail en burn.",
    "Crankbait shallow runner en linéaire rapide.",
    "Micro chatterbait en trailer fin en courant.",
    "Leurre souple 8cm en weighted hook rapide.",
    "Topwater prop mini en zone calme.",
    "Petit lipless chrome en eau claire.",
    "Spinnerbait double willow en burn surface.",
    "Jerkminnow 9cm en jerks violents.",
    "Lame vibrante gold en eau teintée.",
    "Petit popper en popping rapide.",
    "Crankbait lipless mini en vibration.",
    "Topwater stickbait en zig-zag rapide.",
    "Micro blade bait en yo-yo rapide.",
    "Leurre souple 7cm en linéaire burn.",
    "Petit jerkbait SP en surface.",
    "Spinnerbait compact en couleur white.",
    "Lame vibrante black en eau trouble.",
    "Topwater pencil mini en walking.",
    "Petit crankbait shallow en burn.",
    "Micro popper en skipping.",
    "Lipless mini red craw en automne.",
    "Jerkminnow finesse en twitching rapide.",
    "Topwater prop en zone venteuse.",
    "Petit swimbait jointed en linéaire rapide.",
    "Spinnerbait micro en burn léger.",
    "Lame vibrante heavy en courant fort.",
    "Petit topwater chugger en popping.",
    "Crankbait lipless mini en vibration.",
    "Topwater buzz mini en surface.",
    "Jerkbait shallow en jerks courts.",
    "Leurre souple 9cm en burn avec pauses.",
    "Micro chatterbait en courant rapide.",
    "Petit lipless en récupération variée.",
    "Spinnerbait tandem mini en burn.",
    "Topwater pencil en attaques explosives.",
    "Lame vibrante compacte en récupération continue.",
    "Petit jerkminnow en surface chaude.",
    "Crankbait shallow en eau peu profonde.",
    "Micro popper en été.",
    "Lipless mini en chasse.",
    "Topwater prop mini en calme.",
    "Jerkbait mini en twitching.",
    "Spinnerbait micro en courant.",
    "Lame vibrante light en eau claire.",
    "Petit swimbait en rapide.",
    "Crankbait lipless micro.",
    "Topwater stick mini.",
    "Micro blade en rapide.",
    "Leurre souple 6cm en burn.",
    "Petit jerk SP.",
    "Spinnerbait mini white.",
    "Lame vibrante black.",
    "Topwater pencil mini.",
    "Crankbait shallow mini.",
    "Micro popper skipping.",
    "Lipless red mini.",
    "Jerkminnow finesse.",
    "Topwater prop mini.",
    "Petit swimbait jointed.",
    "Spinnerbait micro burn.",
    "Lame vibrante heavy courant.",
    "Petit topwater chugger.",
    "Crankbait lipless mini vibration.",
    "Topwater buzz mini.",
    "Jerkbait shallow jerks.",
    "Leurre souple 9cm burn pauses.",
    "Micro chatter courant rapide.",
    "Petit lipless variée.",
    "Spinnerbait tandem mini burn.",
    "Topwater pencil attaques.",
    "Lame vibrante compacte continue."
  ],
  silure: [
    "Gros leurres souples ou vifs au fond avec longues pauses.",
    "Fireball ou clonk avec gros shad en verticale.",
    "Swimbait XXL en linéaire lent près des trous.",
    "Gros jig vibrant posé au fond avec pauses.",
    "Leurre souple 20cm+ en texan dans les obstacles.",
    "Pellets ou bouillettes pour la pêche au posé (si autorisé).",
    "Verticale avec un gros shad plombé lourd.",
    "Clonk + vif en été profond.",
    "Gros spinnerbait slow roll près des caches.",
    "Leurre souple articulé en traction lente.",
    "Gros rubber jig 50-100g avec trailer au fond.",
    "Fireball avec vif ou calamar en verticale nocturne.",
    "Swimbait jointed 25cm+ en linéaire très lent.",
    "Gros octopus ou twister 20cm en texan lourd.",
    "Clonk seul pour attirer puis présenter un vif.",
    "Leurre souple shad 30cm en line-thru pour monstres.",
    "Verticale avec gros tail en période chaude.",
    "Gros blade bait ou spoon en traction sur fond.",
    "Leurre souple tube XXL en dandine dans trous.",
    "Pêche au posé avec appâts naturels en zone profonde.",
    "Gros crankbait lipless lourd en récupération lente.",
    "Verticale jigging avec gros silicone vibrant.",
    "Leurre souple calamar ou poulpe en texan dans obstacles.",
    "Swimbait réaliste 30cm en slow sinking près caches.",
    "Gros chatterbait avec trailer énorme en zone trouble.",
    "Fireball avec morceaux de poisson en été nocturne.",
    "Leurre souple worm géant en carolina rig profond.",
    "Verticale avec gros rubber jig par eau froide.",
    "Gros popper ou stickbait en surface la nuit (rare mais efficace).",
    "Leurre souple articulé 40cm en traction très lente.",
    "Gros fireball avec seiche ou calamar en verticale.",
    "Swimbait 35cm paddletail en linéaire lent.",
    "Gros texas rig avec trailer squid.",
    "Clonk rythmé + gros shad en présentation.",
    "Leurre souple 25cm en screw lock lourd.",
    "Verticale avec gros twister curly tail.",
    "Gros lipless 100g+ en vibration au fond.",
    "Leurre souple octopus 30cm en texan.",
    "Pêche au posé avec vif en fosse profonde.",
    "Gros swimbait glide en pauses longues.",
    "Fireball avec poisson mort en verticale.",
    "Leurre souple shad 40cm en line-thru.",
    "Gros jig head avec trailer worm.",
    "Clonk + calamar en été chaud.",
    "Swimbait réaliste 30cm en slow retrieve.",
    "Gros rubber jig black en nuit.",
    "Leurre souple tube 25cm en dandine.",
    "Verticale avec gros blade bait.",
    "Gros crankbait deep en traîne lente.",
    "Leurre souple articulé 35cm en traction.",
    "Fireball avec lamproie en verticale.",
    "Swimbait jointed 30cm en linéaire.",
    "Gros texas rig avec gros trailer.",
    "Clonk intense + vif en présentation.",
    "Leurre souple 28cm en weighted hook.",
    "Verticale avec gros vibrating jig.",
    "Gros spoon en yo-yo sur fond.",
    "Leurre souple squid en texan lourd.",
    "Swimbait 40cm en slow sinking.",
    "Gros chatterbait 100g+ en trailer énorme.",
    "Fireball avec écrevisse ou poisson.",
    "Leurre souple worm 30cm en carolina.",
    "Verticale avec gros rubber jig froid.",
    "Gros stickbait sinking en surface nuit.",
    "Leurre souple 35cm en line-thru.",
    "Gros jig vibrating posé pauses longues.",
    "Clonk + seiche en verticale.",
    "Swimbait paddletail 30cm lent.",
    "Gros texas rig creature énorme.",
    "Leurre souple octopus en traction.",
    "Verticale avec gros tail plombé.",
    "Gros blade bait en vibration fond.",
    "Leurre souple tube géant dandine.",
    "Pêche posé avec appâts carnés.",
    "Gros lipless lourd récupération lente.",
    "Verticale jigging gros silicone.",
    "Leurre souple calamar texan obstacles.",
    "Swimbait réaliste 35cm slow.",
    "Gros chatterbait trailer énorme trouble.",
    "Fireball morceaux poisson été nuit.",
    "Leurre souple worm géant carolina profond.",
    "Verticale gros rubber jig eau froide.",
    "Gros popper nuit surface rare.",
    "Leurre souple articulé 45cm traction lente.",
    "Gros fireball seiche verticale.",
    "Swimbait 40cm paddletail linéaire lent.",
    "Gros texas trailer squid.",
    "Clonk rythmé gros shad présentation.",
    "Leurre souple 30cm screw lock lourd.",
    "Verticale gros twister curly.",
    "Gros lipless 150g vibration fond.",
    "Leurre souple octopus 35cm texan.",
    "Pêche posé vif fosse profonde.",
    "Gros swimbait glide pauses longues.",
    "Fireball poisson mort verticale.",
    "Leurre souple shad 45cm line-thru.",
    "Gros jig head trailer worm.",
    "Clonk vif été chaud.",
    "Swimbait réaliste 40cm slow retrieve.",
    "Gros rubber jig black nuit.",
    "Leurre souple tube 30cm dandine.",
    "Verticale gros blade bait.",
    "Gros crankbait deep traîne lente."
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

  list.push("Essaie un leurre souple de 7cm c'est une valeur sure !");
  list.push("Enregistre ta session pour faire progresser l'IA !");

  // Profondeur
  const depthAdvice = [];
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

// === ROUTES ===
app.post('/api/suggest', (req, res) => {
  let { targetSpecies: species = "", structure, conditions, spotType, temperature } = req.body;
  const result = suggestLures(species, structure, conditions, spotType, temperature);
  res.json(result);
});

app.post('/api/advice', (req, res) => {
  try {
    let { targetSpecies: species = "", structure, conditions, spotType, temperature, failedLures = [] } = req.body;

    species = (species || "").toLowerCase();
    structure = (structure || "").toLowerCase();
    conditions = (conditions || "").toLowerCase();
    spotType = (spotType || "").toLowerCase();
    failedLures = Array.isArray(failedLures) ? failedLures.map(l => l.trim().toLowerCase()) : [];

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

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
