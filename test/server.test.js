const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

let backend;
let baseUrl;
let tempDir;
const priorDbFile = process.env.INVICTA_DB_FILE;
const priorDataDir = process.env.INVICTA_DATA_DIR;

before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "invicta-test-"));
    process.env.INVICTA_DB_FILE = path.join(tempDir, "test.db");
    process.env.INVICTA_DATA_DIR = tempDir;

    backend = require("../server");
    await new Promise((resolve, reject) => {
        backend.server.once("error", reject);
        backend.server.listen(0, "127.0.0.1", resolve);
    });

    const address = backend.server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    if (backend?.server.listening) {
        backend.server.closeAllConnections();
        await new Promise((resolve, reject) => {
            backend.server.close((error) => error ? reject(error) : resolve());
        });
    }
    backend?.database.fechar();
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (priorDbFile === undefined) {
        delete process.env.INVICTA_DB_FILE;
    } else {
        process.env.INVICTA_DB_FILE = priorDbFile;
    }
    if (priorDataDir === undefined) {
        delete process.env.INVICTA_DATA_DIR;
    } else {
        process.env.INVICTA_DATA_DIR = priorDataDir;
    }
});

async function jsonRequest(route, options) {
    const response = await fetch(`${baseUrl}${route}`, options);
    return { response, body: await response.json() };
}

test("sensor, obstrução, alarmes, diagnóstico e bot funcionam com dados reais", async () => {
    const dashboardResponse = await fetch(baseUrl);
    assert.equal(dashboardResponse.status, 200);
    assert.match(await dashboardResponse.text(), /id="nivel"/);

    const obstructionPageResponse = await fetch(`${baseUrl}/obstrucao.html`);
    assert.equal(obstructionPageResponse.status, 200);
    assert.match(await obstructionPageResponse.text(), /id="listaObstrucoes"/);

    const { response: healthResponse, body: health } =
        await jsonRequest("/health");
    assert.equal(healthResponse.status, 200);
    assert.equal(health.status, "ok");

    const { response: invalidBot } = await jsonRequest("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: " " })
    });
    assert.equal(invalidBot.status, 400);

    const { body: greeting } = await jsonRequest("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: "Olá!" })
    });
    assert.match(greeting.resposta, /Posso consultar/);

    const { response: readingResponse, body: reading } =
        await jsonRequest("/esp32", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nivel: 0,
                mensagem: "SEGURO - Nivel da agua: 0",
                fonteNivel: "REAL",
                statusLixo: "INDETERMINADO",
                distanciaLixo: -1
            })
        });
    assert.equal(readingResponse.status, 200);
    assert.equal(reading.sucesso, true);
    assert.equal(reading.dados.leitura.valor, 0);
    assert.equal(reading.dados.leitura.fonteNivel, "REAL");
    assert.equal(reading.dados.leitura.distanciaLixo, null);

    const { body: latest } = await jsonRequest("/api/leituras/ultima");
    assert.equal(latest.nivel, 0);
    assert.equal(latest.fonteNivel, "REAL");
    assert.equal(latest.distanciaLixo, null);
    assert.equal(latest.mensagem, "SEGURO - Nivel da agua: 0");

    const { body: leituras } = await jsonRequest("/api/leituras");
    assert.equal(leituras.length, 1);
    assert.equal(leituras[0].mensagem, "SEGURO - Nivel da agua: 0");
    assert.equal(leituras[0].statusLixo, "INDETERMINADO");
    assert.equal(leituras[0].fonteNivel, "REAL");

    const { body: diagnosis } =
        await jsonRequest("/api/diagnostico/sensor-nivel");
    assert.equal(diagnosis.status, "OK");
    assert.equal(diagnosis.zeradas, 1);

    const { body: levelAnswer } = await jsonRequest("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: "Qual é o nível da água?" })
    });
    assert.match(levelAnswer.resposta, /nível recebido foi 0/i);
    assert.match(levelAnswer.resposta, /real/);

    const payload = {
        nivel: 2000,
        fonteNivel: "REAL",
        statusLixo: "OBSTRUCAO",
        distanciaLixo: 5.5
    };
    for (let tentativa = 0; tentativa < 2; tentativa++) {
        const { response } = await jsonRequest("/esp32", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        assert.equal(response.status, 200);
    }

    const { body: alarmes } = await jsonRequest("/api/alarmes");
    assert.equal(alarmes.filter((alarme) => alarme.tipo === "ALERTA").length, 1);
    assert.equal(alarmes.filter((alarme) => alarme.tipo === "OBSTRUCAO").length, 1);

    await jsonRequest("/esp32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            nivel: 0,
            fonteNivel: "REAL",
            statusLixo: "NORMAL",
            distanciaLixo: 25
        })
    });
    await jsonRequest("/esp32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const { body: obstrucoes } =
        await jsonRequest("/api/alarmes/obstrucao");
    assert.equal(obstrucoes.length, 2);
    assert.equal(obstrucoes[0].distanciaLixo, 5.5);

    const { body: obstructionAnswer } = await jsonRequest("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: "O tubo está obstruído?" })
    });
    assert.match(obstructionAnswer.resposta, /OBSTRUÇÃO/);

    await jsonRequest("/esp32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            nivel: 0,
            fonteNivel: "SIMULADO",
            statusLixo: "NORMAL",
            distanciaLixo: null
        })
    });
    const { body: simulatedDiagnosis } =
        await jsonRequest("/api/diagnostico/sensor-nivel");
    assert.equal(simulatedDiagnosis.status, "SIMULADO");

    const { body: simulatedAnswer } = await jsonRequest("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: "Qual é o nível da água?" })
    });
    assert.match(simulatedAnswer.resposta, /simulada\/de teste/);

    const { response: negativeTest } = await jsonRequest("/api/teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel: -1 })
    });
    assert.equal(negativeTest.status, 400);
});
