---
title: >-
  Раздел 8. Core (ESP32-P4) - управление шагами, кнопки, 5-секундный барьер,
  state-machine
order: 1.999377
---

# Раздел 8. Core (ESP32-P4) - управление шагами, кнопки, 5-секундный барьер, state-machine

## 8.1 Архитектура Core

### 8.1.1 Определение и роль

Core - это центральный контроллер на базе микроконтроллера ESP32-P4, являющийся исполнительным ядром стенда.

**Основные функции:**
- Управление физическим оборудованием (клапаны, насосы, датчики)
- Обработка физических кнопок "Принять" и "Повтор"
- Маршрутизация команд между облаком и локальными устройствами
- Выполнение action-последовательностей
- Контроль безопасности и аварийных режимов
- Отправка heartbeat в облако

### 8.1.2 Аппаратная платформа ESP32-P4

| Параметр | Значение | Применение |
|----------|----------|------------|
| CPU | Dual-core RISC-V 400 MHz | Основная логика + real-time задачи |
| RAM | 768 KB SRAM | Буферы данных и конфигурация |
| Flash | 32 MB | Программа + локальное хранение |
| GPIO | 54 пина | Управление оборудованием |
| ADC | 20 каналов, 12 бит | Аналоговые датчики |
| PWM | 8 каналов | Управление пропорциональными клапанами |
| UART | 3 порта | RS-485 для Modbus |
| Ethernet | 10/100 MAC | Основная связь |
| Wi-Fi | 802.11 b/g/n | Резервный канал |

### 8.1.3 Программная архитектура

```cpp
// Core Application Structure
class CoreApplication {
private:
    StateMachine stateMachine;
    ConfigManager config;
    WebSocketClient wsClient;
    CommandExecutor executor;
    ButtonHandler buttons;
    SafetyMonitor safety;
    ModbusManager modbus;
    HeartbeatManager heartbeat;
    
public:
    void setup() {
        Serial.begin(115200);
        
        // Инициализация файловой системы
        SPIFFS.begin(true);
        
        // Загрузка конфигурации
        loadConfiguration();
        
        // Инициализация оборудования
        initHardware();
        
        // Подключение к облаку
        connectToCloud();
        
        // Запуск FreeRTOS задач
        xTaskCreatePinnedToCore(
            websocketTask, "WebSocket", 8192, NULL, 1, NULL, 0
        );
        xTaskCreatePinnedToCore(
            buttonTask, "Buttons", 4096, NULL, 2, NULL, 1
        );
        xTaskCreatePinnedToCore(
            safetyTask, "Safety", 4096, NULL, 3, NULL, 1
        );
        
        stateMachine.transition(CoreState::IDLE);
    }
    
    void loop() {
        // Основной цикл
        executor.processCommands();
        safety.checkInterlocks();
        heartbeat.sendIfNeeded();
        delay(10);
    }
};
```

## 8.2 State Machine

### 8.2.1 Состояния Core

```cpp
enum class CoreState {
    INITIALIZING,   // Загрузка и инициализация
    IDLE,           // Ожидание команд
    IDENTIFIED,     // Оператор идентифицирован
    EXECUTING,      // Выполнение команды
    WAITING_BUTTON, // Ожидание физической кнопки
    EMERGENCY,      // Аварийный режим
    MAINTENANCE,    // Режим обслуживания
    ERROR           // Состояние ошибки
};
```

### 8.2.2 Переходы между состояниями

