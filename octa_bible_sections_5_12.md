# Раздел 6. Terminal (HMI) - Bluetooth, фото, retry, хранение данных

## 6.1 Архитектура Terminal

Terminal (HMI) - это планшет или промышленная панель с Android/Linux, выполняющая следующие функции:
- Сбор данных с Bluetooth измерительных приборов
- Фотофиксация результатов
- Ввод данных оператором через формы
- Локальное хранение промежуточных результатов
- Управление повторами измерений

## 6.2 Bluetooth интеграция

### 6.2.1 Поддерживаемые устройства

| Устройство | Протокол | UUID Service | Формат данных |
|------------|----------|--------------|---------------|
| Штангенциркуль | BLE | 0xFFE0 | Float32, мм |
| Микрометр | BLE | 0xFFE0 | Float32, мкм |
| Толщиномер | Classic | SPP | ASCII string |
| Весы | BLE | 0x181D | Float32, кг |

### 6.2.2 Протокол bt_telemetry

Terminal отправляет телеметрию в облако:

```json
{
  "type": "bt_telemetry",
  "device_token": "550e8400-Terminal",
  "ts": 1732600005123,
  "source": {
    "bt_id": "BT:12:34:56:78:9A:BC",
    "channel": "caliper_length",
    "units": "mm"
  },
  "payload": {
    "value": 123.46,
    "raw": "0x42F6EB85"
  },
  "meta": {
    "quality": "ok",
    "battery_pct": 82,
    "rssi": -62
  }
}
```

## 6.3 Фотофиксация

### 6.3.1 Требования к фото

- Разрешение: минимум 1920x1080
- Формат: JPEG с качеством 85%
- Метаданные: timestamp, GPS (опционально), command_id
- Максимальный размер: 5 МБ
- Автофокус и вспышка: автоматически

### 6.3.2 Процесс фотофиксации

```python
# Pseudocode: photo_capture
def handle_photo_request(params):
    photos = []
    while len(photos) < params.min_photos:
        photo = capture_photo()
        
        # Показать превью
        show_preview(photo)
        
        # Ожидание подтверждения
        action = wait_user_action()
        if action == "accept":
            photos.append(photo)
            upload_photo(photo)
        elif action == "retake":
            continue
        elif action == "cancel":
            return error("PHOTO_CANCELLED")
    
    return {
        "photos": photos,
        "count": len(photos)
    }
```

## 6.4 Формы ввода данных

### 6.4.1 Типы полей

```json
{
  "form": {
    "title": "Результаты измерений",
    "fields": [
      {
        "id": "length",
        "type": "number",
        "label": "Длина, мм",
        "required": true,
        "min": 0,
        "max": 1000,
        "digits": 2,
        "bt_channel": "caliper_length"
      },
      {
        "id": "visual_check",
        "type": "select",
        "label": "Визуальный контроль",
        "options": ["Норма", "Дефект", "Требует проверки"],
        "required": true
      },
      {
        "id": "notes",
        "type": "text",
        "label": "Примечания",
        "max_length": 500,
        "required": false
      }
    ]
  }
}
```

## 6.5 Механизм retry

### 6.5.1 Локальный retry на Terminal

Terminal может инициировать локальный retry без участия облака:

```json
{
  "on_retry": {
    "reset_fields": ["caliper_length", "weight"],
    "keep_fields": ["visual_check"],
    "clear_photos": true,
    "notify_core": true
  }
}
```

### 6.5.2 Обработка retry

```python
def handle_retry():
    # Сброс указанных полей
    for field_id in config.reset_fields:
        form.clear_field(field_id)
    
    # Очистка фото если требуется
    if config.clear_photos:
        photo_buffer.clear()
    
    # Уведомление Core
    if config.notify_core:
        send_to_core({"event": "terminal_retry"})
    
    # Перезапуск BT-сбора
    restart_bt_collection()
```

## 6.6 Локальное хранение данных

Terminal использует SQLite для хранения:
- Промежуточных результатов измерений
- Фото до их загрузки
- Истории BT-телеметрии
- Кэша форм при потере связи

### 6.6.1 Схема БД

```sql
CREATE TABLE measurements (
    id INTEGER PRIMARY KEY,
    command_id TEXT,
    field_id TEXT,
    value TEXT,
    timestamp INTEGER,
    synced BOOLEAN DEFAULT FALSE
);

CREATE TABLE photos (
    id INTEGER PRIMARY KEY,
    command_id TEXT,
    path TEXT,
    size INTEGER,
    timestamp INTEGER,
    uploaded BOOLEAN DEFAULT FALSE
);

CREATE TABLE bt_history (
    id INTEGER PRIMARY KEY,
    bt_id TEXT,
    channel TEXT,
    value REAL,
    timestamp INTEGER,
    command_id TEXT
);
```

---

# Раздел 7. Display (TV) - живое отображение, итоги

## 7.1 Назначение Display

Display - это телевизор или монитор для отображения:
- Инструкций и подсказок оператору
- Живых данных с датчиков (live bindings)
- Графиков и диаграмм
- Результатов измерений (summary)
- Изображений и схем
- Предупреждений и статусов

