require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const database = require("./database");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = Number(process.env.PORT || 5000);

const NIVEL_ATENCAO = Number(
    process.env.NIVEL_ATENCAO || 1000
);

const NIVEL_PERIGO = Number(
    process.env.NIVEL_PERIGO || 2000
);

const NIVEL_CRITICO = Number(
    process.env.NIVEL_CRITICO || 3000
);

const MAX_LEITURAS = Number(
    process.env.MAX_LEITURAS || 1000
);

const MAX_ALARMES = Number(
    process.env.MAX_ALARMES || 500
);

// Intervalo (ms) para RE-avisar uma obstrução que continua ativa.
// Evita flood no histórico: cria alerta na transição e repete a cada
// este tempo enquanto a obstrução persistir.
const OBSTRUCAO_REALERTA_MS = Number(
    process.env.OBSTRUCAO_REALERTA_MS || 1 * 60 * 1000
);

// Quantas leituras zeradas seguidas indicam falha do sensor de nível
// no diagnóstico (usado pela rota /api/diagnostico/sensor-nivel).
const DIAG_AMOSTRAS = Number(
    process.env.DIAG_AMOSTRAS || 50
);

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");

const LEITURAS_FILE = path.join(
    DATA_DIR,
    "leituras.json"
);

const ALARMES_FILE = path.join(
    DATA_DIR,
    "alarmes.json"
);

const LATITUDE = Number(
    process.env.LATITUDE || -23.5505
);

const LONGITUDE = Number(
    process.env.LONGITUDE || -46.6333
);

const FUSO = "America/Sao_Paulo";


// ======================================================
// CONFIGURAÇÃO DO EXPRESS
// ======================================================

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(cors());

app.use(
    express.json({
        limit: "100kb"
    })
);

app.use(morgan("dev"));

app.use(
    express.static(PUBLIC_DIR)
);


// ======================================================
// CRIAR PASTA DE DADOS
// ======================================================

if (!fs.existsSync(DATA_DIR)) {

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );
}


// ======================================================
// LER (agora via banco SQLite)
// ======================================================

function lerArquivo(caminho) {
    if (caminho === LEITURAS_FILE) {
        return database.listarLeituras();
    }
    if (caminho === ALARMES_FILE) {
        return database.listarAlarmes();
    }

    throw new Error("Arquivo de dados não reconhecido.");
}


// ======================================================
// SALVAR JSON
// ======================================================

function salvarArquivo(
    caminho,
    dados
) {

    // Agora salva no banco SQLite. Mantém a mesma assinatura
    // usada no resto do código: salvarArquivo(FILE, lista).
    // Substitui todo o conteúdo da tabela pela lista, em
    // transação (grava tudo ou não grava nada).

    if (
        caminho ===
        LEITURAS_FILE
    ) {

        database.substituirLeituras(
            dados
        );

        return;
    }

    if (
        caminho ===
        ALARMES_FILE
    ) {

        database.substituirAlarmes(
            dados
        );

        return;
    }

    throw new Error("Arquivo de dados não reconhecido.");
}


// ======================================================
// DATA E HORA
// ======================================================

function dataBR(timestamp) {

    return new Date(
        timestamp
    ).toLocaleDateString(
        "pt-BR",
        {
            timeZone: FUSO
        }
    );
}


function horaBR(timestamp) {

    return new Date(
        timestamp
    ).toLocaleTimeString(
        "pt-BR",
        {
            timeZone: FUSO
        }
    );
}


// ======================================================
// CLASSIFICAR NÍVEL
// ======================================================

function classificarNivel(valor) {

    if (
        valor <
        NIVEL_ATENCAO
    ) {

        return {

            status: "SEGURO",

            nivel: "NORMAL",

            gravidade: 0
        };
    }


    if (
        valor <
        NIVEL_PERIGO
    ) {

        return {

            status: "ATENCAO",

            nivel: "ATENÇÃO",

            gravidade: 1
        };
    }


    if (
        valor <
        NIVEL_CRITICO
    ) {

        return {

            status: "PERIGO",

            nivel: "ALERTA",

            gravidade: 2
        };
    }


    return {

        status: "CRITICO",

        nivel: "CRÍTICO",

        gravidade: 3
    };
}


// ======================================================
// EXTRAIR NÍVEL DA MENSAGEM DO ESP32
// ======================================================

