# Раздел 7. Display (TV) - живое отображение, итоги

## 7.1 Назначение Display

### 7.1.1 Определение и роль

Display - это телевизор или промышленный монитор большой диагонали, предназначенный для визуализации процесса испытаний и отображения инструкций оператору.

**Основные функции:**
- Отображение пошаговых инструкций
- Визуализация живых данных с датчиков
- Показ схем и диаграмм
- Отображение результатов измерений
- Предупреждения и статусы
- Мнемосхемы оборудования

### 7.1.2 Требования к оборудованию

| Параметр | Минимум | Рекомендация |
|----------|---------|--------------|
| Диагональ | 32" | 43-55" |
| Разрешение | Full HD (1920x1080) | 4K (3840x2160) |
| Яркость | 300 кд/м² | 500 кд/м² |
| Частота | 60 Гц | 120 Гц для плавности |
| Интерфейс | HDMI | HDMI + DisplayPort |
| Сеть | Ethernet | Ethernet + Wi-Fi |

### 7.1.3 Принципы отображения

```javascript
// Display Controller Architecture
class DisplayController {
    constructor() {
        this.current_layout = null;
        this.live_bindings = new Map();
        this.update_timer = null;
        this.websocket = new WebSocketClient();
    }
    
    handleCommand(command) {
        const display_config = command.routes.display;
        
        // Загрузка макета
        this.loadLayout(display_config.layout);
        
        // Настройка живых привязок
        if (display_config.live_bindings) {
            this.setupLiveBindings(display_config.live_bindings);
        }
        
        // Отображение контента
        this.render(display_config.content);
    }
}
```

## 7.2 Layouts (макеты отображения)

### 7.2.1 Типы макетов

| Layout | Назначение | Элементы |
|--------|------------|----------|
| `welcome` | Приветствие | Логотип, время, инструкция входа |
| `instruction` | Инструкции | Текст, изображения, чек-листы |
| `measurement` | Измерения | Графики, текущие значения, целевые показатели |
| `diagnostic` | Диагностика | Мнемосхема, живые данные, индикаторы |
| `pressure_gauge` | Давление | Аналоговый прибор, график, числовое значение |
| `summary` | Итоги | Таблица результатов, статус, QR-код |
| `warning` | Предупреждение | Иконка, сообщение, рекомендуемые действия |
| `emergency` | Авария | Критическое предупреждение, инструкции |

### 7.2.2 Структура макета

```json
{
  "layout": "diagnostic",
  "sections": {
    "header": {
      "type": "text",
      "content": "Испытание давлением",
      "style": "h1"
    },
    "main": {
      "type": "split",
      "left": {
        "type": "gauge",
        "binding": "core.pressure_main",
        "config": {
          "min": 0,
          "max": 10,
          "units": "bar",
          "zones": [
            {"from": 0, "to": 3, "color": "green"},
            {"from": 3, "to": 8, "color": "yellow"},
            {"from": 8, "to": 10, "color": "red"}
          ]
        }
      },
      "right": {
        "type": "chart",
        "binding": "core.pressure_history",
        "config": {
          "type": "line",
          "duration": 60,
          "update_rate": 10
        }
      }
    },
    "footer": {
      "type": "status_bar",
      "items": [
        {"label": "Время", "binding": "system.time"},
        {"label": "Оператор", "binding": "operator.name"},
        {"label": "Шаг", "binding": "current_step"}
      ]
    }
  }
}
```

### 7.2.3 Адаптивные макеты

```css
/* Responsive Layout Grid */
.display-container {
    display: grid;
    grid-template-rows: 10% 80% 10%;
    height: 100vh;
}

.main-section {
    display: flex;
    justify-content: center;
    align-items: center;
}

/* Автомасштабирование для разных экранов */
@media (max-width: 1920px) {
    .gauge { transform: scale(0.8); }
}

@media (min-width: 3840px) {
    .gauge { transform: scale(1.5); }
}
```