## 7.2 Layouts (макеты отображения)

### 7.2.1 Типы макетов

| Layout | Описание | Элементы |
|--------|----------|----------|
| welcome | Приветствие | Логотип, время, инструкция |
| measurement | Измерение | График, текущие значения, целевые |
| instruction | Инструкция | Изображение, текст, чек-лист |
| summary | Итоги | Таблица результатов, статус |
| warning | Предупреждение | Иконка, сообщение, действия |
| diagnostic | Диагностика | Мнемосхема, live-данные |

### 7.2.2 Пример layout команды

```json
{
  "device": "display",
  "payload": {
    "layout": "diagnostic",
    "title": "Испытание давлением",
    "sections": {
      "main": {
        "type": "gauge",
        "binding": "core.live.pressure_main",
        "min": 0,
        "max": 100,
        "units": "bar",
        "zones": [
          {"from": 0, "to": 30, "color": "green"},
          {"from": 30, "to": 85, "color": "yellow"},
          {"from": 85, "to": 100, "color": "red"}
        ]
      },
      "chart": {
        "type": "line",
        "bindings": ["core.live.pressure_main"],
        "duration_sec": 60,
        "update_hz": 10
      },
      "info": {
        "type": "list",
        "items": [
          {"label": "Целевое давление", "value": "45 bar"},
          {"label": "Время испытания", "binding": "elapsed_time"}
        ]
      }
    }
  }
}
```

## 7.3 Live Bindings (живые привязки)

### 7.3.1 Источники данных

Bindings могут ссылаться на:
- `core.live.<sensor_id>` - живые данные с датчиков Core
- `terminal.bt.<channel>` - данные Bluetooth приборов
- `result.<field>` - результаты измерений
- `system.<param>` - системные параметры
- `elapsed_time` - время с начала шага

### 7.3.2 Обновление live данных

Display подписывается на поток телеметрии:

```json
{
  "type": "telemetry_stream",
  "device": "display",
  "subscribe": [
    "core.live.pressure_main",
    "core.live.temperature",
    "terminal.bt.caliper_length"
  ],
  "update_rate_hz": 10
}
```

## 7.4 Визуализация данных

### 7.4.1 Типы визуализаций

- **Gauge** - стрелочные приборы для давления, температуры
- **Line Chart** - графики изменения во времени
- **Bar Chart** - столбчатые диаграммы для сравнения
- **Table** - таблицы результатов
- **Mnemoscheme** - мнемосхемы с анимацией потоков
- **Status Panel** - панели состояния оборудования

### 7.4.2 Анимации и переходы

```json
{
  "animations": {
    "gauge_smooth": true,
    "chart_sliding_window": true,
    "value_change_highlight": {
      "enabled": true,
      "duration_ms": 500,
      "color": "#FFD700"
    }
  }
}
```

## 7.5 Summary (итоговые экраны)

### 7.5.1 Формат summary

```json
{
  "layout": "summary",
  "title": "Испытание завершено",
  "status": "PASSED",
  "results": {
    "measurements": {
      "pressure_max": {"value": 45.2, "units": "bar", "status": "ok"},
      "hold_time": {"value": 60, "units": "sec", "status": "ok"},
      "leak_rate": {"value": 0.1, "units": "bar/min", "status": "ok"}
    },
    "photos": {
      "count": 2,
      "thumbnails": ["photo1_thumb.jpg", "photo2_thumb.jpg"]
    },
    "operator": {
      "name": "Иванов И.И.",
      "id": "OP-1234"
    }
  },
  "qr_code": "data:image/png;base64,..."
}
```

## 7.6 Обработка ошибок на Display

Display должен корректно отображать:
- Потерю связи с облаком
- Отсутствие данных от Core/Terminal
- Критические значения параметров
- Таймауты операций

```json
{
  "layout": "warning",
  "severity": "critical",
  "icon": "alert",
  "message": "Потеряна связь с Core",
  "details": "Проверьте сетевое соединение",
  "actions": [
    {"label": "Повторить", "action": "reconnect"},
    {"label": "Аварийный режим", "action": "emergency"}
  ]
}
```

---

# Раздел 8. Core (ESP32-P4) - управление шагами, кнопки, 5-секундный барьер, state-machine

## 8.1 Архитектура Core

Core - это центральный контроллер на базе ESP32-P4:
- Управление физическим оборудованием (клапаны, датчики, насосы)
- Обработка физических кнопок (Принять/Повтор/Аварийная остановка)
- Выполнение команд и action-последовательностей
- Маршрутизация сообщений между облаком и локальными устройствами
- Контроль безопасности и аварийных режимов

## 8.2 State Machine

### 8.2.1 Состояния Core

```
┌──────────────┐
│ INITIALIZING │ - Загрузка конфигурации
└──────┬───────┘
       ▼
┌──────────────┐
│     IDLE     │ - Ожидание команд
└──┬───────┬───┘
   │       │
   ▼       ▼
┌──────┐ ┌──────────┐
│TESTING│ │MAINTENANCE│
└──┬───┘ └──────────┘
   │
   ▼
┌──────────────┐
│  EMERGENCY   │ - Аварийный режим
└──────────────┘
```

