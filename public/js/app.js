// =========================================================
// INVICTA
// app.js
// Dashboard principal
// =========================================================

const socket = io(window.API_BASE || undefined);


// =========================================================
// ELEMENTOS
// =========================================================

const nivelElemento = document.getElementById("nivel");
const velocidadeElemento = document.getElementById("velocidade");
const statusElemento = document.getElementById("status");
const estimativaElemento = document.getElementById("estimativa");
const ultimaElemento = document.getElementById("ultima");
const conexaoElemento = document.getElementById("conexao");
const obstrucaoElemento = document.getElementById("obstrucao");
const distanciaLixoElemento = document.getElementById("distanciaLixo");
const mensagensEsp32Elemento = document.getElementById("mensagensEsp32");
let backendDisponivel = false;
let ultimaLeituraSensor = null;
let historicoLeituras = [];


// =========================================================
// FORMATAR DATA
// =========================================================

function formatarData(data) {

    if (!data) {
        return "--";
    }

    function chaveLeitura(leitura) {
        return leitura.id !== undefined && leitura.id !== null
            ? String(leitura.id)
            : `${leitura.timestamp || leitura.data || ""}:${leitura.mensagem || ""}`;
    }

    function normalizarLeitura(dados) {
        const leitura = dados?.leitura || dados;
        if (!leitura || typeof leitura !== "object") {
            return null;
        }

        return {
            ...leitura,
            nivel: leitura.nivel ?? leitura.valor ?? dados.nivel,
            valor: leitura.valor ?? leitura.nivel ?? dados.nivel,
            status: leitura.status ?? dados.status,
            timestamp: leitura.timestamp ?? leitura.data ?? dados.data,
            mensagem: leitura.mensagem ?? dados.mensagem,
            statusLixo: leitura.statusLixo ?? dados.statusLixo,
            distanciaLixo: leitura.distanciaLixo ?? dados.distanciaLixo,
            fonteNivel: leitura.fonteNivel ?? dados.fonteNivel
        };
    }

    function criarLinhaMensagem(leitura) {
        const item = document.createElement("div");
        item.className = "reading-item telemetry-item";

        const detalhes = document.createElement("div");
        detalhes.className = "telemetry-details";

        const cabecalho = document.createElement("strong");
        cabecalho.textContent =
            `${leitura.status || "LEITURA"} · nível ${leitura.nivel ?? leitura.valor ?? "--"}`;

        const mensagem = document.createElement("div");
        mensagem.className = "reading-date telemetry-message";
        mensagem.textContent =
            leitura.mensagem || "Mensagem sem texto; valor numérico recebido.";

        const sensores = document.createElement("div");
        sensores.className = "reading-date";
        const distancia = Number(leitura.distanciaLixo);
        const distanciaTexto =
            leitura.distanciaLixo !== null &&
            leitura.distanciaLixo !== undefined &&
            Number.isFinite(distancia) &&
            distancia > 0
                ? `${distancia.toFixed(2)} cm`
                : "indisponível";
        sensores.textContent =
            `Obstrução: ${leitura.statusLixo || "indeterminada"} · distância: ${distanciaTexto} · origem: ${leitura.fonteNivel || "não informada"} · ${formatarData(leitura.timestamp || leitura.data)}`;

        const valor = document.createElement("span");
        valor.className = "reading-value";
        valor.textContent = leitura.fonteNivel || "ESP32";

        detalhes.append(cabecalho, mensagem, sensores);
        item.append(detalhes, valor);
        return item;
    }

    function atualizarMensagens() {
        if (!mensagensEsp32Elemento) {
            return;
        }

        const recentes = historicoLeituras.slice(-5).reverse();
        if (recentes.length === 0) {
            const vazio = document.createElement("div");
            vazio.className = "empty-state";
            vazio.textContent = "Aguardando mensagens do ESP32...";
            mensagensEsp32Elemento.replaceChildren(vazio);
            return;
        }

        mensagensEsp32Elemento.replaceChildren(
            ...recentes.map(criarLinhaMensagem)
        );
    }

    function adicionarLeitura(dados) {
        const leitura = normalizarLeitura(dados);
        if (!leitura) {
            return null;
        }

        const chave = chaveLeitura(leitura);
        historicoLeituras = historicoLeituras.filter(
            (item) => chaveLeitura(item) !== chave
        );
        historicoLeituras.push(leitura);
        historicoLeituras.sort((a, b) =>
            new Date(a.timestamp || a.data || 0) -
            new Date(b.timestamp || b.data || 0)
        );
        historicoLeituras = historicoLeituras.slice(-100);
        atualizarMensagens();
        return leitura;
    }

    async function carregarHistoricoMensagens() {
        if (!mensagensEsp32Elemento) {
            return;
        }

        try {
            const resposta = await fetch("/api/leituras");
            if (!resposta.ok) {
                throw new Error("Erro ao carregar mensagens do ESP32.");
            }

            const leituras = await resposta.json();
            if (!Array.isArray(leituras)) {
                throw new Error("A resposta de leituras não é uma lista.");
            }

            leituras.forEach((leitura) => adicionarLeitura(leitura));
        } catch (erro) {
            console.error(erro);
            const falha = document.createElement("div");
            falha.className = "empty-state";
            falha.textContent = "Não foi possível carregar as mensagens recebidas.";
            mensagensEsp32Elemento.replaceChildren(falha);
        }
    }

    const dataObj = new Date(data);

    if (isNaN(dataObj.getTime())) {
        return "--";
    }

    return dataObj.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo"
    });
}