## 7.3 Live Bindings (живые привязки)

### 7.3.1 Источники данных

> "На дисплей также в живом времени должны передаваться некие данные измерения"

| Источник | Формат привязки | Частота обновления |
|----------|-----------------|-------------------|
| Core датчики | `core.live.<sensor_id>` | 10 Гц |
| BT устройства | `terminal.bt.<device_id>` | По получению |
| Системные | `system.<parameter>` | 1 Гц |
| Расчетные | `calc.<formula>` | По изменению |

### 7.3.2 Механизм обновления

```javascript
class LiveDataManager {
    constructor() {
        this.bindings = new Map();
        this.updateRate = 100; // 10 Hz по умолчанию
    }
    
    setupBinding(elementId, dataSource) {
        // Парсинг источника
        const [device, type, channel] = dataSource.split('.');
        
        // Создание привязки
        const binding = {
            element: document.getElementById(elementId),
            source: dataSource,
            lastValue: null,
            updateCallback: this.createUpdateCallback(elementId)
        };
        
        this.bindings.set(dataSource, binding);
        
        // Подписка на данные
        this.subscribeToData(dataSource);
    }
    
    subscribeToData(source) {
        // WebSocket подписка
        this.websocket.send({
            type: 'subscribe',
            channels: [source],
            rate: this.updateRate
        });
        
        // Обработка входящих данных
        this.websocket.on('telemetry', (data) => {
            if (data.channel === source) {
                this.updateBinding(source, data.value);
            }
        });
    }
    
    updateBinding(source, value) {
        const binding = this.bindings.get(source);
        if (!binding) return;
        
        // Проверка изменения
        if (value !== binding.lastValue) {
            binding.updateCallback(value);
            binding.lastValue = value;
            
            // Анимация изменения
            this.animateChange(binding.element);
        }
    }
}
```

### 7.3.3 Формат потока телеметрии

```json
{
  "type": "telemetry_stream",
  "timestamp": 1695805200000,
  "data": [
    {
      "channel": "core.live.pressure_main",
      "value": 5.23,
      "units": "bar",
      "quality": "good"
    },
    {
      "channel": "core.live.temperature",
      "value": 24.5,
      "units": "celsius",
      "quality": "good"
    },
    {
      "channel": "terminal.bt.caliper_01",
      "value": 45.67,
      "units": "mm",
      "quality": "good"
    }
  ]
}
```

## 7.4 Визуализация данных

### 7.4.1 Компоненты визуализации

**Gauge (Стрелочный прибор)**
```javascript
class GaugeComponent {
    constructor(config) {
        this.min = config.min;
        this.max = config.max;
        this.value = 0;
        this.zones = config.zones;
    }
    
    render() {
        return `
            <svg class="gauge" viewBox="0 0 200 150">
                <!-- Шкала -->
                <path d="M 20 130 A 80 80 0 0 1 180 130" 
                      stroke="#333" fill="none" stroke-width="2"/>
                
                <!-- Цветовые зоны -->
                ${this.renderZones()}
                
                <!-- Стрелка -->
                <line x1="100" y1="130" 
                      x2="${this.getPointerX()}" 
                      y2="${this.getPointerY()}"
                      stroke="red" stroke-width="3"/>
                
                <!-- Цифровое значение -->
                <text x="100" y="100" text-anchor="middle">
                    ${this.value.toFixed(2)} ${this.units}
                </text>
            </svg>
        `;
    }
    
    updateValue(newValue) {
        // Плавная анимация стрелки
        this.animatePointer(this.value, newValue);
        this.value = newValue;
        
        // Проверка критических зон
        this.checkZones(newValue);
    }
}
```

