# Guia do ESP32 para o backend INVICTA

O firmware mantido e atualizado do projeto está em
[`esp32_nivel_agua/esp32_nivel_agua.ino`](./esp32_nivel_agua/esp32_nivel_agua.ino).
Este guia descreve a configuração e o formato de comunicação; não inclua
senhas de Wi-Fi ou credenciais em documentação versionada.

## Configuração

1. Copie `esp32_nivel_agua/config.example.h` para `config.h` na mesma pasta.
2. Preencha SSID, senha e endereço local do computador que executa o backend.
   O ESP32 e o computador precisam estar na mesma rede e a porta do backend
   (5000 por padrão) precisa estar acessível pela rede local.
3. Confirme que o sensor analógico está no GPIO 34 (ADC1). Ajuste
   `AGUA_OFFSET`, `AGUA_ESCALA` e os limiares no `.env` conforme a instalação.
4. Para o HC-SR04, use TRIG no GPIO 25 e ECHO no GPIO 26. O ECHO do HC-SR04
   pode fornecer 5 V: use divisor de tensão ou conversor de nível para limitar
   o sinal a 3,3 V antes de ligá-lo ao ESP32.
5. Compile e grave o firmware com o Arduino IDE/CLI e a placa ESP32 correta.

`MODO_SENSOR_AGUA` aceita:

- `AUTO` (recomendado): usa o ADC real; zeros repetidos geram um aviso, mas
  nunca são substituídos silenciosamente por medições simuladas.
- `REAL`: usa somente o ADC real.
- `SIMULADO`: gera valores de teste e os identifica no backend como simulados.

Uma leitura real igual a zero é preservada. Como zero também pode ser a
condição seca ou a calibração do sensor, confirme o hardware antes de concluir
que há uma falha.

## Comunicação

O firmware envia `POST /esp32` com JSON na raiz:

```json
{
  "nivel": 1234,
  "mensagem": "ATENCAO - Nivel da agua: 1234",
  "fonteNivel": "REAL",
  "statusLixo": "NORMAL",
  "distanciaLixo": 24.5
}
```

O backend também aceita somente `mensagem` ou somente `nivel`. A distância
deve ser `null` quando o ultrassônico não recebe eco válido; o backend guarda
esse caso como indisponível, não como uma distância negativa.

As respostas bem-sucedidas usam HTTP 2xx. O firmware registra respostas
rejeitadas e tenta novamente em erros de transporte e erros HTTP 5xx. Verifique
o monitor Serial, o endpoint `GET /health` e a indicação de conexão no
dashboard ao diagnosticar a comunicação.

Limiares padrão do backend (configuráveis pelo `.env`):

| Leitura | Classificação |
|---|---|
| abaixo de 1000 | SEGURO |
| 1000 a 1999 | ATENÇÃO |
| 2000 a 2999 | PERIGO |
| 3000 ou mais | CRÍTICO |

O histórico registra a origem da leitura (`REAL`, `SIMULADO`, `TESTE` ou
`NAO_INFORMADA`) para que valores de teste não sejam confundidos com medições
do sensor.

## Testes do backend

Execute `npm test` para verificar as rotas, a persistência de leituras,
diagnóstico, alarmes e respostas do assistente. A suíte usa um banco temporário
e não altera o banco nem os arquivos de dados existentes do projeto.