// =========================================================
// ATUALIZAR CONEXÃO
// =========================================================

function atualizarConexao(online, leitura = undefined) {

    if (!conexaoElemento) {
        return;
    }

    if (leitura !== undefined) {
        ultimaLeituraSensor = leitura;
    }

    backendDisponivel = online;
    conexaoElemento.classList.remove("offline", "online", "warning");

    if (!backendDisponivel) {
        conexaoElemento.textContent =
            "● Backend desconectado";
        conexaoElemento.classList.add("offline");
        return;
    }

    if (!ultimaLeituraSensor) {
        conexaoElemento.textContent =
            "● Backend conectado · aguardando ESP32";
        conexaoElemento.classList.add("offline");
        return;
    }

    const timestamp = new Date(
        ultimaLeituraSensor.timestamp || ultimaLeituraSensor.data
    ).getTime();
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > 60000) {
        conexaoElemento.textContent =
            "● Backend conectado · ESP32 sem leitura recente";
        conexaoElemento.classList.add("offline");
        return;
    }

    const fonte = String(ultimaLeituraSensor.fonteNivel || "").toUpperCase();
    if (fonte === "SIMULADO" || fonte === "TESTE") {
        conexaoElemento.textContent =
            `● Backend conectado · leitura ${fonte}`;
        conexaoElemento.classList.add("warning");
        return;
    }

    if (fonte !== "REAL") {
        conexaoElemento.textContent =
            "● Backend conectado · origem da leitura não informada";
        conexaoElemento.classList.add("warning");
        return;
    }

    conexaoElemento.textContent =
        "● Backend e ESP32 conectados";
    conexaoElemento.classList.add("online");
}


// =========================================================
// ATUALIZAR DASHBOARD
// =========================================================

