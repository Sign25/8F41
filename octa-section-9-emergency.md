# Раздел 9. Аварийные режимы, heartbeat, потеря связи

## 9.1 Система аварийных режимов

### 9.1.1 Триггеры аварийного режима

> "Если пропадает связь, то стенд должен прийти в определенное аварийное состояние, которое также должно быть прописано в конфигураторе"

| Триггер | Условие срабатывания | Приоритет | Действие |
|---------|---------------------|-----------|----------|
| Потеря связи с облаком | > 30 секунд без ответа | Высокий | Emergency preset |
| Превышение давления | > 95% от максимума | Критический | Немедленный сброс |
| Перегрев | Температура > лимита | Высокий | Остановка, охлаждение |
| Кнопка аварийной остановки | Нажатие | Критический | Полная остановка |
| Критическая ошибка оборудования | Отказ датчика/клапана | Высокий | Безопасное состояние |
| Потеря питания | Напряжение < минимума | Критический | Сохранение состояния |
| Несоответствие контрольных сумм | CRC error в конфигурации | Средний | Загрузка backup config |
| Утечка | Падение давления > порога | Высокий | Закрытие клапанов |

### 9.1.2 Конфигурация аварийных действий

```json
{
  "emergency_config": {
    "triggers": {
      "connection_loss": {
        "timeout_ms": 30000,
        "action": "apply_emergency_preset"
      },
      "pressure_exceed": {
        "threshold": 95,
        "units": "percent",
        "action": "immediate_depressurize"
      },
      "temperature_exceed": {
        "threshold": 80,
        "units": "celsius",
        "action": "shutdown_with_cooling"
      },
      "emergency_button": {
        "action": "full_emergency_stop"
      }
    },
    "emergency_preset": {
      "valves": [
        {"id": "valve_inlet", "state": "closed"},
        {"id": "valve_outlet", "state": "open"},
        {"id": "valve_relief", "state": "open"}
      ],
      "pumps": [
        {"id": "pump_main", "frequency": 0},
        {"id": "pump_auxiliary", "frequency": 0}
      ],
      "power": {
        "main_24v": "off",
        "instruments": "off",
        "emergency_light": "on",
        "alarm": "on"
      },
      "actions": [
        {"type": "depressurize", "duration_ms": 5000},
        {"type": "sound_alarm", "pattern": "continuous"},
        {"type": "log_state", "destination": "local"},
        {"type": "notify", "channels": ["local_display", "sms"]}
      ]
    }
  }
}
```

### 9.1.3 Обработчик аварийных ситуаций

```cpp
class EmergencyHandler {
private:
    enum EmergencyType {
        CONNECTION_LOST,
        PRESSURE_CRITICAL,
        TEMPERATURE_CRITICAL,
        MANUAL_STOP,
        EQUIPMENT_FAILURE,
        POWER_LOSS
    };
    
    struct EmergencyState {
        EmergencyType type;
        unsigned long timestamp;
        String description;
        bool resolved;
    };
    
    std::vector<EmergencyState> activeEmergencies;
    bool emergencyModeActive = false;
    
public:
    void checkTriggers() {
        // Проверка потери связи
        if (millis() - lastCloudContact > CONNECTION_TIMEOUT) {
            triggerEmergency(CONNECTION_LOST, "Lost cloud connection");
        }
        
        // Проверка давления
        float pressure = readSensor("pressure_main");
        if (pressure > config.pressure_max * 0.95) {
            triggerEmergency(PRESSURE_CRITICAL, "Pressure exceeds 95% of max");
        }
        
        // Проверка температуры
        float temperature = readSensor("temperature");
        if (temperature > config.temperature_max) {
            triggerEmergency(TEMPERATURE_CRITICAL, "Temperature exceeds limit");
        }
        
        // Проверка оборудования
        if (!checkEquipmentHealth()) {
            triggerEmergency(EQUIPMENT_FAILURE, "Critical equipment failure");
        }
    }
    
    void triggerEmergency(EmergencyType type, const String& reason) {
        if (emergencyModeActive && hasActiveEmergency(type)) {
            return; // Уже обрабатывается
        }
        
        // Логирование
        logCritical("EMERGENCY: " + reason);
        
        // Добавление в список активных
        activeEmergencies.push_back({
            type, millis(), reason, false
        });
        
        // Применение аварийных действий
        applyEmergencyActions(type);
        
        // Переход в аварийное состояние
        if (!emergencyModeActive) {
            emergencyModeActive = true;
            stateMachine.transition(CoreState::EMERGENCY);
        }
        
        // Попытка уведомления облака
        tryNotifyCloud(type, reason);
    }
    
    void applyEmergencyActions(EmergencyType type) {
        // Загрузка preset из конфигурации
        auto preset = config.getEmergencyPreset();
        
        // Применение конфигурации клапанов
        for (auto& valve : preset.valves) {
            valveController.setValveState(valve.id, valve.state);
        }
        
        // Остановка насосов
        for (auto& pump : preset.pumps) {
            pumpController.setPumpFrequency(pump.id, 0);
        }
        
        // Управление питанием
        powerController.applyEmergencyPower(preset.power);
        
        // Выполнение дополнительных действий
        executeEmergencySequence(preset.actions);
    }
};
```

