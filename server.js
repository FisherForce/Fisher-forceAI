
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
function suggestLures(species, structure, conditions, spotType, temperature = null, technique ) {
  species   = (species   || "").toLowerCase();
  structure = (structure || "").toLowerCase();
  conditions = (conditions || "").toLowerCase();
  spotType  = (spotType  || "").toLowerCase();

  saveSpot(spotType);

  const list = [];
  const depthAdvice = [];

  const mois = new Date().getMonth() + 1;
  let saison = [12,1,2].includes(mois) ? "hiver" :
               [3,4,5].includes(mois) ? "printemps" :
               [6,7,8].includes(mois) ? "été" : "automne";

  if (temperature !== null) {
    if (temperature < 10)  saison += " froid";
    else if (temperature > 20) saison += " chaud";
  }

  // Patterns appris (on garde ça tel quel)
  const learned = learnedPatterns[species]?.[saison]?.[conditions]?.[spotType];
  if (learned && learned.length > 0) {
    learned.forEach(l => list.push(`${l} (appris des sessions)`));
  }

  // ────────────────────────────────────────────────
  // BROCHET
  // ────────────────────────────────────────────────
  if (species.includes('brochet')) {
    if (technique === "leurres") {
      list.push("Grub 10-15 cm tête rouge ou chartreuse – récup moyenne + pauses près obstacles");
      list.push("Spinnerbait ou chatterbait – powerfishing en zone herbeuse/nuageux");
      if (saison.includes("été") || saison.includes("chaud")) {
        list.push("Frog ou leurre de surface – herbiers / bordures herbeuses");
      }
      if (saison.includes("hiver") || saison.includes("froid")) {
        list.push("Gros leurre souple 18-25 cm – animation lente / verticale");
      }
    } 
    else if (technique === "appats") {
      list.push("Poisson mort ou vif (éperlan, gardon, ablette) – montage mort manié ou posé");
      list.push("Gros ver de terre ou morceaux de poisson – en hiver/eau froide");
    } 
    else if (technique === "mouche") {
      list.push("Gros streamer coloré (type pike fly) avec bas de ligne acier");
      list.push("Animation saccadée – zones peu profondes / herbiers");
    } 
    else if (technique === "finesse ultra léger") {
      list.push("Petit shad finesse 7-10 cm sur tête 3-7 g – ultra lent / ned rig like");
      list.push("Drop shot mini – quand brochet apathique (froid ou pression forte)");
    } 
    else {
      list.push(`Technique ${technique} peu adaptée au brochet – essaie plutôt leurres ou appâts naturels`);
    }

    // Profondeur brochet (exemple simple)
    if (temperature !== null) {
      if (temperature < 8)  depthAdvice.push("4-7 m – gros leurres lents / fond");
      else if (temperature < 15) depthAdvice.push("2-5 m – jerkbait / spinnerbait");
      else depthAdvice.push("0-3 m – surface / bordures / frog");
    }
  }

  // ────────────────────────────────────────────────
  // PERCHE
  // ────────────────────────────────────────────────
  else if (species.includes('perche')) {
    if (technique === "leurres") {
      list.push("Cuillère Mepps / Aglià n°2-3 argentée ou rouge – vitesse moyenne");
      list.push("Petit shad 5-8 cm ou micro-perch – tête 3-7 g");
      if (saison.includes("printemps") || saison.includes("été")) {
        list.push("Popper ou stickbait surface – matin / soir");
      }
    } 
    else if (technique === "appats") {
      list.push("Ver de terre, teigne ou vairon – flotteur ou posé");
      list.push("Lombrics en grappe – amorçage léger");
    } 
    else if (technique === "mouche") {
      list.push("Streamer petit (type clouser minnow) – animation lente");
      list.push("Nymphe lestée – toc ou dérive");
    } 
    else if (technique === "finesse ultra léger") {
      list.push("Ned rig ver finesse 5-7 cm – ultra lent / dandine");
      list.push("Dropshot micro-worm ou mini-shad – 1-3 m");
      list.push("Micro jig 2-5 g – vertical ou lent");
    } 
    else {
      list.push(`Technique ${technique} peu courante pour perche – finesse ou leurres classiques plus efficaces`);
    }

    // Profondeur perche
    if (temperature !== null) {
      if (temperature < 10) depthAdvice.push("3-6 m – vertical / dropshot");
      else if (temperature < 18) depthAdvice.push("1-4 m – micro-leurres");
      else depthAdvice.push("0-2 m – surface / topwater");
    }
  }

  // ────────────────────────────────────────────────
  // TRUITE
  // ────────────────────────────────────────────────
  else if (species.includes('truite')) {
    if (technique === "leurres") {
      list.push("Petite cuillère #0-2 ou micro-trout minnow 4-7 cm");
      list.push("Micro-spinner ou cheveu – rivières / courant");
    } 
    else if (technique === "appats") {
      list.push("Ver de terre, teigne ou asticot – toc ou flotteur léger");
      list.push("Maïs doux ou pâte – étang calme");
    } 
    else if (technique === "mouche") {
      list.push("Mouche sèche (CDC, elk hair caddis) – surface / éclosions");
      list.push("Nymphe (perdigon, pheasant tail) – nymphe au fil / toc");
      if (saison.includes("printemps")) {
        list.push("Nymphe légère ou sèche – eau claire / montante");
      }
    } 
    else if (technique === "finesse ultra léger") {
      list.push("Micro jig 1-4 g ou finesse shad ultra léger");
      list.push("Wacky rig ver finesse – eau calme / étang");
    } 
    else if (technique === "carpe") {
      list.push("Pas vraiment adapté à la truite – essaie plutôt mouche ou appâts naturels");
    } 
    else {
      list.push(`Technique ${technique} non optimale pour truite – mouche ou finesse marchent mieux`);
    }

    depthAdvice.push("0-1.5 m surface (sèche) ou 0.5-2.5 m fond (nymphe / appâts)");
  }

  // ────────────────────────────────────────────────
  // CARPE
  // ────────────────────────────────────────────────
  else if (species.includes('carpe')) {
    if (technique === "leurres") {
      list.push("Peu efficace – carpe préfère appâts statiques");
    } 
    else if (technique === "appats" || technique === "carpe") {
      list.push("Bouillettes 15-20 mm (protéinées en été/automne, digestes en hiver/printemps)");
      list.push("Maïs doux, pellets, tiger nuts – amorçage PVA ou spod");
      if (saison.includes("hiver") || saison.includes("froid")) {
        list.push("Petits appâts + amorçage léger / soluble (pellets baby corn, stickmix)");
      }
      if (saison.includes("été") || saison.includes("chaud")) {
        list.push("Amorçage copieux – bouillettes + pellets + graines");
      }
    } 
    else if (technique === "mouche") {
      list.push("Très rare – presque jamais efficace pour carpe");
    } 
    else if (technique === "finesse ultra léger") {
      list.push("Pas adapté – carpe réagit mal aux animations finesse");
    } 
    else {
      list.push(`Technique ${technique} peu utilisée pour carpe – concentre-toi sur appâts + amorçage`);
    }

    depthAdvice.push("Fond principalement – parfois mi-eau si amorçage en surface");
  }

  // ────────────────────────────────────────────────
  // FALLBACK GÉNÉRAL SI AUCUNE ESPÈCE MATCHÉE
  // ────────────────────────────────────────────────
  else {
    list.push("Espèce non reconnue – essaie brochet, perche, truite, carpe...");
    list.push("Ou enregistre ta session pour aider l'IA à apprendre !");
  }

  // Messages génériques finaux (adaptés à la technique)
  if (["leurres", "finesse ultra léger"].includes(technique)) {
    list.push("Un leurre souple 7-10 cm reste une valeur sûre dans beaucoup de cas");
  } else if (["appats", "carpe"].includes(technique)) {
    list.push("Amorce copieusement mais intelligemment selon la saison");
  } else if (technique === "mouche") {
    list.push("Observe les insectes naturels pour bien imiter");
  }

  list.push("Enregistre ta sortie pour faire progresser FisherForce AI !");

  // Fermeture brochet (janvier-avril ≈ mois 0-3)
  const now = new Date();
  if (now.getMonth() < 4 && species.includes('brochet') && technique === "leurres") {
    list.unshift(
      "⚠️ Période de fermeture brochet active ! Toute prise = infraction.",
      "Privilégie appâts naturels, mouche, finesse sur perche/truite/carpe/silure..."
    );
  }

  return { lures: list, depthAdvice };
}


// === ROUTES ===
app.post('/api/advice', (req, res) => {
  try {
    let { 
      targetSpecies: species = "", 
      structure, 
      conditions, 
      spotType, 
      temperature, 
      failedLures = [],
      technique   // Nouveau paramètre, par défaut leurres
    } = req.body;

    species = (species || "").toLowerCase();
    structure = (structure || "").toLowerCase();
    conditions = (conditions || "").toLowerCase();
    spotType = (spotType || "").toLowerCase();
    failedLures = Array.isArray(failedLures) ? failedLures.map(l => l.trim().toLowerCase()) : [];

     if (!structure || !conditions) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const result = suggestLures(species, structure, conditions, spotType, temperature, technique);

    let filteredLures = result.lures.filter(lure => {
      const lureName = lure.split(' — ')[0].trim().toLowerCase();
      return !failedLures.includes(lureName);
    });

    if (filteredLures.length === 0) {
      filteredLures = [
        "Aucun leurre/appât précédent n'a fonctionné...",
        "Essaie quelque chose de complètement différent (taille, couleur, profondeur)",
        "Change de technique ou de montage",
        "Enregistre ta session pour améliorer l'IA !"
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