function extrairNivel(
    mensagem
) {

    if (
        typeof mensagem !==
        "string"
    ) {

        return null;
    }


    const resultado =
        mensagem.match(
            /Nivel da agua:\s*(\d+(?:[.,]\d+)?)/i
        );


    if (!resultado) {

        return null;
    }


    const valor =
        parseFloat(
            resultado[1].replace(
                ",",
                "."
            )
        );


    return Number.isFinite(
        valor
    )
        ? valor
        : null;
}


// ======================================================
// CALCULAR VELOCIDADE DA ÁGUA
// ======================================================

function calcularVelocidade() {

    const leituras =
        lerArquivo(
            LEITURAS_FILE
        );


    if (
        leituras.length < 2
    ) {

        return {

            velocidade: 0,

            unidade:
                "unidades/minuto",

            tendencia:
                "DADOS_INSUFICIENTES"
        };
    }


    const atual =
        leituras[
            leituras.length - 1
        ];


    const anterior =
        leituras[
            leituras.length - 2
        ];


    const valorAtual =
        Number(
            atual.valor
        );


    const valorAnterior =
        Number(
            anterior.valor
        );


    const tempoAtual =
        new Date(
            atual.timestamp
        ).getTime();


    const tempoAnterior =
        new Date(
            anterior.timestamp
        ).getTime();


    const diferencaTempo =
        (
            tempoAtual -
            tempoAnterior
        ) / 60000;


    if (
        !Number.isFinite(
            valorAtual
        ) ||

        !Number.isFinite(
            valorAnterior
        ) ||

        !Number.isFinite(
            diferencaTempo
        ) ||

        diferencaTempo <= 0
    ) {

        return {

            velocidade: 0,

            unidade:
                "unidades/minuto",

            tendencia:
                "INDETERMINADA"
        };
    }


    const velocidade =
        (
            valorAtual -
            valorAnterior
        ) /
        diferencaTempo;


    let tendencia =
        "ESTAVEL";


    if (
        velocidade > 0.01
    ) {

        tendencia =
            "SUBINDO";

    } else if (
        velocidade < -0.01
    ) {

        tendencia =
            "DESCENDO";
    }


    return {

        velocidade:
            Number(
                velocidade.toFixed(4)
            ),

        unidade:
            "unidades/minuto",

        tendencia
    };
}


// ======================================================
// ESTIMATIVA ATÉ NÍVEL CRÍTICO
// ======================================================

function calcularEstimativa() {

    const leituras =
        lerArquivo(
            LEITURAS_FILE
        );


    if (
        leituras.length < 2
    ) {

        return {

            disponivel: false,

            minutos: null,

            mensagem:
                "Dados insuficientes para realizar uma estimativa."
        };
    }


    const atual =
        leituras[
            leituras.length - 1
        ];


    const velocidadeInfo =
        calcularVelocidade();


    const velocidade =
        velocidadeInfo.velocidade;


    if (
        Number(atual.valor) >=
        NIVEL_CRITICO
    ) {

        return {

            disponivel: true,

            minutos: 0,

            mensagem:
                "O nível crítico já foi atingido."
        };
    }


    if (
        velocidade <= 0
    ) {

        return {

            disponivel: false,

            minutos: null,

            mensagem:
                "A água não apresenta tendência de subida no momento."
        };
    }


    const distancia =
        NIVEL_CRITICO -
        Number(atual.valor);


    const minutos =
        distancia /
        velocidade;


    if (
        !Number.isFinite(
            minutos
        )
    ) {

        return {

            disponivel: false,

            minutos: null,

            mensagem:
                "Não foi possível calcular a estimativa."
        };
    }


    return {

        disponivel: true,

        minutos:
            Number(
                minutos.toFixed(2)
            ),

        mensagem:
            `Estimativa de aproximadamente ${Math.round(
                minutos
            )} minutos para atingir o nível crítico.`
    };
}


// ======================================================
// GERAR ALARME
// ======================================================

