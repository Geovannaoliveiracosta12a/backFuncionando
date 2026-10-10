/*
 * =========================================================
 * INVICTA - ESP32 | Nível da água + obstrução (lixo)
 * =========================================================
 *
 * Firmware unificado com MODO HÍBRIDO para o sensor de água.
 * Lê:
 *   - Nível da água  : sensor ANALÓGICO (0..4095, ADC 12 bits)
 *   - Obstrução/lixo : sensor ultrassônico HC-SR04 (cm)
 * e envia tudo para o backend INVICTA via HTTP POST.
 *
 * BACKEND
 *   Endpoint  : POST /esp32
 *   Corpo     : { "nivel": 1234, "mensagem": "...",
 *                 "statusLixo": "NORMAL", "distanciaLixo": 120.74, ... }
 *   Os campos vão na RAIZ do JSON (é o que o backend aceita).
 *   Credenciais e IP ficam em config.h.
 *
 * HARDWARE
 *   Sensor de água (analógico) -> GPIO 34  (ADC1!)
 *   HC-SR04 TRIG -> GPIO 25
 *   HC-SR04 ECHO -> GPIO 26
 *   LEDs/buzzer  -> GPIO 4, 13, 12, 2
 *
 * !! ATENÇÃO - USE O GPIO 34 (ADC1) PARA O SENSOR DE ÁGUA !!
 * O ADC2 (GPIO 0,2,4,12,13,14,15,25,26,27) PARA de funcionar
 * com o Wi-Fi ligado -> analogRead() = 0. O GPIO 34 é input-only
 * do ADC1 e funciona com Wi-Fi ligado.
 *
 * MODO DO SENSOR DE ÁGUA (definido em config.h -> MODO_SENSOR_AGUA)
 *   "AUTO"    -> lê o sensor real; leituras zeradas geram aviso,
 *                mas nunca são substituídas por valores simulados.
 *   "REAL"    -> somente o sensor real (nunca simula).
 *   "SIMULADO"-> sempre envia valores simulados (teste sem hardware).
 * =========================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>

// Credenciais e endereço do backend ficam em config.h.
#include "config.h"

// =========================================================
// CONFIGURAÇÕES DO SENSOR
// =========================================================

// Parâmetros do ADC (sensor de água analógico)
// GPIO 34 = ADC1_CH6, input-only, funciona com Wi-Fi ligado.
static const int PINO_SENSOR_AGUA = 34;

// Parâmetros do HC-SR04 (sensor de lixo/obstrução)
static const int PINO_TRIG = 25;
static const int PINO_ECHO = 26;

// Se a distância lida (até o lixo) for <= este valor, considera OBSTRUÇÃO.
static const float DISTANCIA_CRITICA = 10.0;

// Limiares de classificação do nível (iguais ao .env do backend)
static const int NIVEL_ATENCAO = 1000;
static const int NIVEL_PERIGO  = 2000;

// LEDs + buzzer (opcional, feedback local)
static const int LED_VERDE    = 4;
static const int LED_AMARELO  = 13;
static const int LED_VERMELHO = 12;
static const int PINO_BUZZER  = 2;

// Intervalo entre leituras (ms)
static const unsigned long INTERVALO_ENVIO_MS = 2000;

static unsigned long ultimoEnvio = 0;

// Última obstrução lida (mantida entre ciclos para exibir/reenviar)
static float  distanciaLixo = -1;
static String statusLixo    = "INDETERMINADO";
static bool   alertaLixo    = false;

// --- Estado do modo do sensor de água (híbrido) ---
// Só fica true quando SIMULADO foi explicitamente configurado.
static bool usandoSimulado   = false;
// Leituras zeradas consecutivas: aviso de diagnóstico, sem fallback falso.
static int  ciclosZero       = 0;

// URL completa do backend (config.h traz só host:porta)
static String backendUrl() {
    return String(BACKEND_HOST) + "/esp32";
}


// =========================================================
// SETUP
// =========================================================

void setup() {
    Serial.begin(115200);
    delay(500);

    pinMode(PINO_SENSOR_AGUA, INPUT);
    pinMode(PINO_TRIG, OUTPUT);
    pinMode(PINO_ECHO, INPUT);
    digitalWrite(PINO_TRIG, LOW);

    pinMode(LED_VERDE, OUTPUT);
    pinMode(LED_AMARELO, OUTPUT);
    pinMode(LED_VERMELHO, OUTPUT);
    pinMode(PINO_BUZZER, OUTPUT);
    digitalWrite(PINO_BUZZER, LOW);

    // ADC de 12 bits -> leitura de 0 a 4095
    analogReadResolution(12);
    analogSetPinAttenuation(PINO_SENSOR_AGUA, ADC_11db);

    // Modo do sensor de água
    String modo = String(MODO_SENSOR_AGUA);
    modo.toUpperCase();

    if (modo == "SIMULADO") {
        usandoSimulado = true;
    } else if (modo == "REAL" || modo == "AUTO") {
        usandoSimulado = false;
    } else {
        usandoSimulado = false;
        Serial.println("ERRO: MODO_SENSOR_AGUA invalido; usando sensor REAL.");
    }

    conectarWiFi();
}


// =========================================================
// LOOP
// =========================================================

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        conectarWiFi();
    }

    unsigned long agora = millis();
    if (agora - ultimoEnvio >= INTERVALO_ENVIO_MS) {
        ultimoEnvio = agora;

        // 1) Lê obstrução (lixo) e atualiza status/alerta locais
        lerSensorLixo();

        // 2) Lê nível da água (real ou simulado, conforme o modo)
        int nivel = lerNivelAgua();

        Serial.println();
        Serial.println("==============================");
        Serial.print("Nivel da agua: ");
        Serial.println(nivel);
        Serial.print("Fonte do nivel: ");
        Serial.println(usandoSimulado ? "SIMULADO" : "SENSOR REAL");
        Serial.print("Distancia do lixo: ");
        if (distanciaLixo > 0) {
            Serial.print(distanciaLixo, 2);
            Serial.println(" cm");
        } else {
            Serial.println("sem leitura valida");
        }
        Serial.print("Status do lixo: ");
        Serial.println(statusLixo);
        Serial.println("==============================");

        // Atualiza o feedback local sem aguardar a rede.
        atualizarAlertas(nivel);

        // Envia para o backend depois do feedback local.
        enviarParaBackend(nivel);
    }
}


// =========================================================
// CONEXÃO WiFi
// =========================================================

void conectarWiFi() {
    if (String(WIFI_SSID) == "SEU_SSID_AQUI") {
        Serial.println("ERRO: configure WIFI_SSID e WIFI_PASSWORD em config.h.");
        return;
    }

    Serial.print("Conectando ao WiFi");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED && tentativas < 30) {
        delay(500);
        Serial.print(".");
        tentativas++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.print("WiFi conectado. IP do ESP32: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println();
        Serial.println("Falha ao conectar no WiFi. Nova tentativa em breve...");
    }
}


// =========================================================
// LEITURA DO NÍVEL DA ÁGUA (com modo híbrido)
// =========================================================

int lerNivelAgua() {
    // Valores simulados só são usados quando SIMULADO foi configurado.
    if (usandoSimulado) {
        return valorSimulado();
    }

    // Lê o sensor real: média de várias amostras para reduzir ruído.
    long soma = 0;
    for (int i = 0; i < AMOSTRAS_ADC; i++) {
        soma += analogRead(PINO_SENSOR_AGUA);
        delay(5);
    }

    float media = soma / (float)AMOSTRAS_ADC;

    // Calibração simples: valor = (media - OFFSET) * ESCALA
    float valorCalibrado = (media - AGUA_OFFSET) * AGUA_ESCALA;
    if (valorCalibrado < 0) {
        valorCalibrado = 0;
    }

    int nivel = (int)(valorCalibrado + 0.5f);

    // ----- Diagnóstico do modo AUTO (sem gerar leituras fictícias) -----
    String modo = String(MODO_SENSOR_AGUA);
    modo.toUpperCase();

    if (modo == "AUTO") {
        if (nivel <= 0) {
            if (ciclosZero < CICLOS_ZERO_FALHA) {
                ciclosZero++;
            }
            if (ciclosZero == CICLOS_ZERO_FALHA) {
                Serial.println();
                Serial.println("AVISO: nivel zero repetido no GPIO 34.");
                Serial.println("Confirme o sensor e a calibracao; nenhum dado simulado sera enviado.");
            }
        } else {
            if (ciclosZero >= CICLOS_ZERO_FALHA) {
                Serial.println("Leitura do sensor de agua voltou a ser diferente de zero.");
            }
            ciclosZero = 0;
        }
    }

    return nivel;
}


// ---------------------------------------------------------
// Valor simulado (para testes sem hardware).
// Varia suavemente entre ~500 e ~3500.
// ---------------------------------------------------------

int valorSimulado() {
    static float fase = 0.0;
    fase += 0.15;
    if (fase > 6.28318) fase -= 6.28318;

    float base = 2000.0;
    float amplitude = 1500.0;
    int valor = (int)(base + amplitude * sin(fase));
    return valor;
}


// =========================================================
// LEITURA DO LIXO (HC-SR04)
// =========================================================

float lerDistanciaCm() {
    digitalWrite(PINO_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PINO_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PINO_TRIG, LOW);

    // Timeout 30ms (~5 m)
    unsigned long duracao = pulseIn(PINO_ECHO, HIGH, 30000);
    if (duracao == 0) {
        return -1; // sem eco
    }

    return (duracao * 0.0343f) / 2.0f;
}


void lerSensorLixo() {
    distanciaLixo = lerDistanciaCm();

    if (distanciaLixo <= 0) {
        statusLixo = "INDETERMINADO";
        alertaLixo = false;
    } else if (distanciaLixo <= DISTANCIA_CRITICA) {
        statusLixo = "OBSTRUCAO";
        alertaLixo = true;
    } else {
        statusLixo = "NORMAL";
        alertaLixo = false;
    }
}


// =========================================================
// FEEDBACK LOCAL (LEDs + BUZZER)
// =========================================================

void atualizarAlertas(int nivel) {
    digitalWrite(LED_VERDE, LOW);
    digitalWrite(LED_AMARELO, LOW);
    digitalWrite(LED_VERMELHO, LOW);

    if (nivel < NIVEL_ATENCAO) {
        digitalWrite(LED_VERDE, HIGH);
    } else if (nivel < NIVEL_PERIGO) {
        digitalWrite(LED_AMARELO, HIGH);
    } else {
        digitalWrite(LED_VERMELHO, HIGH);
    }

    // Buzzer apita quando há obstrução detectada.
    digitalWrite(PINO_BUZZER, alertaLixo ? HIGH : LOW);
}


// =========================================================
// ENVIO PARA O BACKEND
// =========================================================

void enviarParaBackend(int nivel) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi desconectado. Envio cancelado.");
        return;
    }

    String url = backendUrl();

    String statusAgua;
    if (nivel < NIVEL_ATENCAO)      statusAgua = "SEGURO";
    else if (nivel < NIVEL_PERIGO)  statusAgua = "ATENCAO";
    else                            statusAgua = "PERIGO";

    String mensagem = statusAgua + " - Nivel da agua: " + String(nivel);

    // "nivel" e "mensagem" na RAIZ (formato aceito pelo backend),
    // + campos de obstrução e a origem do valor de nível.
    String corpo = "{";
    corpo += "\"nivel\":" + String(nivel) + ",";
    corpo += "\"mensagem\":\"" + mensagem + "\",";
    corpo += "\"statusAgua\":\"" + statusAgua + "\",";
    corpo += "\"fonteNivel\":\"" + String(usandoSimulado ? "SIMULADO" : "REAL") + "\",";
    corpo += "\"statusLixo\":\"" + statusLixo + "\",";
    corpo += "\"distanciaLixo\":";
    if (distanciaLixo > 0) {
        corpo += String(distanciaLixo, 2);
    } else {
        corpo += "null";
    }
    corpo += ",";
    corpo += "\"alerta\":" + String(alertaLixo ? "true" : "false");
    corpo += "}";

    Serial.print("POST ");
    Serial.println(url);
    Serial.print("Corpo: ");
    Serial.println(corpo);

    // Uma tentativa rápida evita bloquear o próximo ciclo de telemetria.
    // O próximo POST periódico funciona como nova tentativa e mantém
    // as leituras atuais sincronizadas sem acumular uma fila antiga.
    const int MAX_TENTATIVAS = 1;

    for (int tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        HTTPClient http;
        http.setTimeout(3000);
        http.setConnectTimeout(2000);

        http.begin(url);
        http.addHeader("Content-Type", "application/json");

        int codigo = http.POST((uint8_t*)corpo.c_str(), corpo.length());

        if (codigo >= 200 && codigo < 300) {
            Serial.print("Resposta HTTP: ");
            Serial.println(codigo);
            Serial.println(http.getString());
            http.end();
            return; // sucesso
        }

        if (codigo > 0) {
            Serial.print("Resposta HTTP de erro: ");
            Serial.println(codigo);
            Serial.println(http.getString());
            http.end();

            if (codigo < 500 || codigo > 599) {
                return;
            }
        } else {
            Serial.print("Tentativa ");
            Serial.print(tentativa);
            Serial.print("/");
            Serial.print(MAX_TENTATIVAS);
            Serial.print(" falhou: ");
            Serial.println(http.errorToString(codigo));

            if (codigo == -1) {
                Serial.println("  -> connection refused = backend NAO esta rodando");
                Serial.print("     ou IP/porta errados. BACKEND_HOST = ");
                Serial.println(BACKEND_HOST);
            } else if (codigo == -11) {
                Serial.println("  -> timeout = sem resposta. Veja firewall/roteador.");
            }

            http.end();
        }

        // Em caso de falha, a próxima leitura será enviada no ciclo seguinte.
    }

    Serial.println("Nao foi possivel enviar. Nova tentativa no proximo ciclo.");
}
