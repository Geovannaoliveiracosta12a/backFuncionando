// =========================================================
// INVICTA
// alarmes.js
// Histórico de alarmes
// =========================================================

const listaAlarmes =
    document.getElementById("listaAlarmes");

const totalAlarmes =
    document.getElementById("totalAlarmes");

const totalAtencao =
    document.getElementById("totalAtencao");

const totalPerigo =
    document.getElementById("totalPerigo");

const botaoAtualizar =
    document.getElementById("atualizarAlarmes");


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
// IDENTIFICAR CLASSE DO ALARME
// =========================================================

function classeAlarme(tipo) {

    if (!tipo) {
        return "";
    }

    const texto =
        tipo.toString().toLowerCase();

    if (
        texto.includes("perigo") ||
        texto.includes("critico") ||
        texto.includes("crítico")
    ) {

        return "perigo";
    }

    return "atencao";
}


// =========================================================
// CARREGAR ALARMES
// =========================================================

async function carregarAlarmes() {

    try {

        const resposta =
            await fetch("/api/alarmes");

        if (!resposta.ok) {
            throw new Error(
                "Erro ao carregar alarmes."
            );
        }

        const alarmes =
            await resposta.json();

        mostrarAlarmes(alarmes);

    } catch (erro) {

        console.error(erro);

        listaAlarmes.innerHTML = `
            <div class="empty-state">
                Não foi possível carregar os alarmes.
            </div>
        `;
    }
}


// =========================================================
// MOSTRAR ALARMES
// =========================================================

function mostrarAlarmes(alarmes) {

    if (!Array.isArray(alarmes)) {

        listaAlarmes.innerHTML = `
            <div class="empty-state">
                Nenhum alarme registrado.
            </div>
        `;

        return;
    }


    // -----------------------------------------------------
    // CONTADORES
    // -----------------------------------------------------

    let quantidadeAtencao = 0;
    let quantidadePerigo = 0;


    alarmes.forEach((alarme) => {

        const tipo =
            alarme.tipo ||
            alarme.status ||
            alarme.mensagem ||
            "";

        const classe =
            classeAlarme(tipo);

        if (classe === "perigo") {
            quantidadePerigo++;
        } else {
            quantidadeAtencao++;
        }
    });


    totalAlarmes.textContent =
        alarmes.length;

    totalAtencao.textContent =
        quantidadeAtencao;

    totalPerigo.textContent =
        quantidadePerigo;


    // -----------------------------------------------------
    // NENHUM ALARME
    // -----------------------------------------------------

    if (alarmes.length === 0) {

        listaAlarmes.innerHTML = `
            <div class="empty-state">
                Nenhum alarme registrado.
            </div>
        `;

        return;
    }


    // -----------------------------------------------------
    // LISTA
    // -----------------------------------------------------

    listaAlarmes.innerHTML =
        alarmes.map((alarme) => {

            const tipo =
                alarme.tipo ||
                alarme.status ||
                "ALARME";

            const mensagem =
                alarme.mensagem ||
                "Alerta registrado pelo sistema.";

            const nivel =
                alarme.nivel !== undefined
                    ? alarme.nivel
                    : "--";

            const data =
                alarme.data ||
                alarme.timestamp ||
                alarme.criadoEm;

            const classe =
                classeAlarme(tipo);

            return `
                <div class="alarm-item">

                    <div class="alarm-info">

                        <h3>
                            ${mensagem}
                        </h3>

                        <p>
                            Nível: ${nivel}
                            |
                            ${formatarData(data)}
                        </p>

                    </div>

                    <span class="alarm-level ${classe}">
                        ${tipo}
                    </span>

                </div>
            `;

        }).join("");
}


// =========================================================
// BOTÃO ATUALIZAR
// =========================================================

if (botaoAtualizar) {

    botaoAtualizar.addEventListener(
        "click",
        carregarAlarmes
    );
}


// =========================================================
// SOCKET.IO
// =========================================================

const socket =
    io();

socket.on(
    "novoAlarme",
    () => {

        console.log(
            "Novo alarme recebido."
        );

        carregarAlarmes();
    }
);


// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    carregarAlarmes
);