async function fetchLearnData() {
  try {
    const response = await fetch('/api/learning-data');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Erreur lors du chargement :", error);
    return [];
  }
}

function renderTable(data) {
  const tbody = document.getElementById('learningTable');
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-gray-400">Aucune donnée disponible</td></tr>`;
    return;
  }

  data.forEach((item, index) => {
    const row = document.createElement('tr');
    row.classList.add('hover:bg-gray-600', 'border-b', 'border-gray-500');

    row.innerHTML = `
      <td class="p-3">${item.species || '-'}</td>
      <td class="p-3">${item.spot || '-'}</td>
      <td class="p-3">${item.conditions?.join(', ') || '-'}</td>
      <td class="p-3">${item.lure || '-'}</td>
      <td class="p-3 ${item.result === 'bredouille' ? 'text-red-400' : 'text-green-400'}">
        ${item.result || '-'}
      </td>
      <td class="p-3">${new Date(item.date || Date.now()).toLocaleString()}</td>
      <td class="p-3 text-center">
        <button onclick="deleteEntry(${index})" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">Supprimer</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function deleteEntry(index) {
  if (!confirm("Supprimer cette entrée d'apprentissage ?")) return;
  await fetch(`/api/delete-learning/${index}`, { method: 'DELETE' });
  loadTable();
}

async function loadTable() {
  let data = await fetchLearnData();

  const speciesFilter = document.getElementById('filterSpecies').value.toLowerCase();
  const spotFilter = document.getElementById('filterSpot').value.toLowerCase();
  const resultFilter = document.getElementById('filterResult').value;

  if (speciesFilter) data = data.filter(d => d.species?.toLowerCase().includes(speciesFilter));
  if (spotFilter) data = data.filter(d => d.spot?.toLowerCase().includes(spotFilter));
  if (resultFilter) data = data.filter(d => d.result === resultFilter);

  renderTable(data);
}

document.getElementById('applyFilters').addEventListener('click', loadTable);
window.onload = loadTable;
