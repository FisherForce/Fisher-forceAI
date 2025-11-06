const el = id => document.getElementById(id);

// === HISTORIQUE POUR NOUVEAUX SPOTS & ESPÈCES ===
let knownSpots = new Set();
let knownSpecies = new Set();

// Charge l'historique depuis localStorage
function loadHistory() {
  const spots = localStorage.getItem('knownSpots');
  const species = localStorage.getItem('knownSpecies');
  if (spots) knownSpots = new Set(JSON.parse(spots));
  if (species) knownSpecies = new Set(JSON.parse(species));
}
loadHistory();

// === FONCTIONS XP BOOSTÉES ===
function awardXP(amount, message) {
  progress.xp += amount;
  saveAll();
  showXPPop(`+${amount} XP ! ${message}`);
}

function showXPPop(text) {
  const pop = document.createElement('div');
  pop.innerHTML = `<strong>${text}</strong>`;
  pop.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:#00d4aa;color:white;padding:16px 32px;border-radius:50px;font-size:20px;font-weight:bold;z-index:9999;box-shadow:0 8px 20px rgba(0,212,170,0.5);animation:pop 1.2s forwards;';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1200);
}

// === CONSEILS → +1 XP à chaque demande ===
el('getAdvice')?.addEventListener('click', async () => {
  const input = readForm();
  const spotName = (input.spotName || "").trim().toLowerCase();

  // +1 XP à chaque demande de conseil
  awardXP(1, "Conseil demandé !");

  // +10 XP si nouveau spot
  if (spotName && !knownSpots.has(spotName)) {
    knownSpots.add(spotName);
    localStorage.setItem('knownSpots', JSON.stringify([...knownSpots]));
    awardXP(10, "Nouveau spot découvert !");
  }

  const formatted = {
    species: input.targetSpecies,
    structure: input.structure,
    conditions: input.conditions,
    spotType: input.waterType,
    temperature: input.temperature
  };
  el('advice').innerHTML = '<p class="muted">Génération…</p>';
  const result = await fetchAdvice(formatted);
  if (result?.error) {
    el('advice').innerHTML = `<p class="muted">Erreur: ${result.error}</p>`;
    return;
  }
  renderAdvice(result);
});

// === NOUVELLE ESPÈCE DEPUIS resultat.html → +15 XP ===
window.addXP = function(success = false, speciesName = null) {
  progress.xp += 5;
  progress.spotsTested += 1;
  progress.attempts += 1;

  if (success) {
    progress.successes += 1;
    const species = (speciesName || el('targetSpecies')?.value || "inconnu").toLowerCase();
    progress.speciesCaught[species] = (progress.speciesCaught[species] || 0) + 1;

    // +15 XP si première fois cette espèce
    if (!knownSpecies.has(species)) {
      knownSpecies.add(species);
      localStorage.setItem('knownSpecies', JSON.stringify([...knownSpecies]));
      awardXP(15, `Première prise de ${species.charAt(0).toUpperCase() + species.slice(1)} !`);
    }
  }
  saveAll();
  showXPPop(success ? "+5 XP ! Prise validée !" : "+5 XP ! Spot testé");
};

// === LE RESTE DU CODE (inchangé mais propre) ===
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
  const container = el('advice');
  if (!container) return;
  container.innerHTML = '';
  if (data.adviceText) container.innerHTML += `<h3>Résumé (IA)</h3><div class="advice-text">${data.adviceText}</div>`;
  if (data.lures?.length) container.innerHTML += `<h3>Leurres & Techniques</h3><ul>${data.lures.map(l => `<li><strong>${l.split(' — ')[0]}</strong> — ${l.split(' — ').slice(1).join(' — ')}</li>`).join('')}</ul>`;
  if (data.depthAdvice?.length) container.innerHTML += `<h3>Profondeur</h3><ul>${data.depthAdvice.map(d => `<li>${d}</li>`).join('')}</ul>`;
  if (!container.innerHTML.includes('<ul') && !data.adviceText) container.innerHTML = '<p class="muted">Varie les techniques !</p>';
  const voiceControls = el('voiceControls');
  if (voiceControls) voiceControls.style.display = 'block';
  setTimeout(() => speakAdvice(container.innerHTML), 800);
}