## 9.2 Heartbeat механизм

### 9.2.1 Формат heartbeat

> "Периодически стенд, находясь вне режима диагностики, а просто когда он включен, он должен отсылать так называемое свое состояние"

```json
{
  "type": "heartbeat",
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "device": "core",
  "timestamp": 1695805200000,
  "sequence": 12345,
  "status": {
    "state": "IDLE",
    "online": true,
    "message": "все хорошо"
  },
  "modules": {
    "core": {
      "status": "ok",
      "uptime": 3600
    },
    "terminal": {
      "status": "ok",
      "last_seen": 1695805195000
    },
    "display": {
      "status": "ok",
      "last_seen": 1695805198000
    }
  },
  "vitals": {
    "cpu_temp": 42.5,
    "free_heap": 145632,
    "uptime_sec": 3600,
    "wifi_rssi": -52,
    "ethernet_link": true,
    "voltage_24v": 23.8
  },
  "sensors": {
    "pressure_main": 0.0,
    "temperature": 23.5,
    "flow_rate": 0.0
  },
  "alarms": [],
  "statistics": {
    "commands_executed": 45,
    "errors_count": 0,
    "last_command": "step-11-measure",
    "retries_today": 3
  }
}
```

### 9.2.2 Heartbeat Manager

```cpp
class HeartbeatManager {
private:
    unsigned long lastHeartbeat = 0;
    unsigned long heartbeatInterval = 5000; // 5 секунд по умолчанию
    unsigned long sequenceNumber = 0;
    unsigned long missedAcks = 0;
    const unsigned long MAX_MISSED_ACKS = 6;
    
public:
    void init(unsigned long interval) {
        heartbeatInterval = interval;
        lastHeartbeat = millis();
    }
    
    void process() {
        if (millis() - lastHeartbeat >= heartbeatInterval) {
            sendHeartbeat();
            lastHeartbeat = millis();
        }
    }
    
    void sendHeartbeat() {
        sequenceNumber++;
        
        JsonDocument hb;
        hb["type"] = "heartbeat";
        hb["stand_token"] = STAND_TOKEN;
        hb["device"] = "core";
        hb["timestamp"] = getTimestamp();
        hb["sequence"] = sequenceNumber;
        
        // Состояние
        JsonObject status = hb.createNestedObject("status");
        status["state"] = stateToString(stateMachine.getCurrentState());
        status["online"] = true;
        status["message"] = getStatusMessage();
        
        // Модули
        JsonObject modules = hb.createNestedObject("modules");
        addModuleStatus(modules);
        
        // Витальные показатели
        JsonObject vitals = hb.createNestedObject("vitals");
        addVitals(vitals);
        
        // Текущие значения датчиков
        JsonObject sensors = hb.createNestedObject("sensors");
        addSensorValues(sensors);
        
        // Активные алармы
        JsonArray alarms = hb.createNestedArray("alarms");
        addActiveAlarms(alarms);
        
        // Статистика
        JsonObject stats = hb.createNestedObject("statistics");
        addStatistics(stats);
        
        // Отправка
        if (wsClient.send(hb)) {
            lastSuccessfulSend = millis();
        } else {
            handleSendFailure();
        }
    }
    
    void handleHeartbeatAck(unsigned long ackSequence) {
        if (ackSequence == sequenceNumber) {
            missedAcks = 0;
            connectionHealthy = true;
        }
    }
    
    void handleSendFailure() {
        missedAcks++;
        
        if (missedAcks >= MAX_MISSED_ACKS) {
            // Потеря связи подтверждена
            emergencyHandler.triggerEmergency(
                EmergencyType::CONNECTION_LOST,
                "No heartbeat ACK for " + String(missedAcks) + " attempts"
            );
        }
    }
    
    String getStatusMessage() {
        if (stateMachine.getCurrentState() == CoreState::IDLE) {
            return "я стенд такой-то, идентификатор такой-то, нахожусь в онлайне, у меня все хорошо";
        } else if (stateMachine.getCurrentState() == CoreState::EXECUTING) {
            return "выполняю команду " + currentCommandId;
        } else if (stateMachine.getCurrentState() == CoreState::EMERGENCY) {
            return "аварийный режим: " + emergencyReason;
        }
        return "состояние: " + stateToString(stateMachine.getCurrentState());
    }
};
```

