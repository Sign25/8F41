# Раздел 10. Примеры полных сценариев «запрос-ответ»

## 10.1 Сценарий: Полный цикл испытания давлением

### 10.1.1 Последовательность сообщений

```
Временная шкала и последовательность обмена сообщениями:

T+0s    Cloud → Core: command (испытание давлением)
T+0.1s  Core → Cloud: ack (received)
T+0.2s  Cloud → Terminal: command (подготовка формы)
T+0.3s  Cloud → Display: command (показать схему)
T+0.5s  Terminal → Cloud: ack (form_ready)
T+0.6s  Display → Cloud: ack (layout_shown)
T+1s    Core → Cloud: ack (started)
T+2s    Core: выполняет valve_config
T+3s    Core → Cloud: telemetry (pressure rising: 1.2 bar)
T+3.5s  Display: обновляет live данные на экране
T+5s    Core → Cloud: telemetry (pressure rising: 2.5 bar)
T+8s    Core → Cloud: telemetry (pressure rising: 4.8 bar)
T+10s   Core: достигнуто целевое давление (5.0 bar)
T+10.1s Core → Cloud: partial_result (pressure_reached)
T+11s   Terminal: оператор измеряет штангенциркулем
T+12s   Terminal → Cloud: bt_telemetry (caliper: 123.45mm)
T+15s   Terminal: оператор делает фото
T+16s   Terminal → Cloud: photo_uploaded (photo_001.jpg)
T+20s   Оператор нажимает FINISH (прошло 20 секунд)
T+20.1s Core → Cloud: core_event (finish_button, elapsed: 20000ms)
T+20.2s Core → Cloud: result (measurements complete)
T+20.3s Terminal → Cloud: result (form data + photos)
T+20.5s Cloud: агрегирует все результаты
T+21s   Cloud → All devices: step_summary (completed)
```

### 10.1.2 Детальные JSON сообщения

**T+0s: Начальная команда от облака**

```json
{
  "type": "command",
  "stand_token": "550e8400-e29b-41d4-a716-446655440000",
  "command_id": "test-pressure-001",
  "step_number": 12,
  "timestamp": 1695805200000,
  "routes": [
    {
      "device": "core",
      "payload": {
        "actions": [
          {
            "action": "valve_config",
            "parameters": {
              "preset": "prepare_pressure_test"
            }
          },
          {
            "action": "wait_condition",
            "parameters": {
              "sensor_id": "pressure_main",
              "operator": ">=",
              "value": 5.0,
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
        ],
        "min_duration_ms": 5000,
        "wait_for_button": true
      }
    },
    {
      "device": "terminal",
      "payload": {
        "form": {
          "id": "pressure_test_form",
          "fields": [
            {
              "id": "rod_length",
              "label": "Длина штока, мм",
              "type": "number",
              "bt_channel": "caliper_length",
              "required": true,
              "min": 100,
              "max": 200
            },
            {
              "id": "visual_inspection",
              "label": "Визуальный контроль",
              "type": "select",
              "options": ["Норма", "Дефект", "Требует проверки"],
              "required": true
            },
            {
              "id": "notes",
              "label": "Примечания",
              "type": "text",
              "max_length": 500,
              "required": false
            }
          ]
        },
        "photo_request": {
          "min_photos": 1,
          "max_photos": 3,
          "instruction": "Сфотографируйте узел после испытания"
        }
      }
    },
    {
      "device": "display",
      "payload": {
        "layout": "pressure_test",
        "sections": {
          "main": {
            "type": "gauge",
            "binding": "core.live.pressure_main",
            "config": {
              "min": 0,
              "max": 10,
              "target": 5.0,
              "units": "bar",
              "zones": [
                {"from": 0, "to": 4, "color": "yellow"},
                {"from": 4, "to": 6, "color": "green"},
                {"from": 6, "to": 10, "color": "red"}
              ]
            }
          },
          "info": {
            "type": "info_panel",
            "items": [
              {"label": "Целевое давление", "value": "5.0 bar"},
              {"label": "Время испытания", "binding": "elapsed_time"}
            ]
          }
        }
      }
    }
  ],
  "completion_policy": {
    "required_routes": ["core", "terminal"],
    "min_duration_ms": 5000,
    "timeout_ms": 300000
  }
}
```