async function fetchAdvice(input) {
  try {
    const res = await fetch(`${location.origin}/api/advice`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input) });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch { alert("Pas de réseau"); return null; }
}

el('clearBtn')?.addEventListener('click', () => {
  ['spotName','structure','targetSpecies','conditions','temperature'].forEach(id => el(id).value = '');
  el('waterType').value = 'Étang';
  el('advice').innerHTML = '<p class="muted">Remplis le formulaire…</p>';
  const voiceControls = el('voiceControls');
  if (voiceControls) voiceControls.style.display = 'none';
});

function speakAdvice(html) {
  speechSynthesis.cancel();
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
}
el('speakBtn')?.addEventListener('click', () => speakAdvice(el('advice').innerHTML));

// === DASHBOARD + FIREBASE (inchangé mais boosté) ===
document.addEventListener('DOMContentLoaded', () => {
  loadHistory(); // recharge les spots/espèces connus

  if (typeof firebase === 'undefined') return console.warn("Mode anonyme");

  const auth = firebase.auth();
  const db = firebase.firestore();
  let currentUser = null;
  let userDocRef = null;
  const defaultProgress = { xp: 0, spotsTested: 0, speciesCaught: {}, successes: 0, attempts: 0 };
  let progress = { ...defaultProgress };

  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      userDocRef = db.collection('users').doc(user.uid);
      el('userName').textContent = user.displayName?.split(' ')[0] || "Pêcheur";
      el('loginBtn').style.display = 'none';
      el('userInfo').style.display = 'flex';
      await tryLoadProgress();
    } else {
      currentUser = null;
      el('loginBtn').style.display = 'block';
      el('userInfo').style.display = 'none';
      loadLocalProgress();
    }
    updateDashboard();
  });

  el('loginBtn')?.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
  });

  el('logoutBtn')?.addEventListener('click', () => auth.signOut());

  async function tryLoadProgress() {
    try {
      const doc = await userDocRef.get({ source: 'cache' });
      progress = doc.exists ? doc.data() : { ...defaultProgress };
    } catch { loadLocalProgress(); }
  }

  function loadLocalProgress() {
    const saved = localStorage.getItem('fisherXP');
    if (saved) progress = JSON.parse(saved);
  }

  window.saveAll = function() {
    localStorage.setItem('fisherXP', JSON.stringify(progress));
    if (currentUser) userDocRef?.set(progress, { merge: true }).catch(() => {});
    updateDashboard();
  };

  function updateDashboard() {
    const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
    const rate = progress.attempts ? Math.round(progress.successes / progress.attempts * 100) : 0;
    const html = `
      <div style="background:linear-gradient(135deg,#00d4aa,#00a085);color:white;padding:18px;border-radius:16px;margin:20px 0;text-align:center;box-shadow:0 8px 20px rgba(0,212,170,0.3);">
        <h3 style="margin:0 0 12px;font-size:20px;">
          <span style="background:#ffd700;color:#000;padding:6px 14px;border-radius:30px;font-weight:bold;">${level}</span> — ${progress.xp} XP
        </h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;">
          <div style="background:rgba(255,255,255,0.25);padding:10px;border-radius:10px;">Spots<br><strong style="font-size:18px;">${progress.spotsTested}</strong></div>
          <div style="background:rgba(255,255,255,0.25);padding:10px;border-radius:10px;">Espèces<br><strong style="font-size:18px;">${Object.keys(progress.speciesCaught).length}</strong></div>
          <div style="background:rgba(255,255,255,0.25);padding:10px;border-radius:10px;">Réussite<br><strong style="font-size:18px;">${rate}%</strong></div>
        </div>
      </div>`;
    const dash = document.querySelector('.dashboard');
    if (dash) dash.outerHTML = html;
  }

  // Animation XP (une seule fois)
  if (!document.getElementById('xpAnim')) {
    const s = document.createElement('style');
    s.id = 'xpAnim';
    s.textContent = '@keyframes pop{0%{transform:scale(0)}50%{transform:scale(1.4)}100%{transform:scale(1);opacity:0}}';
    document.head.appendChild(s);
  }
});
