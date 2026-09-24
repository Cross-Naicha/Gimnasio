// Ejecutar con Node. La comprobación de navegador requiere Playwright.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const math = require('./calculations.js');
math.configure(require('./datos/progresiones.json'));
assert.throws(() => math.validateProgressions({ principal: [] }));
const fs = require('node:fs');
const http = require('node:http');

const equipment = {
    type: 'bar', bar: 20,
    plates: [20, 10, 5, 2.5, 1.25].map(kg => ({ kg, pairs: 1 }))
};

assert.equal(math.possibleWeight(71.75, equipment).weight, 72.5);
assert.equal(math.possibleWeight(72.5, equipment).weight, 72.5);
assert.equal(math.possibleWeight(200, equipment), null);
assert.equal(math.possibleWeight(10, equipment).weight, 20);
assert.equal(math.possibleWeight(13, { type: 'db', weights: [10, 15, 20] }).weight, 15);
assert.equal(math.possibleWeight(13, { type: 'db', weights: [] }), null);
assert.deepEqual(math.prescription('principal', 8).map(s => s.reps), [5, 3, 2]);
assert.deepEqual(math.prescription('accessory', 8).map(s => s.percent), [70, 72.5, 75]);
assert.equal(math.duration({ kind: 'principal', sets: 3, rest: 180, secondsPerRep: 3, preparation: 120 }, 0), 546);
assert.equal(math.duration({ kind: 'accessory', sets: 1, rest: 120, secondsPerRep: 3, preparation: 60 }, 0), 105);

(async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    // Subcarpeta /ronda/: reproduce las rutas de un proyecto en GitHub Pages.
    const server = http.createServer((req, res) => {
        const relative = decodeURIComponent(req.url.split('?')[0]).replace(/^\/ronda\//, '');
        const filename = path.resolve(__dirname, relative);
        if (!filename.startsWith(__dirname + path.sep)) { res.writeHead(403).end(); return; }
        fs.readFile(filename, (error, bytes) => {
            if (error) { res.writeHead(404).end(); return; }
            res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(filename)] || 'text/plain');
            res.end(bytes);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}/ronda/index.html`;
    await page.goto(url);
    await page.locator('#session').waitFor();
    await page.getByRole('button', { name: 'Ejercicios y RM', exact: true }).click();
    await page.locator('#rm-form [name=kg]').fill('105');
    await page.locator('#rm-form button').click();
    await page.getByRole('button', { name: 'Aplicar a la rutina', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Ejercicios y RM', exact: true }).click();
    assert.match(await page.locator('#content').innerText(), /105 kg/);
    await page.getByRole('button', { name: 'Entrenamiento', exact: true }).click();
    await page.locator('#stage').selectOption('8');
    assert.match(await page.locator('#content').innerText(), /94,5 kg/);
    await page.locator('#session').selectOption('1');
    assert.match(await page.locator('#content').innerText(), /Falta aplicar un RM/);
    await page.getByRole('button', { name: 'Respaldo', exact: true }).click();
    const snapshot = await page.evaluate(() => localStorage.getItem('ronda.config.v1'));
    await page.locator('#import').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('No se importó'));
    assert.equal(await page.evaluate(() => localStorage.getItem('ronda.config.v1')), snapshot);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /^ronda-respaldo/);
    await page.locator('#import').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(snapshot) });
    await page.locator('#confirm-import').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('ronda.config.v1')), snapshot);
    for (const width of [320, 390, 900]) {
        await page.setViewportSize({ width, height: 900 });
        for (const name of ['Entrenamiento', 'Ejercicios y RM', 'Mi gimnasio', 'Respaldo']) {
            await page.getByRole('button', { name, exact: true }).click();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
    }
    await page.getByRole('button', { name: 'Entrenamiento', exact: true }).click();
    await page.locator('#session').selectOption('0');
    await page.locator('#stage').selectOption('0');
    await page.screenshot({ path: '.work/ronda-desktop.png', fullPage: true });
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: 'Respaldo', exact: true }).click();
    await page.locator('#reload-source').click();
    await page.locator('#apply-source').click();
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('ronda.config.v1'))).exercises[0].records[0].kg, 102.5);
    await page.route('**/datos/ejercicios/bench-press.json', route => {
        const data = JSON.parse(fs.readFileSync('datos/ejercicios/bench-press.json'));
        data.records[0].kg = 110;
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.locator('#reload-source').click();
    await page.locator('#apply-source').click();
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('ronda.config.v1'))).exercises[0].records[0].kg, 110);
    await page.route('**/datos/progresiones.json', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.locator('#reload-source').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('No se reemplazó'));
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('ronda.config.v1'))).exercises[0].records[0].kg, 110);
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'No se pudo cargar' }).waitFor();
    console.log('PASS: calculations, RM application, persistence, navigation, responsive widths.');
    console.log('PASS: JSON reload, edited exercise, invalid source preserves local data, nested hosting paths.');
    } finally {
        await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
