const fs = require('fs');
const path = require('path');

// Fichiers persistants
const sessionsFile = path.join(__dirname, 'sessions.json');
const learnedPatternsFile = path.join(__dirname, 'learnedPatterns.json');
const spotsFile = path.join(__dirname, 'spots.json');

// Charger ou initialiser un fichier JSON
function loadFile(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([]));
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Charger les données
function loadSessions() {
  return loadFile(sessionsFile);
}

function loadLearnedPatterns() {
  return loadFile(learnedPatternsFile);
}

function loadSpots() {
  return loadFile(spotsFile);
}

// Sauvegarder une session
function saveSession(session) {
  const sessions = loadSessions();
  sessions.push(session);
  saveFile(sessionsFile, sessions);
  console.log(`🧠 Nouvelle session ajoutée : ${session.species} sur ${session.spotType}`);
  return session;
}

// Analyse : détection de conditions répétées (amélioration automatique)
function analyzeAndUpdatePatterns(minOccurrences = 2) {
  const sessions = loadSessions();
  const learned = loadLearnedPatterns();

  const keyCount = {};

  for (const s of sessions) {
    const key = JSON.stringify({
      species: s.species,
      spotType: s.spotType,
      conditions: s.conditions,
      lureUsed: s.lureUsed,
      resultFish: s.resultFish
    });

    keyCount[key] = (keyCount[key] || 0) + 1;
  }

  const newPatterns = [];
  for (const key in keyCount) {
    if (keyCount[key] >= minOccurrences) {
      const pattern = JSON.parse(key);
      if (!learned.find(p =>
        p.species === pattern.species &&
        p.spotType === pattern.spotType &&
        p.conditions === pattern.conditions &&
        p.lureUsed === pattern.lureUsed
      )) {
        learned.push(pattern);
        newPatterns.push(pattern);
      }
    }
  }

  if (newPatterns.length > 0) {
    console.log(`✨ ${newPatterns.length} nouveau(x) modèle(s) ajouté(s) à la base d’apprentissage.`);
    saveFile(learnedPatternsFile, learned);
  }

  return newPatterns;
}

module.exports = {
  saveSession,
  loadSessions,
  loadLearnedPatterns,
  loadSpots,
  analyzeAndUpdatePatterns
};
