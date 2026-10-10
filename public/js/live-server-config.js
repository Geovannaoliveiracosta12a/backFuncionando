// Conecta o frontend servido pelo Live Server ao backend Express.
// Quando a página é servida pelo próprio Express, usa caminhos relativos.
window.API_BASE = location.port === "5500"
    ? `${location.protocol}//${location.hostname}:5000`
    : "";

const fetchOriginal = window.fetch.bind(window);
window.fetch = (input, ...options) => {
    if (typeof input === "string" && input.startsWith("/api/")) {
        input = `${window.API_BASE}${input}`;
    }
    return fetchOriginal(input, ...options);
};

// Carrega o cliente Socket.IO do backend (porta 5000 no Live Server).
const socketClient = window.API_BASE
    ? `${window.API_BASE}/socket.io/socket.io.js`
    : "/socket.io/socket.io.js";
document.write(`<script src="${socketClient}"><\/script>`);
