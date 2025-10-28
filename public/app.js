

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
const res = await fetch('/api/advice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    species,
    structure,
    conditions,
    spotType,
    temperature
  })
});

      
    });
    if (!res.ok) throw new Error('Erreur réseau');
    return await res.json();
  } catch (e) {
    return { error: e.message || 'Erreur' };
  }
}

el('getAdvice').addEventListener('click', async () => {
  const input = readForm();
  el('advice').innerHTML = '<p class="muted">Génération des conseils…</p>';
  const result = await fetchAdvice(input);
  if (result.error) {
    el('advice').innerHTML = `<p class="muted">Erreur: ${result.error}</p>`;
    return;
  }
  renderAdvice(result);
});

el('clearBtn').addEventListener('click', () => {
  ['spotName', 'structure', 'targetSpecies', 'dateTime', 'conditions'].forEach(id => el(id).value = '');
  el('pressure').value = 'medium';
  el('waterType').value = 'Étang';
  el('advice').innerHTML = '<p class="muted">Aucun conseil demandé pour le moment — remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
});

el('advice').innerHTML = '<p class="muted">Aucun conseil demandé pour le moment — remplis le formulaire puis clique sur "Obtenir des conseils".</p>';