### 9.2.3 Обработка heartbeat в облаке

```python
# Cloud-side heartbeat handler
class HeartbeatProcessor:
    def __init__(self):
        self.stand_states = {}
        self.alert_manager = AlertManager()
        
    def process_heartbeat(self, hb):
        stand_token = hb['stand_token']
        
        # Обновление состояния стенда
        self.stand_states[stand_token] = {
            'last_seen': datetime.now(),
            'state': hb['status']['state'],
            'modules': hb['modules'],
            'vitals': hb['vitals'],
            'sensors': hb['sensors'],
            'alarms': hb['alarms']
        }
        
        # Проверка аномалий
        self.check_anomalies(stand_token, hb)
        
        # Отправка ACK
        self.send_ack(stand_token, hb['sequence'])
        
        # Обновление дашборда
        self.update_dashboard(stand_token, hb)
        
    def check_anomalies(self, stand_token, hb):
        # Проверка модулей
        for module, status in hb['modules'].items():
            if status['status'] != 'ok':
                self.alert_manager.create_alert(
                    f"Module {module} is {status['status']}",
                    stand_token,
                    severity='warning'
                )
        
        # Проверка витальных показателей
        vitals = hb['vitals']
        if vitals['cpu_temp'] > 70:
            self.alert_manager.create_alert(
                f"High CPU temperature: {vitals['cpu_temp']}°C",
                stand_token,
                severity='warning'
            )
        
        if vitals['free_heap'] < 10000:
            self.alert_manager.create_alert(
                f"Low memory: {vitals['free_heap']} bytes",
                stand_token,
                severity='critical'
            )
        
        # Проверка алармов
        if hb['alarms']:
            for alarm in hb['alarms']:
                self.alert_manager.create_alert(
                    f"Stand alarm: {alarm}",
                    stand_token,
                    severity='high'
                )
```

## 9.3 Обработка потери связи

### 9.3.1 На стороне Core

