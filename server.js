const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
app.use(express.json());

// === Import du module d'apprentissage ===
let learn;
try {
  learn = require('./learn');
} catch (err) {
  console.warn("learn.js non trouvé, apprentissage désactivé.");
  learn = { 
    saveSession: () => {}, 
    analyzeAndUpdatePatterns: () => {}, 
    loadSessions: () => [], 
    loadLearnedPatterns: () => ({}), 
    loadSpots: () => [] 
  };
}

// --- Base de données persistante des spots ---
const spotFile = path.join(__dirname, 'spots.json');
let spotDatabase = [];

// Charger les spots existants au démarrage
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

// Fonction pour sauvegarder un spot
function saveSpot(spotName) {
  if (spotName && !spotDatabase.includes(spotName)) {
    spotDatabase.push(spotName);
    fs.writeFileSync(spotFile, JSON.stringify(spotDatabase, null, 2));
    console.log(`Spot "${spotName}" ajouté à la base.`);
  }
}

// === CHARGER LES PATTERNS UNE SEULE FOIS ===
let learnedPatterns = {};
try {
  learnedPatterns = learn.loadLearnedPatterns();
  console.log("Patterns appris chargés :", Object.keys(learnedPatterns).length ? Object.keys(learnedPatterns) : "aucun");
} catch (err) {
  console.warn("Pas de patterns appris (fichier manquant ou corrompu)");
}

