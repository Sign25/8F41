---
title: Раздел 5. Шаги работы стенда (служебные, боевые, алгоритмы)
order: 1.995001
---

# Раздел 5. Шаги работы стенда (служебные, боевые, алгоритмы)

## 5.1 Классификация шагов

### 5.1.1 Общая структура

> "Первые 10 шагов в пошаговой инструкции для стенда отведены для служебных функций"

| Категория | Диапазон | Назначение | Примеры |
|-----------|----------|------------|---------|
| **Служебные** | 0-9 | Инициализация и подготовка | Конфигуратор, идентификация, выбор режима |
| **Рабочие** | 10+ | Основные операции | Измерения, испытания, ремонт |

### 5.1.2 Таблица служебных шагов

| Шаг | Название | Описание | Обязательный |
|-----|----------|----------|--------------|
| 0 | Конфигуратор | Загрузка конфигурации стенда | ✅ |
| 1 | Идентификация | RFID идентификация оператора | ✅ |
| 2 | Сканирование | QR/RFID диагностируемого аппарата | ✅ |
| 3 | Выбор режима | Тип диагностики/ремонта | ✅ |
| 4 | Подготовка | Проверка готовности оборудования | ⚪ |
| 5 | Калибровка | Проверка калибровки приборов | ⚪ |
| 6-9 | Резерв | Дополнительные служебные функции | ⚪ |

### 5.1.3 Категории рабочих шагов

> "Действия могут быть следующего характера: простой ремонт (механические действия), измерить линейные значения, испытание"

| Тип шага | Действия | Оборудование |
|----------|----------|--------------|
| **Механический ремонт** | Запилить, почистить, протереть | Ручные инструменты |
| **Измерения** | Линейные размеры, вес, температура | BT-штангенциркуль, весы |
| **Испытания** | Давление, герметичность, расход | Клапаны, датчики, насосы |
| **Фотофиксация** | Фото до/после, дефекты | Камера Terminal |

## 5.2 Жизненный цикл шага

### 5.2.1 Состояния шага

```
┌─────────────┐
│   PENDING   │ - Шаг получен из облака
└──────┬──────┘
       ▼
┌─────────────┐
│ INITIALIZED │ - Конфигурация применена
└──────┬──────┘
       ▼
┌─────────────┐
│   RUNNING   │ - Выполняются действия
└──────┬──────┘
       ▼
┌─────────────┐
│   WAITING   │ - Ожидание физической кнопки
└──┬────┬─────┘
   │    │
   │    └─────► RETRY (кнопка "Повтор")
   ▼
┌─────────────┐
│  COMPLETED  │ - Данные отправлены в облако
└─────────────┘
```

### 5.2.2 Временные ограничения

> "Время одного измерения может быть как 10 секунд, так и 10 минут"

| Параметр | Минимум | Максимум | Примечание |
|----------|---------|----------|------------|
| Время до кнопки "Принять" | 5 секунд | Не ограничено | Защита от случайного нажатия |
| Длительность измерения | 10 секунд | 10 минут | Зависит от типа измерения |
| Таймаут ожидания действия | - | 30 минут | Автоматический сброс |

## 5.3 Служебные шаги (детализация)

### 5.3.1 Шаг 0: Конфигуратор

```python
# Алгоритм шага 0
def step_0_configurator():
    # Автоматически при включении
    if has_internet():
        config = download_config(stand_token)
        apply_config(config)
        save_to_cache(config)
    else:
        config = load_from_cache()
        apply_config(config)
        enter_offline_mode()
    
    return SUCCESS
```

### 5.3.2 Шаг 1: Идентификация оператора

> "Первый шаг – это мы ждем, когда пользователь с помощью своей ID-карты через RFID-считыватель частотой 125 кГц считает и идентифицирует себя"

```python
def step_1_identification():
    # Отображение на Display
    show_welcome_screen()
    display_instruction("Приложите ID-карту")
    
    # Ожидание RFID
    while True:
        card_id = read_rfid_125khz()
        if card_id:
            operator = validate_operator(card_id)
            if operator:
                # Успешная идентификация
                raise_protective_shutter()
                show_greeting(operator.name)
                log_operator_login(operator)
                return SUCCESS
            else:
                show_error("Неизвестная карта")
```

### 5.3.3 Шаг 2: Сканирование оборудования