function gerarAlarme(
    leitura
) {

    const classificacao =
        classificarNivel(
            leitura.valor
        );


    if (
        classificacao.gravidade === 0
    ) {

        return null;
    }


    const ultimo =
        database.ultimoAlarmeDoTipo(
            classificacao.nivel
        );


    const mesmoTipo =
        ultimo &&
        ultimo.tipo ===
            classificacao.nivel;


    const tempoUltimo =
        ultimo
            ? new Date(
                ultimo.timestamp
            ).getTime()
            : 0;


    const agora =
        new Date(
            leitura.timestamp
        ).getTime();


    if (
        mesmoTipo &&
        agora - tempoUltimo < 60000
    ) {

        return null;
    }


    const alarme = {

        id: database.proximoId("alarmes"),

        tipo:
            classificacao.nivel,

        status:
            classificacao.status,

        mensagem:
            leitura.mensagem,

        valor:
            leitura.valor,

        nivel:
            leitura.valor,

        gravidade:
            classificacao.gravidade,

        data:
            dataBR(
                leitura.timestamp
            ),

        hora:
            horaBR(
                leitura.timestamp
            ),

        timestamp:
            leitura.timestamp
    };


    // Grava APENAS o novo alarme (INSERT) e poda o excedente.
    database.inserirAlarme(
        alarme
    );

    database.limparExcedente(
        "alarmes",
        MAX_ALARMES
    );


    io.emit(
        "novoAlarme",
        alarme
    );


    return alarme;
}


// ======================================================
// GERAR ALARME DE OBSTRUÇÃO (LIXO)
// ======================================================
// Criado sempre que uma leitura chega com statusLixo === "OBSTRUCAO".
// Throttle: gera na TRANSIÇÃO (último alarme não é obstrução) e re-alerta
// a cada OBSTRUCAO_REALERTA_MS enquanto persistir. Assim o histórico não
// é inundado com um alerta por leitura (o ESP32 envia a cada ~10s).

function gerarAlarmeObstrucao(
    leitura,
    statusAnterior
) {

    const statusLixo =
        String(
            leitura.statusLixo || ""
        ).toUpperCase();


    if (
        statusLixo !==
        "OBSTRUCAO"
    ) {

        return null;
    }


    const ultimaObstrucao =
        database.ultimoAlarmeDoTipo("OBSTRUCAO");


    const agora =
        new Date(
            leitura.timestamp
        ).getTime();


    const transicaoParaObstrucao =
        String(statusAnterior || "").toUpperCase() !== "OBSTRUCAO";

    if (!transicaoParaObstrucao && ultimaObstrucao) {
        const tempoUltimo =
            new Date(
                ultimaObstrucao.timestamp
            ).getTime();


        // Re-alerta somente depois do intervalo configurado.
        if (
            agora -
                tempoUltimo <
                OBSTRUCAO_REALERTA_MS
        ) {

            return null;
        }
    }


    const distancia =
        leitura.distanciaLixo;


    const distanciaTexto =
        (distancia === undefined ||
            distancia === null)
            ? "distancia indisponivel"
            : `${Number(distancia).toFixed(2)} cm`;


    const alarme = {

        id: database.proximoId("alarmes"),

        tipo:
            "OBSTRUCAO",

        status:
            "OBSTRUCAO",

        mensagem:
            `Obstrucao detectada no tubo de drenagem. ` +
            `Distancia do lixo: ${distanciaTexto}. ` +
            `Nivel da agua no momento: ${leitura.valor}.`,

        valor:
            leitura.valor,

        nivel:
            leitura.valor,

        gravidade:
            3,

        data:
            dataBR(
                leitura.timestamp
            ),

        hora:
            horaBR(
                leitura.timestamp
            ),

        timestamp:
            leitura.timestamp,

        distanciaLixo:
            (distancia === undefined ||
                distancia === null)
                ? null
                : Number(distancia)
    };


    database.inserirAlarme(
        alarme
    );

    database.limparExcedente(
        "alarmes",
        MAX_ALARMES
    );


    io.emit(
        "novoAlarmeObstrucao",
        alarme
    );


    console.log(
        "[ALERTA OBSTRUCAO]",
        alarme.mensagem
    );


    return alarme;
}


// ======================================================
// PROCESSAR LEITURA DO ESP32
// ======================================================

