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
const closeRightPanelBtn = document.getElementById('close-right-panel');

// Search DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const measureBtn = document.getElementById('measure-btn');
const timeSliderContainer = document.getElementById('time-slider-container');
const timeSlider = document.getElementById('time-slider');
const currentTimeDisplay = document.getElementById('current-time-display');
const sliderPrevBtn = document.getElementById('slider-prev');
const sliderNextBtn = document.getElementById('slider-next');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeModalBtn = document.getElementById('close-modal');

let showAllTimestamps = false;
let allLabelsVisible = true;
let currentSliderTimestamp = null;

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
    timeSliderContainer.classList.add('force-hidden');
});

// Show Panel (Show All)
showAllBtn.addEventListener('click', () => {
    sidebar.classList.remove('hidden');
    rightSidebar.classList.remove('force-hidden');
    showAllBtn.classList.remove('visible');
    timeSliderContainer.classList.remove('force-hidden');
});

// Help Modal Logic
if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        helpModal.classList.remove('hidden');
    });
}
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        helpModal.classList.add('hidden');
    });
}
if (helpModal) {
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.add('hidden');
        }
    });
}

// Close Right Panel (Mobile/Action)
if (closeRightPanelBtn) {
    closeRightPanelBtn.addEventListener('click', () => {
        rightSidebar.classList.remove('visible');
    });
}

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
        datetime: document.getElementById('erb-datetime').value ? new Date(document.getElementById('erb-datetime').value).getTime() : null,
        id: currentEditId || Date.now(),
        isVisible: true
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
    updateTemporalSlider();
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
        id: currentEditId || Date.now(),
        isVisible: true
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
        updateTemporalSlider();

        // Also clear measurement if any (keep the layer group on the map for future measurements)
        measureLayer.clearLayers();
        measurePolyline = null;
        measurePoints = [];
        if (isMeasuring) stopMeasuring();
    }
});

// --- Distance Measurement Tool Logic ---
let isMeasuring = false;
let measurePoints = [];
let measureLayer = L.layerGroup().addTo(map);
let measurePolyline = null; // Single polyline instance
let tempLine = null;

measureBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent map click when clicking the button
    isMeasuring = !isMeasuring;
    measureBtn.classList.toggle('active');

    if (isMeasuring) {
        measureBtn.innerHTML = '<i class="fas fa-times"></i>';
        map.getContainer().style.cursor = 'crosshair';
        measurePoints = [];
        measureLayer.clearLayers();
        if (measurePolyline) {
            map.removeLayer(measurePolyline);
            measurePolyline = null;
        }
    } else {
        stopMeasuring();
    }
});

function stopMeasuring() {
    isMeasuring = false;
    measureBtn.innerHTML = '<i class="fas fa-ruler"></i>';
    measureBtn.classList.remove('active');
    map.getContainer().style.cursor = '';

    if (tempLine) {
        map.removeLayer(tempLine);
        tempLine = null;
    }
}

function addMeasurePoint(latlng) {
    measurePoints.push(latlng);

    // Add marker (non-interactive so it doesn't block future clicks)
    L.circleMarker(latlng, {
        radius: 4,
        color: '#ff4757',
        fillOpacity: 1,
        interactive: false
    }).addTo(measureLayer);

    if (measurePoints.length > 1) {
        // Update or create polyline
        if (!measurePolyline) {
            measurePolyline = L.polyline(measurePoints, {
                color: '#ff4757',
                weight: 3,
                dashArray: '5, 10',
                interactive: false
            }).addTo(measureLayer);
        } else {
            measurePolyline.setLatLngs(measurePoints);
        }

        // Calculate distance
        let totalDist = 0;
        for (let i = 0; i < measurePoints.length - 1; i++) {
            totalDist += measurePoints[i].distanceTo(measurePoints[i + 1]);
        }

        const distStr = totalDist > 1000 ? (totalDist / 1000).toFixed(2) + ' km' : Math.round(totalDist) + ' m';

        // Show tooltip with distance at the last point (non-interactive)
        L.marker(latlng, {
            icon: L.divIcon({
                className: 'measure-label',
                html: `<span>${distStr}</span>`,
                iconSize: [100, 20],
                iconAnchor: [50, -10]
            }),
            interactive: false
        }).addTo(measureLayer);
    }
}