**T+3s, T+5s, T+8s: Телеметрия давления**

```json
{
  "type": "telemetry",
  "device_token": "550e8400-Core",
  "command_id": "test-pressure-001",
  "timestamp": 1695805203000,
  "data": {
    "pressure_main": {
      "value": 2.5,
      "units": "bar",
      "quality": "good",
      "trend": "rising"
    },
    "temperature": {
      "value": 23.5,
      "units": "celsius",
      "quality": "good"
    },
    "valve_states": {
      "valve_inlet": "open",
      "valve_outlet": "closed",
      "valve_relief": "closed"
    }
  }
}
```

**T+12s: BT телеметрия от Terminal**

```json
{
  "type": "bt_telemetry",
  "device_token": "550e8400-Terminal",
  "command_id": "test-pressure-001",
  "timestamp": 1695805212000,
  "bt_device": {
    "id": "caliper_01",
    "type": "caliper",
    "mac": "AA:BB:CC:DD:EE:FF",
    "manufacturer": "Mitutoyo",
    "model": "500-196-30"
  },
  "measurement": {
    "raw_value": "123.45",
    "value": 123.45,
    "units": "mm",
    "timestamp": 1695805211500,
    "rssi": -65,
    "battery": 85,
    "quality": "stable"
  }
}
```

**T+20.1s: Событие нажатия кнопки**

```json
{
  "type": "core_event",
  "device_token": "550e8400-Core",
  "command_id": "test-pressure-001",
  "event": "finish_button",
  "timestamp": 1695805220100,
  "details": {
    "button": "accept",
    "elapsed_ms": 20000,
    "validation": {
      "min_time_required": 5000,
      "min_time_passed": true,
      "status": "valid"
    }
  }
}
```

**T+20.2s: Результат от Core**

```json
{
  "type": "result",
  "device_token": "550e8400-Core",
  "command_id": "test-pressure-001",
  "timestamp": 1695805220200,
  "success": true,
  "data": {
    "measurements": {
      "pressure_main": {
        "samples": 500,
        "mean": 5.02,
        "std": 0.08,
        "min": 4.95,
        "max": 5.15,
        "raw_data": "[сжатые данные]"
      },
      "temperature": {
        "mean": 23.5,
        "std": 0.2
      }
    },
    "timing": {
      "pressure_rise_time": 8000,
      "stable_pressure_time": 12000,
      "total_duration": 20000
    },
    "conditions_met": true
  }
}
```

**T+20.3s: Результат от Terminal**

```json
{
  "type": "result",
  "device_token": "550e8400-Terminal",
  "command_id": "test-pressure-001",
  "timestamp": 1695805220300,
  "success": true,
  "data": {
    "form_data": {
      "rod_length": {
        "value": 123.45,
        "source": "bluetooth",
        "device": "caliper_01"
      },
      "visual_inspection": {
        "value": "Норма",
        "source": "manual"
      },
      "notes": {
        "value": "Небольшие следы коррозии на соединении",
        "source": "manual"
      }
    },
    "photos": [
      {
        "id": "photo_001",
        "path": "/photos/test-pressure-001_001.jpg",
        "size": 2456789,
        "timestamp": 1695805215000,
        "uploaded": true
      }
    ],
    "operator": {
      "id": "OP-1234",
      "name": "Иванов И.И."
    }
  }
}
```

**T+21s: Итоговое сообщение от облака**

```json
{
  "type": "step_summary",
  "command_id": "test-pressure-001",
  "timestamp": 1695805221000,
  "status": "COMPLETED",
  "summary": {
    "step_number": 12,
    "duration_ms": 21000,
    "result": "PASSED",
    "aggregated_data": {
      "pressure_test": {
        "max_pressure": 5.15,
        "hold_time": 12000,
        "leak_rate": 0.001
      },
      "measurements": {
        "rod_length": 123.45
      },
      "inspection": "Норма",
      "photos": 1,
      "notes": "Небольшие следы коррозии на соединении"
    }
  },
  "next_step": 13
}
```

## 10.2 Сценарий: Обработка retry

### 10.2.1 Последовательность при retry

