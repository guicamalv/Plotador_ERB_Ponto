// Initialize Map Base Layers
const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
});

const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
});

const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
});

const darkBasemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
});

// Initialize Map
const map = L.map('map', {
    center: [-15.793889, -47.882778],
    zoom: 13,
    layers: [googleRoadmap]
});

// Add Layer Control
const baseMaps = {
    "Google Roadmap": googleRoadmap,
    "Google Satellite": googleSatellite,
    "Google Hybrid": googleHybrid,
    "Dark Mode": darkBasemap
};

L.control.layers(baseMaps).addTo(map);

let plottedElements = [];

// DOM Elements
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggle-panel');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const erbForm = document.getElementById('erb-form');
const poiForm = document.getElementById('poi-form');
const elementsList = document.getElementById('elements-list');
const elementCount = document.getElementById('element-count');
const clearAllBtn = document.getElementById('clear-all');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const fileInput = document.getElementById('file-input');
const poiIconButtons = document.querySelectorAll('#poi-icon-selector .icon-btn');
let selectedPoiIcon = 'location-dot';
let currentEditId = null;
const rightSidebar = document.getElementById('right-sidebar');
const elementsSearchInput = document.getElementById('elements-search');
const showAllBtn = document.getElementById('show-all');

// Search DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const measureBtn = document.getElementById('measure-btn');
const coordsDisplay = document.getElementById('coords-display');

// Global Event Listeners
if (elementsSearchInput) {
    elementsSearchInput.addEventListener('input', updateElementsList);
}

// --- Basic UI Logic ---

// POI Icon Selection
poiIconButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        poiIconButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPoiIcon = btn.dataset.icon;
    });
});

// Toggle Panel (Hide All)
toggleBtn.addEventListener('click', () => {
    sidebar.classList.add('hidden');
    rightSidebar.classList.add('force-hidden');
    showAllBtn.classList.add('visible');
});

// Show Panel (Show All)
showAllBtn.addEventListener('click', () => {
    sidebar.classList.remove('hidden');
    rightSidebar.classList.remove('force-hidden');
    showAllBtn.classList.remove('visible');
});

// Search functionality
if (searchBtn) {
    searchBtn.addEventListener('click', searchAddress);
}
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchAddress();
    });
}

async function searchAddress() {
    const query = searchInput.value;
    if (!query) return;

    try {
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            map.flyTo([lat, lon], 13);
        } else {
            alert("Endereço não encontrado.");
        }
    } catch (error) {
        console.error("Erro na busca:", error);
        alert("Erro ao realizar busca.");
    } finally {
        searchBtn.innerHTML = '<i class="fas fa-search"></i>';
    }
}

// Tab Switching
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;

        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(target).classList.add('active');
    });
});

// Map Event: Mouse Move (Coordinate Tracking)
map.on('mousemove', (e) => {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    coordsDisplay.textContent = `Lat: ${lat} | Lng: ${lng}`;
});

// Map Event: Click for POI, ERB or Measurement
map.on('click', (e) => {
    if (isMeasuring) {
        addMeasurePoint(e.latlng);
        return;
    }

    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);

    if (activeTab === 'erb-tab') {
        document.getElementById('lat').value = lat;
        document.getElementById('lng').value = lng;
    } else if (activeTab === 'poi-tab') {
        document.getElementById('poi-lat').value = lat;
        document.getElementById('poi-lng').value = lng;
    }
});

// --- Core Plotting Logic ---

erbForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        type: 'ERB',
        lat: parseFloat(document.getElementById('lat').value),
        lng: parseFloat(document.getElementById('lng').value),
        azimuth: parseFloat(document.getElementById('azimuth').value),
        radius: parseFloat(document.getElementById('radius').value),
        beamwidth: parseFloat(document.getElementById('beamwidth').value),
        color: document.getElementById('erb-color').value,
        name: document.getElementById('name').value || `ERB_${plottedElements.filter(el => el.type === 'ERB').length + 1}`,
        id: currentEditId || Date.now()
    };

    if (currentEditId) {
        const index = plottedElements.findIndex(el => el.id === currentEditId);
        if (index !== -1) {
            const oldEl = plottedElements[index];
            if (oldEl.layers) oldEl.layers.forEach(l => map.removeLayer(l));
            if (oldEl.marker) map.removeLayer(oldEl.marker);
            plottedElements.splice(index, 1);
        }
        currentEditId = null;
        erbForm.querySelector('.btn-primary').textContent = 'Plotar ERB';
    }

    plotERB(data);
    erbForm.reset();
    document.getElementById('beamwidth').value = 120;
    document.getElementById('erb-color').value = '#ffcb00';
});

poiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        type: 'POI',
        lat: parseFloat(document.getElementById('poi-lat').value),
        lng: parseFloat(document.getElementById('poi-lng').value),
        name: document.getElementById('poi-name').value,
        color: document.getElementById('poi-color').value,
        icon: selectedPoiIcon,
        id: currentEditId || Date.now()
    };

    if (currentEditId) {
        const index = plottedElements.findIndex(el => el.id === currentEditId);
        if (index !== -1) {
            const oldEl = plottedElements[index];
            if (oldEl.marker) map.removeLayer(oldEl.marker);
            plottedElements.splice(index, 1);
        }
        currentEditId = null;
        poiForm.querySelector('.btn-primary').textContent = 'Adicionar Ponto';
    }

    plotPOI(data);
    poiForm.reset();
    document.getElementById('poi-color').value = '#ff4757';
    // Reset icon selection
    poiIconButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-icon="location-dot"]').classList.add('active');
    selectedPoiIcon = 'location-dot';
});

clearAllBtn.addEventListener('click', () => {
    if (confirm("Deseja realmente apagar todos os elementos do mapa?")) {
        plottedElements.forEach(el => {
            if (el.layers) el.layers.forEach(l => map.removeLayer(l));
            if (el.marker) map.removeLayer(el.marker);
        });
        plottedElements = [];
        updateElementsList();

        // Also clear measurement if any
        if (measureLayer) map.removeLayer(measureLayer);
        measurePoints = [];
    }
});

// --- Distance Measurement Tool Logic ---
let isMeasuring = false;
let measurePoints = [];
let measureLayer = L.layerGroup().addTo(map);
let tempLine = null;

measureBtn.addEventListener('click', () => {
    isMeasuring = !isMeasuring;
    measureBtn.classList.toggle('active');

    if (isMeasuring) {
        measureBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
        measureBtn.classList.replace('btn-action', 'btn-primary');
        map.getContainer().style.cursor = 'crosshair';
        measurePoints = [];
        measureLayer.clearLayers();
    } else {
        stopMeasuring();
    }
});

function stopMeasuring() {
    isMeasuring = false;
    measureBtn.innerHTML = '<i class="fas fa-ruler"></i> Medir';
    measureBtn.classList.replace('btn-primary', 'btn-action');
    measureBtn.classList.remove('active');
    map.getContainer().style.cursor = '';

    if (tempLine) {
        map.removeLayer(tempLine);
        tempLine = null;
    }
}

function addMeasurePoint(latlng) {
    measurePoints.push(latlng);

    // Add marker
    L.circleMarker(latlng, {
        radius: 4,
        color: '#ff4757',
        fillOpacity: 1
    }).addTo(measureLayer);

    if (measurePoints.length > 1) {
        // Draw line
        L.polyline(measurePoints, { color: '#ff4757', weight: 3, dashArray: '5, 10' }).addTo(measureLayer);

        // Calculate distance
        let totalDist = 0;
        for (let i = 0; i < measurePoints.length - 1; i++) {
            totalDist += measurePoints[i].distanceTo(measurePoints[i + 1]);
        }

        const distStr = totalDist > 1000 ? (totalDist / 1000).toFixed(2) + ' km' : Math.round(totalDist) + ' m';

        // Show tooltip with distance at the last point
        L.marker(latlng, {
            icon: L.divIcon({
                className: 'measure-label',
                html: `<span>${distStr}</span>`,
                iconSize: [100, 20],
                iconAnchor: [50, -10]
            })
        }).addTo(measureLayer);
    }
}

map.on('mousemove', (e) => {
    if (isMeasuring && measurePoints.length > 0) {
        if (tempLine) map.removeLayer(tempLine);
        const lastPoint = measurePoints[measurePoints.length - 1];
        tempLine = L.polyline([lastPoint, e.latlng], { color: '#ff4757', weight: 2, dashArray: '5, 5', opacity: 0.5 }).addTo(map);
    }
});

// ESC to cancel measurement
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMeasuring) {
        stopMeasuring();
        measureLayer.clearLayers();
    }
});

// --- Export / Import Logic ---