map.on('mousemove', (e) => {
    if (isMeasuring && measurePoints.length > 0) {
        if (tempLine) map.removeLayer(tempLine);
        const lastPoint = measurePoints[measurePoints.length - 1];
        tempLine = L.polyline([lastPoint, e.latlng], {
            color: '#ff4757',
            weight: 2,
            dashArray: '5, 5',
            opacity: 0.5,
            interactive: false
        }).addTo(map);
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
    let dataToExport = [];
    let fileName = `Plotador_ERB_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (plottedElements.length === 0) {
        alert("Não há elementos plotados no mapa. Será feito o download de um modelo de planilha com cabeçalhos e dados de exemplo aceitos pela ferramenta.");
        // Create template with headers and example data
        dataToExport = [
            {
                Tipo: "ERB",
                Nome: "Exemplo ERB",
                Latitude: -15.7938,
                Longitude: -47.8827,
                Azimute: 120,
                Raio: 500,
                Abertura: 120,
                Cor: "#ffcb00",
                Icone: "",
                Data: new Date().toLocaleDateString('pt-BR'),
                Hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            },
            {
                Tipo: "POI",
                Nome: "Exemplo Ponto",
                Latitude: -15.7950,
                Longitude: -47.8850,
                Azimute: "",
                Raio: "",
                Abertura: "",
                Cor: "#ff4757",
                Icone: "location-dot",
                Data: "",
                Hora: ""
            }
        ];
        fileName = `Modelo_Importacao_Plotador.xlsx`;
    } else {
        // Prepare data for Excel from existing elements
        dataToExport = plottedElements.map(el => {
            const dateObj = el.datetime ? new Date(el.datetime) : null;
            return {
                Tipo: el.type,
                Nome: el.name,
                Latitude: el.lat,
                Longitude: el.lng,
                Azimute: numberOrEmpty(el.azimuth),
                Raio: numberOrEmpty(el.radius),
                Abertura: numberOrEmpty(el.beamwidth),
                Cor: el.color,
                Icone: el.icon || "",
                Data: dateObj ? dateObj.toLocaleDateString('pt-BR') : "",
                Hora: dateObj ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ""
            };
        });
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");

    // Download file
    XLSX.writeFile(workbook, fileName);
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
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
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
                let dateValue = item.Data_Hora || item["Data/Hora"] || item.DataHora || "";

                // Support separate Data and Hora columns
                if (!dateValue && (item.Data || item.Date)) {
                    const d = item.Data || item.Date;
                    const h = item.Hora || item.Time || "";
                    // Handle Excel Date objects if they come as such
                    const datePart = d instanceof Date ? d.toLocaleDateString('pt-BR') : d;
                    const timePart = h instanceof Date ? h.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : h;
                    dateValue = timePart ? `${datePart} ${timePart}` : datePart;
                }

                const type = item.Tipo;
                const defaultColor = type === 'ERB' ? '#ffcb00' : '#ff4757';

                const mappedData = {
                    type: type,
                    name: item.Nome,
                    lat: parseFloat(item.Latitude),
                    lng: parseFloat(item.Longitude),
                    azimuth: parseNumberOrUndefined(item.Azimute),
                    radius: parseNumberOrUndefined(item.Raio),
                    beamwidth: parseNumberOrUndefined(item.Abertura),
                    color: item.Cor && item.Cor.startsWith('#') ? item.Cor : defaultColor,
                    icon: item.Icone || 'location-dot',
                    datetime: dateValue ? parseDateRobust(dateValue) : null,
                    id: Date.now() + Math.random(), // Unique ID
                    isVisible: true
                };

                if (mappedData.type === 'ERB') {
                    plotERB(mappedData, false); // false to avoid flying for every point
                } else if (mappedData.type === 'POI') {
                    plotPOI(mappedData, false);
                }
            });

            updateTemporalSlider();

            // Default to "Show All" on import
            showAllTimestamps = true;
            if (globalVisibilityToggle) {
                globalVisibilityToggle.classList.add('active');
                const icon = globalVisibilityToggle.querySelector('i');
                if (icon) icon.classList.replace('fa-eye', 'fa-eye-slash');
            }

            // Sync labels
            allLabelsVisible = true;
            map.getContainer().classList.remove('labels-hidden');

            // Reset input
            fileInput.value = "";

            // Fly to the FIRST element's location (or earliest erb)
            if (jsonData.length > 0) {
                const first = jsonData[0];
                map.flyTo([parseFloat(first.Latitude), parseFloat(first.Longitude)], 13);
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
    });

    // 2. Antenna Marker (replacing circle marker)
    const marker = L.marker([data.lat, data.lng], {
        icon: L.divIcon({
            className: 'custom-erb-marker',
            html: `<i class="fas fa-tower-broadcast" style="color: ${data.color}; font-size: 24px; text-shadow: 0 0 5px rgba(0,0,0,0.5);"></i>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        }),
        draggable: true
    });

    // Support measurement on marker click
    marker.on('click', (e) => {
        if (isMeasuring) {
            addMeasurePoint(e.latlng);
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        }
    });

    // 3. Store (created before the handlers so drag updates the stored element, not a stale copy)
    const el = {
        ...data,
        layers: [sectorLayer],
        marker: marker,
        isTimeVisible: true
    };

    // Draggable logic for ERB
    marker.on('dragend', function (e) {
        const newLatLng = e.target.getLatLng();
        el.lat = newLatLng.lat;
        el.lng = newLatLng.lng;

        // Update form if this element is being edited
        if (currentEditId === el.id) {
            document.getElementById('lat').value = el.lat.toFixed(6);
            document.getElementById('lng').value = el.lng.toFixed(6);
        }

        // Update layers
        const newSectorPoints = getSectorPoints(el.lat, el.lng, el.azimuth, el.radius, el.beamwidth);
        sectorLayer.setLatLngs(newSectorPoints);
        marker.setPopupContent(buildErbPopup(el));

        updateElementsList();
    });

    // 4. Persistent Label
    const dateStr = formatShortDateTime(el.datetime);
    const labelContent = dateStr ? `${el.name}<br><small style="opacity: 0.8">${dateStr}</small>` : el.name;

    marker.bindTooltip(labelContent, {
        permanent: true,
        direction: 'top',
        className: 'custom-label',
        offset: [0, -10],
        html: true
    });

    marker.bindPopup(buildErbPopup(el));

    plottedElements.push(el);

    updateElementMapVisibility(el);
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
        }),
        draggable: true
    });

    // Support measurement on marker click
    marker.on('click', (e) => {
        if (isMeasuring) {
            addMeasurePoint(e.latlng);
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        }
    });

    // 2. Store (created before the handlers so drag updates the stored element, not a stale copy)
    const el = {
        ...data,
        marker: marker,
        isTimeVisible: true
    };

    // Draggable logic for POI
    marker.on('dragend', function (e) {
        const newLatLng = e.target.getLatLng();
        el.lat = newLatLng.lat;
        el.lng = newLatLng.lng;

        // Update form if this element is being edited
        if (currentEditId === el.id) {
            document.getElementById('poi-lat').value = el.lat.toFixed(6);
            document.getElementById('poi-lng').value = el.lng.toFixed(6);
        }

        marker.setPopupContent(buildPoiPopup(el));
        updateElementsList();
    });

    // 3. Persistent Label
    marker.bindTooltip(el.name, {
        permanent: true,
        direction: 'top',
        className: 'custom-label',
        offset: [0, -25]
    });

    marker.bindPopup(buildPoiPopup(el));

    plottedElements.push(el);

    updateElementMapVisibility(el);
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

        const typeIcon = el.type === 'ERB' ? 'fas fa-tower-broadcast' : `fas fa-${el.icon || 'location-dot'}`;
        let subtitle = el.type === 'ERB' ? `${el.azimuth}° | ${el.radius}m` : `${el.lat.toFixed(4)}, ${el.lng.toFixed(4)}`;

        if (el.datetime) {
            const date = new Date(el.datetime);
            const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            subtitle += ` | ${dateStr} ${timeStr}`;
        }

        const isActuallyVisible = el.isVisible && (el.isTimeVisible || showAllTimestamps);
        const visibilityIcon = isActuallyVisible ? 'fa-eye' : 'fa-eye-slash';

        li.innerHTML = `
            <div class="element-info" style="opacity: ${isActuallyVisible ? '1' : '0.5'}">
                <h4><i class="${typeIcon}" style="color: ${el.color}; margin-right: 8px;"></i>${el.name}</h4>
                <p>${subtitle} ${!el.isTimeVisible ? '<span style="color: #ff4757; font-size: 10px;">(Oculto pelo tempo)</span>' : ''}</p>
            </div>
            <div class="item-actions">
                <button class="item-btn visibility-btn" onclick="toggleVisibility(${el.id})" title="Ocultar/Mostrar"><i class="fas ${visibilityIcon}"></i></button>
                <button class="item-btn focus-btn" onclick="focusElement(${el.id})" title="Focar no mapa"><i class="fas fa-crosshairs"></i></button>
                <button class="item-btn edit-btn" onclick="editElement(${el.id})" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="item-btn delete-btn" onclick="deleteElement(${el.id})" title="Excluir"><i class="fas fa-trash-can"></i></button>
            </div>
        `;
        elementsList.appendChild(li);
    });

    // Auto-hide one panel on small screens if both are open
    if (window.innerWidth <= 768 && rightSidebar.classList.contains('visible') && !sidebar.classList.contains('hidden')) {
        // Typically we want to see the elements list, so hide the left panel
        // sidebar.classList.add('hidden');
    }
}

