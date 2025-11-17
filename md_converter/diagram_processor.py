"""
Diagram Processor для рендеринга Mermaid и GraphViz диаграмм
"""

import subprocess
import tempfile
import os
from pathlib import Path
from typing import Optional
from PIL import Image
import io


class DiagramProcessor:
    """Обработчик диаграмм"""

    def __init__(self, output_format: str = 'png'):
        """
        Args:
            output_format: Формат вывода (png, svg)
        """
        self.output_format = output_format
        self.temp_dir = tempfile.mkdtemp(prefix='md_diagrams_')

    def process_mermaid(self, content: str, output_path: Optional[str] = None) -> str:
        """
        Рендеринг Mermaid диаграммы

        Args:
            content: Mermaid код
            output_path: Путь для сохранения (опционально)

        Returns:
            Путь к сгенерированному изображению
        """
        if output_path is None:
            output_path = os.path.join(
                self.temp_dir,
                f'mermaid_{id(content)}.{self.output_format}'
            )

        # Создание временного файла с Mermaid кодом
        mermaid_file = os.path.join(self.temp_dir, f'temp_{id(content)}.mmd')
        with open(mermaid_file, 'w', encoding='utf-8') as f:
            f.write(content)

        try:
            # Попытка использовать mmdc (mermaid-cli)
            subprocess.run([
                'mmdc',
                '-i', mermaid_file,
                '-o', output_path,
                '-b', 'transparent'
            ], check=True, capture_output=True)

            return output_path

        except (subprocess.CalledProcessError, FileNotFoundError):
            # Если mmdc не установлен, используем онлайн API или заглушку
            print("Warning: mermaid-cli (mmdc) not found. Installing fallback...")
            return self._create_fallback_diagram(content, output_path, 'Mermaid')

    def process_graphviz(self, content: str, output_path: Optional[str] = None) -> str:
        """
        Рендеринг GraphViz диаграммы

        Args:
            content: GraphViz DOT код
            output_path: Путь для сохранения

        Returns:
            Путь к сгенерированному изображению
        """
        if output_path is None:
            output_path = os.path.join(
                self.temp_dir,
                f'graphviz_{id(content)}.{self.output_format}'
            )

        # Создание временного DOT файла
        dot_file = os.path.join(self.temp_dir, f'temp_{id(content)}.dot')
        with open(dot_file, 'w', encoding='utf-8') as f:
            f.write(content)

        try:
            # Использование dot утилиты
            subprocess.run([
                'dot',
                f'-T{self.output_format}',
                dot_file,
                '-o', output_path
            ], check=True, capture_output=True)

            return output_path

        except (subprocess.CalledProcessError, FileNotFoundError):
            # Если GraphViz не установлен, используем fallback
            print("Warning: GraphViz (dot) not found. Using fallback...")
            return self._create_fallback_diagram(content, output_path, 'GraphViz')

    def _create_fallback_diagram(self, content: str, output_path: str, diagram_type: str) -> str:
        """
        Создание заглушки для диаграммы если инструмент не установлен

        Args:
            content: Содержимое диаграммы
            output_path: Путь для сохранения
            diagram_type: Тип диаграммы

        Returns:
            Путь к заглушке
        """
        from PIL import Image, ImageDraw, ImageFont

        # Создание изображения-заглушки
        width, height = 800, 400
        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)

        # Рисование рамки
        draw.rectangle([(10, 10), (width-10, height-10)], outline='gray', width=2)

        # Добавление текста
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
        except:
            font = ImageFont.load_default()

        text = f"{diagram_type} Diagram\n(renderer not installed)"
        draw.text((width//2, height//2), text, fill='gray', font=font, anchor='mm')

        # Сохранение
        img.save(output_path)
        return output_path

    def cleanup(self):
        """Очистка временных файлов"""
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def __del__(self):
        """Автоматическая очистка при удалении объекта"""
        self.cleanup()
