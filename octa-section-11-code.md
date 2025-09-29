# Раздел 11. Примеры кода (Core и облако)

## 11.1 Core (ESP32-P4) - основной код

### 11.1.1 Main.cpp - точка входа

```cpp
// main.cpp - Основной файл Core
#include <Arduino.h>
#include <WiFi.h>
#include <ETH.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <ModbusMaster.h>
#include <SPIFFS.h>
#include <Preferences.h>

// Конфигурация
const char* STAND_TOKEN = "550e8400-e29b-41d4-a716-446655440000";
const char* CLOUD_HOST = "octa.cloud";
const int WSS_PORT = 443;
const char* WSS_PATH = "/ws/";

// Глобальные объекты
WebSocketsClient webSocket;
StateMachine stateMachine;
ConfigManager configManager;
CommandExecutor commandExecutor;
ButtonHandler buttonHandler;
SafetyMonitor safetyMonitor;
ModbusManager modbusManager;
HeartbeatManager heartbeatManager;
EmergencyHandler emergencyHandler;
LocalLogger localLogger;

// Настройки сети
const char* wifi_ssid = "OCTA_NET";
const char* wifi_password = "secure_password";
IPAddress eth_ip(192, 168, 1, 100);
IPAddress eth_gateway(192, 168, 1, 1);
IPAddress eth_subnet(255, 255, 255, 0);

void setup() {
    Serial.begin(115200);
    Serial.println("OCTA Core Starting...");
    
    // Инициализация файловой системы
    if (!SPIFFS.begin(true)) {
        Serial.println("SPIFFS Mount Failed - formatting...");
        SPIFFS.format();
        SPIFFS.begin(true);
    }
    
    // Инициализация Preferences для хранения настроек
    Preferences prefs;
    prefs.begin("octa-core", false);
    
    // Подключение к сети
    if (!connectNetwork()) {
        Serial.println("Network connection failed - entering offline mode");
        enterOfflineMode();
    }
    
    // Загрузка конфигурации
    if (!loadConfiguration()) {
        Serial.println("Configuration load failed - using cached");
        loadCachedConfiguration();
    }
    
    // Инициализация оборудования
    initHardware();
    
    // Инициализация WebSocket
    initWebSocket();
    
    // Запуск FreeRTOS задач
    createTasks();
    
    // Переход в начальное состояние
    stateMachine.transition(CoreState::IDLE);
    
    Serial.println("Core initialization complete");
}

void loop() {
    // Основной цикл обработки
    static unsigned long lastProcess = 0;
    
    if (millis() - lastProcess > 10) {
        // Обработка команд
        commandExecutor.processQueue();
        
        // Проверка безопасности
        safetyMonitor.checkInterlocks();
        
        // Обновление heartbeat
        heartbeatManager.process();
        
        // Обработка WebSocket
        webSocket.loop();
        
        lastProcess = millis();
    }
    
    // Минимальная задержка для RTOS
    vTaskDelay(1);
}

bool connectNetwork() {
    // Попытка Ethernet подключения
    ETH.begin();
    ETH.config(eth_ip, eth_gateway, eth_subnet);
    
    unsigned long ethTimeout = millis() + 5000;
    while (!ETH.linkUp() && millis() < ethTimeout) {
        delay(100);
    }
    
    if (ETH.linkUp()) {
        Serial.println("Ethernet connected");
        Serial.print("IP: ");
        Serial.println(ETH.localIP());
        return true;
    }
    
    // Fallback на WiFi
    WiFi.begin(wifi_ssid, wifi_password);
    
    unsigned long wifiTimeout = millis() + 10000;
    while (WiFi.status() != WL_CONNECTED && millis() < wifiTimeout) {
        delay(500);
        Serial.print(".");
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected");
        Serial.print("IP: ");
        Serial.println(WiFi.localIP());
        return true;
    }
    
    return false;
}

bool loadConfiguration() {
    HTTPClient http;
    String url = String("https://") + CLOUD_HOST + "/api/stands/" + STAND_TOKEN + "/config";
    
    http.begin(url);
    http.addHeader("Authorization", "Bearer " + String(STAND_TOKEN));
    
    int httpCode = http.GET();
    
    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        
        // Парсинг и применение конфигурации
        DynamicJsonDocument doc(32768);
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error) {
            configManager.applyConfiguration(doc.as<JsonObject>());
            
            // Сохранение в кэш
            saveConfigToSPIFFS(payload);
            
            http.end();
            return true;
        }
    }
    
    http.end();
    return false;
}

void initHardware() {
    // Инициализация GPIO
    buttonHandler.init();
    
    // Инициализация Modbus
    modbusManager.init(Serial1, 9600);
    
    // Инициализация клапанов и насосов
    auto& hw = configManager.getHardwareConfig();
    
    for (auto& valve : hw.valves) {
        pinMode(valve.pin, OUTPUT);
        digitalWrite(valve.pin, valve.normalState == "closed" ? LOW : HIGH);
    }
    
    // Инициализация датчиков
    for (auto& sensor : hw.sensors) {
        if (sensor.type == "analog") {
            // ADC уже инициализирован
        } else if (sensor.type == "i2c") {
            Wire.begin();
        }
    }
}

void initWebSocket() {
    // Настройка WebSocket клиента
    webSocket.beginSSL(CLOUD_HOST, WSS_PORT, 
                       String(WSS_PATH) + STAND_TOKEN + "-Core");
    
    webSocket.onEvent(webSocketEvent);
    
    // Настройка автоматического переподключения
    webSocket.setReconnectInterval(5000);
    webSocket.enableHeartbeat(15000, 3000, 2);
}

void createTasks() {
    // Задача обработки WebSocket
    xTaskCreatePinnedToCore(
        websocketTask,
        "WebSocket",
        8192,
        NULL,
        1,
        NULL,
        0  // Core 0
    );
    
    // Задача обработки кнопок
    xTaskCreatePinnedToCore(
        buttonTask,
        "Buttons",
        4096,
        NULL,
        2,
        NULL,
        1  // Core 1
    );
    
    // Задача безопасности
    xTaskCreatePinnedToCore(
        safetyTask,
        "Safety",
        4096,
        NULL,
        3,  // Высокий приоритет
        NULL,
        1  // Core 1
    );
    
    // Задача телеметрии
    xTaskCreatePinnedToCore(
        telemetryTask,
        "Telemetry",
        4096,
        NULL,
        1,
        NULL,
        0  // Core 0
    );
}
```