// Master Visibility Toggle
const globalVisibilityToggle = document.getElementById('global-visibility-toggle');
if (globalVisibilityToggle) {
    globalVisibilityToggle.addEventListener('click', () => {
        // Decide state based on showAllTimestamps (if we are showing everything, we want to go back to filtered)
        const currentlyShowingEverything = showAllTimestamps;

        if (currentlyShowingEverything) {
            // Restore Filters / Filtered State
            showAllTimestamps = false;
            allLabelsVisible = false;
            map.getContainer().classList.add('labels-hidden');
            // We keep elements manual visibility as is, or we could reset it. 
            // The prompt says "show/hide all", but also "similar role".
            // Let's make it toggle between "Show All (No filters)" and "Apply Filters".
        } else {
            // "Exibir Tudo" - Master Show
            showAllTimestamps = true;
            allLabelsVisible = true;
            map.getContainer().classList.remove('labels-hidden');
            plottedElements.forEach(el => {
                el.isVisible = true;
                updateElementMapVisibility(el);
            });
        }

        updateTemporalSlider();
        updateElementsList();

        // Update icon visually
        const icon = globalVisibilityToggle.querySelector('i');
        globalVisibilityToggle.classList.toggle('active', showAllTimestamps);
        if (showAllTimestamps) {
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
}

// Global Labels Toggle
const globalLabelsToggle = document.getElementById('global-labels-toggle');
if (globalLabelsToggle) {
    globalLabelsToggle.addEventListener('click', () => {
        allLabelsVisible = !allLabelsVisible;
        const isHidden = !allLabelsVisible;
        map.getContainer().classList.toggle('labels-hidden', isHidden);
        globalLabelsToggle.classList.toggle('active', allLabelsVisible);
    });
    // Set active by default
    globalLabelsToggle.classList.add('active');
}


function focusElement(id) {
    const el = plottedElements.find(e => e.id === id);
    if (el) {
        if (!el.isVisible || !el.isTimeVisible) {
            // Force visible if focused
            el.isVisible = true;
            el.isTimeVisible = true;
            updateTemporalSlider();
        }
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
        document.getElementById('erb-datetime').value = toDatetimeLocalValue(el.datetime);
        erbForm.querySelector('.btn-primary').textContent = 'Atualizar ERB';
    } else {
        // Switch to POI tab
        document.querySelector('[data-tab="poi-tab"]').click();
        document.getElementById('poi-lat').value = el.lat.toFixed(6);
        document.getElementById('poi-lng').value = el.lng.toFixed(6);
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
        updateTemporalSlider();
    }
}

function toggleVisibility(id) {
    const el = plottedElements.find(e => e.id === id);
    if (el) {
        if (!el.isTimeVisible && !showAllTimestamps && el.datetime !== null) {
            // If hidden by time, jump to that time
            currentSliderTimestamp = el.datetime;
            el.isVisible = true; // Also ensure manual visibility
            updateTemporalSlider();
        } else {
            // Standard manual toggle
            el.isVisible = !el.isVisible;
            updateElementMapVisibility(el);
            updateElementsList();
        }
    }
}

window.deleteElement = deleteElement;
window.toggleVisibility = toggleVisibility;

// --- Temporal Slider Logic ---

let timedElements = [];
let uniqueTimestamps = [];

function updateTemporalSlider() {
    timedElements = plottedElements.filter(el => el.datetime !== null).sort((a, b) => a.datetime - b.datetime);
    uniqueTimestamps = [...new Set(timedElements.map(el => el.datetime))].sort((a, b) => a - b);

    if (uniqueTimestamps.length < 2) {
        timeSliderContainer.classList.add('hidden');
        // Show everything if slider is hidden
        plottedElements.forEach(el => {
            el.isTimeVisible = true;
            updateElementMapVisibility(el);
        });
        updateElementsList();
        return;
    }

    timeSliderContainer.classList.remove('hidden');
    timeSlider.max = uniqueTimestamps.length - 1;

    // Default to first position if not set or out of bounds
    if (currentSliderTimestamp === null || !uniqueTimestamps.includes(currentSliderTimestamp)) {
        timeSlider.value = 0;
        currentSliderTimestamp = uniqueTimestamps[0];
    } else {
        timeSlider.value = uniqueTimestamps.indexOf(currentSliderTimestamp);
    }

    updateSliderDisplay();
    filterElementsByTime();
}

function updateSliderDisplay() {
    if (currentSliderTimestamp) {
        const date = new Date(currentSliderTimestamp);
        currentTimeDisplay.textContent = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
}

function filterElementsByTime() {
    plottedElements.forEach(el => {
        if (el.type === 'POI') {
            // POIs are always visible by default as requested
            el.isTimeVisible = true;
        } else if (el.datetime === null) {
            // ERBs without date are also always visible
            el.isTimeVisible = true;
        } else if (showAllTimestamps) {
            // Show all ERBs if toggle is active
            el.isTimeVisible = true;
        } else {
            // Point-in-time: show only ERBs matching the exact selected timestamp
            el.isTimeVisible = el.datetime === currentSliderTimestamp;
        }
        updateElementMapVisibility(el);
    });
    updateElementsList();

    // Auto-center map on the currently visible ERB (point-in-time)
    if (!showAllTimestamps) {
        const visibleErb = plottedElements.find(el => el.type === 'ERB' && el.isTimeVisible && el.isVisible);
        if (visibleErb) {
            map.panTo([visibleErb.lat, visibleErb.lng]);
        }
    }
}

function updateElementMapVisibility(el) {
    const shouldBeVisible = el.isVisible && (el.isTimeVisible || showAllTimestamps);

    if (shouldBeVisible) {
        if (el.layers) el.layers.forEach(l => { if (!map.hasLayer(l)) map.addLayer(l) });
        if (el.marker) { if (!map.hasLayer(el.marker)) map.addLayer(el.marker) };
    } else {
        if (el.layers) el.layers.forEach(l => map.removeLayer(l));
        if (el.marker) map.removeLayer(el.marker);
    }
}

// Slider Event Listeners
if (timeSlider) {
    timeSlider.addEventListener('input', () => {
        currentSliderTimestamp = uniqueTimestamps[parseInt(timeSlider.value)];
        showAllTimestamps = false;

        // Sync master toggle icon
        if (globalVisibilityToggle) {
            globalVisibilityToggle.classList.remove('active');
            const icon = globalVisibilityToggle.querySelector('i');
            if (icon) icon.classList.replace('fa-eye-slash', 'fa-eye');
        }

        updateSliderDisplay();
        filterElementsByTime();
    });
}

if (sliderPrevBtn) {
    sliderPrevBtn.addEventListener('click', () => {
        let val = parseInt(timeSlider.value);
        if (val > 0) {
            timeSlider.value = val - 1;
            timeSlider.dispatchEvent(new Event('input'));
        }
    });
}

if (sliderNextBtn) {
    sliderNextBtn.addEventListener('click', () => {
        let val = parseInt(timeSlider.value);
        if (val < uniqueTimestamps.length - 1) {
            timeSlider.value = val + 1;
            timeSlider.dispatchEvent(new Event('input'));
        }
    });
}


// Keyboard Navigation for Slider
window.addEventListener('keydown', (e) => {
    if (!timeSlider || timeSliderContainer.classList.contains('hidden')) return;

    // Ignore if user is typing in an input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        let val = parseInt(timeSlider.value);
        if (e.key === 'ArrowLeft' && val > 0) {
            timeSlider.value = val - 1;
            timeSlider.dispatchEvent(new Event('input'));
        } else if (e.key === 'ArrowRight' && val < uniqueTimestamps.length - 1) {
            timeSlider.value = val + 1;
            timeSlider.dispatchEvent(new Event('input'));
        }
    }
});

function parseDateRobust(val) {
    if (!val) return null;
    if (val instanceof Date) return val.getTime();

    // Brazilian format first (DD/MM/YYYY HH:mm:ss or similar). It must run before the
    // native parser, which reads "05/09/2026" as May 9th instead of September 5th.
    if (typeof val === 'string') {
        const parts = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[^\d]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (parts) {
            const day = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10) - 1;
            const year = parseInt(parts[3], 10);
            const hour = parts[4] ? parseInt(parts[4], 10) : 0;
            const min = parts[5] ? parseInt(parts[5], 10) : 0;
            const sec = parts[6] ? parseInt(parts[6], 10) : 0;

            const nativeDate = new Date(year, month, day, hour, min, sec);
            return isNaN(nativeDate.getTime()) ? null : nativeDate.getTime();
        }
    }

    // Fallback to native parsing (handles ISO strings and Excel serial dates already converted)
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.getTime();

    return null;
}

// --- Helpers ---

/** Returns the number itself when it is a valid number, otherwise "" (so 0 is preserved on export). */
function numberOrEmpty(value) {
    return (typeof value === 'number' && !isNaN(value)) ? value : "";
}

/** Parses a spreadsheet cell as a number; empty/missing/invalid cells become undefined instead of NaN. */
function parseNumberOrUndefined(value) {
    if (value === undefined || value === null || value === "") return undefined;
    const n = parseFloat(value);
    return isNaN(n) ? undefined : n;
}

/** Formats a timestamp as DD/MM HH:mm for labels and popups. Returns "" when there is no date. */
function formatShortDateTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Converts a timestamp to the "YYYY-MM-DDTHH:mm" local value expected by <input type="datetime-local">. */
function toDatetimeLocalValue(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildErbPopup(el) {
    const dateStr = formatShortDateTime(el.datetime);
    return `<b>${el.name} (ERB)</b><br>Lat: ${el.lat}<br>Lng: ${el.lng}<br>Azimute: ${el.azimuth}°<br>Raio: ${el.radius}m${dateStr ? '<br>Data: ' + dateStr : ''}`;
}

function buildPoiPopup(el) {
    return `<b>${el.name} (Ponto)</b><br>Lat: ${el.lat}<br>Lng: ${el.lng}`;
}
