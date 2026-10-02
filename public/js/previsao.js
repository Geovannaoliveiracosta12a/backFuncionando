// =========================================================
// INVICTA
// previsao.js
// Análise de risco e previsão meteorológica
// =========================================================

const riscoAtual =
    document.getElementById(
        "riscoAtual"
    );

const descricaoRisco =
    document.getElementById(
        "descricaoRisco"
    );

const nivelPrevisao =
    document.getElementById(
        "nivelPrevisao"
    );

const velocidadePrevisao =
    document.getElementById(
        "velocidadePrevisao"
    );

const tempoPrevisao =
    document.getElementById(
        "tempoPrevisao"
    );

const weatherContainer =
    document.getElementById(
        "weatherContainer"
    );

const atualizarClima =
    document.getElementById(
        "atualizarClima"
    );


// =========================================================
// RISCO
// =========================================================

async function carregarRisco() {

    try {

        const resposta =
            await fetch(
                "/api/risco"
            );

        if (!resposta.ok) {
            throw new Error(
                "Erro ao carregar risco."
            );
        }

        const dados =
            await resposta.json();


        nivelPrevisao.textContent =
            dados.nivel ?? "--";


        if (
            dados.velocidade !==
            undefined
        ) {

            velocidadePrevisao.textContent =
                Number(
                    dados.velocidade
                ).toFixed(2);
        }


        if (dados.mensagem) {

            tempoPrevisao.textContent =
                dados.mensagem;

        } else if (
            dados.minutos !==
            undefined
        ) {

            tempoPrevisao.textContent =
                `${Number(
                    dados.minutos
                ).toFixed(0)} min`;

        } else {

            tempoPrevisao.textContent =
                "--";
        }


        const risco =
            dados.risco ||
            dados.status ||
            "AGUARDANDO";


        riscoAtual.textContent =
            risco;


        descricaoRisco.textContent =
            dados.descricao ||
            "Análise realizada com base nos dados disponíveis.";

    } catch (erro) {

        console.error(erro);

        riscoAtual.textContent =
            "INDISPONÍVEL";

        descricaoRisco.textContent =
            "Não foi possível realizar a análise no momento.";
    }
}


// =========================================================
// CLIMA
// =========================================================

async function carregarClima() {

    try {

        weatherContainer.innerHTML = `
            <div class="empty-state">
                Carregando previsão meteorológica...
            </div>
        `;


        const resposta =
            await fetch(
                "/api/clima"
            );


        if (!resposta.ok) {
            throw new Error(
                "Erro ao carregar clima."
            );
        }


        const dados =
            await resposta.json();


        if (
            !dados ||
            !Array.isArray(
                dados.previsao
            )
        ) {

            weatherContainer.innerHTML = `
                <div class="empty-state">
                    Dados meteorológicos
                    indisponíveis.
                </div>
            `;

            return;
        }


        weatherContainer.innerHTML =
            dados.previsao
                .map(
                    (dia) => {

                        return `
                            <div class="weather-card">

                                <div class="weather-date">
                                    ${dia.data || "--"}
                                </div>

                                <div class="temperature">
                                    ${dia.temperatura ?? "--"}°C
                                </div>

                                <div class="weather-description">
                                    ${dia.descricao || "Sem descrição"}
                                </div>

                                <div class="weather-description">
                                    Chuva:
                                    ${dia.chuva ?? "--"}%
                                </div>

                            </div>
                        `;
                    }
                )
                .join("");

    } catch (erro) {

        console.error(erro);

        weatherContainer.innerHTML = `
            <div class="empty-state">
                Não foi possível carregar
                a previsão meteorológica.
            </div>
        `;
    }
}


// =========================================================
// ATUALIZAR
// =========================================================

async function atualizarTudo() {

    await carregarRisco();

    await carregarClima();
}


// =========================================================
// BOTÃO
// =========================================================

if (atualizarClima) {

    atualizarClima.addEventListener(
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

        carregarRisco();
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
            60000
        );
    }
);