> "Мы ждем, когда с помощью терминала слесарь считает QR-код с диагностируемого аппарата, либо RFID-тег"

```python
def step_2_scan_equipment():
    # Terminal активирует сканер
    terminal.enable_scanner()
    
    # Display показывает инструкцию
    display.show("Сканируйте QR-код или RFID-метку аппарата")
    
    while True:
        # Попытка считать QR
        qr_code = terminal.scan_qr()
        if qr_code:
            equipment = identify_equipment(qr_code)
            break
            
        # Попытка считать RFID
        rfid_tag = terminal.scan_rfid()
        if rfid_tag:
            equipment = identify_equipment(rfid_tag)
            break
    
    # Определение типа аппарата
    equipment_type = determine_equipment_type(equipment)
    load_equipment_procedures(equipment_type)
    
    return equipment
```

### 5.3.4 Шаг 3: Выбор режима работы

> "После определения типа аппарата он может предложить вариант ремонта, который на терминале пользователь может выбрать"

```python
def step_3_select_mode():
    # Получение доступных режимов
    available_modes = get_modes_for_equipment(equipment_type)
    
    # Отображение на Terminal
    terminal.show_menu({
        "title": "Выберите тип операции",
        "options": available_modes  # ["Диагностика", "Ремонт", "Испытание"]
    })
    
    # Ожидание выбора
    selected_mode = terminal.wait_selection()
    
    # Загрузка сценария
    load_scenario(equipment_type, selected_mode)
    
    return selected_mode
```

## 5.4 Рабочие шаги (детализация)

### 5.4.1 Механический ремонт

> "Простой ремонт, то есть выполнить какие-то механические действия, допустим запилить, почистить, протереть"

```python
def step_10_mechanical_repair():
    # Display: инструкция
    display.show_instructions([
        "1. Запилите поверхность надфилем",
        "2. Очистите от стружки",
        "3. Протрите спиртом"
    ])
    
    # Terminal: чек-лист
    terminal.show_checklist([
        {"id": 1, "text": "Поверхность запилена", "checked": False},
        {"id": 2, "text": "Стружка удалена", "checked": False},
        {"id": 3, "text": "Обезжирено", "checked": False}
    ])
    
    # Core: только мониторинг времени
    start_time = current_time()
    
    # Ожидание подтверждения
    wait_for_physical_button(min_time=5000)
    
    return {
        "duration": current_time() - start_time,
        "checklist": terminal.get_checklist_state()
    }
```

### 5.4.2 Измерение Bluetooth устройством

> "Он берет электронный штангенциркуль с блютузом и измеряет, подтверждая все значения"

```python
def step_11_bt_measurement():
    # Terminal: активация BT
    terminal.connect_bt_device("caliper_01")
    
    # Display: показ инструкции
    display.show({
        "title": "Измерение диаметра",
        "instruction": "Измерьте диаметр вала штангенциркулем",
        "image": "measurement_diagram.png"
    })
    
    while True:
        # Получение данных с BT
        measurement = terminal.get_bt_value("caliper_01")
        
        # Отображение на Display
        display.update_value(measurement)
        
        # Terminal держит данные
        terminal.store_measurement(measurement)
        
        # Ожидание кнопки
        button = wait_for_physical_button()
        
        if button == "ACCEPT":
            if time_since_start() < 5000:
                show_error("Слишком рано")
                continue
            # Отправка в облако
            send_to_cloud({
                "type": "bt_measurement",
                "device": "caliper_01",
                "value": measurement,
                "raw": measurement  # Данные передаются "как есть"
            })
            break
            
        elif button == "RETRY":
            # Сброс измерения
            terminal.clear_measurement()
            display.reset_value()
```

### 5.4.3 Испытание с управлением оборудованием

> "Стенд отправляет определенную конфигурацию, допустим, клапанов... мы ждем команду подтверждения начала диагностики"

