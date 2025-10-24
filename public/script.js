// --- script.js ---
// Cette partie gère l'envoi des résultats à l'IA pour qu'elle apprenne

// Exemple : fonction appelée quand l'utilisateur clique sur "Envoyer le résultat"
async function envoyerResultat() {
  const species = document.getElementById("species").value;
  const lure = document.getElementById("lure").value;
  const spotType = document.getElementById("spotType").value;
  const conditions = document.getElementById("conditions").value.split(",");
  const temperature = parseFloat(document.getElementById("temperature").value);
  const result = document.querySelector('input[name="result"]:checked').value; // "pris" ou "bredouille"

  const sessionData = {
    species,
    lure,
    spotType,
    conditions,
    temperature,
    result,
  };

  try {
    const response = await fetch("/api/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionData),
    });

    const data = await response.json();
    alert("✅ Données enregistrées : " + data.message);
  } catch (err) {
    console.error("Erreur :", err);
    alert("❌ Impossible d'enregistrer les données");
  }
}
