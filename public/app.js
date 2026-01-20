const el = id => document.getElementById(id);
// === VARIABLES GLOBALES ===
let progress = { xp: 0, speciesCaught: {}, successes: 0, attempts: 0 };
let knownSpots = new Set();
let knownSpecies = new Set();

// === LIMITATION 5 CONSEILS/JOUR (UNIQUEMENT GRATUIT) ===
let dailyAdviceCount = 0;
let lastAdviceDate = '';
function resetDailyAdviceCount() {
  const today = new Date().toDateString();
  if (lastAdviceDate !== today) {
    dailyAdviceCount = 0;
    lastAdviceDate = today;
    localStorage.setItem('lastAdviceDate', today);
  } else {
    dailyAdviceCount = parseInt(localStorage.getItem('dailyAdviceCount') || '0');
  }
}
resetDailyAdviceCount();

// === LIMITATION 6 RÉSULTATS/JOUR (UNIQUEMENT GRATUIT) ===
let dailyResultCount = 0;
let lastResultDate = '';
function resetDailyResultCount() {
  const today = new Date().toDateString();
  if (lastResultDate !== today) {
    dailyResultCount = 0;
    lastResultDate = today;
    localStorage.setItem('lastResultDate', today);
  } else {
    dailyResultCount = parseInt(localStorage.getItem('dailyResultCount') || '0');
  }
}
resetDailyResultCount();

// === CHARGEMENT LOCAL ===
function loadAll() {
  const data = localStorage.getItem('fisherXP');
  const spots = localStorage.getItem('knownSpots');
  const species = localStorage.getItem('knownSpecies');
  if (data) progress = JSON.parse(data);
  if (spots) knownSpots = new Set(JSON.parse(spots));
  if (species) knownSpecies = new Set(JSON.parse(species));
}
loadAll();

// === XP DOPAMINE PUR ===
function awardXP(amount, message) {
  progress.xp += amount;
  saveAll();
  showXPPop(`+${amount} XP ! ${message}`);
}
function showXPPop(text) {
  const pop = document.createElement('div');
  pop.innerHTML = `<strong style="font-size:30px;">${text}</strong>`;
  pop.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);background:#00d4aa;color:white;padding:22px 60px;border-radius:70px;z-index:99999;box-shadow:0 20px 50px rgba(0,212,170,0.9);animation:pop 1.8s forwards;';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1800);
}
function saveAll() {
  localStorage.setItem('fisherXP', JSON.stringify(progress));
  localStorage.setItem('knownSpots', JSON.stringify([...knownSpots]));
  localStorage.setItem('knownSpecies', JSON.stringify([...knownSpecies]));
  updateDashboard();
}

// === DASHBOARD LIVE (SÉCURISÉ) ===
function updateDashboard() {
  const dashboard = document.querySelector('.dashboard');
  if (!dashboard) {
    console.warn("Dashboard non trouvé dans le DOM. Attente...");
    return;
  }
  const level = progress.xp < 50 ? "Débutant 👼" :
                progress.xp < 200 ? "Traqueur 🚶‍♀️‍➡️" :
                progress.xp < 400 ? "Maître du brochet 🥷" :
                progress.xp < 555 ? "FisherForce 💪" :
                progress.xp < 666 ? "Ami des poissons 🐟" :
                progress.xp < 1000 ? "Guide de pêche 🦞" :
                progress.xp < 1500 ? "Compétiteur 🥽" :
                progress.xp < 2000 ? "Spécialiste 🤖" :
                progress.xp < 3000 ? " Bar de légende 👾" :
                progress.xp < 4000 ? " Visionnaire 🦅" :
                progress.xp < 5000 ? " Perche divine 🐠" :
                progress.xp < 10000 ? "Goat 🐊" : "Légende Vivante 🌟";
  const rate = progress.attempts ? Math.round((progress.successes / progress.attempts) * 100) : 0;
  dashboard.innerHTML = `
    <h3><span class="level-badge">${level}</span> — <span id="xp">${progress.xp}</span> XP</h3>
    <div class="stats-grid">
      <div class="stat-item">Spots : <strong>${knownSpots.size}</strong></div>
      <div class="stat-item">Espèces : <strong>${Object.keys(progress.speciesCaught).length}</strong></div>
      <div class="stat-item">Réussite : <strong>${rate}%</strong></div>
    </div>`;
}