function processarLeitura(
    mensagem,
    extras = {}
) {

    const valor =
        extrairNivel(
            mensagem
        );


    if (
        valor === null
    ) {

        return null;
    }


    const timestamp =
        new Date().toISOString();

    const leituraAnterior =
        database.ultimaLeitura();


    const classificacao =
        classificarNivel(
            valor
        );


    const leitura = {

        id: database.proximoId("leituras"),

        valor,

        nivel: valor,

        mensagem,

        status:
            classificacao.status,

        classificacao:
            classificacao.nivel,

        gravidade:
            classificacao.gravidade,

        timestamp,

        data:
            dataBR(timestamp),

        hora:
            horaBR(timestamp),

        statusLixo:
            ["NORMAL", "OBSTRUCAO", "INDETERMINADO"].includes(
                String(extras?.statusLixo || "").toUpperCase()
            )
                ? String(extras.statusLixo).toUpperCase()
                : null,

        distanciaLixo:
            Number.isFinite(Number(extras?.distanciaLixo)) &&
            Number(extras?.distanciaLixo) > 0
                ? Number(extras.distanciaLixo)
                : null,

        fonteNivel:
            ["REAL", "SIMULADO", "TESTE"].includes(
                String(extras?.fonteNivel || "").toUpperCase()
            )
                ? String(extras.fonteNivel).toUpperCase()
                : "NAO_INFORMADA"
    };


    // Grava APENAS a nova leitura (INSERT) e poda o excedente
    // direto no banco. Muito mais rapido/seguro que reescrever
    // a tabela inteira a cada leitura.
    database.inserirLeitura(
        leitura
    );

    database.limparExcedente(
        "leituras",
        MAX_LEITURAS
    );


    const alarme =
        gerarAlarme(
            leitura
        );


    // Alerta de obstrução (lixo), independente do nível da água.
    // Gerencia o próprio throttle (transição + re-alerta periódico).
    const alarmeObstrucao =
        gerarAlarmeObstrucao(
            leitura,
            leituraAnterior?.statusLixo
        );


    const velocidade =
        calcularVelocidade();


    const estimativa =
        calcularEstimativa();


    const resultado = {

        leitura,

        alarme,

        alarmeObstrucao,

        velocidade,

        estimativa
    };


    io.emit(
        "novaLeitura",
        {

            nivel:
                leitura.valor,

            status:
                leitura.status,

            data:
                leitura.timestamp,

            statusLixo:
                leitura.statusLixo,

            distanciaLixo:
                leitura.distanciaLixo,

            fonteNivel:
                leitura.fonteNivel,

            leitura,

            velocidade,

            estimativa
        }
    );


    return resultado;
}


// ======================================================
// ANÁLISE DE RISCO
// ======================================================

function obterRisco() {

    const leituras =
        lerArquivo(
            LEITURAS_FILE
        );


    if (
        leituras.length === 0
    ) {

        return {

            risco:
                "INDETERMINADO",

            nivel: null,

            velocidade: 0,

            tendencia:
                "DADOS_INSUFICIENTES",

            minutos: null,

            mensagem:
                "Ainda não existem dados suficientes."
        };
    }


    const ultima =
        leituras[
            leituras.length - 1
        ];


    const velocidade =
        calcularVelocidade();


    const estimativa =
        calcularEstimativa();


    let risco =
        "BAIXO";


    let descricao =
        "O nível atual está abaixo dos limites de atenção.";


    if (
        Number(ultima.valor) >=
        NIVEL_CRITICO
    ) {

        risco =
            "CRÍTICO";

        descricao =
            "O nível crítico foi atingido.";

    } else if (

        Number(ultima.valor) >=
            NIVEL_PERIGO ||

        velocidade.velocidade > 5

    ) {

        risco =
            "ALTO";

        descricao =
            "O sistema identificou nível elevado ou subida rápida da água.";

    } else if (

        Number(ultima.valor) >=
            NIVEL_ATENCAO ||

        velocidade.velocidade > 1

    ) {

        risco =
            "MODERADO";

        descricao =
            "O sistema identificou condição de atenção.";
    }


    return {

        risco,

        nivel:
            Number(ultima.valor),

        nivelAtual:
            Number(ultima.valor),

        status:
            ultima.status,

        velocidade:
            velocidade.velocidade,

        unidadeVelocidade:
            velocidade.unidade,

        tendencia:
            velocidade.tendencia,

        minutos:
            estimativa.minutos,

        mensagem:
            estimativa.mensagem,

        descricao,

        atualizadoEm:
            ultima.timestamp
    };
}


// ======================================================
// BOT
// ======================================================