### 8.2.2 Переходы между состояниями

```cpp
enum class CoreState {
    INITIALIZING,
    IDLE,
    TESTING,
    MAINTENANCE,
    EMERGENCY,
    ERROR
};

class StateMachine {
    CoreState current = INITIALIZING;
    
    bool transition(CoreState to) {
        // Проверка допустимости перехода
        if (!is_transition_allowed(current, to)) {
            return false;
        }
        
        // Выполнение действий при выходе из состояния
        on_exit(current);
        
        CoreState from = current;
        current = to;
        
        // Выполнение действий при входе в состояние
        on_enter(to);
        
        log_transition(from, to);
        return true;
    }
};
```

## 8.3 Физические кнопки

### 8.3.1 Обработка кнопок

| Кнопка | GPIO | Действие | Условия |
|--------|------|----------|---------|
| FINISH | 34 | Завершить шаг | Минимум 5 сек с начала |
| RETRY | 35 | Повторить измерение | Всегда доступна |
| EMERGENCY | 36 | Аварийная остановка | Всегда, максимальный приоритет |

### 8.3.2 5-секундный барьер

```cpp
class ButtonHandler {
    unsigned long step_start_time = 0;
    const unsigned long MIN_STEP_DURATION = 5000;
    
    void handle_finish_button() {
        unsigned long elapsed = millis() - step_start_time;
        
        if (elapsed < MIN_STEP_DURATION) {
            send_warning("TOO_EARLY", {
                "elapsed_ms": elapsed,
                "required_ms": MIN_STEP_DURATION
            });
            return;
        }
        
        send_event({
            "type": "core_event",
            "event": "finish_button",
            "command_id": current_command_id,
            "elapsed_ms": elapsed
        });
        
        finalize_step();
    }
    
    void handle_retry_button() {
        send_event({
            "type": "core_event", 
            "event": "retry_button",
            "command_id": current_command_id
        });
        
        reset_measurements();
        restart_step();
    }
};
```

## 8.4 Выполнение Actions

### 8.4.1 Типы действий

| Action | Описание | Параметры |
|--------|----------|-----------|
| valve_config | Конфигурация клапанов | preset или valves[] |
| wait_condition | Ожидание условия | sensor_id, operator, value, timeout |
| measurement | Измерение | sensors[], duration_ms, sampling_rate |
| modbus_write | Запись Modbus | device, register, value |
| delay | Задержка | duration_ms |
| set_power | Управление питанием | channel, state |

### 8.4.2 Action Executor

```cpp
class ActionExecutor {
    ExecutionResult execute(const JsonObject& action) {
        String type = action["action"];
        JsonObject params = action["parameters"];
        
        if (type == "valve_config") {
            return execute_valve_config(params);
        }
        else if (type == "wait_condition") {
            return execute_wait_condition(params);
        }
        else if (type == "measurement") {
            return execute_measurement(params);
        }
        // ... другие действия
        
        return ExecutionResult::UNKNOWN_ACTION;
    }
    
    ExecutionResult execute_valve_config(const JsonObject& params) {
        if (params.containsKey("preset")) {
            String preset = params["preset"];
            return apply_preset(preset);
        }
        
        JsonArray valves = params["valves"];
        for (JsonObject valve : valves) {
            String id = valve["id"];
            String state = valve["state"];
            set_valve(id, state);
        }
        
        return ExecutionResult::SUCCESS;
    }
};
```

## 8.5 Управление оборудованием

### 8.5.1 Modbus интеграция

```cpp
class ModbusManager {
    ModbusMaster nodes[MAX_MODBUS_NODES];
    
    void init(const RS485Config& config) {
        Serial1.begin(config.baud, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX);
        
        for (auto& device : config.devices) {
            nodes[device.unit_id].begin(device.unit_id, Serial1);
        }
    }
    
    float read_sensor(int device, int reg) {
        uint8_t result = nodes[device].readInputRegisters(reg, 1);
        if (result == nodes[device].ku8MBSuccess) {
            uint16_t raw = nodes[device].getResponseBuffer(0);
            return decode_value(raw);
        }
        return NAN;
    }
    
    bool write_coil(int device, int coil, bool state) {
        return nodes[device].writeSingleCoil(coil, state ? 0xFF00 : 0x0000) 
               == nodes[device].ku8MBSuccess;
    }
};
```

### 8.5.2 Безопасные блокировки

```cpp
class SafetyInterlocks {
    struct Interlock {
        String sensor_id;
        float threshold;
        String operator_type;
        String action;
    };
    
    std::vector<Interlock> interlocks;
    
    bool check_interlocks() {
        for (const auto& lock : interlocks) {
            float value = read_sensor(lock.sensor_id);
            
            if (!evaluate_condition(value, lock.operator_type, lock.threshold)) {
                trigger_safety_action(lock.action);
                return false;
            }
        }
        return true;
    }
};
```

## 8.6 Очередь команд и приоритеты