```cpp
class ConnectionMonitor {
private:
    unsigned long lastCloudContact = 0;
    unsigned long connectionTimeout = 30000; // 30 секунд
    bool connectionLost = false;
    bool offlineMode = false;
    unsigned long reconnectAttempts = 0;
    
public:
    void updateLastContact() {
        lastCloudContact = millis();
        
        if (connectionLost) {
            // Связь восстановлена
            handleConnectionRestored();
        }
    }
    
    void checkConnection() {
        unsigned long timeSinceContact = millis() - lastCloudContact;
        
        if (timeSinceContact > connectionTimeout && !connectionLost) {
            // Обнаружена потеря связи
            handleConnectionLost();
        }
    }
    
    void handleConnectionLost() {
        connectionLost = true;
        
        logError("Connection lost to cloud");
        
        // Переход в offline режим
        enterOfflineMode();
        
        // Применение аварийной конфигурации
        applyEmergencyPreset();
        
        // Запуск процесса переподключения
        startReconnectionProcess();
        
        // Уведомление локальных модулей
        notifyLocalModules("CONNECTION_LOST");
        
        // Локальное логирование
        startLocalLogging();
    }
    
    void enterOfflineMode() {
        offlineMode = true;
        
        // Сохранение текущего состояния
        saveCurrentState();
        
        // Переключение на локальное хранение
        dataLogger.switchToLocal();
        
        // Показ предупреждения на Display
        displayController.showWarning("OFFLINE MODE");
    }
    
    void applyEmergencyPreset() {
        // Загрузка аварийной конфигурации
        auto emergencyConfig = config.getEmergencyConfig();
        
        // Применение безопасных состояний
        for (auto& valve : emergencyConfig.valves) {
            valveController.setValveState(valve.id, valve.safe_state);
        }
        
        // Остановка активных процессов
        stopAllActiveProcesses();
        
        // Включение аварийной сигнализации
        alarmController.activate();
    }
    
    void handleConnectionRestored() {
        connectionLost = false;
        offlineMode = false;
        reconnectAttempts = 0;
        
        logInfo("Connection restored");
        
        // Синхронизация накопленных данных
        syncOfflineData();
        
        // Загрузка обновленной конфигурации
        reloadConfiguration();
        
        // Восстановление нормального режима
        exitOfflineMode();
    }
};
```

### 9.3.2 Стратегия переподключения

```cpp
class ReconnectionStrategy {
private:
    unsigned long reconnectDelays[5] = {5000, 10000, 30000, 60000, 300000};
    size_t currentDelayIndex = 0;
    unsigned long lastAttempt = 0;
    bool reconnecting = false;
    
public:
    void startReconnection() {
        reconnecting = true;
        currentDelayIndex = 0;
        scheduleNextAttempt();
    }
    
    void scheduleNextAttempt() {
        if (!reconnecting) return;
        
        unsigned long delay = getNextDelay();
        
        timer.once_ms(delay, [this]() {
            attemptReconnection();
        });
    }
    
    unsigned long getNextDelay() {
        if (currentDelayIndex >= 5) {
            currentDelayIndex = 4; // Остаемся на максимальной задержке
        }
        
        return reconnectDelays[currentDelayIndex++];
    }
    
    void attemptReconnection() {
        lastAttempt = millis();
        
        logInfo("Reconnection attempt #" + String(currentDelayIndex));
        
        // Попытка подключения к WiFi
        if (!WiFi.isConnected()) {
            if (!reconnectWiFi()) {
                scheduleNextAttempt();
                return;
            }
        }
        
        // Попытка подключения WebSocket
        if (wsClient.connect(WS_HOST, WS_PORT, WS_PATH)) {
            // Успешное подключение
            handleReconnectionSuccess();
        } else {
            // Неудача - планируем следующую попытку
            scheduleNextAttempt();
        }
    }
    
    void handleReconnectionSuccess() {
        reconnecting = false;
        currentDelayIndex = 0;
        
        // Регистрация устройства
        registerDevice();
        
        // Синхронизация данных
        syncOfflineData();
        
        // Уведомление о восстановлении
        sendRecoveryNotification();
    }
};
```

## 9.4 Локальное логирование

### 9.4.1 Структура локальных логов

