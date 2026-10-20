document.addEventListener("DOMContentLoaded", async () => {
    const menuButton = document.getElementById("menuIcon");
    const navLinks = document.getElementById("navLinks");

    const fecharMenu = () => {
        menuButton?.classList.remove("active");
        navLinks?.classList.remove("active");
        menuButton?.setAttribute("aria-expanded", "false");
    };

    menuButton?.addEventListener("click", () => {
        const aberto = menuButton.classList.toggle("active");
        navLinks?.classList.toggle("active", aberto);
        menuButton.setAttribute("aria-expanded", String(aberto));
    });
    navLinks?.querySelectorAll("a").forEach((link) => link.addEventListener("click", fecharMenu));
    document.addEventListener("click", (evento) => {
        if (navLinks?.classList.contains("active") && !evento.target.closest(".nav")) fecharMenu();
    });

    const navBotLink = document.getElementById("navBotLink");
    const navLoginLink = document.getElementById("navLoginLink");
    const navLogoutLink = document.getElementById("navLogoutLink");
    let autenticado = false;
    try {
        const resposta = await fetch("/api/auth/me", { credentials: "include" });
        autenticado = resposta.ok;
    } catch (_) {
        // Sem conexão com o backend, deixa os links de login visíveis.
    }

    if (navBotLink) navBotLink.style.display = autenticado ? "inline-block" : "none";
    if (navLoginLink) navLoginLink.style.display = autenticado ? "none" : "inline-block";
    if (navLogoutLink) navLogoutLink.style.display = autenticado ? "inline-block" : "none";

    if (!autenticado && window.location.pathname.endsWith("/bot.html")) {
        window.location.replace("/login.html?redirect=/bot.html");
    }

    navLogoutLink?.addEventListener("click", async (evento) => {
        evento.preventDefault();
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        window.location.assign("/");
    });
});