```
T+0s    Начало измерения (аналогично 10.1.1)
...
T+10s   Terminal: измерение показало 123.45 мм
T+11s   Display: показывает значение
T+12s   Оператор видит ошибку измерения
T+13s   Оператор нажимает RETRY
T+13.1s Core → Cloud: core_event (retry_button)
T+13.2s Core: сбрасывает текущие измерения
T+13.3s Terminal → Cloud: terminal_event (reset_form)
T+13.4s Terminal: очищает поля формы согласно retry_policy
T+13.5s Cloud → Core: command (restart_measurement)
T+14s   Cloud → Terminal: command (reset_bt_connection)
T+14.5s Terminal: переподключается к BT устройству
T+15s   Процесс измерения начинается заново
...
T+25s   Новое измерение: 145.67 мм
T+30s   Оператор нажимает ACCEPT
T+30.1s Core → Cloud: core_event (finish_button, retry_count: 1)
```

### 10.2.2 JSON сообщения retry

**T+13.1s: Событие retry**

```json
{
  "type": "core_event",
  "device_token": "550e8400-Core",
  "command_id": "test-pressure-001",
  "event": "retry_button",
  "timestamp": 1695805213100,
  "details": {
    "retry_count": 1,
    "elapsed_before_retry": 13000,
    "current_state": "WAITING_BUTTON"
  }
}
```

**T+13.3s: Сброс формы Terminal**

```json
{
  "type": "terminal_event",
  "device_token": "550e8400-Terminal",
  "command_id": "test-pressure-001",
  "event": "form_reset",
  "timestamp": 1695805213300,
  "details": {
    "reset_fields": ["rod_length"],
    "kept_fields": ["visual_inspection", "notes"],
    "cleared_photos": true,
    "retry_policy": {
      "reset_measurements": true,
      "reset_photos": true,
      "keep_form_fields": ["visual_inspection", "notes"]
    }
  }
}
```

**T+13.5s: Команда перезапуска**

```json
{
  "type": "command",
  "command_id": "test-pressure-001-retry-1",
  "parent_command": "test-pressure-001",
  "timestamp": 1695805213500,
  "routes": [
    {
      "device": "core",
      "payload": {
        "action": "restart_measurement",
        "reset_timer": true,
        "retry_count": 1
      }
    },
    {
      "device": "terminal",
      "payload": {
        "action": "reconnect_bt",
        "device": "caliper_01",
        "clear_buffer": true
      }
    },
    {
      "device": "display",
      "payload": {
        "action": "show_retry_notification",
        "message": "Повтор измерения #1",
        "duration": 3000
      }
    }
  ]
}
```

## 10.3 Сценарий: Аварийная ситуация

### 10.3.1 Превышение критического давления

```
T+0s    Начало испытания давлением
T+5s    Давление: 3.0 bar (норма)
T+10s   Давление: 5.0 bar (целевое)
T+15s   Давление: 7.0 bar (предупреждение)
T+18s   Давление: 9.5 bar (критическое!)
T+18.1s Core: обнаружено превышение порога
T+18.2s Core → Cloud: safety_violation
T+18.3s Core: применение emergency preset
T+18.4s Core: открытие relief valve
T+18.5s Display: АВАРИЙНАЯ ОСТАНОВКА
T+19s   Core → Cloud: emergency_activated
T+20s   Cloud → All: emergency notification
T+25s   Давление: 2.0 bar (снижается)
T+30s   Давление: 0.5 bar (безопасно)
T+31s   Core → Cloud: emergency_resolved
```

### 10.3.2 JSON сообщения аварии

**T+18.2s: Обнаружение нарушения безопасности**

```json
{
  "type": "core_event",
  "device_token": "550e8400-Core",
  "event": "safety_violation",
  "timestamp": 1695805218200,
  "severity": "CRITICAL",
  "details": {
    "violation_type": "pressure_exceed",
    "sensor": "pressure_main",
    "value": 9.5,
    "threshold": 9.0,
    "units": "bar",
    "action": "emergency_stop"
  }
}
```

**T+18.3s: Применение аварийной конфигурации**

