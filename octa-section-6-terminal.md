---
title: Раздел 6. Terminal (HMI) - Bluetooth, фото, retry, хранение данных
order: 1.997502
---

# Раздел 6. Terminal (HMI) - Bluetooth, фото, retry, хранение данных

## 6.1 Архитектура Terminal

### 6.1.1 Определение и назначение

Terminal (Human Machine Interface) - это планшет или промышленная панель с сенсорным экраном, выполняющая роль интерфейса между оператором и системой.

**Основные функции:**
- Сбор данных с Bluetooth измерительных приборов
- Интерфейс для ввода данных оператором
- Фотофиксация процесса и результатов
- Локальное хранение промежуточных данных до подтверждения
- Управление повторами измерений

### 6.1.2 Аппаратная платформа

| Параметр | Требование | Рекомендация |
|----------|------------|--------------|
| ОС | Android 10+ или Linux | Android для простоты BT |
| Экран | Минимум 10" | 12-15" для удобства |
| Защита | IP54 | IP65 для тяжелых условий |
| Bluetooth | BLE 5.0 + Classic | Dual mode обязательно |
| Камера | 8 MP с автофокусом | 12 MP со вспышкой |
| Память | 32 GB | 64 GB для фото |
| Процессор | Snapdragon 660+ | Snapdragon 778G |
| RAM | 4 GB | 6-8 GB |

### 6.1.3 Программная архитектура

```javascript
// Terminal Application Structure
class TerminalApp {
    constructor() {
        this.bluetooth_manager = new BluetoothManager();
        this.camera_module = new CameraModule();
        this.data_storage = new LocalStorage();
        this.websocket_client = new WebSocketClient();
        this.form_renderer = new FormRenderer();
        this.retry_handler = new RetryHandler();
    }
    
    async handleCommand(command) {
        const action = command.routes.terminal.action;
        
        switch(action) {
            case 'collect_bt_data':
                return await this.collectBluetoothData(command);
            case 'capture_photo':
                return await this.capturePhoto(command);
            case 'show_form':
                return await this.showForm(command);
            case 'enable_retry':
                return this.enableRetryButton(command);
        }
    }
}
```

## 6.2 Bluetooth интеграция

### 6.2.1 Поддерживаемые устройства

> "Измерительное устройство по блютузу уже отдаёт данные в подготовленном виде"

| Устройство | Протокол | Service UUID | Формат данных | Производитель |
|------------|----------|--------------|---------------|---------------|
| Штангенциркуль | BLE | 0xFFE0 | Float32, мм | Mitutoyo, Mahr |
| Микрометр | BLE | 0xFFE0 | Float32, мкм | Mitutoyo |
| Толщиномер | Classic SPP | - | ASCII string | Elcometer |
| Весы | BLE | 0x181D | Float32, кг | Mettler Toledo |
| Угломер | BLE | 0xFFE1 | Float32, градусы | Bosch |
| Динамометр | BLE | 0xFFE2 | Float32, Н | Mecmesin |

### 6.2.2 Протокол подключения