exportBtn.addEventListener('click', () => {
    if (plottedElements.length === 0) {
        alert("Não há dados para exportar.");
        return;
    }

    // Prepare data for Excel
    const dataToExport = plottedElements.map(el => {
        const item = {
            Tipo: el.type,
            Nome: el.name,
            Latitude: el.lat,
            Longitude: el.lng,
            Azimute: el.azimuth || "",
            Raio: el.radius || "",
            Abertura: el.beamwidth || "",
            Cor: el.color,
            Icone: el.icon || ""
        };
        return item;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados Plotados");

    // Download file
    XLSX.writeFile(workbook, `Plotador_ERB_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

importBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                alert("O arquivo está vazio.");
                return;
            }

            // Clear current map elements if confirmation (optional, but requested "continue work")
            // For now, we just append them.

            jsonData.forEach(item => {
                const mappedData = {
                    type: item.Tipo,
                    name: item.Nome,
                    lat: parseFloat(item.Latitude),
                    lng: parseFloat(item.Longitude),
                    azimuth: item.Azimute !== "" ? parseFloat(item.Azimute) : undefined,
                    radius: item.Raio !== "" ? parseFloat(item.Raio) : undefined,
                    beamwidth: item.Abertura !== "" ? parseFloat(item.Abertura) : undefined,
                    color: item.Cor,
                    icon: item.Icone || 'location-dot',
                    id: Date.now() + Math.random() // Unique ID
                };

                if (mappedData.type === 'ERB') {
                    plotERB(mappedData, false); // false to avoid flying for every point
                } else if (mappedData.type === 'POI') {
                    plotPOI(mappedData, false);
                }
            });

            // Reset input
            fileInput.value = "";

            // Fly to the last element's location
            if (jsonData.length > 0) {
                const last = jsonData[jsonData.length - 1];
                map.flyTo([parseFloat(last.Latitude), parseFloat(last.Longitude)], 13);
            }

        } catch (error) {
            console.error("Erro ao importar Excel:", error);
            alert("Erro ao processar o arquivo. Verifique o formato.");
        }
    };
    reader.readAsArrayBuffer(file);
});

function plotERB(data, shouldFly = true) {
    // 1. Sector Polygon
    const sectorPoints = getSectorPoints(data.lat, data.lng, data.azimuth, data.radius, data.beamwidth);
    const sectorLayer = L.polygon(sectorPoints, {
        color: data.color,
        fillColor: data.color,
        fillOpacity: 0.3,
        weight: 2
    }).addTo(map);

    // 2. Center Marker
    const marker = L.circleMarker([data.lat, data.lng], {
        radius: 6,
        color: '#fff',
        fillColor: data.color,
        fillOpacity: 1,
        weight: 2
    }).addTo(map);

    // 3. Persistent Label
    marker.bindTooltip(data.name, {
        permanent: true,
        direction: 'top',
        className: 'custom-label',
        offset: [0, -10]
    });

    marker.bindPopup(`<b>${data.name} (ERB)</b><br>Lat: ${data.lat}<br>Lng: ${data.lng}<br>Azimute: ${data.azimuth}°<br>Raio: ${data.radius}m`);

    // 4. Store
    plottedElements.push({
        ...data,
        layers: [sectorLayer],
        marker: marker
    });

    updateElementsList();
    if (shouldFly) map.flyTo([data.lat, data.lng], 14);
}

function plotPOI(data, shouldFly = true) {
    // 1. Create Pin Marker
    const marker = L.marker([data.lat, data.lng], {
        icon: L.divIcon({
            className: 'custom-poi-marker',
            html: `<i class="fas fa-${data.icon || 'location-dot'}" style="color: ${data.color}; font-size: 24px; text-shadow: 0 0 5px rgba(0,0,0,0.5);"></i>`,
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        })
    }).addTo(map);

    // 2. Persistent Label
    marker.bindTooltip(data.name, {
        permanent: true,
        direction: 'top',
        className: 'custom-label',
        offset: [0, -25]
    });

    marker.bindPopup(`<b>${data.name} (Ponto)</b><br>Lat: ${data.lat}<br>Lng: ${data.lng}`);

    // 3. Store
    plottedElements.push({
        ...data,
        marker: marker
    });

    updateElementsList();
    if (shouldFly) map.flyTo([data.lat, data.lng], 15);
}

/**
 * Calculates points for a sector polygon
 */
function getSectorPoints(lat, lng, azimuth, radius, beamwidth) {
    const points = [[lat, lng]]; // Start at center
    const startAngle = azimuth - (beamwidth / 2);
    const endAngle = azimuth + (beamwidth / 2);
    const segments = 30; // Smoother arc
    const step = beamwidth / segments;

    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (i * step);
        const point = destinationPoint(lat, lng, angle, radius);
        points.push(point);
    }

    points.push([lat, lng]); // Return to center
    return points;
}

function destinationPoint(lat, lng, bearing, distance) {
    const R = 6371000;
    const brng = bearing * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lng * Math.PI / 180;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
        Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));

    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
        Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));

    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

function updateElementsList() {
    const searchTerm = elementsSearchInput.value.toLowerCase();

    // Toggle sidebar visibility
    if (plottedElements.length > 0) {
        rightSidebar.classList.add('visible');
    } else {
        rightSidebar.classList.remove('visible');
    }

    elementsList.innerHTML = '';
    const filteredElements = plottedElements.filter(el =>
        el.name.toLowerCase().includes(searchTerm) ||
        el.type.toLowerCase().includes(searchTerm) ||
        (el.type === 'ERB' && el.azimuth.toString().includes(searchTerm))
    );

    elementCount.textContent = filteredElements.length;

    filteredElements.forEach(el => {
        const li = document.createElement('li');
        li.className = 'element-item';
        li.style.borderLeftColor = el.color;

        const typeIcon = el.type === 'ERB' ? 'fas fa-broadcast-tower' : 'fas fa-location-dot';
        const subtitle = el.type === 'ERB' ? `${el.azimuth}° | ${el.radius}m` : `${el.lat.toFixed(4)}, ${el.lng.toFixed(4)}`;

        li.innerHTML = `
            <div class="element-info">
                <h4><i class="${typeIcon}" style="color: ${el.color}; margin-right: 8px;"></i>${el.name}</h4>
                <p>${subtitle}</p>
            </div>
            <div class="item-actions">
                <button class="item-btn focus-btn" onclick="focusElement(${el.id})" title="Focar no mapa"><i class="fas fa-crosshairs"></i></button>
                <button class="item-btn edit-btn" onclick="editElement(${el.id})" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="item-btn delete-btn" onclick="deleteElement(${el.id})" title="Excluir"><i class="fas fa-trash-can"></i></button>
            </div>
        `;
        elementsList.appendChild(li);
    });
}

function focusElement(id) {
    const el = plottedElements.find(e => e.id === id);
    if (el) {
        map.flyTo([el.lat, el.lng], 15);
        if (el.marker) el.marker.openPopup();
    }
}

function editElement(id) {
    const el = plottedElements.find(e => e.id === id);
    if (!el) return;

    currentEditId = id;

    if (el.type === 'ERB') {
        // Switch to ERB tab
        document.querySelector('[data-tab="erb-tab"]').click();
        document.getElementById('lat').value = el.lat;
        document.getElementById('lng').value = el.lng;
        document.getElementById('azimuth').value = el.azimuth;
        document.getElementById('radius').value = el.radius;
        document.getElementById('beamwidth').value = el.beamwidth;
        document.getElementById('erb-color').value = el.color;
        document.getElementById('name').value = el.name;
        erbForm.querySelector('.btn-primary').textContent = 'Atualizar ERB';
    } else {
        // Switch to POI tab
        document.querySelector('[data-tab="poi-tab"]').click();
        document.getElementById('poi-lat').value = el.lat;
        document.getElementById('poi-lng').value = el.lng;
        document.getElementById('poi-name').value = el.name;
        document.getElementById('poi-color').value = el.color;

        // Set icon
        poiIconButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.icon === el.icon) btn.classList.add('active');
        });
        selectedPoiIcon = el.icon;
        poiForm.querySelector('.btn-primary').textContent = 'Atualizar Ponto';
    }

    // Optional: Hide sidebar on mobile or scroll to top of form
    // sidebar.scrollTop = 0;
}

window.focusElement = focusElement;
window.editElement = editElement;

function deleteElement(id) {
    const index = plottedElements.findIndex(e => e.id === id);
    if (index !== -1) {
        const el = plottedElements[index];
        if (el.layers) el.layers.forEach(l => map.removeLayer(l));
        if (el.marker) map.removeLayer(el.marker);
        plottedElements.splice(index, 1);
        updateElementsList();

        // Clear edit mode if deleted element was being edited
        if (currentEditId === id) {
            currentEditId = null;
            erbForm.querySelector('.btn-primary').textContent = 'Plotar ERB';
            poiForm.querySelector('.btn-primary').textContent = 'Adicionar Ponto';
            erbForm.reset();
            poiForm.reset();
        }
    }
}

window.deleteElement = deleteElement;
