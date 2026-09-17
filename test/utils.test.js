'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../utils.js');

const local = (y, m, d, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime();

test('parseDateRobust: formato brasileiro com dia <= 12 não é invertido', () => {
    assert.equal(utils.parseDateRobust('05/09/2026 10:30'), local(2026, 9, 5, 10, 30));
    assert.equal(utils.parseDateRobust('01/02/2026'), local(2026, 2, 1));
});

test('parseDateRobust: aceita dia, mês e hora com um dígito e segundos', () => {
    assert.equal(utils.parseDateRobust('5/9/2026 9:05'), local(2026, 9, 5, 9, 5));
    assert.equal(utils.parseDateRobust('17/09/2026 10:30:45'), local(2026, 9, 17, 10, 30, 45));
});

test('parseDateRobust: ISO, Date e valores inválidos', () => {
    assert.equal(utils.parseDateRobust('2026-09-05T10:30'), local(2026, 9, 5, 10, 30));
    assert.equal(utils.parseDateRobust(new Date(2026, 8, 5, 10, 30)), local(2026, 9, 5, 10, 30));
    assert.equal(utils.parseDateRobust(new Date('invalid')), null);
    assert.equal(utils.parseDateRobust('abc'), null);
    assert.equal(utils.parseDateRobust(''), null);
    assert.equal(utils.parseDateRobust(null), null);
});

test('ciclo exportar/importar preserva a data para qualquer dia do mês', () => {
    for (let day = 1; day <= 28; day++) {
        const ts = local(2026, 3, day, 8, 15);
        const d = new Date(ts);
        const exported = d.toLocaleDateString('pt-BR') + ' ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        assert.equal(utils.parseDateRobust(exported), ts, `dia ${day}: ${exported}`);
    }
});

test('toDatetimeLocalValue: formato do input datetime-local e ciclo de ida e volta', () => {
    assert.equal(utils.toDatetimeLocalValue(local(2026, 9, 5, 10, 30)), '2026-09-05T10:30');
    assert.equal(utils.toDatetimeLocalValue(null), '');
    const value = '2026-01-09T07:05';
    assert.equal(utils.toDatetimeLocalValue(utils.parseDateRobust(value)), value);
});

test('numberOrEmpty: preserva zero e descarta inválidos', () => {
    assert.equal(utils.numberOrEmpty(0), 0);
    assert.equal(utils.numberOrEmpty(90), 90);
    assert.equal(utils.numberOrEmpty(undefined), '');
    assert.equal(utils.numberOrEmpty(NaN), '');
    assert.equal(utils.numberOrEmpty('12'), '');
});

test('parseNumberOrUndefined: vazio vira undefined, nunca NaN', () => {
    assert.equal(utils.parseNumberOrUndefined(0), 0);
    assert.equal(utils.parseNumberOrUndefined('0'), 0);
    assert.equal(utils.parseNumberOrUndefined('120.5'), 120.5);
    assert.equal(utils.parseNumberOrUndefined(''), undefined);
    assert.equal(utils.parseNumberOrUndefined(undefined), undefined);
    assert.equal(utils.parseNumberOrUndefined(null), undefined);
    assert.equal(utils.parseNumberOrUndefined('abc'), undefined);
});

test('escapeHtml: neutraliza marcação vinda de planilhas', () => {
    assert.equal(utils.escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(utils.escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
    assert.equal(utils.escapeHtml(123), '123');
    assert.equal(utils.escapeHtml(undefined), '');
});

test('sanitizeColor e sanitizeIcon: aceitam só valores seguros', () => {
    assert.equal(utils.sanitizeColor('#ffcb00', '#000'), '#ffcb00');
    assert.equal(utils.sanitizeColor('#FFF', '#000'), '#FFF');
    assert.equal(utils.sanitizeColor('red', '#000'), '#000');
    assert.equal(utils.sanitizeColor('#ffcb00; background:url(x)', '#000'), '#000');
    assert.equal(utils.sanitizeColor(undefined, '#000'), '#000');

    assert.equal(utils.sanitizeIcon('location-dot'), 'location-dot');
    assert.equal(utils.sanitizeIcon('house'), 'house');
    assert.equal(utils.sanitizeIcon('x" onclick="y'), 'location-dot');
    assert.equal(utils.sanitizeIcon(''), 'location-dot');
});

test('destinationPoint: 1 km ao norte e ao leste', () => {
    const [latN, lngN] = utils.destinationPoint(-15.79, -47.88, 0, 1000);
    assert.ok(Math.abs(latN - (-15.79 + 0.008993)) < 1e-4, 'latitude ao norte');
    assert.ok(Math.abs(lngN - (-47.88)) < 1e-6, 'longitude inalterada ao norte');

    const [latE, lngE] = utils.destinationPoint(-15.79, -47.88, 90, 1000);
    assert.ok(Math.abs(latE - (-15.79)) < 1e-4, 'latitude quase inalterada ao leste');
    assert.ok(lngE > -47.88, 'longitude cresce ao leste');
});

test('getSectorPoints: começa e termina no centro e respeita a abertura', () => {
    const points = utils.getSectorPoints(-15.79, -47.88, 90, 1000, 120);
    assert.equal(points.length, 33); // centro + 31 pontos de arco + centro
    assert.deepEqual(points[0], [-15.79, -47.88]);
    assert.deepEqual(points[points.length - 1], [-15.79, -47.88]);

    // Primeiro ponto do arco em 30° e último em 150°
    const first = utils.destinationPoint(-15.79, -47.88, 30, 1000);
    const last = utils.destinationPoint(-15.79, -47.88, 150, 1000);
    assert.deepEqual(points[1], first);
    assert.deepEqual(points[31], last);
});

test('formatDistance: metros e quilômetros', () => {
    assert.equal(utils.formatDistance(250.4), '250 m');
    assert.equal(utils.formatDistance(1000), '1000 m');
    assert.equal(utils.formatDistance(1234.5), '1.23 km');
});

test('generateId: identificadores únicos e serializáveis', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => utils.generateId()));
    assert.equal(ids.size, 1000);
    for (const id of ids) assert.equal(typeof id, 'string');
});
