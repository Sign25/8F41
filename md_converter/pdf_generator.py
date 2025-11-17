"""
PDF Generator используя WeasyPrint
"""

from weasyprint import HTML, CSS
from pathlib import Path
from typing import Optional
import os


class PDFGenerator:
    """Генератор PDF документов"""

    def __init__(self, style: str = 'default'):
        """
        Args:
            style: Название стиля (default, professional, minimal)
        """
        self.style = style
        self.styles_dir = Path(__file__).parent / 'styles'

    def generate(self, html_content: str, output_path: str, metadata: Optional[dict] = None):
        """
        Генерация PDF из HTML

        Args:
            html_content: HTML контент
            output_path: Путь для сохранения PDF
            metadata: Метаданные документа
        """
        # Загрузка CSS стилей
        css_path = self.styles_dir / f'{self.style}.css'

        if not css_path.exists():
            css_path = self.styles_dir / 'default.css'

        # Обертка HTML с метаданными и стилями
        full_html = self._wrap_html(html_content, metadata)

        # Генерация PDF
        html_obj = HTML(string=full_html)

        # Применение стилей
        stylesheets = [CSS(filename=str(css_path))]

        # Генерация с настройками
        html_obj.write_pdf(
            output_path,
            stylesheets=stylesheets,
            presentational_hints=True
        )

    def _wrap_html(self, content: str, metadata: Optional[dict] = None) -> str:
        """
        Обертка HTML контента в полный документ

        Args:
            content: HTML контент
            metadata: Метаданные

        Returns:
            Полный HTML документ
        """
        title = metadata.get('title', 'Document') if metadata else 'Document'
        author = metadata.get('author', '') if metadata else ''

        header = ''
        if metadata and metadata.get('title'):
            header = f'''
            <header class="document-header">
                <h1 class="document-title">{metadata['title']}</h1>
                {f'<p class="document-author">{author}</p>' if author else ''}
            </header>
            '''

        html = f'''
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>{title}</title>
            <style>
                @page {{
                    size: A4;
                    margin: 2cm;
                    @bottom-center {{
                        content: counter(page) " / " counter(pages);
                        font-size: 10pt;
                        color: #666;
                    }}
                }}

                body {{
                    font-family: 'DejaVu Sans', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}

                /* ASCII-арт оптимизация */
                .ascii-art {{
                    font-family: 'DejaVu Sans Mono', 'Courier New', monospace;
                    font-size: 8pt;
                    line-height: 1.2;
                    white-space: pre;
                    overflow-x: auto;
                    background-color: #f5f5f5;
                    padding: 10px;
                    border: 1px solid #ddd;
                    page-break-inside: avoid;
                }}

                .ascii-optimized {{
                    font-size: 6pt;
                }}

                /* Код */
                pre {{
                    font-family: 'DejaVu Sans Mono', 'Courier New', monospace;
                    font-size: 9pt;
                    background-color: #2d2d2d;
                    color: #f8f8f2;
                    padding: 15px;
                    border-radius: 5px;
                    overflow-x: auto;
                    page-break-inside: avoid;
                }}

                code {{
                    font-family: 'DejaVu Sans Mono', 'Courier New', monospace;
                    background-color: #f4f4f4;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 0.9em;
                }}

                /* Таблицы */
                table {{
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                    page-break-inside: avoid;
                }}

                th, td {{
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }}

                th {{
                    background-color: #4CAF50;
                    color: white;
                    font-weight: bold;
                }}

                tr:nth-child(even) {{
                    background-color: #f9f9f9;
                }}

                /* Заголовки */
                h1, h2, h3, h4, h5, h6 {{
                    page-break-after: avoid;
                    margin-top: 24px;
                    margin-bottom: 16px;
                }}

                h1 {{ font-size: 2em; color: #2c3e50; }}
                h2 {{ font-size: 1.5em; color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 5px; }}
                h3 {{ font-size: 1.25em; color: #34495e; }}

                /* Изображения */
                img {{
                    max-width: 100%;
                    height: auto;
                    display: block;
                    margin: 20px auto;
                    page-break-inside: avoid;
                }}

                /* Цитаты */
                blockquote {{
                    border-left: 4px solid #3498db;
                    padding-left: 20px;
                    margin: 20px 0;
                    font-style: italic;
                    color: #555;
                }}

                /* Списки */
                ul, ol {{
                    margin: 10px 0;
                    padding-left: 30px;
                }}
            </style>
        </head>
        <body>
            {header}
            <main class="document-content">
                {content}
            </main>
        </body>
        </html>
        '''

        return html

    def set_style(self, style: str):
        """Установка стиля документа"""
        self.style = style
