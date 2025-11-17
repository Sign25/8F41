"""
Setup script for Markdown Document Converter
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README
readme_file = Path(__file__).parent / "md_converter" / "README.md"
long_description = readme_file.read_text(encoding='utf-8') if readme_file.exists() else ""

# Read requirements
requirements_file = Path(__file__).parent / "md_converter" / "requirements.txt"
requirements = []
if requirements_file.exists():
    requirements = [
        line.strip()
        for line in requirements_file.read_text(encoding='utf-8').splitlines()
        if line.strip() and not line.startswith('#')
    ]

setup(
    name='md-document-converter',
    version='1.0.0',
    description='Конвертация Markdown документов в PDF и Word с поддержкой диаграмм и ASCII-арта',
    long_description=long_description,
    long_description_content_type='text/markdown',
    author='OCTA Team',
    author_email='team@octa.dev',
    url='https://github.com/octa/md-converter',
    packages=find_packages(),
    include_package_data=True,
    package_data={
        'md_converter': [
            'styles/*.css',
        ],
    },
    install_requires=requirements,
    entry_points={
        'console_scripts': [
            'md-converter=md_converter.cli:convert',
        ],
    },
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Developers',
        'Topic :: Documentation',
        'Topic :: Text Processing :: Markup',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
    ],
    python_requires='>=3.8',
    keywords='markdown pdf word docx converter documentation',
)
