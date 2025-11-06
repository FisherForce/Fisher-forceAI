const el = id => document.getElementById(id);

// === VARIABLES GLOBALES ===
let progress = { xp: 0, spotsTested: 0, speciesCaught: {}, successes: 0, attempts: 0 };
let knownSpots = new Set();
let knownSpecies = new Set();

// === CHARGEMENT LOCAL ===
function loadAll() {
  const p = localStorage.getItem('fisherXP');
  const s = localStorage.getItem('knownSpots');
  const e = localStorage.getItem('knownSpecies');
  if (p) progress = JSON.parse(p);
  if (s) knownSpots = new Set(JSON.parse(s));
  if (e) knownSpecies = new Set(JSON.parse(e));
}
loadAll();

// === XP DOPAMINE ===
function awardXP(amount, message) {
  progress.xp += amount;
  saveAll();
  showXPPop(`+${amount} XP ! ${message}`);
}

function showXPPop(text) {
  const pop = document.createElement('div');
  pop.innerHTML = `<strong>${text}</strong>`;
  pop.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:#00d4aa;color:white;padding:18px 40px;border-radius:50px;font-size:24px;font-weight:bold;z-index:9999;box-shadow:0 10px 30px rgba(0,212,170,0.7);animation:pop 1.5s forwards;';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1500);
}

function saveAll() {
  localStorage.setItem('fisherXP', JSON.stringify(progress));
  localStorage.setItem('knownSpots', JSON.stringify([...knownSpots]));
  localStorage.setItem('knownSpecies', JSON.stringify([...knownSpecies]));
  updateDashboard();
}

function updateDashboard() {
  const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
  const rate = progress.attempts ? Math.round((progress.successes / progress.attempts) * 100) : 0;
  const html = `
    <div style="background:linear-gradient(135deg,#00d4aa,#00a085);color:white;padding:20px;border-radius:18px;margin:20px 0;text-align:center;box-shadow:0 10px 30px rgba(0,212,170,0.4);">
      <h3 style="margin:0 0 15px;font-size:22px;">
        <span style="background:#ffd700;color:#000;padding:8px 18px;border-radius:40px;font-weight:bold;">${level}</span> — ${progress.xp} XP
      </h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:15px;">
        <div style="background:rgba(255,255,255,0.3);padding:12px;border-radius:12px;">Spots<br><strong style="font-size:20px;">${progress.spotsTested}</strong></div>
        <div style="background:rgba(255,255,255,0.3);padding:12px;border-radius:12px;">Espèces<br><strong style="font-size:20px;">${Object.keys(progress.speciesCaught).length}</strong></div>
        <div style="background:rgba(255,255,255,0.3);padding:12px;border-radius:12px;">Réussite<br><strong style="font-size:20px;">${rate}%</strong></div>
      </div>
    </div>`;
  const dash = document.querySelector('.dashboard');
  if (dash) dash.outerHTML = html;
}

// === TOUT LE CODE PRINCIPAL ===
document.addEventListener('DOMContentLoaded', () => {
  updateDashboard();

  // Animation XP
  if (!document.getElementById('xpAnim')) {
    const s = document.createElement('style');
    s.id = 'xpAnim';
    s.textContent = '@keyframes pop{0%{transform:scale(0) translateX(-50%);opacity:0}40%{transform:scale(1.5) translateX(-50%)}100%{transform:scale(1) translateX(-50%);opacity:0}}';
    document.head.appendChild(s);
  }

  // === OBTENIR DES CONSEILS ===
  el('getAdvice')?.addEventListener('click', async () => {
    const input = readForm();
    const spotName = (input.spotName || "").trim().toLowerCase();

    awardXP(1, "Conseil demandé !");
    if (spotName && !knownSpots.has(spotName)) {
      knownSpots.add(spotName);
      awardXP(10, "Nouveau spot découvert !");
    }

    el('advice').innerHTML = '<p class="muted">Génération en cours…</p>';
    const result = await fetchAdvice({
      species: input.targetSpecies,
      structure: input.structure,
      conditions: input.conditions,
      spotType: input.waterType,
      temperature: input.temperature
    });

    if (!result || result.error) {
      el('advice').innerHTML = `<p class="muted">Erreur: serveur indisponible</p>`;
      return;
    }
    renderAdvice(result);
  });

  // === RÉINITIALISER ===
  el('clearBtn')?.addEventListener('click', () => {
    ['spotName','structure','targetSpecies','conditions','temperature'].forEach(id => el(id).value = '');
    el('waterType').value = 'Étang';
    el('advice').innerHTML = '<p class="muted">Remplis le formulaire…</p>';
    const vc = el('voiceControls');
    if (vc) vc.style.display = 'none';
  });

  // === ADD XP DEPUIS RESULTAT.HTML ===
  window.addXP = function(success = false, speciesName = null) {
    progress.spotsTested += 1;
    progress.attempts += 1;
    awardXP(5, success ? "Prise validée !" : "Spot testé");

    if (success) {
      progress.successes += 1;
      const species = (speciesName || el('targetSpecies')?.value || "inconnu").toLowerCase();
      if (!knownSpecies.has(species)) {
        knownSpecies.add(species);
        awardXP(15, `Première ${species} ! LÉGENDAIRE !`);
      }
      progress.speciesCaught[species] = (progress.speciesCaught[species] || 0) + 1;
    }
    saveAll();
  };

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
    const container = el('advice');
    container.innerHTML = '';
    if (data.adviceText) container.innerHTML += `<h3>Résumé IA</h3><div class="advice-text">${data.adviceText}</div>`;
    if (data.lures?.length) container.innerHTML += `<h3>Leurres</h3><ul>${data.lures.map(l => `<li><strong>${l.split(' — ')[0]}</strong> — ${l.split(' — ').slice(1).join(' — ')}</li>`).join('')}</ul>`;
    const vc = el('voiceControls');
    if (vc) vc.style.display = 'block';
  }

  async function fetchAdvice(input) {
    try {
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      return await res.json();
    } catch (e) {
      console.log("API HS, mode démo");
      return {
        adviceText: "Varie les leurres souples en 10cm, pêche à gratter près des herbiers.",
        lures: ["Spinnerbait 14g — Zones peu profondes", "Jig 10g — Fond rocheux"]
      };
    }
  }

  window.openResultat = () => window.open('resultat.html', '_blank', 'width=500,height=600');
});
