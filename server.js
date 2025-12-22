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

const secretKey = 'your-secret-key'; // Change ça en prod avec process.env.JWT_SECRET

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

// === SUGGEST LURES (PROPRE ET FONCTIONNELLE) ===
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

  // Cas ultra-ciblés
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
    if (saison === "été" && spotType === "rivière" )
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

  // === CONSEIL ALÉATOIRE PAR ESPÈCE (TOUJOURS PRÉSENT) ===
  const randomParEspece = {
    brochet: [
      "Prospection rapide en surface avec un gros popper ou stickbait quand l'eau est calme.",
      "Power fishing agressif autour des structures avec gros swimbaits ou jerkbaits XXL.",
      "Twitching violent avec un glider ou un jerkbait long dans les bordures herbeuses.",
      "Réaction pure avec spinnerbait ou chatterbait dans les zones venteuses.",
      "Pêche finesse en période difficile : weightless ou drop shot avec shad 10cm."
    ],
    perche: [
      "Micro-jig ou drop shot en verticale sur les tombants rocheux.",
      "Petits crankbaits ou lipless pour déclencher des attaques réflexes.",
      "Leurres souples en linéaire lent imitant écrevisses ou petits poissons.",
      "Ned rig ou tube sur fond propre avec pauses longues.",
      "Cuillère ondulante ou rotating en récupération variée."
    ],
    // ... (toutes les autres espèces comme avant)
  };

  const conseilsEspece = randomParEspece[species] || randomParEspece.brochet;
  const random1 = conseilsEspece[Math.floor(Math.random() * conseilsEspece.length)];
  let random2 = conseilsEspece[Math.floor(Math.random() * conseilsEspece.length)];
  while (random2 === random1) random2 = conseilsEspece[Math.floor(Math.random() * conseilsEspece.length)];

  list.push(random1);
  list.push(random2);
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
  const { species, structure, conditions, spotType, temperature } = req.body;
  const result = suggestLures(species, structure, conditions, spotType, temperature);
  res.json(result);
});

// ... (tes autres routes /api/learn, /api/sessions, leaderboard, etc. restent identiques)

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// === /API/ADVICE AVEC BLACKLIST ===
app.post('/api/advice', (req, res) => {
  try {
    let { species, structure, conditions, spotType, temperature, failedLures = [] } = req.body;

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
    console.error("Erreur /api/advice :", err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
