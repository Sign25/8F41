"""
Markdown Parser with support for code blocks, tables, and diagrams
"""

import re
import yaml
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import markdown
from markdown.extensions import tables, fenced_code, codehilite, toc


@dataclass
class DocumentMetadata:
    """Метаданные документа из YAML front matter"""
    title: Optional[str] = None
    order: Optional[float] = None
    author: Optional[str] = None
    date: Optional[str] = None
    custom: Optional[Dict] = None


@dataclass
class CodeBlock:
    """Блок кода с подсветкой синтаксиса"""
    language: str
    code: str
    line_start: int
    line_end: int


@dataclass
class DiagramBlock:
    """Блок диаграммы (Mermaid, GraphViz и т.д.)"""
    type: str
    content: str
    line_start: int
    line_end: int


@dataclass
class ASCIIBlock:
    """Блок ASCII-арта"""
    content: str
    line_start: int
    line_end: int
    is_diagram: bool = False


class MarkdownParser:
    """Парсер Markdown документов"""

    def __init__(self):
        self.md = markdown.Markdown(
            extensions=[
                'tables',
                'fenced_code',
                'codehilite',
                'toc',
                'nl2br',
                'sane_lists'
            ],
            extension_configs={
                'codehilite': {
                    'guess_lang': False,
                    'noclasses': True,
                    'pygments_style': 'monokai'
                }
            }
        )

    def parse(self, content: str) -> Tuple[str, DocumentMetadata, List[CodeBlock], List[DiagramBlock], List[ASCIIBlock]]:
        """
        Парсинг Markdown содержимого

        Returns:
            Tuple: (HTML content, metadata, code blocks, diagram blocks, ascii blocks)
        """
        # Извлечение YAML front matter
        metadata = self._extract_metadata(content)

        # Удаление front matter из контента
        content = self._remove_front_matter(content)

        # Извлечение специальных блоков
        code_blocks = self._extract_code_blocks(content)
        diagram_blocks = self._extract_diagram_blocks(content)
        ascii_blocks = self._extract_ascii_blocks(content)

        # Конвертация в HTML
        html = self.md.convert(content)

        return html, metadata, code_blocks, diagram_blocks, ascii_blocks

    def _extract_metadata(self, content: str) -> DocumentMetadata:
        """Извлечение метаданных из YAML front matter"""
        pattern = r'^---\s*\n(.*?)\n---\s*\n'
        match = re.match(pattern, content, re.DOTALL)

        if not match:
            return DocumentMetadata()

        try:
            yaml_content = match.group(1)
            data = yaml.safe_load(yaml_content)

            return DocumentMetadata(
                title=data.get('title'),
                order=data.get('order'),
                author=data.get('author'),
                date=data.get('date'),
                custom={k: v for k, v in data.items() if k not in ['title', 'order', 'author', 'date']}
            )
        except yaml.YAMLError:
            return DocumentMetadata()

    def _remove_front_matter(self, content: str) -> str:
        """Удаление YAML front matter из контента"""
        pattern = r'^---\s*\n.*?\n---\s*\n'
        return re.sub(pattern, '', content, flags=re.DOTALL)

    def _extract_code_blocks(self, content: str) -> List[CodeBlock]:
        """Извлечение блоков кода"""
        code_blocks = []
        pattern = r'```(\w+)?\n(.*?)\n```'

        for match in re.finditer(pattern, content, re.DOTALL):
            language = match.group(1) or 'text'
            code = match.group(2)

            # Подсчет номеров строк
            line_start = content[:match.start()].count('\n') + 1
            line_end = line_start + code.count('\n')

            code_blocks.append(CodeBlock(
                language=language,
                code=code,
                line_start=line_start,
                line_end=line_end
            ))

        return code_blocks

    def _extract_diagram_blocks(self, content: str) -> List[DiagramBlock]:
        """Извлечение блоков диаграмм (Mermaid, GraphViz)"""
        diagram_blocks = []

        # Mermaid диаграммы
        mermaid_pattern = r'```mermaid\n(.*?)\n```'
        for match in re.finditer(mermaid_pattern, content, re.DOTALL):
            line_start = content[:match.start()].count('\n') + 1
            line_end = line_start + match.group(1).count('\n')

            diagram_blocks.append(DiagramBlock(
                type='mermaid',
                content=match.group(1),
                line_start=line_start,
                line_end=line_end
            ))

        # GraphViz диаграммы
        graphviz_pattern = r'```(?:dot|graphviz)\n(.*?)\n```'
        for match in re.finditer(graphviz_pattern, content, re.DOTALL):
            line_start = content[:match.start()].count('\n') + 1
            line_end = line_start + match.group(1).count('\n')

            diagram_blocks.append(DiagramBlock(
                type='graphviz',
                content=match.group(1),
                line_start=line_start,
                line_end=line_end
            ))

        return diagram_blocks

    def _extract_ascii_blocks(self, content: str) -> List[ASCIIBlock]:
        """Извлечение ASCII-арта"""
        ascii_blocks = []

        # Поиск блоков с ASCII символами (рамки, диаграммы и т.д.)
        # Признаки ASCII-арта: повторяющиеся символы +-|\/[]{}
        ascii_pattern = r'(?:^|\n)((?:[ \t]*[+\-|\/\\<>[\]{}=]+.*\n){3,})'

        for match in re.finditer(ascii_pattern, content, re.MULTILINE):
            ascii_content = match.group(1)
            line_start = content[:match.start()].count('\n') + 1
            line_end = line_start + ascii_content.count('\n')

            # Проверка, является ли это диаграммой или просто ASCII-артом
            is_diagram = self._is_ascii_diagram(ascii_content)

            ascii_blocks.append(ASCIIBlock(
                content=ascii_content,
                line_start=line_start,
                line_end=line_end,
                is_diagram=is_diagram
            ))

        return ascii_blocks

    def _is_ascii_diagram(self, content: str) -> bool:
        """Определение, является ли ASCII-блок диаграммой"""
        # Простая эвристика: диаграммы содержат много стрелок и соединений
        arrow_chars = ['→', '←', '↑', '↓', '->', '<-', '--', '==', '~~']
        connection_count = sum(content.count(char) for char in arrow_chars)

        # Если много соединительных символов, скорее всего это диаграмма
        return connection_count > 5

    def get_table_of_contents(self, content: str) -> str:
        """Генерация оглавления"""
        self.md.reset()
        self.md.convert(content)

        if hasattr(self.md, 'toc'):
            return self.md.toc

        return ""
