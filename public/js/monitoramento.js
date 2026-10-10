// =========================================================
// INVICTA
// monitoramento.js
// Monitoramento do nível da água
// =========================================================

const nivelAtual =
    document.getElementById("nivelAtual");

const statusAtual =
    document.getElementById("statusAtual");

const fonteLeitura =
    document.getElementById("fonteLeitura");

const mensagemAtual =
    document.getElementById("mensagemAtual");

const dataLeitura =
    document.getElementById("dataLeitura");

const velocidadeAtual =
    document.getElementById("velocidadeAtual");

const tempoEstimado =
    document.getElementById("tempoEstimado");

const ultimasLeituras =
    document.getElementById("ultimasLeituras");

const botaoAtualizar =
    document.getElementById(
        "atualizarMonitoramento"
    );


// =========================================================
// GRÁFICO
// =========================================================

let graficoNivel = null;
let leiturasAtuais = [];


// =========================================================
// FORMATAR DATA
// =========================================================

function formatarData(data) {

    if (!data) {
        return "--";
    }

    const dataObj =
        new Date(data);

    if (isNaN(dataObj.getTime())) {
        return "--";
    }

    return dataObj.toLocaleString(
        "pt-BR",
        {
            timeZone:
                "America/Sao_Paulo"
        }
    );
}


// =========================================================
// CARREGAR LEITURAS
// =========================================================

async function carregarLeituras() {

    try {

        const resposta =
            await fetch(
                "/api/leituras"
            );

        if (!resposta.ok) {
            throw new Error(
                "Erro ao buscar leituras."
            );
        }

        const leituras =
            await resposta.json();

        if (!Array.isArray(leituras)) {
            return;
        }

        const atuais = new Map(
            leiturasAtuais.map((leitura) => [chaveLeitura(leitura), leitura])
        );
        leituras.forEach((leitura) =>
            atuais.set(chaveLeitura(leitura), leitura)
        );
        leiturasAtuais = [...atuais.values()]
            .sort((a, b) =>
                new Date(a.timestamp || a.data || 0) -
                new Date(b.timestamp || b.data || 0)
            )
            .slice(-100);
        atualizarVisualizacoes();

    } catch (erro) {

        console.error(erro);

        ultimasLeituras.innerHTML = `
            <div class="empty-state">
                Não foi possível carregar
                as leituras.
            </div>
        `;
    }
}

function chaveLeitura(leitura) {
    return leitura.id !== undefined && leitura.id !== null
        ? String(leitura.id)
        : `${leitura.timestamp || leitura.data || ""}:${leitura.mensagem || ""}`;
}

function atualizarVisualizacoes() {
    atualizarInformacoes(leiturasAtuais);
    atualizarLista(leiturasAtuais);
    atualizarGrafico(leiturasAtuais);
}

function receberLeitura(dados) {
    const entrada = dados?.leitura || dados;
    if (!entrada || typeof entrada !== "object") {
        return;
    }

    const leitura = {
        ...entrada,
        nivel: entrada.nivel ?? entrada.valor ?? dados.nivel,
        valor: entrada.valor ?? entrada.nivel ?? dados.nivel,
        status: entrada.status ?? dados.status,
        timestamp: entrada.timestamp ?? entrada.data ?? dados.data,
        mensagem: entrada.mensagem ?? dados.mensagem,
        statusLixo: entrada.statusLixo ?? dados.statusLixo,
        distanciaLixo: entrada.distanciaLixo ?? dados.distanciaLixo,
        fonteNivel: entrada.fonteNivel ?? dados.fonteNivel
    };

    const chave = chaveLeitura(leitura);
    const atuais = new Map(
        leiturasAtuais.map((item) => [chaveLeitura(item), item])
    );
    atuais.set(chave, leitura);
    leiturasAtuais = [...atuais.values()]
        .sort((a, b) =>
            new Date(a.timestamp || a.data || 0) -
            new Date(b.timestamp || b.data || 0)
        )
        .slice(-100);
    atualizarVisualizacoes();
}


// =========================================================
// ATUALIZAR INFORMAÇÕES PRINCIPAIS
// =========================================================

function atualizarInformacoes(
    leituras
) {

    if (leituras.length === 0) {

        nivelAtual.textContent =
            "--";

        statusAtual.textContent =
            "AGUARDANDO";

        dataLeitura.textContent =
            "Nenhuma leitura recebida.";

        if (fonteLeitura) fonteLeitura.textContent = "--";
        if (mensagemAtual) mensagemAtual.textContent = "--";
        return;
    }


    const ultima =
        leituras[
            leituras.length - 1
        ];


    nivelAtual.textContent =
        ultima.nivel ?? ultima.valor ?? "--";


    statusAtual.textContent =
        ultima.status ||
        "AGUARDANDO";


    dataLeitura.textContent =
        "Última leitura: " +
        formatarData(
            ultima.timestamp || ultima.data
        );

    if (fonteLeitura) {
        fonteLeitura.textContent = ultima.fonteNivel || "Não informada";
    }

    if (mensagemAtual) {
        mensagemAtual.textContent =
            ultima.mensagem || "Sem mensagem textual; leitura numérica recebida.";
    }
}


