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
  container.innerHTML = '';

  if (data.adviceText) {
    const p = document.createElement('div');
    p.innerHTML = `<h3>Résumé (IA)</h3><div class="advice-text">${data.adviceText}</div>`;
    container.appendChild(p);
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
el('getAdvice')?.addEventListener('click', async () => {
  const input = readForm();
  const formattedInput = {
    species: input.targetSpecies,
    structure: input.structure,
    conditions: input.conditions,
    spotType: input.waterType,
    temperature: input.temperature
  };

  el('advice').innerHTML = '<p class="muted">Génération des conseils…</p>';

  const result = await fetchAdvice(formattedInput);
  if (!result || result.error) {
    el('advice').innerHTML = `<p class="muted">Erreur: ${result?.error || "Impossible d'obtenir les conseils."}</p>`;
    return;
  }

  renderAdvice(result);
  saveLastAdvice(formattedInput.species, formattedInput.spotType, formattedInput.conditions, formattedInput.structure);
});

// === RÉINITIALISER ===
el('clearBtn')?.addEventListener('click', () => {
  ['spotName', 'structure', 'targetSpecies', 'dateTime', 'conditions', 'temperature'].forEach(id => {
    const elem = el(id);
    if (elem) elem.value = '';
  });
  el('pressure') && (el('pressure').value = 'medium');
  el('waterType') && (el('waterType').value = 'Étang');
  el('fishingTime') && (el('fishingTime').value = '08:00');
  el('advice').innerHTML = '<p class="muted">Remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
});

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
  for (const [key, value] of Object.entries(socialMap)) {
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

  const speciesElem = el('targetSpecies');
  const condElem = el('conditions');
  if ((speciesElem && speciesElem.value) || (condElem && condElem.value)) {
    el('getAdvice')?.click();
  } else {
    alert('Dis-moi au moins l’espèce et les conditions ! Ex: "Perche, rivière, nuages"');
  }
}

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
const adviceElem = el('advice');
if (adviceElem) {
  adviceElem.innerHTML = '<p class="muted">Remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
}