### 11.1.2 WebSocket обработчик

```cpp
// websocket_handler.cpp
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            handleDisconnection();
            break;
            
        case WStype_CONNECTED:
            handleConnection();
            break;
            
        case WStype_TEXT:
            handleMessage(payload, length);
            break;
            
        case WStype_BIN:
            handleBinaryMessage(payload, length);
            break;
            
        case WStype_ERROR:
            handleWebSocketError(payload, length);
            break;
            
        case WStype_PONG:
            handlePong();
            break;
    }
}

void handleConnection() {
    Serial.println("WebSocket Connected");
    
    // Сброс счетчика попыток подключения
    connectionMonitor.resetReconnectAttempts();
    
    // Регистрация устройства
    DynamicJsonDocument doc(1024);
    doc["type"] = "register";
    doc["device_token"] = String(STAND_TOKEN) + "-Core";
    doc["device_type"] = "core";
    doc["version"] = FIRMWARE_VERSION;
    doc["capabilities"] = getDeviceCapabilities();
    
    String output;
    serializeJson(doc, output);
    webSocket.sendTXT(output);
    
    // Синхронизация состояния
    syncStateWithCloud();
    
    // Отправка накопленных offline логов
    if (localLogger.hasOfflineLogs()) {
        sendOfflineLogs();
    }
}

void handleMessage(uint8_t* payload, size_t length) {
    // Парсинг JSON сообщения
    DynamicJsonDocument doc(16384);
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.print("JSON parse error: ");
        Serial.println(error.c_str());
        sendError("JSON_PARSE_ERROR", error.c_str());
        return;
    }
    
    // Обновление времени последнего контакта
    connectionMonitor.updateLastContact();
    
    // Обработка по типу сообщения
    String type = doc["type"];
    
    if (type == "command") {
        handleCommand(doc.as<JsonObject>());
    }
    else if (type == "config_update") {
        handleConfigUpdate(doc.as<JsonObject>());
    }
    else if (type == "query") {
        handleQuery(doc.as<JsonObject>());
    }
    else if (type == "heartbeat_ack") {
        heartbeatManager.handleAck(doc["sequence"]);
    }
    else if (type == "emergency_stop") {
        emergencyHandler.triggerEmergency(
            EmergencyType::REMOTE_STOP,
            "Remote emergency stop command"
        );
    }
}

void handleCommand(const JsonObject& command) {
    String commandId = command["command_id"];
    
    // Отправка подтверждения получения
    sendAck(commandId, "received");
    
    // Проверка маршрутов
    if (!command.containsKey("routes")) {
        sendError(commandId, "No routes specified");
        return;
    }
    
    // Обработка маршрутов
    JsonArray routes = command["routes"].as<JsonArray>();
    
    for (JsonObject route : routes) {
        String device = route["device"];
        
        if (device == "core") {
            // Добавление в очередь выполнения
            commandExecutor.enqueue(route["payload"], commandId);
            sendAck(commandId, "started");
        }
        else if (device == "terminal") {
            // Пересылка на Terminal
            forwardToTerminal(route["payload"], commandId);
        }
        else if (device == "display") {
            // Пересылка на Display
            forwardToDisplay(route["payload"], commandId);
        }
    }
}

void sendAck(const String& commandId, const String& status) {
    DynamicJsonDocument doc(512);
    doc["type"] = "ack";
    doc["command_id"] = commandId;
    doc["device_token"] = String(STAND_TOKEN) + "-Core";
    doc["status"] = status;
    doc["timestamp"] = millis();
    
    String output;
    serializeJson(doc, output);
    webSocket.sendTXT(output);
}

void sendResult(const String& commandId, const JsonObject& result) {
    DynamicJsonDocument doc(4096);
    doc["type"] = "result";
    doc["command_id"] = commandId;
    doc["device_token"] = String(STAND_TOKEN) + "-Core";
    doc["success"] = result["success"];
    doc["data"] = result["data"];
    doc["timestamp"] = millis();
    
    String output;
    serializeJson(doc, output);
    webSocket.sendTXT(output);
}
```