function atualizarDashboard(dados) {

    if (!dados) {
        if (nivelElemento) nivelElemento.textContent = "--";
        if (statusElemento) statusElemento.textContent = "AGUARDANDO";
        if (ultimaElemento) {
            ultimaElemento.textContent = "Aguardando dados do ESP32...";
        }
        if (obstrucaoElemento) obstrucaoElemento.textContent = "--";
        if (distanciaLixoElemento) distanciaLixoElemento.textContent = "--";
        return;
    }

    const leitura = adicionarLeitura(dados);
    if (leitura) {
        ultimaLeituraSensor = leitura;
    }

    // -----------------------------------------------------
    // NÍVEL
    // -----------------------------------------------------

    if (
        nivelElemento &&
        dados.nivel !== undefined &&
        dados.nivel !== null
    ) {

        nivelElemento.textContent =
            dados.nivel;
    }


    // -----------------------------------------------------
    // STATUS
    // -----------------------------------------------------

    if (statusElemento && dados.status) {

        statusElemento.textContent =
            dados.status;
    }


    // -----------------------------------------------------
    // DATA
    // -----------------------------------------------------

    if (ultimaElemento && (dados.timestamp || dados.data)) {

        ultimaElemento.textContent =
            "Última leitura: " +
            formatarData(dados.timestamp || dados.data);
    }


    // -----------------------------------------------------
    // OBSTRUÇÃO / LIXO
    // -----------------------------------------------------

    // Os dados podem vir no topo (Socket.IO) ou dentro de
    // "leitura" (carga inicial via API). Aceitamos os dois.
    const statusLixo =
        dados.statusLixo ??
        dados.leitura?.statusLixo ??
        null;

    const distanciaLixo =
        dados.distanciaLixo ??
        dados.leitura?.distanciaLixo ??
        null;


    if (obstrucaoElemento) {

        if (statusLixo) {

            obstrucaoElemento.textContent =
                statusLixo;

        } else {

            obstrucaoElemento.textContent =
                "--";
        }
    }


    if (distanciaLixoElemento) {

        if (
            distanciaLixo !== null &&
            distanciaLixo !== undefined &&
            Number.isFinite(Number(distanciaLixo)) &&
            Number(distanciaLixo) > 0
        ) {

            distanciaLixoElemento.textContent =
                Number(distanciaLixo).toFixed(2);

        } else {

            distanciaLixoElemento.textContent =
                "--";
        }
    }
}


// =========================================================
// BUSCAR ÚLTIMA LEITURA
// =========================================================

async function carregarUltimaLeitura() {

    try {

        const resposta =
            await fetch("/api/leituras/ultima");

        if (!resposta.ok) {
            throw new Error(
                "Erro ao buscar última leitura."
            );
        }

        const dados =
            await resposta.json();

        atualizarDashboard(dados);

        atualizarConexao(true, dados);

    } catch (erro) {

        console.error(erro);

        atualizarConexao(false);
    }
}


// =========================================================
// BUSCAR VELOCIDADE
// =========================================================

async function carregarVelocidade() {

    try {

        const resposta =
            await fetch("/api/velocidade");

        if (!resposta.ok) {
            throw new Error(
                "Erro ao buscar velocidade."
            );
        }

        const dados =
            await resposta.json();

        if (
            dados.velocidade !== undefined &&
            dados.velocidade !== null
        ) {

            velocidadeElemento.textContent =
                Number(dados.velocidade).toFixed(2);
        }

    } catch (erro) {

        console.error(erro);

        velocidadeElemento.textContent =
            "--";
    }
}


// =========================================================
// BUSCAR ESTIMATIVA
// =========================================================

async function carregarEstimativa() {

    try {

        const resposta =
            await fetch("/api/estimativa");

        if (!resposta.ok) {
            throw new Error(
                "Erro ao buscar estimativa."
            );
        }

        const dados =
            await resposta.json();

        if (dados.mensagem) {

            estimativaElemento.textContent =
                dados.mensagem;

        } else if (
            dados.minutos !== undefined &&
            dados.minutos !== null
        ) {

            estimativaElemento.textContent =
                `${Number(dados.minutos).toFixed(0)} min`;

        } else {

            estimativaElemento.textContent =
                "--";
        }

    } catch (erro) {

        console.error(erro);

        estimativaElemento.textContent =
            "--";
    }
}


// =========================================================
// ATUALIZAR TUDO
// =========================================================

async function atualizarTudo() {

    await carregarUltimaLeitura();

    await carregarVelocidade();

    await carregarEstimativa();
}


// =========================================================
// SOCKET.IO
// =========================================================

socket.on("connect", () => {

    console.log(
        "Socket conectado ao backend."
    );

    atualizarConexao(true);
    atualizarTudo();
});


socket.on("disconnect", () => {

    console.log(
        "Socket desconectado."
    );

    atualizarConexao(false);
});


socket.on("novaLeitura", (dados) => {

    console.log(
        "Nova leitura recebida:",
        dados
    );

    atualizarDashboard(dados);
    atualizarConexao(true, dados);

    carregarVelocidade();

    carregarEstimativa();
});


// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        atualizarTudo();
        carregarHistoricoMensagens();

        setInterval(
            atualizarTudo,
            10000
        );

        setInterval(
            carregarHistoricoMensagens,
            30000
        );
    }
);
