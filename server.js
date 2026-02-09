const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');

app.use(express.json());

// === Initialisation lowdb ===
const adapter = new FileSync('db.json');
const db = lowdb(adapter);
db.defaults({ users: [], spots: [] }).write();

const secretKey = 'your-secret-key'; // À CHANGER EN PROD (process.env.JWT_SECRET)

// === Multer pour photos profil ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });


// Crée dossier uploads
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// === REGISTER ===
app.post('/api/register', upload.single('photo'), async (req, res) => {
  const { pseudo, password } = req.body;
  const photo = req.file ? req.file.path : null;
  if (db.get('users').find({ pseudo }).value()) return res.status(400).json({ error: 'Pseudo pris' });
  const hashedPass = await bcrypt.hash(password, 10);
  const user = { pseudo, password: hashedPass, photo, xp: 0, friends: [] };
  db.get('users').push(user).write();
  res.json({ success: true });
});

// === LOGIN ===
app.post('/api/login', async (req, res) => {
  const { pseudo, password } = req.body;
  const user = db.get('users').find({ pseudo }).value();
  if (!user) return res.status(400).json({ error: 'Utilisateur non trouvé' });
  if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: 'Mot de passe faux' });
  const token = jwt.sign({ pseudo }, secretKey, { expiresIn: '7d' });
  res.json({ token, user: { pseudo: user.pseudo, photo: user.photo, xp: user.xp } });
});