```javascript
class BluetoothManager {
    constructor() {
        this.connectedDevices = new Map();
        this.measurementBuffer = new Map();
    }
    
    async connectDevice(deviceConfig) {
        // Сканирование устройств
        const devices = await this.scan({
            filters: [{
                services: [deviceConfig.service_uuid],
                name: deviceConfig.name_prefix
            }],
            timeout: 10000
        });
        
        if (devices.length === 0) {
            throw new Error("Устройство не найдено");
        }
        
        // Подключение к устройству
        const device = devices[0];
        await device.connect();
        
        // Получение сервиса и характеристики
        const service = await device.getService(deviceConfig.service_uuid);
        const characteristic = await service.getCharacteristic(deviceConfig.char_uuid);
        
        // Подписка на уведомления
        characteristic.on('valuechanged', (data) => {
            this.handleMeasurement(deviceConfig.id, data);
        });
        
        await characteristic.startNotifications();
        
        // Сохранение устройства
        this.connectedDevices.set(deviceConfig.id, device);
        
        return device;
    }
    
    handleMeasurement(deviceId, rawData) {
        // Декодирование в зависимости от устройства
        const value = this.decodeValue(deviceId, rawData);
        
        // Сохранение локально (НЕ отправляем сразу!)
        this.storeMeasurement(deviceId, value);
        
        // Обновление UI
        this.updateUI(deviceId, value);
    }
    
    decodeValue(deviceId, rawData) {
        const deviceType = this.getDeviceType(deviceId);
        
        switch(deviceType) {
            case 'caliper':
                // Float32 Little Endian
                return new DataView(rawData.buffer).getFloat32(0, true);
            
            case 'ascii':
                // ASCII string
                return parseFloat(new TextDecoder().decode(rawData));
            
            default:
                return rawData;
        }
    }
}
```

### 6.2.3 Обработка данных BT

> "Отправляем, так сказать, сырые"

```javascript
class BTDataHandler {
    constructor() {
        this.measurements = {};
        this.device_token = getDeviceToken();
    }
    
    storeMeasurement(deviceId, rawValue) {
        // Сохраняем именно сырые данные
        this.measurements[deviceId] = {
            raw: rawValue,
            timestamp: Date.now(),
            device: {
                id: deviceId,
                type: this.getDeviceType(deviceId),
                mac: this.getDeviceMac(deviceId)
            },
            rssi: this.getSignalStrength(deviceId),
            battery: this.getBatteryLevel(deviceId)
        };
        
        // Отображаем с форматированием для оператора
        const displayValue = this.formatForDisplay(rawValue);
        this.ui.showValue(displayValue);
    }
    
    async sendToCloud() {
        // При нажатии физической кнопки отправляем сырые данные
        const payload = {
            type: "bt_telemetry",
            device_token: this.device_token,
            command_id: this.current_command_id,
            measurements: this.measurements, // Сырые данные без обработки
            timestamp: Date.now()
        };
        
        await this.websocket.send(payload);
    }
    
    formatForDisplay(value) {
        // Форматирование только для отображения
        if (typeof value === 'number') {
            return value.toFixed(2);
        }
        return String(value);
    }
}
```

### 6.2.4 Формат телеметрии

```json
{
  "type": "bt_telemetry",
  "device_token": "550e8400-Terminal",
  "command_id": "step-11-measure",
  "timestamp": 1695805200000,
  "measurements": {
    "caliper_01": {
      "device": {
        "id": "caliper_01",
        "mac": "AA:BB:CC:DD:EE:FF",
        "type": "caliper",
        "manufacturer": "Mitutoyo",
        "model": "500-196-30"
      },
      "data": {
        "raw": "45.67",
        "units": "mm",
        "timestamp": 1695805195000,
        "rssi": -65,
        "battery": 85,
        "quality": "good"
      }
    }
  },
  "retry_count": 0
}
```

## 6.3 Фотофиксация

### 6.3.1 Требования к фотографиям

| Параметр | Требование | Обоснование |
|----------|------------|-------------|
| Разрешение | Минимум 1920x1080 | Достаточно для документации |
| Формат | JPEG | Баланс качества и размера |
| Качество сжатия | 85% | Оптимальное соотношение |
| Метаданные | EXIF полные | Время, GPS (если есть), параметры |
| Максимальный размер | 5 МБ | Для быстрой передачи |
| Автофокус | Обязательно | Четкость изображения |
| Вспышка | Автоматически | Адаптация к освещению |

### 6.3.2 Процесс фотографирования

