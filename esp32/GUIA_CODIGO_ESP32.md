# GUIA — Código do ESP32 para o backend INVICTA

> Este arquivo é **apenas documentação/referência**. Não é compilado pelo
> Node.js, não é carregado pelo dashboard e **não afeta** o funcionamento
> do backend. Serve para você copiar o firmware correto para a sua placa.

---

## 1. Como o backend INVICTA recebe dados do ESP32

Endpoint:

    POST /esp32
    Content-Type: application/json

O backend aceita estes corpos (JSON):

| Formato | Exemplo | Quando usar |
|--------|---------|-------------|
| **(A) String** | `{ "mensagem": "Nivel da agua: 1234" }` | quando já monta a frase |
| **(B) Numérico** | `{ "nivel": 1234 }` | **recomendado**, mais simples |
| **(C) Os dois** | `{ "nivel": 1234, "mensagem": "Nivel da agua: 1234" }` | máxima compatibilidade |

Regras importantes:
- O valor pode ser **inteiro ou decimal** (aceita `12.7` e também `12,7`).
- Campos **extras** (statusAgua, distanciaLixo, etc.) são **ignorados** pelo
  backend atual, mas não atrapalham — pode enviá-los para uso futuro.

Classificação (limiares padrão do `.env`):

    0 .. 999     -> SEGURO  (NORMAL)
    1000 .. 1999 -> ATENCAO (ATENÇÃO)
    2000 .. 2999 -> PERIGO  (ALERTA)
    >= 3000      -> CRITICO (CRÍTICO)

---

## 2. Análise dos dois códigos que você enviou

### ✅ Código 1 (base) — funciona
Envia: `{ "mensagem": "SEGURO - Nivel da agua: 1500" }`
O regex interno acha o número `1500`, então o backend registra certo.
O prefixo "SEGURO - " é ignorado.

### ❌ Código 2 (completo, com lixo) — NÃO funciona como está
Monta um JSON estruturado assim:

    { "dispositivo": {...},
      "leituras": { "agua": { "valor": 1500 } },
      "alertas": {...} }

O backend espera `mensagem` ou `nivel` **na raiz** do JSON. Como esse JSON
não tem nenhum dos dois na raiz, a resposta é:

    HTTP 400 { "sucesso": false, "erro": "Envie 'mensagem' ... ou 'nivel' numérico." }

**Correção:** adicionar `"nivel"` e `"mensagem"` na raiz (feito no código abaixo).

---

## 3. Código ESP32 recomendado (unificado e corrigido)

Mantém tudo do seu Código 2 (sensor de água + ultrassônico de lixo + LEDs +
buzzer) e **corrige o envio** para o formato que o backend aceita.

Ver bloco de código abaixo.