### 11.1.3 Обработчик физических кнопок

```cpp
// button_handler.cpp
class ButtonHandler {
private:
    static const uint8_t PIN_ACCEPT = 18;
    static const uint8_t PIN_RETRY = 19;
    static const uint8_t PIN_EMERGENCY = 36;
    
    static const uint32_t DEBOUNCE_MS = 50;
    static const uint32_t MIN_STEP_TIME = 5000;
    
    volatile bool acceptPressed = false;
    volatile bool retryPressed = false;
    volatile bool emergencyPressed = false;
    
    unsigned long stepStartTime = 0;
    unsigned long lastButtonTime = 0;
    
    static ButtonHandler* instance;
    
public:
    void init() {
        instance = this;
        
        pinMode(PIN_ACCEPT, INPUT_PULLUP);
        pinMode(PIN_RETRY, INPUT_PULLUP);
        pinMode(PIN_EMERGENCY, INPUT_PULLUP);
        
        attachInterrupt(digitalPinToInterrupt(PIN_ACCEPT), acceptISR, FALLING);
        attachInterrupt(digitalPinToInterrupt(PIN_RETRY), retryISR, FALLING);
        attachInterrupt(digitalPinToInterrupt(PIN_EMERGENCY), emergencyISR, FALLING);
    }
    
    void startStep() {
        stepStartTime = millis();
        acceptPressed = false;
        retryPressed = false;
    }
    
    void processButtons() {
        if (emergencyPressed) {
            handleEmergencyButton();
            emergencyPressed = false;
        }
        
        if (acceptPressed) {
            handleAcceptButton();
            acceptPressed = false;
        }
        
        if (retryPressed) {
            handleRetryButton();
            retryPressed = false;
        }
    }
    
private:
    static void IRAM_ATTR acceptISR() {
        unsigned long now = millis();
        if (now - instance->lastButtonTime > DEBOUNCE_MS) {
            instance->acceptPressed = true;
            instance->lastButtonTime = now;
        }
    }
    
    static void IRAM_ATTR retryISR() {
        unsigned long now = millis();
        if (now - instance->lastButtonTime > DEBOUNCE_MS) {
            instance->retryPressed = true;
            instance->lastButtonTime = now;
        }
    }
    
    static void IRAM_ATTR emergencyISR() {
        // Аварийная кнопка - максимальный приоритет
        instance->emergencyPressed = true;
    }
    
    void handleAcceptButton() {
        unsigned long elapsed = millis() - stepStartTime;
        
        // Проверка 5-секундного барьера
        if (elapsed < MIN_STEP_TIME) {
            sendButtonError("TOO_EARLY", elapsed);
            
            // Визуальная индикация
            flashLED(LED_RED, 3);
            buzzerError();
            
            return;
        }
        
        // Валидное нажатие
        DynamicJsonDocument doc(1024);
        doc["type"] = "core_event";
        doc["event"] = "finish_button";
        doc["button"] = "accept";
        doc["elapsed_ms"] = elapsed;
        doc["command_id"] = commandExecutor.getCurrentCommandId();
        
        String output;
        serializeJson(doc, output);
        webSocket.sendTXT(output);
        
        // Сбор и отправка результатов
        collectAndSendResults();
    }
    
    void handleRetryButton() {
        retryCount++;
        
        DynamicJsonDocument doc(1024);
        doc["type"] = "core_event";
        doc["event"] = "retry_button";
        doc["button"] = "retry";
        doc["retry_count"] = retryCount;
        doc["command_id"] = commandExecutor.getCurrentCommandId();
        
        String output;
        serializeJson(doc, output);
        webSocket.sendTXT(output);
        
        // Сброс текущего шага
        resetCurrentStep();
        
        // Уведомление локальных модулей
        notifyLocalModules("RETRY");
    }
    
    void handleEmergencyButton() {
        emergencyHandler.triggerEmergency(
            EmergencyType::MANUAL_STOP,
            "Emergency button pressed"
        );
        
        // Немедленная остановка всего
        executeEmergencyStop();
    }
};

ButtonHandler* ButtonHandler::instance = nullptr;
```

