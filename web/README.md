# Markdown Document Converter - Web Version

Веб-приложение для онлайн конвертации Markdown документов в PDF и Word.

## Скриншоты

![Web Interface](https://via.placeholder.com/800x400?text=Modern+Web+Interface)

## Возможности

- **Drag & Drop интерфейс** - перетащите файл или выберите его
- **Онлайн конвертация** - без установки дополнительного ПО
- **Выбор формата** - PDF, DOCX или оба сразу
- **3 стиля оформления** - default, professional, minimal
- **Режимы ASCII-арта** - optimize, image, preserve
- **Статистика документа** - количество кода, диаграмм, ASCII-арта
- **Мгновенная загрузка** - скачивание результата сразу после конвертации

## Требования

### Системные зависимости

Те же что и для CLI версии:

**Ubuntu/Debian:**
```bash
sudo apt-get install python3-dev python3-pip python3-setuptools python3-wheel \
  python3-cffi libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
  libgdk-pixbuf2.0-0 libffi-dev shared-mime-info \
  fonts-dejavu fonts-dejavu-core fonts-dejavu-extra
```

**macOS:**
```bash
brew install cairo pango gdk-pixbuf libffi
brew install --cask font-dejavu
```

### Python зависимости

```bash
# Установка основных зависимостей md_converter
cd ..
pip install -e .

# Установка веб-зависимостей
cd web
pip install -r requirements.txt
```

## Установка

### Шаг 1: Установка базового проекта

```bash
# Переход в корень проекта
cd /path/to/md

# Создание виртуального окружения
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows

# Установка md_converter
pip install -e .
```

### Шаг 2: Установка веб-версии

```bash
# Переход в директорию web
cd web

# Установка Flask и зависимостей
pip install -r requirements.txt
```

### Шаг 3 (опционально): Установка инструментов для диаграмм

```bash
# Mermaid CLI
npm install -g @mermaid-js/mermaid-cli

# GraphViz
sudo apt-get install graphviz  # Linux
brew install graphviz          # macOS
```

## Запуск

### Режим разработки

```bash
cd web
python app.py
```

Приложение будет доступно по адресу: **http://localhost:5000**

### Продакшен режим

Для продакшена рекомендуется использовать Gunicorn:

```bash
# Установка Gunicorn
pip install gunicorn

# Запуск с 4 воркерами
cd web
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

Или использовать uWSGI:

```bash
# Установка uWSGI
pip install uwsgi

# Запуск
cd web
uwsgi --http 0.0.0.0:8000 --wsgi-file app.py --callable app --processes 4
```

### Использование Docker

Создайте `Dockerfile` в директории `web/`:

```dockerfile
FROM python:3.11-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    python3-dev \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копирование проекта
COPY ../ /app/

# Установка зависимостей
RUN pip install --no-cache-dir -e .
RUN pip install --no-cache-dir -r web/requirements.txt gunicorn

WORKDIR /app/web

EXPOSE 8000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "app:app"]
```

Запуск:

```bash
docker build -t md-converter-web .
docker run -p 8000:8000 md-converter-web
```

## Использование

### 1. Загрузка файла

- Перетащите Markdown файл в область загрузки
- Или нажмите "Выберите файл" для выбора из файловой системы
- Поддерживаемые форматы: `.md`, `.markdown`, `.txt`
- Максимальный размер файла: 16MB

### 2. Выбор параметров

**Формат вывода:**
- **PDF** - Портативный формат документа
- **Word (DOCX)** - Microsoft Word документ
- **Оба формата** - PDF и Word одновременно

**Стиль оформления:**
- **Стандартный** - для общих документов
- **Профессиональный** - для технической документации
- **Минималистичный** - чистый и простой

**Обработка ASCII-арта:**
- **Оптимизация** - уменьшение размера шрифта
- **Изображение** - конвертация в PNG
- **Сохранить** - без изменений

### 3. Конвертация

Нажмите кнопку **"Конвертировать"** и дождитесь завершения обработки.

### 4. Скачивание результата

После успешной конвертации появятся ссылки для скачивания файлов.

## API Endpoints

### POST /api/convert

Конвертация Markdown файла.

**Parameters:**
- `file` (file, required) - Markdown файл
- `format` (string) - `pdf`, `docx`, или `both` (default: `pdf`)
- `style` (string) - `default`, `professional`, или `minimal` (default: `default`)
- `ascii_mode` (string) - `optimize`, `image`, или `preserve` (default: `optimize`)

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "type": "pdf",
      "filename": "document.pdf",
      "url": "/api/download/document.pdf"
    }
  ],
  "stats": {
    "code_blocks": 5,
    "diagrams": 2,
    "ascii_art": 1,
    "title": "My Document"
  }
}
```

### GET /api/download/<filename>

Скачивание сгенерированного файла.

### GET /api/health

Проверка состояния API.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

## Структура проекта

```
web/
├── app.py                 # Flask приложение
├── requirements.txt       # Зависимости
├── README.md             # Документация
├── templates/            # HTML шаблоны
│   └── index.html        # Главная страница
├── static/               # Статические файлы
│   ├── css/
│   │   └── style.css     # Стили
│   └── js/
│       └── app.js        # JavaScript
├── uploads/              # Временные загрузки (gitignored)
└── output/               # Сгенерированные файлы (gitignored)
```

## Безопасность

### Реализованные меры безопасности:

1. **Валидация файлов**
   - Проверка расширений файлов
   - Ограничение размера (16MB)
   - Использование `secure_filename()`

2. **Защита путей**
   - Валидация путей в `diagram_processor.py`
   - Проверка что файлы находятся в разрешенных директориях
   - Предотвращение directory traversal

3. **Автоочистка**
   - Удаление временных файлов старше 1 часа
   - Очистка при каждом запросе

4. **CORS** (при необходимости)
   ```python
   from flask_cors import CORS
   CORS(app, resources={r"/api/*": {"origins": "https://yourdomain.com"}})
   ```

## Производительность

### Оптимизация для продакшена:

1. **Nginx в качестве reverse proxy**
2. **Gunicorn с несколькими воркерами**
3. **Redis для кэширования** (опционально)
4. **CDN для статических файлов**

Пример конфигурации Nginx:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /static {
        alias /path/to/web/static;
        expires 30d;
    }
}
```

## Troubleshooting

### Проблема: Port 5000 уже занят

**Решение:**
```bash
python app.py  # изменить порт в app.py
# или
lsof -ti:5000 | xargs kill  # убить процесс на порту 5000
```

### Проблема: 413 Request Entity Too Large

**Решение:** Увеличьте `MAX_CONTENT_LENGTH` в `app.py`:
```python
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
```

### Проблема: Файлы не скачиваются

**Решение:** Проверьте права на директорию `output/`:
```bash
chmod 755 web/output
```

## Разработка

### Запуск в режиме разработки с автоперезагрузкой:

```bash
export FLASK_ENV=development
export FLASK_DEBUG=1
python app.py
```

### Тестирование API:

```bash
# Проверка здоровья
curl http://localhost:5000/api/health

# Конвертация файла
curl -X POST -F "file=@test.md" \
     -F "format=pdf" \
     -F "style=professional" \
     http://localhost:5000/api/convert
```

## Лицензия

MIT License

## Поддержка

Для вопросов и предложений создавайте issue в репозитории.

## Версия

1.0.0