```javascript
class CameraModule {
    constructor() {
        this.photos = [];
        this.camera = null;
    }
    
    async capturePhoto(requirements) {
        // Инициализация камеры
        this.camera = await this.initCamera({
            resolution: requirements.resolution || '1920x1080',
            quality: requirements.quality || 85,
            flash: 'auto',
            autofocus: true
        });
        
        let photos = [];
        let retakeCount = 0;
        
        while (photos.length < requirements.min_photos) {
            // Захват изображения
            const photo = await this.camera.takePicture();
            
            // Добавление метаданных
            photo.metadata = {
                timestamp: Date.now(),
                command_id: this.current_command_id,
                operator: this.operator_id,
                step: this.current_step,
                equipment_id: this.equipment_id,
                retake: retakeCount > 0,
                gps: await this.getGPSLocation()
            };
            
            // Показ превью с опциями
            const action = await this.showPreview(photo);
            
            if (action === 'accept') {
                photos.push(photo);
                await this.saveLocally(photo);
                
            } else if (action === 'retake') {
                retakeCount++;
                continue;
                
            } else if (action === 'cancel') {
                throw new Error('Фотофиксация отменена оператором');
            }
        }
        
        // Постановка в очередь загрузки
        this.scheduleUpload(photos);
        
        return photos;
    }
    
    async showPreview(photo) {
        // Отображение превью с кнопками
        return new Promise((resolve) => {
            this.ui.showPhotoPreview({
                image: photo,
                buttons: [
                    {text: 'Принять', action: () => resolve('accept')},
                    {text: 'Переснять', action: () => resolve('retake')},
                    {text: 'Отменить', action: () => resolve('cancel')}
                ]
            });
        });
    }
}
```

### 6.3.3 Локальное сохранение и загрузка

```javascript
class PhotoStorage {
    constructor() {
        this.uploadQueue = [];
        this.uploadInProgress = false;
    }
    
    async saveLocally(photo) {
        // Генерация имени файла
        const filename = `${photo.metadata.command_id}_${photo.metadata.timestamp}.jpg`;
        const path = `/storage/photos/${filename}`;
        
        // Сохранение файла
        await this.filesystem.write(path, photo.data);
        
        // Запись в локальную БД
        await this.db.photos.insert({
            path: path,
            command_id: photo.metadata.command_id,
            timestamp: photo.metadata.timestamp,
            uploaded: false,
            size: photo.data.byteLength,
            metadata: JSON.stringify(photo.metadata)
        });
        
        return path;
    }
    
    async uploadPhotos() {
        if (this.uploadInProgress) return;
        this.uploadInProgress = true;
        
        try {
            const pending = await this.db.photos.find({uploaded: false});
            
            for (const record of pending) {
                try {
                    // Чтение файла
                    const data = await this.filesystem.read(record.path);
                    
                    // Загрузка в облако
                    await this.cloud.uploadPhoto({
                        data: data,
                        metadata: JSON.parse(record.metadata)
                    });
                    
                    // Отметка как загруженное
                    await this.db.photos.update(record.id, {
                        uploaded: true,
                        uploaded_at: Date.now()
                    });
                    
                } catch (error) {
                    console.error(`Failed to upload ${record.path}:`, error);
                    // Повторная попытка позже
                }
            }
        } finally {
            this.uploadInProgress = false;
        }
    }
}
```

## 6.4 Формы ввода данных

### 6.4.1 Типы полей форм

