// =========================================================
// INVICTA
// monitoramento.js
// Monitoramento do nível da água
// =========================================================

const nivelAtual =
    document.getElementById("nivelAtual");

const statusAtual =
    document.getElementById("statusAtual");

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

        atualizarInformacoes(
            leituras
        );

        atualizarLista(
            leituras
        );

        atualizarGrafico(
            leituras
        );

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

        return;
    }


    const ultima =
        leituras[
            leituras.length - 1
        ];


    nivelAtual.textContent =
        ultima.nivel ?? "--";


    statusAtual.textContent =
        ultima.status ||
        "AGUARDANDO";


    dataLeitura.textContent =
        "Última leitura: " +
        formatarData(
            ultima.data
        );
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


    ultimasLeituras.innerHTML =
        ultimas.map(
            (leitura) => {

                return `
                    <div class="reading-item">

                        <div>

                            <strong>
                                ${leitura.status || "LEITURA"}
                            </strong>

                            <div class="reading-date">
                                ${formatarData(
                                    leitura.data
                                )}
                            </div>

                        </div>

                        <span class="reading-value">
                            ${leitura.nivel ?? "--"}
                        </span>

                    </div>
                `;

            }
        ).join("");
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
                    new Date(
                        leitura.data
                    );

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
    io();

socket.on(
    "novaLeitura",
    () => {

        console.log(
            "Nova leitura recebida."
        );

        atualizarTudo();
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