// =========================================================
// VELOCIDADE
// =========================================================

async function carregarVelocidade() {

    try {

        const resposta =
            await fetch(
                "/api/velocidade"
            );

        const dados =
            await resposta.json();

        if (
            dados.velocidade !==
            undefined
        ) {

            velocidadeAtual.textContent =
                Number(
                    dados.velocidade
                ).toFixed(2);
        }

    } catch (erro) {

        console.error(erro);

        velocidadeAtual.textContent =
            "--";
    }
}


// =========================================================
// ESTIMATIVA
// =========================================================

async function carregarEstimativa() {

    try {

        const resposta =
            await fetch(
                "/api/estimativa"
            );

        const dados =
            await resposta.json();

        if (dados.mensagem) {

            tempoEstimado.textContent =
                dados.mensagem;

        } else if (
            dados.minutos !==
            undefined
        ) {

            tempoEstimado.textContent =
                `${Number(
                    dados.minutos
                ).toFixed(0)} min`;

        } else {

            tempoEstimado.textContent =
                "--";
        }

    } catch (erro) {

        console.error(erro);

        tempoEstimado.textContent =
            "--";
    }
}


// =========================================================
// LISTA DE LEITURAS
// =========================================================

function atualizarLista(
    leituras
) {

    if (leituras.length === 0) {

        ultimasLeituras.innerHTML = `
            <div class="empty-state">
                Aguardando leituras...
            </div>
        `;

        return;
    }


    const ultimas =
        [...leituras]
            .reverse()
            .slice(0, 15);


    const itens = ultimas.map((leitura) => {
        const item = document.createElement("div");
        item.className = "reading-item";

        const info = document.createElement("div");
        const status = document.createElement("strong");
        status.textContent = leitura.status || "LEITURA";

        const data = document.createElement("div");
        data.className = "reading-date";
        data.textContent = formatarData(
            leitura.timestamp || leitura.data
        );

        const valor = document.createElement("span");
        valor.className = "reading-value";
        valor.textContent = leitura.nivel ?? leitura.valor ?? "--";

        const mensagem = document.createElement("div");
        mensagem.className = "reading-date telemetry-message";
        mensagem.textContent =
            leitura.mensagem || "Mensagem sem texto; valor numérico recebido.";

        const origem = document.createElement("div");
        origem.className = "reading-date";
        const distancia = Number(leitura.distanciaLixo);
        const distanciaTexto =
            leitura.distanciaLixo !== null &&
            leitura.distanciaLixo !== undefined &&
            Number.isFinite(distancia) &&
            distancia > 0
                ? `${distancia.toFixed(2)} cm`
                : "indisponível";
        origem.textContent =
            `Origem: ${leitura.fonteNivel || "não informada"} · obstrução: ${leitura.statusLixo || "indeterminada"} · distância: ${distanciaTexto}`;

        info.append(status, data, mensagem, origem);
        item.append(info, valor);
        return item;
    });

    ultimasLeituras.replaceChildren(...itens);
}


// =========================================================
// GRÁFICO
// =========================================================

function atualizarGrafico(
    leituras
) {

    const canvas =
        document.getElementById(
            "graficoNivel"
        );

    if (!canvas) {
        return;
    }


    const dados =
        leituras.slice(-30);


    const labels =
        dados.map(
            (leitura) => {

                const data =
                    new Date(leitura.timestamp || leitura.data);

                return data.toLocaleTimeString(
                    "pt-BR",
                    {
                        timeZone:
                            "America/Sao_Paulo",

                        hour:
                            "2-digit",

                        minute:
                            "2-digit"
                    }
                );
            }
        );


    const valores =
        dados.map(
            (leitura) =>
                Number(
                    leitura.nivel
                )
        );


    if (graficoNivel) {
        graficoNivel.destroy();
    }


    graficoNivel =
        new Chart(
            canvas,
            {
                type: "line",

                data: {
                    labels: labels,

                    datasets: [
                        {
                            label:
                                "Nível da água",

                            data: valores,

                            borderWidth: 2,

                            tension: 0.3,

                            fill: false,

                            pointRadius: 3
                        }
                    ]
                },

                options: {

                    responsive: true,

                    maintainAspectRatio:
                        false,

                    plugins: {

                        legend: {
                            display: true
                        }
                    },

                    scales: {

                        y: {
                            beginAtZero: true
                        }
                    }
                }
            }
        );
}


// =========================================================
// ATUALIZAR TUDO
// =========================================================

async function atualizarTudo() {

    await carregarLeituras();

    await carregarVelocidade();

    await carregarEstimativa();
}


// =========================================================
// BOTÃO
// =========================================================

if (botaoAtualizar) {

    botaoAtualizar.addEventListener(
        "click",
        atualizarTudo
    );
}


// =========================================================
// SOCKET.IO
// =========================================================

const socket =
    io(window.API_BASE || undefined);

socket.on("connect", atualizarTudo);

socket.on(
    "novaLeitura",
    (dados) => {

        console.log(
            "Nova leitura recebida."
        );

        receberLeitura(dados);
        carregarVelocidade();
        carregarEstimativa();
    }
);


// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        atualizarTudo();

        setInterval(
            atualizarTudo,
            10000
        );
    }
);
