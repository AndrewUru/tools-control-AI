// Host check of the generated offline API; Android instrumentation additionally
// validates the real Java bridge and persistence across activity restarts.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-test-'));
const file = path.join(temp, 'test.db');
fs.copyFileSync('android/app/src/main/assets/demo.db', file);
const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys=ON');
const context = vm.createContext({
  console, URL, Headers, Response, location: { href: 'https://appassets.androidplatform.net/', origin: 'https://appassets.androidplatform.net' },
  Android: {
    database(sql, json, mode) {
      try {
        const args = JSON.parse(json);
        let value;
        if (mode === 'exec') { db.exec(sql); value = null; }
        else if (mode === 'all') value = db.prepare(sql).all(...args);
        else value = db.prepare(sql).run(...args);
        return JSON.stringify({ value });
      } catch (e) { return JSON.stringify({ error: e.message }); }
    },
    randomHex(n) { return crypto.randomBytes(n).toString('hex'); },
    verifyPassword(p, saved) {
      const [salt, hash] = saved.split(':');
      return !!hash && crypto.pbkdf2Sync(p, salt, 120000, 32, 'sha256').toString('hex') === hash;
    },
  },
});
context.window = context;
vm.runInContext(fs.readFileSync('android/app/src/main/assets/web/offline.js', 'utf8'), context);
vm.runInContext(`
const SES = { guardar(token) { this.token = token; } };
async function api(method, url, body) {
 const r = await fetch(url, {method, headers: {Authorization: 'Bearer ' + (SES.token || '')}, body: body ? JSON.stringify(body) : undefined});
 const value = await r.json(); if (!r.ok) throw new Error(value.error); return value;
}
const GET = url => api('GET', url);
async function router() {}
const document = {querySelector() {return {innerText: 'herramienta'};}};
`, context);
(async () => {
  try {
    await vm.runInContext(fs.readFileSync('android/app/src/androidTest/assets/smoke.js', 'utf8'), context);
    if (context.SMOKE_RESULT !== 'PASS') throw new Error(context.SMOKE_RESULT);
    const reopened = new DatabaseSync(file);
    try {
      if (!reopened.prepare("SELECT id FROM herramientas WHERE nombre = 'Prueba persistencia MVP'").get()) throw new Error('Data was not persisted to disk');
    } finally { reopened.close(); }
    console.log('PASS: generated offline API smoke tests and persisted SQLite data (Node SQLite adapter).');
  } finally {
    db.close(); fs.rmSync(file); fs.rmdirSync(temp);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
