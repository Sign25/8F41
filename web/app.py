#!/usr/bin/env python3
"""
Flask Web Application для Markdown Document Converter
"""

from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
import os
import sys
from pathlib import Path
import tempfile
import shutil

# Добавляем родительскую директорию в путь для импорта md_converter
sys.path.insert(0, str(Path(__file__).parent.parent))

from md_converter.parser import MarkdownParser
from md_converter.pdf_generator import PDFGenerator
from md_converter.word_generator import WordGenerator
from md_converter.diagram_processor import DiagramProcessor
from md_converter.ascii_processor import ASCIIProcessor

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = Path(__file__).parent / 'uploads'
app.config['OUTPUT_FOLDER'] = Path(__file__).parent / 'output'

# Создаем директории если не существуют
app.config['UPLOAD_FOLDER'].mkdir(exist_ok=True)
app.config['OUTPUT_FOLDER'].mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {'md', 'markdown', 'txt'}


def allowed_file(filename):
    """Проверка разрешенных расширений файлов"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def cleanup_old_files():
    """Очистка старых файлов (старше 1 часа)"""
    import time
    current_time = time.time()

    for folder in [app.config['UPLOAD_FOLDER'], app.config['OUTPUT_FOLDER']]:
        for file_path in folder.glob('*'):
            if file_path.is_file():
                # Удаляем файлы старше 1 часа
                if current_time - file_path.stat().st_mtime > 3600:
                    try:
                        file_path.unlink()
                    except Exception:
                        pass


@app.route('/')
def index():
    """Главная страница"""
    return render_template('index.html')


@app.route('/api/convert', methods=['POST'])
def convert():
    """
    API эндпоинт для конвертации Markdown файла

    Parameters:
        file: Markdown файл
        format: pdf, docx, или both
        style: default, professional, или minimal
        ascii_mode: optimize, image, или preserve

    Returns:
        JSON с путями к сгенерированным файлам
    """
    cleanup_old_files()

    # Проверка наличия файла
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не найден'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Неподдерживаемый формат файла. Используйте .md, .markdown или .txt'}), 400

    # Получение параметров
    output_format = request.form.get('format', 'pdf')
    style = request.form.get('style', 'default')
    ascii_mode = request.form.get('ascii_mode', 'optimize')

    # Валидация параметров
    if output_format not in ['pdf', 'docx', 'both']:
        return jsonify({'error': 'Неверный формат вывода'}), 400

    if style not in ['default', 'professional', 'minimal']:
        return jsonify({'error': 'Неверный стиль'}), 400

    if ascii_mode not in ['optimize', 'image', 'preserve']:
        return jsonify({'error': 'Неверный режим ASCII'}), 400

    try:
        # Сохранение загруженного файла
        filename = secure_filename(file.filename)
        input_path = app.config['UPLOAD_FOLDER'] / filename
        file.save(str(input_path))

        # Чтение содержимого
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Парсинг
        parser = MarkdownParser()
        html, metadata, code_blocks, diagram_blocks, ascii_blocks = parser.parse(content)

        # Обработка диаграмм
        diagram_processor = DiagramProcessor()
        for diagram in diagram_blocks:
            if diagram.type == 'mermaid':
                diagram_processor.process_mermaid(diagram.content)
            elif diagram.type == 'graphviz':
                diagram_processor.process_graphviz(diagram.content)

        # Обработка ASCII-арта
        ascii_processor = ASCIIProcessor(mode=ascii_mode)
        for ascii_block in ascii_blocks:
            ascii_processor.process(ascii_block.content)

        # Генерация выходных файлов
        output_base = app.config['OUTPUT_FOLDER'] / Path(filename).stem
        metadata_dict = {
            'title': metadata.title,
            'author': metadata.author,
            'date': metadata.date
        }

        result_files = []

        if output_format in ['pdf', 'both']:
            pdf_path = f"{output_base}.pdf"
            pdf_gen = PDFGenerator(style=style)
            pdf_gen.generate(html, pdf_path, metadata_dict)
            result_files.append({
                'type': 'pdf',
                'filename': Path(pdf_path).name,
                'url': f'/api/download/{Path(pdf_path).name}'
            })

        if output_format in ['docx', 'both']:
            docx_path = f"{output_base}.docx"
            word_gen = WordGenerator(style=style)
            word_gen.generate(html, docx_path, metadata_dict)
            result_files.append({
                'type': 'docx',
                'filename': Path(docx_path).name,
                'url': f'/api/download/{Path(docx_path).name}'
            })

        # Очистка
        diagram_processor.cleanup()
        ascii_processor.cleanup()

        # Статистика
        stats = {
            'code_blocks': len(code_blocks),
            'diagrams': len(diagram_blocks),
            'ascii_art': len(ascii_blocks),
            'title': metadata.title or 'Без названия'
        }

        return jsonify({
            'success': True,
            'files': result_files,
            'stats': stats
        })

    except Exception as e:
        return jsonify({
            'error': f'Ошибка при обработке: {str(e)}'
        }), 500

    finally:
        # Удаление временного входного файла
        if input_path.exists():
            input_path.unlink()


@app.route('/api/download/<filename>')
def download(filename):
    """Скачивание сгенерированного файла"""
    # Безопасность: проверяем что файл существует и находится в правильной директории
    file_path = app.config['OUTPUT_FOLDER'] / secure_filename(filename)

    if not file_path.exists() or not file_path.is_file():
        return jsonify({'error': 'Файл не найден'}), 404

    # Проверка что путь действительно в OUTPUT_FOLDER
    if not str(file_path.resolve()).startswith(str(app.config['OUTPUT_FOLDER'].resolve())):
        return jsonify({'error': 'Доступ запрещен'}), 403

    return send_file(
        file_path,
        as_attachment=True,
        download_name=filename
    )


@app.route('/api/health')
def health():
    """Проверка состояния API"""
    return jsonify({
        'status': 'ok',
        'version': '1.0.0'
    })


if __name__ == '__main__':
    # Режим разработки
    app.run(debug=True, host='0.0.0.0', port=5000)