function normalizarTexto(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function diagnosticarSensor() {
    const leituras = database.listarLeituras();
    const total = leituras.length;

    if (total === 0) {
        return {
            disponivel: false,
            status: "SEM_DADOS",
            total: 0,
            zeradas: 0,
            percentualZeradas: 0,
            minutosSemLeituraValida: null,
            mensagem: "Ainda não existem leituras para analisar."
        };
    }

    const amostra = leituras.slice(-DIAG_AMOSTRAS);
    const zeradas = amostra.filter((leitura) =>
        Number(leitura.valor) === 0
    ).length;
    const percentual = Number(
        ((zeradas / amostra.length) * 100).toFixed(1)
    );
    const ultima = leituras[total - 1];
    const idadeMs = Date.now() - new Date(ultima.timestamp).getTime();
    const validas = leituras.filter((leitura) =>
        Number(leitura.valor) > 0
    );
    const ultimaValida = validas[validas.length - 1] || null;
    const idadeValidaMs = ultimaValida
        ? Date.now() - new Date(ultimaValida.timestamp).getTime()
        : NaN;
    const fonteNivel = ultima.fonteNivel || "NAO_INFORMADA";

    let status = "OK";
    let mensagem = "O ESP32 está enviando leituras recentes.";

    if (!Number.isFinite(idadeMs) || idadeMs > 60000) {
        status = "SEM_ATUALIZACAO";
        mensagem = "Não recebo uma leitura recente do ESP32 há mais de 1 minuto.";
    } else if (fonteNivel === "SIMULADO" || fonteNivel === "TESTE") {
        status = "SIMULADO";
        mensagem = `A última leitura está marcada como ${fonteNivel}; ela não representa uma medição real.`;
    } else if (amostra.length >= 3 && percentual >= 90) {
        status = "SUSPEITO";
        mensagem = "Quase todas as leituras recentes estão em zero. Isso pode ser a condição seca ou indicar problema de ligação/calibração; confirme no sensor físico.";
    } else if (amostra.length >= 3 && percentual >= 50) {
        status = "INSTAVEL";
        mensagem = "Muitas leituras recentes estão em zero. Confira a conexão e a calibração do sensor.";
    }

    return {
        disponivel: true,
        status,
        total,
        amostraAnalisada: amostra.length,
        zeradas,
        percentualZeradas: percentual,
        ultimaLeituraValida: ultimaValida
            ? ultimaValida.timestamp
            : null,
        minutosSemLeituraValida: ultimaValida && Number.isFinite(idadeValidaMs)
            ? Number((idadeValidaMs / 60000).toFixed(1))
            : null,
        ultimaLeitura: ultima.timestamp,
        fonteNivel,
        mensagem
    };
}

function respostaBot(
    pergunta
) {
    const texto = normalizarTexto(pergunta);
    const ultima = database.ultimaLeitura();
    const velocidade = calcularVelocidade();
    const estimativa = calcularEstimativa();
    const risco = obterRisco();
    const diagnostico = diagnosticarSensor();
    const alarmes = database.listarAlarmes();
    const saudacao = /^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(texto);

    if (saudacao) {
        return {
            resposta: "Olá! Posso consultar o nível, a tendência, o risco, os alarmes, a obstrução e a comunicação do sensor com base nos dados recebidos pelo sistema.",
            dados: ultima
                ? { nivel: Number(ultima.valor), risco: risco.risco }
                : null
        };
    }

    if (/\b(ajuda|o que voce faz|como funciona)\b/.test(texto)) {
        return {
            resposta: "Respondo perguntas sobre nível da água, velocidade/tendência, risco, estimativa, alarmes, obstrução e estado do sensor. Uso os dados do backend; não invento medições e aviso quando faltam dados.",
            dados: null
        };
    }

    if (/\b(obstrucao|obstruido|lixo|tubo|drenagem)\b/.test(texto)) {
        if (!ultima) {
            return { resposta: "Ainda não recebi leituras do ESP32 para verificar a obstrução.", dados: null };
        }
        const statusLixo = ultima.statusLixo || "INDETERMINADO";
        const distancia = Number.isFinite(Number(ultima.distanciaLixo)) &&
            ultima.distanciaLixo !== null
            ? `${Number(ultima.distanciaLixo).toFixed(2)} cm`
            : "indisponível";
        return {
            resposta: statusLixo === "OBSTRUCAO"
                ? `O sensor indicou OBSTRUÇÃO. A distância registrada foi ${distancia}.`
                : statusLixo === "NORMAL"
                    ? `A última leitura indica que não há obstrução. Distância registrada: ${distancia}.`
                    : "O estado da obstrução está indeterminado; verifique o sensor ultrassônico e a última comunicação do ESP32.",
            dados: { statusLixo, distanciaLixo: ultima.distanciaLixo }
        };
    }

    if (/\b(alarme|alarmes|alerta|alertas|aviso)\b/.test(texto)) {
        const recentes = alarmes.slice(-3).reverse();
        return {
            resposta: alarmes.length
                ? `Há ${alarmes.length} alarme(s) registrado(s). Mais recente: ${recentes[0].mensagem || recentes[0].tipo} (${recentes[0].timestamp || "data indisponível"}).`
                : "Não há alarmes registrados no momento.",
            dados: { total: alarmes.length, recentes }
        };
    }

    if (/\b(sensor|esp32|conexao|conectado|comunicacao)\b/.test(texto)) {
        return {
            resposta: diagnostico.mensagem,
            dados: diagnostico
        };
    }

    if (!ultima) {
        return {
            resposta: "Ainda não recebi dados do ESP32. Posso responder sobre o sistema assim que chegar a primeira leitura.",
            dados: null
        };
    }

    if (/\b(risco|enchente|alagamento|perigo)\b/.test(texto)) {
        return {
            resposta: `O risco atual é ${risco.risco}. O nível registrado é ${ultima.valor}, a tendência está ${velocidade.tendencia.toLowerCase()} e ${risco.descricao}`,
            dados: { nivel: Number(ultima.valor), risco: risco.risco, velocidade: velocidade.velocidade }
        };
    }

    if (/\b(quanto tempo|estimativa|tempo)\b/.test(texto)) {
        return { resposta: estimativa.mensagem, dados: { nivel: Number(ultima.valor), minutos: estimativa.minutos } };
    }

    if (/\b(velocidade|subindo|descendo|tendencia)\b/.test(texto)) {
        return {
            resposta: `A água está ${velocidade.tendencia.toLowerCase()}, a ${velocidade.velocidade} ${velocidade.unidade}.`,
            dados: velocidade
        };
    }

    if (/\b(nivel|agua|status|situacao)\b/.test(texto)) {
        const origem = ultima.fonteNivel === "SIMULADO" || ultima.fonteNivel === "TESTE"
            ? "simulada/de teste"
            : ultima.fonteNivel === "REAL"
                ? "real"
                : "com origem não informada";
        return {
            resposta: `O último nível recebido foi ${ultima.valor}. O status é ${ultima.status}. A leitura é ${origem}.`,
            dados: { nivel: Number(ultima.valor), status: ultima.status, fonteNivel: ultima.fonteNivel }
        };
    }

    return {
        resposta: `Não reconheci essa pergunta como uma consulta do INVICTA. Posso ajudar com nível, tendência, risco, estimativa, alarmes, obstrução ou estado do sensor. O último nível registrado é ${ultima.valor}.`,
        dados: { nivel: Number(ultima.valor), status: ultima.status }
    };
}


// ======================================================
// CLIMA
// ======================================================

function interpretarTempoWeather(
    code
) {

    const mapa = {

        0:
            "Céu limpo",

        1:
            "Predominantemente limpo",

        2:
            "Parcialmente nublado",

        3:
            "Nublado",

        45:
            "Neblina",

        48:
            "Neblina com geada",

        51:
            "Garoa leve",

        53:
            "Garoa moderada",

        55:
            "Garoa intensa",

        61:
            "Chuva leve",

        63:
            "Chuva moderada",

        65:
            "Chuva forte",

        71:
            "Neve leve",

        73:
            "Neve moderada",

        75:
            "Neve forte",

        80:
            "Pancadas leves",

        81:
            "Pancadas moderadas",

        82:
            "Pancadas fortes",

        95:
            "Trovoada",

        96:
            "Trovoada com granizo",

        99:
            "Trovoada com granizo forte"
    };


    return (
        mapa[code] ||
        "Condição meteorológica não identificada"
    );
}


async function obterClima() {

    const url =
        "https://api.open-meteo.com/v1/forecast" +

        `?latitude=${encodeURIComponent(
            LATITUDE
        )}` +

        `&longitude=${encodeURIComponent(
            LONGITUDE
        )}` +

        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +

        "&timezone=America%2FSao_Paulo" +

        "&forecast_days=7";


    try {

        const resposta =
            await fetch(url);


        if (
            !resposta.ok
        ) {

            throw new Error(
                `Open-Meteo respondeu HTTP ${resposta.status}`
            );
        }


        const dados =
            await resposta.json();


        const dias =
            dados.daily?.time ||
            [];


        return {

            localizacao: {

                latitude:
                    LATITUDE,

                longitude:
                    LONGITUDE
            },

            previsao:
                dias.map(
                    (
                        data,
                        i
                    ) => ({

                        data,

                        temperatura:
                            dados.daily
                                .temperature_2m_max?.[i] ??
                            null,

                        temperaturaMinima:
                            dados.daily
                                .temperature_2m_min?.[i] ??
                            null,

                        chuva:
                            dados.daily
                                .precipitation_probability_max?.[i] ??
                            null,

                        descricao:
                            interpretarTempoWeather(
                                dados.daily
                                    .weather_code?.[i]
                            )
                    })
                )
        };

    } catch (erro) {

        console.error(
            "Erro ao consultar clima:",
            erro.message
        );


        return {

            erro: true,

            previsao: [],

            mensagem:
                "Não foi possível consultar a previsão meteorológica."
        };
    }
}


// ======================================================
// ROTAS
// ======================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                PUBLIC_DIR,
                "index.html"
            )
        );
    }
);


