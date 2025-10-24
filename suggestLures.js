// --- Base de données simplifiée pour les spots ---
const spotDatabase = [];
const fs = require("fs");
const path = require("path");

const spotsFilePath = path.join(__dirname, "spots.json");

// Charger les spots sauvegardés au démarrage
if (fs.existsSync(spotsFilePath)) {
  try {
    const data = fs.readFileSync(spotsFilePath, "utf8");
    spotDatabase.push(...JSON.parse(data));
  } catch (e) {
    console.error("Erreur de lecture spots.json :", e);
  }
}

// Fonction pour sauvegarder un spot
function saveSpot(spotName) {
  if (!spotDatabase.includes(spotName)) {
    spotDatabase.push(spotName);
    fs.writeFileSync(spotsFilePath, JSON.stringify(spotDatabase, null, 2));
    console.log(`Spot "${spotName}" ajouté à la base.`);
  }
}

// --- Leurres suggérés (version multi-condition) avec profondeur selon température ---
function suggestLures(species, structure, conditions, spotType, temperature = null) {
  // Sauvegarde automatique du spot
  saveSpot(spotType);

  const list = [];
  const mois = new Date().getMonth() + 1;
  let saison;
  if ([12, 1, 2].includes(mois)) saison = "hiver";
  else if ([3, 4, 5].includes(mois)) saison = "printemps";
  else if ([6, 7, 8].includes(mois)) saison = "été";
  else saison = "automne";

  // 🔥 Cas ultra-ciblés (espèce + saison + spot + météo)
  if (species.includes('perche')) {
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuages')) {
      list.push('Dropshot', 'Animation lente proche des structures');
    }
    if (saison === "hiver" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Ned Rig', 'Animation lente sur le fond dans les contre-courants');
    }
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('nuage')) {
      list.push('Cuillère N°2', 'Récupération lente juste sous la surface');
    }
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Leurre souple 5cm Brun', 'Récupération lente juste sous la surface');
    }
    if (saison === "printemps" && spotType === "étang" && conditions.includes('clair')) {
      list.push('Cuillère N°2, coloris Or', 'Pêche en linéaire lent');
    }
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Cuillère N°2 argentée puis Leurre souple de 5cm puis crank puis micro-leurre', 'Animation juste sous la surface');
    }
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages')) {
      list.push('Leurre souple de 7 à 8cm coloris gardon', 'Récupération rapide avec pauses');
    }
    if (saison === "été" && spotType === "étang" && conditions.includes('nuages')) {
      list.push('Leurre souple de 4 à 6cm', 'Récupération rapide avec pauses');
    }
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil')) {
      list.push('Leurre souple de 4 à 6cm en dropshot', 'Récupération lente et dandine proche des obstacles');
    }
    if (saison === "automne" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Leurre souple de 4 à 6cm ou Crankbait', 'Récupération rapide avec des pauses proche des obstacles');
    }
    if (saison === "automne" && spotType === "étang" && conditions.includes('soleil')) {
      list.push('Leurre souple de 7cm en dropshot', 'Tente les grosses perches dans les obstacles');
    }
    if (saison === "automne" && spotType === "rivière" && conditions.includes('pluie')) {
      list.push('Leurre souple de 7cm en Ned Rig ou Lame Vibrante', 'Tente les grosses perches sur le fond');
    }
    if (saison === "automne" && spotType === "étang" && conditions.includes('pluie')) {
      list.push('Leurre souple de 7cm en Ned Rig', 'Tente les grosses perches dans les obstacles');
    }
  }

  if (species.includes('brochet')) {
    if (saison === "été" && spotType === "étang" && conditions.includes('nuages')) {
      list.push('Leurres souples de 10cm puis Cuiller N°4 puis Spinner Bait', 'Privilégie le Power Fishing proche des obstacles');
    }
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages')) {
      list.push('Leurres souples de 10cm puis Cuiller N°4 puis Spinner Bait', 'Privilégie le Power Fishing proche des obstacles');
    }
    if (saison === "automne" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Leurres souples de 6cm', 'Quand il y a du soleil les brochets visent les petites proies');
    }
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Propbait', 'Récupération rapide avec des pauses proche des obstacles');
    }
    if (saison === "printemps" && spotType === "rivière" && conditions.includes('nuages')) {
      list.push('Jerk-Minnow de 12 à 15cm', 'Twitchs courts avec des pauses en surface');
    }
    if (saison === "printemps" && spotType === "rivière" && (conditions.includes('pluie') || conditions.includes('vent'))) {
      list.push('Jerk-Minnow de 12 à 15cm', 'Gros coups de canne avec de longues pauses');
    }
    if (saison === "printemps" && spotType === "étang" && conditions.includes('nuages')) {
      list.push('Leurre souple de 13cm', 'Récupération lente en surface');
    }
    if (saison === "printemps" && spotType === "étang" && conditions.includes('soleil')) {
      list.push('Cuillère N°4', 'Récupération lente en surface');
    }
    if (saison === "hiver" && spotType === "étang" && conditions.includes('soleil')) {
      list.push('Shad de 16cm', 'Récupération lente');
    }
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuages')) {
      list.push('Lipless ou spintail ou lame vibrante', 'Récupération lente ou dandine en verticale');
    }
  }

  if (species.includes('bass')) {
    if (saison === "hiver" && spotType === "étang" && conditions.includes('nuages')) {
      list.push('Ned Rig ou ver manié', 'Récupération lente ou dandine en verticale');
    }
    if (saison === "printemps" && spotType === "étang" && conditions.includes('vent')) {
      list.push('Spinner-bait', 'Récupération lente sous la surface');
    }
    if (saison === "été" && spotType === "étang" && conditions.includes('soleil')) {
      list.push('Worm en wacky ou Tube texan ou Frog ou finesse', 'Récupération par à-coups ou en dandine');
    }
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Worm en wacky ou stickbait ou cuillère', 'Récupération rapide entre deux eaux');
    }
    if (saison === "été" && spotType === "rivière" && conditions.includes('nuages')) {
      list.push('Écrevisses en punching', 'Dans les herbiers');
    }
    if (saison === "automne" && spotType === "rivière" && conditions.includes('nuages')) {
      list.push('Écrevisses en punching', 'Dans les herbiers mourants');
    }
  }

  if (species.includes('chevesne')) {
    if (saison === "été" && spotType === "rivière" && conditions.includes('soleil')) {
      list.push('Lame vibrante ou cuillère ou micro-leurre', 'Récupération rapide pour déclencher des attaques de réaction');
    }
  }

  // 🎣 Conseils généraux basés sur structure et conditions
  if (species.includes('brochet') || species.includes('sandre')) {
    list.push('Leurres nageurs de 7 à 12cm (medium-large)');
    if (structure.includes('herbiers')) list.push('Spinnerbaits / leurres à armature pour éviter les accros');
    if (structure.includes('Bois morts')) list.push('Wake-bait / leurres texan');
    if (structure.includes('nénuphards')) list.push('Frog / leurres texan');
    if (structure.includes('élodée')) list.push('Montage texan');
    if (structure.includes('rocher')) list.push('Glide-bait');
    if (structure.includes('vase')) list.push('Leurres souples flashys');
    if (structure.includes('sable')) list.push('Glide-bait');
    if (conditions.includes('clair')) list.push('Leurres naturels, vibrations légères');
    if (conditions.includes('vent')) list.push('Jerk minnow');
    if (conditions.includes('pluie')) list.push('Leurres souples flashys');
    if (conditions.includes('soleil')) list.push('Stickbait');
    if (conditions.includes('trouble')) list.push('Leurres souples flashys / Cuillères');
  }

  if (species.includes('perche')) {
    list.push('Jigs et petits leurres souples (3–7 cm)');
    list.push('Poissons-nageurs légers en bordure');
    if (structure.includes('rochers')) list.push('Écrevisses');
    if (structure.includes('arbre')) list.push('Finesse');
    if (structure.includes('pont')) list.push('Micro-leurre / Cuillères / crankbait');
    if (structure.includes('péniche')) list.push('Micro-leurre');
  }

  if (species.includes('bass')) {
    list.push('Worms, tubes, shads, frog (approche calme)');
    if (structure.includes('herbiers')) list.push('Worm en wacky');
    if (structure.includes('bois')) list.push('Worm en wacky');
  }

  if (list.length === 0) {
    list.push('Variété: leurres souples, poissons-nageurs légers, cuillères selon profondeur');
  }

  // --- Ajout de la suggestion de profondeur si température donnée ---
  let depthAdvice = [];
  if (temperature !== null) {
    if (species.includes('perche')) {
      if (temperature < 10) depthAdvice.push("Profondeur 3-5m, jigs verticaux et dropshot");
      else if (temperature < 18) depthAdvice.push("Profondeur 1-3m, micro-leurres");
      else depthAdvice.push("Proche de la surface 0-1m, poissons-nageurs et leurres légers");
    }
    if (species.includes('brochet')) {
      if (temperature < 8) depthAdvice.push("Profondeur 4-6m, leurres souples volumineux");
      else if (temperature < 15) depthAdvice.push("Profondeur 2-4m, jerkbait et spinnerbait");
      else depthAdvice.push("Bordure et surface 0-2m, frog et cuillère");
    }
    if (species.includes('sandre')) {
      if (temperature < 10) depthAdvice.push("Profondeur 5-8m, shads plombés");
      else if (temperature < 18) depthAdvice.push("Profondeur 3-5m, shads discrets");
      else depthAdvice.push("Profondeur 1-3m, shads et petits leurres de surface le soir");
    }
    if (species.includes('bass')) {
      if (temperature < 12) depthAdvice.push("Proche du fond 2-4m, worms et tubes");
      else if (temperature < 22) depthAdvice.push("Milieu colonne 1-3m, senko et frog");
      else depthAdvice.push("Bordure et surface 0-1m, frog et leurres légers");
    }
  }

  return {
    lures: list,
    depthAdvice: depthAdvice
  };
}

module.exports = { suggestLures, saveSpot };
