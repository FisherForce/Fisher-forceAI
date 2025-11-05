const el = id => document.getElementById(id);

// === LECTURE SÉCURISÉE DU FORMULAIRE ===
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
    fishingTime: el('fishingTime')?.value || "08:00",
    allowSponsors: el('allowSponsors')?.checked || false
  };
}

// === AFFICHAGE DES CONSEILS ===
function renderAdvice(data) {
  const container = el('advice');
  if (!container) return;
  container.innerHTML = '';

  if (data.adviceText) {
    const div = document.createElement('div');
    div.innerHTML = `<h3>Résumé (IA)</h3><div class="advice-text">${data.adviceText}</div>`;
    container.appendChild(div);
  }

  if (data.lures && data.lures.length > 0) {
    const div = document.createElement('div');
    div.innerHTML = `
      <h3>Leurres & Techniques conseillés</h3>
      <ul>
        ${data.lures.map(item => `<li><strong>${item.split(' — ')[0]}</strong> — ${item.split(' — ').slice(1).join(' — ')}</li>`).join('')}
      </ul>
    `;
    container.appendChild(div);
  }

  if (data.depthAdvice && data.depthAdvice.length > 0) {
    const div = document.createElement('div');
    div.innerHTML = `
      <h3>Profondeur recommandée</h3>
      <ul>
        ${data.depthAdvice.map(d => `<li>${d}</li>`).join('')}
      </ul>
    `;
    container.appendChild(div);
  }

  if (!data.lures?.length && !data.depthAdvice?.length && !data.adviceText) {
    container.innerHTML = '<p class="muted">Aucun conseil spécifique trouvé. Varie les techniques !</p>';
  }

  const voiceControls = el('voiceControls');
  if (voiceControls) voiceControls.style.display = 'block';

  setTimeout(() => speakAdvice(container.innerHTML), 800);
}

