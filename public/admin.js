const el = id => document.getElementById(id);

async function fetchSponsors(key) {
  try {
    const res = await fetch('/api/sponsors', { headers: { 'x-admin-key': key } });
    if (!res.ok) throw new Error('Unauthorized or network error');
    return await res.json();
  } catch (e) {
    throw e;
  }
}

async function addSponsor(key, sponsor) {
  try {
    const res = await fetch('/api/sponsors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: JSON.stringify(sponsor)
    });
    if (!res.ok) throw new Error('Failed to add sponsor');
    return await res.json();
  } catch (e) {
    throw e;
  }
}

async function deleteSponsor(key, brand) {
  try {
    const res = await fetch('/api/sponsors/' + encodeURIComponent(brand), {
      method: 'DELETE', headers: { 'x-admin-key': key }
    });
    if (!res.ok) throw new Error('Failed to delete sponsor');
    return await res.json();
  } catch (e) {
    throw e;
  }
}

async function renderList(key) {
  const listEl = el('sponsorList');
  try {
    const sponsors = await fetchSponsors(key);
    if (!Array.isArray(sponsors)) throw new Error('Invalid response');
    if (sponsors.length === 0) { listEl.innerHTML = '<p class="muted">Aucun sponsor</p>'; return; }
    const html = sponsors.map(s => {
      const models = (s.models || []).join(', ');
      const species = (s.species || []).join(', ');
      return `<div style="margin-bottom:8px;"><strong>${s.brand}</strong> — Modèles: ${models} — Espèces: ${species} <button data-brand="${s.brand}" class="del">Supprimer</button></div>`;
    }).join('');
    listEl.innerHTML = html;
    document.querySelectorAll('.del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const brand = e.target.dataset.brand;
        if (!confirm('Supprimer ' + brand + ' ?')) return;
        try {
          await deleteSponsor(key, brand);
          await renderList(key);
        } catch (err) {
          alert('Erreur: ' + err.message);
        }
      });
    });
  } catch (e) {
    listEl.innerHTML = '<p class="muted">Erreur: ' + (e.message || e) + '</p>';
  }
}

el('addSponsor').addEventListener('click', async () => {
  const key = el('adminKey').value.trim();
  if (!key) return alert('Ajoute la clé admin');
  const brand = el('brand').value.trim();
  const models = el('models').value.split(',').map(s=>s.trim()).filter(Boolean);
  const species = el('species').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!brand) return alert('Marque requise');
  try {
    await addSponsor(key, { brand, models, species, allowed: true });
    el('brand').value = ''; el('models').value = ''; el('species').value = '';
    await renderList(key);
  } catch (e) {
    alert('Erreur: ' + (e.message || e));
  }
});

// Try to render list if admin key exists in localStorage
const savedKey = localStorage.getItem('fishing_admin_key');
if (savedKey) {
  el('adminKey').value = savedKey;
  renderList(savedKey);
}

el('adminKey').addEventListener('change', () => {
  const key = el('adminKey').value.trim();
  if (key) localStorage.setItem('fishing_admin_key', key);
});
