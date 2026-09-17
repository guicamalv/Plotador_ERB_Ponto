'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../utils.js');
const clipping = require('../vendor/polygon-clipping/polygon-clipping.umd.min.js');

const CENTER = { lat: -15.79, lng: -47.88 };
const sector = (over = {}) => ({ lat: CENTER.lat, lng: CENTER.lng, azimuth: 90, radius: 1000, beamwidth: 120, ...over });
const sectorArea = s => Math.PI * s.radius ** 2 * Math.min(s.beamwidth, 360) / 360;
const near = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg}: ${got} vs ${want}`);

test('bearingBetween: pontos cardeais', () => {
    const north = utils.destinationPoint(CENTER.lat, CENTER.lng, 0, 500);
    const east = utils.destinationPoint(CENTER.lat, CENTER.lng, 90, 500);
    const southWest = utils.destinationPoint(CENTER.lat, CENTER.lng, 225, 500);
    near(utils.bearingBetween(CENTER.lat, CENTER.lng, north[0], north[1]), 0, 0.01, 'norte');
    near(utils.bearingBetween(CENTER.lat, CENTER.lng, east[0], east[1]), 90, 0.01, 'leste');
    near(utils.bearingBetween(CENTER.lat, CENTER.lng, southWest[0], southWest[1]), 225, 0.01, 'sudoeste');
});

test('haversineDistance: ida e volta com destinationPoint', () => {
    const p = utils.destinationPoint(CENTER.lat, CENTER.lng, 37, 1234);
    near(utils.haversineDistance(CENTER.lat, CENTER.lng, p[0], p[1]), 1234, 0.01, 'distância');
});

test('angleInSector: volta em 360 graus', () => {
    assert.equal(utils.angleInSector(350, 0, 60), true);
    assert.equal(utils.angleInSector(10, 0, 60), true);
    assert.equal(utils.angleInSector(40, 0, 60), false);
    assert.equal(utils.angleInSector(5, 350, 30), true);
    assert.equal(utils.angleInSector(179, 0, 359), true);
    assert.equal(utils.angleInSector(180, 0, 359), false);
    assert.equal(utils.angleInSector(180, 0, 360), true);
    assert.equal(utils.angleInSector(123, 0, 360), true);
});

test('pointInSector: dentro, fora pela distância e fora pelo ângulo', () => {
    const s = sector();
    const inside = utils.destinationPoint(s.lat, s.lng, 100, 800);
    const tooFar = utils.destinationPoint(s.lat, s.lng, 90, 1200);
    const wrongAngle = utils.destinationPoint(s.lat, s.lng, 200, 500);
    const onEdge = utils.destinationPoint(s.lat, s.lng, 150, 999);
    assert.equal(utils.pointInSector(inside[0], inside[1], s), true);
    assert.equal(utils.pointInSector(tooFar[0], tooFar[1], s), false);
    assert.equal(utils.pointInSector(wrongAngle[0], wrongAngle[1], s), false);
    assert.equal(utils.pointInSector(onEdge[0], onEdge[1], s), true);
    assert.equal(utils.pointInSector(s.lat, s.lng, s), true);
});

test('pointInSector: setor cruzando o norte e círculo completo', () => {
    const north = sector({ azimuth: 0, beamwidth: 90 });
    const nw = utils.destinationPoint(north.lat, north.lng, 330, 500);
    const sw = utils.destinationPoint(north.lat, north.lng, 210, 500);
    assert.equal(utils.pointInSector(nw[0], nw[1], north), true);
    assert.equal(utils.pointInSector(sw[0], sw[1], north), false);

    const circle = sector({ beamwidth: 360 });
    assert.equal(utils.pointInSector(sw[0], sw[1], circle), true);
});

test('localProjection: ida e volta e escala em metros', () => {
    const proj = utils.localProjection(CENTER.lat, CENTER.lng);
    const east = utils.destinationPoint(CENTER.lat, CENTER.lng, 90, 1000);
    const [x, y] = proj.toXY(east[0], east[1]);
    near(x, 1000, 1, 'x em metros');
    near(y, 0, 1, 'y em metros');
    const back = proj.toLatLng(x, y);
    near(back[0], east[0], 1e-7, 'lat de volta');
    near(back[1], east[1], 1e-7, 'lng de volta');
});

test('ringArea e ringCentroid: quadrado de 100 m', () => {
    const square = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    assert.equal(utils.ringArea(square), 10000);
    assert.deepEqual(utils.ringCentroid(square), [50, 50]);
});

test('getSectorPoints: círculo completo não tem ponta até o centro', () => {
    const pts = utils.getSectorPoints(CENTER.lat, CENTER.lng, 0, 1000, 360);
    assert.equal(pts.length, 31);
    assert.notDeepEqual(pts[0], [CENTER.lat, CENTER.lng]);
});

test('sectorsIntersection: um setor devolve o próprio setor com área coerente', () => {
    const s = sector();
    const r = utils.sectorsIntersection([s], clipping, 90);
    assert.ok(r);
    near(r.areaM2, sectorArea(s), sectorArea(s) * 0.01, 'área do setor');
    assert.ok(utils.pointInSector(r.centroid.lat, r.centroid.lng, s), 'centróide dentro do setor');
});

test('sectorsIntersection: setores idênticos e setores disjuntos', () => {
    const s = sector();
    const same = utils.sectorsIntersection([s, { ...s }], clipping, 90);
    near(same.areaM2, sectorArea(s), sectorArea(s) * 0.01, 'área idêntica');

    const opposite = sector({ azimuth: 270 });
    assert.equal(utils.sectorsIntersection([s, opposite], clipping), null);

    const far = sector({ lat: CENTER.lat + 0.1 });
    assert.equal(utils.sectorsIntersection([s, far], clipping), null);
});

test('sectorsIntersection: dois círculos deslocados têm área de lente conhecida', () => {
    // Círculos de raio r com centros a distância d: área da lente = 2r²·acos(d/2r) − (d/2)·sqrt(4r² − d²)
    const r = 1000, d = 1000;
    const a = sector({ beamwidth: 360, radius: r });
    const bPos = utils.destinationPoint(a.lat, a.lng, 90, d);
    const b = sector({ beamwidth: 360, radius: r, lat: bPos[0], lng: bPos[1] });
    const lens = 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);
    const res = utils.sectorsIntersection([a, b], clipping, 180);
    assert.ok(res);
    near(res.areaM2, lens, lens * 0.01, 'área da lente');
    near(res.centroid.lat, a.lat, 1e-4, 'centróide na mesma latitude');
    // O centróide fica no meio do caminho entre os centros
    const mid = utils.destinationPoint(a.lat, a.lng, 90, d / 2);
    near(res.centroid.lng, mid[1], 1e-4, 'centróide no meio');
});

test('sectorsIntersection: três setores apontando para um ponto comum', () => {
    const target = { lat: CENTER.lat, lng: CENTER.lng };
    const sectors = [0, 120, 240].map(bearing => {
        const pos = utils.destinationPoint(target.lat, target.lng, bearing, 600);
        return { lat: pos[0], lng: pos[1], azimuth: (bearing + 180) % 360, radius: 1000, beamwidth: 60 };
    });
    const res = utils.sectorsIntersection(sectors, clipping, 60);
    assert.ok(res, 'há interseção');
    assert.ok(res.areaM2 > 0);
    sectors.forEach((s, i) => assert.ok(utils.pointInSector(res.centroid.lat, res.centroid.lng, s), `centróide no setor ${i}`));
    near(res.centroid.lat, target.lat, 2e-4, 'centróide perto do alvo');
});

test('coverageGrid: contagens, histograma e limites', () => {
    const s = sector({ beamwidth: 360, radius: 500 });
    const grid = utils.coverageGrid([s, { ...s }], 50);
    assert.ok(grid);
    assert.equal(grid.max, 2);
    assert.equal(grid.histogram[1], 0, 'nenhuma célula com apenas um setor');
    const covered = grid.histogram[2] * grid.cellAreaM2;
    near(covered, Math.PI * 500 * 500, Math.PI * 500 * 500 * 0.05, 'área coberta ≈ área do círculo');
    assert.ok(grid.bounds.south < s.lat && grid.bounds.north > s.lat);
    assert.ok(grid.bounds.west < s.lng && grid.bounds.east > s.lng);
    assert.equal(grid.counts.length, grid.cols * grid.rows);
});

test('coverageGrid: aumenta a célula para respeitar o limite de células', () => {
    const s = sector({ beamwidth: 360, radius: 5000 });
    const grid = utils.coverageGrid([s], 5, 10000);
    assert.ok(grid.cols * grid.rows <= 10000);
    assert.ok(grid.cellSizeM > 5);
});

test('formatArea', () => {
    assert.equal(utils.formatArea(500), '500 m²');
    assert.equal(utils.formatArea(25000), '2.50 ha');
    assert.equal(utils.formatArea(2500000), '2.50 km²');
});
