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
        const points = [[lat, lng]];
        const startAngle = azimuth - (beamwidth / 2);
        const step = beamwidth / segments;

        for (let i = 0; i <= segments; i++) {
            points.push(destinationPoint(lat, lng, startAngle + (i * step), radius));
        }

        points.push([lat, lng]);
        return points;
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
        generateId
    };
});
