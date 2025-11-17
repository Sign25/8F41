"""
Markdown Document Converter
Конвертация Markdown в PDF и Word с поддержкой диаграмм и ASCII-арта
"""

__version__ = "1.0.0"
__author__ = "OCTA Team"

from .parser import MarkdownParser
from .pdf_generator import PDFGenerator
from .word_generator import WordGenerator

__all__ = ['MarkdownParser', 'PDFGenerator', 'WordGenerator']
