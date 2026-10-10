// =========================================================
// INVICTA
// app.js
// Dashboard principal
// =========================================================

const socket = io();


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


// =========================================================
// FORMATAR DATA
// =========================================================

function formatarData(data) {

    if (!data) {
        return "--";
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

function atualizarConexao(online) {

    if (!conexaoElemento) {
        return;
    }

    if (online) {

        conexaoElemento.textContent =
            "● Sistema conectado";

        conexaoElemento.classList.remove("offline");
        conexaoElemento.classList.add("online");

    } else {

        conexaoElemento.textContent =
            "● Sistema desconectado";

        conexaoElemento.classList.remove("online");
        conexaoElemento.classList.add("offline");
    }
}


// =========================================================
// ATUALIZAR DASHBOARD
// =========================================================

function atualizarDashboard(dados) {

    if (!dados) {
        return;
    }


    // -----------------------------------------------------
    // NÍVEL
    // -----------------------------------------------------

    if (
        dados.nivel !== undefined &&
        dados.nivel !== null
    ) {

        nivelElemento.textContent =
            dados.nivel;
    }


    // -----------------------------------------------------
    // STATUS
    // -----------------------------------------------------

    if (dados.status) {

        statusElemento.textContent =
            dados.status;
    }


    // -----------------------------------------------------
    // DATA
    // -----------------------------------------------------

    if (dados.data) {

        ultimaElemento.textContent =
            "Última leitura: " +
            formatarData(dados.data);
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
            distanciaLixo !== undefined
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

        atualizarConexao(true);

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

    carregarVelocidade();

    carregarEstimativa();

    atualizarConexao(true);
});


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