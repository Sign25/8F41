# Раздел 3. Конфигуратор стенда

## 3.1 Роль конфигуратора

### 3.1.1 Определение

> "Нулевой шаг – это конфигуратор"

Конфигуратор - это JSON-документ, хранящийся в облаке, который полностью описывает:
- Физическую конфигурацию стенда
- Подключенные устройства и их адреса
- Аварийные режимы и безопасные состояния
- Параметры связи и протоколы
- Калибровочные коэффициенты

### 3.1.2 Принцип работы

> "При включении стенда первым делом ядро Core определяет, есть ли у неё интернет-соединение. Зная свой уникальный токен, она лезет в облако и скачивает этот конфигуратор"

## 3.2 Хранение и управление

### 3.2.1 Облачное хранение

> "В базе данных хранится конфигурация всего стенда, управляется и визуализируется на веб-сайте с помощью некой таблицы"

- **БД**: PostgreSQL/MongoDB для хранения JSON
- **Версионирование**: Каждое изменение сохраняется с timestamp
- **Web-интерфейс**: Таблица для редактирования конфигурации
- **API endpoint**: `GET /api/stands/{stand_token}/config`

### 3.2.2 Локальное применение

> "Он скачивает конфигуратор и начинает его себе в память складывать. Он находится в ядре"

```cpp
// Core загружает и хранит конфигурацию
class ConfigurationManager {
    JsonDocument config;
    
    bool loadFromCloud(String stand_token) {
        String url = "https://octa.cloud/api/stands/" + stand_token + "/config";
        String json = http_get(url);
        deserializeJson(config, json);
        return validateConfig(config);
    }
};
```

## 3.3 Структура конфигуратора

### 3.3.1 Основные секции

```json
{
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "metadata": {
    "version": "1.0.0",
    "created": "2024-01-01T00:00:00Z",
    "stand_name": "Гидравлический стенд №1",
    "location": "Цех 3"
  },
  "network": {
    "wifi": {
      "ssid": "OCTA_NET",
      "password": "encrypted"
    },
    "ethernet": {
      "dhcp": true,
      "static_ip": "192.168.1.100"
    },
    "websocket": {
      "server": "wss://octa.cloud",
      "heartbeat_interval": 5000,
      "reconnect_delay": 5000
    }
  },
  "hardware": {},
  "emergency": {},
  "devices": {},
  "calibration": {}
}
```

### 3.3.2 Секция hardware (оборудование)

```json
{
  "hardware": {
    "valves": [
      {
        "id": "valve_inlet",
        "name": "Входной клапан",
        "type": "solenoid",
        "pin": 12,
        "normal_state": "closed",
        "control": "digital"
      },
      {
        "id": "valve_outlet",
        "name": "Выходной клапан",
        "type": "solenoid",
        "pin": 13,
        "normal_state": "open",
        "control": "digital"
      },
      {
        "id": "valve_relief",
        "name": "Предохранительный клапан",
        "type": "proportional",
        "pin": 25,
        "normal_state": "closed",
        "control": "pwm"
      }
    ],
    "sensors": [
      {
        "id": "pressure_main",
        "name": "Основное давление",
        "type": "analog",
        "pin": 34,
        "units": "bar",
        "range": [0, 100],
        "calibration": {
          "offset": 0.0,
          "scale": 1.0
        }
      },
      {
        "id": "temperature",
        "name": "Температура",
        "type": "i2c",
        "address": "0x76",
        "units": "celsius"
      }
    ],
    "pumps": [
      {
        "id": "pump_main",
        "name": "Основной насос",
        "type": "frequency_drive",
        "modbus_address": 1,
        "max_frequency": 50
      }
    ],
    "power_blocks": [
      {
        "id": "power_24v",
        "name": "Блок питания 24В",
        "pin": 32,
        "type": "relay"
      },
      {
        "id": "power_instruments",
        "name": "Питание приборов",
        "pin": 33,
        "type": "relay"
      }
    ]
  }
}
```

### 3.3.3 Секция emergency (аварийный режим)

> "Если пропадает связь, то стенд должен прийти в определенное аварийное состояние, которое также должно быть прописано в конфигураторе"