```cpp
struct LogEntry {
    uint32_t timestamp;
    LogLevel level;
    char source[16];
    char message[128];
    float sensorValues[8];
    uint8_t checksum;
};

class LocalLogger {
private:
    static const size_t MAX_LOG_SIZE = 10000;
    CircularBuffer<LogEntry, MAX_LOG_SIZE> buffer;
    File logFile;
    bool sdCardAvailable = false;
    
public:
    void init() {
        // Инициализация SPIFFS
        if (!SPIFFS.begin(true)) {
            Serial.println("SPIFFS Mount Failed");
        }
        
        // Проверка SD карты
        if (SD.begin(SD_CS_PIN)) {
            sdCardAvailable = true;
        }
    }
    
    void log(LogLevel level, const String& source, const String& message) {
        LogEntry entry;
        entry.timestamp = millis();
        entry.level = level;
        strncpy(entry.source, source.c_str(), 15);
        strncpy(entry.message, message.c_str(), 127);
        
        // Снимок критических датчиков
        entry.sensorValues[0] = readSensor("pressure_main");
        entry.sensorValues[1] = readSensor("temperature");
        entry.sensorValues[2] = readSensor("flow_rate");
        
        // Контрольная сумма
        entry.checksum = calculateChecksum(entry);
        
        // Добавление в буфер
        buffer.push(entry);
        
        // При критических событиях - сброс на диск
        if (level >= LogLevel::ERROR) {
            flushToDisk();
        }
    }
    
    void flushToDisk() {
        String filename = "/logs/" + String(millis() / 86400000) + ".log";
        
        if (sdCardAvailable) {
            logFile = SD.open(filename, FILE_APPEND);
        } else {
            logFile = SPIFFS.open(filename, FILE_APPEND);
        }
        
        if (!logFile) {
            Serial.println("Failed to open log file");
            return;
        }
        
        while (!buffer.isEmpty()) {
            LogEntry entry = buffer.shift();
            logFile.write((uint8_t*)&entry, sizeof(LogEntry));
        }
        
        logFile.close();
    }
    
    std::vector<LogEntry> getLogsForSync() {
        std::vector<LogEntry> logs;
        
        // Чтение из файлов
        File root = SPIFFS.open("/logs");
        File file = root.openNextFile();
        
        while (file) {
            while (file.available() >= sizeof(LogEntry)) {
                LogEntry entry;
                file.read((uint8_t*)&entry, sizeof(LogEntry));
                
                // Проверка контрольной суммы
                if (validateChecksum(entry)) {
                    logs.push_back(entry);
                }
            }
            file = root.openNextFile();
        }
        
        return logs;
    }
};
```

### 9.4.2 Синхронизация при восстановлении

```python
# Cloud-side offline data sync
class OfflineDataSync:
    def __init__(self):
        self.db = Database()
        
    def process_offline_logs(self, stand_token, logs):
        """Обработка логов, накопленных в offline режиме"""
        
        # Сортировка по времени
        logs.sort(key=lambda x: x['timestamp'])
        
        # Анализ периода offline
        offline_start = logs[0]['timestamp']
        offline_end = logs[-1]['timestamp']
        duration = offline_end - offline_start
        
        # Сохранение в БД с пометкой
        for log_entry in logs:
            self.db.insert_log({
                'stand_token': stand_token,
                'timestamp': log_entry['timestamp'],
                'level': log_entry['level'],
                'source': log_entry['source'],
                'message': log_entry['message'],
                'sensor_snapshot': log_entry['sensor_values'],
                'offline_mode': True,
                'sync_time': datetime.now()
            })
        
        # Анализ критических событий
        critical_events = [
            log for log in logs 
            if log['level'] in ['ERROR', 'CRITICAL']
        ]
        
        if critical_events:
            self.create_incident_report(stand_token, critical_events)
        
        # Статистика offline периода
        return {
            'duration_ms': duration,
            'total_logs': len(logs),
            'critical_events': len(critical_events),
            'data_integrity': self.verify_data_integrity(logs)
        }
    
    def verify_data_integrity(self, logs):
        """Проверка целостности данных offline периода"""
        
        # Проверка последовательности timestamp
        timestamps = [log['timestamp'] for log in logs]
        is_sequential = all(
            timestamps[i] <= timestamps[i+1] 
            for i in range(len(timestamps)-1)
        )
        
        # Проверка контрольных сумм
        checksum_valid = all(
            self.validate_checksum(log) for log in logs
        )
        
        # Проверка разумности значений датчиков
        sensor_values_valid = all(
            self.validate_sensor_values(log['sensor_values']) 
            for log in logs
        )
        
        return {
            'sequential': is_sequential,
            'checksums_valid': checksum_valid,
            'sensor_values_valid': sensor_values_valid,
            'integrity_score': sum([
                is_sequential, 
                checksum_valid, 
                sensor_values_valid
            ]) / 3.0
        }
```

## 9.5 Каскадные отказы и восстановление

### 9.5.1 Иерархия отказов

```
Cloud Connection Lost (L1)
    ├── Terminal Disconnected (L2)
    │   └── BT Devices Unavailable (L3)
    ├── Display Disconnected (L2)
    │   └── UI Not Updated (L3)
    └── Modbus Timeout (L2)
        ├── Sensors Unavailable (L3)
        └── Actuators Uncontrolled (L3)
```