app.get(
    "/health",
    (req, res) => {

        res.json({

            status: "ok",

            service:
                "invicta-backend",

            timestamp:
                new Date().toISOString(),

            nivelAtencao:
                NIVEL_ATENCAO,

            nivelPerigo:
                NIVEL_PERIGO,

            nivelCritico:
                NIVEL_CRITICO
        });
    }
);


// ======================================================
// RECEBER ESP32
// ======================================================

app.post(
    "/esp32",
    (req, res) => {

        try {

            let mensagem =
                req.body?.mensagem;

            // Aceita também o campo "nivel" numérico (JSON),
            // mantendo compatibilidade com o formato "mensagem".
            if (
                mensagem === undefined ||
                mensagem === null ||
                mensagem === ""
            ) {

                const nivelDireto =
                    req.body?.nivel !==
                        undefined &&
                    req.body?.nivel !== null
                        ? Number(
                            String(
                                req.body.nivel
                            ).replace(
                                ",",
                                "."
                            )
                        )
                        : null;


                if (
                    nivelDireto === null ||
                    !Number.isFinite(
                        nivelDireto
                    ) ||
                    nivelDireto < 0
                ) {

                    return res
                        .status(400)
                        .json({

                            sucesso: false,

                            erro:
                                "Envie 'mensagem' (ex.: \"Nivel da agua: 1234\") ou 'nivel' numérico."
                        });
                }


                mensagem =
                    `Nivel da agua: ${nivelDireto}`;
            }


            if (!mensagem) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            "Envie 'mensagem' (ex.: \"Nivel da agua: 1234\") ou 'nivel' numérico."
                    });
            }


            console.log(
                "\n================================"
            );

            console.log(
                "Mensagem recebida do ESP32:"
            );

            console.log(
                mensagem
            );

            console.log(
                "================================\n"
            );


            const resultado =
                processarLeitura(
                    mensagem,
                    {
                        statusLixo:
                            req.body?.statusLixo,
                        distanciaLixo:
                            req.body?.distanciaLixo,
                        fonteNivel:
                            req.body?.fonteNivel
                    }
                );


            if (!resultado) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            "Não foi possível identificar o nível da água na mensagem."
                    });
            }


            return res.json({

                sucesso: true,

                mensagem:
                    "Dados recebidos com sucesso.",

                dados:
                    resultado
            });

        } catch (erro) {

            console.error(
                "Erro ao processar ESP32:",
                erro
            );


            return res
                .status(500)
                .json({

                    sucesso: false,

                    erro:
                        "Erro interno do servidor."
                });
        }
    }
);


