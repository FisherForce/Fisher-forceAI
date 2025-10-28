

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

  const blocks = [
    { title: 'Heures conseillées', items: data.times },
    { title: 'Catégories de leurres', items: data.lureCategories },
    { title: 'Animations recommandées', items: data.animations },
    { title: 'Couleurs conseillées', items: data.colors }
  ];

  blocks.forEach(b => {
    const div = document.createElement('div');
    div.innerHTML = `<h3>${b.title}</h3><ul>${b.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
    container.appendChild(div);
  });

  if (data.sponsorMatches?.length) {
    const s = document.createElement('div');
    s.innerHTML = `<h3>Références sponsorisées (autorisées)</h3><ul>${data.sponsorMatches.map(sp => `<li>${sp.brand}: ${sp.models.join(', ')}</li>`).join('')}</ul>`;
    container.appendChild(s);
  }
}


async function fetchAdvice(input) {
  try {
const API_BASE = window.location.origin; // fonctionne en local ET sur Render
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
    console.error("❌ Erreur dans fetchAdvice :", err);
    alert("Erreur réseau ou serveur. Vérifie la connexion ou le backend.");
    return null;
  }
}


el('getAdvice').addEventListener('click', async () => {
  const input = readForm();

  // ✅ Vérification et conversion des champs pour le backend
// NOUVEAU CODE CORRIGÉ
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

  } catch (err) {
    console.error("❌ Erreur pendant fetchAdvice :", err);
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
