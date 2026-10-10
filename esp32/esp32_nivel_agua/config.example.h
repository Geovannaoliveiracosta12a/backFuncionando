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

// --- Sensor de nível de água (analógico, GPIO 34 = ADC1) ---
// MODO_SENSOR_AGUA controla a estratégia de leitura:
//   "AUTO"    -> lê o sensor real; leituras zeradas repetidas geram aviso,
//                sem substituir dados reais por valores simulados. (recomendado)
//   "REAL"    -> somente o sensor real (nunca simula).
//   "SIMULADO"-> sempre envia valores simulados (teste sem hardware).
#define MODO_SENSOR_AGUA "AUTO"

// Quantas amostras do ADC são lidas e médias em cada ciclo (reduz ruído).
static const int AMOSTRAS_ADC = 15;

// Quantos ciclos seguidos com leitura 0 antes de emitir um aviso
// (somente quando MODO_SENSOR_AGUA == "AUTO"). Zero não prova defeito:
// pode representar a calibração/condição seca do sensor.
static const int CICLOS_ZERO_FALHA = 5;

// Calibração simples do sensor analógico (mapeia ADC -> valor enviado).
// valor = (mediaADC - OFFSET) * ESCALA. Ajuste conforme seu sensor.
static const float AGUA_OFFSET = 0.0;
static const float AGUA_ESCALA = 1.0;