// === FONCTION CARTE : SAUVEGARDE GPS DE CHAQUE SESSION ===
function saveSessionToMap(success, speciesName, poids, spotName, lure, photo) {
  if (!navigator.geolocation) {
    console.log("Géolocalisation non supportée");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const session = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        success,
        species: speciesName || null,
        poids: poids || 0,
        spot: spotName || "Spot inconnu",
        lure: lure || "Inconnu",
        date: new Date().toISOString(),
        pseudo: localStorage.getItem('fisherPseudo') || "Anonyme",
        photo: photo || null
      };
      let sessions = JSON.parse(localStorage.getItem('fishingSessions') || '[]');
      sessions.push(session);
      localStorage.setItem('fishingSessions', JSON.stringify(sessions));
      console.log("Session géolocalisée sauvegardée !", session);
    },
    (err) => {
      console.warn("Impossible d'obtenir la position GPS", err);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// === TOUT LE CODE ===
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('xpAnim')) {
    const s = document.createElement('style');
    s.id = 'xpAnim';
    s.textContent = '@keyframes pop{0%{transform:scale(0) translateX(-50%)}40%{transform:scale(1.7) translateX(-50%)}100%{transform:scale(1) translateX(-50%);opacity:0}}';
    document.head.appendChild(s);
  }
  el('getAdvice')?.addEventListener('click', async () => {


    const input = readForm();
    const spotName = (input.spotName || "").trim().toLowerCase();
    awardXP(1, "Conseil demandé !");
    if (spotName && !knownSpots.has(spotName)) {
      knownSpots.add(spotName);
      awardXP(10, "Nouveau spot découvert !");
    }
    el('advice').innerHTML = '<p class="muted">Génération en cours…</p>';
    let result;
    try {
      // === ENVOI DE LA LISTE NOIRE AU SERVEUR ===
      const failedLures = getFailedLures(
        input.targetSpecies,
        input.conditions,
        input.structure,
        input.waterType,
        input.temperature
      );

      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          failedLures: failedLures
        })
      });
      result = await res.json();
    } catch (e) {
      console.log("API HS → mode démo");
    }
    if (!result || result.error) {
      result = {
        adviceText: "Pêche en poids suspendu avec un leurre souple 10cm texan. Varie les couleurs selon la luminosité.",
        lures: ["Texas rig 10g — Herbiers", "Jerkbait 11cm — Eau claire", "Spinnerbait — Vent fort"]
      };
    }
    renderAdvice(result);

    // Sauvegarde le dernier conseil pour la blacklist automatique en bredouille
    localStorage.setItem('lastAdviceLures', JSON.stringify(result.lures || []));
    localStorage.setItem('lastAdviceConditions', JSON.stringify({
      targetSpecies: input.targetSpecies,
      structure: input.structure,
      conditions: input.conditions,
      spotType: input.waterType,
      temperature: input.temperature
    }));
  });
  el('clearBtn')?.addEventListener('click', () => {
    ['spotName','structure','targetSpecies','conditions','temperature'].forEach(id => el(id).value = '');
    el('waterType').value = 'Étang';
    el('advice').innerHTML = '<p class="muted">Remplis le formulaire…</p>';
    el('voiceControls') && (el('voiceControls').style.display = 'none');
  });
  window.openResultat = () => {
    const spot = el('spotName')?.value.trim() || "Spot inconnu";
    window.open(`resultat.html?spot=${encodeURIComponent(spot)}`, '_blank', 'width=500,height=700');
  };
  // === RÉCEPTION DES RÉSULTATS + RÉACTIONS IA + SAUVEGARDE GPS ===
  window.addEventListener('message', async (e) => {
    if (e.data?.type === 'ADD_XP') {


      // Incrémente seulement si Gratuit
      if (currentSubscription !== 'premium') {
        dailyResultCount++;
        localStorage.setItem('dailyResultCount', dailyResultCount.toString());
      }

      const { success, speciesName, spotName, lure = "Inconnu", poids = 0, photo = null } = e.data;

      let lureName = null;
      if (lure && lure !== "Inconnu") {
        lureName = lure.split(' — ')[0].trim();
      }

      // ENVOI À L'IA
      if (success && speciesName && lure) {
        const input = readForm();
        const pseudo = localStorage.getItem('fisherPseudo') || "Anonyme";
        try {
          await fetch('/api/learn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              species: speciesName,
              lureUsed: lure,
              resultFish: true,
              spotType: input.waterType || "Étang",
              conditions: input.conditions || "",
              structure: input.structure || "",
              anglerName: pseudo,
              weight: poids
            })
          });
        } catch (err) {
          console.warn("Échec envoi session IA", err);
        }
      }

      // === LISTE NOIRE EN CAS DE BREDOUILLE ===
      if (!success && lure && lure !== "Inconnu") {
        const input = readForm();
        const blacklistSpecies = input.targetSpecies || "inconnu"; // Utilise l'espèce visée

        blacklistLureOnFailure(
          blacklistSpecies,
          lure,
          input.conditions,
          input.structure,
          input.waterType,
          input.temperature
        );

        // POP-UP BLACKLIST
        showBlacklistPop(lureName);
      }

      if (success) awardXP(5, "Prise validée !");
      else awardXP(5, "Session enregistrée");
      if (spotName && !knownSpots.has(spotName)) {
        knownSpots.add(spotName);
        awardXP(10, "NOUVEAU SPOT CONQUIS !");
      }
      if (success && speciesName && !knownSpecies.has(speciesName)) {
        knownSpecies.add(speciesName);
        awardXP(10, `NOUVELLE ESPÈCE : ${speciesName.toUpperCase()} !`);
      }
      if (success && speciesName) {
        progress.speciesCaught[speciesName] = (progress.speciesCaught[speciesName] || 0) + 1;
      }
      progress.attempts += 1;
      if (success) progress.successes += 1;
      saveAll();
      // SAUVEGARDE GPS SUR LA CARTE
      saveSessionToMap(success, speciesName || null, poids, spotName || "Spot inconnu", lure || "Inconnu", photo);
      // RÉACTION IA
      if (success && speciesName && poids > 0) {
        showFishReaction(speciesName, poids, false);
      } else if (!success) {
        showFishReaction(null, 0, true);
      }
    }
  });
  // === FONCTIONS DE BASE ===
  function readForm() {
    return {
      spotName: el('spotName')?.value || "",
      waterType: el('waterType')?.value || "Étang",
      structure: el('structure')?.value || "",
      targetSpecies: el('targetSpecies')?.value || "",
      conditions: el('conditions')?.value || "",
      temperature: parseFloat(el('temperature')?.value) || null,
    };
  }
  function renderAdvice(data) {
    const c = el('advice');
    c.innerHTML = `<h3>Résumé IA</h3><div class="advice-text">${data.adviceText || ""}</div>`;
    if (data.lures?.length) {
      c.innerHTML += `<h3>Leurres conseillés</h3><ul>${data.lures.map(l => `<li><strong>${l.split(' — ')[0]}</strong> — ${l.split(' — ').slice(1).join(' — ')}</li>`).join('')}</ul>`;
    }
    el('voiceControls') && (el('voiceControls').style.display = 'block');
  }
  // === RÉACTION IA ULTRA VIVANTE (PRISE + BREDOUILLE + CHAMBRAGE) ===
  function showFishReaction(species = null, poidsGram = 0, isBredouille = false) {
    const pseudo = localStorage.getItem('fisherPseudo') || "Pêcheur";
    let bredouilleStreak = parseInt(localStorage.getItem('bredouilleStreak') || '0');

    if (isBredouille) {
      bredouilleStreak++;
      localStorage.setItem('bredouilleStreak', bredouilleStreak.toString());
    } else {
      bredouilleStreak = 0;
      localStorage.setItem('bredouilleStreak', '0');
    }
    let message = "";
    let bgColor = "#00d4aa";
    if (!isBredouille && species && poidsGram > 0) {
      const poids = poidsGram / 1000;
      const key = `pb_${species}`;
      const ancienPB = parseFloat(localStorage.getItem(key)) || 0;
      if (poids >= 10) {
        message = `${pseudo} TU VIENS DE SORTIR UN MONSTRE ABSOLU ! ${species.toUpperCase()} de ${poids.toFixed(2)} KG !!`;
        bgColor = "#ff0066";
      } else if (poids >= 7) {
        message = `MONSTRE VALIDÉ ! ${species.toUpperCase()} à ${poids.toFixed(2)} kg ! T’es une légende !`;
        bgColor = "#ff0066";
      } else if (poids >= 4) {
        message = `GROS GROS ${species} à ${poids.toFixed(2)} kg ! T’as défoncé la moyenne !`;
        bgColor = "#ff6b00";
      } else if (poids >= 2) {
        message = `Très joli ${species} de ${poids.toFixed(2)} kg ! T’es chaud !`;
      } else {
        message = `Beau ${species} de ${poidsGram}g ! Chaque poisson compte !`;
      }
      if (poidsGram > ancienPB) {
        localStorage.setItem(key, poidsGram.toString());
        message += `\n\nRECORD PERSONNEL PULVÉRISÉ !\nAncien : ${ancienPB ? (ancienPB/1000).toFixed(2)+"kg" : "aucun"}\nNouveau : ${poids.toFixed(2)} kg !`;
        bgColor = "#ffd700";
      }
    } else if (isBredouille) {
      const messages = [
        ["C’est pas grave, ça arrive même aux meilleurs", "La prochaine sera la bonne", "Allez, rembobine et on recommence !"],
        ["T’as oublié d’ouvrir les yeux ?", "T’as mis de l’anti-poisson sur ton leurre ?", "Les canards se moquent de toi"],
        ["Franchement, t’es sûr que t’as une canne ?", "T’as pensé à mettre un hameçon ?", "Là c’est du jardinage"],
        ["OK là t’abuses. T’es NUL.", "Je doute de tes talents", "Donne-moi ta canne, je vais le faire"],
        ["T’as battu le record du monde de bredouilles", "Même un enfant de 5 ans ferait mieux", "Je t’appelle « Monsieur Bredouille » désormais"]
      ];
      let niveau = Math.min(Math.floor(bredouilleStreak / 3), 4);
      message = messages[niveau][Math.floor(Math.random() * messages[niveau].length)];
      if (bredouilleStreak === 5) message = "5 bredouilles d’affilée… T’es en train de battre un record";
      if (bredouilleStreak === 10) message = "10… DIX… T’as un don pour ne rien prendre";
      if (bredouilleStreak >= 15) message = "OK je capitule. T’es le roi de la bredouille. Respect.";
      bgColor = "#e74c3c";
    }
    const pop = document.createElement('div');
    pop.innerHTML = `<strong style="font-size:26px; text-shadow: 2px 2px 10px black; line-height:1.5;">
      ${message.replace(/\n\n/g, '<br><br>')}
    </strong>`;
    pop.style.cssText = `
      position:fixed; top:15%; left:50%; transform:translateX(-50%);
      background:${bgColor}; color:white; padding:30px 50px; border-radius:25px;
      z-index:99999; box-shadow:0 30px 80px rgba(0,0,0,0.7); text-align:center;
      max-width:90%; font-weight:bold; animation:pop 3.5s forwards;
    `;
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 8000);
  }

  // === MÉTÉO AUTO + CONSEIL LEURRE IA (VERSION 100% COMPATIBLE CAS ULTRA-CIBLÉS) ===
  document.getElementById('weatherAdviceBtn')?.addEventListener('click', async () => {
    el('weatherResult').style.display = 'block';
    el('weatherResult').innerHTML = `<p style="color:#00d4aa;font-size:18px;">Détection position + météo en cours…</p>`;
    if (!navigator.geolocation) {
      el('weatherResult').innerHTML = "Géolocalisation bloquée";
      return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,precipitation,cloud_cover,pressure_msl,is_day&timezone=Europe/Paris`);
        const meteo = await res.json();
        const c = meteo.current;
        const temp = Math.round(c.temperature_2m);
        const vent = Math.round(c.wind_speed_10m);
        const pluie = c.precipitation > 0.5;
        const nuages = c.cloud_cover > 70;
        const pression = Math.round(c.pressure_msl);
        const jour = c.is_day === 1;
        let conditionsText = "";
        if (pluie) conditionsText += "pluie ";
        if (nuages) conditionsText += "nuages ";
        if (!pluie && !nuages) conditionsText += "clair ";
        if (vent > 30) conditionsText += "vent fort ";
        if (!jour) conditionsText += "nuit ";
        conditionsText = conditionsText.trim();
        if (document.getElementById('conditions')) {
          document.getElementById('conditions').value = conditionsText;
        }
        if (document.getElementById('temperature')) {
          document.getElementById('temperature').value = temp;
        }
        const serverRes = await fetch('/api/advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetSpecies: "Brochet",
            structure: "mixte",
            conditions: conditionsText,
            spotType: "étang",
            temperature: temp
          })
        });
        const conseil = await serverRes.json();
        el('weatherResult').innerHTML = `
          <h3 style="color:#00ff9d;margin:15px 0;">MÉTÉO PRÈS DE CHEZ TOI</h3>
          <p style="font-size:22px;margin:10px 0;">
            ${temp}°C • ${vent} km/h vent • ${pluie ? 'Pluie' : nuages ? 'Nuageux' : 'Soleil'} • ${pression} hPa
          </p>
          <div style="background:#003366;padding:20px;border-radius:12px;margin:15px 0;font-size:20px;">
            <b>MEILLEUR LEURRE MAINTENANT :</b><br>
            ${conseil.lures?.[0] || "Jerkbait 12cm naturel"}<br>
            <i>${conseil.lures?.[1] || ""}</i>
            <i>${conseil.lures?.[2] || ""}</i>
          </div>
          <p style="color:#888;font-size:14px;margin-top:20px;">
            Conditions envoyées à l'IA : "${conditionsText}"
          </p>
        `;
      } catch (e) {
        el('weatherResult').innerHTML = "Erreur réseau — réessaie dans 10s";
      }
    }, () => {
      el('weatherResult').innerHTML = "Active la localisation pour un conseil 100% précis";
    });
  });
  // === SYSTÈME DE QUÊTES XP RÉEL (automatique + tableau de bord) ===
  const today = new Date().toDateString();
  const completedQuests = JSON.parse(localStorage.getItem('completedQuests') || '{}');
  function completeQuest(questId, xpReward) {
    if (completedQuests[today]?.includes(questId)) {
      alert("Quête déjà accomplie aujourd'hui !");
      return;
    }
    if (!completedQuests[today]) completedQuests[today] = [];
    completedQuests[today].push(questId);
    localStorage.setItem('completedQuests', JSON.stringify(completedQuests));
    awardXP(xpReward, `Quête accomplie ! +${xpReward} XP`);
    const btn = document.querySelector(`#quest${questId} button`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Accomplie ✓";
      btn.style.background = "#006600";
    }
  }
  function checkCompletedQuests() {
    if (completedQuests[today]) {
      completedQuests[today].forEach(id => {
        const btn = document.querySelector(`#quest${id} button`);
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Accomplie ✓";
          btn.style.background = "#006600";
        }
      });
    }
  }
  if (localStorage.getItem('lastQuestDay') !== today) {
    localStorage.setItem('lastQuestDay', today);
  }
  document.addEventListener('DOMContentLoaded', checkCompletedQuests);
  // === CONNEXION GOOGLE + PROFIL FIRESTORE ===
  if (typeof firebase !== 'undefined') {
    const firebaseConfig = {
      apiKey: "AIzaSyBrPTS4cWiSX6-gi-NVjQ3SJYLoAWzr8Xw",
      authDomain: "fisher-forceai.firebaseapp.com",
      databaseURL: "https://fisher-forceai-default-rtdb.firebaseio.com",
      projectId: "fisher-forceai",
      storageBucket: "fisher-forceai.firebasestorage.app",
      messagingSenderId: "293964630939",
      appId: "1:293964630939:web:c96b2cb554922397e96f3e",
      measurementId: "G-EEYWH9SES8"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    window.db = db;
    window.currentUser = null;
    auth.onAuthStateChanged(user => {
      window.currentUser = user;
      if (user) {
        el('loginBtn').style.display = 'none';
        el('userInfo').style.display = 'flex';
        const savedPseudo = localStorage.getItem('fisherPseudo') || user.displayName.split(' ')[0];
        el('pseudoInput').value = savedPseudo;
        const userNameEl = el('userName');
        if (userNameEl) userNameEl.textContent = savedPseudo;
        const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
        db.collection('users').doc(user.uid).set({
          displayName: savedPseudo,
          xp: progress.xp || 0,
          level: level,
          uid: user.uid,
          email: user.email || "",
          photoURL: user.photoURL || "",
          lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        el('savePseudo')?.addEventListener('click', () => {
          const newPseudo = el('pseudoInput').value.trim();
          if (newPseudo && newPseudo.length >= 2) {
            localStorage.setItem('fisherPseudo', newPseudo);
            if (userNameEl) userNameEl.textContent = newPseudo;
            db.collection('users').doc(user.uid).update({ displayName: newPseudo });
          }
        });
      } else {
        el('loginBtn').style.display = 'block';
        el('userInfo').style.display = 'none';
      }
    });
    el('loginBtn')?.addEventListener('click', () => {
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    });
    el('logoutBtn')?.addEventListener('click', () => auth.signOut());
  }
  const friendsBtn = document.getElementById('friendsBtn');
  if (friendsBtn) {
    friendsBtn.addEventListener('click', () => {
      window.open('friends.html', '_blank', 'width=600,height=800');
    });
  }
  updateDashboard();
});

// === STATISTIQUES PERSONNELLES AVANCÉES (basées sur XP, conseils, poissons map) ===
function updateStatsAfterAdvice(adviceData) {
  let stats = JSON.parse(localStorage.getItem('fisherAdvancedStats') || '{}');
  stats.totalAdvice = (stats.totalAdvice || 0) + 1;
  stats.adviceBySpecies = stats.adviceBySpecies || {};
  stats.adviceBySpecies[adviceData.species] = (stats.adviceBySpecies[adviceData.species] || 0) + 1;
  stats.favoriteLures = stats.favoriteLures || {};
  const mainLure = adviceData.lures[0] || "Inconnu";
  stats.favoriteLures[mainLure] = (stats.favoriteLures[mainLure] || 0) + 1;
  localStorage.setItem('fisherAdvancedStats', JSON.stringify(stats));
}
function updateStatsAfterFishOnMap(species) {
  let stats = JSON.parse(localStorage.getItem('fisherAdvancedStats') || '{}');
  stats.totalFishOnMap = (stats.totalFishOnMap || 0) + 1;
  stats.fishOnMapBySpecies = stats.fishOnMapBySpecies || {};
  stats.fishOnMapBySpecies[species] = (stats.fishOnMapBySpecies[species] || 0) + 1;
  localStorage.setItem('fisherAdvancedStats', JSON.stringify(stats));
}
function showAdvancedStats() {
  if (currentSubscription !== 'premium') {
    requireSubscription('premium', 'Statistiques avancées');
    return;
  }
  const stats = JSON.parse(localStorage.getItem('fisherAdvancedStats') || '{}');
  const xp = progress.xp || 0;
  let topSpecies = "Aucune";
  let topSpeciesCount = 0;
  if (stats.adviceBySpecies) {
    for (const [species, count] of Object.entries(stats.adviceBySpecies)) {
      if (count > topSpeciesCount) {
        topSpecies = species;
        topSpeciesCount = count;
      }
    }
  }
  let topLure = "Aucun";
  let topLureCount = 0;
  if (stats.favoriteLures) {
    for (const [lure, count] of Object.entries(stats.favoriteLures)) {
      if (count > topLureCount) {
        topLure = lure;
        topLureCount = count;
      }
    }
  }
  let topFishMap = "Aucun";
  let topFishMapCount = 0;
  if (stats.fishOnMapBySpecies) {
    for (const [species, count] of Object.entries(stats.fishOnMapBySpecies)) {
      if (count > topFishMapCount) {
        topFishMap = species;
        topFishMapCount = count;
      }
    }
  }
  const display = document.getElementById('advancedStatsDisplay');
  display.style.display = 'block';
  display.innerHTML = `
    <div style="background:#003366;padding:20px;border-radius:15px;text-align:left;">
      <h4 style="color:#ffd700;text-align:center;margin-bottom:20px;">Tes stats Premium</h4>
      <p><strong>XP total :</strong> ${xp} points</p>
      <p><strong>Conseils demandés :</strong> ${stats.totalAdvice || 0}</p>
      <p><strong>Espèce la plus demandée :</strong> ${topSpecies} (${topSpeciesCount})</p>
      <p><strong>Leurre le plus conseillé :</strong> ${topLure} (${topLureCount})</p>
      <p><strong>Poissons placés sur la map :</strong> ${stats.totalFishOnMap || 0}</p>
      <p><strong>Espèce la plus placée sur map :</strong> ${topFishMap} (${topFishMapCount})</p>
      <p style="color:#00ff9d;text-align:center;margin-top:30px;font-size:18px;font-weight:bold;">
        Tu es un vrai traqueur ! Continue comme ça 🔥
      </p>
    </div>
  `;
}
// === JOURNAL DE PÊCHE PERSONNEL ===
document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('openJournalBtn');
  const modal = document.getElementById('journalModal');
  const closeBtn = document.getElementById('closeJournalBtn');
  const entriesDiv = document.getElementById('journalEntries');

  if (!openBtn || !modal || !closeBtn || !entriesDiv) return;

  openBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    displayJournalEntries();
  });

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  function displayJournalEntries() {
    const sessions = JSON.parse(localStorage.getItem('fishingSessions') || '[]');
   
    if (sessions.length === 0) {
      entriesDiv.innerHTML = '<p style="text-align:center;color:#888;font-size:20px;">Aucune session enregistrée pour l’instant...<br>Enregistre tes prises et bredouilles pour remplir ton journal !</p>';
      return;
    }

    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = '';
    sessions.forEach(session => {
      const date = new Date(session.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const successEmoji = session.success ? '🎣' : '😔';
      const poidsText = session.poids > 0 ? `${session.poids}g` : 'Bredouille';

      html += `
        <div style="background:#003366;padding:20px;border-radius:15px;margin:15px 0;">
          <p style="margin:0 0 10px;color:#00ff9d;font-weight:bold;font-size:20px;">
            ${successEmoji} ${session.success ? 'Prise !' : 'Bredouille'} — ${date}
          </p>
          <p style="margin:5px 0;"><strong>Espèce :</strong> ${session.species || 'Aucune'}</p>
          <p style="margin:5px 0;"><strong>Poids :</strong> ${poidsText}</p>
          <p style="margin:5px 0;"><strong>Spot :</strong> ${session.spot}</p>
          <p style="margin:5px 0;"><strong>Leurre :</strong> ${session.lure}</p>
          <p style="margin:5px 0;color:#aaa;font-size:14px;">Par ${session.pseudo}</p>
        </div>
      `;
    });

    entriesDiv.innerHTML = html;
  }
});

