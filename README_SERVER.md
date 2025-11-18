# Markdown to PDF Converter с поддержкой кириллицы

Конвертер Markdown файлов в PDF с полной поддержкой русского языка.
Использует Python Flask сервер с библиотекой WeasyPrint для надёжной генерации PDF.

## Установка и запуск

### 1. Установите зависимости Python

```bash
# Установите pip если его нет
sudo apt-get update
sudo apt-get install python3-pip

# Установите системные зависимости для WeasyPrint
sudo apt-get install python3-cffi python3-brotli libpango-1.0-0 libpangoft2-1.0-0

# Установите Python пакеты
pip3 install -r requirements.txt
```

### 2. Запустите Flask сервер

```bash
python3 server.py
```

Сервер запустится на `http://localhost:5000`

### 3. Откройте веб-интерфейс

Откройте в браузере:
```
http://localhost:5000
```

## Использование

1. **Загрузите .md файл** - перетащите в область или нажмите "Выбрать файл"
2. **Предпросмотр** - Markdown будет автоматически отрендерен
3. **Скачать PDF** - нажмите кнопку для генерации PDF с кириллицей

## Архитектура

- **Frontend** (index.html + js/app.js):
  - Загрузка и предпросмотр Markdown
  - Парсинг с markdown-it
  - Рендеринг Mermaid диаграмм

- **Backend** (server.py):
  - Flask API сервер
  - WeasyPrint для генерации PDF
  - Правильная обработка кириллических шрифтов (DejaVu Sans)

## API Endpoints

### `POST /generate-pdf`
Генерирует PDF из HTML контента

**Request:**
```json
{
  "html": "<h1>Заголовок</h1><p>Текст...</p>",
  "title": "Название документа",
  "author": "Автор",
  "date": "2025-11-18"
}
```

**Response:** PDF file (application/pdf)

### `GET /health`
Проверка состояния сервера

**Response:**
```json
{
  "status": "ok",
  "service": "markdown-pdf-converter"
}
```

## Устранение проблем

### Ошибка "Failed to fetch"
Убедитесь что Python сервер запущен:
```bash
python3 server.py
```

### Ошибка установки WeasyPrint
Установите системные зависимости:
```bash
sudo apt-get install build-essential python3-dev python3-pip python3-setuptools python3-wheel python3-cffi libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info
```

### PDF без кириллицы
WeasyPrint автоматически использует DejaVu Sans шрифт с полной поддержкой кириллицы.
Если проблема сохраняется, установите шрифты:
```bash
sudo apt-get install fonts-dejavu fonts-dejavu-core fonts-dejavu-extra
```

## Технологии

- **Python 3**: Backend сервер
- **Flask**: Web framework
- **WeasyPrint**: HTML to PDF конвертер с поддержкой Unicode
- **Markdown-it**: Markdown парсер (JavaScript)
- **Mermaid**: Диаграммы
- **Highlight.js**: Подсветка кода

## Лицензия

MIT
