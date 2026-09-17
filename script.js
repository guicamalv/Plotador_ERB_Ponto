/* global L, XLSX, PlotadorUtils */
(function () {
    'use strict';

    const {
        DEFAULT_ERB_COLOR,
        DEFAULT_POI_COLOR,
        getSectorPoints,
        parseDateRobust,
        numberOrEmpty,
        parseNumberOrUndefined,
        formatShortDateTime,
        formatFullDateTime,
        toDatetimeLocalValue,
        escapeHtml,
        sanitizeColor,
        sanitizeIcon,
        formatDistance,
        generateId
    } = PlotadorUtils;

    const STORAGE_KEY = 'plotador_erb_ponto_state_v1';
    const DEFAULT_ICON = 'location-dot';

    // =========================================================================
    // Mapa e camadas base
    // =========================================================================

    const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: osmAttribution
    });

    const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: osmAttribution + ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: osmAttribution + ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    // As camadas do Google usam um endpoint sem chave de API e podem falhar sem aviso.
    // Por isso, se os tiles do Google não carregarem, o mapa cai automaticamente
    // para o OpenStreetMap (ver watchGoogleTiles abaixo).
    const googleOptions = { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google Maps' };
    const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', googleOptions);
    const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', googleOptions);
    const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', googleOptions);

    const FALLBACK_LAYER = osmStandard;

    const map = L.map('map', {
        center: [-15.793889, -47.882778],
        zoom: 13,
        layers: [googleRoadmap]
    });

    L.control.layers({
        'Google Roadmap': googleRoadmap,
        'Google Satélite': googleSatellite,
        'Google Híbrido': googleHybrid,
        'OpenStreetMap': osmStandard,
        'CARTO Claro': cartoLight,
        'CARTO Escuro': cartoDark
    }).addTo(map);

    /**
     * Fallback automático: se uma camada do Google acumular erros de tile sem
     * nenhum tile carregado com sucesso, troca para o OpenStreetMap e avisa.
     */
    function watchGoogleTiles(layer) {
        const TILE_ERROR_THRESHOLD = 4;
        let errors = 0;
        let loaded = 0;
        let switched = false;

        layer.on('tileload', () => { loaded++; });
        layer.on('tileerror', () => {
            errors++;
            if (switched || loaded > 0 || errors < TILE_ERROR_THRESHOLD || !map.hasLayer(layer)) return;
            switched = true;
            map.removeLayer(layer);
            map.addLayer(FALLBACK_LAYER);
            showToast('Os mapas do Google não estão disponíveis. Usando OpenStreetMap como alternativa.');
        });
        layer.on('remove', () => {
            // Reinicia a contagem para uma nova tentativa quando o usuário reativar a camada
            errors = 0;
            loaded = 0;
            switched = false;
        });
    }

    [googleRoadmap, googleSatellite, googleHybrid].forEach(watchGoogleTiles);

    // =========================================================================
    // Estado
    // =========================================================================

    let plottedElements = [];
    let selectedPoiIcon = DEFAULT_ICON;
    let currentEditId = null;
    let showAllTimestamps = false;
    let allLabelsVisible = true;
    let currentSliderTimestamp = null;
    let uniqueTimestamps = [];

    // Quando verdadeiro, plotERB/plotPOI não reconstroem a lista a cada chamada
    // (usado na importação e na restauração para evitar custo quadrático).
    let suppressListUpdates = false;

    // =========================================================================
    // Elementos do DOM
    // =========================================================================

    const $ = id => document.getElementById(id);

    const sidebar = $('sidebar');
    const toggleBtn = $('toggle-panel');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const erbForm = $('erb-form');
    const poiForm = $('poi-form');
    const elementsList = $('elements-list');
    const elementCount = $('element-count');
    const clearAllBtn = $('clear-all');
    const exportBtn = $('export-btn');
    const importBtn = $('import-btn');
    const fileInput = $('file-input');
    const poiIconButtons = document.querySelectorAll('#poi-icon-selector .icon-btn');
    const rightSidebar = $('right-sidebar');
    const elementsSearchInput = $('elements-search');
    const showAllBtn = $('show-all');
    const searchInput = $('search-input');
    const searchBtn = $('search-btn');
    const measureBtn = $('measure-btn');
    const timeSliderContainer = $('time-slider-container');
    const timeSlider = $('time-slider');
    const currentTimeDisplay = $('current-time-display');
    const sliderPrevBtn = $('slider-prev');
    const sliderNextBtn = $('slider-next');
    const helpBtn = $('help-btn');
    const helpModal = $('help-modal');
    const closeModalBtn = $('close-modal');
    const globalVisibilityToggle = $('global-visibility-toggle');
    const globalLabelsToggle = $('global-labels-toggle');
    const erbSubmitBtn = erbForm.querySelector('.btn-primary');
    const poiSubmitBtn = poiForm.querySelector('.btn-primary');

    // =========================================================================
    // Interface básica: painéis, abas, ajuda
    // =========================================================================

    poiIconButtons.forEach(btn => {
        btn.addEventListener('click', () => setSelectedPoiIcon(btn.dataset.icon));
    });

    function setSelectedPoiIcon(icon) {
        selectedPoiIcon = icon;
        poiIconButtons.forEach(b => b.classList.toggle('active', b.dataset.icon === icon));
    }

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.add('hidden');
        rightSidebar.classList.add('force-hidden');
        showAllBtn.classList.add('visible');
        timeSliderContainer.classList.add('force-hidden');
    });

    showAllBtn.addEventListener('click', () => {
        sidebar.classList.remove('hidden');
        rightSidebar.classList.remove('force-hidden');
        showAllBtn.classList.remove('visible');
        timeSliderContainer.classList.remove('force-hidden');
    });

    helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.classList.add('hidden');
    });

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

    function activateTab(tabId) {
        tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        tabContents.forEach(c => c.classList.toggle('active', c.id === tabId));
    }

    function getActiveTab() {
        const active = document.querySelector('.tab-btn.active');
        return active ? active.dataset.tab : 'erb-tab';
    }

    // =========================================================================
    // Busca de endereço (Nominatim)
    // =========================================================================

    let searchInFlight = false;

    searchBtn.addEventListener('click', searchAddress);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchAddress();
        }
    });

    async function searchAddress() {
        const query = searchInput.value.trim();
        if (!query || searchInFlight) return;

        searchInFlight = true;
        searchBtn.disabled = true;
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=pt-BR&q=' + encodeURIComponent(query);
            const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();

            if (Array.isArray(data) && data.length > 0) {
                map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 13);
            } else {
                alert('Endereço não encontrado.');
            }
        } catch (error) {
            console.error('Erro na busca:', error);
            alert('Erro ao realizar busca. Verifique a conexão com a internet.');
        } finally {
            searchInFlight = false;
            searchBtn.disabled = false;
            searchBtn.innerHTML = '<i class="fas fa-search"></i>';
        }
    }

    // =========================================================================
    // Clique no mapa: captura de coordenadas ou medição
    // =========================================================================

    map.on('click', (e) => {
        if (isMeasuring) {
            addMeasurePoint(e.latlng);
            return;
        }

        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);

        if (getActiveTab() === 'erb-tab') {
            $('lat').value = lat;
            $('lng').value = lng;
        } else {
            $('poi-lat').value = lat;
            $('poi-lng').value = lng;
        }
    });

    // =========================================================================
    // Formulários
    // =========================================================================

    erbForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const datetimeValue = $('erb-datetime').value;
        const data = {
            type: 'ERB',
            lat: parseFloat($('lat').value),
            lng: parseFloat($('lng').value),
            azimuth: parseFloat($('azimuth').value),
            radius: parseFloat($('radius').value),
            beamwidth: parseFloat($('beamwidth').value),
            color: sanitizeColor($('erb-color').value, DEFAULT_ERB_COLOR),
            name: $('name').value.trim() || nextDefaultName('ERB'),
            datetime: datetimeValue ? parseDateRobust(datetimeValue) : null,
            id: currentEditId || generateId(),
            isVisible: true
        };

        const insertAt = finishEdit();
        plotERB(data, true, insertAt);

        erbForm.reset();
        $('beamwidth').value = 120;
        $('erb-color').value = DEFAULT_ERB_COLOR;
        updateTemporalSlider();
    });

    poiForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            type: 'POI',
            lat: parseFloat($('poi-lat').value),
            lng: parseFloat($('poi-lng').value),
            name: $('poi-name').value.trim() || nextDefaultName('Ponto'),
            color: sanitizeColor($('poi-color').value, DEFAULT_POI_COLOR),
            icon: sanitizeIcon(selectedPoiIcon, DEFAULT_ICON),
            datetime: null,
            id: currentEditId || generateId(),
            isVisible: true
        };

        const insertAt = finishEdit();
        plotPOI(data, true, insertAt);

        poiForm.reset();
        $('poi-color').value = DEFAULT_POI_COLOR;
        setSelectedPoiIcon(DEFAULT_ICON);
        updateTemporalSlider();
    });

    function nextDefaultName(prefix) {
        const count = plottedElements.filter(el => el.type === (prefix === 'ERB' ? 'ERB' : 'POI')).length;
        return `${prefix}_${String(count + 1).padStart(2, '0')}`;
    }

    /**
     * Encerra o modo de edição. Remove o elemento antigo do mapa e da lista e
     * devolve o índice em que ele estava, para o novo ocupar a mesma posição.
     */
    function finishEdit() {
        if (!currentEditId) return undefined;

        const index = plottedElements.findIndex(el => el.id === currentEditId);
        if (index !== -1) {
            removeElementLayers(plottedElements[index]);
            plottedElements.splice(index, 1);
        }
        currentEditId = null;
        erbSubmitBtn.textContent = 'Plotar ERB';
        poiSubmitBtn.textContent = 'Adicionar Ponto';
        return index === -1 ? undefined : index;
    }

    clearAllBtn.addEventListener('click', () => {
        if (!confirm('Deseja realmente apagar todos os elementos do mapa?')) return;

        plottedElements.forEach(removeElementLayers);
        plottedElements = [];
        currentEditId = null;
        erbSubmitBtn.textContent = 'Plotar ERB';
        poiSubmitBtn.textContent = 'Adicionar Ponto';
        updateElementsList();
        updateTemporalSlider();

        // Limpa a medição, mantendo o grupo de camadas no mapa para medições futuras
        measureLayer.clearLayers();
        measurePolyline = null;
        measurePoints = [];
        if (isMeasuring) stopMeasuring();

        clearPersistedState();
    });

    // =========================================================================
    // Medição de distância
    // =========================================================================

    let isMeasuring = false;
    let measurePoints = [];
    const measureLayer = L.layerGroup().addTo(map);
    let measurePolyline = null;
    let tempLine = null;

    measureBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMeasuring) {
            stopMeasuring();
            return;
        }

        isMeasuring = true;
        measureBtn.classList.add('active');
        measureBtn.innerHTML = '<i class="fas fa-times"></i>';
        map.getContainer().style.cursor = 'crosshair';
        measurePoints = [];
        measureLayer.clearLayers();
        measurePolyline = null;
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

        L.circleMarker(latlng, {
            radius: 4,
            color: DEFAULT_POI_COLOR,
            fillOpacity: 1,
            interactive: false
        }).addTo(measureLayer);

        if (measurePoints.length < 2) return;

        if (!measurePolyline) {
            measurePolyline = L.polyline(measurePoints, {
                color: DEFAULT_POI_COLOR,
                weight: 3,
                dashArray: '5, 10',
                interactive: false
            }).addTo(measureLayer);
        } else {
            measurePolyline.setLatLngs(measurePoints);
        }

        let totalDist = 0;
        for (let i = 0; i < measurePoints.length - 1; i++) {
            totalDist += measurePoints[i].distanceTo(measurePoints[i + 1]);
        }

        L.marker(latlng, {
            icon: L.divIcon({
                className: 'measure-label',
                html: `<span>${formatDistance(totalDist)}</span>`,
                iconSize: [100, 20],
                iconAnchor: [50, -10]
            }),
            interactive: false
        }).addTo(measureLayer);
    }

    map.on('mousemove', (e) => {
        if (!isMeasuring || measurePoints.length === 0) return;

        if (tempLine) map.removeLayer(tempLine);
        const lastPoint = measurePoints[measurePoints.length - 1];
        tempLine = L.polyline([lastPoint, e.latlng], {
            color: DEFAULT_POI_COLOR,
            weight: 2,
            dashArray: '5, 5',
            opacity: 0.5,
            interactive: false
        }).addTo(map);
    });

    // =========================================================================
    // Exportação e importação (Excel)
    // =========================================================================

    exportBtn.addEventListener('click', () => {
        let dataToExport;
        let fileName = `Plotador_ERB_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;

        if (plottedElements.length === 0) {
            alert('Não há elementos plotados no mapa. Será feito o download de um modelo de planilha com cabeçalhos e dados de exemplo aceitos pela ferramenta.');
            const now = Date.now();
            dataToExport = [
                {
                    Tipo: 'ERB', Nome: 'Exemplo ERB', Latitude: -15.7938, Longitude: -47.8827,
                    Azimute: 120, Raio: 500, Abertura: 120, Cor: DEFAULT_ERB_COLOR, Icone: '',
                    Data: new Date(now).toLocaleDateString('pt-BR'),
                    Hora: new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                },
                {
                    Tipo: 'POI', Nome: 'Exemplo Ponto', Latitude: -15.7950, Longitude: -47.8850,
                    Azimute: '', Raio: '', Abertura: '', Cor: DEFAULT_POI_COLOR, Icone: DEFAULT_ICON,
                    Data: '', Hora: ''
                }
            ];
            fileName = 'Modelo_Importacao_Plotador.xlsx';
        } else {
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
                    Icone: el.icon || '',
                    Data: dateObj ? dateObj.toLocaleDateString('pt-BR') : '',
                    Hora: dateObj ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
                };
            });
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
        XLSX.writeFile(workbook, fileName);
    });

    importBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array', cellDates: true });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(worksheet);

                if (rows.length === 0) {
                    alert('O arquivo está vazio.');
                    return;
                }

                const result = importRows(rows);

                if (result.imported === 0) {
                    alert('Nenhuma linha válida foi encontrada. Verifique as colunas Tipo, Latitude e Longitude.');
                    return;
                }

                setShowAll(true);
                updateTemporalSlider();

                if (result.firstLatLng) map.flyTo(result.firstLatLng, 13);

                if (result.skipped > 0) {
                    alert(`${result.imported} elemento(s) importado(s). ${result.skipped} linha(s) ignorada(s) por dados inválidos.`);
                }
            } catch (error) {
                console.error('Erro ao importar Excel:', error);
                alert('Erro ao processar o arquivo. Verifique o formato.');
            } finally {
                fileInput.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    });

    /** Converte uma linha da planilha em elemento; devolve null quando inválida. */
    function rowToElement(item) {
        const type = String(item.Tipo ?? '').trim().toUpperCase();
        if (type !== 'ERB' && type !== 'POI') return null;

        const lat = parseNumberOrUndefined(item.Latitude);
        const lng = parseNumberOrUndefined(item.Longitude);
        if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

        let dateValue = item.Data_Hora || item['Data/Hora'] || item.DataHora || '';
        if (!dateValue && (item.Data || item.Date)) {
            const d = item.Data || item.Date;
            const h = item.Hora || item.Time || '';
            const datePart = d instanceof Date ? d.toLocaleDateString('pt-BR') : String(d);
            const timePart = h instanceof Date ? h.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : String(h);
            dateValue = timePart ? `${datePart} ${timePart}` : datePart;
        }

        const defaultColor = type === 'ERB' ? DEFAULT_ERB_COLOR : DEFAULT_POI_COLOR;
        const element = {
            type,
            name: String(item.Nome ?? '').trim() || nextDefaultName(type === 'ERB' ? 'ERB' : 'Ponto'),
            lat,
            lng,
            color: sanitizeColor(item.Cor, defaultColor),
            icon: type === 'POI' ? sanitizeIcon(item.Icone, DEFAULT_ICON) : '',
            datetime: dateValue ? parseDateRobust(dateValue) : null,
            id: generateId(),
            isVisible: true
        };

        if (type === 'ERB') {
            element.azimuth = parseNumberOrUndefined(item.Azimute);
            element.radius = parseNumberOrUndefined(item.Raio);
            element.beamwidth = parseNumberOrUndefined(item.Abertura);
            if (element.azimuth === undefined || element.radius === undefined || element.beamwidth === undefined) return null;
        }

        return element;
    }

    function importRows(rows) {
        let imported = 0;
        let skipped = 0;
        let firstLatLng = null;

        suppressListUpdates = true;
        try {
            rows.forEach(item => {
                const element = rowToElement(item);
                if (!element) {
                    skipped++;
                    return;
                }
                if (element.type === 'ERB') plotERB(element, false);
                else plotPOI(element, false);
                if (!firstLatLng) firstLatLng = [element.lat, element.lng];
                imported++;
            });
        } finally {
            suppressListUpdates = false;
        }

        updateElementsList();
        return { imported, skipped, firstLatLng };
    }

    // =========================================================================
    // Plotagem
    // =========================================================================

    function buildErbPopup(el) {
        const dateStr = formatShortDateTime(el.datetime);
        return `<b>${escapeHtml(el.name)} (ERB)</b><br>Lat: ${el.lat}<br>Lng: ${el.lng}` +
            `<br>Azimute: ${el.azimuth}°<br>Raio: ${el.radius}m` +
            (dateStr ? '<br>Data: ' + dateStr : '');
    }

    function buildPoiPopup(el) {
        return `<b>${escapeHtml(el.name)} (Ponto)</b><br>Lat: ${el.lat}<br>Lng: ${el.lng}`;
    }

    function buildMarkerIcon(faIcon, color, anchorBottom) {
        return L.divIcon({
            className: anchorBottom ? 'custom-poi-marker' : 'custom-erb-marker',
            html: `<i class="fas fa-${escapeHtml(faIcon)}" style="color: ${escapeHtml(color)}; font-size: 24px; text-shadow: 0 0 5px rgba(0,0,0,0.5);"></i>`,
            iconSize: [24, 24],
            iconAnchor: anchorBottom ? [12, 24] : [12, 12]
        });
    }

    function attachMeasureClick(marker) {
        marker.on('click', (e) => {
            if (isMeasuring) {
                addMeasurePoint(e.latlng);
                if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            }
        });
    }

    function storeElement(el, insertAt) {
        if (insertAt !== undefined && insertAt >= 0 && insertAt <= plottedElements.length) {
            plottedElements.splice(insertAt, 0, el);
        } else {
            plottedElements.push(el);
        }
    }

    function plotERB(data, shouldFly = true, insertAt) {
        const sectorLayer = L.polygon(getSectorPoints(data.lat, data.lng, data.azimuth, data.radius, data.beamwidth), {
            color: data.color,
            fillColor: data.color,
            fillOpacity: 0.3,
            weight: 2
        });

        const marker = L.marker([data.lat, data.lng], {
            icon: buildMarkerIcon('tower-broadcast', data.color, false),
            draggable: true
        });

        // O objeto armazenado é criado antes dos handlers para que o arrasto
        // atualize o próprio elemento, e não uma cópia desatualizada.
        const el = { ...data, layers: [sectorLayer], marker, isTimeVisible: true };

        attachMeasureClick(marker);

        marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            el.lat = pos.lat;
            el.lng = pos.lng;

            if (currentEditId === el.id) {
                $('lat').value = el.lat.toFixed(6);
                $('lng').value = el.lng.toFixed(6);
            }

            sectorLayer.setLatLngs(getSectorPoints(el.lat, el.lng, el.azimuth, el.radius, el.beamwidth));
            marker.setPopupContent(buildErbPopup(el));
            updateElementsList();
        });

        const dateStr = formatShortDateTime(el.datetime);
        const labelContent = dateStr
            ? `${escapeHtml(el.name)}<br><small style="opacity: 0.8">${dateStr}</small>`
            : escapeHtml(el.name);

        marker.bindTooltip(labelContent, {
            permanent: true,
            direction: 'top',
            className: 'custom-label',
            offset: [0, -10]
        });
        marker.bindPopup(buildErbPopup(el));

        storeElement(el, insertAt);
        updateElementMapVisibility(el);
        if (!suppressListUpdates) updateElementsList();
        if (shouldFly) map.flyTo([el.lat, el.lng], 14);
    }

    function plotPOI(data, shouldFly = true, insertAt) {
        const marker = L.marker([data.lat, data.lng], {
            icon: buildMarkerIcon(data.icon || DEFAULT_ICON, data.color, true),
            draggable: true
        });

        const el = { ...data, marker, isTimeVisible: true };

        attachMeasureClick(marker);

        marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            el.lat = pos.lat;
            el.lng = pos.lng;

            if (currentEditId === el.id) {
                $('poi-lat').value = el.lat.toFixed(6);
                $('poi-lng').value = el.lng.toFixed(6);
            }

            marker.setPopupContent(buildPoiPopup(el));
            updateElementsList();
        });

        marker.bindTooltip(escapeHtml(el.name), {
            permanent: true,
            direction: 'top',
            className: 'custom-label',
            offset: [0, -25]
        });
        marker.bindPopup(buildPoiPopup(el));

        storeElement(el, insertAt);
        updateElementMapVisibility(el);
        if (!suppressListUpdates) updateElementsList();
        if (shouldFly) map.flyTo([el.lat, el.lng], 15);
    }

    function removeElementLayers(el) {
        if (el.layers) el.layers.forEach(l => map.removeLayer(l));
        if (el.marker) map.removeLayer(el.marker);
    }

    // =========================================================================
    // Lista lateral
    // =========================================================================

    elementsSearchInput.addEventListener('input', updateElementsList);

    function updateElementsList() {
        const searchTerm = elementsSearchInput.value.trim().toLowerCase();

        rightSidebar.classList.toggle('visible', plottedElements.length > 0);

        const filteredElements = plottedElements.filter(el =>
            String(el.name).toLowerCase().includes(searchTerm) ||
            el.type.toLowerCase().includes(searchTerm) ||
            (el.type === 'ERB' && String(el.azimuth).includes(searchTerm))
        );

        elementCount.textContent = filteredElements.length;

        const html = filteredElements.map(el => {
            const typeIcon = el.type === 'ERB' ? 'fa-tower-broadcast' : `fa-${escapeHtml(el.icon || DEFAULT_ICON)}`;
            let subtitle = el.type === 'ERB'
                ? `${el.azimuth}° | ${el.radius}m`
                : `${el.lat.toFixed(4)}, ${el.lng.toFixed(4)}`;
            if (el.datetime) subtitle += ` | ${formatShortDateTime(el.datetime)}`;

            const isActuallyVisible = el.isVisible && (el.isTimeVisible || showAllTimestamps);
            const visibilityIcon = isActuallyVisible ? 'fa-eye' : 'fa-eye-slash';
            const hiddenByTime = !el.isTimeVisible ? '<span class="hidden-by-time">(Oculto pelo tempo)</span>' : '';
            const color = escapeHtml(el.color);

            return `
            <li class="element-item${isActuallyVisible ? '' : ' is-dimmed'}" data-id="${escapeHtml(el.id)}" style="border-left-color: ${color}">
                <div class="element-info">
                    <h4><i class="fas ${typeIcon}" style="color: ${color}"></i>${escapeHtml(el.name)}</h4>
                    <p>${escapeHtml(subtitle)} ${hiddenByTime}</p>
                </div>
                <div class="item-actions">
                    <button type="button" class="item-btn visibility-btn" data-action="toggle" title="Ocultar/Mostrar" aria-label="Ocultar ou mostrar"><i class="fas ${visibilityIcon}"></i></button>
                    <button type="button" class="item-btn focus-btn" data-action="focus" title="Focar no mapa" aria-label="Focar no mapa"><i class="fas fa-crosshairs"></i></button>
                    <button type="button" class="item-btn edit-btn" data-action="edit" title="Editar" aria-label="Editar"><i class="fas fa-edit"></i></button>
                    <button type="button" class="item-btn delete-btn" data-action="delete" title="Excluir" aria-label="Excluir"><i class="fas fa-trash-can"></i></button>
                </div>
            </li>`;
        }).join('');

        elementsList.innerHTML = html;
        schedulePersist();
    }

    // Delegação de eventos: um único listener para todos os botões da lista
    elementsList.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        const item = button.closest('.element-item');
        if (!item) return;

        const id = item.dataset.id;
        switch (button.dataset.action) {
            case 'toggle': toggleVisibility(id); break;
            case 'focus': focusElement(id); break;
            case 'edit': editElement(id); break;
            case 'delete': deleteElement(id); break;
        }
    });

    function focusElement(id) {
        const el = plottedElements.find(e => e.id === id);
        if (!el) return;

        if (!el.isVisible || !el.isTimeVisible) {
            el.isVisible = true;
            el.isTimeVisible = true;
            updateTemporalSlider();
        }
        map.flyTo([el.lat, el.lng], 15);
        if (el.marker) el.marker.openPopup();
    }

    function editElement(id) {
        const el = plottedElements.find(e => e.id === id);
        if (!el) return;

        currentEditId = id;

        if (el.type === 'ERB') {
            activateTab('erb-tab');
            $('lat').value = el.lat.toFixed(6);
            $('lng').value = el.lng.toFixed(6);
            $('azimuth').value = el.azimuth;
            $('radius').value = el.radius;
            $('beamwidth').value = el.beamwidth;
            $('erb-color').value = el.color;
            $('name').value = el.name;
            $('erb-datetime').value = toDatetimeLocalValue(el.datetime);
            erbSubmitBtn.textContent = 'Atualizar ERB';
        } else {
            activateTab('poi-tab');
            $('poi-lat').value = el.lat.toFixed(6);
            $('poi-lng').value = el.lng.toFixed(6);
            $('poi-name').value = el.name;
            $('poi-color').value = el.color;
            setSelectedPoiIcon(el.icon || DEFAULT_ICON);
            poiSubmitBtn.textContent = 'Atualizar Ponto';
        }

        sidebar.classList.remove('hidden');
        showAllBtn.classList.remove('visible');
    }

    function deleteElement(id) {
        const index = plottedElements.findIndex(e => e.id === id);
        if (index === -1) return;

        removeElementLayers(plottedElements[index]);
        plottedElements.splice(index, 1);

        if (currentEditId === id) {
            currentEditId = null;
            erbSubmitBtn.textContent = 'Plotar ERB';
            poiSubmitBtn.textContent = 'Adicionar Ponto';
            erbForm.reset();
            poiForm.reset();
            $('beamwidth').value = 120;
            $('erb-color').value = DEFAULT_ERB_COLOR;
            $('poi-color').value = DEFAULT_POI_COLOR;
            setSelectedPoiIcon(DEFAULT_ICON);
        }

        updateElementsList();
        updateTemporalSlider();
        if (plottedElements.length === 0) clearPersistedState();
    }

    function toggleVisibility(id) {
        const el = plottedElements.find(e => e.id === id);
        if (!el) return;

        if (!el.isTimeVisible && !showAllTimestamps && el.datetime !== null) {
            // Oculto pelo tempo: pula o slider para o instante do elemento
            currentSliderTimestamp = el.datetime;
            el.isVisible = true;
            updateTemporalSlider();
        } else {
            el.isVisible = !el.isVisible;
            updateElementMapVisibility(el);
            updateElementsList();
        }
    }

    // =========================================================================
    // Botões globais: exibir tudo e rótulos
    // =========================================================================

    function setShowAll(value) {
        showAllTimestamps = value;
        globalVisibilityToggle.classList.toggle('active', value);
        const icon = globalVisibilityToggle.querySelector('i');
        icon.classList.toggle('fa-eye', !value);
        icon.classList.toggle('fa-eye-slash', value);
    }

    function setLabelsVisible(value) {
        allLabelsVisible = value;
        map.getContainer().classList.toggle('labels-hidden', !value);
        globalLabelsToggle.classList.toggle('active', value);
    }

    globalVisibilityToggle.addEventListener('click', () => {
        if (showAllTimestamps) {
            setShowAll(false);
            setLabelsVisible(false);
        } else {
            setShowAll(true);
            setLabelsVisible(true);
            plottedElements.forEach(el => {
                el.isVisible = true;
                updateElementMapVisibility(el);
            });
        }
        updateTemporalSlider();
        updateElementsList();
    });

    globalLabelsToggle.addEventListener('click', () => setLabelsVisible(!allLabelsVisible));
    setLabelsVisible(true);

    // =========================================================================
    // Slider temporal
    // =========================================================================

    function updateTemporalSlider() {
        uniqueTimestamps = [...new Set(
            plottedElements.filter(el => el.datetime !== null).map(el => el.datetime)
        )].sort((a, b) => a - b);

        if (uniqueTimestamps.length < 2) {
            timeSliderContainer.classList.add('hidden');
            map.keyboard.enable();
            plottedElements.forEach(el => {
                el.isTimeVisible = true;
                updateElementMapVisibility(el);
            });
            updateElementsList();
            return;
        }

        timeSliderContainer.classList.remove('hidden');
        // Enquanto o slider está visível, as setas do teclado controlam o slider e não o mapa
        map.keyboard.disable();
        timeSlider.max = uniqueTimestamps.length - 1;

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
            currentTimeDisplay.textContent = formatFullDateTime(currentSliderTimestamp);
        }
    }

    function filterElementsByTime() {
        plottedElements.forEach(el => {
            if (el.type === 'POI' || el.datetime === null || showAllTimestamps) {
                el.isTimeVisible = true;
            } else {
                el.isTimeVisible = el.datetime === currentSliderTimestamp;
            }
            updateElementMapVisibility(el);
        });
        updateElementsList();

        if (!showAllTimestamps) {
            const visibleErb = plottedElements.find(el => el.type === 'ERB' && el.isTimeVisible && el.isVisible);
            if (visibleErb) map.panTo([visibleErb.lat, visibleErb.lng]);
        }
    }

    function updateElementMapVisibility(el) {
        const shouldBeVisible = el.isVisible && (el.isTimeVisible || showAllTimestamps);
        const layers = [...(el.layers || []), el.marker].filter(Boolean);

        layers.forEach(layer => {
            if (shouldBeVisible && !map.hasLayer(layer)) map.addLayer(layer);
            if (!shouldBeVisible && map.hasLayer(layer)) map.removeLayer(layer);
        });
    }

    function stepSlider(delta) {
        const val = parseInt(timeSlider.value, 10);
        const next = val + delta;
        if (next < 0 || next > uniqueTimestamps.length - 1) return;
        timeSlider.value = next;
        timeSlider.dispatchEvent(new Event('input'));
    }

    timeSlider.addEventListener('input', () => {
        currentSliderTimestamp = uniqueTimestamps[parseInt(timeSlider.value, 10)];
        setShowAll(false);
        updateSliderDisplay();
        filterElementsByTime();
    });

    sliderPrevBtn.addEventListener('click', () => stepSlider(-1));
    sliderNextBtn.addEventListener('click', () => stepSlider(1));

    // =========================================================================
    // Teclado
    // =========================================================================

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isMeasuring) {
                stopMeasuring();
                measureLayer.clearLayers();
                measurePolyline = null;
                measurePoints = [];
            } else if (!helpModal.classList.contains('hidden')) {
                helpModal.classList.add('hidden');
            }
            return;
        }

        if (timeSliderContainer.classList.contains('hidden')) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            stepSlider(e.key === 'ArrowLeft' ? -1 : 1);
        }
    });

    // =========================================================================
    // Notificações discretas
    // =========================================================================

    let toastTimer = null;

    function showToast(message, duration = 6000) {
        let toast = $('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
    }

    // =========================================================================
    // Persistência local (localStorage)
    // =========================================================================

    let persistTimer = null;

    function serializeState() {
        return {
            version: 1,
            elements: plottedElements.map(el => ({
                type: el.type,
                name: el.name,
                lat: el.lat,
                lng: el.lng,
                azimuth: el.azimuth,
                radius: el.radius,
                beamwidth: el.beamwidth,
                color: el.color,
                icon: el.icon,
                datetime: el.datetime,
                id: el.id,
                isVisible: el.isVisible
            }))
        };
    }

    function schedulePersist() {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(persistState, 300);
    }

    function persistState() {
        try {
            if (plottedElements.length === 0) {
                localStorage.removeItem(STORAGE_KEY);
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
            }
        } catch (error) {
            // Armazenamento indisponível (modo privado, cota cheia): segue sem persistir
            console.warn('Não foi possível salvar o estado localmente:', error);
        }
    }

    function clearPersistedState() {
        clearTimeout(persistTimer);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.warn('Não foi possível limpar o estado local:', error);
        }
    }

    function restoreState() {
        let saved;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            saved = JSON.parse(raw);
        } catch (error) {
            console.warn('Estado local ignorado:', error);
            return false;
        }

        if (!saved || !Array.isArray(saved.elements) || saved.elements.length === 0) return false;

        suppressListUpdates = true;
        try {
            saved.elements.forEach(item => {
                const element = rowToElement({
                    Tipo: item.type,
                    Nome: item.name,
                    Latitude: item.lat,
                    Longitude: item.lng,
                    Azimute: item.azimuth,
                    Raio: item.radius,
                    Abertura: item.beamwidth,
                    Cor: item.color,
                    Icone: item.icon
                });
                if (!element) return;
                element.datetime = typeof item.datetime === 'number' ? item.datetime : null;
                element.isVisible = item.isVisible !== false;
                if (typeof item.id === 'string') element.id = item.id;
                if (element.type === 'ERB') plotERB(element, false);
                else plotPOI(element, false);
            });
        } finally {
            suppressListUpdates = false;
        }

        if (plottedElements.length === 0) return false;

        setShowAll(true);
        updateTemporalSlider();
        updateElementsList();

        const bounds = L.latLngBounds(plottedElements.map(el => [el.lat, el.lng]));
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        return true;
    }

    // =========================================================================
    // Inicialização
    // =========================================================================

    restoreState();

    // Acesso somente leitura para depuração no console e testes de integração
    window.PlotadorApp = Object.freeze({
        map,
        getElements: () => plottedElements.map(el => ({ ...el, layers: undefined, marker: undefined }))
    });
})();