```cpp
class CommandQueue {
    struct QueuedCommand {
        Command cmd;
        int priority;
        unsigned long timestamp;
    };
    
    std::priority_queue<QueuedCommand> queue;
    
    void enqueue(const Command& cmd, int priority = 0) {
        queue.push({cmd, priority, millis()});
    }
    
    Command dequeue() {
        if (!queue.empty()) {
            auto item = queue.top();
            queue.pop();
            return item.cmd;
        }
        return Command{};
    }
};
```

---

# Раздел 9. Аварийные режимы, heartbeat, потеря связи

## 9.1 Система аварийных режимов

### 9.1.1 Триггеры аварийного режима

- Потеря связи с облаком > 30 секунд
- Превышение критических параметров (давление, температура)
- Нажатие кнопки аварийной остановки
- Получение команды emergency_stop из облака
- Критическая ошибка оборудования
- Несоответствие контрольных сумм конфигурации

### 9.1.2 Действия в аварийном режиме

Действия берутся из конфигурации preset "emergency":

```json
{
  "presets": {
    "emergency": {
      "valves": [
        {"id": "valve_inlet", "state": "closed"},
        {"id": "valve_outlet", "state": "open"},
        {"id": "valve_relief", "state": "open"}
      ],
      "power": {
        "main_supply": "off",
        "aux_supply": "off",
        "emergency_light": "on"
      },
      "actions": [
        {"action": "stop_all_pumps"},
        {"action": "depressurize"},
        {"action": "sound_alarm"}
      ],
      "notifications": {
        "cloud": true,
        "local_alarm": true,
        "sms": "+7900123456"
      }
    }
  }
}
```

## 9.2 Heartbeat механизм

### 9.2.1 Формат heartbeat

Core отправляет heartbeat каждые 5 секунд:

```json
{
  "type": "heartbeat",
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "device": "core",
  "timestamp": 1732600000000,
  "status": "online",
  "state": "TESTING",
  "modules": {
    "core": "ok",
    "terminal": "ok",
    "display": "ok",
    "modbus_17": "ok",
    "modbus_23": "timeout"
  },
  "vitals": {
    "cpu_temp": 42.5,
    "free_heap": 145632,
    "uptime_sec": 3600,
    "wifi_rssi": -52
  },
  "alarms": []
}
```

### 9.2.2 Обработка heartbeat в облаке

```python
# Cloud-side heartbeat handler
def handle_heartbeat(hb):
    stand = get_stand(hb.stand_token)
    stand.last_seen = now()
    
    # Проверка модулей
    for module, status in hb.modules.items():
        if status != "ok":
            create_alert(f"Module {module} status: {status}")
    
    # Проверка vitals
    if hb.vitals.cpu_temp > 70:
        create_warning("High CPU temperature")
    
    # Обновление дашборда
    update_dashboard(stand, hb)
```

## 9.3 Обработка потери связи

### 9.3.1 На стороне Core

```cpp
class ConnectionMonitor {
    unsigned long last_cloud_contact = 0;
    const unsigned long TIMEOUT_MS = 30000;
    bool connection_lost = false;
    
    void check_connection() {
        if (millis() - last_cloud_contact > TIMEOUT_MS) {
            if (!connection_lost) {
                connection_lost = true;
                enter_safe_mode("CONNECTION_LOST");
            }
        }
    }
    
    void enter_safe_mode(const char* reason) {
        log_error(reason);
        
        // Применить emergency preset
        apply_emergency_preset();
        
        // Попытки переподключения
        schedule_reconnection();
        
        // Локальное логирование
        save_local_state();
    }
};
```

### 9.3.2 Стратегия переподключения

```cpp
class ReconnectionStrategy {
    int attempt = 0;
    unsigned long delays[] = {5000, 10000, 30000, 60000}; // ms
    
    void schedule_next_attempt() {
        int delay_index = min(attempt, 3);
        unsigned long delay = delays[delay_index];
        
        timer.once_ms(delay, []() {
            if (try_reconnect()) {
                on_reconnected();
                attempt = 0;
            } else {
                attempt++;
                schedule_next_attempt();
            }
        });
    }
};
```

## 9.4 Локальное логирование

### 9.4.1 Структура локальных логов

Core сохраняет критические события в SPIFFS:

```cpp
struct LogEntry {
    uint32_t timestamp;
    LogLevel level;
    char module[16];
    char message[128];
    float sensor_snapshot[8];
};

class LocalLogger {
    File log_file;
    CircularBuffer<LogEntry, 1000> buffer;
    
    void log(LogLevel level, const char* module, const char* msg) {
        LogEntry entry;
        entry.timestamp = millis();
        entry.level = level;
        strncpy(entry.module, module, 16);
        strncpy(entry.message, msg, 128);
        
        // Snapshot критических датчиков
        entry.sensor_snapshot[0] = read_sensor("pressure_main");
        entry.sensor_snapshot[1] = read_sensor("temperature");
        
        buffer.push(entry);
        
        if (level >= LogLevel::ERROR) {
            flush_to_spiffs();
        }
    }
};
```

### 9.4.2 Синхронизация логов при восстановлении связи

