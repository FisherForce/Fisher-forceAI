<div><br class="Apple-interchange-newline">const el = id => document.getElementById(id);
// === VARIABLES GLOBALES ===
let progress = { xp: 0, speciesCaught: {}, successes: 0, attempts: 0 };
let knownSpots = new Set();
let knownSpecies = new Set();

// === LIMITATION 5 CONSEILS/JOUR ===
let dailyAdviceCount = parseInt(localStorage.getItem('dailyAdviceCount') || '0');
let lastAdviceDate = localStorage.getItem('lastAdviceDate') || '';

function resetDailyCount() {
 const today = new Date().toDateString();
 if (lastAdviceDate !== today) {
 dailyAdviceCount = 0;
 lastAdviceDate = today;
 localStorage.setItem('dailyAdviceCount', '0');
 localStorage.setItem('lastAdviceDate', today);
 }
}
resetDailyCount();

// === LIMITATION 6 RÉSULTATS/JOUR ===
let dailyResultCount = parseInt(localStorage.getItem('dailyResultCount') || '0');
let lastResultDate = localStorage.getItem('lastResultDate') || '';

function resetDailyResultCount() {
 const today = new Date().toDateString();
 if (lastResultDate !== today) {
 dailyResultCount = 0;
 lastResultDate = today;
 localStorage.setItem('dailyResultCount', '0');
 localStorage.setItem('lastResultDate', today);
 }
}
resetDailyResultCount();

// === CHARGEMENT LOCAL ===
function loadAll() {
 const data = localStorage.getItem('fisherXP');
 const spots = localStorage.getItem('knownSpots');
 const species = localStorage.getItem('knownSpecies');
 if (data) progress = JSON.parse(data);
 if (spots) knownSpots = new Set(JSON.parse(spots));
 if (species) knownSpecies = new Set(JSON.parse(species));
}
loadAll();

// === XP DOPAMINE PUR ===
function awardXP(amount, message) {
 progress.xp += amount;
 saveAll();
 showXPPop(+${amount} XP ! ${message});
}

function showXPPop(text) {
 const pop = document.createElement('div');
 pop.innerHTML = <strong style="font-size:30px;">${text}</strong>;
 pop.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);background:#00d4aa;color:white;padding:22px 60px;border-radius:70px;z-index:99999;box-shadow:0 20px 50px rgba(0,212,170,0.9);animation:pop 1.8s forwards;';
 document.body.appendChild(pop);
 setTimeout(() => pop.remove(), 1800);
}

function saveAll() {
 localStorage.setItem('fisherXP', JSON.stringify(progress));
 localStorage.setItem('knownSpots', JSON.stringify([...knownSpots]));
 localStorage.setItem('knownSpecies', JSON.stringify([...knownSpecies]));
 updateDashboard();
}

// === DASHBOARD LIVE (SÉCURISÉ) ===
function updateDashboard() {
 const dashboard = document.querySelector('.dashboard');
 if (!dashboard) {
 console.warn("Dashboard non trouvé dans le DOM. Attente...");
 return;
 }
 const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
 const rate = progress.attempts ? Math.round((progress.successes / progress.attempts) * 100) : 0;
 dashboard.innerHTML = <br> <h3><span class="level-badge">${level}</span> — <span id="xp">${progress.xp}</span> XP</h3><br> <div class="stats-grid"><br> <div class="stat-item">Spots : <strong>${knownSpots.size}</strong></div><br> <div class="stat-item">Espèces : <strong>${Object.keys(progress.speciesCaught).length}</strong></div><br> <div class="stat-item">Réussite : <strong>${rate}%</strong></div><br> </div>;
}

// === FONCTION CARTE : SAUVEGARDE GPS DE CHAQUE SESSION ===
function saveSessionToMap(success, speciesName, poids, spotName, lure) {
 if (!navigator.geolocation) {
 console.log("Géolocalisation non supportée");
 return;
 }

 navigator.geolocation.getCurrentPosition(
 (pos) => {
 const session = {
 lat: pos.coords.latitude,
 lng: pos.coords.longitude,
 success,
 species: speciesName || null,
 poids: poids || 0,
 spot: spotName || "Spot inconnu",
 lure: lure || "Inconnu",
 date: new Date().toISOString(),
 pseudo: localStorage.getItem('fisherPseudo') || "Anonyme"
 };

 let sessions = JSON.parse(localStorage.getItem('fishingSessions') || '[]');
 sessions.push(session);
 localStorage.setItem('fishingSessions', JSON.stringify(sessions));
 console.log("Session géolocalisée sauvegardée !", session);
 },
 (err) => {
 console.warn("Impossible d'obtenir la position GPS", err);
 },
 { enableHighAccuracy: true, timeout: 10000 }
 );
}