// === LISTE NOIRE DES LEURRES (blacklist en cas de bredouille) ===
function blacklistLureOnFailure(species, lureUsed, conditions, structure, spotType, temperature) {
  if (!lureUsed || lureUsed === "Inconnu") return;

  let failedLures = JSON.parse(localStorage.getItem('fisherFailedLures') || '{}');
  
  const key = `${(species || "inconnu").toLowerCase()}_${(conditions || "inconnu").toLowerCase()}_${(structure || "inconnu").toLowerCase()}_${(spotType || "étang").toLowerCase()}_${Math.round(temperature || 15)}`;
  
  if (!failedLures[key]) failedLures[key] = [];
  const lureName = lureUsed.split(' — ')[0].trim();
  if (!failedLures[key].includes(lureName)) {
    failedLures[key].push(lureName);
    localStorage.setItem('fisherFailedLures', JSON.stringify(failedLures));
    console.log(`Leurre "${lureName}" blacklisté pour ${key}`);
  }
}

function getFailedLures(species, conditions, structure, spotType, temperature) {
  const key = `${(species || "inconnu").toLowerCase()}_${(conditions || "inconnu").toLowerCase()}_${(structure || "inconnu").toLowerCase()}_${(spotType || "étang").toLowerCase()}_${Math.round(temperature || 15)}`;
  const failedLures = JSON.parse(localStorage.getItem('fisherFailedLures') || '{}');
  return failedLures[key] || [];
}