**Line Chart (График)**
```javascript
class LineChartComponent {
    constructor(config) {
        this.duration = config.duration; // секунд
        this.maxPoints = config.duration * config.update_rate;
        this.data = [];
    }
    
    addPoint(value) {
        this.data.push({
            time: Date.now(),
            value: value
        });
        
        // Удаление старых точек
        if (this.data.length > this.maxPoints) {
            this.data.shift();
        }
        
        this.redraw();
    }
    
    redraw() {
        // Используем D3.js или Chart.js
        const chart = d3.select('.chart')
            .datum(this.data)
            .call(this.lineChart);
    }
}
```

### 7.4.2 Мнемосхемы

```javascript
class MnemoschemeComponent {
    constructor(schemeConfig) {
        this.elements = schemeConfig.elements;
        this.pipes = schemeConfig.pipes;
        this.animations = schemeConfig.animations;
    }
    
    render() {
        return `
            <div class="mnemoscheme">
                <!-- Трубопроводы -->
                ${this.pipes.map(pipe => this.renderPipe(pipe))}
                
                <!-- Элементы (клапаны, насосы) -->
                ${this.elements.map(elem => this.renderElement(elem))}
                
                <!-- Анимация потока -->
                ${this.animations.map(anim => this.renderAnimation(anim))}
            </div>
        `;
    }
    
    updateElement(elementId, state) {
        const element = document.querySelector(`#${elementId}`);
        
        // Изменение состояния (цвет, анимация)
        if (state === 'open') {
            element.classList.add('valve-open');
            element.classList.remove('valve-closed');
        } else {
            element.classList.add('valve-closed');
            element.classList.remove('valve-open');
        }
        
        // Анимация потока если открыто
        if (state === 'open') {
            this.startFlowAnimation(elementId);
        }
    }
}
```

### 7.4.3 Анимации и переходы

```css
/* Плавные переходы значений */
.value-display {
    transition: all 0.3s ease;
}

.value-display.changed {
    animation: pulse 0.5s;
    color: #FFD700;
}

@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
}

/* Анимация потока в трубах */
.flow-animation {
    stroke-dasharray: 10 5;
    animation: flow 2s linear infinite;
}

@keyframes flow {
    to { stroke-dashoffset: -15; }
}

/* Вращение насоса */
.pump.running {
    animation: rotate 2s linear infinite;
}

@keyframes rotate {
    to { transform: rotate(360deg); }
}
```

## 7.5 Summary (итоговые экраны)

### 7.5.1 Структура итогового экрана

```json
{
  "layout": "summary",
  "title": "Испытание завершено",
  "status": "PASSED",
  "sections": {
    "results": {
      "type": "table",
      "data": [
        {"parameter": "Максимальное давление", "value": "5.23 bar", "status": "✓"},
        {"parameter": "Время удержания", "value": "60 сек", "status": "✓"},
        {"parameter": "Утечка", "value": "0.02 bar/мин", "status": "✓"}
      ]
    },
    "measurements": {
      "type": "list",
      "items": [
        {"device": "Штангенциркуль", "value": "45.67 мм"},
        {"device": "Микрометр", "value": "45.665 мм"}
      ]
    },
    "photos": {
      "type": "gallery",
      "thumbnails": ["photo1_thumb.jpg", "photo2_thumb.jpg"]
    },
    "qr_code": {
      "type": "qr",
      "data": "REPORT:550e8400:2024-01-20:PASS",
      "size": 200
    }
  }
}
```

### 7.5.2 Генерация отчета

```javascript
class SummaryGenerator {
    generateSummary(stepResults) {
        const summary = {
            timestamp: Date.now(),
            operator: this.getOperatorInfo(),
            equipment: this.getEquipmentInfo(),
            results: this.aggregateResults(stepResults),
            status: this.determineStatus(stepResults)
        };
        
        // Генерация QR-кода с ссылкой на полный отчет
        summary.qr_code = this.generateQRCode({
            type: 'report',
            stand_id: this.stand_token,
            session_id: this.session_id,
            status: summary.status
        });
        
        return summary;
    }
    