// === APPEL API ===
async function fetchAdvice(input) {
  try {
    const API_BASE = window.location.origin;
    const res = await fetch(`${API_BASE}/api/advice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!res.ok) throw new Error('Erreur réseau : ' + res.status);
    return await res.json();
  } catch (err) {
    console.error("Erreur dans fetchAdvice :", err);
    alert("Erreur réseau ou serveur. Vérifie la connexion.");
    return null;
  }
}

// === BOUTON CONSEILS ===
const getAdviceBtn = el('getAdvice');
if (getAdviceBtn) {
  getAdviceBtn.addEventListener('click', async () => {
    const input = readForm();
    const formattedInput = {
      species: input.targetSpecies,
      structure: input.structure,
      conditions: input.conditions,
      spotType: input.waterType,
      temperature: input.temperature
    };

    const adviceEl = el('advice');
    if (adviceEl) adviceEl.innerHTML = '<p class="muted">Génération des conseils…</p>';

    const result = await fetchAdvice(formattedInput);
    if (!result || result.error) {
      if (adviceEl) {
        adviceEl.innerHTML = `<p class="muted">Erreur: ${result?.error || "Impossible d'obtenir les conseils."}</p>`;
      }
      return;
    }

    renderAdvice(result);
    saveLastAdvice(formattedInput.species, formattedInput.spotType, formattedInput.conditions, formattedInput.structure);
  });
}

// === RÉINITIALISER ===
const clearBtn = el('clearBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    ['spotName', 'structure', 'targetSpecies', 'dateTime', 'conditions', 'temperature'].forEach(id => {
      const elem = el(id);
      if (elem) elem.value = '';
    });
    const pressureEl = el('pressure');
    if (pressureEl) pressureEl.value = 'medium';
    const waterTypeEl = el('waterType');
    if (waterTypeEl) waterTypeEl.value = 'Étang';
    const fishingTimeEl = el('fishingTime');
    if (fishingTimeEl) fishingTimeEl.value = '08:00';
    const adviceEl = el('advice');
    if (adviceEl) {
      adviceEl.innerHTML = '<p class="muted">Remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
    }
    const voiceControls = el('voiceControls');
    if (voiceControls) voiceControls.style.display = 'none';
  });
}

// === COMMANDE VOCALE ===
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const voiceBtn = el('voiceBtn');
  const micIcon = el('micIcon');

  if (voiceBtn && micIcon) {
    voiceBtn.addEventListener('click', () => {
      micIcon.textContent = 'Microphone On';
      micIcon.style.animation = 'pulse 1.5s infinite';
      recognition.start();
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      micIcon.textContent = 'Microphone';
      micIcon.style.animation = '';
      console.log('Voix détectée :', transcript);
      parseVoiceCommand(transcript);
    };

    recognition.onerror = () => {
      micIcon.textContent = 'Microphone';
      micIcon.style.animation = '';
      alert('Erreur micro. Vérifie les permissions.');
    };

    recognition.onend = () => {
      micIcon.textContent = 'Microphone';
      micIcon.style.animation = '';
    };
  }
} else {
  const voiceBtn = el('voiceBtn');
  if (voiceBtn) voiceBtn.style.display = 'none';
}

// === ANALYSE COMMANDE VOCALE ===
function parseVoiceCommand(text) {
  text = text.replace(/[^a-z0-9° ]/g, ' ').replace(/\s+/g, ' ');

  const speciesMap = { 'perche': 'perche', 'brochet': 'brochet', 'sandre': 'sandre', 'carpe': 'carpe', 'truite': 'truite', 'black bass': 'bass', 'bass': 'bass' };
  for (const [key, value] of Object.entries(speciesMap)) {
    if (text.includes(key)) {
      const elem = el('targetSpecies');
      if (elem) elem.value = value;
      break;
    }
  }

  const spotMap = { 'rivière': 'Rivière', 'étang': 'Étang', 'lac': 'Lac', 'canal': 'Canal' };
  for (const [key, value] of Object.entries(spotMap)) {
    if (text.includes(key)) {
      const elem = el('waterType');
      if (elem) elem.value = value;
      break;
    }
  }

  const condMap = { 'nuages': 'nuages', 'soleil': 'soleil', 'pluie': 'pluie', 'vent': 'vent', 'clair': 'clair', 'brouillard': 'brouillard' };
  for (const [key, value] of Object.entries(condMap)) {
    if (text.includes(key)) {
      const elem = el('conditions');
      if (elem) elem.value = value;
      break;
    }
  }

  const tempMatch = text.match(/(\d+) ?°?c?/);
  if (tempMatch) {
    const elem = el('temperature');
    if (elem) elem.value = tempMatch[1];
  }

  const timeMatch = text.match(/(\d+) ?h(heure)?s?/);
  if (timeMatch) {
    const h = timeMatch[1].padStart(2, '0');
    const elem = el('fishingTime');
    if (elem) elem.value = `${h}:00`;
  }

  const structureWords = ['herbier', 'rocher', 'bois', 'nénuphar', 'branchage', 'pont', 'arbre'];
  for (const word of structureWords) {
    if (text.includes(word)) {
      const elem = el('structure');
      if (elem) elem.value = word + 's';
      break;
    }
  }

  const speciesEl = el('targetSpecies');
  const condEl = el('conditions');
  if ((speciesEl && speciesEl.value) || (condEl && condEl.value)) {
    const getAdviceBtn = el('getAdvice');
    if (getAdviceBtn) getAdviceBtn.click();
  } else {
    alert('Dis-moi au moins l’espèce et les conditions ! Ex: "Perche, rivière, nuages"');
  }
}

// === SYNTHÈSE VOCALE ===
let currentUtterance = null;

function speakAdvice(html) {
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }

  const cleanText = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'fr-FR';
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voices = speechSynthesis.getVoices();
  const frenchVoice = voices.find(v => v.lang === 'fr-FR' || v.lang.startsWith('fr')) || voices[0];
  if (frenchVoice) utterance.voice = frenchVoice;

  utterance.onstart = () => {
    const speakBtn = el('speakBtn');
    if (speakBtn) speakBtn.textContent = 'En cours...';
  };

  utterance.onend = () => {
    const speakBtn = el('speakBtn');
    if (speakBtn) speakBtn.textContent = 'Lire les conseils';
  };

  utterance.onerror = () => {
    alert('Erreur de lecture vocale.');
    const speakBtn = el('speakBtn');
    if (speakBtn) speakBtn.textContent = 'Lire les conseils';
  };

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
}

const speakBtn = el('speakBtn');
if (speakBtn) {
  speakBtn.addEventListener('click', () => {
    const adviceHTML = el('advice')?.innerHTML || '';
    speakAdvice(adviceHTML);
  });
}

const stopBtn = el('stopBtn');
if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    speechSynthesis.cancel();
    const speakBtn = el('speakBtn');
    if (speakBtn) speakBtn.textContent = 'Lire les conseils';
  });
}

speechSynthesis.onvoiceschanged = () => {
  speechSynthesis.getVoices();
};

// === ANIMATION MICRO ===
const style = document.createElement('style');
style.textContent = `
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;
document.head.appendChild(style);

// === INIT ===
const adviceEl = el('advice');
if (adviceEl) {
  adviceEl.innerHTML = '<p class="muted">Remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
}

// === SYSTÈME DE COMPTE & PROGRESSION ===
let currentUser = null;
let userDocRef = null;

auth.onAuthStateChanged(async (user) => {
  const loginBtn = el('loginBtn');
  const userInfo = el('userInfo');
  const userName = el('userName');

  if (user) {
    currentUser = user;
    userDocRef = db.collection('users').doc(user.uid);
    userName.textContent = user.displayName.split(' ')[0];
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';

    await loadUserProgress();
    updateDashboard();
  } else {
    currentUser = null;
    loginBtn.style.display = 'block';
    userInfo.style.display = 'none';
    loadLocalProgress();
    updateDashboard();
  }
});

el('loginBtn')?.addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
});

el('logoutBtn')?.addEventListener('click', () => {
  auth.signOut();
});

const defaultProgress = {
  xp: 0,
  spotsTested: 0,
  speciesCaught: {},
  successes: 0,
  attempts: 0
};

let progress = { ...defaultProgress };

async function loadUserProgress() {
  if (!currentUser) return;
  const doc = await userDocRef.get();
  if (doc.exists) {
    progress = doc.data();
  } else {
    await userDocRef.set(defaultProgress);
  }
}

function loadLocalProgress() {
  const saved = localStorage.getItem('userProgress');
  if (saved) progress = JSON.parse(saved);
}

function saveProgress() {
  if (currentUser) {
    userDocRef.set(progress);
  } else {
    localStorage.setItem('userProgress', JSON.stringify(progress));
  }
  updateDashboard();
}

// === AJOUT XP (appelable depuis popup) ===
window.addXP = async function(success = false) {
  progress.xp += 5;
  progress.spotsTested += 1;
  progress.attempts += 1;
  if (success) {
    progress.successes += 1;
    const species = el('targetSpecies')?.value || "inconnu";
    progress.speciesCaught[species] = (progress.speciesCaught[species] || 0) + 1;
  }
  saveProgress();
  showXPPop();
};

// === POP-UP +5 XP ===
function showXPPop() {
  const pop = document.createElement('div');
  pop.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: #00d4aa; color: white; padding: 20px 30px; border-radius: 20px;
    font-size: 24px; font-weight: bold; z-index: 10000;
    animation: xpPop 1s ease-out forwards;
  `;
  pop.textContent = '+5 XP !';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1000);
}

// === TABLEAU DE BORD ===
function updateDashboard() {
  const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
  const successRate = progress.attempts > 0 ? Math.round((progress.successes / progress.attempts) * 100) : 0;

  const dashboardHTML = `
    <div style="background: linear-gradient(135deg, #00d4aa, #00a085); color: white; padding: 15px; border-radius: 12px; margin: 20px 0; text-align: center;">
      <h3 style="margin: 0 0 10px 0; font-size: 18px;">
        <span style="background: #ffd700; color: #000; padding: 5px 10px; border-radius: 20px; font-weight: bold;">${level}</span> — ${progress.xp} XP
      </h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-top: 10px;">
        <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 8px;">Spots : <strong>${progress.spotsTested}</strong></div>
        <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 8px;">Espèces : <strong>${Object.keys(progress.speciesCaught).length}</strong></div>
        <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 8px;">Réussite : <strong>${successRate}%</strong></div>
      </div>
    </div>
  `;

  let dashboard = document.querySelector('.dashboard');
  if (dashboard) {
    dashboard.outerHTML = dashboardHTML;
  } else {
    const outputCard = document.querySelector('.output-card h2');
    if (outputCard) outputCard.insertAdjacentHTML('afterend', dashboardHTML);
  }
}

// === OUVRIR resultat.html EN POPUP + COMMUNICATION ===
window.openResultat = function() {
  const popup = window.open('resultat.html', 'resultat', 'width=500,height=400,scrollbars=no,resizable=no');
  if (!popup) {
    alert("Popup bloquée ! Autorise les popups pour ce site.");
  }
};

// Réception du message depuis resultat.html
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data && event.data.type === 'ADD_XP') {
    addXP(event.data.success);
  }
});

// === ANIMATION XP ===
const xpStyle = document.createElement('style');
xpStyle.textContent = `
@keyframes xpPop {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 0; }
}
`;
document.head.appendChild(xpStyle);