// ======================================================
// ROTA DE TESTE
// ======================================================

app.post(
    "/api/teste",
    (req, res) => {

        const nivel =
            Number(
                req.body?.nivel
            );

        if (
            !Number.isFinite(
                nivel
            ) ||
            nivel < 0
        ) {

            return res
                .status(400)
                .json({

                    sucesso: false,

                    erro:
                        "Informe um nível numérico."
                });
        }


        const resultado =
            processarLeitura(
                `Nivel da agua: ${nivel}`,
                { fonteNivel: "TESTE" }
            );


        return res.json({

            sucesso: true,

            resultado
        });
    }
);


// ======================================================
// ÚLTIMA LEITURA
// ======================================================

app.get(
    "/api/leituras/ultima",
    (req, res) => {

        const ultima =
            database.ultimaLeitura();


        if (
            !ultima
        ) {

            return res.json(
                null
            );
        }


        return res.json({

            nivel:
                Number(
                    ultima.valor
                ),

            valor:
                Number(
                    ultima.valor
                ),

            status:
                ultima.status,

            classificacao:
                ultima.classificacao,

            data:
                ultima.timestamp,

            timestamp:
                ultima.timestamp,

            mensagem:
                ultima.mensagem,

            statusLixo:
                ultima.statusLixo,

            distanciaLixo:
                ultima.distanciaLixo,

            fonteNivel:
                ultima.fonteNivel
        });
    }
);