// --- Fonction principale de suggestion de leurres ---
function suggestLures(species, structure, conditions, spotType, temperature = null) {
  species = (species || "").toLowerCase();
  structure = (structure || "").toLowerCase();
  conditions = (conditions || "").toLowerCase();
  spotType = (spotType || "").toLowerCase();

  saveSpot(spotType);

  const list = [];
  const mois = new Date().getMonth() + 1;
  let saison;
  if ([12, 1, 2].includes(mois)) saison = "hiver";
  else if ([3, 4, 5].includes(mois)) saison = "printemps";
  else if ([6, 7, 8].includes(mois)) saison = "été";
  else saison = "automne";

  // === UTILISER LES PATTERNS APPRENTIS (déjà chargés en haut) ===
  const learnedLures = learnedPatterns[species]?.[saison]?.[conditions]?.[spotType];
  if (learnedLures && learnedLures.length > 0) {
    learnedLures.forEach(lure => {
      list.push(`${lure} (appris des sessions)`);
    });
  }

  // Cas ultra-ciblés
  if (species.includes('perche')) {
  list.push('Cuillère Argentée à points rouges N°2, ce leurre est un classique, à ramener à vitesse moyenne');
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuages'))
      list.push('Dropshot — Animation lente proche des structures');
    if (saison === "hiver" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Ned Rig — Animation lente sur le fond dans les contre-courants');
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('nuage'))
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
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages'))
      list.push('Leurre souple de 7 à 8cm coloris gardon — Récupération rapide avec pauses');
    if (saison === "été" && spotType === "étang" && conditions.includes('nuages'))
      list.push('Leurre souple de 4 à 6cm — Récupération rapide avec pauses');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Leurre souple de 4 à 6cm en dropshot — Récupération lente et dandine proche des obstacles');
    if (saison === "automne" && spotType === "étang" && conditions.includes('nuages') && structure.includes('branch'))
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
    if (saison === "été" && spotType === "étang" && conditions.includes('nuages'))
      list.push('Leurres souples de 10cm puis Cuiller N°4 puis Spinner Bait — Power Fishing proche des obstacles');
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages'))
      list.push('Leurres souples de 10cm puis Cuiller N°4 puis Spinner Bait — Power Fishing proche des obstacles');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Leurres souples de 6cm — Quand il y a du soleil les brochets visent les petites proies');
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Propbait — Récupération rapide avec des pauses proche des obstacles');
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('nuages'))
      list.push('Jerk-Minnow de 12 à 15cm — Twitchs courts avec des pauses en surface');
    if (saison === "printemps" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Cuillère N°4 — Récupération lente en surface');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil') && structure.includes('nénuphar'))
      list.push('Frog — Récupération par a coups avec pauses dans les trouées');
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil') && structure.includes('nénuphar'))
      list.push('Frog — Récupération par a coups avec pauses dans les trouées');
    if (saison === "hiver" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Shad de 16cm — Récupération lente');
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuages'))
      list.push('Lipless ou spintail ou lame vibrante — Récupération lente ou dandine en verticale');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('nuages'))
      list.push('Swimbait de 15cm — Récupération lente en surface');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('pluie'))
      list.push('Shad de 20CM — Récupération lente en surface, puis descends dans la couche d\'eau');
    if (saison === "automne" && spotType === "étang" && conditions.includes('vent'))
      list.push('Crankbait de 8cm — Récupération lente en surface, puis descends dans la couche d\'eau au fur et à mesure du temps');
  }

  if (species.includes('bass')) {
  list.push('Utiliser des leurres imitatifs des plus petites proies comme les vers, les insectes ou encore les écrevisses— Récupération lente avec des pauses proche ou dans des obstacles');    
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuages'))
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
      list.push('Worm marron — Dandine dans les branches et les herbiers ');
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages'))
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
  list.push('Leurre souple jaune — Toujours ramener au ras du fond');    
    if (saison === "automne" && spotType === "rivière" && conditions.includes('pluie') && structure.includes('pont'))
      list.push('Leurre souple de 7cm blanc — Gratte le fond et fais de longues pauses ');
    if (saison === "automne" && spotType === "rivière" && conditions.includes('nuages') && structure.includes('pont'))
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
  
      

  // --- Conseils généraux ---
if (list.length === 0) {
  const defaults = [
    'Pas de cas précis ? Teste un leurre souple 5-7cm coloris naturel ou une cuillère taille N°2. Enregistre ta session pour faire progresser l\'IA !',
    'Rien ne semble sortir du lot : Tente un shad en linéaire, puis twitching et dandine. Le poisson finira par craquer ! Dis-moi ensuite si tu as eu un poisson pour faire progresser l\'IA !',
    'Essaie un petit crankbait ou un spinnerbait. La magie opère souvent là où on ne l\'attend pas. Enregistre ta session pour faire progresser l\'IA !',
    'Essaie un grub blanc, en linéaire lent, ça peut être sympa, enregistre ta session pour me faire progresser !',
    'Essaie un petit worm très rigide, sur le fond et gratte : ça peut rapporter de belles surprises, enregistre ta session pour me faire progresser !',
    'Essaie une écrevisse, laisse tomber sur le fond et donne des à-coups, enregistre ta session pour me faire progresser !'
  ];
  list.push(defaults[Math.floor(Math.random() * defaults.length)]);
}
  // --- Profondeur selon température ---
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

app.post('/api/learn', (req, res) => {
  try {
    const session = req.body || {};
    if (!session.species || !session.spotType || session.resultFish === undefined) {
      return res.status(400).json({ error: 'Champs requis manquants : species, spotType, resultFish' });
    }
    const saved = learn.saveSession(session);
    const newPatterns = learn.analyzeAndUpdatePatterns(2);
    return res.json({ success: true, saved, newPatterns });
  } catch (e) {
    console.error('/api/learn error', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/sessions', (req, res) => {
  try {
    res.json(learn.loadSessions());
  } catch (e) {
    res.status(500).json([]);
  }
});

app.get('/api/learnedPatterns', (req, res) => {
  try {
    res.json(learn.loadLearnedPatterns());
  } catch (e) {
    res.status(500).json([]);
  }
});

app.get('/api/spots', (req, res) => {
  try {
    res.json(learn.loadSpots());
  } catch (e) {
    res.status(500).json([]);
  }
});

// === CLASSEMENT DES PÊCHEURS (NOUVEAU) ===
app.get('/api/leaderboard', (req, res) => {
  try {
    const sessions = learn.loadSessions();
    const leaderboard = {};

    sessions.forEach(s => {
      if (s.resultFish && s.anglerName && s.anglerName !== "Anonyme") {
        leaderboard[s.anglerName] = (leaderboard[s.anglerName] || 0) + 1;
      }
    });

    const ranked = Object.entries(leaderboard)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json(ranked);
  } catch (e) {
    console.error("Erreur leaderboard:", e);
    res.status(500).json([]);
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/advice', (req, res) => {
  try {
    const { species, structure, conditions, spotType, temperature } = req.body;
    if (!structure || !conditions) {
      return res.status(400).json({ error: 'Champs requis manquants : structure et conditions.' });
    }
    const result = suggestLures(species, structure, conditions, spotType, temperature);
    console.log("Conseils générés :", result);
    res.json(result);
  } catch (err) {
    console.error("Erreur dans /api/advice :", err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