```python
# Cloud-side log sync
def sync_offline_logs(stand_token, logs):
    for entry in logs:
        # Сохранение в БД с пометкой "offline"
        store_log_entry({
            "stand_token": stand_token,
            "timestamp": entry.timestamp,
            "level": entry.level,
            "message": entry.message,
            "offline_mode": True,
            "sensor_snapshot": entry.sensor_snapshot
        })
    
    # Анализ критических событий
    analyze_offline_period(stand_token, logs)
```

## 9.5 Каскадные отказы и восстановление

### 9.5.1 Иерархия отказов

```
Cloud Connection Lost
    ├── Terminal Connection Lost
    │   └── BT Devices Unavailable
    ├── Display Connection Lost
    └── Modbus Timeout
        └── Sensors Unavailable
```

### 9.5.2 Восстановление работоспособности

```cpp
class RecoveryManager {
    enum RecoveryPhase {
        CHECK_HARDWARE,
        RESTORE_NETWORK,
        RELOAD_CONFIG,
        RESYNC_STATE,
        RESUME_OPERATION
    };
    
    void recovery_sequence() {
        set_phase(CHECK_HARDWARE);
        if (!check_all_hardware()) {
            enter_maintenance_mode();
            return;
        }
        
        set_phase(RESTORE_NETWORK);
        if (!restore_network_connection()) {
            retry_with_fallback();
            return;
        }
        
        set_phase(RELOAD_CONFIG);
        download_and_apply_config();
        
        set_phase(RESYNC_STATE);
        sync_with_cloud();
        
        set_phase(RESUME_OPERATION);
        transition_to_idle();
    }
};
```

---

# Раздел 10. Примеры полных сценариев «запрос-ответ»

## 10.1 Сценарий: Полный цикл испытания давлением

### 10.1.1 Последовательность сообщений

```
1. Cloud → Core: command (испытание давлением)
2. Core → Cloud: ack (received)
3. Cloud → Terminal: command (подготовка формы)
4. Cloud → Display: command (показать схему)
5. Terminal → Cloud: ack (form_ready)
6. Display → Cloud: ack (layout_shown)
7. Core → Cloud: ack (started)
8. Core: выполняет valve_config
9. Core → Cloud: telemetry (pressure rising)
10. Display: обновляет live данные
11. Core: достигнуто целевое давление
12. Core → Cloud: partial_result (pressure_reached)
13. Terminal: оператор вводит данные штангенциркуля
14. Terminal → Cloud: bt_telemetry (caliper: 123.45mm)
15. Оператор нажимает FINISH (прошло 7 секунд)
16. Core → Cloud: core_event (finish_button)
17. Core → Cloud: result (measurements complete)
18. Terminal → Cloud: result (form data + photos)
19. Cloud: агрегирует результаты
20. Cloud → All: step_summary (completed)
```

### 10.1.2 JSON примеры ключевых сообщений

**Шаг 1: Начальная команда**

```json
{
  "type": "command",
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "command_id": "test-pressure-001",
  "routes": [
    {
      "device": "core",
      "payload": {
        "actions": [
          {
            "action": "valve_config",
            "parameters": {"preset": "prepare_pressure_test"}
          },
          {
            "action": "wait_condition",
            "parameters": {
              "sensor_id": "pressure_main",
              "operator": ">=",
              "value": 45.0,
              "timeout_ms": 30000
            }
          },
          {
            "action": "measurement",
            "parameters": {
              "sensors": ["pressure_main", "temperature"],
              "duration_ms": 10000,
              "sampling_rate_hz": 50
            }
          }
        ]
      }
    },
    {
      "device": "terminal",
      "payload": {
        "form": {
          "fields": [
            {
              "id": "rod_length",
              "label": "Длина штока",
              "type": "number",
              "bt_channel": "caliper_length"
            }
          ]
        },
        "photo_request": {"min_photos": 1}
      }
    },
    {
      "device": "display",
      "payload": {
        "layout": "pressure_test",
        "live_bindings": ["core.live.pressure_main"],
        "target_indicator": {"value": 45, "units": "bar"}
      }
    }
  ]
}
```

**Шаг 17: Результат от Core**

```json
{
  "type": "result",
  "command_id": "test-pressure-001",
  "device": "core",
  "success": true,
  "payload": {
    "measurements": {
      "pressure_main": {
        "samples": [45.1, 45.2, 45.15, "..."],
        "statistics": {
          "mean": 45.18,
          "std": 0.08,
          "min": 45.05,
          "max": 45.31
        }
      },
      "temperature": {
        "mean": 23.5,
        "std": 0.2
      }
    },
    "duration_ms": 10243,
    "conditions_met": true
  }
}
```

## 10.2 Сценарий: Обработка retry

### 10.2.1 Последовательность при retry

```
1. Выполняется измерение (шаги 1-14 из 10.1.1)
2. Оператор нажимает RETRY
3. Core → Cloud: core_event (retry_button)
4. Core: сбрасывает текущие измерения
5. Terminal → Cloud: terminal_event (reset_form)
6. Terminal: очищает поля формы согласно on_retry
7. Cloud → Core: command (restart_measurement)
8. Процесс повторяется с шага 8 из 10.1.1
```