// ======================================================
// TODAS AS LEITURAS
// ======================================================

app.get(
    "/api/leituras",
    (req, res) => {

        return res.json(
            lerArquivo(
                LEITURAS_FILE
            )
        );
    }
);


// ======================================================
// ALARMES
// ======================================================

app.get(
    "/api/alarmes",
    (req, res) => {

        const alarmes =
            lerArquivo(
                ALARMES_FILE
            );


        return res.json(
            [...alarmes].reverse()
        );
    }
);


// ======================================================
// ALARMES DE OBSTRUÇÃO
// ======================================================
// Histórico somente dos alertas de obstrução (lixo),
// mais recentes primeiro. Alimenta a página obstrucao.html.

app.get(
    "/api/alarmes/obstrucao",
    (req, res) => {

        const alarmes =
            lerArquivo(
                ALARMES_FILE
            );


        const obstrucoes =
            alarmes.filter(
                (a) =>
                    String(
                        a.tipo || ""
                    ).toUpperCase() ===
                    "OBSTRUCAO"
            );


        return res.json(
            [...obstrucoes].reverse()
        );
    }
);


// ======================================================
// DIAGNÓSTICO DO SENSOR DE NÍVEL
// ======================================================
// Analisa as leituras recentes e devolve um veredito
// sobre a saúde do sensor de nível de água.

app.get(
    "/api/diagnostico/sensor-nivel",
    (req, res) => {
        return res.json(diagnosticarSensor());
    }
);


// ======================================================
// VELOCIDADE
// ======================================================

app.get(
    "/api/velocidade",
    (req, res) => {

        return res.json(
            calcularVelocidade()
        );
    }
);


// ======================================================
// ESTIMATIVA
// ======================================================

app.get(
    "/api/estimativa",
    (req, res) => {

        return res.json(
            calcularEstimativa()
        );
    }
);


// ======================================================
// RISCO
// ======================================================

app.get(
    "/api/risco",
    (req, res) => {

        return res.json(
            obterRisco()
        );
    }
);


// ======================================================
// CLIMA
// ======================================================

app.get(
    "/api/clima",
    async (req, res) => {

        const clima =
            await obterClima();


        if (
            clima.erro
        ) {

            return res
                .status(503)
                .json(
                    clima
                );
        }


        return res.json(
            clima
        );
    }
);


// ======================================================
// BOT
// ======================================================

app.post(
    "/api/bot",
    (req, res) => {
        const pergunta = req.body?.pergunta;
        if (typeof pergunta !== "string" || !pergunta.trim()) {
            return res.status(400).json({
                sucesso: false,
                erro: "Envie uma pergunta em texto."
            });
        }
        if (pergunta.length > 500) {
            return res.status(400).json({
                sucesso: false,
                erro: "A pergunta deve ter no máximo 500 caracteres."
            });
        }

        return res.json(
            respostaBot(pergunta)
        );
    }
);


// ======================================================
// SOCKET.IO
// ======================================================

io.on(
    "connection",
    (socket) => {

        console.log(
            "Frontend conectado:",
            socket.id
        );


        socket.on(
            "disconnect",
            () => {

                console.log(
                    "Frontend desconectado:",
                    socket.id
                );
            }
        );
    }
);


// ======================================================
// ERROS
// ======================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            "Erro não tratado:",
            err
        );


        res
            .status(500)
            .json({

                sucesso: false,

                erro:
                    "Erro interno do servidor."
            });
    }
);


// ======================================================
// INICIAR SERVIDOR
// ======================================================

if (require.main === module) {
    server.listen(PORT, "0.0.0.0", () => {
        const porta = server.address().port;
        console.log("");
        console.log("======================================");
        console.log("          INVICTA BACKEND");
        console.log("======================================");
        console.log(`Servidor rodando na porta ${porta}`);
        console.log(`Atenção: ${NIVEL_ATENCAO}`);
        console.log(`Perigo: ${NIVEL_PERIGO}`);
        console.log(`Crítico: ${NIVEL_CRITICO}`);
        console.log(`Clima: ${LATITUDE}, ${LONGITUDE}`);
        console.log("======================================");
    });
}

module.exports = {
    app,
    server,
    database,
    processarLeitura,
    respostaBot,
    diagnosticarSensor
};