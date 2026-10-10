// ======================================================
// INVICTA - Camada de Banco de Dados (SQLite)
// ======================================================
//
// Usa o SQLite embutido do Node 22 (node:sqlite) - nao precisa
// instalar nada. Guarda as leituras do ESP32 e os alarmes em
// tabelas de verdade, com migracao automatica dos arquivos
// JSON antigos (data/leituras.json e data/alarmes.json).
//
// API exposta:
//   listarLeituras()        -> array de leituras (ordem cronologica)
//   inserirLeitura(leitura) -> insere e retorna a leitura
//   listarAlarmes()         -> array de alarmes (ordem cronologica)
//   inserirAlarme(alarme)   -> insere e retorna o alarme
//   contarLeituras()        -> quantidade total de leituras
//   contarAlarmes()         -> quantidade total de alarmes
//   limparExcedente(tabela, maximo) -> poda registros antigos
//
// ======================================================

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, "invicta.db");

const db = new DatabaseSync(DB_FILE);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

// ======================================================
// CRIAR TABELAS
// ======================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS leituras (
        id         INTEGER PRIMARY KEY,
        valor      REAL    NOT NULL,
        nivel      REAL    NOT NULL,
        mensagem   TEXT,
        status     TEXT,
        classificacao TEXT,
        gravidade  INTEGER,
        timestamp  TEXT,
        data       TEXT,
        hora       TEXT,
        statusLixo TEXT,
        distanciaLixo REAL
    );

    CREATE TABLE IF NOT EXISTS alarmes (
        id         INTEGER PRIMARY KEY,
        tipo       TEXT,
        status     TEXT,
        mensagem   TEXT,
        valor      REAL,
        nivel      REAL,
        gravidade  INTEGER,
        data       TEXT,
        hora       TEXT,
        timestamp  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leituras_ts
        ON leituras (timestamp);

    CREATE INDEX IF NOT EXISTS idx_alarmes_ts
        ON alarmes (timestamp);
`);

// Migracao: adiciona colunas de obstrucao em bancos antigos.
// (SQLite nao tem "ADD COLUMN IF NOT EXISTS", entao tentamos
//  e ignoramos o erro se a coluna ja existir.)
function adicionarColunaSeFaltando(sql) {
    try {
        db.exec(sql);
    } catch (_) {
        // coluna ja existe - ignora
    }
}

adicionarColunaSeFaltando(
    "ALTER TABLE leituras ADD COLUMN statusLixo TEXT"
);

adicionarColunaSeFaltando(
    "ALTER TABLE leituras ADD COLUMN distanciaLixo REAL"
);

// ======================================================
// MIGRACAO DOS JSONs ANTIGOS (roda 1x)
// ======================================================

function contarLeituras() {
    const row = db.prepare("SELECT COUNT(*) AS n FROM leituras").get();
    return row ? Number(row.n) : 0;
}

function contarAlarmes() {
    const row = db.prepare("SELECT COUNT(*) AS n FROM alarmes").get();
    return row ? Number(row.n) : 0;
}

// Retorna o registro mais recente (usado para throttle de alarme
// e para a rota /api/leituras/ultima sem carregar a tabela inteira).
function ultimaLeitura() {
    const row = db.prepare(`
        SELECT * FROM leituras
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
    `).get();
    return row || null;
}

function ultimoAlarme() {
    const row = db.prepare(`
        SELECT * FROM alarmes
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
    `).get();
    return row || null;
}

function migrarJsonAntigo() {
    const LEITURAS_JSON = path.join(DATA_DIR, "leituras.json");
    const ALARMES_JSON = path.join(DATA_DIR, "alarmes.json");

    if (contarLeituras() === 0 && fs.existsSync(LEITURAS_JSON)) {
        try {
            const bruto = fs.readFileSync(LEITURAS_JSON, "utf8");
            const dados = bruto.trim() ? JSON.parse(bruto) : [];
            if (Array.isArray(dados) && dados.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR IGNORE INTO leituras
                    (id, valor, nivel, mensagem, status,
                     classificacao, gravidade, timestamp, data, hora)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const l of dados) {
                    stmt.run(
                        l.id,
                        Number(l.valor ?? l.nivel ?? 0),
                        Number(l.nivel ?? l.valor ?? 0),
                        l.mensagem ?? null,
                        l.status ?? null,
                        l.classificacao ?? null,
                        l.gravidade ?? null,
                        l.timestamp ?? null,
                        l.data ?? null,
                        l.hora ?? null
                    );
                }
                console.log(
                    `[DB] Migradas ${dados.length} leituras do JSON.`
                );
            }
        } catch (erro) {
            console.error("[DB] Erro ao migrar leituras.json:", erro.message);
        }
    }

    if (contarAlarmes() === 0 && fs.existsSync(ALARMES_JSON)) {
        try {
            const bruto = fs.readFileSync(ALARMES_JSON, "utf8");
            const dados = bruto.trim() ? JSON.parse(bruto) : [];
            if (Array.isArray(dados) && dados.length > 0) {
                const stmt = db.prepare(`
                    INSERT OR IGNORE INTO alarmes
                    (id, tipo, status, mensagem, valor, nivel,
                     gravidade, data, hora, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const a of dados) {
                    stmt.run(
                        a.id,
                        a.tipo ?? null,
                        a.status ?? null,
                        a.mensagem ?? null,
                        Number(a.valor ?? a.nivel ?? 0),
                        Number(a.nivel ?? a.valor ?? 0),
                        a.gravidade ?? null,
                        a.data ?? null,
                        a.hora ?? null,
                        a.timestamp ?? null
                    );
                }
                console.log(
                    `[DB] Migrados ${dados.length} alarmes do JSON.`
                );
            }
        } catch (erro) {
            console.error("[DB] Erro ao migrar alarmes.json:", erro.message);
        }
    }
}

