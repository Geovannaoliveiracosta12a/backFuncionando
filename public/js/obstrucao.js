// =========================================================
// INVICTA
// obstrucao.js
// Monitoramento dos alertas de obstrução (lixo)
// =========================================================

const estadoAtual = document.getElementById("estadoAtual");
const statusAtual = document.getElementById("statusAtual");
const distanciaAtual = document.getElementById("distanciaAtual");
const dataLeitura = document.getElementById("dataLeitura");
const totalObstrucoes = document.getElementById("totalObstrucoes");
const total24h = document.getElementById("total24h");
const listaObstrucoes = document.getElementById("listaObstrucoes");
const botaoAtualizar = document.getElementById("atualizarObstrucao");

function formatarData(data) {
    if (!data) {
        return "--";
    }

    const dataObj = new Date(data);
    if (Number.isNaN(dataObj.getTime())) {
        return "--";
    }

    return dataObj.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo"
    });
}

function aplicarClasseStatus(elemento, statusLixo) {
    if (!elemento) {
        return;
    }

    elemento.classList.remove("atencao", "perigo", "normal");
    const texto = String(statusLixo || "").toUpperCase();

    if (texto === "OBSTRUCAO") {
        elemento.classList.add("perigo");
    } else if (texto === "NORMAL") {
        elemento.classList.add("normal");
    } else {
        elemento.classList.add("atencao");
    }
}

function atualizarEstadoAtual(dados) {
    if (!dados) {
        return;
    }

    const statusLixo = String(dados.statusLixo || "INDETERMINADO").toUpperCase();
    const distancia = Number(dados.distanciaLixo);

    if (estadoAtual) {
        estadoAtual.textContent = statusLixo;
    }

    if (statusAtual) {
        statusAtual.textContent = statusLixo === "OBSTRUCAO"
            ? "OBSTRUÇÃO DETECTADA"
            : statusLixo === "NORMAL"
                ? "SEM OBSTRUÇÃO"
                : "SEM LEITURA VÁLIDA";
        aplicarClasseStatus(statusAtual, statusLixo);
    }

    if (distanciaAtual) {
        distanciaAtual.textContent =
            dados.distanciaLixo !== null &&
            dados.distanciaLixo !== undefined &&
            Number.isFinite(distancia) &&
            distancia > 0
                ? distancia.toFixed(2)
                : "--";
    }

    if (dataLeitura) {
        dataLeitura.textContent = dados.timestamp
            ? `Última leitura: ${formatarData(dados.timestamp)}`
            : "Nenhuma leitura recebida.";
    }
}

function mostrarEstadoVazio() {
    if (estadoAtual) {
        estadoAtual.textContent = "INDETERMINADO";
    }
    if (statusAtual) {
        statusAtual.textContent = "AGUARDANDO LEITURA";
        aplicarClasseStatus(statusAtual, "INDETERMINADO");
    }
    if (distanciaAtual) {
        distanciaAtual.textContent = "--";
    }
    if (dataLeitura) {
        dataLeitura.textContent = "Nenhuma leitura recebida.";
    }
}

async function carregarEstadoAtual() {
    try {
        const resposta = await fetch("/api/leituras/ultima");
        if (!resposta.ok) {
            throw new Error("Erro ao buscar leitura atual.");
        }

        const dados = await resposta.json();
        if (dados) {
            atualizarEstadoAtual(dados);
        } else {
            mostrarEstadoVazio();
        }
    } catch (erro) {
        console.error(erro);
        mostrarEstadoVazio();
    }
}

function criarItemObstrucao(alarme) {
    const item = document.createElement("div");
    item.className = "alarm-item";

    const info = document.createElement("div");
    info.className = "alarm-info";

    const titulo = document.createElement("h3");
    titulo.textContent =
        alarme.mensagem || "Obstrução detectada no tubo de drenagem.";

    const detalhe = document.createElement("p");
    const distancia = Number(alarme.distanciaLixo);
    const distanciaTexto =
        alarme.distanciaLixo !== null &&
        alarme.distanciaLixo !== undefined &&
        Number.isFinite(distancia) &&
        distancia > 0
            ? `${distancia.toFixed(2)} cm`
            : "--";
    detalhe.textContent =
        `Distância: ${distanciaTexto} | ${formatarData(alarme.timestamp || alarme.data)}`;

    const nivel = document.createElement("span");
    nivel.className = "alarm-level perigo";
    nivel.textContent = "OBSTRUÇÃO";

    info.append(titulo, detalhe);
    item.append(info, nivel);
    return item;
}

function mostrarObstrucoes(obstrucoes) {
    if (!Array.isArray(obstrucoes)) {
        throw new Error("A resposta de obstruções não é uma lista.");
    }

    totalObstrucoes.textContent = String(obstrucoes.length);
    const agora = Date.now();
    const umDia = 24 * 60 * 60 * 1000;
    const quantidade24h = obstrucoes.filter((alarme) => {
        const timestamp = new Date(alarme.timestamp).getTime();
        const idade = agora - timestamp;
        return Number.isFinite(timestamp) && idade >= 0 && idade <= umDia;
    }).length;
    total24h.textContent = String(quantidade24h);

    if (obstrucoes.length === 0) {
        listaObstrucoes.replaceChildren();
        const vazio = document.createElement("div");
        vazio.className = "empty-state";
        vazio.textContent = "Nenhuma obstrução registrada.";
        listaObstrucoes.append(vazio);
        return;
    }

    listaObstrucoes.replaceChildren(
        ...obstrucoes.map(criarItemObstrucao)
    );
}

async function carregarObstrucoes() {
    try {
        const resposta = await fetch("/api/alarmes/obstrucao");
        if (!resposta.ok) {
            throw new Error("Erro ao carregar obstruções.");
        }
        mostrarObstrucoes(await resposta.json());
    } catch (erro) {
        console.error(erro);
        listaObstrucoes.replaceChildren();
        const falha = document.createElement("div");
        falha.className = "empty-state";
        falha.textContent = "Não foi possível carregar as obstruções.";
        listaObstrucoes.append(falha);
    }
}

async function atualizarTudo() {
    await Promise.all([
        carregarEstadoAtual(),
        carregarObstrucoes()
    ]);
}

if (botaoAtualizar) {
    botaoAtualizar.addEventListener("click", atualizarTudo);
}

const socket = io(window.API_BASE || undefined);
socket.on("connect", atualizarTudo);
socket.on("novaLeitura", (dados) => {
    if (dados) {
        atualizarEstadoAtual({
            statusLixo: dados.statusLixo ?? dados.leitura?.statusLixo,
            distanciaLixo: dados.distanciaLixo ?? dados.leitura?.distanciaLixo,
            timestamp: dados.data ?? dados.leitura?.timestamp
        });
    }
});

socket.on("novoAlarmeObstrucao", atualizarTudo);
socket.on("novoAlarme", atualizarTudo);

document.addEventListener("DOMContentLoaded", () => {
    atualizarTudo();
    setInterval(atualizarTudo, 10000);
});