// === AJOUT AMI / SPOTS / RANKING ===
app.post('/api/add-friend', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const { pseudo } = jwt.verify(token, secretKey);
    const friendPseudo = req.body.friend;
    const user = db.get('users').find({ pseudo }).value();
    const friend = db.get('users').find({ pseudo: friendPseudo }).value();
    if (!friend) return res.status(400).json({ error: 'Ami non trouvé' });
    if (!user.friends.includes(friendPseudo)) user.friends.push(friendPseudo);
    db.get('users').find({ pseudo }).assign({ friends: user.friends }).write();
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/add-spot', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const { pseudo } = jwt.verify(token, secretKey);
    const { name, lat, lng } = req.body;
    const spot = { name, lat, lng, author: pseudo, date: new Date().toISOString() };
    db.get('spots').push(spot).write();
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.get('/api/spots', (req, res) => res.json(db.get('spots').value()));

app.get('/api/ranking', (req, res) => {
  const users = db.get('users').value();
  const ranking = users.sort((a, b) => b.xp - a.xp).map(u => ({ pseudo: u.pseudo, xp: u.xp }));
  res.json(ranking);
});

// === APPRENTISSAGE V12 ===
const LEARNING_FILE = 'learning-data-v12.json';
if (!fs.existsSync(LEARNING_FILE)) {
  fs.writeFileSync(LEARNING_FILE, JSON.stringify([], null, 2));
}

app.post('/api/learn', async (req, res) => {
  try {
    const session = { ...req.body, receivedAt: new Date().toISOString(), ip: req.ip || "unknown" };
    let data = [];
    try {
      data = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
    } catch (e) { data = []; }
    data.push(session);
    fs.writeFileSync(LEARNING_FILE, JSON.stringify(data, null, 2));
    console.log(`IA V12 → Session apprise (${data.length} total)`);
    res.json({ success: true, totalSessions: data.length, message: "Session apprise avec succès (V12)" });
  } catch (err) {
    console.error("Erreur /api/learn :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get('/download-learning-data', (req, res) => {
  if (req.query.key !== "thao2026") return res.status(403).send("Accès refusé");
  res.download(LEARNING_FILE, 'fisherforce-learning-data-v12.json');
});

// === learn.js fallback ===
let learn = {
  saveSession: () => {},
  analyzeAndUpdatePatterns: () => {},
  loadSessions: () => [],
  loadLearnedPatterns: () => ({}),
  loadSpots: () => []
};
try {
  learn = require('./learn');
} catch (err) {
  console.warn("learn.js non trouvé, apprentissage désactivé.");
}

// === spots.json ===
const spotFile = path.join(__dirname, 'spots.json');
let spotDatabase = [];
if (fs.existsSync(spotFile)) {
  try {
    spotDatabase = JSON.parse(fs.readFileSync(spotFile, 'utf-8'));
  } catch (e) {
    console.error("Erreur lecture spots.json", e);
    spotDatabase = [];
  }
} else {
  fs.writeFileSync(spotFile, JSON.stringify([]));
}
function saveSpot(spotName) {
  if (spotName && !spotDatabase.includes(spotName)) {
    spotDatabase.push(spotName);
    fs.writeFileSync(spotFile, JSON.stringify(spotDatabase, null, 2));
    console.log(`Spot "${spotName}" ajouté à la base.`);
  }
}

let learnedPatterns = {};
try {
  learnedPatterns = learn.loadLearnedPatterns();
} catch (err) {
  console.warn("Pas de patterns appris");
}
//SUGGEST LURE //
function suggestLures(species, structure, conditions, spotType, temperature = null, technique = "leurres") {
  species = (species || "").toLowerCase();
  structure = (structure || "").toLowerCase();
  conditions = (conditions || "").toLowerCase();
  spotType = (spotType || "").toLowerCase();
  saveSpot(spotType);
  const list = [];
  const mois = new Date().getMonth() + 1;
  let saison = [12, 1, 2].includes(mois) ? "hiver" :
              [3, 4, 5].includes(mois) ? "printemps" :
              [6, 7, 8].includes(mois) ? "été" : "automne";
  if (temperature !== null) {
    if (temperature < 10) saison += " froid";
    else if (temperature > 20) saison += " chaud";
  }
  // Patterns appris
  const learnedLures = learnedPatterns[species]?.[saison]?.[conditions]?.[spotType];
  if (learnedLures && learnedLures.length > 0) {
    learnedLures.forEach(lure => list.push(`${lure} (appris des sessions)`));
  }
  if (technique === "appats") {
    // Conseils appâts / mouche / carpe
    if (species.includes("truite")) {
      // Liste complète truite (ton original + ajouts pour varier)
      const fullTruite = [
        "Ver de terre ou teigne en nymphe ou à soutenir",
        "Asticot ou pinkies en flotteur léger",
        "Teigne ou ver rouge pour grosses truites en profondeur",
        "Petit vairon mort ou vif en plombée", // Ajout
        "Fromage frais ou pâte à truite pour eau trouble" // Ajout
      ];
      // 2 aléatoires parmi la liste complète
      const shuffled = fullTruite.sort(() => 0.5 - Math.random());
      lures = shuffled.slice(0, 2);
      depthAdvice = ["0-1m surface ou nymphe près du fond"];
    } else if (species.includes("carpe")) {
      // Liste complète carpe (ton original + ajouts)
      const fullCarpe = [
        "Maïs doux ou bouillettes 15-20mm",
        "Pellets en PVA bag ou spod",
        "Pain de mie ou pâte à carpe",
        "Boilies saveur fruitée ou poisson",
        "Maïs fermenté ou pellets en method feeder", // Ajout
        "Tiger nuts ou hemp seed pour carpe sélective" // Ajout
      ];
      const shuffled = fullCarpe.sort(() => 0.5 - Math.random());
      lures = shuffled.slice(0, 2);
      depthAdvice = ["Fond ou mi-eau selon amorçage"];
    } else {
      // Liste générale appâts (ton original)
      const fullGeneral = [
        "Ver de terre ou asticot en flotteur",
        "Teigne ou pinkies pour finesse",
        "Pain ou fromage pour carpeaux ou gros poissons blancs"
      ];
      const shuffled = fullGeneral.sort(() => 0.5 - Math.random());
      lures = shuffled.slice(0, 2);
      depthAdvice = ["Fond ou mi-eau"];
    }
  } else if ( technique === "mouche") {
    if (species.includes("truite")) {
      const Mouches= [
        "Conseils mouches",
        "mettre ici"
      ];
      const shuffled = Mouches.sort(() => 0.5 - Math.random());
      lures = shuffled.slice(0, 2);
      depthAdvice = ["0-1m surface ou près du fond"];
    } else if (species.includes("chevesne")) {
      const chubFly= [
        "Mouches Chevesne",
        "Ca arrive"
      ];
      const shuffled = chubFly.sort(() => 0.5 - Math.random());
      lures = shuffled.slice(0, 2);
      depthAdvice = ["0-1m surface ou près du fond"];
    }
  } else if ( technique === "carpe"){
    const Carpe = [
      "appats carpe",
      "ca arrive"
    ];
    const shuffled = Carpe.sort(() => 0.5 - Math.random());
    lures = shuffled.slice(0, 2);
    depthAdvice = ["Fond ou mi-eau"];
  } else {
    // Leurres classiques (ton ancien code)
    lures = [
      "Jerkbait 10-15cm naturel (eau claire, courant faible)",
      "Spinnerbait ou chatterbait (vent fort, herbiers)",
      "Shad souple 10cm texan ou drop shot (profondeur, structures)"
    ];
    depthAdvice = ["0-2m si surface active", "3-5m si froid"];
  }
  // === 2 CONSEILS RANDOM PAR ESPÈCE (SANS FALLBACK BROCHET) ===
  const randomParEspece = {
    brochet: [
      "Jerkbait suspending avec pauses très longues en eau profonde.",
      "Gros shad souple 20cm en linéaire ultra-lent au fond.",
      "Blade bait en yo-yo lent sur tombants rocheux.",
      "Rubber jig lourd avec trailer volumineux en verticale.",
      "Dead sticking avec gros tube posé plusieurs minutes.",
      "Lipless lourd en récupération stop and go.",
      "Swimbait slow sinking en pauses longues.",
      "Jig vibrant posé au fond avec twitchs rares.",
      "Texas rig gros worm gratté lentement sur roche.",
      "Balancier métallique lourd en verticale lac.",
      "Gros shad line-thru en linéaire glacial.",
      "Jerkbait longbill countdown structures profondes.",
      "Gros tailworm drop shot lourd cassures.",
      "Rubber jig football traîné gravier profond.",
      "Leurre souple 20cm screw head posé.",
      "Blade bait vibration minimale eau claire froide.",
      "Verticale gros spoon récupération morte.",
      "Texas rig creature dandine verticale.",
      "Jerkbait suspending naturel pauses 90s.",
      "Gros swimbait jointed slow sinking profond.",
      "Lipless lourd eau trouble pauses.",
      "Shad finesse linéaire ultra-lent soirée.",
      "Rubber jig 50g gros trailer dandine.",
      "Dead slow jerkbait long 10m+.",
      "Verticale tailspin lourd hiver.",
      "Leurre souple 25cm texan 40g gratté.",
      "Blade bait eau teintée vibration faible.",
      "Swimbait réaliste pause 60s+.",
      "Gros rubber jig nuit glaciale trailer volumineux.",
      "Lipless 60g stop and go structures.",
      "Texas rig gros creature gratté.",
      "Verticale gros tube zone profonde.",
      "Shad weighted posé.",
      "Jerkbait pauses 90s.",
      "Blade bait yo-yo.",
      "Gros swimbait jointed profond.",
      "Rubber jig dandine.",
      "Lipless vibration faible.",
      "Texas rig 20cm worm.",
      "Verticale balancier lourd.",
      "Jerkbait countdown profond.",
      "Gros shad screw head.",
      "Blade bait chromé lent.",
      "Swimbait slow sinking pause.",
      "Rubber jig football traîné.",
      "Lipless stop and go.",
      "Texas rig creature dandine.",
      "Verticale spoon récupération morte.",
      "Jerkbait suspending 90s.",
      "Gros tailworm drop shot.",
      "Blade bait vibration minimale.",
      "Swimbait réaliste 60s pause.",
      "Rubber jig night glaciale.",
      "Lipless 60g stop and go.",
      "Texas rig brush hog gratté.",
      "Verticale gros tube zone profonde.",
      "Shad 18cm weighted posé.",
      "Jerkbait long pauses très longues.",
      "Blade bait yo-yo minimal.",
      "Gros swimbait 8-figure lent profond.",
      "Rubber jig living trailer gros.",
      "Lipless vibration minimale eau trouble.",
      "Texas rig sweet beaver gratté lent.",
      "Verticale jigging rap naturel.",
      "Leurre souple 22cm line-thru glacial.",
      "Jerkbait pointer suspending.",
      "Gros blade bait yo-yo.",
      "Swimbait slide swimmer slow sinking.",
      "Rubber jig dirty black/blue."
    ],
    perche: [
      "Micro-jig ou drop shot en verticale sur tombants rocheux.",
      "Petits crankbaits en récupération variée.",
      "Leurres souples finesse en linéaire lent imitant écrevisses.",
      "Ned rig avec pauses longues sur fonds propres.",
      "Cuillère ondulante fine en récupération variée.",
      "Finesse jig tête ronde en dandine verticale.",
      "Dandine avec petit shad sous branches noyées.",
      "Wacky rig en weightless autour obstacles.",
      "Micro spinnerbait en récupération lente.",
      "Petit tube jig en verticale.",
      "Drop shot finesse worm en pause longue.",
      "Micro crankbait shallow en prospection rapide.",
      "Leurre souple 5-7cm en texan léger herbiers.",
      "Petite lame vibrante en récupération régulière.",
      "Ned rig mushroom head avec finesse worm.",
      "Micro jigging spoon en verticale hiver.",
      "Petit swimbait 7cm en linéaire lent.",
      "Tube jig 6cm en dandine rochers.",
      "Finesse spinnerbait en slow roll bordure.",
      "Leurre souple dropshot shad imitation alevin.",
      "Micro lipless en récupération rapide hauts-fonds.",
      "Wacky rig senko en chute libre.",
      "Petit jerkbait SP en twitching rapide.",
      "Cuillère n°1 en récupération variée rivière.",
      "Finesse football jig avec trailer craw gravier.",
      "Micro crankbait squarebill fouille souches.",
      "Leurre souple finesse en weightless obstacles.",
      "Petit chatterbait en zone peu profonde.",
      "Tail spin en verticale perchoirs.",
      "Drop shot smallie beaver imitation gobie.",
      "Micro crankbait flat side en twitching.",
      "Leurre souple curly tail linéaire lent.",
      "Ned rig mushroom head elaztech worm.",
      "Petit lipless chrome soleil plateaux.",
      "Tube jig en free rig eau moyenne.",
      "Finesse jig arkie head trailer chunk.",
      "Micro spinnerbait double willow burn léger.",
      "Leurre souple shad 8cm weighted hook.",
      "Petit topwater pencil en walking.",
      "Drop shot finesse worm pause très longue.",
      "Micro blade bait yo-yo lent.",
      "Leurre souple creature bait ned rig.",
      "Petit crankbait lipless red craw.",
      "Wacky rig yamamoto style green pumpkin.",
      "Micro jig ronde dandine branches.",
      "Tube small skipping.",
      "Finesse swimbait keitech style linéaire lent.",
      "Petit jerkbait vision junior twitching.",
      "Cuillère n°2 or eau trouble.",
      "Drop shot roboworm straight tail.",
      "Micro chatterbait trailer ménure finesse.",
      "Leurre souple jackall clone fry imitation alevin.",
      "Ned rig half shell finesse craw.",
      "Petit lipless jackall TN38 vibration fine.",
      "Tube jig coffee style.",
      "Finesse football jig baby rage craw.",
      "Micro crankbait duo realis.",
      "Leurre souple deathadder 6cm no sinker.",
      "Petit spinnerbait micro slow roll.",
      "Drop shot osp dolive stick pause longue.",
      "Micro blade bait damiki vault verticale.",
      "Leurre souple geecrack bellows shad linéaire.",
      "Ned rig missile baits shockwave.",
      "Petit topwater illex chubby popper matin.",
      "Tube strike king coffee tube.",
      "Finesse jig pitchin yamamoto hula grub.",
      "Micro lipless yo-zuri 3DB récupération variée.",
      "Leurre souple keitech swing impact fat 3.3.",
      "Petit jerkbait megabass x-80 twitching.",
      "Cuillère mepps black fury n°2 eau teintée.",
      "Drop shot jackall crosstail shad.",
      "Micro crankbait lucky craft bevy shallow.",
      "Leurre souple z-man finesse shroomz.",
      "Ned rig berkley powerbait maxscent flat worm.",
      "Petit chatterbait z-man micro finesse.",
      "Tube big bite baits smallie tube.",
      "Finesse swimbait basstrix trailer jig.",
      "Micro lipless rapala rippin rap ultra light.",
      "Leurre souple strike king rage menace ned.",
      "Petit jerkbait yo-zuri pins minnow.",
      "Cuillère savage gear rotabell n°1.",
      "Drop shot reins swamp mover.",
      "Micro blade bait b fish n pulse-r.",
      "Leurre souple deps basirisky weightless.",
      "Ned rig xzone muscle back finesse craw.",
      "Petit topwater rebel pop-r micro.",
      "Tube missile baits mini tube.",
      "Finesse jig arky head keitech little spider.",
      "Micro crankbait panther martin inline.",
      "Leurre souple jackall rhythm wag.",
      "Petit spinnerbait strike king mini king.",
      "Drop shot big bite baits trick stick.",
      "Micro lipless hed don blade bait.",
      "Leurre souple geecrack dum dum hog.",
      "Ned rig zoom beatdown.",
      "Petit jerkbait rapala x-rap 6.",
      "Cuillère blue fox vibrax shallow.",
      "Drop shot berkley gulp minnow.",
      "Micro chatterbait booyah boss pop micro.",
      "Leurre souple z-man TRD ticklerz.",
      "Tube strike king bitsy tube.",
      "Finesse swimbait damiki air pocket."
    ],
    chevesne: [
      "Petits leurres de surface ou insectes pour attaques en surface.",
      "Cuillère ou micro-crank en récupération rapide dans le courant.",
      "Lame vibrante ou petit spinner pour les chasses.",
      "Petit popper ou stickbait en zone calme.",
      "Leurre souple imitant poissonnet en linéaire rapide.",
      "Micro jig sous les branches surplombantes.",
      "Petit crankbait shallow en eau peu profonde.",
      "Insecte en mousse en sèche par beau temps.",
      "Petit jerkbait en twitching rapide.",
      "Cuillère ultra-légère en récupération continue.",
      "Micro lipless en récupération rapide sur les radiers.",
      "Petit poisson nageur sinking en linéaire dans le courant.",
      "Leurre souple 3-5cm en drop shot sous les arbres.",
      "Micro spinner en burn pour déclencher les attaques.",
      "Petit topwater pencil en walking the dog en été.",
      "Cuillère n°0 argentée en récupération variée en rivière.",
      "Insecte dur cicada ou beetle en surface par temps chaud.",
      "Micro crankbait en twitching près des obstacles.",
      "Petit stickbait sinking en jerks courts.",
      "Leurre souple imitant ver en linéaire lent sous surface.",
      "Lame vibrante ultra-légère en récupération continue.",
      "Petit popper en zone calme au lever du jour.",
      "Micro jig tête ronde en dandine sous les berges.",
      "Cuillère ondulante fine argentée en soleil.",
      "Leurre de surface tiny torpedo en zone calme.",
      "Micro crankbait lipless pour chasses en surface.",
      "Micro swimbait en linéaire rapide dans veines de courant.",
      "Insecte flottant en dead drifting sous branches.",
      "Petit jerkbait SP en pauses longues en eau calme.",
      "Cuillère rotating légère en récupération saccadée.",
      "Micro popper en skipping sous les arbres.",
      "Petit crankbait sinking en traîne derrière rocher.",
      "Leurre souple 4cm vairon en linéaire naturel.",
      "Micro blade bait en yo-yo sur radiers.",
      "Insecte dur grasshopper en surface en été.",
      "Petit lipless en vibration forte pour chasses.",
      "Cuillère n°1 or en eau trouble.",
      "Micro jerkbait en twitching ultra-rapide.",
      "Leurre souple imitant sauterelle en surface.",
      "Petit spinnerbait en burn léger en courant.",
      "Micro topwater chugger en popping en zone calme.",
      "Cuillère blue fox vibrax n°0 en eau claire.",
      "Petit poisson nageur jointed en linéaire rapide.",
      "Insecte en foam beetle en dead drift.",
      "Micro crankbait squarebill pour obstacles.",
      "Leurre souple 3cm en drop shot finesse.",
      "Petit stickbait en zig-zag rapide.",
      "Cuillère savage gear rotabell n°0.",
      "Micro lipless jackall TN38 en vibration.",
      "Petit popper illex chubby en matin.",
      "Leurre souple imitant moucheron en surface.",
      "Micro spinner mepps comet n°0.",
      "Petit crankbait yo-zuri pins minnow.",
      "Insecte dur ant ou bee en sèche.",
      "Micro jig en skipping sous branches.",
      "Cuillère panther martin n°1 en couleur naturelle.",
      "Petit topwater rebel crickhopper.",
      "Leurre souple 4cm en weightless sous surface.",
      "Micro blade bait damiki vault.",
      "Petit jerkbait rapala x-rap 4.",
      "Cuillère acme phoebe ultra-légère.",
      "Micro popper hed don tiny chugger.",
      "Leurre souple imitant guêpe en surface.",
      "Micro spinner strike king micro king.",
      "Petit crankbait rebel bumble bug.",
      "Insecte foam cicada en été chaud.",
      "Micro lipless yo-zuri 3DB pencil micro.",
      "Petit stickbait sinking en jerks violents.",
      "Cuillère worden's rooster tail n°1/16.",
      "Micro topwater torpédo baby.",
      "Leurre souple 3cm en linéaire rapide.",
      "Micro jig ronde en dandine en courant.",
      "Petit popper arbogast jitterbug baby.",
      "Cuillère blue fox pixee spoon micro.",
      "Micro crankbait duo realis crank micro.",
      "Insecte dur japanese beetle.",
      "Micro spinner panther martin deluxe.",
      "Petit jerkbait lucky craft bevy pencil micro.",
      "Leurre souple imitant fourmi en surface.",
      "Micro lipless rapala ultra light rippin rap.",
      "Petit topwater hed don baby torpedo.",
      "Cuillère acme kastmaster micro.",
      "Micro popper rebel pop-r tiny.",
      "Leurre souple 2.5cm en drop shot ultra-finesse.",
      "Micro blade bait b fish n h20.",
      "Petit crankbait rebel teeny wee.",
      "Insecte foam hopper en rivière.",
      "Micro spinner yakima rooster tail.",
      "Petit stickbait yo-zuri snap beans.",
      "Cuillère mepps bug.",
      "Micro topwater zara spook puppy.",
      "Leurre souple imitant abeille.",
      "Micro jig en skipping ultra-légger.",
      "Petit popper cotton cordell boy howdy.",
      "Cuillère thomas buoyant micro.",
      "Micro crankbait strike king bitsy minnow.",
      "Insecte dur cricket en été.",
      "Micro spinner worden's lures tiny.",
      "Petit jerkbait rapala countdown micro.",
      "Leurre souple 3cm en weightless surface.",
      "Micro lipless evergreen little max.",
      "Petit topwater illex tiny fry popper.",
      "Cuillère savage gear nail micro."
    ],
    aspe: [
      "Jerkminnow 7cm en récupération rapide en surface.",
      "Jig 10g lancé loin et ramené vite près du fond.",
      "Petit crankbait en linéaire ultra-rapide.",
      "Lame vibrante en récupération continue rapide.",
      "Petit swimbait en burn en zone de courant.",
      "Cuillère lourde en long cast et récupération rapide.",
      "Leurre souple shad 8cm en linéaire rapide.",
      "Micro jerkbait en twitching ultra-rapide.",
      "Petit lipless en récupération rapide.",
      "Spinner long cast en récupération continue.",
      "Petit poisson nageur minnow en linéaire rapide.",
      "Jig metal en verticale rapide.",
      "Crankbait diving en récupération rapide.",
      "Lame vibrante longue en long cast.",
      "Swimbait 10cm en burn rapide.",
      "Cuillère ondulante lourde en récupération rapide.",
      "Leurre souple paddletail en linéaire rapide.",
      "Micro jerkbait sinking en twitching.",
      "Lipless crankbait en récupération ultra-rapide.",
      "Spinnerbait long blade en récupération rapide.",
      "Minnow longbill en linéaire rapide profond.",
      "Metal jig 15g en yo-yo rapide.",
      "Crankbait lipless en burn.",
      "Lame vibrante slim en long cast.",
      "Swimbait paddletail en récupération continue.",
      "Cuillère rotating lourde en récupération rapide.",
      "Leurre souple curly tail en linéaire rapide.",
      "Jerkbait long en twitching rapide.",
      "Lipless vibrating en récupération rapide.",
      "Spinner double willow en burn.",
      "Minnow sinking en récupération rapide.",
      "Jig spoon en yo-yo rapide.",
      "Crankbait shallow en linéaire ultra-rapide.",
      "Lame vibrante gold en eau claire.",
      "Swimbait jointed en récupération rapide.",
      "Cuillère ondulante heavy en long cast.",
      "Leurre souple shad tail en linéaire rapide.",
      "Micro jerkbait floating en twitching.",
      "Lipless crankbait chrome en soleil.",
      "Spinnerbait tandem en récupération rapide.",
      "Minnow diving en linéaire rapide.",
      "Metal jig slim en yo-yo.",
      "Crankbait lipless red en automne.",
      "Lame vibrante black en eau trouble.",
      "Swimbait 12cm en burn rapide.",
      "Cuillère lourde gold en récupération rapide.",
      "Leurre souple vibrotail en linéaire rapide.",
      "Jerkbait suspending en twitching rapide.",
      "Lipless crankbait blue en eau claire.",
      "Spinnerbait tandem colorado en slow burn rapide.",
      "Minnow sinking longbill en récupération rapide.",
      "Jig metal spoon en yo-yo rapide.",
      "Crankbait deep lipless en linéaire rapide.",
      "Lame vibrante chrome en soleil.",
      "Swimbait paddletail jointed en récupération rapide.",
      "Cuillère ondulante heavy silver en long cast.",
      "Leurre souple shad tail paddletail en linéaire rapide.",
      "Micro jerkbait sinking deep en twitching.",
      "Lipless crankbait firetiger en eau teintée.",
      "Spinnerbait double colorado black en récupération rapide.",
      "Minnow longbill diving en linéaire rapide.",
      "Metal jig vibrating slim en yo-yo.",
      "Crankbait lipless silent red en automne.",
      "Lame vibrante black/chrome en eau claire.",
      "Swimbait paddletail 15cm en burn rapide.",
      "Cuillère rotating heavy gold en récupération rapide.",
      "Leurre souple curly tail shad en linéaire rapide.",
      "Jerkbait long suspending naturel en twitching rapide.",
      "Lipless crankbait gold/chrome en soleil.",
      "Spinnerbait tandem willow colorado en burn.",
      "Minnow sinking longbill en récupération rapide.",
      "Jig spoon heavy slim en yo-yo rapide.",
      "Crankbait shallow diver lipless en linéaire ultra-rapide.",
      "Lame vibrante or/black en eau trouble.",
      "Swimbait jointed paddletail 10cm en récupération rapide.",
      "Cuillère ondulante slim heavy gold en long cast.",
      "Leurre souple paddle tail 10cm en linéaire rapide.",
      "Micro jerkbait deep suspending en twitching.",
      "Lipless crankbait black/chrome en eau trouble.",
      "Spinnerbait double willow silver en récupération rapide.",
      "Minnow diving sinking en linéaire rapide.",
      "Metal jig slim spoon en yo-yo.",
      "Crankbait lipless red silent en automne."
    ],
    truite: [
      "Cuillère ondulante ou rotating en rivière avec courant.",
      "Leurre souple imitant vairon en récupération naturelle.",
      "Micro-jig ou spinner en zone calme.",
      "Petit crankbait en eau claire.",
      "Nymphe ou streamer en pêches fines.",
      "Cuillère légère en récupération variée.",
      "Petit poisson nageur en linéaire lent.",
      "Micro crankbait shallow en ruisseau.",
      "Leurre souple finesse en drop shot.",
      "Rotating ultra-légère en eau vive.",
      "Cuillère n°0 argentée en récupération saccadée dans pools.",
      "Petit jerkbait SP en twitching en eau calme.",
      "Leurre souple 5cm vairon en linéaire naturel.",
      "Micro lipless ou lame vibrante en récupération rapide.",
      "Spinner Mepps Aglia n°1 naturel.",
      "Petit crankbait sinking en traîne derrière rocher.",
      "Cuillère ondulante fine argentée en soleil.",
      "Leurre souple insecte en surface par éclosions.",
      "Micro jig tête ronde en dandine en poches profondes.",
      "Petit stickbait sinking en jerks courts.",
      "Rotating Black Fury n°1 en eau teintée.",
      "Leurre souple finesse worm en drop shot sous berges.",
      "Cuillère lourde en récupération lente en trous profonds.",
      "Petit popper ou insecte dur en zone calme.",
      "Crankbait ultra-light en linéaire en ruisseau.",
      "Micro spoon en récupération continue en courant fort.",
      "Leurre souple vairon monté en texan léger.",
      "Spinner Comet naturel en eau claire.",
      "Petit jigging spoon en verticale en lac.",
      "Cuillère ondulante cuivrée par temps couvert.",
      "Micro crankbait shallow en prospection rapide.",
      "Leurre souple 4cm en weightless sous surface.",
      "Spinner Panther Martin n°2 argent.",
      "Petit poisson nageur jointed en linéaire lent.",
      "Cuillère Blue Fox Vibrax n°1 en couleur firetiger.",
      "Micro jerkbait en twitching rapide en eau claire.",
      "Leurre souple insecte dur en surface été.",
      "Drop shot finesse avec micro worm.",
      "Cuillère Savage Gear Rotabell n°1.",
      "Petit crankbait Yo-Zuri Pins Minnow.",
      "Rotating Mepps XD en eau profonde.",
      "Leurre souple vairon 6cm en linéaire naturel.",
      "Micro blade bait en yo-yo en poches.",
      "Spinner Worden's Lil' Rooster.",
      "Petit topwater insecte en zone calme.",
      "Cuillère Acme Phoebe micro.",
      "Micro crankbait Rapala Countdown.",
      "Leurre souple 3cm en drop shot ultra-finesse.",
      "Spinner Blue Fox Pixee spoon.",
      "Petit jerkbait Lucky Craft Bevy.",
      "Cuillère Thomas Speedee.",
      "Micro lipless Jackall TN38.",
      "Leurre souple imitant nymphe en subsurface.",
      "Spinner Panther Martin Deluxe.",
      "Petit crankbait Duo Realis Crank.",
      "Cuillère Mepps Bug en imitation insecte.",
      "Micro jig en skipping en ruisseau.",
      "Leurre souple 4cm vairon en weighted hook.",
      "Spinner Yakima Bait Rooster Tail.",
      "Petit popper Rebel Crickhopper.",
      "Cuillère Worden's Tiny.",
      "Micro crankbait Strike King Bitsy.",
      "Leurre souple insecte foam hopper.",
      "Spinner Savage Gear Nail.",
      "Petit jerkbait Rapala X-Rap micro.",
      "Cuillère Acme Kastmaster micro.",
      "Micro topwater Heddon Tiny Torpedo.",
      "Leurre souple 3.5cm en linéaire lent.",
      "Spinner Mepps Timber Doodle.",
      "Petit crankbait Rebel Teeny Wee.",
      "Cuillère Blue Fox Vibrax Shallow.",
      "Micro lipless Yo-Zuri 3DB.",
      "Leurre souple vairon 5cm en drop shot.",
      "Spinner Panther Martin Holographic.",
      "Petit poisson nageur Yo-Zuri Snap Beans.",
      "Cuillère Mepps Comet Mino.",
      "Micro jerkbait Duo Spearhead.",
      "Leurre souple insecte cicada.",
      "Spinner Blue Fox Minnow Spin.",
      "Petit crankbait Illex Tiny Fry.",
      "Cuillère Savage Gear Sticklebait.",
      "Micro topwater Illex Chubby Popper.",
      "Leurre souple 4cm en no sinker.",
      "Spinner Mepps Flying C.",
      "Petit jerkbait Megabass Baby Griffon.",
      "Cuillère Thomas Speedee.",
      "Micro crankbait Jackall Chubby.",
      "Leurre souple vairon 6cm en texan light.",
      "Spinner Worden's Lil' Rooster.",
      "Petit popper Arbogast Jitterbug Baby.",
      "Cuillère Acme Little Cleo micro.",
      "Micro lipless Evergreen Little Max.",
      "Leurre souple insecte beetle.",
      "Spinner Blue Fox Vibrax Bullet.",
      "Petit crankbait Rapala Ultra Light Minnow.",
      "Cuillère Mepps Aglia Long.",
      "Micro topwater Rebel Bumble Bug.",
      "Leurre souple 3cm en subsurface.",
      "Spinner Panther Martin Spinnerbait micro.",
      "Petit jerkbait Yo-Zuri Crystal Minnow micro.",
      "Cuillère Savage Gear Seeker.",
      "Micro crankbait Duo Realis Spinbait."
    ]
  };
  // Normalisation robuste
  let normalized = species.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, '');
  const speciesMap = {
    brochet: 'brochet',
    perche: 'perche',
    sandre: 'sandre',
    blackbass: 'blackbass',
    bass: 'blackbass',
    chevesne: 'chevesne',
    aspe: 'aspe',
    silure: 'silure',
    truite: 'truite'
  };
  let matched = null;
  for (const key in speciesMap) {
    if (normalized.includes(key)) {
      matched = speciesMap[key];
      break;
    }
  }
  if (matched && randomParEspece[matched]) {
    const conseils = randomParEspece[matched];
    let random1 = conseils[Math.floor(Math.random() * conseils.length)];
    let random2 = conseils[Math.floor(Math.random() * conseils.length)];
    while (random2 === random1 && conseils.length > 1) {
      random2 = conseils[Math.floor(Math.random() * conseils.length)];
    }
    list.push(random1);
    list.push(random2);
  } else {
    // Conseils génériques si espèce inconnue
    const generiques = [
      "Prospection variée avec un leurre souple naturel en linéaire.",
      "Essaie un crankbait moyen pour couvrir de l'eau rapidement.",
      "Pêche en réaction avec une lame vibrante ou un spinner.",
      "Animation lente au fond avec un jig ou un texas rig.",
      "Varie les profondeurs jusqu'à trouver les poissons actifs."
    ];
    let random1 = generiques[Math.floor(Math.random() * generiques.length)];
    let random2 = generiques[Math.floor(Math.random() * generiques.length)];
    while (random2 === random1) random2 = generiques[Math.floor(Math.random() * generiques.length)];
    list.push(random1);
    list.push(random2);
  }
  list.push("Essaie un leurre souple de 7cm c'est une valeur sure !");
  list.push("Enregistre ta session pour faire progresser l'IA !");
  // Profondeur
  const depthAdvice = [];
  if (temperature !== null) {
    if (species.includes('perche')) {
      if (temperature < 10) depthAdvice.push("Profondeur 3-5m, jigs verticaux et dropshot");
      else if (temperature < 18) depthAdvice.push("Profondeur 1-3m, micro-leurres");
      else depthAdvice.push("Proche de la surface 0-1m, leurres légers");
    }
    if (species.includes('brochet')) {
      if (temperature < 8) depthAdvice.push("Profondeur 4-6m, leurres souples volumineux");
      else if (temperature < 15) depthAdvice.push("Profondeur 2-4m, jerkbait et spinnerbait");
      else depthAdvice.push("Bordure et surface 0-2m, frog et cuillère");
    }
  }
  return { lures: list, depthAdvice };
}






// === ROUTES ===
app.post('/api/advice', (req, res) => {
  try {
    let { 
      targetSpecies: species = "", 
      structure, 
      conditions, 
      spotType, 
      temperature, 
      failedLures = [],
      technique = "leurres"  // Nouveau paramètre, par défaut leurres
    } = req.body;

    species = (species || "").toLowerCase();
    structure = (structure || "").toLowerCase();
    conditions = (conditions || "").toLowerCase();
    spotType = (spotType || "").toLowerCase();
    failedLures = Array.isArray(failedLures) ? failedLures.map(l => l.trim().toLowerCase()) : [];

    if (!structure || !conditions) {
      return res.status(400).json({ error: 'Champs requis manquants : structure et conditions.' });
    }

    // Détection fermeture carnassiers (janvier-avril)
    const now = new Date();
    const isClosedPeriod = now.getMonth() < 4; // Mois 0-3 = janv-avril
    const closedSpecies = ["brochet", "sandre", "black-bass", "black bass"]; // Liste espèces fermées

    let isClosedForSpecies = isClosedPeriod && closedSpecies.some(cs => species.toLowerCase().includes(cs));

    let fallbackMessage = [];
    if (isClosedForSpecies && technique === "leurres") {
      fallbackMessage = [
        "- Période de fermeture pour " + species + " ! Toute prise = infraction grave.",
        "- Essaie les appâts naturels, mouche ou finesse pour truite, carpe, perche, silure..."
      ];
      technique = "appats naturels"; // Force appâts pour éviter conseils leurres illégaux
    }

    const result = suggestLures(species, structure, conditions, spotType, temperature, technique); // Passe technique à suggestLures

    let filteredLures = result.lures.filter(lure => {
      const lureName = lure.split(' — ')[0].trim().toLowerCase();
      return !failedLures.includes(lureName);
    });

    if (filteredLures.length === 0) {
      filteredLures = [
        "Aucun leurre/appât précédent n'a fonctionné dans ces conditions...",
        "Essaie un appât totalement différent (taille, couleur, présentation)",
        "Change radicalement de montage ou de profondeur",
        "Enregistre une nouvelle session pour faire progresser l'IA !"
      ];
    }

    // Ajoute les messages fallback si fermeture
    if (fallbackMessage.length > 0) {
      filteredLures = [...fallbackMessage, ...filteredLures];
    }

    res.json({
      adviceText: "Voici mes meilleurs conseils pour ces conditions :",
      lures: filteredLures,
      depthAdvice: result.depthAdvice || []
    });
  } catch (err) {  // ← catch maintenant après fermeture du try
    console.error("Erreur dans /api/advice :", err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Si tu n'as pas encore la fonction suggestLures, voici une version adaptée qui gère technique

app.post('/api/suggest', (req, res) => {
  let { targetSpecies: species = "", structure, conditions, spotType, temperature } = req.body;
  const result = suggestLures(species, structure, conditions, spotType, temperature);
  res.json(result);
});


app.post('/api/compare-lure', async (req, res) => {
  const { lure } = req.body;
  if (!lure) return res.status(400).json({ error: 'Nom du leurre requis' });

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;

    if (!apiKey || !cx) {
      return res.status(500).json({ error: 'Configuration Google API manquante' });
    }

    // Recherche Google via Custom Search JSON API
    const searchQuery = `acheter ${lure} pas cher site:.fr OR site:.com OR site:.eu`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(searchQuery)}&num=10`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Erreur Google API:', data.error);
      return res.status(500).json({ error: 'Erreur recherche Google' });
    }

    const deals = [];
    if (data.items && data.items.length > 0) {
      data.items.slice(0, 5).forEach(item => {
        // Extraction prix approximatif depuis snippet (pas parfait, mais rapide)
        const priceMatch = item.snippet.match(/€\d+[,.]?\d*/);
        deals.push({
          site: item.title,
          link: item.link,
          price: priceMatch ? priceMatch[0] : 'Prix non trouvé (clique pour voir)'
        });
      });
    }

    // Recherche image rapide (premier résultat Google Images)
    const imageQuery = `${lure} fishing lure`;
    const imageUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(imageQuery)}&searchType=image&num=1`;
    const imageResponse = await fetch(imageUrl);
    const imageData = await imageResponse.json();
    const image = imageData.items && imageData.items[0] ? imageData.items[0].link : null;

    res.json({ deals, image });
  } catch (error) {
    console.error('Erreur serveur:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});
app.post('/api/activate-premium', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), secretKey);
    const pseudo = decoded.pseudo;

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code requis' });

    const codeUpper = code.trim().toUpperCase();

    // Recherche le code
    const codeEntry = db.get('premiumCodes').find({ code: codeUpper }).value();

    if (!codeEntry) {
      return res.status(400).json({ error: 'Code incorrect' });
    }

    // Supprime le code (usage unique)
    db.get('premiumCodes').remove({ code: codeUpper }).write();

    // Upgrade l'utilisateur à premium
    db.get('users').find({ pseudo }).assign({ premium: true }).write();

    res.json({ 
      success: true, 
      message: 'Premium activé ! +100 XP. Le code a été supprimé pour éviter les réutilisations.' 
    });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});
// === SERVEUR STATIQUE + CATCH-ALL POUR SPA (IMPORTANT !) ===
app.use(express.static('public')); // si tes fichiers sont dans /public

// Route catch-all : pour toutes les URLs qui ne sont pas /api/*, renvoie index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});




// Serve les fichiers statiques depuis /public
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all : pour TOUTES les routes non-API, renvoie index.html
app.get('*', (req, res) => {
  // Exclut les routes API pour éviter les conflits
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API non trouvée' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Voir profil d'un autre utilisateur
app.get('/api/user/:pseudo', (req, res) => {
  const { pseudo } = req.params;
  const user = db.get('users').find({ pseudo }).value();

  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  res.json({
    pseudo: user.pseudo,
    xp: user.xp,
    premium: user.premium,
    followers: user.followers.length,
    following: user.following.length,
    journal: user.journal // prises publiques
  });
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
