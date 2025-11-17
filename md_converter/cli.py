#!/usr/bin/env python3
"""
CLI интерфейс для Markdown Converter
"""

import click
from pathlib import Path
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from typing import List
import os

from .parser import MarkdownParser
from .pdf_generator import PDFGenerator
from .word_generator import WordGenerator
from .diagram_processor import DiagramProcessor
from .ascii_processor import ASCIIProcessor

console = Console()


@click.command()
@click.argument('input_files', nargs=-1, type=click.Path(exists=True), required=True)
@click.option('-o', '--output', type=click.Path(), help='Выходной файл')
@click.option('-f', '--format', 'output_format',
              type=click.Choice(['pdf', 'docx', 'both']),
              default='pdf',
              help='Формат вывода')
@click.option('--style', default='default',
              help='Стиль документа (default, professional, minimal)')
@click.option('--ascii-mode',
              type=click.Choice(['image', 'optimize', 'preserve']),
              default='optimize',
              help='Режим обработки ASCII-арта')
@click.option('--batch', is_flag=True, help='Пакетная обработка')
@click.option('--verbose', '-v', is_flag=True, help='Подробный вывод')
def convert(input_files: tuple, output: str, output_format: str,
            style: str, ascii_mode: str, batch: bool, verbose: bool):
    """
    Конвертация Markdown документов в PDF или Word

    Примеры:

        md-converter input.md -o output.pdf

        md-converter *.md -f both --batch

        md-converter doc.md -f pdf --style professional --ascii-mode image
    """

    console.print("[bold blue]Markdown Document Converter[/bold blue]")
    console.print()

    # Инициализация компонентов
    parser = MarkdownParser()
    diagram_processor = DiagramProcessor()
    ascii_processor = ASCIIProcessor(mode=ascii_mode)

    # Обработка файлов
    files_to_process = list(input_files)

    if verbose:
        console.print(f"[dim]Найдено файлов: {len(files_to_process)}[/dim]")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:

        for input_file in files_to_process:
            input_path = Path(input_file)

            # Определение выходного файла
            if output and not batch:
                output_path = Path(output)
            else:
                output_path = input_path.with_suffix('')

            task = progress.add_task(
                f"Обработка {input_path.name}...",
                total=None
            )

            try:
                # Чтение файла
                with open(input_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Парсинг
                html, metadata, code_blocks, diagram_blocks, ascii_blocks = parser.parse(content)

                if verbose:
                    console.print(f"  [dim]Найдено блоков кода: {len(code_blocks)}[/dim]")
                    console.print(f"  [dim]Найдено диаграмм: {len(diagram_blocks)}[/dim]")
                    console.print(f"  [dim]Найдено ASCII-арт: {len(ascii_blocks)}[/dim]")

                # Обработка диаграмм
                for diagram in diagram_blocks:
                    if diagram.type == 'mermaid':
                        img_path = diagram_processor.process_mermaid(diagram.content)
                    elif diagram.type == 'graphviz':
                        img_path = diagram_processor.process_graphviz(diagram.content)

                    if verbose:
                        console.print(f"  [dim]Обработана диаграмма: {diagram.type}[/dim]")

                # Обработка ASCII-арта
                for ascii_block in ascii_blocks:
                    result, mode = ascii_processor.process(ascii_block.content)
                    if verbose:
                        console.print(f"  [dim]Обработан ASCII-арт ({mode})[/dim]")

                # Генерация выходных файлов
                metadata_dict = {
                    'title': metadata.title,
                    'author': metadata.author,
                    'date': metadata.date
                }

                if output_format in ['pdf', 'both']:
                    pdf_path = f"{output_path}.pdf"
                    pdf_gen = PDFGenerator(style=style)
                    pdf_gen.generate(html, pdf_path, metadata_dict)
                    console.print(f"[green]✓[/green] PDF сохранен: {pdf_path}")

                if output_format in ['docx', 'both']:
                    docx_path = f"{output_path}.docx"
                    word_gen = WordGenerator(style=style)
                    word_gen.generate(html, docx_path, metadata_dict)
                    console.print(f"[green]✓[/green] Word сохранен: {docx_path}")

                progress.update(task, completed=True)

            except Exception as e:
                console.print(f"[red]✗[/red] Ошибка при обработке {input_path.name}: {e}")
                if verbose:
                    import traceback
                    console.print(traceback.format_exc())

    # Очистка
    diagram_processor.cleanup()
    ascii_processor.cleanup()

    console.print()
    console.print("[bold green]Готово![/bold green]")


if __name__ == '__main__':
    convert()