```cpp
class StateMachine {
private:
    CoreState currentState = CoreState::INITIALIZING;
    CoreState previousState = CoreState::INITIALIZING;
    unsigned long stateEntryTime = 0;
    
    // Матрица разрешенных переходов
    bool transitionMatrix[8][8] = {
        // FROM: INIT, IDLE, IDENT, EXEC, WAIT, EMER, MAINT, ERROR
        /*INIT*/  {0, 1, 0, 0, 0, 1, 0, 1},
        /*IDLE*/  {0, 0, 1, 0, 0, 1, 1, 1},
        /*IDENT*/ {0, 1, 0, 1, 0, 1, 0, 1},
        /*EXEC*/  {0, 0, 0, 0, 1, 1, 0, 1},
        /*WAIT*/  {0, 1, 0, 1, 0, 1, 0, 1},
        /*EMER*/  {1, 1, 0, 0, 0, 0, 1, 0},
        /*MAINT*/ {0, 1, 0, 0, 0, 1, 0, 1},
        /*ERROR*/ {1, 1, 0, 0, 0, 1, 1, 0}
    };
    
public:
    bool transition(CoreState newState) {
        // Проверка допустимости перехода
        if (!isTransitionAllowed(currentState, newState)) {
            logError("Invalid state transition");
            return false;
        }
        
        // Выход из текущего состояния
        onStateExit(currentState);
        
        // Сохранение предыдущего
        previousState = currentState;
        currentState = newState;
        stateEntryTime = millis();
        
        // Вход в новое состояние
        onStateEnter(newState);
        
        // Уведомление облака
        notifyStateChange(newState);
        
        return true;
    }
    
    void onStateEnter(CoreState state) {
        switch(state) {
            case CoreState::IDLE:
                resetAllSystems();
                enableHeartbeat();
                break;
                
            case CoreState::EMERGENCY:
                applyEmergencyPreset();
                soundAlarm();
                notifyCloud("EMERGENCY");
                break;
                
            case CoreState::WAITING_BUTTON:
                enableButtonInterrupts();
                startButtonTimeout(300000); // 5 минут
                break;
        }
    }
};
```

### 8.2.3 Диаграмма состояний

```
         ┌──────────────┐
         │ INITIALIZING │
         └──────┬───────┘
                │ Config loaded
                ▼
         ┌──────────────┐
         │     IDLE     │◄─────────┐
         └──────┬───────┘          │
                │ RFID scan        │
                ▼                  │
         ┌──────────────┐          │
         │  IDENTIFIED  │          │
         └──────┬───────┘          │
                │ Command received │
                ▼                  │
         ┌──────────────┐          │
         │  EXECUTING   │          │
         └──────┬───────┘          │
                │ Min time elapsed │
                ▼                  │
         ┌──────────────┐          │
         │WAITING_BUTTON├──────────┘
         └──────┬───────┘  Button pressed
                │
                │ Connection lost
                ▼
         ┌──────────────┐
         │  EMERGENCY   │
         └──────────────┘
```

## 8.3 Физические кнопки

### 8.3.1 Конфигурация кнопок

> "Кнопки подтверждения и повторного измерения они физические"

```cpp
class ButtonHandler {
private:
    static const uint8_t PIN_BUTTON_ACCEPT = 18;
    static const uint8_t PIN_BUTTON_RETRY = 19;
    static const uint8_t PIN_BUTTON_EMERGENCY = 36;
    
    static const uint32_t DEBOUNCE_TIME = 50;    // мс
    static const uint32_t MIN_PRESS_TIME = 100;  // мс
    static const uint32_t MIN_STEP_TIME = 5000;  // 5 секунд
    
    volatile bool acceptPressed = false;
    volatile bool retryPressed = false;
    volatile bool emergencyPressed = false;
    
    unsigned long stepStartTime = 0;
    
public:
    void init() {
        // Настройка пинов с подтяжкой
        pinMode(PIN_BUTTON_ACCEPT, INPUT_PULLUP);
        pinMode(PIN_BUTTON_RETRY, INPUT_PULLUP);
        pinMode(PIN_BUTTON_EMERGENCY, INPUT_PULLUP);
        
        // Прерывания на падающий фронт
        attachInterrupt(PIN_BUTTON_ACCEPT, acceptISR, FALLING);
        attachInterrupt(PIN_BUTTON_RETRY, retryISR, FALLING);
        attachInterrupt(PIN_BUTTON_EMERGENCY, emergencyISR, FALLING);
    }