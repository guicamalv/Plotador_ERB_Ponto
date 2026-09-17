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
        formatArea,
        generateId,
        pointInSector,
        sectorsIntersection,
        coverageGrid,
        haversineDistance,
        bearingBetween,
        parseLatitude,
        parseLongitude,
        parseCoordinates,
        toDMS,
        formatUtm
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
        layers: [googleRoadmap],
        zoomControl: false,
        // Canvas em vez de SVG: milhares de setores continuam fluidos
        preferCanvas: true
    });

    const baseMaps = {
        'Google Roadmap': googleRoadmap,
        'Google Satélite': googleSatellite,
        'Google Híbrido': googleHybrid,
        'OpenStreetMap': osmStandard,
        'CARTO Claro': cartoLight,
        'CARTO Escuro': cartoDark
    };
    let currentBaseName = 'Google Roadmap';
    map.on('baselayerchange', (e) => { currentBaseName = e.name; });

    function setBaseLayer(name) {
        const layer = baseMaps[name];
        if (!layer) return false;
        Object.values(baseMaps).forEach(l => { if (l !== layer && map.hasLayer(l)) map.removeLayer(l); });
        if (!map.hasLayer(layer)) map.addLayer(layer);
        currentBaseName = name;
        return true;
    }

    // Controles no canto inferior direito, fora da área dos painéis laterais
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 160 }).addTo(map);

    // Tela cheia e localização atual
    const MapTools = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd() {
            const div = L.DomUtil.create('div', 'map-tools');
            div.innerHTML =
                '<button type="button" id="fullscreen-btn" title="Tela cheia" aria-label="Tela cheia"><i class="fas fa-expand"></i></button>' +
                '<button type="button" id="locate-btn" title="Minha localização" aria-label="Minha localização"><i class="fas fa-location-arrow"></i></button>';
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);
            div.querySelector('#fullscreen-btn').addEventListener('click', toggleFullscreen);
            div.querySelector('#locate-btn').addEventListener('click', locateUser);
            return div;
        }
    });
    map.addControl(new MapTools());

    const locateLayer = L.layerGroup().addTo(map);

    function toggleFullscreen() {
        const root = document.documentElement;
        if (!document.fullscreenElement) {
            const request = root.requestFullscreen || root.webkitRequestFullscreen;
            if (!request) {
                showToast('Este navegador não permite tela cheia por script.');
                return;
            }
            request.call(root).catch(() => showToast('Não foi possível entrar em tela cheia.'));
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        }
    }

    document.addEventListener('fullscreenchange', () => {
        const btn = $('fullscreen-btn');
        if (!btn) return;
        const active = !!document.fullscreenElement;
        btn.classList.toggle('active', active);
        btn.querySelector('i').className = active ? 'fas fa-compress' : 'fas fa-expand';
        btn.title = active ? 'Sair da tela cheia' : 'Tela cheia';
    });

    function locateUser() {
        if (!navigator.geolocation) {
            showToast('Este navegador não oferece geolocalização.');
            return;
        }
        const btn = $('locate-btn');
        btn.classList.add('active');
        navigator.geolocation.getCurrentPosition((pos) => {
            btn.classList.remove('active');
            const { latitude, longitude, accuracy } = pos.coords;
            locateLayer.clearLayers();
            L.circle([latitude, longitude], { radius: accuracy, color: '#4285f4', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(locateLayer);
            L.marker([latitude, longitude], {
                icon: L.divIcon({ className: 'locate-marker', html: '<span></span>', iconSize: [14, 14], iconAnchor: [7, 7] })
            }).addTo(locateLayer).bindPopup(`<b>Sua localização</b><br>Precisão: ±${Math.round(accuracy)} m${popupActions(latitude, longitude)}`);
            map.flyTo([latitude, longitude], Math.max(map.getZoom(), 16));
        }, (err) => {
            btn.classList.remove('active');
            const reasons = { 1: 'permissão negada', 2: 'posição indisponível', 3: 'tempo esgotado' };
            showToast(`Não foi possível obter a localização (${reasons[err.code] || 'erro'}).`);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    }

    // Agrupamento de pontos próximos, ligado automaticamente quando há muitos POIs
    const POI_CLUSTER_THRESHOLD = 50;
    const poiCluster = L.markerClusterGroup({
        maxClusterRadius: 45,
        disableClusteringAtZoom: 17,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        chunkedLoading: true
    }).addTo(map);
    let clusteringActive = false;

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
    let currentSliderTimestamp = null;   // início (ou instante único)
    let rangeEndTimestamp = null;        // fim, usado no modo intervalo
    let sliderMode = 'instant';          // 'instant' | 'range'
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
    const timeSliderEnd = $('time-slider-end');
    const sliderTrackFill = $('slider-track-fill');
    const sliderModeButtons = document.querySelectorAll('.slider-mode .mode-btn');
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
    const erbCoordsInput = $('erb-coords');
    const poiCoordsInput = $('poi-coords');
    const saveProjectBtn = $('save-project-btn');
    const openProjectBtn = $('open-project-btn');
    const projectInput = $('project-input');
    const shareLinkBtn = $('share-link-btn');
    const undoBtn = $('undo-btn');
    const radiusPoiSelect = $('radius-poi');
    const radiusMetersInput = $('radius-meters');
    const radiusBtn = $('radius-btn');

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

        fillActiveFormCoords(lat, lng);
    });

    /** Preenche latitude e longitude do formulário da aba ativa (ERB por padrão). */
    function fillActiveFormCoords(lat, lng) {
        if (getActiveTab() === 'poi-tab') {
            $('poi-lat').value = lat;
            $('poi-lng').value = lng;
        } else {
            $('lat').value = lat;
            $('lng').value = lng;
            if (getActiveTab() !== 'erb-tab') activateTab('erb-tab');
        }
    }

    // Botão direito: coordenadas do local nos três formatos e ações rápidas
    map.on('contextmenu', (e) => {
        const { lat, lng } = e.latlng;
        L.popup({ maxWidth: 320 })
            .setLatLng(e.latlng)
            .setContent(
                `<b>Local no mapa</b><br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}` +
                popupActions(lat, lng, true))
            .openOn(map);
    });

    // Campos "Colar coordenadas": aceitam decimal, GMS e UTM e preenchem lat/lng
    function bindCoordsInput(input, latId, lngId) {
        input.addEventListener('input', () => {
            const text = input.value.trim();
            input.classList.remove('is-valid', 'is-invalid');
            if (!text) return;
            const parsed = parseCoordinates(text);
            if (parsed) {
                $(latId).value = parsed.lat.toFixed(6);
                $(lngId).value = parsed.lng.toFixed(6);
                input.classList.add('is-valid');
            } else {
                input.classList.add('is-invalid');
            }
        });
    }
    bindCoordsInput(erbCoordsInput, 'lat', 'lng');
    bindCoordsInput(poiCoordsInput, 'poi-lat', 'poi-lng');

    function clearCoordsInputs() {
        [erbCoordsInput, poiCoordsInput].forEach(input => {
            input.value = '';
            input.classList.remove('is-valid', 'is-invalid');
        });
    }

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
        clearCoordsInputs();
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
        clearCoordsInputs();
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
            pushUndo(`edição de ${plottedElements[index].name}`);
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

        if (plottedElements.length > 0) pushUndo(`apagar tudo (${plottedElements.length} elementos)`);
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

        clearAnalysis();
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

        // Latitude/Longitude em decimal, GMS ou vírgula decimal; ou uma coluna única "Coordenadas" (inclusive UTM)
        let lat = parseLatitude(item.Latitude);
        let lng = parseLongitude(item.Longitude);
        if ((lat === undefined || lng === undefined) && (item.Coordenadas || item.Coordinates || item.UTM)) {
            const pair = parseCoordinates(item.Coordenadas || item.Coordinates || item.UTM);
            if (pair) ({ lat, lng } = pair);
        }
        if (lat === undefined || lng === undefined) return null;

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

        pushUndo(`importação de ${rows.length} linha${rows.length > 1 ? 's' : ''}`);
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

    /**
     * Bloco comum dos popups: coordenadas em GMS e UTM e ações (copiar, endereço,
     * Google Maps, Street View e, opcionalmente, usar no formulário).
     */
    function popupActions(lat, lng, withUse = false) {
        const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        const gm = `https://www.google.com/maps?q=${ll}`;
        const sv = `https://www.google.com/maps?q=&layer=c&cbll=${ll}`;
        return `
            <div class="popup-coords">${escapeHtml(toDMS(lat, lng))}<br>UTM ${escapeHtml(formatUtm(lat, lng))}</div>
            <div class="popup-actions">
                <button type="button" class="popup-btn" data-act="copy" data-ll="${ll}" title="Copiar coordenadas decimais"><i class="fas fa-copy"></i> Copiar</button>
                <button type="button" class="popup-btn" data-act="address" data-ll="${ll}" title="Buscar endereço aproximado (Nominatim)"><i class="fas fa-map-location-dot"></i> Endereço</button>
                <a class="popup-btn" href="${gm}" target="_blank" rel="noopener" title="Abrir no Google Maps"><i class="fas fa-map"></i> Maps</a>
                <a class="popup-btn" href="${sv}" target="_blank" rel="noopener" title="Abrir no Street View"><i class="fas fa-street-view"></i> Street View</a>
                ${withUse ? `<button type="button" class="popup-btn" data-act="use" data-ll="${ll}" title="Preencher latitude e longitude do formulário"><i class="fas fa-pen-to-square"></i> Usar no formulário</button>` : ''}
            </div>
            <div class="popup-address" data-address-for="${ll}"></div>`;
    }

    function buildErbPopup(el) {
        const dateStr = formatShortDateTime(el.datetime);
        return `<b>${escapeHtml(el.name)} (ERB)</b><br>Lat: ${el.lat}<br>Lng: ${el.lng}` +
            `<br>Azimute: ${el.azimuth}°<br>Raio: ${el.radius}m` +
            (dateStr ? '<br>Data: ' + dateStr : '') +
            popupActions(el.lat, el.lng);
    }

    function buildPoiPopup(el) {
        return `<b>${escapeHtml(el.name)} (Ponto)</b><br>Lat: ${el.lat}<br>Lng: ${el.lng}` + popupActions(el.lat, el.lng);
    }

    // Ações dos popups (delegação: os popups são recriados a cada abertura)
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.popup-btn[data-act]');
        if (!btn) return;
        const [lat, lng] = btn.dataset.ll.split(',').map(parseFloat);

        if (btn.dataset.act === 'copy') {
            const ok = await copyText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            showToast(ok ? 'Coordenadas copiadas.' : 'Não foi possível copiar. Selecione e copie manualmente.', 3000);
        } else if (btn.dataset.act === 'use') {
            fillActiveFormCoords(lat.toFixed(6), lng.toFixed(6));
            map.closePopup();
            sidebar.classList.remove('hidden');
            showAllBtn.classList.remove('visible');
        } else if (btn.dataset.act === 'address') {
            const box = btn.closest('.leaflet-popup-content')?.querySelector(`.popup-address[data-address-for="${btn.dataset.ll}"]`);
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando';
            const address = await reverseGeocode(lat, lng);
            if (box) box.textContent = address || 'Endereço não encontrado.';
            btn.innerHTML = '<i class="fas fa-map-location-dot"></i> Endereço';
            btn.disabled = false;
        }
    });

    async function copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (error) {
            console.warn('Clipboard indisponível:', error);
        }
        // Reserva para contextos sem clipboard (file://, http sem TLS)
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
        area.remove();
        return ok;
    }

    const reverseCache = new Map();
    async function reverseGeocode(lat, lng) {
        const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        if (reverseCache.has(key)) return reverseCache.get(key);
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
            const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            const address = data && data.display_name ? data.display_name : null;
            reverseCache.set(key, address);
            return address;
        } catch (error) {
            console.warn('Geocodificação reversa falhou:', error);
            return null;
        }
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
        attachHover(el, [marker, sectorLayer]);

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
        attachHover(el, [marker]);

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
        if (el.marker) {
            if (poiCluster.hasLayer(el.marker)) poiCluster.removeLayer(el.marker);
            else if (map.hasLayer(el.marker)) map.removeLayer(el.marker);
        }
    }

    // =========================================================================
    // Ligação lista <-> mapa (destaque ao passar o mouse)
    // =========================================================================

    const SECTOR_STYLE = { weight: 2, fillOpacity: 0.3 };
    const SECTOR_STYLE_HOVER = { weight: 4, fillOpacity: 0.5 };
    let hoveredId = null;

    function setHover(id, on, fromMap = false) {
        const el = plottedElements.find(e => e.id === id);
        if (!el) return;
        if (el.layers) el.layers.forEach(l => l.setStyle(on ? SECTOR_STYLE_HOVER : SECTOR_STYLE));
        const markerEl = el.marker && el.marker.getElement();
        if (markerEl) markerEl.classList.toggle('is-hovered', on);
        const item = elementsList.querySelector(`.element-item[data-id="${CSS.escape(id)}"]`);
        if (item) {
            item.classList.toggle('is-hovered', on);
            if (on && fromMap) item.scrollIntoView({ block: 'nearest' });
        }
    }

    function attachHover(el, layers) {
        layers.forEach(layer => {
            layer.on('mouseover', () => setHover(el.id, true, true));
            layer.on('mouseout', () => setHover(el.id, false, true));
        });
    }

    elementsList.addEventListener('mouseover', (e) => {
        const item = e.target.closest('.element-item');
        if (!item || item.dataset.id === hoveredId) return;
        if (hoveredId) setHover(hoveredId, false);
        hoveredId = item.dataset.id;
        setHover(hoveredId, true);
    });

    elementsList.addEventListener('mouseleave', () => {
        if (hoveredId) setHover(hoveredId, false);
        hoveredId = null;
    });

    // =========================================================================
    // Agrupamento de pontos: move os marcadores de POI entre o mapa e o cluster
    // =========================================================================

    function poiContainer() {
        return clusteringActive ? poiCluster : map;
    }

    function syncPoiContainer() {
        const pois = plottedElements.filter(el => el.type === 'POI');
        const shouldCluster = pois.length > POI_CLUSTER_THRESHOLD;
        if (shouldCluster === clusteringActive) return;

        pois.forEach(el => {
            if (poiCluster.hasLayer(el.marker)) poiCluster.removeLayer(el.marker);
            else if (map.hasLayer(el.marker)) map.removeLayer(el.marker);
        });
        clusteringActive = shouldCluster;

        const shown = pois.filter(isElementShown).map(el => el.marker);
        if (clusteringActive) {
            poiCluster.addLayers(shown);
            showToast(`Mais de ${POI_CLUSTER_THRESHOLD} pontos: marcadores próximos passam a ser agrupados. Aproxime o zoom para separá-los.`, 5000);
        } else {
            shown.forEach(marker => map.addLayer(marker));
        }
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
        syncPoiContainer();
        syncVisibilityToggle();
        updateAnalysisSource();
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
        if (el.type === 'POI' && clusteringActive && poiCluster.hasLayer(el.marker)) {
            poiCluster.zoomToShowLayer(el.marker, () => el.marker.openPopup());
            return;
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

        pushUndo(`exclusão de ${plottedElements[index].name}`);
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

    /** Liga ou desliga o modo "Todos" do slider (ignora o filtro de tempo). */
    function setShowAll(value) {
        showAllTimestamps = value;
        syncSliderModeButtons();
    }

    /** Mantém o ícone do botão "olho" coerente com o estado dos elementos. */
    function syncVisibilityToggle() {
        const anyShown = plottedElements.some(el => el.isVisible);
        const icon = globalVisibilityToggle.querySelector('i');
        icon.classList.toggle('fa-eye', anyShown);
        icon.classList.toggle('fa-eye-slash', !anyShown);
        globalVisibilityToggle.classList.toggle('active', !anyShown && plottedElements.length > 0);
        globalVisibilityToggle.title = anyShown ? 'Ocultar todos os elementos' : 'Mostrar todos os elementos';
        globalVisibilityToggle.setAttribute('aria-label', globalVisibilityToggle.title);
    }

    function setLabelsVisible(value) {
        allLabelsVisible = value;
        map.getContainer().classList.toggle('labels-hidden', !value);
        globalLabelsToggle.classList.toggle('active', value);
    }

    // Olho: oculta todos os elementos de uma vez, ou mostra todos se estiverem ocultos
    globalVisibilityToggle.addEventListener('click', () => {
        if (plottedElements.length === 0) return;
        const showEverything = !plottedElements.some(el => el.isVisible);
        plottedElements.forEach(el => {
            el.isVisible = showEverything;
            updateElementMapVisibility(el);
        });
        updateElementsList();
    });

    globalLabelsToggle.addEventListener('click', () => setLabelsVisible(!allLabelsVisible));
    setLabelsVisible(true);

    // =========================================================================
    // Slider temporal (instante único ou intervalo)
    // =========================================================================

    function isElementShown(el) {
        return el.isVisible && (el.isTimeVisible || showAllTimestamps);
    }

    function sliderIndexOf(timestamp, fallback) {
        const idx = uniqueTimestamps.indexOf(timestamp);
        return idx === -1 ? fallback : idx;
    }

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
        const maxIndex = uniqueTimestamps.length - 1;
        timeSlider.max = maxIndex;
        timeSliderEnd.max = maxIndex;

        const startIndex = sliderIndexOf(currentSliderTimestamp, 0);
        let endIndex = sliderIndexOf(rangeEndTimestamp, maxIndex);
        if (endIndex < startIndex) endIndex = startIndex;

        timeSlider.value = startIndex;
        timeSliderEnd.value = endIndex;
        currentSliderTimestamp = uniqueTimestamps[startIndex];
        rangeEndTimestamp = uniqueTimestamps[endIndex];

        updateSliderDisplay();
        filterElementsByTime();
    }

    function updateSliderDisplay() {
        if (!currentSliderTimestamp) return;
        const maxIndex = Math.max(1, uniqueTimestamps.length - 1);
        const startIndex = parseInt(timeSlider.value, 10);
        const endIndex = parseInt(timeSliderEnd.value, 10);

        if (showAllTimestamps) {
            const total = uniqueTimestamps.length;
            currentTimeDisplay.textContent = `Todos os instantes · ${total} instante${total > 1 ? 's' : ''} (filtro de tempo desligado)`;
            sliderTrackFill.style.width = '0';
        } else if (sliderMode === 'range') {
            const count = endIndex - startIndex + 1;
            currentTimeDisplay.textContent =
                `${formatFullDateTime(currentSliderTimestamp)} → ${formatFullDateTime(rangeEndTimestamp)} · ${count} instante${count > 1 ? 's' : ''}`;
            const left = (startIndex / maxIndex) * 100;
            const width = ((endIndex - startIndex) / maxIndex) * 100;
            sliderTrackFill.style.left = `${left}%`;
            sliderTrackFill.style.width = `${width}%`;
        } else {
            currentTimeDisplay.textContent = formatFullDateTime(currentSliderTimestamp);
            sliderTrackFill.style.width = '0';
        }
    }

    function isInTimeSelection(datetime) {
        if (sliderMode === 'range') {
            return datetime >= currentSliderTimestamp && datetime <= rangeEndTimestamp;
        }
        return datetime === currentSliderTimestamp;
    }

    function filterElementsByTime() {
        plottedElements.forEach(el => {
            if (el.type === 'POI' || el.datetime === null || showAllTimestamps) {
                el.isTimeVisible = true;
            } else {
                el.isTimeVisible = isInTimeSelection(el.datetime);
            }
            updateElementMapVisibility(el);
        });
        updateElementsList();

        if (!showAllTimestamps && sliderMode === 'instant') {
            const visibleErb = plottedElements.find(el => el.type === 'ERB' && el.isTimeVisible && el.isVisible);
            if (visibleErb) map.panTo([visibleErb.lat, visibleErb.lng]);
        }
    }

    function updateElementMapVisibility(el) {
        const shouldBeVisible = isElementShown(el);

        (el.layers || []).forEach(layer => {
            if (shouldBeVisible && !map.hasLayer(layer)) map.addLayer(layer);
            if (!shouldBeVisible && map.hasLayer(layer)) map.removeLayer(layer);
        });

        if (el.marker) {
            const container = el.type === 'POI' ? poiContainer() : map;
            if (shouldBeVisible && !container.hasLayer(el.marker)) container.addLayer(el.marker);
            if (!shouldBeVisible && container.hasLayer(el.marker)) container.removeLayer(el.marker);
        }
    }

    /** Aplica os índices dos cursores ao estado e refiltra o mapa. */
    function applySliderIndexes(startIndex, endIndex) {
        const maxIndex = uniqueTimestamps.length - 1;
        startIndex = Math.min(Math.max(0, startIndex), maxIndex);
        endIndex = Math.min(Math.max(startIndex, endIndex), maxIndex);
        timeSlider.value = startIndex;
        timeSliderEnd.value = endIndex;
        currentSliderTimestamp = uniqueTimestamps[startIndex];
        rangeEndTimestamp = uniqueTimestamps[endIndex];
        setShowAll(false);
        updateSliderDisplay();
        filterElementsByTime();
    }

    /**
     * Desloca a seleção: no modo instante move o cursor; no modo intervalo move a
     * janela inteira mantendo a largura, ou apenas o fim quando endOnly é verdadeiro.
     */
    function stepSlider(delta, endOnly = false) {
        if (uniqueTimestamps.length < 2) return;
        const maxIndex = uniqueTimestamps.length - 1;
        let start = parseInt(timeSlider.value, 10);
        let end = parseInt(timeSliderEnd.value, 10);

        if (sliderMode === 'range' && endOnly) {
            end += delta;
            if (end < start || end > maxIndex) return;
        } else if (sliderMode === 'range') {
            const width = end - start;
            start += delta;
            if (start < 0 || start + width > maxIndex) return;
            end = start + width;
        } else {
            start += delta;
            if (start < 0 || start > maxIndex) return;
            end = Math.max(end, start);
        }
        applySliderIndexes(start, end);
    }

    function syncSliderModeButtons() {
        const active = showAllTimestamps ? 'all' : sliderMode;
        sliderModeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === active));
        timeSliderEnd.classList.toggle('hidden', sliderMode !== 'range');
    }

    function setSliderMode(mode) {
        if (mode === 'all') {
            setShowAll(true);
            updateSliderDisplay();
            filterElementsByTime();
            return;
        }

        sliderMode = mode === 'range' ? 'range' : 'instant';
        showAllTimestamps = false;
        syncSliderModeButtons();
        if (uniqueTimestamps.length < 2) return;

        let start = parseInt(timeSlider.value, 10);
        let end = parseInt(timeSliderEnd.value, 10);
        if (sliderMode === 'range' && end <= start) end = uniqueTimestamps.length - 1;
        applySliderIndexes(start, end);
    }

    timeSlider.addEventListener('input', () => {
        const start = parseInt(timeSlider.value, 10);
        const end = sliderMode === 'range' ? Math.max(start, parseInt(timeSliderEnd.value, 10)) : start;
        applySliderIndexes(start, end);
    });

    timeSliderEnd.addEventListener('input', () => {
        const end = parseInt(timeSliderEnd.value, 10);
        const start = Math.min(end, parseInt(timeSlider.value, 10));
        applySliderIndexes(start, end);
    });

    sliderModeButtons.forEach(btn => {
        btn.addEventListener('click', () => setSliderMode(btn.dataset.mode));
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
            } else {
                map.closePopup();
            }
            return;
        }

        const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
            e.preventDefault();
            undo();
            return;
        }

        if (timeSliderContainer.classList.contains('hidden')) return;
        if (typing) return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            stepSlider(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey);
        }
    });

    // =========================================================================
    // Análise de sobreposição de setores
    // =========================================================================

    const analysisLayer = L.layerGroup().addTo(map);
    let coverageOverlay = null;
    const analysisResults = $('analysis-results');
    const analysisSource = $('analysis-source');
    const intersectBtn = $('intersect-btn');
    const coverageBtn = $('coverage-btn');
    const poiCheckBtn = $('poi-check-btn');
    const clearAnalysisBtn = $('clear-analysis-btn');
    const gridCellSizeSelect = $('grid-cell-size');
    const INTERSECTION_COLOR = '#00e5ff';

    function visibleSectors() {
        return plottedElements.filter(el => el.type === 'ERB' && isElementShown(el));
    }

    function visiblePois() {
        return plottedElements.filter(el => el.type === 'POI' && isElementShown(el));
    }

    function updateAnalysisSource() {
        const sectors = visibleSectors().length;
        const pois = visiblePois().length;
        analysisSource.textContent = sectors === 0
            ? 'Nenhum setor visível.'
            : `${sectors} setor${sectors > 1 ? 'es' : ''} e ${pois} ponto${pois !== 1 ? 's' : ''} visíveis.`;
        populateRadiusSelect();
    }

    function populateRadiusSelect() {
        const pois = visiblePois();
        const current = radiusPoiSelect.value;
        radiusPoiSelect.innerHTML = pois.length
            ? pois.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')
            : '<option value="">Nenhum ponto visível</option>';
        if (pois.some(p => p.id === current)) radiusPoiSelect.value = current;
    }

    // Abordagem 4: raio ao redor de um ponto
    radiusBtn.addEventListener('click', () => {
        const poi = plottedElements.find(el => el.id === radiusPoiSelect.value && el.type === 'POI');
        const meters = parseFloat(radiusMetersInput.value);
        if (!poi) {
            showToast('Escolha um ponto visível como referência.');
            return;
        }
        if (!(meters > 0)) {
            showToast('Informe um raio em metros maior que zero.');
            return;
        }

        clearVectorAnalysis();
        const circle = L.circle([poi.lat, poi.lng], {
            radius: meters,
            color: INTERSECTION_COLOR,
            weight: 2,
            dashArray: '6, 6',
            fillColor: INTERSECTION_COLOR,
            fillOpacity: 0.08
        }).addTo(analysisLayer);
        highlightPoi(poi, INTERSECTION_COLOR);

        const rows = visibleSectors()
            .map(sec => ({
                sec,
                distance: haversineDistance(poi.lat, poi.lng, sec.lat, sec.lng),
                bearing: bearingBetween(poi.lat, poi.lng, sec.lat, sec.lng),
                covers: pointInSector(poi.lat, poi.lng, sec)
            }))
            .filter(r => r.distance <= meters)
            .sort((a, b) => a.distance - b.distance);

        map.fitBounds(circle.getBounds(), { padding: [40, 40] });

        showAnalysisResults(`
            <h4>ERBs a até ${formatDistance(meters)} de ${escapeHtml(poi.name)}</h4>
            <p class="muted">${rows.length} de ${visibleSectors().length} setor${visibleSectors().length !== 1 ? 'es' : ''} visíve${visibleSectors().length !== 1 ? 'is' : 'l'} dentro do raio.</p>
            ${rows.length === 0 ? '' : `<table>
                <thead><tr><th>ERB</th><th class="num">Distância</th><th class="num">Rumo</th><th>Cobre</th></tr></thead>
                <tbody>${rows.map(r => `<tr>
                    <td><button type="button" class="link-btn" data-focus="${escapeHtml(r.sec.id)}">${escapeHtml(r.sec.name)}</button></td>
                    <td class="num">${formatDistance(r.distance)}</td>
                    <td class="num">${Math.round(r.bearing)}°</td>
                    <td>${r.covers ? '<span class="tag-all">sim</span>' : '<span class="tag-none">não</span>'}</td>
                </tr>`).join('')}</tbody>
            </table>`}`);
    });

    function showAnalysisResults(html) {
        analysisResults.innerHTML = html;
        analysisResults.classList.remove('hidden');
    }

    function clearVectorAnalysis() {
        analysisLayer.clearLayers();
    }

    function clearCoverageOverlay() {
        if (coverageOverlay) {
            map.removeLayer(coverageOverlay);
            coverageOverlay = null;
        }
    }

    function clearAnalysis() {
        clearVectorAnalysis();
        clearCoverageOverlay();
        analysisResults.innerHTML = '';
        analysisResults.classList.add('hidden');
    }

    function formatLatLng(lat, lng) {
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    function highlightPoi(poi, color) {
        L.circleMarker([poi.lat, poi.lng], {
            radius: 14,
            color,
            weight: 2,
            fillOpacity: 0.15,
            interactive: false
        }).addTo(analysisLayer);
    }

    // Abordagem 1: teste analítico ponto a ponto
    poiCheckBtn.addEventListener('click', () => {
        const sectors = visibleSectors();
        const pois = visiblePois();
        if (sectors.length === 0 || pois.length === 0) {
            showToast('É preciso ao menos um setor e um ponto visíveis.');
            return;
        }

        clearVectorAnalysis();
        const rows = pois.map(poi => {
            const containing = sectors.filter(sec => pointInSector(poi.lat, poi.lng, sec));
            if (containing.length === sectors.length) highlightPoi(poi, '#34d399');
            else if (containing.length > 0) highlightPoi(poi, DEFAULT_ERB_COLOR);
            return { poi, containing };
        });

        const inAll = rows.filter(r => r.containing.length === sectors.length).length;
        const html = `
            <h4>Pontos dentro dos setores</h4>
            <p class="muted">${sectors.length} setor${sectors.length > 1 ? 'es' : ''} verificado${sectors.length > 1 ? 's' : ''} · ${inAll} ponto${inAll !== 1 ? 's' : ''} dentro de todos.</p>
            <table>
                <thead><tr><th>Ponto</th><th>Setores</th><th class="num">Qtd.</th></tr></thead>
                <tbody>
                ${rows.map(r => {
                    const names = r.containing.map(sec => escapeHtml(sec.name)).join(', ');
                    const tag = r.containing.length === sectors.length
                        ? '<span class="tag-all">todos</span>'
                        : (r.containing.length === 0 ? '<span class="tag-none">nenhum</span>' : names);
                    return `<tr>
                        <td><button type="button" class="link-btn" data-focus="${escapeHtml(r.poi.id)}">${escapeHtml(r.poi.name)}</button></td>
                        <td>${tag}${r.containing.length === sectors.length && sectors.length > 1 ? `<br><span class="muted">${names}</span>` : ''}</td>
                        <td class="num">${r.containing.length}/${sectors.length}</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>`;
        showAnalysisResults(html);
    });

    // Abordagem 2: interseção vetorial (polygon-clipping)
    intersectBtn.addEventListener('click', () => {
        const sectors = visibleSectors();
        if (sectors.length < 2) {
            showToast('São necessários ao menos dois setores visíveis para calcular a área comum.');
            return;
        }
        if (typeof polygonClipping === 'undefined') {
            showToast('A biblioteca de recorte de polígonos não foi carregada.');
            return;
        }

        clearVectorAnalysis();
        const result = sectorsIntersection(sectors, polygonClipping, 60);

        if (!result) {
            showAnalysisResults(`
                <h4>Interseção exata</h4>
                <p>Os ${sectors.length} setores visíveis não têm área em comum.</p>
                <p class="muted">Dica: use o mapa de cobertura para ver quantos setores cobrem cada região.</p>`);
            return;
        }

        const polygon = L.polygon(result.polygons, {
            color: INTERSECTION_COLOR,
            weight: 2,
            fillColor: INTERSECTION_COLOR,
            fillOpacity: 0.35,
            dashArray: '6, 6'
        }).addTo(analysisLayer);

        const centroidMarker = L.circleMarker([result.centroid.lat, result.centroid.lng], {
            radius: 6,
            color: '#ffffff',
            fillColor: INTERSECTION_COLOR,
            fillOpacity: 1,
            weight: 2
        }).addTo(analysisLayer);

        const popupHtml = `<b>Área comum a ${sectors.length} setores</b><br>Área: ${formatArea(result.areaM2)}<br>Centróide: ${formatLatLng(result.centroid.lat, result.centroid.lng)}`;
        polygon.bindPopup(popupHtml);
        centroidMarker.bindPopup(popupHtml);

        // Um ponto está na interseção exatamente quando está em todos os setores
        const poisInside = visiblePois().filter(poi => sectors.every(sec => pointInSector(poi.lat, poi.lng, sec)));
        poisInside.forEach(poi => highlightPoi(poi, '#34d399'));

        map.fitBounds(polygon.getBounds(), { padding: [40, 40], maxZoom: 17 });

        showAnalysisResults(`
            <h4>Interseção exata</h4>
            <p><strong>Setores:</strong> ${sectors.map(sec => escapeHtml(sec.name)).join(', ')}</p>
            <p><strong>Área comum:</strong> ${formatArea(result.areaM2)}${result.polygons.length > 1 ? ` (${result.polygons.length} regiões)` : ''}</p>
            <p><strong>Centróide:</strong> <button type="button" class="link-btn" data-fly="${result.centroid.lat},${result.centroid.lng}">${formatLatLng(result.centroid.lat, result.centroid.lng)}</button></p>
            <p><strong>Pontos dentro da área:</strong> ${poisInside.length === 0 ? '<span class="tag-none">nenhum</span>' : poisInside.map(poi => `<button type="button" class="link-btn" data-focus="${escapeHtml(poi.id)}">${escapeHtml(poi.name)}</button>`).join(', ')}</p>`);
    });

    // Abordagem 3: grade de cobertura desenhada em canvas
    function coverageColor(count, max) {
        const t = max <= 1 ? 1 : (count - 1) / (max - 1);
        const hue = 60 - 60 * t;        // amarelo (1 setor) até vermelho (todos)
        const alpha = 0.35 + 0.45 * t;
        return { css: `hsl(${hue}, 100%, 50%)`, hue, alpha };
    }

    function renderCoverageCanvas(grid) {
        const canvas = document.createElement('canvas');
        canvas.width = grid.cols;
        canvas.height = grid.rows;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(grid.cols, grid.rows);
        const data = image.data;

        for (let r = 0; r < grid.rows; r++) {
            const canvasRow = grid.rows - 1 - r; // linha 0 da grade é o sul; no canvas, o topo é o norte
            for (let c = 0; c < grid.cols; c++) {
                const count = grid.counts[r * grid.cols + c];
                if (count === 0) continue;
                const { hue, alpha } = coverageColor(count, grid.max);
                // hsl(hue,100%,50%) em RGB para hue entre 0 e 60
                const red = 255;
                const green = Math.round(255 * (hue / 60));
                const idx = (canvasRow * grid.cols + c) * 4;
                data[idx] = red;
                data[idx + 1] = green;
                data[idx + 2] = 0;
                data[idx + 3] = Math.round(alpha * 255);
            }
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    coverageBtn.addEventListener('click', () => {
        const sectors = visibleSectors();
        if (sectors.length === 0) {
            showToast('É preciso ao menos um setor visível para gerar o mapa de cobertura.');
            return;
        }

        const cellSize = parseInt(gridCellSizeSelect.value, 10) || 50;
        const grid = coverageGrid(sectors, cellSize);
        clearCoverageOverlay();

        const canvas = renderCoverageCanvas(grid);
        const bounds = [[grid.bounds.south, grid.bounds.west], [grid.bounds.north, grid.bounds.east]];
        coverageOverlay = L.imageOverlay(canvas.toDataURL('image/png'), bounds, {
            opacity: 0.75,
            interactive: false,
            className: 'coverage-overlay'
        }).addTo(map);
        map.fitBounds(bounds, { padding: [40, 40] });

        const legendRows = [];
        for (let k = grid.max; k >= 1; k--) {
            const area = grid.histogram[k] * grid.cellAreaM2;
            if (grid.histogram[k] === 0) continue;
            const { css, alpha } = coverageColor(k, grid.max);
            legendRows.push(`<tr>
                <td><span class="legend-swatch" style="background: ${css}; opacity: ${alpha.toFixed(2)}"></span>${k} setor${k > 1 ? 'es' : ''}${k === sectors.length && sectors.length > 1 ? ' <span class="tag-all">(todos)</span>' : ''}</td>
                <td class="num">${formatArea(area)}</td>
            </tr>`);
        }

        showAnalysisResults(`
            <h4>Mapa de cobertura</h4>
            <p class="muted">${sectors.length} setor${sectors.length > 1 ? 'es' : ''} · célula de ${grid.cellSizeM} m · ${grid.cols}×${grid.rows} células${grid.cellSizeM !== cellSize ? ' (célula ampliada para limitar o cálculo)' : ''}</p>
            <table>
                <thead><tr><th>Cobertura</th><th class="num">Área</th></tr></thead>
                <tbody>${legendRows.join('')}</tbody>
            </table>`);
    });

    clearAnalysisBtn.addEventListener('click', clearAnalysis);

    // Links dentro dos resultados: focar ponto ou voar até coordenada
    analysisResults.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-focus], button[data-fly]');
        if (!button) return;
        if (button.dataset.focus) {
            focusElement(button.dataset.focus);
        } else if (button.dataset.fly) {
            const [lat, lng] = button.dataset.fly.split(',').map(parseFloat);
            map.flyTo([lat, lng], 16);
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
    // Desfazer
    // =========================================================================

    const UNDO_LIMIT = 20;
    const undoStack = [];

    function pushUndo(label) {
        undoStack.push({ label, elements: serializeState().elements });
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
        syncUndoButton();
    }

    function syncUndoButton() {
        const last = undoStack[undoStack.length - 1];
        undoBtn.disabled = !last;
        undoBtn.title = last ? `Desfazer: ${last.label} (Ctrl+Z)` : 'Nada para desfazer (Ctrl+Z)';
    }

    function undo() {
        const entry = undoStack.pop();
        if (!entry) {
            showToast('Nada para desfazer.', 2500);
            return;
        }
        loadElements(entry.elements, { fit: false });
        syncUndoButton();
        showToast(`Desfeito: ${entry.label}.`, 3500);
    }

    undoBtn.addEventListener('click', undo);

    // =========================================================================
    // Carregamento de elementos serializados (restauração, projeto, link, desfazer)
    // =========================================================================

    function elementFromSerialized(item) {
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
        if (!element) return null;
        element.datetime = typeof item.datetime === 'number' ? item.datetime : null;
        element.isVisible = item.isVisible !== false;
        if (typeof item.id === 'string') element.id = item.id;
        return element;
    }

    /** Substitui todos os elementos do mapa pela lista serializada. */
    function loadElements(items, options = {}) {
        currentEditId = null;
        erbSubmitBtn.textContent = 'Plotar ERB';
        poiSubmitBtn.textContent = 'Adicionar Ponto';
        plottedElements.forEach(removeElementLayers);
        plottedElements = [];
        clearVectorAnalysis();

        suppressListUpdates = true;
        try {
            (items || []).forEach(item => {
                const element = elementFromSerialized(item);
                if (!element) return;
                if (element.type === 'ERB') plotERB(element, false);
                else plotPOI(element, false);
            });
        } finally {
            suppressListUpdates = false;
        }

        updateTemporalSlider();
        updateElementsList();

        if (plottedElements.length === 0) {
            clearPersistedState();
        } else if (options.fit !== false) {
            map.fitBounds(L.latLngBounds(plottedElements.map(el => [el.lat, el.lng])), { padding: [60, 60], maxZoom: 14 });
        }
        return plottedElements.length;
    }

    // =========================================================================
    // Arquivo de projeto (.json)
    // =========================================================================

    const PROJECT_APP = 'plotador-erb-ponto';
    const PROJECT_VERSION = 2;

    function buildProject() {
        const center = map.getCenter();
        return {
            app: PROJECT_APP,
            version: PROJECT_VERSION,
            savedAt: new Date().toISOString(),
            elements: serializeState().elements,
            view: { center: [center.lat, center.lng], zoom: map.getZoom(), baseLayer: currentBaseName },
            slider: { mode: sliderMode, showAll: showAllTimestamps },
            labelsVisible: allLabelsVisible
        };
    }

    /** Aplica um projeto ao mapa. Devolve o número de elementos carregados ou -1 se inválido. */
    function loadProject(project, options = {}) {
        if (!project || typeof project !== 'object' || !Array.isArray(project.elements)) return -1;
        if (project.app && project.app !== PROJECT_APP) return -1;

        if (plottedElements.length > 0 && options.undoLabel) pushUndo(options.undoLabel);

        const hasView = project.view && Array.isArray(project.view.center) && project.view.center.length === 2;
        const count = loadElements(project.elements, { fit: !hasView });

        if (hasView) {
            const [lat, lng] = project.view.center.map(Number);
            if (isFinite(lat) && isFinite(lng)) map.setView([lat, lng], Number(project.view.zoom) || map.getZoom());
            if (project.view.baseLayer) setBaseLayer(project.view.baseLayer);
        }
        if (project.slider) {
            if (project.slider.mode === 'range' || project.slider.mode === 'instant') setSliderMode(project.slider.mode);
            if (project.slider.showAll) setSliderMode('all');
        } else {
            setShowAll(true);
            updateTemporalSlider();
        }
        if (typeof project.labelsVisible === 'boolean') setLabelsVisible(project.labelsVisible);
        return count;
    }

    function downloadJson(obj, filename) {
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    saveProjectBtn.addEventListener('click', () => {
        if (plottedElements.length === 0) {
            showToast('Não há elementos para salvar.');
            return;
        }
        const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
        downloadJson(buildProject(), `Projeto_Plotador_${stamp}.json`);
        showToast('Projeto salvo. Guarde o arquivo .json para reabrir depois.', 4000);
    });

    openProjectBtn.addEventListener('click', () => projectInput.click());

    projectInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const project = JSON.parse(event.target.result);
                if (plottedElements.length > 0 && !confirm('Abrir o projeto substitui os elementos atuais do mapa. Continuar? (Ctrl+Z desfaz.)')) return;
                const count = loadProject(project, { undoLabel: 'abertura de projeto' });
                if (count < 0) {
                    alert('Este arquivo não é um projeto do Plotador de ERBs e Pontos.');
                    return;
                }
                showToast(`Projeto aberto: ${count} elemento${count !== 1 ? 's' : ''}.`, 4000);
            } catch (error) {
                console.error('Erro ao abrir projeto:', error);
                alert('Não foi possível ler o arquivo de projeto. Verifique se é um .json válido.');
            } finally {
                projectInput.value = '';
            }
        };
        reader.readAsText(file);
    });

    // =========================================================================
    // Link compartilhável (projeto comprimido no fragmento da URL)
    // =========================================================================

    const SHARE_WARN_LENGTH = 30000;

    function bytesToBase64Url(bytes) {
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function base64UrlToBytes(text) {
        const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    async function encodeShareData(json) {
        const raw = new TextEncoder().encode(json);
        if (typeof CompressionStream === 'undefined') return { mode: 'j', data: bytesToBase64Url(raw) };
        const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        return { mode: 'p', data: bytesToBase64Url(compressed) };
    }

    async function decodeShareData(mode, data) {
        const bytes = base64UrlToBytes(data);
        if (mode === 'p') {
            if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não descomprime links deste formato.');
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
            return await new Response(stream).text();
        }
        return new TextDecoder().decode(bytes);
    }

    async function buildShareUrl() {
        const { mode, data } = await encodeShareData(JSON.stringify(buildProject()));
        return `${location.href.split('#')[0]}#${mode}=${data}`;
    }

    shareLinkBtn.addEventListener('click', async () => {
        if (plottedElements.length === 0) {
            showToast('Não há elementos para compartilhar.');
            return;
        }
        try {
            const url = await buildShareUrl();
            const ok = await copyText(url);
            const size = (url.length / 1024).toFixed(1);
            if (!ok) {
                prompt('Copie o link abaixo:', url);
                return;
            }
            if (url.length > SHARE_WARN_LENGTH) {
                showToast(`Link copiado (${size} KB). Links longos podem ser cortados por alguns aplicativos de mensagem; prefira o arquivo de projeto.`, 8000);
            } else {
                showToast(`Link copiado (${size} KB). Quem abrir recebe o projeto completo.`, 5000);
            }
        } catch (error) {
            console.error('Erro ao gerar link:', error);
            showToast('Não foi possível gerar o link.');
        }
    });

    async function loadFromHash() {
        const match = location.hash.match(/^#([pj])=([A-Za-z0-9_-]+)$/);
        if (!match) return false;
        try {
            const json = await decodeShareData(match[1], match[2]);
            const project = JSON.parse(json);
            if (plottedElements.length > 0 && !confirm('Este link contém um projeto. Substituir os elementos atuais do mapa? (Ctrl+Z desfaz.)')) {
                return false;
            }
            const count = loadProject(project, { undoLabel: 'abertura de link' });
            if (count < 0) throw new Error('projeto inválido');
            showToast(`Projeto carregado do link: ${count} elemento${count !== 1 ? 's' : ''}.`, 5000);
            return true;
        } catch (error) {
            console.error('Link inválido:', error);
            showToast('O link não contém um projeto válido.');
            return false;
        } finally {
            try { history.replaceState(null, '', location.pathname + location.search); } catch (error) { /* file:// pode recusar */ }
        }
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

        const count = loadElements(saved.elements, { fit: true });
        if (count === 0) return false;
        setShowAll(true);
        updateTemporalSlider();
        return true;
    }

    // =========================================================================
    // Inicialização
    // =========================================================================

    restoreState();
    syncUndoButton();
    loadFromHash();

    // Modo aplicativo: cache dos arquivos da ferramenta para abrir offline (só via http/https)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(error => console.warn('Service worker não registrado:', error));
    }

    // Acesso para depuração no console e testes de integração
    window.PlotadorApp = Object.freeze({
        map,
        getElements: () => plottedElements.map(el => ({ ...el, layers: undefined, marker: undefined })),
        buildProject,
        loadProject: (project) => loadProject(project, { undoLabel: 'carregamento de projeto' }),
        buildShareUrl,
        undo,
        isClustering: () => clusteringActive
    });
})();
