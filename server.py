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
from PIL import Image
import io
import logging
import re
import base64

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the frontend

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Font configuration for proper Cyrillic rendering
font_config = FontConfiguration()


def optimize_images_in_html(html_content):
    """
    Optimize base64 images in HTML to reduce PDF size
    Converts large images to compressed JPEG format
    """
    def replace_image(match):
        data_url = match.group(1)

        # Skip if already small or if it's an SVG
        if 'svg' in data_url.lower():
            # Remove SVG images to reduce size - they're often huge in PDF
            logger.info("Removing SVG image to reduce PDF size")
            return '<div style="text-align:center;padding:20px;background:#f0f0f0;border:1px solid #ccc;">Диаграмма (удалена для уменьшения размера PDF)</div>'

        try:
            # Extract base64 data
            if ';base64,' in data_url:
                header, encoded = data_url.split(';base64,', 1)
                image_data = base64.b64decode(encoded)

                # Open and optimize image
                img = Image.open(io.BytesIO(image_data))

                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background

                # Resize if too large (max 1200px width)
                max_width = 1200
                if img.width > max_width:
                    ratio = max_width / img.width
                    new_size = (max_width, int(img.height * ratio))
                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                    logger.info(f"Resized image from {img.size} to {new_size}")

                # Save as optimized JPEG
                output = io.BytesIO()
                img.save(output, format='JPEG', quality=75, optimize=True)
                optimized_data = base64.b64encode(output.getvalue()).decode()

                logger.info(f"Optimized image: {len(image_data)} -> {len(base64.b64decode(optimized_data))} bytes")

                return f'<img src="data:image/jpeg;base64,{optimized_data}"'

        except Exception as e:
            logger.warning(f"Failed to optimize image: {e}")
            return match.group(0)

        return match.group(0)

    # Replace all img tags with src="data:..."
    optimized = re.sub(r'<img\s+src="(data:[^"]+)"', replace_image, html_content)
    return optimized


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

        # Optimize images in HTML to reduce PDF size
        logger.info("Optimizing images...")
        html_content = optimize_images_in_html(html_content)
        logger.info("Image optimization complete")

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

        # Generate PDF using WeasyPrint with optimized settings
        logger.info("Converting HTML to PDF with WeasyPrint...")
        pdf_file = io.BytesIO()

        # Use lower DPI for smaller file size (default is 96)
        HTML(string=full_html, encoding='utf-8').write_pdf(
            pdf_file,
            font_config=font_config,
            presentational_hints=True,
            optimize_size=('fonts', 'images')  # Optimize fonts and images
        )

        pdf_file.seek(0)

        # Get PDF size for logging
        pdf_size_mb = len(pdf_file.getvalue()) / (1024 * 1024)

        # Create safe filename
        safe_filename = ''.join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in title)
        safe_filename = safe_filename.lower().replace(' ', '_') + '.pdf'

        logger.info(f"PDF generated successfully: {safe_filename} ({pdf_size_mb:.2f} MB)")
        pdf_file.seek(0)

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