```json
{
  "emergency": {
    "trigger_conditions": {
      "connection_timeout_ms": 30000,
      "heartbeat_missed_count": 6
    },
    "actions": [
      {
        "type": "valve_control",
        "description": "Закрыть входные клапаны",
        "valves": [
          {"id": "valve_inlet", "state": "closed"},
          {"id": "valve_outlet", "state": "open"},
          {"id": "valve_relief", "state": "open"}
        ]
      },
      {
        "type": "pressure_release",
        "description": "Сбросить давление",
        "method": "open_relief_valve",
        "duration_ms": 5000
      },
      {
        "type": "power_control",
        "description": "Отключить питание",
        "blocks": [
          {"id": "power_24v", "state": "off"},
          {"id": "power_instruments", "state": "off"}
        ]
      },
      {
        "type": "pump_control",
        "description": "Остановить насосы",
        "pumps": [
          {"id": "pump_main", "frequency": 0}
        ]
      }
    ],
    "notification": {
      "local_alarm": true,
      "led_pattern": "fast_blink_red",
      "buzzer": true
    }
  }
}
```

### 3.3.4 Секция devices (периферийные устройства)

```json
{
  "devices": {
    "bluetooth": [
      {
        "id": "caliper_01",
        "name": "Штангенциркуль Mitutoyo",
        "type": "caliper",
        "mac": "AA:BB:CC:DD:EE:FF",
        "units": "mm",
        "precision": 0.01
      }
    ],
    "modbus": [
      {
        "id": "frequency_drive",
        "name": "Частотный преобразователь",
        "address": 1,
        "baud_rate": 9600,
        "registers": {
          "frequency_set": 40001,
          "frequency_read": 30001,
          "status": 30002
        }
      }
    ],
    "rfid": {
      "frequency": "125kHz",
      "pin": 5,
      "type": "EM4100"
    },
    "buttons": {
      "accept": {
        "pin": 18,
        "pull_up": true,
        "debounce_ms": 50,
        "min_press_duration": 100
      },
      "retry": {
        "pin": 19,
        "pull_up": true,
        "debounce_ms": 50,
        "min_press_duration": 100
      }
    }
  }
}
```

### 3.3.5 Секция calibration (калибровки)

```json
{
  "calibration": {
    "sensors": {
      "pressure_main": {
        "points": [
          {"raw": 0, "real": 0.0},
          {"raw": 4095, "real": 100.0}
        ],
        "last_calibrated": "2024-01-15",
        "next_calibration": "2024-07-15"
      }
    },
    "valves": {
      "valve_proportional": {
        "pwm_curve": [
          {"pwm": 0, "opening": 0},
          {"pwm": 128, "opening": 50},
          {"pwm": 255, "opening": 100}
        ]
      }
    }
  }
}
```

## 3.4 Загрузка и валидация

### 3.4.1 Алгоритм загрузки

```cpp
// Pseudocode на C++ для Core
class Core {
    void loadConfiguration() {
        // 1. Проверка интернета
        if (!hasInternet()) {
            useLastKnownConfig();
            enterOfflineMode();
            return;
        }
        
        // 2. Формирование URL
        String url = String("https://octa.cloud/api/stands/") 
                   + stand_token 
                   + "/config";
        
        // 3. HTTP запрос
        HTTPClient http;
        http.begin(url);
        int httpCode = http.GET();
        
        // 4. Проверка ответа
        if (httpCode == 200) {
            String payload = http.getString();
            
            // 5. Парсинг JSON
            DynamicJsonDocument doc(16384);
            deserializeJson(doc, payload);
            
            // 6. Валидация
            if (validateConfiguration(doc)) {
                applyConfiguration(doc);
                saveToSPIFFS(doc);  // Сохранение локальной копии
            }
        }
    }
}
```

### 3.4.2 Валидация конфигурации

```cpp
bool validateConfiguration(JsonDocument& config) {
    // Проверка обязательных полей
    if (!config.containsKey("stand_token")) return false;
    if (!config.containsKey("hardware")) return false;
    if (!config.containsKey("emergency")) return false;
    
    // Проверка версии
    String version = config["metadata"]["version"];
    if (!isVersionCompatible(version)) return false;
    
    // Проверка целостности
    if (!checkConfigIntegrity(config)) return false;
    
    return true;
}
```

## 3.5 Применение конфигурации

### 3.5.1 Инициализация оборудования

