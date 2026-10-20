// =========================================================
// INVICTA
// bot.js
// Assistente baseado nos dados do monitoramento
// =========================================================

const chat = document.getElementById("chat");
const pergunta = document.getElementById("pergunta");
const enviarPergunta = document.getElementById("enviarPergunta");
const botNivel = document.getElementById("botNivel");
const botVelocidade = document.getElementById("botVelocidade");
const botRisco = document.getElementById("botRisco");
const botEstimativa = document.getElementById("botEstimativa");
const botSensor = document.getElementById("botSensor");
const botSensorMensagem = document.getElementById("botSensorMensagem");

function adicionarMensagem(texto, tipo) {
    if (!chat) {
        return;
    }

    const mensagem = document.createElement("div");
    mensagem.className = `message ${tipo === "usuario" ? "user-message" : "bot-message"}`;

    const autor = document.createElement("strong");
    autor.textContent = tipo === "usuario" ? "VOCÊ" : "INVICTA BOT";

    const conteudo = document.createElement("p");
    conteudo.textContent = texto;

    mensagem.append(autor, conteudo);
    chat.append(mensagem);
    chat.scrollTop = chat.scrollHeight;
}

async function carregarAnalise() {
    try {
        const [respostaRisco, respostaSensor] = await Promise.all([
            fetch("/api/risco"),
            fetch("/api/diagnostico/sensor-nivel")
        ]);

        if (!respostaRisco.ok || !respostaSensor.ok) {
            throw new Error("Erro ao buscar a análise do sistema.");
        }

        const [risco, sensor] = await Promise.all([
            respostaRisco.json(),
            respostaSensor.json()
        ]);

        if (botNivel) {
            botNivel.textContent = risco.nivel ?? "--";
        }
        if (botVelocidade) {
            botVelocidade.textContent =
                risco.velocidade !== undefined
                    ? Number(risco.velocidade).toFixed(2)
                    : "--";
        }
        if (botRisco) {
            botRisco.textContent =
                risco.risco || risco.status || "AGUARDANDO";
        }
        if (botEstimativa) {
            botEstimativa.textContent =
                risco.mensagem ||
                (risco.minutos !== undefined && risco.minutos !== null
                    ? `${Number(risco.minutos).toFixed(0)} min`
                    : "--");
        }
        if (botSensor) {
            botSensor.textContent = sensor.status || "INDISPONÍVEL";
        }
        if (botSensorMensagem) {
            botSensorMensagem.textContent =
                sensor.mensagem || "Diagnóstico indisponível.";
        }
    } catch (erro) {
        console.error(erro);
        if (botNivel) botNivel.textContent = "--";
        if (botVelocidade) botVelocidade.textContent = "--";
        if (botRisco) botRisco.textContent = "INDISPONÍVEL";
        if (botEstimativa) botEstimativa.textContent = "--";
        if (botSensor) botSensor.textContent = "INDISPONÍVEL";
        if (botSensorMensagem) {
            botSensorMensagem.textContent =
                "Não foi possível consultar o backend.";
        }
    }
}

async function enviarMensagem() {
    const texto = pergunta?.value.trim();
    if (!texto || !enviarPergunta || enviarPergunta.disabled) {
        return;
    }

    adicionarMensagem(texto, "usuario");
    pergunta.value = "";
    enviarPergunta.disabled = true;

    try {
        const resposta = await fetch("/api/bot", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pergunta: texto })
        });

        const dados = await resposta.json();
        if (!resposta.ok) {
            throw new Error(dados.erro || "Erro ao consultar o assistente.");
        }

        adicionarMensagem(
            dados.resposta || "Não foi possível responder com os dados disponíveis.",
            "bot"
        );
        await carregarAnalise();
    } catch (erro) {
        console.error(erro);
        adicionarMensagem(
            erro.message || "Não consegui consultar o sistema. Verifique a conexão com o backend.",
            "bot"
        );
    } finally {
        enviarPergunta.disabled = false;
        pergunta?.focus();
    }
}

if (enviarPergunta) {
    enviarPergunta.addEventListener("click", enviarMensagem);
}

if (pergunta) {
    pergunta.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") {
            evento.preventDefault();
            enviarMensagem();
        }
    });
}

const socket = io(window.API_BASE || undefined);
socket.on("novaLeitura", carregarAnalise);

document.addEventListener("DOMContentLoaded", () => {
    carregarAnalise();
    setInterval(carregarAnalise, 10000);
});