## 10.3 Сценарий: Аварийная ситуация

### 10.3.1 Превышение критического давления

```json
// Обнаружено превышение
{
  "type": "core_event",
  "device": "core",
  "event": "safety_violation",
  "details": {
    "sensor": "pressure_main",
    "value": 96.5,
    "threshold": 95.0,
    "action": "emergency_stop"
  }
}

// Применение аварийного preset
{
  "type": "core_event",
  "device": "core",
  "event": "emergency_activated",
  "preset": "emergency",
  "actions_taken": [
    "valve_inlet: closed",
    "valve_outlet: open",
    "valve_relief: open",
    "pump_main: stopped"
  ]
}

// Уведомление всех устройств
{
  "type": "command",
  "command_id": "emergency-notify",
  "routes": [
    {
      "device": "display",
      "payload": {
        "layout": "emergency",
        "message": "АВАРИЙНАЯ ОСТАНОВКА",
        "reason": "Превышение давления"
      }
    },
    {
      "device": "terminal",
      "payload": {
        "alert": "critical",
        "lock_interface": true
      }
    }
  ]
}
```

## 10.4 Сценарий: Потеря и восстановление связи

### 10.4.1 Временная шкала событий

```
T+0s: Последний heartbeat получен
T+5s: Heartbeat пропущен
T+10s: Второй heartbeat пропущен, облако помечает "warning"
T+30s: Core обнаруживает потерю связи, входит в safe mode
T+31s: Core применяет emergency preset
T+32s: Core начинает локальное логирование
T+60s: Первая попытка переподключения (неудача)
T+70s: Вторая попытка (неудача)
T+100s: Третья попытка (успех)
T+101s: Core отправляет накопленные логи
T+102s: Синхронизация состояния
T+105s: Возврат в IDLE
```

---

# Раздел 11. Примеры кода (Core и облако)

## 11.1 Core (ESP32-P4) - основной код

### 11.1.1 Main.cpp структура

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <ModbusMaster.h>

// Конфигурация
const char* STAND_TOKEN = "550e8400-e29b-41d4-a716-446655440000";
const char* CLOUD_HOST = "octa.cloud";
const int WSS_PORT = 443;

// Глобальные объекты
WebSocketsClient webSocket;
StateMachine stateMachine;
ConfigManager config;
CommandExecutor executor;
ButtonHandler buttons;
SafetyMonitor safety;
ModbusManager modbus;

void setup() {
    Serial.begin(115200);
    
    // Инициализация файловой системы
    if (!SPIFFS.begin(true)) {
        Serial.println("SPIFFS Mount Failed");
        enter_safe_mode("SPIFFS_FAIL");
    }
    
    // Подключение к сети
    connect_network();
    
    // Загрузка конфигурации
    if (!load_configuration()) {
        enter_safe_mode("CONFIG_FAIL");
    }
    
    // Инициализация оборудования
    init_hardware();
    
    // WebSocket
    init_websocket();
    
    // Запуск задач FreeRTOS
    xTaskCreate(websocket_task, "WebSocket", 8192, NULL, 1, NULL);
    xTaskCreate(safety_task, "Safety", 4096, NULL, 3, NULL);
    xTaskCreate(button_task, "Buttons", 2048, NULL, 2, NULL);
    xTaskCreate(heartbeat_task, "Heartbeat", 2048, NULL, 1, NULL);
    
    stateMachine.transition(CoreState::IDLE);
}

void loop() {
    // Основной цикл обработки команд
    if (executor.hasCommands()) {
        Command cmd = executor.nextCommand();
        execute_command(cmd);
    }
    
    // Проверка таймаутов
    check_timeouts();
    
    // Обновление телеметрии
    if (should_send_telemetry()) {
        send_telemetry();
    }
    
    delay(10);
}
```

### 11.1.2 WebSocket обработчик

```cpp
void websocket_event(WStype_t type, uint8_t* payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("WebSocket Disconnected");
            handle_disconnection();
            break;
            
        case WStype_CONNECTED:
            Serial.println("WebSocket Connected");
            register_device();
            break;
            
        case WStype_TEXT: {
            DynamicJsonDocument doc(16384);
            DeserializationError error = deserializeJson(doc, payload);
            
            if (!error) {
                handle_message(doc.as<JsonObject>());
            }
            break;
        }
        
        case WStype_ERROR:
            Serial.printf("WebSocket Error: %s\n", payload);
            break;
    }
}

void handle_message(const JsonObject& msg) {
    String type = msg["type"];
    
    if (type == "command") {
        handle_command(msg);
    }
    else if (type == "config_update") {
        handle_config_update(msg);
    }
    else if (type == "query") {
        handle_query(msg);
    }
}
```

### 11.1.3 Выполнитель действий

```cpp
class CommandExecutor {
    struct ActionContext {
        JsonObject action;
        unsigned long start_time;
        ExecutionState state;
        JsonObject result;
    };
    