    renderSummary(summary) {
        return `
            <div class="summary-screen">
                <h1 class="${summary.status.toLowerCase()}">
                    ${summary.status === 'PASSED' ? '✓ Испытание пройдено' : '✗ Испытание не пройдено'}
                </h1>
                
                <div class="results-table">
                    ${this.renderResultsTable(summary.results)}
                </div>
                
                <div class="footer">
                    <div class="qr-code">
                        ${summary.qr_code}
                    </div>
                    <div class="info">
                        <p>Оператор: ${summary.operator.name}</p>
                        <p>Время: ${new Date(summary.timestamp).toLocaleString()}</p>
                    </div>
                </div>
            </div>
        `;
    }
}
```

## 7.6 Обработка ошибок на Display

### 7.6.1 Типы ошибок и их отображение

```javascript
class ErrorHandler {
    displayError(error) {
        const severity = this.determineSeverity(error);
        
        switch(severity) {
            case 'critical':
                this.showCriticalError(error);
                break;
            case 'warning':
                this.showWarning(error);
                break;
            case 'info':
                this.showInfo(error);
                break;
        }
    }
    
    showCriticalError(error) {
        // Полноэкранное красное предупреждение
        const template = `
            <div class="error-screen critical">
                <div class="error-icon">⚠️</div>
                <h1>КРИТИЧЕСКАЯ ОШИБКА</h1>
                <p class="error-message">${error.message}</p>
                <div class="error-actions">
                    <button onclick="acknowledgeError()">Подтвердить</button>
                    <button onclick="callSupport()">Вызвать поддержку</button>
                </div>
                <div class="error-details">
                    <p>Код: ${error.code}</p>
                    <p>Время: ${new Date().toLocaleString()}</p>
                </div>
            </div>
        `;
        
        this.renderFullScreen(template);
        this.playAlarmSound();
    }
}
```

### 7.6.2 Сообщения о потере связи

```javascript
class ConnectionMonitor {
    constructor() {
        this.lastHeartbeat = Date.now();
        this.connectionLost = false;
    }
    
    checkConnection() {
        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
        
        if (timeSinceLastHeartbeat > 5000 && !this.connectionLost) {
            this.showConnectionWarning();
        }
        
        if (timeSinceLastHeartbeat > 30000) {
            this.showConnectionLost();
            this.connectionLost = true;
        }
    }
    
    showConnectionWarning() {
        this.showNotification({
            type: 'warning',
            message: 'Нестабильное соединение',
            icon: '📡',
            position: 'top-right',
            duration: 3000
        });
    }
    
    showConnectionLost() {
        const template = `
            <div class="overlay connection-lost">
                <div class="message-box">
                    <h2>Потеря связи</h2>
                    <p>Соединение с облаком потеряно</p>
                    <p>Стенд работает в автономном режиме</p>
                    <div class="spinner"></div>
                    <p class="status">Попытка переподключения...</p>
                </div>
            </div>
        `;
        
        this.renderOverlay(template);
    }
}
```

### 7.6.3 Индикация состояния системы

```javascript
class StatusIndicator {
    constructor() {
        this.modules = {
            core: 'unknown',
            terminal: 'unknown',
            cloud: 'unknown'
        };
    }
    
    updateStatus(module, status) {
        this.modules[module] = status;
        this.render();
    }
    
    render() {
        const statusBar = `
            <div class="status-bar">
                ${Object.entries(this.modules).map(([module, status]) => `
                    <div class="status-item ${status}">
                        <span class="indicator"></span>
                        <span class="label">${module}</span>
                    </div>
                `).join('')}
                <div class="timestamp">
                    ${new Date().toLocaleTimeString()}
                </div>
            </div>
        `;
        
        document.querySelector('.status-container').innerHTML = statusBar;
    }
}
```

---

*Конец Раздела 7*