// === POP-UP "LEURRE BLACKLISTÉ" (s’affiche avec le +XP en cas de bredouille) ===
function showBlacklistPop(lureName) {
  const pop = document.createElement('div');
  pop.innerHTML = `<strong style="font-size:28px;">🚫 LEURRE BLACKLISTÉ</strong><br><span style="font-size:20px;">${lureName}</span>`;
  pop.style.cssText = `
    position:fixed;
    top:28%;
    left:50%;
    transform:translateX(-50%);
    background:linear-gradient(45deg,#e74c3c,#ff6b00);
    color:white;
    padding:20px 50px;
    border-radius:70px;
    z-index:99999;
    box-shadow:0 20px 50px rgba(231,76,60,0.8);
    animation:pop 2.2s forwards;
    text-align:center;
    font-weight:bold;
  `;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 2200);
}
// Bouton Activer Premium (déjà dans ton profil)
document.getElementById('premium-button').addEventListener('click', () => {
  const code = prompt('🔑 Entrez votre code Premium :');
  if (!code) return;

  fetch('/api/activate-premium', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': localStorage.getItem('token')
    },
    body: JSON.stringify({ code: code.trim().toUpperCase() })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('🎉 ' + data.message);
      // Refresh profil
      location.reload();
    } else {
      alert('❌ ' + data.error);
    }
  })
  .catch(() => alert('Erreur réseau'));
});
// === COMMANDE VOCALE INTELLIGENTE (français, remplissage auto des champs) ===
document.addEventListener('DOMContentLoaded', () => {
  const voiceBtn = document.getElementById('voiceCommandBtn');
  const status = document.getElementById('voiceStatus');

  if (!voiceBtn) return;

  // Vérifie si le navigateur supporte la reconnaissance vocale
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.style.display = 'none';
    console.warn("Reconnaissance vocale non supportée sur ce navigateur");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR'; // Français
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  voiceBtn.addEventListener('click', () => {
    status.textContent = 'Écoute en cours... parle !';
    voiceBtn.style.background = '#ff6b00'; // Orange pendant écoute
    recognition.start();
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    console.log("Phrase reconnue :", transcript);
    status.textContent = `Analysé : "${transcript}"`;

    // === PARSING INTELLIGENT DE LA PHRASE ===
    const words = transcript.split(/\s+/);

    // Mots clés par champ
    const speciesKeywords = {
      brochet: ['brochet', 'bec', 'pike','broc'],
      perche: ['perche', 'perches','perchette','perch','zébrées'],
      sandre: ['sandre', 'zander'],
      blackbass: ['blackbass', 'black-bass', 'bass', 'achigan','diable vert'],
      chevesne: ['chevesne', 'chevenne','chub','chubby','cheub','cheubby'],
      aspe: ['aspe'],
      silure: ['silure', 'catfish','glane','moustachu'],
      truite: ['truite', 'truites','trout']
    };

    const structureKeywords = {
      nénuphars: ['nénuphars', 'nénuphar', 'nénufar', 'lily pads'],
      herbiers: ['herbiers', 'herbe', 'herbes', 'weeds'],
      bois: ['bois', 'branchage','bois noyés', 'branches', 'snags', 'wood'],
      arbre: ['arbre', 'arbres','arbuste', 'fallen tree'],
      tombants: ['tombants', 'drop off', 'cassures'],
      rochers: ['rochers','cailloux','pierreux','pierre', 'rocks'],
      gravier: ['gravier', 'gravel'],
      fond: ['fond', 'bottom']
    };

    const conditionsKeywords = {
      pluie: ['pluie', 'pluvieux', 'rain'],
      nuageux: ['nuageux','couvert', 'nuages', 'cloudy'],
      soleil: ['soleil', 'ensoleillé', 'sunny', 'clair','dégagé'],
      vent: ['vent', 'venteux', 'windy'],
      nuit: ['nuit', 'soirée', 'night', 'crépuscule']
    };

    let detectedSpecies = "";
    let detectedStructure = "";
    let detectedConditions = "";

    // Détection espèce
    for (const [key, keywords] of Object.entries(speciesKeywords)) {
      if (keywords.some(k => words.includes(k))) {
        detectedSpecies = key.charAt(0).toUpperCase() + key.slice(1);
        break;
      }
    }

    // Détection structure (prend le premier match)
    for (const [key, keywords] of Object.entries(structureKeywords)) {
      if (keywords.some(k => words.includes(k))) {
        detectedStructure = key.charAt(0).toUpperCase() + key.slice(1);
        break;
      }
    }

    // Détection conditions (cumule plusieurs si besoin)
    for (const [key, keywords] of Object.entries(conditionsKeywords)) {
      if (keywords.some(k => words.includes(k))) {
        if (detectedConditions) detectedConditions += " ";
        detectedConditions += key;
      }
    }

    // === REMPLISSAGE AUTO DES CHAMPS ===
    if (detectedSpecies && el('targetSpecies')) {
      el('targetSpecies').value = detectedSpecies;
    }
    if (detectedStructure && el('structure')) {
      el('structure').value = detectedStructure;
    }
    if (detectedConditions && el('conditions')) {
      el('conditions').value = detectedConditions;
    }

    // Si on a détecté au moins un champ → lance automatiquement le conseil
    if (detectedSpecies || detectedStructure || detectedConditions) {
      status.textContent = 'Champs remplis → conseil en cours...';
      voiceBtn.style.background = '#00d4aa';
      el('getAdvice')?.click(); // Déclenche le conseil automatiquement
    } else {
      status.textContent = 'Pas compris, réessaie !';
      voiceBtn.style.background = '#e74c3c';
    }
  };

  recognition.onerror = (event) => {
    status.textContent = 'Erreur écoute, réessaie';
    voiceBtn.style.background = '#e74c3c';
    console.error("Erreur reconnaissance vocale :", event.error);
  };

  recognition.onend = () => {
    voiceBtn.style.background = 'linear-gradient(45deg, #00d4aa, #009977)';
    if (status.textContent.includes('Écoute en cours')) {
      status.textContent = 'Clique et parle !';
    }
  };
});

// Appelle ces fonctions aux bons endroits :
// Après un conseil IA : updateStatsAfterAdvice({ species: species, lures: conseil.lures });
// Après placement poisson sur map : updateStatsAfterFishOnMap(speciesName);
