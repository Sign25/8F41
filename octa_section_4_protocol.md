# Раздел 4. Протокол команд и контракт сообщений

## 4.1 Общие принципы протокола

### 4.1.1 Структура JSON команд

> "Да, в каждом JSON на каждый шаг, кроме нулевого, который является конфигуратором, должны быть разделы, посвященные отображению на дисплей, для HMI и для ядра"

Каждая команда содержит разделы для всех трёх устройств:
- **Core** - управление оборудованием
- **Terminal (HMI)** - интерфейс оператора
- **Display (TV)** - визуализация

### 4.1.2 Типы сообщений

| Тип | Направление | Описание |
|-----|-------------|----------|
| command | Cloud → Devices | Команда выполнения шага |
| ack | Device → Cloud | Подтверждение получения |
| result | Device → Cloud | Результат выполнения |
| heartbeat | Core → Cloud | Периодический статус |
| event | Core → Cloud | События (нажатие кнопок) |
| bt_telemetry | Terminal → Cloud | Данные от BT устройств |
| error | Device → Cloud | Ошибки и сбои |

## 4.2 Формат команды шага

### 4.2.1 Базовая структура

```json
{
  "type": "command",
  "step_number": 10,
  "command_id": "cmd-2024-001",
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1695805200000,
  "routes": {
    "core": {},
    "terminal": {},
    "display": {}
  }
}
```

### 4.2.2 Служебные шаги (0-9)

**Шаг 1: Идентификация пользователя**

```json
{
  "type": "command",
  "step_number": 1,
  "command_id": "step-01-identify",
  "description": "Идентификация оператора",
  "routes": {
    "core": {
      "action": "wait_rfid",
      "parameters": {
        "frequency": "125kHz",
        "timeout_ms": 60000
      },
      "on_success": {
        "action": "raise_shutter",
        "delay_ms": 500
      }
    },
    "terminal": {
      "action": "show_message",
      "message": "Приложите ID-карту к считывателю"
    },
    "display": {
      "action": "show_screen",
      "layout": "welcome",
      "content": {
        "title": "Добро пожаловать",
        "instruction": "Приложите ID-карту для начала работы",
        "image": "rfid_scan.png"
      }
    }
  }
}
```

**Шаг 2: Сканирование оборудования**

```json
{
  "type": "command",
  "step_number": 2,
  "command_id": "step-02-scan-equipment",
  "description": "Сканирование диагностируемого аппарата",
  "routes": {
    "core": {
      "action": "standby",
      "parameters": {}
    },
    "terminal": {
      "action": "scan_code",
      "parameters": {
        "types": ["qr", "rfid"],
        "rfid_frequency": "125kHz"
      },
      "on_success": {
        "action": "determine_equipment_type"
      }
    },
    "display": {
      "action": "show_instruction",
      "content": {
        "title": "Сканирование оборудования",
        "text": "Считайте QR-код или RFID-метку с диагностируемого аппарата"
      }
    }
  }
}
```

**Шаг 3: Выбор типа диагностики**

```json
{
  "type": "command",
  "step_number": 3,
  "command_id": "step-03-select-mode",
  "description": "Выбор режима работы",
  "routes": {
    "core": {
      "action": "prepare",
      "parameters": {}
    },
    "terminal": {
      "action": "show_menu",
      "options": [
        {"id": "repair", "label": "Ремонт"},
        {"id": "diagnostic", "label": "Диагностика"},
        {"id": "testing", "label": "Испытания"}
      ]
    },
    "display": {
      "action": "show_options",
      "title": "Выберите режим работы"
    }
  }
}
```

### 4.2.3 Рабочие шаги (10+)

**Шаг 10: Механические действия**

