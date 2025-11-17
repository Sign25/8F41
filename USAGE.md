# Руководство по использованию Markdown Document Converter

## Установка

### 1. Установка зависимостей Python

```bash
# Создание виртуального окружения (рекомендуется)
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows

# Установка приложения
pip install -e .
```

### 2. Установка системных зависимостей

#### WeasyPrint (для PDF)

**Ubuntu/Debian:**
```bash
sudo apt-get install python3-dev python3-pip python3-setuptools python3-wheel python3-cffi libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info
```

**macOS:**
```bash
brew install cairo pango gdk-pixbuf libffi
```

#### Опциональные инструменты для диаграмм

**Mermaid CLI (для Mermaid диаграмм):**
```bash
npm install -g @mermaid-js/mermaid-cli
```

**GraphViz (для GraphViz диаграмм):**
```bash
# Ubuntu/Debian
sudo apt-get install graphviz

# macOS
brew install graphviz
```

## Основное использование

### Базовая конвертация

```bash
# Конвертация одного файла в PDF
md-converter input.md -o output.pdf

# Конвертация в Word
md-converter input.md -o output.docx -f docx

# Конвертация в оба формата
md-converter input.md -f both
```

### Пакетная обработка

```bash
# Конвертация всех MD файлов в директории
md-converter *.md -f pdf --batch

# Конвертация с сохранением имен
md-converter octa-*.md -f both --batch
```

### Стили документов

Доступны 3 встроенных стиля:

1. **default** - стандартный стиль для общих документов
2. **professional** - профессиональный стиль для технической документации
3. **minimal** - минималистичный стиль

```bash
# Использование профессионального стиля
md-converter document.md -f pdf --style professional

# Использование минималистичного стиля
md-converter document.md -f pdf --style minimal
```

### Обработка ASCII-арта

Доступны 3 режима обработки ASCII-рисунков:

1. **optimize** (по умолчанию) - оптимизация размера шрифта
2. **image** - конвертация в изображение
3. **preserve** - сохранение как есть

```bash
# Конвертация ASCII в изображения
md-converter document.md -f pdf --ascii-mode image

# Сохранение ASCII как есть
md-converter document.md -f pdf --ascii-mode preserve
```

## Примеры

### Пример 1: Техническая документация

```bash
md-converter octa-introduction-section.md \
  -o octa-intro.pdf \
  -f pdf \
  --style professional \
  --ascii-mode optimize
```

### Пример 2: Пакетная конвертация всей документации OCTA

```bash
md-converter octa-*.md \
  -f both \
  --batch \
  --style professional \
  --verbose
```

### Пример 3: Конвертация с диаграммами

```bash
# Убедитесь что установлен mermaid-cli
md-converter architecture.md \
  -o architecture.pdf \
  --style professional
```

## Поддерживаемые элементы Markdown

### Базовые элементы
- ✅ Заголовки (H1-H6)
- ✅ Параграфы
- ✅ Списки (упорядоченные и неупорядоченные)
- ✅ Таблицы
- ✅ Ссылки
- ✅ Изображения
- ✅ Цитаты

### Расширенные элементы
- ✅ Блоки кода с подсветкой синтаксиса
- ✅ Таблицы (GitHub Flavored Markdown)
- ✅ YAML Front Matter (метаданные)
- ✅ Mermaid диаграммы
- ✅ GraphViz диаграммы
- ✅ ASCII-арт

### Поддерживаемые языки для подсветки кода
- JavaScript
- Python
- SQL
- JSON
- Bash/Shell
- HTML/CSS
- И многие другие (через Pygments)

## Структура проекта

```
md_converter/
├── __init__.py           # Основной модуль
├── parser.py             # Парсер Markdown
├── pdf_generator.py      # Генератор PDF
├── word_generator.py     # Генератор Word
├── diagram_processor.py  # Обработка диаграмм
├── ascii_processor.py    # Обработка ASCII-арта
├── cli.py                # CLI интерфейс
├── styles/               # CSS стили
│   ├── default.css
│   ├── professional.css
│   └── minimal.css
└── requirements.txt      # Зависимости
```

## Метаданные документа (YAML Front Matter)

Вы можете добавить метаданные в начало MD файла:

```markdown
---
title: "Введение в OCTA"
author: "OCTA Team"
date: "2024-01-15"
order: 1.5
---

# Ваш контент...
```

Эти метаданные будут использованы для:
- Заголовка документа
- Имени автора
- Даты создания
- Сортировки (при пакетной обработке)

## Troubleshooting

### Проблема: WeasyPrint не устанавливается

**Решение:** Убедитесь что установлены системные зависимости:
```bash
sudo apt-get install python3-dev libcairo2-dev libpango1.0-dev
```

### Проблема: Диаграммы не рендерятся

**Решение:** Установите соответствующие инструменты:
```bash
# Для Mermaid
npm install -g @mermaid-js/mermaid-cli

# Для GraphViz
sudo apt-get install graphviz
```

### Проблема: Кириллица не отображается

**Решение:** Установите шрифты DejaVu:
```bash
sudo apt-get install fonts-dejavu fonts-dejavu-core fonts-dejavu-extra
```

## Производительность

Время конвертации зависит от:
- Размера документа
- Количества изображений
- Количества диаграмм
- Сложности таблиц

Примерные показатели:
- 10-страничный документ: ~2-5 секунд
- 50-страничный документ: ~10-20 секунд
- Документ с 10 диаграммами: +5-10 секунд

## Лицензия

MIT License

## Поддержка

Для вопросов и предложений создавайте issue в репозитории.
