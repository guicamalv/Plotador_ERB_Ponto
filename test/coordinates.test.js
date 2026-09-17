'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../utils.js');

const near = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg}: ${got} vs ${want}`);

test('parseLatitude / parseLongitude: decimal com ponto, vírgula e hemisfério', () => {
    assert.equal(utils.parseLatitude('-15.79'), -15.79);
    assert.equal(utils.parseLatitude('-15,79'), -15.79);
    assert.equal(utils.parseLatitude('15.79 S'), -15.79);
    assert.equal(utils.parseLatitude('S 15.79'), -15.79);
    assert.equal(utils.parseLatitude('15.79N'), 15.79);
    assert.equal(utils.parseLongitude('47.88 W'), -47.88);
    assert.equal(utils.parseLongitude('47.88 O'), -47.88);
    assert.equal(utils.parseLongitude('47.88 E'), 47.88);
    assert.equal(utils.parseLongitude('47.88 L'), 47.88);
    assert.equal(utils.parseLatitude('91'), undefined);
    assert.equal(utils.parseLongitude('181'), undefined);
    assert.equal(utils.parseLatitude('abc'), undefined);
    assert.equal(utils.parseLatitude(''), undefined);
});

test('parseLatitude / parseLongitude: graus, minutos e segundos', () => {
    near(utils.parseLatitude('15°47\'38.0"S'), -(15 + 47 / 60 + 38 / 3600), 1e-9, 'GMS com S');
    near(utils.parseLatitude('-15°47\'38"'), -(15 + 47 / 60 + 38 / 3600), 1e-9, 'GMS com sinal');
    near(utils.parseLatitude('15 47 38 S'), -(15 + 47 / 60 + 38 / 3600), 1e-9, 'GMS com espaços');
    near(utils.parseLatitude('S 15°47\'38"'), -(15 + 47 / 60 + 38 / 3600), 1e-9, 'letra antes');
    near(utils.parseLatitude('15°47.633\'S'), -(15 + 47.633 / 60), 1e-9, 'graus e minutos decimais');
    near(utils.parseLatitude('15º47’38,5”S'), -(15 + 47 / 60 + 38.5 / 3600), 1e-9, 'símbolos alternativos e vírgula');
    near(utils.parseLongitude('47°52\'58.0"W'), -(47 + 52 / 60 + 58 / 3600), 1e-9, 'longitude W');
    assert.equal(utils.parseLatitude('15°75\'00"S'), undefined, 'minutos inválidos');
});

test('parseCoordinates: pares decimais em vários separadores', () => {
    assert.deepEqual(utils.parseCoordinates('-15.79, -47.88'), { lat: -15.79, lng: -47.88 });
    assert.deepEqual(utils.parseCoordinates('-15.79 -47.88'), { lat: -15.79, lng: -47.88 });
    assert.deepEqual(utils.parseCoordinates('-15.79;-47.88'), { lat: -15.79, lng: -47.88 });
    assert.deepEqual(utils.parseCoordinates('-15,79 -47,88'), { lat: -15.79, lng: -47.88 });
    assert.deepEqual(utils.parseCoordinates('-15,79; -47,88'), { lat: -15.79, lng: -47.88 });
    assert.deepEqual(utils.parseCoordinates('-15,79, -47,88'), { lat: -15.79, lng: -47.88 });
    assert.deepEqual(utils.parseCoordinates('15.79S, 47.88W'), { lat: -15.79, lng: -47.88 });
});

test('parseCoordinates: pares em GMS', () => {
    const r = utils.parseCoordinates('15°47\'38.0"S 47°52\'58.0"W');
    near(r.lat, -(15 + 47 / 60 + 38 / 3600), 1e-9, 'lat');
    near(r.lng, -(47 + 52 / 60 + 58 / 3600), 1e-9, 'lng');
    const r2 = utils.parseCoordinates('15°47\'38"S, 47°52\'58"W');
    near(r2.lat, r.lat, 1e-9, 'lat com vírgula');
    const r3 = utils.parseCoordinates('S 15 47 38, W 47 52 58');
    near(r3.lng, r.lng, 1e-9, 'lng com letra antes');
});

test('parseCoordinates: entradas inválidas', () => {
    assert.equal(utils.parseCoordinates(''), null);
    assert.equal(utils.parseCoordinates('abc'), null);
    assert.equal(utils.parseCoordinates('-15.79'), null);
    assert.equal(utils.parseCoordinates('-95, -47'), null);
});

test('latLngToUtm: Brasília fica na zona 23L com valores conhecidos', () => {
    // Referência (biblioteca utm do Python): 23L 191141 E, 8251747 N
    const u = utils.latLngToUtm(-15.793889, -47.882778);
    assert.equal(u.zone, 23);
    assert.equal(u.band, 'L');
    assert.equal(u.hemisphere, 'S');
    near(u.easting, 191141, 5, 'leste');
    near(u.northing, 8251747, 5, 'norte');
});

test('utmToLatLng: ida e volta em vários pontos', () => {
    const points = [[-15.79, -47.88], [-23.55, -46.63], [-3.12, -60.02], [2.82, -60.67], [40.7, -74.0], [-33.86, 151.21]];
    for (const [lat, lng] of points) {
        const u = utils.latLngToUtm(lat, lng);
        const back = utils.utmToLatLng(u.zone, u.hemisphere, u.easting, u.northing);
        near(back.lat, lat, 1e-6, `lat ${lat}`);
        near(back.lng, lng, 1e-6, `lng ${lng}`);
        const backByBand = utils.utmToLatLng(u.zone, u.band, u.easting, u.northing);
        near(backByBand.lat, lat, 1e-6, `lat por banda ${lat}`);
    }
});

test('parseCoordinates: UTM em vários formatos', () => {
    const u = utils.latLngToUtm(-15.79, -47.88);
    const e = Math.round(u.easting), n = Math.round(u.northing);
    const forms = [`23L ${e} ${n}`, `23 L ${e} ${n}`, `${e} ${n} 23L`, `UTM 23L ${e}, ${n}`, `23S ${e} ${n}`];
    for (const f of forms) {
        const r = utils.parseCoordinates(f);
        assert.ok(r, `parse de "${f}"`);
        near(r.lat, -15.79, 1e-4, `lat de "${f}"`);
        near(r.lng, -47.88, 1e-4, `lng de "${f}"`);
    }
    assert.equal(utils.parseCoordinates('99L 190000 8250000'), null, 'zona inválida');
});

test('toDMS e formatUtm', () => {
    assert.equal(utils.toDMS(-15.793889, -47.882778), '15°47\'38.00"S 47°52\'58.00"W');
    assert.equal(utils.toDMS(0, 0), '0°00\'00.00"N 0°00\'00.00"E');
    assert.match(utils.formatUtm(-15.793889, -47.882778), /^23L \d{6} \d{7}$/);
    // GMS gerado deve ser reinterpretado com o mesmo valor
    const r = utils.parseCoordinates(utils.toDMS(-15.793889, -47.882778));
    near(r.lat, -15.793889, 1e-5, 'GMS ida e volta lat');
    near(r.lng, -47.882778, 1e-5, 'GMS ida e volta lng');
});