migrarJsonAntigo();

// ======================================================
// FUNCOES DE ACESSO
// ======================================================

function listarLeituras() {
    return db
        .prepare("SELECT * FROM leituras ORDER BY timestamp ASC, id ASC")
        .all();
}

function inserirLeitura(l) {
    db.prepare(`
        INSERT INTO leituras
        (id, valor, nivel, mensagem, status,
         classificacao, gravidade, timestamp, data, hora,
         statusLixo, distanciaLixo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        l.id,
        Number(l.valor ?? l.nivel ?? 0),
        Number(l.nivel ?? l.valor ?? 0),
        l.mensagem ?? null,
        l.status ?? null,
        l.classificacao ?? null,
        l.gravidade ?? null,
        l.timestamp ?? null,
        l.data ?? null,
        l.hora ?? null,
        l.statusLixo ?? null,
        (l.distanciaLixo === undefined || l.distanciaLixo === null)
            ? null
            : Number(l.distanciaLixo)
    );
    return l;
}

function listarAlarmes() {
    return db
        .prepare("SELECT * FROM alarmes ORDER BY timestamp ASC, id ASC")
        .all();
}

function inserirAlarme(a) {
    db.prepare(`
        INSERT INTO alarmes
        (id, tipo, status, mensagem, valor, nivel,
         gravidade, data, hora, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        a.id,
        a.tipo ?? null,
        a.status ?? null,
        a.mensagem ?? null,
        Number(a.valor ?? a.nivel ?? 0),
        Number(a.nivel ?? a.valor ?? 0),
        a.gravidade ?? null,
        a.data ?? null,
        a.hora ?? null,
        a.timestamp ?? null
    );
    return a;
}

// Poda os registros mais antigos quando passa do limite.
// "tabela" = 'leituras' | 'alarmes'
function limparExcedente(tabela, maximo) {
    if (!Number.isFinite(maximo) || maximo <= 0) {
        return;
    }
    db.prepare(`
        DELETE FROM ${tabela}
        WHERE id IN (
            SELECT id FROM ${tabela}
            ORDER BY id ASC
            LIMIT MAX(0, (SELECT COUNT(*) FROM ${tabela}) - ?)
        )
    `).run(maximo);
}

function fechar() {
    try {
        db.close();
    } catch (_) {
        // ignora
    }
}

// Substitui TODO o conteudo da tabela pela lista recebida.
// Usado pelo server.js no padrao "ler -> modificar -> salvar".
// Roda em transacao: ou grava tudo, ou nao grava nada.
function substituirLeituras(lista) {
    const itens = Array.isArray(lista) ? lista : [];
    db.exec("BEGIN");
    try {
        db.exec("DELETE FROM leituras");
        const stmt = db.prepare(`
            INSERT INTO leituras
            (id, valor, nivel, mensagem, status,
             classificacao, gravidade, timestamp, data, hora,
             statusLixo, distanciaLixo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of itens) {
            stmt.run(
                l.id,
                Number(l.valor ?? l.nivel ?? 0),
                Number(l.nivel ?? l.valor ?? 0),
                l.mensagem ?? null,
                l.status ?? null,
                l.classificacao ?? null,
                l.gravidade ?? null,
                l.timestamp ?? null,
                l.data ?? null,
                l.hora ?? null,
                l.statusLixo ?? null,
                (l.distanciaLixo === undefined || l.distanciaLixo === null)
                    ? null
                    : Number(l.distanciaLixo)
            );
        }
        db.exec("COMMIT");
    } catch (erro) {
        db.exec("ROLLBACK");
        throw erro;
    }
}

function substituirAlarmes(lista) {
    const itens = Array.isArray(lista) ? lista : [];
    db.exec("BEGIN");
    try {
        db.exec("DELETE FROM alarmes");
        const stmt = db.prepare(`
            INSERT INTO alarmes
            (id, tipo, status, mensagem, valor, nivel,
             gravidade, data, hora, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of itens) {
            stmt.run(
                a.id,
                a.tipo ?? null,
                a.status ?? null,
                a.mensagem ?? null,
                Number(a.valor ?? a.nivel ?? 0),
                Number(a.nivel ?? a.valor ?? 0),
                a.gravidade ?? null,
                a.data ?? null,
                a.hora ?? null,
                a.timestamp ?? null
            );
        }
        db.exec("COMMIT");
    } catch (erro) {
        db.exec("ROLLBACK");
        throw erro;
    }
}

module.exports = {
    DB_FILE,
    listarLeituras,
    inserirLeitura,
    ultimaLeitura,
    substituirLeituras,
    listarAlarmes,
    inserirAlarme,
    ultimoAlarme,
    substituirAlarmes,
    contarLeituras,
    contarAlarmes,
    limparExcedente,
    fechar
};