```python
def step_12_pressure_test():
    # Core: подготовка оборудования
    core.apply_valve_config({
        "inlet": "closed",
        "outlet": "closed",
        "relief": "closed"
    })
    
    # Terminal: кнопка начала
    terminal.show_button("Начать испытание")
    
    # Display: схема испытания
    display.show_diagram("pressure_test_setup.svg")
    
    # Ожидание начала на Terminal
    terminal.wait_for_start_button()
    
    # Core: запуск испытания
    core.apply_valve_config({
        "inlet": "open",
        "outlet": "closed"
    })
    core.start_pump(speed=50)
    
    # Ожидание достижения давления
    start_time = current_time()
    while core.get_pressure() < 5.0:
        # Display: живое отображение
        display.update_gauge(core.get_pressure())
        
        if current_time() - start_time > 30000:
            return ERROR("Timeout reaching pressure")
    
    time_to_pressure = current_time() - start_time
    
    # Display: показ результата
    display.show_result({
        "pressure": 5.0,
        "time": time_to_pressure
    })
    
    # Ожидание физической кнопки
    button = wait_for_physical_button(min_time=5000)
    
    if button == "ACCEPT":
        # Отправка результатов
        send_to_cloud({
            "pressure_reached": 5.0,
            "time_ms": time_to_pressure
        })
    elif button == "RETRY":
        # Сброс и повтор
        core.apply_emergency_stop()
        return RETRY
```

## 5.5 Управление потоком данных

### 5.5.1 Принцип удержания данных

> "Терминал может держать измерения на себе, пока не нажмется кнопка «Подтвердить»"

```python
class Terminal:
    def __init__(self):
        self.pending_measurements = {}
    
    def store_measurement(self, device_id, value):
        # Данные хранятся локально
        self.pending_measurements[device_id] = {
            "value": value,
            "timestamp": current_time(),
            "synced": False
        }
    
    def on_accept_button(self):
        # При нажатии "Принять" все данные отправляются
        for device_id, data in self.pending_measurements.items():
            send_to_cloud(data)
            data["synced"] = True
    
    def on_retry_button(self):
        # При нажатии "Повтор" данные очищаются
        self.pending_measurements.clear()
```

### 5.5.2 Валидация времени

> "Если ответ пришел больше, чем 5 секунд, это считается нормальным. Если меньше 5 секунд, это значит ошибка"

```python
def validate_button_timing(button_type, elapsed_ms):
    if button_type == "ACCEPT":
        if elapsed_ms < 5000:
            return {
                "valid": False,
                "error": "TOO_EARLY",
                "message": f"Нажато через {elapsed_ms}мс, минимум 5000мс"
            }
        else:
            return {
                "valid": True,
                "duration": elapsed_ms
            }
    elif button_type == "RETRY":
        # Повтор можно нажать в любой момент
        return {"valid": True}
```

## 5.6 Обработка повторов

### 5.6.1 Неограниченные повторы

> "Количество повторов неограничено"

```python
class StepExecutor:
    def execute_step_with_retry(self, step):
        retry_count = 0
        
        while True:
            result = execute_step(step)
            
            if result.button == "ACCEPT":
                # Успешное завершение
                log_step_complete(step, retry_count)
                return result
                
            elif result.button == "RETRY":
                retry_count += 1
                # Сброс состояния
                reset_step_state(step)
                # Уведомление
                notify_retry(step, retry_count)
                # Продолжаем цикл
                continue
```

### 5.6.2 Действия при повторе

| Компонент | Действие при повторе |
|-----------|---------------------|
| **Core** | Сброс измерений, возврат клапанов в исходное |
| **Terminal** | Очистка сохраненных BT-данных |
| **Display** | Сброс отображаемых значений |
| **Cloud** | Логирование попытки повтора |

## 5.7 Примеры полных сценариев

### 5.7.1 Сценарий: Диагностика с измерением

```yaml
Шаги:
  1. Идентификация оператора (RFID)
  2. Сканирование аппарата (QR)
  3. Выбор "Диагностика"
  10. Визуальный осмотр (чек-лист)
  11. Измерение зазора (BT-штангенциркуль)
  12. Испытание давлением
  13. Фотофиксация результата
  14. Формирование отчета
```

### 5.7.2 Сценарий: Ремонт с заменой детали

```yaml
Шаги:
  1. Идентификация оператора
  2. Сканирование аппарата
  3. Выбор "Ремонт"
  10. Демонтаж узла (инструкция)
  11. Измерение износа (BT-микрометр)
  12. Замена детали (чек-лист)
  13. Сборка узла (инструкция)
  14. Контрольное измерение
  15. Испытание работоспособности
```

---

*Конец Раздела 5*