```json
{
  "type": "core_event",
  "device_token": "550e8400-Core",
  "event": "emergency_activated",
  "timestamp": 1695805218300,
  "details": {
    "preset": "emergency",
    "actions_taken": [
      {"action": "valve_config", "valve": "valve_inlet", "state": "closed"},
      {"action": "valve_config", "valve": "valve_outlet", "state": "open"},
      {"action": "valve_config", "valve": "valve_relief", "state": "open"},
      {"action": "pump_control", "pump": "pump_main", "state": "stopped"},
      {"action": "alarm", "state": "activated"}
    ],
    "reason": "pressure_critical"
  }
}
```

**T+20s: Уведомление всех устройств**

```json
{
  "type": "command",
  "command_id": "emergency-notify",
  "priority": "EMERGENCY",
  "timestamp": 1695805220000,
  "routes": [
    {
      "device": "display",
      "payload": {
        "layout": "emergency",
        "alert": {
          "title": "АВАРИЙНАЯ ОСТАНОВКА",
          "message": "Критическое превышение давления",
          "severity": "CRITICAL",
          "icon": "alert",
          "color": "red",
          "flash": true,
          "sound": "alarm"
        },
        "info": {
          "pressure": "9.5 bar",
          "threshold": "9.0 bar",
          "action": "Сброс давления"
        }
      }
    },
    {
      "device": "terminal",
      "payload": {
        "action": "emergency_alert",
        "lock_interface": true,
        "message": "АВАРИЙНЫЙ РЕЖИМ АКТИВИРОВАН",
        "buttons_enabled": ["acknowledge"],
        "require_supervisor": true
      }
    }
  ]
}
```

**T+31s: Разрешение аварийной ситуации**

```json
{
  "type": "core_event",
  "device_token": "550e8400-Core",
  "event": "emergency_resolved",
  "timestamp": 1695805231000,
  "details": {
    "duration_ms": 12800,
    "final_state": {
      "pressure_main": 0.5,
      "all_valves": "safe_position",
      "alarms": "silenced"
    },
    "requires_inspection": true,
    "can_resume": false
  }
}
```

## 10.4 Сценарий: Потеря и восстановление связи

### 10.4.1 Временная шкала событий

```
T+0s    Последний успешный heartbeat
T+5s    Heartbeat отправлен, ACK получен
T+10s   Heartbeat отправлен, ACK получен
T+15s   Heartbeat отправлен, ACK НЕ получен
T+20s   Heartbeat отправлен, ACK НЕ получен (попытка 2)
T+25s   Heartbeat отправлен, ACK НЕ получен (попытка 3)
T+30s   Core: обнаружена потеря связи (timeout 30s)
T+31s   Core: переход в offline mode
T+32s   Core: применение emergency preset
T+33s   Core: начало локального логирования
T+35s   Core: первая попытка переподключения (неудача)
T+40s   Core: вторая попытка (задержка 5s, неудача)
T+50s   Core: третья попытка (задержка 10s, неудача)
T+80s   Core: четвертая попытка (задержка 30s, УСПЕХ!)
T+81s   Core → Cloud: reconnection_success
T+82s   Core → Cloud: offline_logs (33 записи)
T+83s   Cloud → Core: config_update
T+84s   Core: синхронизация состояния
T+85s   Core → Cloud: state_synchronized
T+86s   Core: возврат в IDLE
```

### 10.4.2 Сообщения offline периода

**T+31s: Локальная запись о переходе в offline**

```cpp
// Локальная структура лога
struct OfflineLogEntry {
    timestamp: 1695805231000,
    type: "SYSTEM",
    event: "CONNECTION_LOST",
    message: "Cloud connection timeout after 30000ms",
    sensor_snapshot: {
        pressure_main: 0.0,
        temperature: 23.5,
        valve_states: "all_closed"
    }
}
```

**T+81s: Уведомление о восстановлении**

```json
{
  "type": "core_event",
  "device_token": "550e8400-Core",
  "event": "reconnection_success",
  "timestamp": 1695805281000,
  "details": {
    "offline_duration_ms": 50000,
    "reconnect_attempts": 4,
    "offline_logs_count": 33,
    "data_integrity": "verified"
  }
}
```

**T+82s: Отправка накопленных логов**

