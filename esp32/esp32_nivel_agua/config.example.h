// =========================================================
// INVICTA - ESP32 | Exemplo de configuração local
// =========================================================
// 1) Copie este arquivo para "config.h" (na mesma pasta).
// 2) Preencha com os dados da sua rede e do seu backend.
// 3) O arquivo config.h NÃO será versionado (está no .gitignore).
// =========================================================
#pragma once

// --- Rede WiFi ---
static const char* WIFI_SSID     = "SEU_SSID_AQUI";
static const char* WIFI_PASSWORD = "SUA_SENHA_AQUI";

// --- Backend INVICTA ---
// Use o IP da máquina que roda o Node.js e a porta configurada.
// Exemplo: "http://192.168.0.10:5000"
static const char* BACKEND_HOST  = "http://192.168.0.10:5000";