```javascript
const formFieldTypes = {
    // Числовое поле с BT-привязкой
    number: {
        component: 'NumberInput',
        props: {
            min: 0,
            max: 1000,
            step: 0.01,
            bt_channel: 'caliper_01', // Привязка к BT-устройству
            manual_override: true,
            units: 'mm'
        }
    },
    
    // Выпадающий список
    select: {
        component: 'SelectInput',
        props: {
            options: ['Норма', 'Дефект', 'Требует проверки'],
            required: true,
            default: 'Норма'
        }
    },
    
    // Чек-лист
    checklist: {
        component: 'CheckList',
        props: {
            items: [
                {id: 1, text: 'Поверхность очищена'},
                {id: 2, text: 'Нет видимых повреждений'},
                {id: 3, text: 'Размеры в допуске'}
            ],
            require_all: false
        }
    },
    
    // Текстовое поле
    text: {
        component: 'TextArea',
        props: {
            maxLength: 500,
            placeholder: 'Примечания',
            rows: 4
        }
    },
    
    // Фото
    photo: {
        component: 'PhotoCapture',
        props: {
            min_photos: 1,
            max_photos: 5,
            show_gallery: true
        }
    },
    
    // Подпись
    signature: {
        component: 'SignaturePad',
        props: {
            width: 400,
            height: 200,
            penColor: 'black'
        }
    }
};
```

### 6.4.2 Рендеринг и привязка форм

```javascript
class FormRenderer {
    constructor() {
        this.forms = new Map();
        this.currentForm = null;
    }
    
    renderForm(formConfig) {
        const form = new Form(formConfig.id);
        
        for (const fieldConfig of formConfig.fields) {
            // Создание компонента поля
            const component = this.createField(fieldConfig);
            
            // Привязка к BT если указано
            if (fieldConfig.bt_channel) {
                this.bindToBluetoothChannel(component, fieldConfig.bt_channel);
            }
            
            // Установка валидаторов
            if (fieldConfig.required) {
                component.addValidator(this.validators[fieldConfig.type]);
            }
            
            // Добавление зависимостей
            if (fieldConfig.depends_on) {
                this.setupDependency(component, fieldConfig.depends_on);
            }
            
            form.addField(component);
        }
        
        // Обработчики событий
        form.onSubmit = () => this.handleSubmit(form);
        form.onReset = () => this.handleReset(form);
        
        this.currentForm = form;
        return form;
    }
    
    bindToBluetoothChannel(field, channel) {
        // Автоматическое заполнение из BT
        this.bluetooth_manager.on(channel, (value) => {
            field.setValue(value);
            field.highlight(); // Визуальная индикация обновления
            
            // Добавление метки источника
            field.setSource('bluetooth');
        });
        
        // Возможность ручного ввода
        field.onManualOverride = () => {
            this.bluetooth_manager.pause(channel);
            field.setSource('manual');
        };
    }
    
    async handleSubmit(form) {
        // Валидация всех полей
        const validation = await form.validate();
        
        if (!validation.valid) {
            this.showValidationErrors(validation.errors);
            return;
        }
        
        // Сбор данных
        const formData = form.getData();
        
        // Сохранение локально
        await this.saveFormData(formData);
        
        // Отправка будет при нажатии физической кнопки
        this.waitForPhysicalButton();
    }
}
```

## 6.5 Механизм retry

### 6.5.1 Обработка повтора

> "Количество повторов неограничено"