```json
{
  "type": "offline_logs",
  "device_token": "550e8400-Core",
  "timestamp": 1695805282000,
  "offline_period": {
    "start": 1695805230000,
    "end": 1695805280000,
    "duration_ms": 50000
  },
  "logs": [
    {
      "timestamp": 1695805231000,
      "level": "ERROR",
      "source": "ConnectionMonitor",
      "message": "Connection lost to cloud",
      "sensors": {
        "pressure_main": 0.0,
        "temperature": 23.5
      }
    },
    {
      "timestamp": 1695805232000,
      "level": "INFO",
      "source": "EmergencyHandler",
      "message": "Applied emergency preset",
      "actions": ["valves_closed", "pumps_stopped"]
    },
    // ... еще 31 запись
  ],
  "checksum": "a3f5b8c9d2e1"
}
```

## 10.5 Сценарий: Сложная последовательность с множественными измерениями

### 10.5.1 Описание сценария

Комплексная диагностика гидравлического цилиндра с измерениями, испытаниями и фотофиксацией.

```
Шаги процесса:
1. Идентификация оператора (RFID)
2. Сканирование цилиндра (QR-код)
3. Визуальный осмотр с чек-листом
4. Измерение диаметра штока (BT-штангенциркуль)
5. Измерение хода поршня (BT-штангенциркуль)
6. Фотофиксация состояния "до"
7. Испытание давлением (подъем)
8. Измерение утечки
9. Испытание давлением (опускание)
10. Фотофиксация состояния "после"
11. Формирование отчета
```

### 10.5.2 Ключевые сообщения

**Шаг 4: Измерение с BT-устройством**

```json
{
  "type": "command",
  "command_id": "step-04-measure-rod",
  "step_number": 4,
  "routes": [
    {
      "device": "terminal",
      "payload": {
        "bt_measurement": {
          "device": "caliper_01",
          "parameter": "rod_diameter",
          "expected_range": [30, 50],
          "units": "mm",
          "instruction": "Измерьте диаметр штока в трех точках"
        },
        "multi_measurement": {
          "count": 3,
          "aggregate": "average"
        }
      }
    },
    {
      "device": "display",
      "payload": {
        "layout": "measurement_guide",
        "image": "rod_measurement_points.png",
        "live_value": {
          "binding": "terminal.bt.caliper_01",
          "format": "##.## мм"
        }
      }
    }
  ]
}
```

**Результат множественных измерений**

```json
{
  "type": "result",
  "device_token": "550e8400-Terminal",
  "command_id": "step-04-measure-rod",
  "data": {
    "measurements": [
      {"point": 1, "value": 35.12, "timestamp": 1695805240000},
      {"point": 2, "value": 35.15, "timestamp": 1695805245000},
      {"point": 3, "value": 35.14, "timestamp": 1695805250000}
    ],
    "aggregate": {
      "average": 35.14,
      "std": 0.015,
      "min": 35.12,
      "max": 35.15
    },
    "device": "caliper_01",
    "retry_count": 0
  }
}
```

**Финальный отчет**

```json
{
  "type": "diagnostic_report",
  "session_id": "DIAG-2024-001",
  "timestamp": 1695805500000,
  "equipment": {
    "type": "hydraulic_cylinder",
    "serial": "HC-2024-0156",
    "qr_code": "HC20240156"
  },
  "operator": {
    "id": "OP-1234",
    "name": "Иванов И.И.",
    "qualification": "Level 3"
  },
  "results": {
    "visual_inspection": "PASSED",
    "measurements": {
      "rod_diameter": {
        "value": 35.14,
        "tolerance": [35.0, 35.5],
        "status": "IN_TOLERANCE"
      },
      "piston_stroke": {
        "value": 250.5,
        "tolerance": [250, 255],
        "status": "IN_TOLERANCE"
      }
    },
    "pressure_tests": {
      "lifting": {
        "max_pressure": 5.02,
        "hold_time": 60,
        "leak_rate": 0.01,
        "status": "PASSED"
      },
      "lowering": {
        "max_pressure": 3.5,
        "control": "smooth",
        "status": "PASSED"
      }
    },
    "photos": {
      "before": ["photo_before_001.jpg"],
      "after": ["photo_after_001.jpg", "photo_after_002.jpg"]
    }
  },
  "conclusion": {
    "status": "SERVICEABLE",
    "recommendations": [],
    "next_inspection": "2025-01-20"
  },
  "signature": {
    "operator": "base64_signature_data",
    "timestamp": 1695805490000
  }
}
```

---

*Конец Раздела 10*