    std::queue<ActionContext> action_queue;
    
public:
    ExecutionResult execute_action(const JsonObject& action) {
        String type = action["action"];
        JsonObject params = action["parameters"];
        
        // Valve configuration
        if (type == "valve_config") {
            if (params.containsKey("preset")) {
                return apply_preset(params["preset"]);
            }
            else if (params.containsKey("valves")) {
                return configure_valves(params["valves"]);
            }
        }
        
        // Wait condition
        else if (type == "wait_condition") {
            String sensor = params["sensor_id"];
            String op = params["operator"];
            float value = params["value"];
            unsigned long timeout = params["timeout_ms"];
            
            return wait_for_condition(sensor, op, value, timeout);
        }
        
        // Measurement
        else if (type == "measurement") {
            return perform_measurement(params);
        }
        
        return ExecutionResult::UNKNOWN_ACTION;
    }
    
private:
    ExecutionResult wait_for_condition(
        const String& sensor_id, 
        const String& op, 
        float target, 
        unsigned long timeout
    ) {
        unsigned long start = millis();
        
        while (millis() - start < timeout) {
            float current = read_sensor(sensor_id);
            
            if (evaluate_condition(current, op, target)) {
                return ExecutionResult::SUCCESS;
            }
            
            // Проверка безопасности
            if (safety.check_violations()) {
                return ExecutionResult::SAFETY_VIOLATION;
            }
            
            delay(100);
        }
        
        return ExecutionResult::TIMEOUT;
    }
};
```

## 11.2 Cloud (Python) - серверная часть

### 11.2.1 WebSocket сервер

```python
import asyncio
import json
import websockets
from datetime import datetime
from typing import Dict, Set
import logging

