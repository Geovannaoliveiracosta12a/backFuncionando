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

    try {

        if (
            caminho ===
            LEITURAS_FILE
        ) {

            return database.listarLeituras();
        }

        if (
            caminho ===
            ALARMES_FILE
        ) {

            return database.listarAlarmes();
        }

        return [];

    } catch (erro) {

        console.error(
            "Erro ao ler banco:",
            erro.message
        );

        return [];
    }
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
        database.ultimoAlarme();


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

        id: Date.now(),

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


    const classificacao =
        classificarNivel(
            valor
        );


    const leitura = {

        id: Date.now(),

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
            extras?.statusLixo ?? null,

        distanciaLixo:
            (extras?.distanciaLixo === undefined ||
             extras?.distanciaLixo === null)
                ? null
                : Number(extras.distanciaLixo)
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


    const velocidade =
        calcularVelocidade();


    const estimativa =
        calcularEstimativa();


    const resultado = {

        leitura,

        alarme,

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

function respostaBot(
    pergunta
) {

    const texto =
        String(
            pergunta || ""
        )
        .trim()
        .toLowerCase();


    const leituras =
        lerArquivo(
            LEITURAS_FILE
        );


    if (
        leituras.length === 0
    ) {

        return {

            resposta:
                "Ainda não recebi dados suficientes do ESP32 para realizar uma análise.",

            dados: null
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


    const risco =
        obterRisco();


    if (

        texto.includes("risco") ||

        texto.includes("enchente") ||

        texto.includes("alagamento")

    ) {

        return {

            resposta:
                `O risco atual é ${risco.risco}. ` +
                `O nível registrado é ${ultima.valor} ` +
                `e a água está ${velocidade.tendencia.toLowerCase()}. ` +
                `${risco.descricao}`,

            dados: {

                nivel:
                    ultima.valor,

                risco:
                    risco.risco,

                velocidade:
                    velocidade.velocidade
            }
        };
    }


    if (

        texto.includes("quanto tempo") ||

        texto.includes("estimativa") ||

        texto.includes("tempo")

    ) {

        return {

            resposta:
                estimativa.mensagem,

            dados: {

                nivel:
                    ultima.valor,

                minutos:
                    estimativa.minutos
            }
        };
    }


    if (

        texto.includes("nível") ||

        texto.includes("nivel")

    ) {

        return {

            resposta:
                `O último nível registrado pelo ESP32 foi ${ultima.valor}. ` +
                `O status atual é ${ultima.status}.`,

            dados: {

                nivel:
                    ultima.valor,

                status:
                    ultima.status
            }
        };
    }


    if (
        texto.includes("subindo")
    ) {

        return {

            resposta:
                `A água está ${velocidade.tendencia.toLowerCase()}, ` +
                `com velocidade de ${velocidade.velocidade} unidades por minuto.`,

            dados:
                velocidade
        };
    }


    return {

        resposta:
            `Último nível: ${ultima.valor}. ` +
            `Status: ${ultima.status}. ` +
            `Tendência: ${velocidade.tendencia.toLowerCase()}. ` +
            `Risco atual: ${risco.risco}.`,

        dados: {

            nivel:
                ultima.valor,

            status:
                ultima.status,

            risco:
                risco.risco,

            velocidade:
                velocidade.velocidade
        }
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
                    )
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
                            req.body?.distanciaLixo
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
            )
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
                `Nivel da agua: ${nivel}`
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
                ultima.distanciaLixo
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

        return res.json(
            respostaBot(
                req.body?.pergunta
            )
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

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "======================================"
        );

        console.log(
            "          INVICTA BACKEND"
        );

        console.log(
            "======================================"
        );

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

        console.log(
            `Atenção: ${NIVEL_ATENCAO}`
        );

        console.log(
            `Perigo: ${NIVEL_PERIGO}`
        );

        console.log(
            `Crítico: ${NIVEL_CRITICO}`
        );

        console.log(
            `Clima: ${LATITUDE}, ${LONGITUDE}`
        );

        console.log(
            "======================================"
        );
    }
);