```json
{
  "type": "command",
  "step_number": 10,
  "command_id": "step-10-mechanical",
  "description": "Выполнить механические действия",
  "routes": {
    "core": {
      "action": "monitor_only",
      "min_duration_ms": 5000
    },
    "terminal": {
      "action": "show_checklist",
      "items": [
        {"id": 1, "text": "Запилить поверхность"},
        {"id": 2, "text": "Почистить от загрязнений"},
        {"id": 3, "text": "Протереть насухо"}
      ],
      "require_confirmation": true
    },
    "display": {
      "action": "show_instructions",
      "content": {
        "title": "Механическая обработка",
        "steps": [
          "1. Запилите поверхность",
          "2. Очистите от загрязнений",
          "3. Протрите насухо"
        ],
        "image": "mechanical_work.jpg"
      }
    }
  }
}
```

**Шаг 11: Измерение штангенциркулем**

```json
{
  "type": "command",
  "step_number": 11,
  "command_id": "step-11-measure",
  "description": "Измерить линейные размеры",
  "routes": {
    "core": {
      "action": "wait_measurement",
      "min_duration_ms": 5000,
      "wait_for_button": true
    },
    "terminal": {
      "action": "collect_bt_data",
      "device": {
        "type": "caliper",
        "id": "caliper_01",
        "expected_range": [10.0, 150.0],
        "units": "mm"
      },
      "display_value": true,
      "allow_retry": true
    },
    "display": {
      "action": "show_measurement",
      "title": "Измерение диаметра",
      "instruction": "Измерьте диаметр вала штангенциркулем",
      "live_value": {
        "source": "bt.caliper_01",
        "format": "##.## мм"
      }
    }
  }
}
```

**Шаг 12: Испытание давлением**

```json
{
  "type": "command",
  "step_number": 12,
  "command_id": "step-12-pressure-test",
  "description": "Испытание давлением",
  "routes": {
    "core": {
      "actions": [
        {
          "action": "valve_config",
          "parameters": {
            "valve_inlet": "open",
            "valve_outlet": "closed",
            "valve_relief": "closed"
          }
        },
        {
          "action": "wait_pressure",
          "parameters": {
            "target": 5.0,
            "units": "bar",
            "timeout_ms": 30000
          }
        },
        {
          "action": "measure_time",
          "parameters": {
            "start_condition": "pressure > 0.5",
            "end_condition": "pressure >= 5.0"
          }
        }
      ],
      "min_duration_ms": 5000
    },
    "terminal": {
      "action": "show_start_button",
      "button_text": "Начать испытание",
      "on_start": {
        "action": "monitor_test",
        "show_abort": true
      }
    },
    "display": {
      "action": "show_live_data",
      "layout": "pressure_gauge",
      "parameters": {
        "sensor": "pressure_main",
        "target": 5.0,
        "units": "bar",
        "show_time": true
      }
    }
  }
}
```

## 4.3 Обработка результатов

### 4.3.1 Результат от Core

```json
{
  "type": "result",
  "command_id": "step-12-pressure-test",
  "device": "core",
  "success": true,
  "data": {
    "pressure_reached": 5.02,
    "time_to_pressure": 12500,
    "measurements": {
      "pressure_main": [0.5, 1.2, 2.5, 3.8, 5.02],
      "temperature": 23.5
    }
  },
  "button_pressed": "accept",
  "elapsed_ms": 15000
}
```

### 4.3.2 BT телеметрия от Terminal

```json
{
  "type": "bt_telemetry",
  "device": "terminal",
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "command_id": "step-11-measure",
  "bt_device": {
    "id": "caliper_01",
    "type": "caliper",
    "mac": "AA:BB:CC:DD:EE:FF"
  },
  "data": {
    "value": 45.67,
    "units": "mm",
    "raw": "45.67",
    "timestamp": 1695805210000
  },
  "retries": 0
}
```

## 4.4 События физических кнопок

### 4.4.1 Событие "Принять"

```json
{
  "type": "button_event",
  "device": "core",
  "button": "accept",
  "command_id": "step-12-pressure-test",
  "elapsed_ms": 7500,
  "validation": {
    "min_time_passed": true,
    "min_time_required": 5000
  }
}
```

### 4.4.2 Событие "Повтор"

