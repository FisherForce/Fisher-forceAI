// script.js — TOUTES LES FONCTIONS MANQUANTES
async function updateLiveBadge() {
  try {
    const res = await fetch('/api/learnedPatterns');
    const data = await res.json();
    let total = 0;
    for (const species in data) {
      for (const saison in data[species]) {
        for (const cond in data[species][saison]) {
          for (const spot in data[species][saison][cond]) {
            total += data[species][saison][cond][spot].length;
          }
        }
      }
    }
    document.getElementById('patternCount').textContent = total;
  } catch (e) {
    document.getElementById('patternCount').textContent = '—';
  }
}

async function updateLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    if (data.length === 0) {
      document.getElementById('leaderboard').innerHTML = '<p>Aucun pêcheur classé !</p>';
      return;
    }
    let html = '<ol style="text-align:left; margin:0; padding-left:20px;">';
    data.forEach((p, i) => {
      html += `<li><strong>${p.name}</strong> — ${p.count} prises</li>`;
    });
    html += '</ol>';
    document.getElementById('leaderboard').innerHTML = html;
  } catch (e) {
    document.getElementById('leaderboard').innerHTML = '<p>Erreur</p>';
  }
}

async function showStats() {
  const btn = document.getElementById('statsBtn');
  btn.disabled = true; btn.innerHTML = "Chargement...";
  try {
    const res = await fetch('/api/learnedPatterns');
    const data = await res.json();
    let total = 0;
    for (const species in data) {
      for (const saison in data[species]) {
        for (const cond in data[species][saison]) {
          for (const spot in data[species][saison][cond]) {
            total += data[species][saison][cond][spot].length;
          }
        }
      }
    }
    document.getElementById('stats').innerHTML = `
      <div style="background:#f0fff9;padding:15px;border-radius:10px;border:2px solid #00d4aa;">
        <h3 style="margin:0;color:#00a085;">IA en action !</h3>
        <p><strong>Patterns appris :</strong> <span style="color:#00d4aa;font-size:1.2em;">${total}</span></p>
      </div>
    `;
  } catch (e) {
    document.getElementById('stats').innerHTML = '<p style="color:red;">Erreur</p>';
  }
  btn.disabled = false; btn.innerHTML = "Voir mes stats d'IA";
}

// Lancement auto
setInterval(updateLiveBadge, 10000);
setInterval(updateLeaderboard, 15000);
updateLiveBadge();
updateLeaderboard();
