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
  learn = { saveSession: () => {}, analyzeAndUpdatePatterns: () => {}, loadSessions: () => [], loadLearnedPatterns: () => ({}), loadSpots: () => [] };
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
  // === CHARGER LES PATTERNS APPRENTIS ===
const learnedPatterns = learn.loadLearnedPatterns();

// Appliquer les patterns appris en priorité
const learnedKey = `${species}|${saison}|${conditions}|${spotType}`;
const learnedLures = learnedPatterns[species]?.[saison]?.[conditions]?.[spotType];
if (learnedLures && learnedLures.length > 0) {
  learnedLures.forEach(lure => {
    list.push(`${lure} (appris des sessions)`);
  });
}
  if ([12, 1, 2].includes(mois)) saison = "hiver";
  else if ([3, 4, 5].includes(mois)) saison = "printemps";
  else if ([6, 7, 8].includes(mois)) saison = "été";
  else saison = "automne";

  // Cas ultra-ciblés
  if (species.includes('perche')) {
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
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Cuillère N°2 argentée puis Leurre souple de 5cm puis crank puis micro-leurre — Animation juste sous la surface');
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages'))
      list.push('Leurre souple de 7 à 8cm coloris gardon — Récupération rapide avec pauses');
    if (saison === "été" && spotType === "étang" && conditions.includes('nuages'))
      list.push('Leurre souple de 4 à 6cm — Récupération rapide avec pauses');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Leurre souple de 4 à 6cm en dropshot — Récupération lente et dandine proche des obstacles');
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
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuages'))
      list.push('Ned Rig ou ver manié — Récupération lente ou dandine en verticale');
    if (saison === "printemps" && spotType === "étang" && conditions.includes('vent'))
      list.push('Spinner-bait — Récupération lente sous la surface');
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil'))
      list.push('Worm en wacky ou Tube texan ou Frog ou finesse Rb — Récupération par à-coups ou en dandine');
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages'))
      list.push('Écrevisses en punching — Dans les herbiers');
  }

  if (species.includes('chevesne')) {
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil'))
      list.push('Lame vibrante ou cuillère ou micro-leurre — Récupération rapide pour déclencher des attaques de réaction');
  }

  // --- Conseils généraux ---
  if (list.length === 0) {
    const defaults = [
      'Pas de cas précis ? Teste un leurre souple 5-7cm coloris naturel ou une cuillère N°2. Enregistre ta session pour faire progresser l\'IA !',
      'Rien ne semble sortir du lot : Tente un shad en linéaire, puis twitching et dandine. Le poisson finira par craquer ! Dis-moi ensuite si tu as eu un poisson pour faire progresser l\'IA !',
      'Essaie un petit crankbait ou un spinnerbait. La magie opère souvent là où on ne l\'attend pas. Enregistre ta session pour faire progresser l\'IA !'
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

    // 1. Sauvegarde la session
    const saved = learn.saveSession(session);

    // 2. Analyse et met à jour les patterns (apprentissage !)
    const newPatterns = learn.analyzeAndUpdatePatterns(2); // 2 succès minimum

    // 3. Réponse
    return res.json({ 
      success: true, 
      saved, 
      newPatterns 
    });

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