```json
{
  "type": "button_event",
  "device": "core",
  "button": "retry",
  "command_id": "step-11-measure",
  "retry_count": 2,
  "action": "reset_measurements"
}
```

## 4.5 Heartbeat

### 4.5.1 Формат heartbeat

> "Периодически стенд, находясь вне режима диагностики, а просто когда он включен, он должен отсылать так называемое свое состояние"

```json
{
  "type": "heartbeat",
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "device": "core",
  "timestamp": 1695805200000,
  "message": "я стенд такой-то, идентификатор такой-то, нахожусь в онлайне, у меня все хорошо",
  "status": {
    "state": "online",
    "condition": "все хорошо",
    "current_step": null,
    "operator": null
  },
  "modules": {
    "core": "ok",
    "terminal": "ok",
    "display": "ok"
  }
}
```

## 4.6 Обработка ошибок

### 4.6.1 Потеря связи с модулем

> "При потере связи с одним из модулей, терминалом или дисплеем должна возникать некая ошибка, о которой облако должно быть извещено"

```json
{
  "type": "error",
  "device": "core",
  "timestamp": 1695805230000,
  "error": {
    "code": "MODULE_DISCONNECTED",
    "module": "terminal",
    "message": "Потеряна связь с Terminal",
    "last_seen": 1695805225000
  },
  "action_taken": "continue_limited"
}
```

### 4.6.2 Ошибка 5-секундного барьера

```json
{
  "type": "error",
  "device": "core",
  "command_id": "step-12-pressure-test",
  "error": {
    "code": "TOO_EARLY",
    "message": "Кнопка нажата слишком рано",
    "elapsed_ms": 3500,
    "required_ms": 5000
  }
}
```

## 4.7 Команды для Core

### 4.7.1 Типы действий Core

> "Для ядра, как правило, это будут какие-то команды в виде включить определенную конфигурацию клапанов, отправить команду на частотный преобразователь, запросить результаты измерения напряжения, подать определенное количество вольт на щупы"

| Действие | Описание | Параметры |
|----------|----------|-----------|
| valve_config | Конфигурация клапанов | valve_id, state |
| frequency_drive | Управление частотником | frequency, ramp_time |
| measure_voltage | Измерение напряжения | channel, range |
| apply_voltage | Подать напряжение | voltage, duration |
| wait_condition | Ожидание условия | sensor, operator, value |

### 4.7.2 Пример сложной команды

```json
{
  "core": {
    "sequence": [
      {
        "action": "valve_config",
        "valves": {
          "inlet": "open",
          "outlet": "closed"
        }
      },
      {
        "action": "frequency_drive",
        "parameters": {
          "device_id": 1,
          "frequency": 25.0,
          "ramp_time_ms": 3000
        }
      },
      {
        "action": "wait_condition",
        "condition": {
          "sensor": "pressure_main",
          "operator": ">=",
          "value": 5.0,
          "timeout_ms": 30000
        }
      },
      {
        "action": "measure",
        "sensors": ["pressure_main", "flow_rate"],
        "duration_ms": 10000,
        "rate_hz": 10
      }
    ]
  }
}
```

## 4.8 Синхронизация данных

### 4.8.1 Принцип синхронизации

- **BT данные**: Terminal → Core → Cloud (при нажатии кнопки)
- **Измерения Core**: Core → Cloud (при нажатии кнопки)
- **Фото**: Terminal → Cloud (асинхронно)
- **События**: Core → Cloud (мгновенно)

### 4.8.2 Агрегация результатов

```json
{
  "type": "step_complete",
  "step_number": 12,
  "command_id": "step-12-pressure-test",
  "aggregated_data": {
    "core": {
      "pressure_reached": 5.02,
      "time_to_pressure": 12500
    },
    "terminal": {
      "operator_notes": "Небольшая утечка на соединении",
      "photos": ["photo_001.jpg"]
    },
    "timestamp": 1695805250000
  }
}
```

---

*Конец Раздела 4*