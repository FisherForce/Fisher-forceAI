const el = id => document.getElementById(id);

function readForm() {
  return {
    spotName: el('spotName').value,
    waterType: el('waterType').value,
    structure: el('structure').value,
    pressure: el('pressure').value,
    targetSpecies: el('targetSpecies').value,
    dateTime: el('dateTime').value,
    conditions: el('conditions').value,
    allowSponsors: el('allowSponsors').checked
  };
}

function renderAdvice(data) {
  const container = el('advice');
  container.innerHTML = '';

  if (data.adviceText) {
    const p = document.createElement('div');
    p.innerHTML = `<h3>Résumé (IA)</h3><div class="advice-text">${data.adviceText}</div>`;
    container.appendChild(p);
  }

  // --- Leurres principaux ---
  if (data.lures && data.lures.length > 0) {
    const div = document.createElement('div');
    div.innerHTML = `
      <h3>Leurres & Techniques conseillés</h3>
      <ul>
        ${data.lures.map(item => `<li><strong>${item.split(', ')[0]}</strong> — ${item.split(', ').slice(1).join(', ')}</li>`).join('')}
      </ul>
    `;
    container.appendChild(div);
  }

  // --- Profondeur selon température ---
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

  // --- Message par défaut si rien ---
  if (!data.lures?.length && !data.depthAdvice?.length && !data.adviceText) {
    container.innerHTML = '<p class="muted">Aucun conseil spécifique trouvé. Varie les techniques !</p>';
  }
}

async function fetchAdvice(input) {
  try {
    const API_BASE = window.location.origin;
    const res = await fetch(`${API_BASE}/api/advice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!res.ok) {
      throw new Error('Erreur réseau : ' + res.status);
    }

    const data = await res.json();
    return data;

  } catch (err) {
    console.error("Erreur dans fetchAdvice :", err);
    alert("Erreur réseau ou serveur. Vérifie la connexion ou le backend.");
    return null;
  }
}

el('getAdvice').addEventListener('click', async () => {
  const input = readForm();

  // Conversion des champs pour le backend
  const formattedInput = {
    species: input.targetSpecies || "",
    structure: input.structure || "",
    conditions: input.conditions || "",
    spotType: input.waterType || "",
    temperature: null
  };

  el('advice').innerHTML = '<p class="muted">Génération des conseils…</p>';

  try {
    const result = await fetchAdvice(formattedInput);

    if (!result || result.error) {
      el('advice').innerHTML = `<p class="muted">Erreur: ${result?.error || "Impossible d'obtenir les conseils."}</p>`;
      return;
    }

    renderAdvice(result);

    // SAUVEGARDE DU CONSEIL POUR L’APPRENTISSAGE
    saveLastAdvice(
      formattedInput.species,
      formattedInput.spotType,
      formattedInput.conditions,
      formattedInput.structure
    );

  } catch (err) {
    console.error("Erreur pendant fetchAdvice :", err);
    el('advice').innerHTML = `<p class="muted">Erreur réseau ou serveur.</p>`;
  }
});

el('clearBtn').addEventListener('click', () => {
  ['spotName', 'structure', 'targetSpecies', 'dateTime', 'conditions'].forEach(id => el(id).value = '');
  el('pressure').value = 'medium';
  el('waterType').value = 'Étang';
  el('advice').innerHTML = '<p class="muted">Aucun conseil demandé pour le moment — remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
});

el('advice').innerHTML = '<p class="muted">Aucun conseil demandé pour le moment — remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
