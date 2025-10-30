const fs = require('fs');
const path = require('path');

// Fichiers persistants
const sessionsFile = path.join(__dirname, 'sessions.json');
const learnedPatternsFile = path.join(__dirname, 'learnedPatterns.json');
const spotsFile = path.join(__dirname, 'spots.json');

// === Utilitaires ===
function loadFile(file, defaultValue = []) {
  if (!fs.existsSync(file)) {
    saveFile(file, defaultValue);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.error(`Erreur lecture ${path.basename(file)}`, e);
    saveFile(file, defaultValue);
    return defaultValue;
  }
}

function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// === Chargement des données ===
function loadSessions() {
  return loadFile(sessionsFile);
}

function loadLearnedPatterns() {
  return loadFile(learnedPatternsFile, {});
}

function loadSpots() {
  return loadFile(spotsFile);
}

// === Sauvegarde d'une session ===
function saveSession(session) {
  const sessions = loadSessions();
  session.date = new Date().toISOString();
  sessions.push(session);
  saveFile(sessionsFile, sessions);
  console.log(`Nouvelle session : ${session.species} → ${session.lureUsed || 'inconnu'} sur ${session.spotType}`);
  return session;
}

// === Obtenir la saison à partir d'une date ISO ===
function getSaison(dateStr) {
  const mois = new Date(dateStr).getMonth() + 1;
  if ([12, 1, 2].includes(mois)) return 'hiver';
  if ([3, 4, 5].includes(mois)) return 'printemps';
  if ([6, 7, 8].includes(mois)) return 'été';
  return 'automne';
}

// === Analyse et mise à jour des patterns (appris des succès) ===
function analyzeAndUpdatePatterns(minSuccess = 2) {
  const sessions = loadSessions();
  const patterns = loadLearnedPatterns(); // { perche: { été: { nuages: { rivière: ["leurre souple 5cm"] } } } }

  const counts = {};

  // Compter les succès par combinaison
  sessions.forEach(s => {
    if (!s.resultFish) return; // Ignorer les bredouilles
    if (!s.lureUsed) return;  // Ignorer les leurres manquants

    const species = (s.species || '').toLowerCase();
    const saison = getSaison(s.date);
    const conditions = (s.conditions || '').toLowerCase();
    const spotType = (s.spotType || '').toLowerCase();
    const lure = s.lureUsed.trim();

    const key = `${species}|${saison}|${conditions}|${spotType}`;

    if (!counts[key]) counts[key] = {};
    counts[key][lure] = (counts[key][lure] || 0) + 1;
  });

  // Mettre à jour les patterns forts
  let updated = false;
  Object.entries(counts).forEach(([key, lures]) => {
    const [species, saison, conditions, spotType] = key.split('|');
    
    if (!patterns[species]) patterns[species] = {};
    if (!patterns[species][saison]) patterns[species][saison] = {};
    if (!patterns[species][saison][conditions]) patterns[species][saison][conditions] = {};
    if (!patterns[species][saison][conditions][spotType]) {
      patterns[species][saison][conditions][spotType] = [];
    }

    Object.entries(lures).forEach(([lure, count]) => {
      if (count >= minSuccess && !patterns[species][saison][conditions][spotType].includes(lure)) {
        patterns[species][saison][conditions][spotType].push(lure);
        updated = true;
        console.log(`Pattern appris : ${lure} → ${species} en ${saison}, ${conditions}, ${spotType}`);
      }
    });
  });

  if (updated) {
    saveFile(learnedPatternsFile, patterns);
  }

  return patterns;
}

module.exports = {
  saveSession,
  loadSessions,
  loadLearnedPatterns,
  loadSpots,
  analyzeAndUpdatePatterns
};