```cpp
void applyHardwareConfig(JsonObject& hardware) {
    // Настройка клапанов
    JsonArray valves = hardware["valves"];
    for (JsonObject valve : valves) {
        int pin = valve["pin"];
        pinMode(pin, OUTPUT);
        String state = valve["normal_state"];
        digitalWrite(pin, state == "closed" ? LOW : HIGH);
    }
    
    // Настройка датчиков
    JsonArray sensors = hardware["sensors"];
    for (JsonObject sensor : sensors) {
        if (sensor["type"] == "analog") {
            // Аналоговые входы уже настроены
        } else if (sensor["type"] == "i2c") {
            Wire.begin();
            // Инициализация I2C устройства
        }
    }
    
    // Настройка кнопок
    pinMode(config["devices"]["buttons"]["accept"]["pin"], INPUT_PULLUP);
    pinMode(config["devices"]["buttons"]["retry"]["pin"], INPUT_PULLUP);
}
```

### 3.5.2 Настройка аварийных режимов

```cpp
void setupEmergencyMode(JsonObject& emergency) {
    // Сохранение действий аварийного режима
    emergency_actions = emergency["actions"];
    
    // Настройка таймеров
    connection_timeout = emergency["trigger_conditions"]["connection_timeout_ms"];
    heartbeat_max_missed = emergency["trigger_conditions"]["heartbeat_missed_count"];
    
    // Подготовка уведомлений
    if (emergency["notification"]["local_alarm"]) {
        pinMode(LED_PIN, OUTPUT);
        pinMode(BUZZER_PIN, OUTPUT);
    }
}
```

## 3.6 Обновление конфигурации

### 3.6.1 Hot-reload (горячая перезагрузка)

Некоторые параметры можно обновить без перезагрузки:
- Калибровочные коэффициенты
- Пороги срабатывания
- Интервалы heartbeat

### 3.6.2 Cold-reload (требует перезагрузки)

Изменения, требующие перезагрузки:
- Назначение пинов
- Сетевые настройки
- Добавление/удаление устройств

## 3.7 Локальное кэширование

### 3.7.1 Сохранение в SPIFFS

```cpp
void saveConfigToSPIFFS(JsonDocument& config) {
    File file = SPIFFS.open("/config.json", "w");
    if (file) {
        serializeJson(config, file);
        file.close();
        Serial.println("Config saved to SPIFFS");
    }
}
```

### 3.7.2 Загрузка при отсутствии связи

```cpp
void loadConfigFromSPIFFS() {
    if (SPIFFS.exists("/config.json")) {
        File file = SPIFFS.open("/config.json", "r");
        DynamicJsonDocument config(16384);
        deserializeJson(config, file);
        file.close();
        applyConfiguration(config);
        Serial.println("Loaded cached config");
    }
}
```

## 3.8 Визуализация на веб-сайте

### 3.8.1 Табличное представление

> "управляется и визуализируется на веб-сайте с помощью некой таблицы"

| Параметр | Значение | Тип | Действие |
|----------|----------|-----|----------|
| valve_inlet.pin | 12 | Number | [Edit] |
| valve_inlet.normal_state | closed | Select | [Edit] |
| pressure_main.range | 0-100 | Range | [Edit] |
| emergency.pressure_release | true | Checkbox | [Edit] |

### 3.8.2 JSON редактор

```javascript
// Web-интерфейс для редактирования
const configEditor = new JSONEditor(container, {
    schema: configSchema,
    theme: 'bootstrap4',
    disable_edit_json: false,
    disable_properties: false
});

// Сохранение изменений
function saveConfig() {
    const config = configEditor.getValue();
    fetch(`/api/stands/${stand_token}/config`, {
        method: 'PUT',
        body: JSON.stringify(config)
    });
}
```

## 3.9 Версионирование

### 3.9.1 Схема версий

```json
{
  "metadata": {
    "version": "1.2.3",  // major.minor.patch
    "compatibility": ">=1.0.0",
    "changelog": [
      {
        "version": "1.2.3",
        "date": "2024-01-20",
        "changes": ["Added new valve", "Fixed calibration"]
      }
    ]
  }
}
```

### 3.9.2 Откат версии

При ошибке применения новой конфигурации:
1. Сохранение текущей рабочей версии
2. Попытка применить новую
3. При ошибке - автоматический откат
4. Уведомление в облако об ошибке

---

*Конец Раздела 3*