class OctaCloudServer:
    def __init__(self):
        self.connections: Dict[str, Set[websockets.WebSocketServerProtocol]] = {}
        self.stand_states = {}
        self.command_results = {}
        
    async def handler(self, websocket, path):
        """Main WebSocket handler"""
        device_token = None
        try:
            # Извлечение токена из пути
            device_token = self.extract_token(path)
            if not device_token:
                await websocket.close(1008, "Invalid token")
                return
            
            # Регистрация соединения
            await self.register(device_token, websocket)
            
            # Обработка сообщений
            async for message in websocket:
                await self.handle_message(device_token, message)
                
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            if device_token:
                await self.unregister(device_token, websocket)
    
    async def handle_message(self, device_token: str, message: str):
        """Process incoming message"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            if msg_type == "heartbeat":
                await self.handle_heartbeat(device_token, data)
            elif msg_type == "ack":
                await self.handle_ack(device_token, data)
            elif msg_type == "result":
                await self.handle_result(device_token, data)
            elif msg_type == "core_event":
                await self.handle_core_event(device_token, data)
            elif msg_type == "bt_telemetry":
                await self.handle_bt_telemetry(device_token, data)
            elif msg_type == "error_event":
                await self.handle_error(device_token, data)
                
        except json.JSONDecodeError:
            logging.error(f"Invalid JSON from {device_token}")
    
    async def send_command(self, stand_token: str, command: dict):
        """Send command to stand devices"""
        # Маршрутизация по устройствам
        for route in command.get("routes", []):
            device = route["device"]
            device_token = f"{stand_token}-{device}"
            
            if device_token in self.connections:
                for ws in self.connections[device_token]:
                    await ws.send(json.dumps(command))
    
    async def handle_heartbeat(self, device_token: str, data: dict):
        """Process heartbeat"""
        stand_token = data["stand_token"]
        
        # Обновление состояния
        self.stand_states[stand_token] = {
            "last_seen": datetime.now(),
            "status": data["status"],
            "modules": data.get("modules", {}),
            "vitals": data.get("vitals", {})
        }
        
        # Проверка аномалий
        await self.check_anomalies(stand_token, data)
    
    async def aggregate_results(self, command_id: str):
        """Aggregate partial results from devices"""
        if command_id not in self.command_results:
            return
        
        results = self.command_results[command_id]
        required = results.get("required_routes", [])
        received = results.get("received", {})
        
        # Проверка получения всех обязательных результатов
        if all(device in received for device in required):
            summary = {
                "type": "step_summary",
                "command_id": command_id,
                "status": "completed",
                "aggregated": self.merge_results(received),
                "timestamp": datetime.now().isoformat()
            }
            
            # Отправка summary всем устройствам
            stand_token = results["stand_token"]
            await self.broadcast_to_stand(stand_token, summary)

# Запуск сервера
async def main():
    server = OctaCloudServer()
    async with websockets.serve(server.handler, "0.0.0.0", 8765):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
```

### 11.2.2 REST API для конфигурации

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import hashlib
import json

app = FastAPI()

class ConfigurationStore:
    def __init__(self):
        self.configs = {}
        
    def get_config(self, stand_token: str, revision: str = "latest"):
        """Get configuration with signature"""
        if stand_token not in self.configs:
            raise HTTPException(404, "Configuration not found")
        
        config = self.configs[stand_token]
        
        # Добавление подписи
        config_json = json.dumps(config, sort_keys=True)
        signature = hashlib.sha256(config_json.encode()).hexdigest()
        
        config["signatures"] = {
            "sha256": signature,
            "revision": revision,
            "timestamp": datetime.now().isoformat()
        }
        
        return config

config_store = ConfigurationStore()

@app.get("/api/stands/{stand_token}/config")
async def get_configuration(stand_token: str, rev: str = "latest"):
    """Endpoint для получения конфигурации"""
    return config_store.get_config(stand_token, rev)

@app.post("/api/stands/{stand_token}/config")
async def update_configuration(stand_token: str, config: dict):
    """Обновление конфигурации стенда"""
    # Валидация
    if not validate_config_schema(config):
        raise HTTPException(400, "Invalid configuration schema")
    
    # Сохранение
    config_store.configs[stand_token] = config
    
    # Уведомление стенда о новой конфигурации
    await notify_stand_config_update(stand_token)
    
    return {"status": "updated", "revision": generate_revision()}
```

---

# Раздел 12. Заключение и перспективы развития

## 12.1 Достигнутые цели

Система OCTA успешно решает поставленные задачи:

1. **Централизованное управление**: Все стенды управляются из единого облака
2. **Гибкая архитектура**: Трёхкомпонентная структура позволяет независимо развивать модули
3. **Безопасность**: Многоуровневая система безопасности с аварийными режимами
4. **Масштабируемость**: Легко добавляются новые стенды и типы оборудования
5. **Отказоустойчивость**: Работа в offline режиме с последующей синхронизацией

## 12.2 Технические достижения

- WebSocket обеспечивает real-time коммуникацию с задержкой <100ms
- Modbus интеграция позволяет работать с промышленным оборудованием
- Bluetooth поддержка для беспроводных измерительных приборов
- 5-секундный барьер предотвращает ошибочные подтверждения
- Heartbeat механизм обеспечивает мониторинг состояния

## 12.3 Перспективы развития

### 12.3.1 Краткосрочные (3-6 месяцев)

1. **Шифрование и безопасность**
   - Внедрение TLS 1.3 для всех соединений
   - ECDSA подписи для конфигураций
   - Двухфакторная аутентификация операторов

2. **Расширение протокола**
   - Поддержка Profibus/Profinet
   - CAN bus для автомобильной диагностики
   - OPC UA для интеграции с SCADA

3. **UI/UX улучшения**
   - Мобильное приложение для Terminal
   - AR-инструкции через Display
   - Голосовое управление

### 12.3.2 Среднесрочные (6-12 месяцев)

1. **Искусственный интеллект**
   - Предиктивная диагностика на основе ML
   - Автоматическая оптимизация испытаний
   - Аномалии detection в real-time

2. **Интеграции**
   - ERP системы (SAP, 1C)
   - Системы управления качеством
   - Цифровые двойники оборудования

3. **Аналитика**
   - Дашборды для менеджмента
   - Отчёты по KPI стендов
   - Прогнозирование отказов

### 12.3.3 Долгосрочные (12+ месяцев)

1. **Edge Computing**
   - Локальная обработка данных на Core
   - Распределённые вычисления между стендами
   - Федеративное обучение ML моделей

2. **Blockchain**
   - Неизменяемые логи испытаний
   - Smart contracts для автоматизации
   - Распределённая сертификация

3. **Quantum-ready**
   - Постквантовая криптография
   - Подготовка к квантовым вычислениям

## 12.4 Рекомендации по внедрению

### 12.4.1 Пилотный проект

1. Начать с одного стенда в контролируемой среде
2. Обучить 2-3 операторов
3. Провести 50+ тестовых испытаний
4. Собрать обратную связь
5. Оптимизировать процессы

### 12.4.2 Масштабирование

1. Постепенное подключение стендов (по 2-3 в месяц)
2. Создание центра компетенций
3. Разработка регламентов и инструкций
4. Интеграция с существующими системами
5. Непрерывное обучение персонала

## 12.5 Ключевые метрики успеха

| Метрика | Целевое значение | Способ измерения |
|---------|------------------|------------------|
| Время испытания | -30% | Сравнение до/после |
| Качество данных | >99% точность | Валидация результатов |
| Доступность системы | 99.9% | Uptime monitoring |
| Удовлетворённость операторов | >4.5/5 | Опросы |
| ROI | <18 месяцев | Финансовый анализ |

## 12.6 Заключительные положения

Система OCTA представляет собой современное решение для управления испытательными стендами, сочетающее:
- Надёжность промышленных систем
- Гибкость облачных технологий
- Удобство современных интерфейсов
- Безопасность критически важной инфраструктуры

Данная "Библия разработчика" является living document и будет обновляться по мере развития системы.

**Версия документа**: 1.0.0  
**Дата релиза**: 27 сентября 2025  
**Следующая ревизия**: Январь 2026

---

## Приложения

### Приложение А. JSON Схемы

[Полные JSON Schema определения для всех типов сообщений]

### Приложение Б. Коды ошибок

[Таблица всех кодов ошибок и их описаний]

### Приложение В. Глоссарий расширенный

[Полный список терминов и аббревиатур]

### Приложение Г. Диаграммы последовательностей

[UML sequence diagrams для основных сценариев]

---

*Конец документа*