```javascript
class RetryHandler {
    constructor() {
        this.retry_count = 0;
        this.retry_history = [];
        this.current_measurements = {};
        this.current_photos = [];
        this.current_form_data = {};
    }
    
    handleRetryButton() {
        this.retry_count++;
        
        // Сохранение текущего состояния в историю
        this.retry_history.push({
            timestamp: Date.now(),
            retry_number: this.retry_count,
            measurements: {...this.current_measurements},
            photos: [...this.current_photos],
            form_data: {...this.current_form_data}
        });
        
        // Получение политики повтора из команды
        const retry_config = this.command.retry_policy || {
            reset_measurements: true,
            reset_photos: true,
            keep_form_fields: ['operator_notes', 'visual_inspection']
        };
        
        // Применение политики сброса
        if (retry_config.reset_measurements) {
            this.clearMeasurements();
        }
        
        if (retry_config.reset_photos) {
            this.clearPhotos();
        }
        
        // Частичный сброс формы
        this.resetFormFields(retry_config);
        
        // Уведомление Core через локальную сеть
        this.sendToCore({
            type: 'retry_event',
            retry_count: this.retry_count,
            command_id: this.command_id,
            timestamp: Date.now()
        });
        
        // Обновление UI
        this.updateRetryUI();
        
        // Логирование
        this.log(`Retry #${this.retry_count} initiated`);
    }
    
    clearMeasurements() {
        // Очистка BT измерений
        this.current_measurements = {};
        this.bluetooth_manager.clearBuffer();
        
        // Очистка полей формы с BT-привязкой
        this.form.clearBTFields();
        
        // Визуальная индикация
        this.ui.showNotification('Измерения сброшены');
    }
    
    resetFormFields(config) {
        const form = this.currentForm;
        
        // Сброс указанных полей
        if (config.reset_form_fields) {
            for (const fieldId of config.reset_form_fields) {
                form.clearField(fieldId);
            }
        }
        
        // Сохранение указанных полей
        if (config.keep_form_fields) {
            const savedValues = {};
            for (const fieldId of config.keep_form_fields) {
                savedValues[fieldId] = form.getFieldValue(fieldId);
            }
            
            // Сброс всей формы
            form.reset();
            
            // Восстановление сохраненных
            for (const [fieldId, value] of Object.entries(savedValues)) {
                form.setFieldValue(fieldId, value);
            }
        }
    }
}
```

### 6.5.2 Политики повтора

```json
{
  "retry_policy": {
    "reset_measurements": true,
    "reset_photos": false,
    "keep_form_fields": ["visual_inspection", "operator_notes"],
    "reset_form_fields": ["measurement_value", "defect_type"],
    "max_retries": null,
    "notify_on_retry": true,
    "log_retry_reason": true,
    "auto_save_before_retry": true
  }
}
```

## 6.6 Локальное хранение данных

### 6.6.1 Схема базы данных

```sql
-- Измерения
CREATE TABLE measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    value TEXT NOT NULL,
    raw_value BLOB,
    timestamp INTEGER NOT NULL,
    synced BOOLEAN DEFAULT 0,
    retry_number INTEGER DEFAULT 0,
    INDEX idx_command (command_id),
    INDEX idx_sync (synced)
);

-- Фотографии
CREATE TABLE photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    timestamp INTEGER NOT NULL,
    uploaded BOOLEAN DEFAULT 0,
    upload_attempts INTEGER DEFAULT 0,
    metadata TEXT,
    INDEX idx_upload (uploaded)
);

-- Данные форм
CREATE TABLE form_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL,
    field_id TEXT NOT NULL,
    field_value TEXT,
    field_type TEXT,
    timestamp INTEGER NOT NULL,
    synced BOOLEAN DEFAULT 0,
    source TEXT DEFAULT 'manual'
);

-- История BT-устройств
CREATE TABLE bt_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_mac TEXT NOT NULL,
    device_name TEXT,
    device_type TEXT,
    last_connected INTEGER,
    total_measurements INTEGER DEFAULT 0,
    average_rssi INTEGER,
    last_battery INTEGER
);

-- Кэш команд
CREATE TABLE command_cache (
    command_id TEXT PRIMARY KEY,
    command_json TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    executed_at INTEGER,
    completed_at INTEGER,
    status TEXT,
    retry_count INTEGER DEFAULT 0
);

-- История повторов
CREATE TABLE retry_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL,
    retry_number INTEGER,
    timestamp INTEGER,
    data_snapshot TEXT,
    reason TEXT
);
```

### 6.6.2 Синхронизация с облаком

```javascript
class DataSync {
    constructor() {
        this.syncInProgress = false;
        this.syncQueue = [];
        this.syncInterval = 30000; // 30 секунд
    }
    
