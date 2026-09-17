/*
 * Funções puras do Plotador de ERBs e Pontos.
 *
 * Este arquivo não depende do DOM nem do Leaflet, por isso pode ser carregado
 * tanto pelo navegador (como <script> clássico, expondo window.PlotadorUtils)
 * quanto pelo Node.js (via require) para os testes automatizados.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PlotadorUtils = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const EARTH_RADIUS_M = 6371000;
    const DEFAULT_ERB_COLOR = '#ffcb00';
    const DEFAULT_POI_COLOR = '#ff4757';

    /**
     * Calcula o ponto de destino a partir de uma origem, um rumo (graus) e uma
     * distância (metros), usando a fórmula direta sobre a esfera.
     */
    function destinationPoint(lat, lng, bearing, distance) {
        const brng = bearing * Math.PI / 180;
        const lat1 = lat * Math.PI / 180;
        const lon1 = lng * Math.PI / 180;
        const angular = distance / EARTH_RADIUS_M;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) +
            Math.cos(lat1) * Math.sin(angular) * Math.cos(brng));

        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(angular) * Math.cos(lat1),
            Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));

        return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
    }

    /**
     * Gera os vértices do polígono de um setor de cobertura (centro, arco, centro).
     */
    function getSectorPoints(lat, lng, azimuth, radius, beamwidth, segments = 30) {
        const isFullCircle = beamwidth >= 360;
        const points = isFullCircle ? [] : [[lat, lng]];
        const startAngle = azimuth - (beamwidth / 2);
        const step = beamwidth / segments;

        for (let i = 0; i <= segments; i++) {
            points.push(destinationPoint(lat, lng, startAngle + (i * step), radius));
        }

        if (!isFullCircle) points.push([lat, lng]);
        return points;
    }

    // ---------------------------------------------------------------------
    // Geometria de sobreposição de setores
    // ---------------------------------------------------------------------

    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;

    /** Distância (m) entre dois pontos pela fórmula de haversine. */
    function haversineDistance(lat1, lng1, lat2, lng2) {
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    /** Rumo inicial (graus, 0 a 360) do ponto 1 para o ponto 2. */
    function bearingBetween(lat1, lng1, lat2, lng2) {
        const phi1 = toRad(lat1);
        const phi2 = toRad(lat2);
        const dLng = toRad(lng2 - lng1);
        const y = Math.sin(dLng) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    /** Verifica se um rumo cai dentro da abertura centrada no azimute, tratando a volta em 360. */
    function angleInSector(bearing, azimuth, beamwidth) {
        if (beamwidth >= 360) return true;
        const diff = ((bearing - azimuth + 540) % 360) - 180;
        return Math.abs(diff) <= beamwidth / 2 + 1e-9;
    }

    /**
     * Abordagem 1: teste analítico. O ponto está no setor se a distância ao centro
     * não excede o raio e o rumo do centro ao ponto cai dentro da abertura.
     */
    function pointInSector(lat, lng, sector) {
        const dist = haversineDistance(sector.lat, sector.lng, lat, lng);
        if (dist > sector.radius + 1e-6) return false;
        if (dist < 1e-6) return true; // o próprio centro
        return angleInSector(bearingBetween(sector.lat, sector.lng, lat, lng), sector.azimuth, sector.beamwidth);
    }

    /**
     * Projeção equirretangular local: converte lat/lng em metros (x para leste,
     * y para norte) em torno de uma origem. Precisa o bastante para poucos km.
     */
    function localProjection(originLat, originLng) {
        const kx = toRad(1) * EARTH_RADIUS_M * Math.cos(toRad(originLat));
        const ky = toRad(1) * EARTH_RADIUS_M;
        return {
            toXY: (lat, lng) => [(lng - originLng) * kx, (lat - originLat) * ky],
            toLatLng: (x, y) => [originLat + y / ky, originLng + x / kx]
        };
    }

    /** Área (m²) de um anel [[x, y], ...] pela fórmula do cadarço (valor absoluto). */
    function ringArea(ring) {
        let sum = 0;
        for (let i = 0, n = ring.length; i < n; i++) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[(i + 1) % n];
            sum += x1 * y2 - x2 * y1;
        }
        return Math.abs(sum) / 2;
    }

    /** Centróide de um anel [[x, y], ...]. Cai na média dos vértices se a área for nula. */
    function ringCentroid(ring) {
        let a = 0, cx = 0, cy = 0;
        for (let i = 0, n = ring.length; i < n; i++) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[(i + 1) % n];
            const f = x1 * y2 - x2 * y1;
            a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
        }
        if (Math.abs(a) < 1e-9) {
            const n = ring.length || 1;
            return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
        }
        return [cx / (3 * a), cy / (3 * a)];
    }

    /** Origem comum para projetar um conjunto de setores: média dos centros. */
    function sectorsOrigin(sectors) {
        const n = sectors.length;
        return {
            lat: sectors.reduce((s, e) => s + e.lat, 0) / n,
            lng: sectors.reduce((s, e) => s + e.lng, 0) / n
        };
    }

    /** Anel do setor projetado em metros, no formato [[x, y], ...] fechado. */
    function sectorRingXY(sector, proj, segments = 30) {
        const ring = getSectorPoints(sector.lat, sector.lng, sector.azimuth, sector.radius, sector.beamwidth, segments)
            .map(([lat, lng]) => proj.toXY(lat, lng));
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
        return ring;
    }

    /**
     * Abordagem 2: interseção vetorial. Recebe os setores e a biblioteca de recorte
     * (polygon-clipping, injetada para manter este arquivo sem dependências).
     * Devolve null quando não há área comum; caso contrário, os polígonos em lat/lng,
     * a área em m² e o centróide.
     */
    function sectorsIntersection(sectors, clipping, segments = 30) {
        if (!sectors || sectors.length === 0) return null;
        const proj = localProjection(sectorsOrigin(sectors).lat, sectorsOrigin(sectors).lng);
        const geoms = sectors.map(sec => [sectorRingXY(sec, proj, segments)]);

        let result = geoms[0];
        for (let i = 1; i < geoms.length; i++) {
            result = clipping.intersection(result, geoms[i]);
            if (!result || result.length === 0) return null;
        }
        // Normaliza para MultiPolygon: [[outer, hole...], ...]
        const multi = (geoms.length === 1) ? [result] : result;

        let areaM2 = 0;
        let weightedX = 0, weightedY = 0;
        const polygons = multi.map(poly => {
            const [outer, ...holes] = poly;
            const outerArea = ringArea(outer);
            const holesArea = holes.reduce((s, h) => s + ringArea(h), 0);
            const polyArea = outerArea - holesArea;
            const c = ringCentroid(outer);
            areaM2 += polyArea;
            weightedX += c[0] * polyArea;
            weightedY += c[1] * polyArea;
            return poly.map(ring => ring.map(([x, y]) => proj.toLatLng(x, y)));
        });

        if (areaM2 < 1e-6) return null;
        const [cx, cy] = [weightedX / areaM2, weightedY / areaM2];
        const [centroidLat, centroidLng] = proj.toLatLng(cx, cy);
        return { polygons, areaM2, centroid: { lat: centroidLat, lng: centroidLng } };
    }

    /**
     * Abordagem 3: grade de cobertura. Divide a caixa envolvente dos setores em
     * células e conta quantos setores contêm o centro de cada célula.
     * O tamanho da célula cresce automaticamente para respeitar maxCells.
     */
    function coverageGrid(sectors, cellSizeM = 50, maxCells = 250000) {
        if (!sectors || sectors.length === 0) return null;
        const origin = sectorsOrigin(sectors);
        const proj = localProjection(origin.lat, origin.lng);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        sectors.forEach(sec => {
            const [x, y] = proj.toXY(sec.lat, sec.lng);
            minX = Math.min(minX, x - sec.radius); maxX = Math.max(maxX, x + sec.radius);
            minY = Math.min(minY, y - sec.radius); maxY = Math.max(maxY, y + sec.radius);
        });

        let cell = Math.max(1, cellSizeM);
        let cols = Math.ceil((maxX - minX) / cell);
        let rows = Math.ceil((maxY - minY) / cell);
        while (cols * rows > maxCells) {
            cell *= 2;
            cols = Math.ceil((maxX - minX) / cell);
            rows = Math.ceil((maxY - minY) / cell);
        }

        const counts = new Uint8Array(cols * rows);
        let max = 0;
        const histogram = new Array(sectors.length + 1).fill(0);
        for (let r = 0; r < rows; r++) {
            const y = minY + (r + 0.5) * cell;
            for (let c = 0; c < cols; c++) {
                const x = minX + (c + 0.5) * cell;
                const [lat, lng] = proj.toLatLng(x, y);
                let n = 0;
                for (let i = 0; i < sectors.length; i++) {
                    if (pointInSector(lat, lng, sectors[i])) n++;
                }
                counts[r * cols + c] = n;
                histogram[n]++;
                if (n > max) max = n;
            }
        }

        const [southLat, westLng] = proj.toLatLng(minX, minY);
        const [northLat, eastLng] = proj.toLatLng(minX + cols * cell, minY + rows * cell);
        return {
            cols, rows, cellSizeM: cell, counts, max, histogram,
            cellAreaM2: cell * cell,
            bounds: { south: southLat, west: westLng, north: northLat, east: eastLng }
        };
    }

    /** Formata área em m² ou km² para exibição. */
    function formatArea(m2) {
        if (m2 >= 1e6) return (m2 / 1e6).toFixed(2) + ' km²';
        if (m2 >= 1e4) return (m2 / 1e4).toFixed(2) + ' ha';
        return Math.round(m2) + ' m²';
    }

    /**
     * Converte um valor de data vindo de planilha ou formulário em timestamp (ms).
     * O formato brasileiro DD/MM/AAAA[ HH:mm[:ss]] é testado ANTES do parser nativo,
     * que interpretaria "05/09/2026" como 9 de maio.
     */
    function parseDateRobust(val) {
        if (!val) return null;
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();

        if (typeof val === 'string') {
            const parts = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[^\d]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
            if (parts) {
                const day = parseInt(parts[1], 10);
                const month = parseInt(parts[2], 10) - 1;
                const year = parseInt(parts[3], 10);
                const hour = parts[4] ? parseInt(parts[4], 10) : 0;
                const min = parts[5] ? parseInt(parts[5], 10) : 0;
                const sec = parts[6] ? parseInt(parts[6], 10) : 0;

                const d = new Date(year, month, day, hour, min, sec);
                return isNaN(d.getTime()) ? null : d.getTime();
            }
        }

        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.getTime();
    }

    /** Devolve o número quando válido (inclusive 0), senão "" para exportação. */
    function numberOrEmpty(value) {
        return (typeof value === 'number' && !isNaN(value)) ? value : "";
    }

    /** Converte célula de planilha em número; vazio/inválido vira undefined em vez de NaN. */
    function parseNumberOrUndefined(value) {
        if (value === undefined || value === null || value === "") return undefined;
        const n = parseFloat(value);
        return isNaN(n) ? undefined : n;
    }

    /** Formata timestamp como DD/MM HH:mm para rótulos e popups. */
    function formatShortDateTime(timestamp) {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    /** Formata timestamp como DD/MM/AAAA HH:mm. */
    function formatFullDateTime(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    /** Converte timestamp para o valor "AAAA-MM-DDTHH:mm" esperado por <input type="datetime-local">. */
    function toDatetimeLocalValue(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /** Escapa texto para inserção segura via innerHTML. */
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Aceita apenas cores hexadecimais (#rgb ou #rrggbb); caso contrário devolve o padrão. */
    function sanitizeColor(value, fallback) {
        const str = String(value ?? '').trim();
        return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str) ? str : fallback;
    }

    /** Aceita apenas nomes de ícone simples (letras, números e hífen). */
    function sanitizeIcon(value, fallback = 'location-dot') {
        const str = String(value ?? '').trim();
        return /^[a-z0-9-]+$/i.test(str) ? str : fallback;
    }

    /** Distância total (m) de uma sequência de pontos {lat, lng}. */
    function formatDistance(meters) {
        return meters > 1000 ? (meters / 1000).toFixed(2) + ' km' : Math.round(meters) + ' m';
    }

    let idCounter = 0;
    /** Gera um identificador único e serializável (string). */
    function generateId() {
        idCounter += 1;
        return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    return {
        DEFAULT_ERB_COLOR,
        DEFAULT_POI_COLOR,
        destinationPoint,
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
        haversineDistance,
        bearingBetween,
        angleInSector,
        pointInSector,
        localProjection,
        ringArea,
        ringCentroid,
        sectorsIntersection,
        coverageGrid
    };
});
