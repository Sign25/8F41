#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Flask server for Markdown to PDF conversion with Cyrillic support
Uses WeasyPrint for reliable PDF generation
"""

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration
import io
import logging

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the frontend

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Font configuration for proper Cyrillic rendering
font_config = FontConfiguration()


@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_file('index.html')


@app.route('/generate-pdf', methods=['POST'])
def generate_pdf():
    """
    Generate PDF from HTML content
    Expects JSON with: { html, title, author, date }
    """
    try:
        data = request.json
        html_content = data.get('html', '')
        title = data.get('title', 'Document')
        author = data.get('author', '')
        date = data.get('date', '')

        logger.info(f"Generating PDF: {title}")
        logger.info(f"HTML content length: {len(html_content)}")

        if not html_content:
            return jsonify({'error': 'No HTML content provided'}), 400

        # Build complete HTML document with proper encoding and styles
        full_html = f'''<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        @page {{
            size: A4;
            margin: 25mm;
        }}

        body {{
            font-family: "DejaVu Sans", Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #000;
        }}

        .title-page {{
            text-align: center;
            margin-bottom: 40px;
            page-break-after: always;
        }}

        .title-page h1 {{
            font-size: 24pt;
            margin: 100px 0 30px 0;
            font-weight: bold;
        }}

        .title-page p {{
            font-size: 14pt;
            margin: 10px 0;
        }}

        h1 {{
            font-size: 20pt;
            margin: 20px 0 10px 0;
            font-weight: bold;
            page-break-after: avoid;
        }}

        h2 {{
            font-size: 16pt;
            margin: 16px 0 8px 0;
            font-weight: bold;
            page-break-after: avoid;
        }}

        h3 {{
            font-size: 14pt;
            margin: 14px 0 7px 0;
            font-weight: bold;
            page-break-after: avoid;
        }}

        p {{
            margin: 0 0 10px 0;
            text-align: justify;
        }}

        pre {{
            background: #f6f8fa;
            padding: 10px;
            border-radius: 4px;
            font-family: "DejaVu Sans Mono", "Courier New", monospace;
            font-size: 9pt;
            overflow-x: auto;
            page-break-inside: avoid;
            white-space: pre-wrap;
            word-wrap: break-word;
        }}

        code {{
            background: #f6f8fa;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "DejaVu Sans Mono", "Courier New", monospace;
            font-size: 9pt;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0;
            page-break-inside: avoid;
        }}

        th, td {{
            border: 1px solid #d0d7de;
            padding: 8px;
            text-align: left;
        }}

        th {{
            background: #f6f8fa;
            font-weight: bold;
        }}

        blockquote {{
            margin: 12px 0;
            padding-left: 15px;
            border-left: 4px solid #d0d7de;
            color: #57606a;
        }}

        ul, ol {{
            margin: 12px 0;
            padding-left: 30px;
        }}

        li {{
            margin: 5px 0;
        }}

        img {{
            max-width: 100%;
            height: auto;
            page-break-inside: avoid;
        }}

        .mermaid-diagram {{
            text-align: center;
            margin: 15px 0;
            page-break-inside: avoid;
        }}
    </style>
</head>
<body>
'''

        # Add title page if metadata exists
        if title or author or date:
            full_html += '<div class="title-page">'
            if title:
                full_html += f'<h1>{title}</h1>'
            if author:
                full_html += f'<p>Автор: {author}</p>'
            if date:
                full_html += f'<p>Дата: {date}</p>'
            full_html += '</div>'

        # Add main content
        full_html += html_content
        full_html += '</body></html>'

        # Generate PDF using WeasyPrint
        logger.info("Converting HTML to PDF with WeasyPrint...")
        pdf_file = io.BytesIO()

        HTML(string=full_html, encoding='utf-8').write_pdf(
            pdf_file,
            font_config=font_config
        )

        pdf_file.seek(0)

        # Create safe filename
        safe_filename = ''.join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in title)
        safe_filename = safe_filename.lower().replace(' ', '_') + '.pdf'

        logger.info(f"PDF generated successfully: {safe_filename}")

        return send_file(
            pdf_file,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=safe_filename
        )

    except Exception as e:
        logger.error(f"Error generating PDF: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'markdown-pdf-converter'})


if __name__ == '__main__':
    logger.info("Starting Flask server on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