// === TOUT LE CODE ===
document.addEventListener('DOMContentLoaded', () => {
 if (!document.getElementById('xpAnim')) {
 const s = document.createElement('style');
 s.id = 'xpAnim';
 s.textContent = '@keyframes pop{0%{transform:scale(0) translateX(-50%)}40%{transform:scale(1.7) translateX(-50%)}100%{transform:scale(1) translateX(-50%);opacity:0}}';
 document.head.appendChild(s);
 }

 el('getAdvice')?.addEventListener('click', async () => {
 if (dailyAdviceCount >= 5) {
 alert("Limite de 5 conseils par jour atteinte ! Reviens demain pour plus d'aventure.");
 return;
 }
 dailyAdviceCount++;
 localStorage.setItem('dailyAdviceCount', dailyAdviceCount.toString());
 localStorage.setItem('lastAdviceDate', new Date().toDateString());

 const input = readForm();
 const spotName = (input.spotName || "").trim().toLowerCase();

 awardXP(1, "Conseil demandé !");
 if (spotName && !knownSpots.has(spotName)) {
 knownSpots.add(spotName);
 awardXP(10, "Nouveau spot découvert !");
 }

 el('advice').innerHTML = '<p class="muted">Génération en cours…</p>';

 let result;
 try {
 const res = await fetch('/api/advice', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 species: input.targetSpecies,
 structure: input.structure,
 conditions: input.conditions,
 spotType: input.waterType,
 temperature: input.temperature
 })
 });
 result = await res.json();
 } catch (e) {
 console.log("API HS → mode démo");
 }

 if (!result || result.error) {
 result = {
 adviceText: "Pêche en poids suspendu avec un leurre souple 10cm texan. Varie les couleurs selon la luminosité.",
 lures: ["Texas rig 10g — Herbiers", "Jerkbait 11cm — Eau claire", "Spinnerbait — Vent fort"]
 };
 }

 renderAdvice(result);
 });

 el('clearBtn')?.addEventListener('click', () => {
 ['spotName','structure','targetSpecies','conditions','temperature'].forEach(id => el(id).value = '');
 el('waterType').value = 'Étang';
 el('advice').innerHTML = '<p class="muted">Remplis le formulaire…</p>';
 el('voiceControls') && (el('voiceControls').style.display = 'none');
 });

 window.openResultat = () => {
 const spot = el('spotName')?.value.trim() || "Spot inconnu";
 window.open(resultat.html?spot=${encodeURIComponent(spot)}, '_blank', 'width=500,height=700');
 };

 // === RÉCEPTION DES RÉSULTATS + RÉACTIONS IA + SAUVEGARDE GPS ===
 window.addEventListener('message', async (e) => {
 if (e.data?.type === 'ADD_XP') {
 if (dailyResultCount >= 6) {
 alert("Limite de 6 sessions enregistrées par jour atteinte ! Reviens demain pour plus de gloire.");
 return;
 }
 dailyResultCount++;
 localStorage.setItem('dailyResultCount', dailyResultCount.toString());
 localStorage.setItem('lastResultDate', new Date().toDateString());

 const { success, speciesName, spotName, lure, poids = 0 } = e.data;

 // ENVOI À L'IA
 if (success && speciesName && lure) {
 const input = readForm();
 const pseudo = localStorage.getItem('fisherPseudo') || "Anonyme";
 try {
 await fetch('/api/learn', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 species: speciesName,
 lureUsed: lure,
 resultFish: true,
 spotType: input.waterType || "Étang",
 conditions: input.conditions || "",
 structure: input.structure || "",
 anglerName: pseudo,
 weight: poids
 })
 });
 } catch (err) {
 console.warn("Échec envoi session IA", err);
 }
 }

 if (success) awardXP(5, "Prise validée !");
 else awardXP(5, "Session enregistrée");

 if (spotName && !knownSpots.has(spotName)) {
 knownSpots.add(spotName);
 awardXP(10, "NOUVEAU SPOT CONQUIS !");
 }

 if (success && speciesName && !knownSpecies.has(speciesName)) {
 knownSpecies.add(speciesName);
 awardXP(10, NOUVELLE ESPÈCE : ${speciesName.toUpperCase()} !);
 }

 if (success && speciesName) {
 progress.speciesCaught[speciesName] = (progress.speciesCaught[speciesName] || 0) + 1;
 }

 progress.attempts += 1;
 if (success) progress.successes += 1;
 saveAll();

 // SAUVEGARDE GPS SUR LA CARTE
 saveSessionToMap(success, speciesName || null, poids, spotName || "Spot inconnu", lure || "Inconnu");

 // RÉACTION IA
 if (success && speciesName && poids > 0) {
 showFishReaction(speciesName, poids, false);
 } else if (!success) {
 showFishReaction(null, 0, true);
 }
 }
 });

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
 const c = el('advice');
 c.innerHTML = <h3>Résumé IA</h3><div class="advice-text">${data.adviceText || ""}</div>;
 if (data.lures?.length) {
 c.innerHTML += <h3>Leurres conseillés</h3><ul>${data.lures.map(l => <li><strong>${l.split(' — ')[0]}</strong> — ${l.split(' — ').slice(1).join(' — ')}</li>).join('')}</ul>;
 }
 el('voiceControls') && (el('voiceControls').style.display = 'block');
 }

 // === RÉACTION IA ULTRA VIVANTE (PRISE + BREDOUILLE + CHAMBRAGE) ===
 function showFishReaction(species = null, poidsGram = 0, isBredouille = false) {
 const pseudo = localStorage.getItem('fisherPseudo') || "Pêcheur";
 let bredouilleStreak = parseInt(localStorage.getItem('bredouilleStreak') || '0');
 
 if (isBredouille) {
 bredouilleStreak++;
 localStorage.setItem('bredouilleStreak', bredouilleStreak.toString());
 } else {
 bredouilleStreak = 0;
 localStorage.setItem('bredouilleStreak', '0');
 }

 let message = "";
 let bgColor = "#00d4aa";

 if (!isBredouille && species && poidsGram > 0) {
 const poids = poidsGram / 1000;
 const key = pb_${species};
 const ancienPB = parseFloat(localStorage.getItem(key)) || 0;

 if (poids >= 10) {
 message = ${pseudo} TU VIENS DE SORTIR UN MONSTRE ABSOLU ! ${species.toUpperCase()} de ${poids.toFixed(2)} KG !!;
 bgColor = "#ff0066";
 } else if (poids >= 7) {
 message = MONSTRE VALIDÉ ! ${species.toUpperCase()} à ${poids.toFixed(2)} kg ! T’es une légende !;
 bgColor = "#ff0066";
 } else if (poids >= 4) {
 message = GROS GROS ${species} à ${poids.toFixed(2)} kg ! T’as défoncé la moyenne !;
 bgColor = "#ff6b00";
 } else if (poids >= 2) {
 message = Très joli ${species} de ${poids.toFixed(2)} kg ! T’es chaud !;
 } else {
 message = Beau ${species} de ${poidsGram}g ! Chaque poisson compte !;
 }

 if (poidsGram > ancienPB) {
 localStorage.setItem(key, poidsGram.toString());
 message += \n\nRECORD PERSONNEL PULVÉRISÉ !\nAncien : ${ancienPB ? (ancienPB/1000).toFixed(2)+"kg" : "aucun"}\nNouveau : ${poids.toFixed(2)} kg !;
 bgColor = "#ffd700";
 }

 } else if (isBredouille) {
 const messages = [
 ["C’est pas grave, ça arrive même aux meilleurs", "La prochaine sera la bonne", "Allez, rembobine et on recommence !"],
 ["T’as oublié d’ouvrir les yeux ?", "T’as mis de l’anti-poisson sur ton leurre ?", "Les canards se moquent de toi"],
 ["Franchement, t’es sûr que t’as une canne ?", "T’as pensé à mettre un hameçon ?", "Là c’est du jardinage"],
 ["OK là t’abuses. T’es NUL.", "Je doute de tes talents", "Donne-moi ta canne, je vais le faire"],
 ["T’as battu le record du monde de bredouilles", "Même un enfant de 5 ans ferait mieux", "Je t’appelle « Monsieur Bredouille » désormais"]
 ];

 let niveau = Math.min(Math.floor(bredouilleStreak / 3), 4);
 message = messages[niveau][Math.floor(Math.random() * messages[niveau].length)];

 if (bredouilleStreak === 5) message = "5 bredouilles d’affilée… T’es en train de battre un record";
 if (bredouilleStreak === 10) message = "10… DIX… T’as un don pour ne rien prendre";
 if (bredouilleStreak >= 15) message = "OK je capitule. T’es le roi de la bredouille. Respect.";

 bgColor = "#e74c3c";
 }

 const pop = document.createElement('div');
 pop.innerHTML = <strong style="font-size:26px; text-shadow: 2px 2px 10px black; line-height:1.5;"><br> ${message.replace(/\n\n/g, '<br><br>')}<br> </strong>;
 pop.style.cssText = <br> position:fixed; top:15%; left:50%; transform:translateX(-50%);<br> background:${bgColor}; color:white; padding:30px 50px; border-radius:25px;<br> z-index:99999; box-shadow:0 30px 80px rgba(0,0,0,0.7); text-align:center;<br> max-width:90%; font-weight:bold; animation:pop 3.5s forwards;<br> ;
 document.body.appendChild(pop);
 setTimeout(() => pop.remove(), 8000);
 }

 // === CONNEXION GOOGLE + PROFIL FIRESTORE ===
 if (typeof firebase !== 'undefined') {
 const firebaseConfig = {
 apiKey: "AIzaSyBrPTS4cWiSX6-gi-NVjQ3SJYLoAWzr8Xw",
 authDomain: "fisher-forceai.firebaseapp.com",
 databaseURL: "https://fisher-forceai-default-rtdb.firebaseio.com",
 projectId: "fisher-forceai",
 storageBucket: "fisher-forceai.firebasestorage.app",
 messagingSenderId: "293964630939",
 appId: "1:293964630939:web:c96b2cb554922397e96f3e",
 measurementId: "G-EEYWH9SES8"
 };
 firebase.initializeApp(firebaseConfig);
 const auth = firebase.auth();
 const db = firebase.firestore();

 window.db = db;
 window.currentUser = null;

 auth.onAuthStateChanged(user => {
 window.currentUser = user;
 if (user) {
 el('loginBtn').style.display = 'none';
 el('userInfo').style.display = 'flex';
 const savedPseudo = localStorage.getItem('fisherPseudo') || user.displayName.split(' ')[0];
 el('pseudoInput').value = savedPseudo;
 const userNameEl = el('userName');
 if (userNameEl) userNameEl.textContent = savedPseudo;

 const level = progress.xp < 50 ? "Débutant" : progress.xp < 200 ? "Traqueur" : "Maître du brochet";
 db.collection('users').doc(user.uid).set({
 displayName: savedPseudo,
 xp: progress.xp || 0,
 level: level,
 uid: user.uid,
 email: user.email || "",
 photoURL: user.photoURL || "",
 lastSeen: firebase.firestore.FieldValue.serverTimestamp()
 }, { merge: true });

 el('savePseudo')?.addEventListener('click', () => {
 const newPseudo = el('pseudoInput').value.trim();
 if (newPseudo && newPseudo.length >= 2) {
 localStorage.setItem('fisherPseudo', newPseudo);
 if (userNameEl) userNameEl.textContent = newPseudo;
 db.collection('users').doc(user.uid).update({ displayName: newPseudo });
 }
 });
 } else {
 el('loginBtn').style.display = 'block';
 el('userInfo').style.display = 'none';
 }
 });

 el('loginBtn')?.addEventListener('click', () => {
 auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
 });
 el('logoutBtn')?.addEventListener('click', () => auth.signOut());
 }

 const friendsBtn = document.getElementById('friendsBtn');
 if (friendsBtn) {
 friendsBtn.addEventListener('click', () => {
 window.open('friends.html', '_blank', 'width=600,height=800');
 });
 }

 updateDashboard();
});</div>