### 9.5.2 Обработка каскадных отказов

```cpp
class CascadeFailureHandler {
private:
    struct FailureNode {
        String id;
        FailureLevel level;
        std::vector<String> dependencies;
        bool failed;
        unsigned long failTime;
        RecoveryAction action;
    };
    
    std::map<String, FailureNode> failureTree;
    
public:
    void detectCascade(const String& failedComponent) {
        auto& node = failureTree[failedComponent];
        node.failed = true;
        node.failTime = millis();
        
        // Проверка зависимых компонентов
        for (auto& [id, component] : failureTree) {
            if (std::find(component.dependencies.begin(), 
                         component.dependencies.end(), 
                         failedComponent) != component.dependencies.end()) {
                // Найдена зависимость
                markAsDegraded(id);
            }
        }
        
        // Определение уровня критичности
        auto severity = calculateSeverity();
        
        // Применение соответствующих мер
        applyMitigationMeasures(severity);
    }
    
    CascadeSeverity calculateSeverity() {
        int failedL1 = 0, failedL2 = 0, failedL3 = 0;
        
        for (auto& [id, node] : failureTree) {
            if (node.failed) {
                switch (node.level) {
                    case L1: failedL1++; break;
                    case L2: failedL2++; break;
                    case L3: failedL3++; break;
                }
            }
        }
        
        if (failedL1 > 0) return CRITICAL;
        if (failedL2 > 1) return HIGH;
        if (failedL3 > 2) return MEDIUM;
        return LOW;
    }
    
    void applyMitigationMeasures(CascadeSeverity severity) {
        switch (severity) {
            case CRITICAL:
                // Полная остановка и переход в безопасный режим
                enterSafeMode();
                notifyOperator("CRITICAL FAILURE CASCADE");
                break;
                
            case HIGH:
                // Частичное ограничение функциональности
                disableNonCriticalFeatures();
                increaseMonitoringFrequency();
                break;
                
            case MEDIUM:
                // Переключение на резервные системы
                switchToBackupSystems();
                break;
                
            case LOW:
                // Только логирование и мониторинг
                logWarning("Minor cascade detected");
                break;
        }
    }
};
```

### 9.5.3 Процесс восстановления

```cpp
class RecoveryManager {
private:
    enum RecoveryPhase {
        ASSESSMENT,
        HARDWARE_CHECK,
        NETWORK_RESTORE,
        CONFIG_RELOAD,
        STATE_SYNC,
        VALIDATION,
        OPERATIONAL
    };
    
    RecoveryPhase currentPhase = ASSESSMENT;
    
public:
    void startRecovery() {
        logInfo("Starting recovery sequence");
        currentPhase = ASSESSMENT;
        executeRecoveryPhase();
    }
    
    void executeRecoveryPhase() {
        switch (currentPhase) {
            case ASSESSMENT:
                assessSystemState();
                break;
                
            case HARDWARE_CHECK:
                checkHardware();
                break;
                
            case NETWORK_RESTORE:
                restoreNetworkConnections();
                break;
                
            case CONFIG_RELOAD:
                reloadConfiguration();
                break;
                
            case STATE_SYNC:
                synchronizeState();
                break;
                
            case VALIDATION:
                validateSystemIntegrity();
                break;
                
            case OPERATIONAL:
                resumeNormalOperation();
                break;
        }
    }
    
    void assessSystemState() {
        SystemStatus status;
        
        // Проверка основных компонентов
        status.core = checkCore();
        status.terminal = checkTerminal();
        status.display = checkDisplay();
        status.network = checkNetwork();
        status.hardware = checkHardware();
        
        // Определение возможности восстановления
        if (status.core == FAILED) {
            // Критическая ошибка - невозможно восстановить
            enterMaintenanceMode();
            return;
        }
        
        // Переход к проверке оборудования
        currentPhase = HARDWARE_CHECK;
        executeRecoveryPhase();
    }
    
    void checkHardware() {
        bool allOk = true;
        
        // Проверка клапанов
        for (auto& valve : config.valves) {
            if (!testValve(valve.id)) {
                logError("Valve " + valve.id + " failed test");
                allOk = false;
            }
        }
        
        // Проверка датчиков
        for (auto