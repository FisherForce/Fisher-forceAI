const el = id => document.getElementById(id);
// === VARIABLES GLOBALES ===
let progress = { xp: 0, speciesCaught: {}, successes: 0, attempts: 0 };
let knownSpots = new Set(); // stocke les spotKey (ex: "47200,-15500")
let knownSpecies = new Set();

// === LIMITATION 5 CONSEILS/JOUR ===
let dailyAdviceCount = parseInt(localStorage.getItem('dailyAdviceCount') || '0');
let lastAdviceDate = localStorage.getItem('lastAdviceDate') || '';

// RESET QUOTIDIEN
function resetDailyCount() {
  const today = new Date().toDateString();
  if (lastAdviceDate !== today) {
    dailyAdviceCount = 0;
    lastAdviceDate = today;
    localStorage.setItem('dailyAdviceCount', '0');
    localStorage.setItem('lastAdviceDate', today);
  }
}
resetDailyCount();

// === LIMITATION 6 RÉSULTATS/JOUR ===
let dailyResultCount = parseInt(localStorage.getItem('dailyResultCount') || '0');
let lastResultDate = localStorage.getItem('lastResultDate') || '';

function resetDailyResultCount() {
  const today = new Date().toDateString();
  if (lastResultDate !== today) {
    dailyResultCount = 0;
    lastResultDate = today;
    localStorage.setItem('dailyResultCount', '0');
    localStorage.setItem('lastResultDate', today);
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
  const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
  const rate = progress.attempts ? Math.round((progress.successes / progress.attempts) * 100) : 0;
  dashboard.innerHTML = `
    <h3><span class="level-badge">${level}</span> — <span id="xp">${progress.xp}</span> XP</h3>
    <div class="stats-grid">
      <div class="stat-item">Spots : <strong>${knownSpots.size}</strong></div>
      <div class="stat-item">Espèces : <strong>${Object.keys(progress.speciesCaught).length}</strong></div>
      <div class="stat-item">Réussite : <strong>${rate}%</strong></div>
    </div>`;
}

// === TOUT LE CODE ===
document.addEventListener('DOMContentLoaded', () => {
  // Animation XP
  if (!document.getElementById('xpAnim')) {
    const s = document.createElement('style');
    s.id = 'xpAnim';
    s.textContent = '@keyframes pop{0%{transform:scale(0) translateX(-50%)}40%{transform:scale(1.7) translateX(-50%)}100%{transform:scale(1) translateX(-50%);opacity:0}}';
    document.head.appendChild(s);
  }

  // === CONSEILS + XP + LIMITATION 5/JOUR ===
  el('getAdvice')?.addEventListener('click', async () => {
    // === LIMITATION 5 CONSEILS/JOUR ===
    if (dailyAdviceCount >= 5) {
      alert("Limite de 5 conseils par jour atteinte ! Reviens demain pour plus d'aventure.");
      return;
    }
    dailyAdviceCount++;
    localStorage.setItem('dailyAdviceCount', dailyAdviceCount.toString());
    localStorage.setItem('lastAdviceDate', new Date().toDateString());

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
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          species: input.targetSpecies,
          structure: input.structure,
          conditions: input.conditions,
          spotType: input.waterType,
          temperature: input.temperature
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
  });

  // === RÉINITIALISER ===
  el('clearBtn')?.addEventListener('click', () => {
    ['spotName','structure','targetSpecies','conditions','temperature'].forEach(id => el(id).value = '');
    el('waterType').value = 'Étang';
    el('advice').innerHTML = '<p class="muted">Remplis le formulaire…</p>';
    el('voiceControls') && (el('voiceControls').style.display = 'none');
  });

  // === OUVRIR POPUP ===
  window.openResultat = () => {
    const spot = el('spotName')?.value.trim() || "Spot inconnu";
    window.open(`resultat.html?spot=${encodeURIComponent(spot)}`, '_blank', 'width=500,height=700');
  };

  // === RÉCEPTION DES DONNÉES DEPUIS resultat.html ===
  window.addEventListener('message', async (e) => {
    if (e.data?.type === 'ADD_XP') {

      // === LIMITATION 6 RÉSULTATS/JOUR ===
      if (dailyResultCount >= 6) {
        alert("Limite de 6 sessions enregistrées par jour atteinte ! Reviens demain pour plus de gloire.");
        return;
      }
      dailyResultCount++;
      localStorage.setItem('dailyResultCount', dailyResultCount.toString());
      localStorage.setItem('lastResultDate', new Date().toDateString());

      const { success, speciesName, spotName, lure } = e.data;

      // === ENVOI AU SERVEUR POUR APPRENTISSAGE ===
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
              anglerName: pseudo
            })
          });
          console.log("Session envoyée à l'IA → apprentissage en cours");
        } catch (err) {
          console.warn("Échec envoi session IA", err);
        }
      }

      if (success) {
        awardXP(5, "Prise validée !");
      } else {
        awardXP(5, "Session enregistrée");
      }

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

  // === CONNEXION GOOGLE + PROFIL FIRESTORE ===
  if (typeof firebase !== 'undefined') {
    const firebaseConfig = {
      apiKey: "AIzaSyBrPTS4cWiSX6-gi-NVjQ3SJYLoAWzr8Xw",
      authDomain: "fisher-forceai.firebaseapp.com",
      projectId: "fisher-forceai",
      storageBucket: "fisher-forceai.firebasestorage.app",
      messagingSenderId: "293964630939",
      appId: "1:293964630939:web:063ed88456613a33e96f3e"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    auth.onAuthStateChanged(user => {
      if (user) {
        el('loginBtn').style.display = 'none';
        el('userInfo').style.display = 'flex';
        const savedPseudo = localStorage.getItem('fisherPseudo') || user.displayName.split(' ')[0];
        el('pseudoInput').value = savedPseudo;
        el('userName').textContent = savedPseudo;
        const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
        db.collection('users').doc(user.uid).set({
          displayName: savedPseudo,
          xp: progress.xp || 0,
          level: level,
          uid: user.uid,
          email: user.email || "",
          photoURL: user.photoURL || "",
          lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
        .then(() => console.log("Profil sync Firestore"))
        .catch(err => console.error("Erreur profil :", err));
        const saveBtn = el('savePseudo');
        if (saveBtn) {
          saveBtn.onclick = () => {
            const newPseudo = el('pseudoInput').value.trim();
            if (newPseudo && newPseudo.length >= 2) {
              localStorage.setItem('fisherPseudo', newPseudo);
              el('userName').textContent = newPseudo;
              db.collection('users').doc(user.uid).update({ displayName: newPseudo })
                .then(() => alert(`Pseudo changé : ${newPseudo} !`))
                .catch(err => alert("Erreur : " + err.message));
            } else {
              alert("Pseudo trop court !");
            }
          };
        }
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

  // BOUTON AMIS
  const friendsBtn = document.getElementById('friendsBtn');
  if (friendsBtn) {
    friendsBtn.addEventListener('click', () => {
      window.open('friends.html', '_blank', 'width=600,height=800');
    });
  }

  // === DASHBOARD INITIAL (APRÈS DOM) ===
  updateDashboard();
});