    async syncWithCloud() {
        if (this.syncInProgress) return;
        
        // Проверка соединения
        if (!this.isConnected()) {
            console.log("Offline mode - data saved locally");
            return;
        }
        
        this.syncInProgress = true;
        
        try {
            // Синхронизация измерений
            await this.syncMeasurements();
            
            // Загрузка фотографий
            await this.uploadPendingPhotos();
            
            // Синхронизация данных форм
            await this.syncFormData();
            
            // Очистка старых синхронизированных данных
            await this.cleanupOldData();
            
        } catch (error) {
            console.error("Sync failed:", error);
        } finally {
            this.syncInProgress = false;
        }
    }
    
    async syncMeasurements() {
        const unsyncedMeasurements = await this.db.query(
            "SELECT * FROM measurements WHERE synced = 0 ORDER BY timestamp ASC"
        );
        
        for (const measurement of unsyncedMeasurements) {
            try {
                await this.cloud.sendMeasurement({
                    command_id: measurement.command_id,
                    device_id: measurement.device_id,
                    value: measurement.value,
                    timestamp: measurement.timestamp
                });
                
                // Отметка как синхронизированное
                await this.db.execute(
                    "UPDATE measurements SET synced = 1 WHERE id = ?",
                    [measurement.id]
                );
                
            } catch (error) {
                console.error(`Failed to sync measurement ${measurement.id}:`, error);
                break; // Прекращаем при ошибке для сохранения порядка
            }
        }
    }
    
    async handleOfflineMode() {
        // Включение offline режима
        this.enableOfflineMode();
        
        // Показ индикатора
        this.ui.showOfflineIndicator();
        
        // Периодические попытки синхронизации
        this.syncTimer = setInterval(() => {
            this.attemptSync();
        }, this.syncInterval);
    }
    
    async attemptSync() {
        if (await this.checkConnection()) {
            // Соединение восстановлено
            clearInterval(this.syncTimer);
            this.ui.hideOfflineIndicator();
            await this.syncWithCloud();
        }
    }
}
```

### 6.6.3 Управление хранилищем

```javascript
class StorageManager {
    constructor() {
        this.maxStorageSize = 1024 * 1024 * 1024; // 1 GB
        this.retentionDays = 30;
    }
    
    async cleanupOldData() {
        const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
        
        // Удаление старых синхронизированных измерений
        await this.db.execute(
            "DELETE FROM measurements WHERE synced = 1 AND timestamp < ?",
            [cutoffTime]
        );
        
        // Удаление загруженных фото
        const uploadedPhotos = await this.db.query(
            "SELECT file_path FROM photos WHERE uploaded = 1 AND timestamp < ?",
            [cutoffTime]
        );
        
        for (const photo of uploadedPhotos) {
            try {
                await this.filesystem.delete(photo.file_path);
            } catch (error) {
                console.error(`Failed to delete ${photo.file_path}:`, error);
            }
        }
        
        await this.db.execute(
            "DELETE FROM photos WHERE uploaded = 1 AND timestamp < ?",
            [cutoffTime]
        );
        
        // Оптимизация БД
        await this.db.execute("VACUUM");
        
        // Проверка размера хранилища
        await this.checkStorageSize();
    }
    
    async checkStorageSize() {
        const usage = await this.filesystem.getUsage();
        
        if (usage.used > this.maxStorageSize * 0.9) {
            // Превышен лимит 90%
            this.ui.showWarning('Хранилище почти заполнено');
            
            // Агрессивная очистка
            await this.aggressiveCleanup();
        }
    }
    
    async exportData() {
        // Экспорт всех несинхронизированных данных
        const data = {
            measurements: await this.db.query("SELECT * FROM measurements WHERE synced = 0"),
            form_data: await this.db.query("SELECT * FROM form_data WHERE synced = 0"),
            photos: await this.db.query("SELECT * FROM photos WHERE uploaded = 0")
        };
        
        // Создание архива
        const archive = await this.createArchive(data);
        
        // Сохранение на внешний носитель
        await this.saveToExternal(archive);
    }
}
```

---

*Конец Раздела 6*