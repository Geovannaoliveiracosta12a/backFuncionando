document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("authForm");
    const email = document.getElementById("email");
    const senha = document.getElementById("senha");
    const erro = document.getElementById("authError");
    const submit = document.getElementById("authSubmit");
    const switchButton = document.getElementById("authSwitch");
    const title = document.getElementById("authTitle");
    const description = document.getElementById("authDescription");
    const switchText = document.getElementById("authSwitchText");
    let modo = "login";

    const mudarModo = () => {
        modo = modo === "login" ? "cadastro" : "login";
        const cadastro = modo === "cadastro";
        title.textContent = cadastro ? "Crie sua conta" : "Entre na sua conta";
        description.textContent = cadastro
            ? "Cadastre um e-mail e uma senha para acessar o INVICTA BOT."
            : "Faça login ou crie seu cadastro para conversar com o assistente.";
        submit.textContent = cadastro ? "Criar conta" : "Entrar";
        senha.autocomplete = cadastro ? "new-password" : "current-password";
        switchText.textContent = cadastro ? "Já tem uma conta?" : "Ainda não tem uma conta?";
        switchButton.textContent = cadastro ? "Fazer login" : "Criar cadastro";
        erro.textContent = "";
    };

    switchButton.addEventListener("click", mudarModo);
    form.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        erro.textContent = "";
        if (!email.value.trim() || senha.value.length < 8) {
            erro.textContent = "Informe um e-mail válido e uma senha com pelo menos 8 caracteres.";
            return;
        }
        submit.disabled = true;
        try {
            const resposta = await fetch(`/api/auth/${modo}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.value.trim(), senha: senha.value })
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro || "Não foi possível autenticar.");
            const destino = new URLSearchParams(window.location.search).get("redirect");
            window.location.assign(destino?.startsWith("/") && !destino.startsWith("//") ? destino : "/bot.html");
        } catch (e) {
            erro.textContent = e instanceof TypeError
                ? "Não foi possível conectar ao backend. Inicie o servidor INVICTA e tente novamente."
                : (e.message || "Falha de conexão. Tente novamente.");
        } finally {
            submit.disabled = false;
        }
    });
});
