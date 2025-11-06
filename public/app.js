const el = id => document.getElementById(id);

// === TOUTES LES FONCTIONS (conseils, voix, etc.) ===
function readForm() {
  return {
    spotName: el('spotName')?.value || "",
    waterType: el('waterType')?.value || "Étang",
    structure: el('structure')?.value || "",
    pressure: el('pressure')?.value || "medium",
    targetSpecies: el('targetSpecies')?.value || "",
    dateTime: el('dateTime')?.value || "",
    conditions: el('conditions')?.value || "",
    temperature: parseFloat(el('temperature')?.value) || null,
    fishingTime: el('fishingTime')?.value || "08:00"
  };
}

function renderAdvice(data) {
  const container = el('advice');
  if (!container) return;
  container.innerHTML = '';
  if (data.adviceText) container.innerHTML += `<h3>Résumé (IA)</h3><div class="advice-text">${data.adviceText}</div>`;
  if (data.lures?.length) {
    container.innerHTML += `<h3>Leurres & Techniques</h3><ul>${data.lures.map(l => `<li><strong>${l.split(' — ')[0]}</strong> — ${l.split(' — ').slice(1).join(' — ')}</li>`).join('')}</ul>`;
  }
  if (data.depthAdvice?.length) {
    container.innerHTML += `<h3>Profondeur</h3><ul>${data.depthAdvice.map(d => `<li>${d}</li>`).join('')}</ul>`;
  }
  if (!container.innerHTML.includes('<ul') && !data.adviceText) container.innerHTML = '<p class="muted">Varie les techniques !</p>';
const voiceControls = el('voiceControls');
if (voiceControls) voiceControls.style.display = 'block';
  setTimeout(() => speakAdvice(container.innerHTML), 800);
}

async function fetchAdvice(input) {
  try {
    const res = await fetch(`${location.origin}/api/advice`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch { alert("Pas de réseau"); return null; }
}

el('getAdvice')?.addEventListener('click', async () => {
  const input = readForm();
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
  saveLastAdvice(formatted.species, formatted.spotType, formatted.conditions, formatted.structure);
});

el('clearBtn')?.addEventListener('click', () => {
  ['spotName','structure','targetSpecies','dateTime','conditions','temperature'].forEach(id => el(id).value = '');
  el('pressure').value = 'medium';
  el('waterType').value = 'Étang';
  el('fishingTime').value = '08:00';
  el('advice').innerHTML = '<p class="muted">Remplis le formulaire…</p>';
const voiceControls = el('voiceControls');
if (voiceControls) voiceControls.style.display = 'none';
});

// === COMMANDE VOCALE ===
if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'fr-FR';
  const voiceBtn = el('voiceBtn');
  const micIcon = el('micIcon');
  voiceBtn?.addEventListener('click', () => {
    micIcon.textContent = 'Microphone On';
    recognition.start();
  });
  recognition.onresult = e => {
    const text = e.results[0][0].transcript.toLowerCase();
    micIcon.textContent = 'Microphone';
    parseVoiceCommand(text);
  };
  recognition.onerror = () => micIcon.textContent = 'Microphone';
  recognition.onend = () => micIcon.textContent = 'Microphone';
}

// === PARSE VOCAL ===
function parseVoiceCommand(text) {
  const maps = {
    species: {perche:'perche', brochet:'brochet', sandre:'sandre', carpe:'carpe', truite:'truite', bass:'bass'},
    spot: {rivière:'Rivière', étang:'Étang', lac:'Lac', canal:'Canal'},
    cond: {nuage:'nuages', soleil:'soleil', pluie:'pluie', vent:'vent', clair:'clair'}
  };
  for (const [map, dict] of Object.entries(maps)) {
    for (const [key, val] of Object.entries(dict)) {
      if (text.includes(key)) {
        const field = map === 'spot' ? 'waterType' : map === 'cond' ? 'conditions' : 'targetSpecies';
        el(field).value = val;
      }
    }
  }
  if (text.match(/(\d+) ?°/)) el('temperature').value = text.match(/(\d+)/)[1];
  if (el('targetSpecies').value || el('conditions').value) el('getAdvice').click();
}

// === SYNTHÈSE VOCALE ===
function speakAdvice(html) {
  speechSynthesis.cancel();
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}
el('speakBtn')?.addEventListener('click', () => speakAdvice(el('advice').innerHTML));
el('stopBtn')?.addEventListener('click', () => speechSynthesis.cancel());

// === INIT ===
el('advice').innerHTML = '<p class="muted">Remplis le formulaire…</p>';

// === XP + COMPTE GOOGLE (100 % SANS ERREUR) ===
document.addEventListener('DOMContentLoaded', () => {
  if (typeof firebase === 'undefined') {
    console.warn("Firebase pas chargé → mode anonyme activé");
    initAnonymousMode();
    return;
  }

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
    } catch {
      loadLocalProgress();
    }
  }

  function loadLocalProgress() {
    const saved = localStorage.getItem('fisherXP');
    if (saved) progress = JSON.parse(saved);
  }

  function saveAll() {
    localStorage.setItem('fisherXP', JSON.stringify(progress));
    if (currentUser) userDocRef?.set(progress, { merge: true }).catch(() => {});
    updateDashboard();
  }

  window.addXP = (success = false) => {
    progress.xp += 5;
    progress.spotsTested += 1;
    progress.attempts += 1;
    if (success) {
      progress.successes += 1;
      const sp = el('targetSpecies')?.value || "inconnu";
      progress.speciesCaught[sp] = (progress.speciesCaught[sp] || 0) + 1;
    }
    saveAll();
    const pop = document.createElement('div');
    pop.textContent = '+5 XP !';
    pop.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#00d4aa;color:white;padding:20px 40px;border-radius:20px;font-size:28px;font-weight:bold;z-index:9999;animation:pop 1s forwards;';
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
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
    const existing = document.querySelector('.dashboard');
    if (existing) existing.outerHTML = html;
    else document.querySelector('.output-card h2')?.insertAdjacentHTML('afterend', html);
  }

  window.openResultat = () => window.open('resultat.html', '_blank', 'width=500,height=600');

  // Mode anonyme si Firebase mort
  function initAnonymousMode() {
    el('loginBtn').style.display = 'none';
    el('userInfo').style.display = 'none';
    loadLocalProgress();
    updateDashboard();
  }

  // Animation XP (une seule fois !)
  if (!document.getElementById('xpAnim')) {
    const s = document.createElement('style');
    s.id = 'xpAnim';
    s.textContent = '@keyframes pop{0%{transform:scale(0)}50%{transform:scale(1.3)}100%{transform:scale(1);opacity:0}}';
    document.head.appendChild(s);
  }
});
