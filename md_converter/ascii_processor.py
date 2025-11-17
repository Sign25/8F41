"""
ASCII Art Processor для конвертации и оптимизации ASCII-рисунков
"""

from PIL import Image, ImageDraw, ImageFont
from typing import Tuple, Optional
import os
import tempfile


class ASCIIProcessor:
    """Обработчик ASCII-арта"""

    def __init__(self, mode: str = 'optimize'):
        """
        Args:
            mode: Режим обработки ('image', 'optimize', 'preserve')
                - image: Конвертация в изображение
                - optimize: Оптимизация размера шрифта
                - preserve: Сохранение как есть
        """
        self.mode = mode
        self.temp_dir = tempfile.mkdtemp(prefix='md_ascii_')

    def process(self, content: str, output_path: Optional[str] = None) -> Tuple[str, str]:
        """
        Обработка ASCII-арта

        Args:
            content: ASCII-арт
            output_path: Путь для сохранения изображения

        Returns:
            Tuple: (processed_content or image_path, processing_mode)
        """
        if self.mode == 'image':
            return self.convert_to_image(content, output_path), 'image'
        elif self.mode == 'optimize':
            return self.optimize(content), 'text'
        else:  # preserve
            return content, 'text'

    def convert_to_image(self, content: str, output_path: Optional[str] = None) -> str:
        """
        Конвертация ASCII-арта в изображение

        Args:
            content: ASCII-арт
            output_path: Путь для сохранения

        Returns:
            Путь к изображению
        """
        if output_path is None:
            output_path = os.path.join(
                self.temp_dir,
                f'ascii_{id(content)}.png'
            )

        # Определение размеров
        lines = content.split('\n')
        max_width = max(len(line) for line in lines)
        height = len(lines)

        # Параметры шрифта
        font_size = 12
        try:
            # Моноширинный шрифт для ASCII
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
                font_size
            )
        except:
            font = ImageFont.load_default()

        # Расчет размера изображения
        # Для моноширинного шрифта: примерно 7-8 пикселей на символ
        char_width = font_size * 0.6
        char_height = font_size * 1.2

        img_width = int(max_width * char_width) + 20
        img_height = int(height * char_height) + 20

        # Создание изображения
        img = Image.new('RGB', (img_width, img_height), color='white')
        draw = ImageDraw.Draw(img)

        # Рисование текста
        y_position = 10
        for line in lines:
            draw.text((10, y_position), line, fill='black', font=font)
            y_position += char_height

        # Сохранение
        img.save(output_path, 'PNG')
        return output_path

    def optimize(self, content: str) -> str:
        """
        Оптимизация размера ASCII-арта (уменьшение шрифта в стилях)

        Args:
            content: ASCII-арт

        Returns:
            Обернутый контент с CSS классом для уменьшенного шрифта
        """
        # Обертка в <pre> с классом для стилизации
        optimized = f'<pre class="ascii-art ascii-optimized">{content}</pre>'
        return optimized

    def detect_ascii_art(self, content: str) -> bool:
        """
        Определение, является ли текст ASCII-артом

        Args:
            content: Текст для проверки

        Returns:
            True если это ASCII-арт
        """
        # Признаки ASCII-арта
        ascii_chars = set('+-|/\\<>[]{}=*#@')
        special_chars_count = sum(1 for char in content if char in ascii_chars)

        # Если более 10% символов - специальные, это скорее всего ASCII-арт
        total_chars = len(content.replace('\n', '').replace(' ', ''))
        if total_chars == 0:
            return False

        ratio = special_chars_count / total_chars
        return ratio > 0.1

    def estimate_dimensions(self, content: str) -> Tuple[int, int]:
        """
        Оценка размеров ASCII-арта

        Args:
            content: ASCII-арт

        Returns:
            Tuple: (ширина в символах, высота в строках)
        """
        lines = content.split('\n')
        width = max(len(line) for line in lines) if lines else 0
        height = len(lines)

        return width, height

    def cleanup(self):
        """Очистка временных файлов"""
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def __del__(self):
        """Автоматическая очистка"""
        self.cleanup()
