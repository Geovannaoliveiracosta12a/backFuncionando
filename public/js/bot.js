// =========================================================
// INVICTA
// bot.js
// Assistente inteligente
// =========================================================

const chat =
    document.getElementById(
        "chat"
    );

const pergunta =
    document.getElementById(
        "pergunta"
    );

const enviarPergunta =
    document.getElementById(
        "enviarPergunta"
    );

const botNivel =
    document.getElementById(
        "botNivel"
    );

const botVelocidade =
    document.getElementById(
        "botVelocidade"
    );

const botRisco =
    document.getElementById(
        "botRisco"
    );

const botEstimativa =
    document.getElementById(
        "botEstimativa"
    );


// =========================================================
// ADICIONAR MENSAGEM
// =========================================================

function adicionarMensagem(
    texto,
    tipo
) {

    const mensagem =
        document.createElement(
            "div"
        );

    mensagem.classList.add(
        "message"
    );

    if (tipo === "usuario") {

        mensagem.classList.add(
            "user-message"
        );

        mensagem.innerHTML = `
            <strong>
                VOCÊ
            </strong>

            <p>
                ${texto}
            </p>
        `;

    } else {

        mensagem.classList.add(
            "bot-message"
        );

        mensagem.innerHTML = `
            <strong>
                INVICTA BOT
            </strong>

            <p>
                ${texto}
            </p>
        `;
    }


    chat.appendChild(
        mensagem
    );


    chat.scrollTop =
        chat.scrollHeight;
}


// =========================================================
// CARREGAR ANÁLISE
// =========================================================

async function carregarAnalise() {

    try {

        const resposta =
            await fetch(
                "/api/risco"
            );


        if (!resposta.ok) {
            throw new Error(
                "Erro ao buscar análise."
            );
        }


        const dados =
            await resposta.json();


        botNivel.textContent =
            dados.nivel ?? "--";


        botVelocidade.textContent =
            dados.velocidade !==
            undefined
                ? Number(
                    dados.velocidade
                ).toFixed(2)
                : "--";


        botRisco.textContent =
            dados.risco ||
            dados.status ||
            "AGUARDANDO";


        botEstimativa.textContent =
            dados.mensagem ||
            (
                dados.minutos !==
                undefined
                    ? `${Number(
                        dados.minutos
                    ).toFixed(0)} min`
                    : "--"
            );

    } catch (erro) {

        console.error(erro);

        botNivel.textContent =
            "--";

        botVelocidade.textContent =
            "--";

        botRisco.textContent =
            "INDISPONÍVEL";

        botEstimativa.textContent =
            "--";
    }
}


// =========================================================
// ENVIAR PERGUNTA AO BOT
// =========================================================

async function enviarMensagem() {

    const texto =
        pergunta.value.trim();


    if (!texto) {
        return;
    }


    adicionarMensagem(
        texto,
        "usuario"
    );


    pergunta.value = "";


    try {

        const resposta =
            await fetch(
                "/api/bot",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        pergunta: texto
                    })
                }
            );


        if (!resposta.ok) {
            throw new Error(
                "Erro ao consultar o BOT."
            );
        }


        const dados =
            await resposta.json();


        adicionarMensagem(
            dados.resposta ||
            dados.mensagem ||
            "Não foi possível gerar uma resposta.",
            "bot"
        );


        carregarAnalise();

    } catch (erro) {

        console.error(erro);

        adicionarMensagem(
            "Não consegui consultar o sistema agora. Verifique a conexão com o backend.",
            "bot"
        );
    }
}


// =========================================================
// BOTÃO ENVIAR
// =========================================================

if (enviarPergunta) {

    enviarPergunta.addEventListener(
        "click",
        enviarMensagem
    );
}


// =========================================================
// ENTER
// =========================================================

if (pergunta) {

    pergunta.addEventListener(
        "keydown",
        (evento) => {

            if (
                evento.key ===
                "Enter"
            ) {

                enviarMensagem();
            }
        }
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

        carregarAnalise();
    }
);


// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        carregarAnalise();

        setInterval(
            carregarAnalise,
            10000
        );
    }
);