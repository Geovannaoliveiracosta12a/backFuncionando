/*
 * =========================================================
 * INVICTA - ESP32 | Nível da água + obstrução (lixo)
 * =========================================================
 *
 * Firmware unificado e corrigido. Lê:
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
 * !! ATENÇÃO - NÃO USE O GPIO 27 PARA O SENSOR DE ÁGUA !!
 * O GPIO 27 é do ADC2 do ESP32, e o ADC2 PARA de funcionar
 * com o Wi-Fi ligado -> analogRead() = 0 (isso zerava a
 * leitura). Use um pino do ADC1: 32, 33, 34, 35, 36 ou 39.
 * =========================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>

// Credenciais e endereço do backend ficam em config.h.
#include "config.h"

// =========================================================
// CONFIGURAÇÕES DO SENSOR
// =========================================================

// true  -> gera valores simulados (útil para testar sem hardware)
// false -> lê dos sensores reais  <-- USE false na placa
#define MODO_SIMULADO false

// Parâmetros do ADC (sensor de água analógico)
// GPIO 34 = ADC1_CH6, input-only, funciona com Wi-Fi ligado.
static const int PINO_SENSOR_AGUA = 34;

// Parâmetros do HC-SR04 (sensor de lixo/obstrução)
static const int PINO_TRIG = 25;
static const int PINO_ECHO = 26;

// Distância (cm) do sensor até a boca do tubo quando NÃO há lixo.
// Usada só para referência no Serial; o status usa DISTANCIA_CRITICA.
static const float DISTANCIA_SENSOR_CM = 200.0;

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
static const unsigned long INTERVALO_ENVIO_MS = 10000;

static unsigned long ultimoEnvio = 0;

// Última obstrução lida (mantida entre ciclos para exibir/reenviar)
static float  distanciaLixo = -1;
static String statusLixo    = "INDETERMINADO";
static bool   alertaLixo    = false;

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

#if !MODO_SIMULADO
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
#endif

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

    // 2) Lê nível da água
    int nivel = lerNivelAgua();

    Serial.println();
    Serial.println("==============================");
    Serial.print("Nivel da agua: ");
    Serial.println(nivel);
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

    // 3) Envia para o backend
    enviarParaBackend(nivel);

    // 4) Feedback local (LEDs + buzzer)
    atualizarAlertas(nivel);
  }
}

// =========================================================
// CONEXÃO WiFi
// =========================================================

void conectarWiFi() {
  if (String(WIFI_SSID) == "SEU_SSID_AQUI") {
    Serial.println("ERRO: configure WIFI_SSID e WIFI_PASSWORD no início do arquivo.");
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
// LEITURA DO NÍVEL DA ÁGUA
// =========================================================

int lerNivelAgua() {
#if MODO_SIMULADO
  return valorSimulado();
#else
  // Leitura analógica 0..4095 no ADC1 (funciona com Wi-Fi ligado).
  int leitura = analogRead(PINO_SENSOR_AGUA);
  return leitura;
#endif
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
#if !MODO_SIMULADO
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

  digitalWrite(PINO_BUZZER, alertaLixo ? HIGH : LOW);
#endif
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
  String corpo;

  // "nivel" e "mensagem" na RAIZ (formato aceito pelo backend),
  // + campos de obstrução que o backend já persiste e exibe.
  String statusAgua;
  if (nivel < NIVEL_ATENCAO)      statusAgua = "SEGURO";
  else if (nivel < NIVEL_PERIGO)  statusAgua = "ATENCAO";
  else                             statusAgua = "PERIGO";

  String mensagem = statusAgua + " - Nivel da agua: " + String(nivel);

  corpo  = "{";
  corpo += "\"nivel\":" + String(nivel) + ",";
  corpo += "\"mensagem\":\"" + mensagem + "\",";
  corpo += "\"statusAgua\":\"" + statusAgua + "\",";
  corpo += "\"statusLixo\":\"" + statusLixo + "\",";
  corpo += "\"distanciaLixo\":" + String(distanciaLixo, 2) + ",";
  corpo += "\"alerta\":" + String(alertaLixo ? "true" : "false");
  corpo += "}";

  Serial.print("POST ");
  Serial.println(url);
  Serial.print("Corpo: ");
  Serial.println(corpo);

  // ---- Retry com backoff: ate 3 tentativas ----
  // Resolve o caso do backend estar momentaneamente fora.
  const int MAX_TENTATIVAS = 3;

  for (int tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    HTTPClient http;
    http.setTimeout(8000);
    http.setConnectTimeout(5000);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    int codigo = http.POST((uint8_t*)corpo.c_str(), corpo.length());

    if (codigo > 0) {
      Serial.print("Resposta HTTP: ");
      Serial.println(codigo);
      Serial.println(http.getString());
      http.end();
      return; // sucesso
    }

    // ---- Falha: diagnostica o motivo ----
    Serial.print("Tentativa ");
    Serial.print(tentativa);
    Serial.print("/");
    Serial.print(MAX_TENTATIVAS);
    Serial.print(" falhou: ");
    Serial.println(http.errorToString(codigo));

    if (codigo == -1) {
      Serial.println("  -> connection refused = o backend NAO esta rodando");
      Serial.println("     ou o IP/porta estao errados. Rode 'iniciar-backend.bat'");
      Serial.print("     e confira BACKEND_HOST = ");
      Serial.println(BACKEND_HOST);
    } else if (codigo == -11) {
      Serial.println("  -> timeout = sem resposta. Veja firewall/isolamento do roteador.");
    }

    http.end();

    if (tentativa < MAX_TENTATIVAS) {
      Serial.println("  Aguardando para tentar de novo...");
      delay(2000);
    }
  }

  Serial.println("Nao foi possivel enviar. Nova tentativa no proximo ciclo.");
}