## 11.2 Cloud (Python) - серверная часть

### 11.2.1 WebSocket сервер

```python
# websocket_server.py
import asyncio
import json
import websockets
from datetime import datetime, timedelta
from typing import Dict, Set, Optional
import logging
from dataclasses import dataclass
import aioredis
import aiomysql

logger = logging.getLogger(__name__)

@dataclass
class StandConnection:
    """Информация о подключенном стенде"""
    stand_token: str
    devices: Dict[str, websockets.WebSocketServerProtocol]
    last_heartbeat: datetime
    state: str
    operator: Optional[str] = None
    current_command: Optional[str] = None

class OctaWebSocketServer:
    def __init__(self, redis_url: str, mysql_config: dict):
        self.connections: Dict[str, StandConnection] = {}
        self.redis = None
        self.mysql_pool = None
        self.mysql_config = mysql_config
        self.redis_url = redis_url
        self.command_results = {}
        self.heartbeat_timeout = timedelta(seconds=35)
        
    async def start(self):
        """Запуск сервера"""
        # Подключение к Redis
        self.redis = await aioredis.create_redis_pool(self.redis_url)
        
        # Подключение к MySQL
        self.mysql_pool = await aiomysql.create_pool(**self.mysql_config)
        
        # Запуск WebSocket сервера
        async with websockets.serve(
            self.handle_connection,
            "0.0.0.0",
            8765,
            ping_interval=20,
            ping_timeout=10
        ):
            logger.info("WebSocket server started on port 8765")
            
            # Запуск фоновых задач
            await asyncio.gather(
                self.heartbeat_monitor(),
                self.command_timeout_monitor()
            )
    
    async def handle_connection(self, websocket, path):
        """Обработка нового подключения"""
        device_token = None
        try:
            # Извлечение токена из пути
            device_token = self.extract_device_token(path)
            if not device_token:
                await websocket.close(1008, "Invalid token")
                return
            
            # Валидация токена
            if not await self.validate_token(device_token):
                await websocket.close(1008, "Unauthorized")
                return
            
            # Регистрация соединения
            await self.register_device(device_token, websocket)
            
            logger.info(f"Device connected: {device_token}")
            
            # Обработка сообщений
            async for message in websocket:
                try:
                    await self.handle_message(device_token, message)
                except json.JSONDecodeError:
                    await self.send_error(websocket, "Invalid JSON")
                except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stands/{stand_token}/config")
async def update_stand_configuration(
    stand_token: str,
    config: StandConfig,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """Обновление конфигурации стенда"""
    try:
        # Валидация конфигурации
        if not validate_config_schema(config.dict()):
            raise HTTPException(status_code=400, detail="Invalid configuration schema")
        
        # Сохранение в БД
        revision = await save_config_to_db(stand_token, config.dict())
        
        # Асинхронное уведомление стенда
        background_tasks.add_task(notify_stand_config_update, stand_token, revision)
        
        return {
            "status": "updated",
            "revision": revision,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stands/{stand_token}/command")
async def send_command_to_stand(
    stand_token: str,
    command: Command,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """Отправка команды на стенд"""
    try:
        # Генерация ID команды если не указан
        if not command.command_id:
            command.command_id = f"cmd-{uuid.uuid4()}"
        
        # Добавление метаданных
        command_dict = command.dict()
        command_dict["stand_token"] = stand_token
        command_dict["timestamp"] = datetime.now().isoformat()
        
        # Сохранение в очередь команд
        await save_command_to_queue(stand_token, command_dict)
        
        # Отправка через WebSocket
        background_tasks.add_task(
            send_command_via_websocket,
            stand_token,
            command_dict
        )
        
        return {
            "command_id": command.command_id,
            "status": "queued",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error sending command: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stands/{stand_token}/status")
async def get_stand_status(
    stand_token: str,
    token: str = Depends(verify_token)
) -> StandStatus:
    """Получение текущего статуса стенда"""
    try:
        # Получение из Redis
        status_data = await get_stand_status_from_redis(stand_token)
        
        if not status_data:
            # Fallback на БД
            status_data = await get_stand_status_from_db(stand_token)
        
        if not status_data:
            raise HTTPException(status_code=404, detail="Stand not found")
        
        return StandStatus(**status_data)
        
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stands/{stand_token}/telemetry")
async def get_stand_telemetry(
    stand_token: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    sensors: Optional[List[str]] = None,
    token: str = Depends(verify_token)
):
    """Получение телеметрии стенда"""
    try:
        # Загрузка из TimescaleDB
        telemetry = await load_telemetry(
            stand_token,
            start_time or datetime.now() - timedelta(minutes=5),
            end_time or datetime.now(),
            sensors
        )
        
        return {
            "stand_token": stand_token,
            "period": {
                "start": start_time,
                "end": end_time
            },
            "data": telemetry
        }
        
    except Exception as e:
        logger.error(f"Error getting telemetry: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stands/{stand_token}/commands/{command_id}/result")
async def get_command_result(
    stand_token: str,
    command_id: str,
    token: str = Depends(verify_token)
):
    """Получение результата выполнения команды"""
    try:
        result = await get_command_result_from_db(stand_token, command_id)
        
        if not result:
            # Проверка, не в процессе ли выполнения
            status = await get_command_status(command_id)
            if status == "in_progress":
                return {
                    "command_id": command_id,
                    "status": "in_progress",
                    "message": "Command is still being executed"
                }
            else:
                raise HTTPException(status_code=404, detail="Result not found")
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting result: {e}")
        raise HTTPException(status_code=500, detail=str(e)):
                    logger.error(f"Error handling message: {e}")
                    await self.send_error(websocket, str(e))
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Device disconnected: {device_token}")
        except Exception as e:
            logger.error(f"Connection error: {e}")
        finally:
            if device_token:
                await self.unregister_device(device_token)
    
    def extract_device_token(self, path: str) -> Optional[str]:
        """Извлечение токена устройства из пути"""
        # Path format: /ws/550e8400-...-Core
        parts = path.strip('/').split('/')
        if len(parts) >= 2:
            return parts[-1]
        return None
    
    async def validate_token(self, device_token: str) -> bool:
        """Валидация токена устройства"""
        # Извлечение stand_token и типа устройства
        if device_token.endswith('-Core') or \
           device_token.endswith('-Terminal') or \
           device_token.endswith('-Display'):
            stand_token = device_token.rsplit('-', 1)[0]
            
            # Проверка в БД
            async with self.mysql_pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute(
                        "SELECT id FROM stands WHERE token = %s AND active = 1",
                        (stand_token,)
                    )
                    result = await cursor.fetchone()
                    return result is not None
        return False
    
    async def register_device(self, device_token: str, websocket):
        """Регистрация устройства"""
        stand_token = device_token.rsplit('-', 1)[0]
        device_type = device_token.rsplit('-', 1)[1]
        
        if stand_token not in self.connections:
            self.connections[stand_token] = StandConnection(
                stand_token=stand_token,
                devices={},
                last_heartbeat=datetime.now(),
                state="IDLE"
            )
        
        self.connections[stand_token].devices[device_type] = websocket
        
        # Сохранение в Redis
        await self.redis.setex(
            f"device:{device_token}:status",
            300,  # TTL 5 минут
            "online"
        )
    
    async def handle_message(self, device_token: str, message: str):
        """Обработка входящего сообщения"""
        data = json.loads(message)
        msg_type = data.get("type")
        
        stand_token = device_token.rsplit('-', 1)[0]
        
        # Обновление времени последнего контакта
        if stand_token in self.connections:
            self.connections[stand_token].last_heartbeat = datetime.now()
        
        # Маршрутизация по типу сообщения
        if msg_type == "heartbeat":
            await self.handle_heartbeat(stand_token, data)
        elif msg_type == "ack":
            await self.handle_ack(stand_token, data)
        elif msg_type == "result":
            await self.handle_result(stand_token, data)
        elif msg_type == "core_event":
            await self.handle_core_event(stand_token, data)
        elif msg_type == "bt_telemetry":
            await self.handle_bt_telemetry(stand_token, data)
        elif msg_type == "error_event":
            await self.handle_error_event(stand_token, data)
        elif msg_type == "offline_logs":
            await self.handle_offline_logs(stand_token, data)
        elif msg_type == "telemetry":
            await self.handle_telemetry(stand_token, data)
        else:
            logger.warning(f"Unknown message type: {msg_type}")
    
    async def handle_heartbeat(self, stand_token: str, data: dict):
        """Обработка heartbeat"""
        # Сохранение состояния в Redis
        await self.redis.setex(
            f"stand:{stand_token}:heartbeat",
            60,
            json.dumps(data)
        )
        
        # Обновление состояния в памяти
        if stand_token in self.connections:
            conn = self.connections[stand_token]
            conn.last_heartbeat = datetime.now()
            conn.state = data.get("status", {}).get("state", "UNKNOWN")
        
        # Проверка аномалий
        await self.check_anomalies(stand_token, data)
        
        # Отправка ACK
        if "sequence" in data:
            await self.send_heartbeat_ack(stand_token, data["sequence"])
        
        # Сохранение в БД для истории
        await self.save_heartbeat_to_db(stand_token, data)
    
    async def send_command(self, stand_token: str, command: dict):
        """Отправка команды на стенд"""
        if stand_token not in self.connections:
            raise Exception(f"Stand {stand_token} not connected")
        
        conn = self.connections[stand_token]
        command_id = command.get("command_id")
        
        # Сохранение команды в Redis для отслеживания
        await self.redis.setex(
            f"command:{command_id}",
            300,
            json.dumps(command)
        )
        
        # Маршрутизация по устройствам
        for route in command.get("routes", []):
            device_type = route["device"]
            
            # Преобразование device в тип устройства
            if device_type == "core":
                device_type = "Core"
            elif device_type == "terminal":
                device_type = "Terminal"
            elif device_type == "display":
                device_type = "Display"
            
            if device_type in conn.devices:
                websocket = conn.devices[device_type]
                await websocket.send(json.dumps(command))
                logger.info(f"Command {command_id} sent to {stand_token}-{device_type}")
    
    async def handle_result(self, stand_token: str, data: dict):
        """Обработка результата выполнения команды"""
        command_id = data.get("command_id")
        device = data.get("device_token", "").split('-')[-1]
        
        # Сохранение результата
        if command_id not in self.command_results:
            self.command_results[command_id] = {
                "stand_token": stand_token,
                "results": {},
                "timestamp": datetime.now()
            }
        
        self.command_results[command_id]["results"][device] = data
        
        # Проверка получения всех результатов
        await self.check_command_completion(command_id)
        
        # Сохранение в БД
        await self.save_result_to_db(stand_token, command_id, data)
    
    async def heartbeat_monitor(self):
        """Мониторинг heartbeat от стендов"""
        while True:
            try:
                current_time = datetime.now()
                
                for stand_token, conn in self.connections.items():
                    time_since_heartbeat = current_time - conn.last_heartbeat
                    
                    if time_since_heartbeat > self.heartbeat_timeout:
                        logger.warning(f"Stand {stand_token} heartbeat timeout")
                        
                        # Создание алерта
                        await self.create_alert(
                            stand_token,
                            "HEARTBEAT_TIMEOUT",
                            f"No heartbeat for {time_since_heartbeat.seconds} seconds"
                        )
                
                await asyncio.sleep(5)
                
            except Exception as e:
                logger.error(f"Heartbeat monitor error: {e}")
                await asyncio.sleep(5)
```

