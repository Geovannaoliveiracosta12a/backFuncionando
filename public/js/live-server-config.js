// Conecta o frontend servido pelo Live Server ao backend Express.
// Quando a página é servida pelo próprio Express, usa caminhos relativos.
const host = location.hostname;
const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1" ||
    /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
window.API_BASE = isLocalHost && location.port !== "5000"
    ? `${location.protocol}//${host.includes(":") ? `[${host}]` : host}:5000`
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
