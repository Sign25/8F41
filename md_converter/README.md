# Markdown Document Converter

Приложение для конвертации Markdown документов в PDF и Word с сохранением стилистики, правильной обработкой диаграмм и ASCII-рисунков.

## Возможности

- Конвертация Markdown в PDF и DOCX
- Поддержка таблиц, списков, заголовков
- Подсветка синтаксиса кода (JavaScript, Python, SQL, JSON и др.)
- Рендеринг Mermaid диаграмм
- Обработка ASCII-арта (конвертация в изображения или оптимизация размера)
- Сохранение стилистики и форматирования
- Поддержка метаданных документа (YAML front matter)

## Установка

```bash
pip install -r requirements.txt
```

## Использование

### Конвертация в PDF

```bash
python md_converter.py input.md -o output.pdf -f pdf
```

### Конвертация в Word

```bash
python md_converter.py input.md -o output.docx -f docx
```

### Дополнительные опции

```bash
# Установка стиля
python md_converter.py input.md -f pdf --style professional

# Обработка ASCII-арта
python md_converter.py input.md -f pdf --ascii-mode image

# Пакетная обработка
python md_converter.py *.md -f pdf --batch
```

## Архитектура

```
md_converter/
├── __init__.py
├── parser.py           # Парсинг Markdown
├── diagram_processor.py # Обработка диаграмм
├── ascii_processor.py  # Обработка ASCII-рисунков
├── pdf_generator.py    # Генерация PDF
├── word_generator.py   # Генерация Word
├── styles/             # CSS и стили для документов
│   ├── default.css
│   └── professional.css
└── utils/              # Утилиты
    ├── code_highlighter.py
    └── image_utils.py
```

## Требования

- Python 3.8+
- WeasyPrint (для PDF)
- python-docx (для Word)
- Pillow (для изображений)
- Pygments (для подсветки кода)

## Лицензия

MIT