### 11.2.2 REST API для управления

```python
# rest_api.py
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import hashlib
import uuid
from datetime import datetime

app = FastAPI(title="OCTA Cloud API", version="1.0.0")
security = HTTPBearer()

# Модели данных
class StandConfig(BaseModel):
    stand_token: str
    metadata: Dict[str, Any]
    hardware: Dict[str, Any]
    emergency: Dict[str, Any]
    devices: Dict[str, Any]
    calibration: Dict[str, Any]

class Command(BaseModel):
    command_id: Optional[str] = None
    step_number: int
    routes: List[Dict[str, Any]]
    completion_policy: Optional[Dict[str, Any]] = None

class StandStatus(BaseModel):
    stand_token: str
    status: str
    last_seen: datetime
    current_state: str
    modules: Dict[str, str]
    current_operator: Optional[str]

# Dependency для авторизации
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    # Проверка токена в БД или кэше
    if not await validate_api_token(token):
        raise HTTPException(status_code=401, detail="Invalid token")
    return token

# Endpoints
@app.get("/api/stands/{stand_token}/config")
async def get_stand_configuration(
    stand_token: str,
    revision: Optional[str] = "latest",
    token: str = Depends(verify_token)
):
    """Получение конфигурации стенда"""
    try:
        # Загрузка из БД
        config = await load_config_from_db(stand_token, revision)
        
        if not config:
            raise HTTPException(status_code=404, detail="Configuration not found")
        
        # Добавление подписи
        config_json = json.dumps(config, sort_keys=True)
        signature = hashlib.sha256(config_json.encode()).hexdigest()
        
        config["signatures"] = {
            "sha256": signature,
            "revision": revision,
            "timestamp": datetime.now().isoformat()
        }
        
        return config
        
    except Exception as e