```cpp
// =========================================================
// INVICTA - ESP32 | Nível da água + obstrução (lixo)
// Pronto para o backend INVICTA (POST /esp32).
// =========================================================
#include <WiFi.h>
#include <HTTPClient.h>

// ---------- WI-FI ----------
const char* WIFI_SSID     = "ADFAMILIA";
const char* WIFI_PASSWORD = "Ro01Na02Ge03";

// URL do backend:
//   Rede local : "http://192.168.15.75:5000/esp32"
//   Publicado  : "https://backend-tcc--geovannaolivei9.replit.app/esp32"
const char* BACKEND_URL = "http://192.168.15.75:5000/esp32";

// ---------- PINOS ----------
// ATENÇÃO (ADC): no ESP32 o ADC2 (GPIO 0,2,4,12,13,14,15,25,26,27) PARA de
// funcionar quando o Wi-Fi está ligado e devolve 0. Por isso o sensor de água
// DEVE ficar em um pino do ADC1: 32, 33, 34, 35, 36 ou 39.
// GPIO 34 é input-only (ADC1_CH6): ideal para sensor analógico.
const int PINO_SENSOR_AGUA = 34;
const int LED_VERDE        = 4;
const int LED_AMARELO      = 13;
const int LED_VERMELHO     = 12;
const int PINO_BUZZER      = 2;
const int PINO_TRIG        = 25;
const int PINO_ECHO        = 26;

// ---------- LIMIARES (iguais ao .env do backend) ----------
const int   NIVEL_ATENCAO     = 1000;
const int   NIVEL_PERIGO      = 2000;
const float DISTANCIA_CRITICA = 10.0;
const unsigned long INTERVALO_ENVIO = 5000;

unsigned long ultimaLeitura = 0;

int   valorAgua      = 0;
float distanciaLixo  = -1;
String statusAgua    = "SEGURO";
String statusLixo    = "INDETERMINADO";
bool  alertaAgua     = false;
bool  alertaLixo     = false;
bool  alertaGeral    = false;

// ---------- WI-FI ----------
void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Conectando ao Wi-Fi ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi conectado!");
    Serial.print("IP do ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Falha ao conectar. Nova tentativa no próximo ciclo.");
  }
}

// ---------- SENSOR DE ÁGUA (analógico) ----------
void lerSensorAgua() {
  valorAgua = analogRead(PINO_SENSOR_AGUA);
  if (valorAgua < NIVEL_ATENCAO)     statusAgua = "SEGURO";
  else if (valorAgua < NIVEL_PERIGO) statusAgua = "ATENCAO";
  else                               statusAgua = "PERIGO";
  alertaAgua = valorAgua >= NIVEL_ATENCAO;
}

// ---------- SENSOR DE LIXO (ultrassônico) ----------
float lerDistancia() {
  digitalWrite(PINO_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PINO_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PINO_TRIG, LOW);
  unsigned long duracao = pulseIn(PINO_ECHO, HIGH, 30000);
  if (duracao == 0) return -1;
  return (duracao * 0.0343f) / 2.0f;
}

void lerSensorLixo() {
  distanciaLixo = lerDistancia();
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

// ---------- LEDs + BUZZER ----------
void atualizarAlertas() {
  alertaGeral = alertaAgua || alertaLixo;
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_AMARELO, LOW);
  digitalWrite(LED_VERMELHO, LOW);
  if (valorAgua < NIVEL_ATENCAO)      digitalWrite(LED_VERDE, HIGH);
  else if (valorAgua < NIVEL_PERIGO)  digitalWrite(LED_AMARELO, HIGH);
  else                                digitalWrite(LED_VERMELHO, HIGH);
  digitalWrite(PINO_BUZZER, alertaGeral ? HIGH : LOW);
}

// ---------- ENVIO AO BACKEND (FORMATO CORRETO) ----------
void enviarBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sem Wi-Fi. Leitura não enviada.");
    return;
  }

  HTTPClient http;
  WiFiClient cliente;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  // API do HTTPClient 2.x. Se a sua versão for antiga, use http.begin(BACKEND_URL);
  if (!http.begin(cliente, BACKEND_URL)) {
    Serial.println("Não foi possível iniciar a requisição HTTP.");
    return;
  }
  http.addHeader("Content-Type", "application/json");

  // >>> CORREÇÃO PRINCIPAL <<<
  // "nivel" e "mensagem" ficam na RAIZ do JSON, que é o que o backend aceita.
  String statusAlerta  = alertaGeral ? "ATIVO" : "DESATIVADO";
  String mensagemAgua  = statusAgua + " - Nivel da agua: " + String(valorAgua);

  String json  = "{";
  json += "\"nivel\":" + String(valorAgua) + ",";
  json += "\"mensagem\":\"" + mensagemAgua + "\",";
  // Extras (o backend atual ignora, mas ficam disponíveis para o futuro):
  json += "\"statusAgua\":\"" + statusAgua + "\",";
  json += "\"statusLixo\":\"" + statusLixo + "\",";
  json += "\"distanciaLixo\":" + String(distanciaLixo, 2) + ",";
  json += "\"alertaGeral\":" + String(alertaGeral ? "true" : "false") + ",";
  json += "\"alerta\":\"" + statusAlerta + "\"";
  json += "}";

  Serial.println();
  Serial.println("Enviando leitura para o backend:");
  Serial.println(json);

  int codigoHTTP = http.POST(json);
  String resposta = http.getString();
  Serial.print("Código HTTP: ");
  Serial.println(codigoHTTP);
  if (codigoHTTP > 0) {
    Serial.print("Resposta: ");
    Serial.println(resposta);
  } else {
    Serial.print("Falha HTTP: ");
    Serial.println(http.errorToString(codigoHTTP));
  }
  http.end();
}

// ---------- MONITOR SERIAL ----------
void mostrarLeituras() {
  Serial.println("==============================");
  Serial.print("Nível da água: ");   Serial.println(valorAgua);
  Serial.print("Status da água: ");  Serial.println(statusAgua);
  Serial.print("Distância do lixo: ");
  if (distanciaLixo > 0) { Serial.print(distanciaLixo, 2); Serial.println(" cm"); }
  else Serial.println("Sem leitura válida");
  Serial.print("Status do lixo: ");  Serial.println(statusLixo);
  Serial.print("Alerta geral: ");    Serial.println(alertaGeral ? "ATIVO" : "DESATIVADO");
  Serial.println("==============================");
}

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);
  pinMode(PINO_SENSOR_AGUA, INPUT);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARELO, OUTPUT);
  pinMode(LED_VERMELHO, OUTPUT);
  pinMode(PINO_BUZZER, OUTPUT);
  pinMode(PINO_TRIG, OUTPUT);
  pinMode(PINO_ECHO, INPUT);
  digitalWrite(PINO_TRIG, LOW);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_AMARELO, LOW);
  digitalWrite(LED_VERMELHO, LOW);
  digitalWrite(PINO_BUZZER, LOW);
  analogReadResolution(12);   // leitura de 0 a 4095
  conectarWiFi();
}

// ---------- LOOP ----------
void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();
  if (millis() - ultimaLeitura >= INTERVALO_ENVIO) {
    ultimaLeitura = millis();
    lerSensorAgua();
    lerSensorLixo();
    atualizarAlertas();
    mostrarLeituras();
    enviarBackend();
  }
  delay(10);
}
```

---

## 4. Checklist antes de gravar na placa

- [ ] `WIFI_SSID` / `WIFI_PASSWORD` com os dados da sua rede.
- [ ] `BACKEND_URL`:
  - teste na mesma rede -> `http://IP_DO_PC:5000/esp32`
  - backend publicado -> `https://.../esp32`
- [ ] Limiares (`NIVEL_ATENCAO=1000`, `NIVEL_PERIGO=2000`) iguais ao `.env` do backend.
- [ ] Biblioteca **ArduinoJson** NÃO é necessária neste código (JSON montado na mão).
- [ ] Abra o **Monitor Serial (115200)** e confira: deve aparecer `Código HTTP: 200`.

## 5. Como testar sem a placa (pelo backend)

```bash
curl -X POST http://localhost:5000/esp32 \
  -H "Content-Type: application/json" \
  -d "{\"nivel\":1500}"
```

Resposta esperada: `{"sucesso":true,...}` e o dashboard atualiza na hora
via Socket.IO (evento `novaLeitura`).
