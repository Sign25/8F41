// Markdown to Word Converter - Browser-Only Application
// Полностью работает в браузере, без бэкенда
// Версия 3.0.0 - только DOCX генерация с поддержкой ASCII Art

(function() {
    'use strict';

    // Version
    const APP_VERSION = '3.0.0';
    const APP_NAME = 'Markdown to Word Converter';
    const BUILD_DATE = '2025-11-19';

    // DOM Elements
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const removeFileBtn = document.getElementById('removeFile');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');
    const optionsSection = document.getElementById('optionsSection');
    const convertBtn = document.getElementById('convertBtn');
    const progressSection = document.getElementById('progressSection');
    const progressText = document.getElementById('progressText');
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');

    // State
    let selectedFile = null;
    let markdownContent = '';
    let parsedHtml = '';
    let metadata = {};

    // Initialize Markdown-it with table support
    const md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        breaks: false,
        highlight: function (str, lang) {
            const langClass = lang ? ` class="language-${lang}"` : '';

            // For ASCII art diagrams, preserve as-is
            if (lang === 'ascii' || lang === 'ascii-art' || lang === 'diagram') {
                return `<pre class="ascii-diagram"><code${langClass}>${md.utils.escapeHtml(str)}</code></pre>`;
            }

            // For other languages, try to highlight
            if (lang && window.hljs && window.hljs.getLanguage(lang)) {
                try {
                    return '<pre class="hljs"><code' + langClass + '>' +
                           window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                           '</code></pre>';
                } catch (__) {}
            }
            return '<pre class="hljs"><code' + langClass + '>' + md.utils.escapeHtml(str) + '</code></pre>';
        }
    }).enable('table');

    // Initialize
    function init() {
        setupEventListeners();
        updateVersionInfo();
        console.log(`${APP_NAME} v${APP_VERSION} (Build: ${BUILD_DATE})`);

        // Check if required libraries are loaded
        console.log('Libraries loaded:');
        console.log('- markdown-it:', typeof markdownit !== 'undefined' ? '✓' : '✗');
        console.log('- docx:', typeof docx !== 'undefined' ? '✓' : '✗');
        console.log('- jsyaml:', typeof jsyaml !== 'undefined' ? '✓' : '✗');
        console.log('- hljs:', typeof hljs !== 'undefined' ? '✓' : '✗');
        console.log('- AsciiToSVG:', typeof window.AsciiToSVG !== 'undefined' ? '✓' : '✗');
    }

    // Update version info in footer
    function updateVersionInfo() {
        const versionEl = document.getElementById('versionInfo');
        if (versionEl) {
            versionEl.textContent = `${APP_NAME} v${APP_VERSION}`;
        }
    }

    // Event Listeners
    function setupEventListeners() {
        fileInput.addEventListener('change', handleFileSelect);

        uploadArea.addEventListener('click', (e) => {
            if (e.target.tagName !== 'LABEL' && !e.target.closest('label')) {
                fileInput.value = '';
                fileInput.click();
            }
        });

        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);
        removeFileBtn.addEventListener('click', removeFile);
        convertBtn.addEventListener('click', convertAndDownload);
        retryBtn.addEventListener('click', reset);
    }

    // Handle file selection
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    }

    // Handle drag over
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('drag-over');
    }

    // Handle drag leave
    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('drag-over');
    }

    // Handle drop
    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }

    // Process selected file
    async function processFile(file) {
        // Validate file type
        const validExtensions = ['md', 'markdown', 'txt'];
        const extension = file.name.split('.').pop().toLowerCase();

        if (!validExtensions.includes(extension)) {
            showError('Неподдерживаемый формат файла. Используйте .md, .markdown или .txt');
            return;
        }

        // Validate file size (10MB max for browser processing)
        if (file.size > 10 * 1024 * 1024) {
            showError('Файл слишком большой. Максимальный размер: 10MB');
            return;
        }

        selectedFile = file;

        try {
            // Read file content
            const content = await readFileAsText(file);
            markdownContent = content;

            // Parse YAML front matter
            metadata = extractMetadata(content);

            // Parse markdown
            const contentWithoutFrontMatter = removeFrontMatter(content);
            parsedHtml = md.render(contentWithoutFrontMatter);

            // Process ASCII art diagrams
            await processAsciiArtDiagrams();

            // Display file info and preview
            displayFileInfo(file);
            displayPreview();

        } catch (error) {
            showError('Ошибка при чтении файла: ' + error.message);
        }
    }

    // Read file as text
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Не удалось прочитать файл'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    // Extract YAML front matter
    function extractMetadata(content) {
        const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const match = content.match(frontMatterRegex);

        if (match) {
            try {
                const yamlData = jsyaml.load(match[1]);
                return {
                    title: yamlData.title || 'Документ',
                    author: yamlData.author || '',
                    date: yamlData.date || new Date().toLocaleDateString('ru-RU')
                };
            } catch (e) {
                console.warn('Failed to parse YAML front matter:', e);
            }
        }

        return {
            title: selectedFile ? selectedFile.name.replace(/\.(md|markdown|txt)$/, '') : 'Документ',
            author: '',
            date: new Date().toLocaleDateString('ru-RU')
        };
    }

    // Remove YAML front matter
    function removeFrontMatter(content) {
        const frontMatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
        return content.replace(frontMatterRegex, '');
    }

    // Process ASCII art diagrams
    async function processAsciiArtDiagrams() {
        if (typeof window.AsciiToSVG === 'undefined') {
            console.warn('AsciiToSVG library not loaded');
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;

        // Find all code blocks with ascii/diagram language
        const asciiBlocks = tempDiv.querySelectorAll('pre.ascii-diagram > code');

        console.log(`Found ${asciiBlocks.length} ASCII art code blocks`);

        if (asciiBlocks.length === 0) {
            return;
        }

        for (let i = 0; i < asciiBlocks.length; i++) {
            const block = asciiBlocks[i];
            const asciiCode = block.textContent.trim();

            if (!asciiCode) {
                continue;
            }

            console.log(`Processing ASCII diagram ${i + 1}:`, asciiCode.substring(0, 50));

            try {
                // Convert ASCII art to SVG
                const svg = window.AsciiToSVG.diagramToSVG(asciiCode, {
                    backdrop: false,
                    disableText: false,
                    showGrid: false
                });

                const svgDiv = document.createElement('div');
                svgDiv.className = 'ascii-diagram-svg';
                svgDiv.innerHTML = svg;

                // Replace the code block's parent <pre> element
                const preElement = block.closest('pre');
                if (preElement) {
                    preElement.replaceWith(svgDiv);
                    console.log(`Replaced <pre> with SVG diagram ${i + 1}`);
                }
            } catch (error) {
                console.error(`Failed to render ASCII diagram ${i + 1}:`, error);
                // Keep the original code block if rendering fails
            }
        }

        parsedHtml = tempDiv.innerHTML;
    }

    // Display file information
    function displayFileInfo(file) {
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);

        fileInfo.style.display = 'block';
        uploadArea.style.display = 'none';
    }

    // Display preview
    function displayPreview() {
        previewContent.innerHTML = parsedHtml;
        previewSection.style.display = 'block';
        optionsSection.style.display = 'block';
    }

    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    // Remove file
    function removeFile(e) {
        e.stopPropagation();
        reset();
    }

    // Convert and download
    async function convertAndDownload() {
        if (!selectedFile) {
            showError('Файл не выбран');
            return;
        }

        // Show progress
        optionsSection.style.display = 'none';
        previewSection.style.display = 'none';
        fileInfo.style.display = 'none';
        progressSection.style.display = 'block';

        try {
            progressText.textContent = 'Генерация DOCX...';
            await generateDOCX();

            // Success - reset after download
            setTimeout(reset, 2000);

        } catch (error) {
            console.error('Conversion error:', error);
            showError('Ошибка при генерации документа: ' + error.message);
        }
    }

    // Generate DOCX using docx library
    async function generateDOCX() {
        // Check if docx library is loaded
        if (typeof docx === 'undefined') {
            throw new Error('Библиотека docx.js не загружена. Обновите страницу.');
        }

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType } = docx;

        const children = [];

        // Add title
        if (metadata.title) {
            children.push(
                new Paragraph({
                    text: metadata.title,
                    heading: HeadingLevel.TITLE,
                    spacing: {
                        after: 200
                    }
                })
            );
        }

        // Add metadata
        if (metadata.author) {
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: `Автор: ${metadata.author}`, italics: true })],
                    spacing: {
                        after: 100
                    }
                })
            );
        }

        if (metadata.date) {
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: `Дата: ${metadata.date}`, italics: true })],
                    spacing: {
                        after: 200
                    }
                })
            );
        }

        children.push(new Paragraph({ text: '' })); // Empty line

        // Parse HTML and convert to DOCX elements
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;

        // Process all child elements
        for (const element of tempDiv.children) {
            const docxElements = await convertElementToDOCX(element);
            children.push(...docxElements);
        }

        const doc = new Document({
            sections: [{
                properties: {},
                children: children,
            }],
        });

        const blob = await Packer.toBlob(doc);
        const filename = metadata.title.replace(/[^a-z0-9а-яё ]/gi, '_').toLowerCase().replace(/\s+/g, '_') + '.docx';

        saveAs(blob, filename);
        console.log('DOCX generated successfully:', filename);
    }

    // Convert HTML element to DOCX element(s)
    async function convertElementToDOCX(element) {
        const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = docx;
        const tagName = element.tagName.toLowerCase();
        const elements = [];

        // Headings
        if (tagName.startsWith('h') && tagName.length === 2) {
            const level = parseInt(tagName.substring(1));
            const headingLevels = {
                1: HeadingLevel.HEADING_1,
                2: HeadingLevel.HEADING_2,
                3: HeadingLevel.HEADING_3,
                4: HeadingLevel.HEADING_4,
                5: HeadingLevel.HEADING_5,
                6: HeadingLevel.HEADING_6
            };

            elements.push(
                new Paragraph({
                    text: element.textContent,
                    heading: headingLevels[level] || HeadingLevel.HEADING_1,
                    spacing: {
                        before: 240,
                        after: 120
                    }
                })
            );
        }
        // Paragraphs
        else if (tagName === 'p') {
            elements.push(
                new Paragraph({
                    text: element.textContent,
                    spacing: {
                        after: 160
                    }
                })
            );
        }
        // Code blocks
        else if (tagName === 'pre') {
            const codeText = element.textContent;
            elements.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: codeText,
                            font: 'Courier New',
                            size: 20
                        })
                    ],
                    spacing: {
                        before: 120,
                        after: 120
                    },
                    shading: {
                        fill: 'F6F8FA'
                    }
                })
            );
        }
        // Lists
        else if (tagName === 'ul' || tagName === 'ol') {
            const listItems = element.querySelectorAll('li');
            listItems.forEach((li, index) => {
                const bullet = tagName === 'ul' ? '•' : `${index + 1}.`;
                elements.push(
                    new Paragraph({
                        text: `${bullet} ${li.textContent}`,
                        spacing: {
                            after: 80
                        },
                        indent: {
                            left: 720
                        }
                    })
                );
            });
        }
        // Tables
        else if (tagName === 'table') {
            const rows = element.querySelectorAll('tr');
            const tableRows = [];

            rows.forEach(tr => {
                const cells = tr.querySelectorAll('th, td');
                const tableCells = [];

                cells.forEach(cell => {
                    tableCells.push(
                        new TableCell({
                            children: [
                                new Paragraph({
                                    text: cell.textContent,
                                    ...(cell.tagName.toLowerCase() === 'th' ? { bold: true } : {})
                                })
                            ],
                            width: {
                                size: 100 / cells.length,
                                type: WidthType.PERCENTAGE
                            }
                        })
                    );
                });

                tableRows.push(new TableRow({ children: tableCells }));
            });

            elements.push(
                new Table({
                    rows: tableRows,
                    width: {
                        size: 100,
                        type: WidthType.PERCENTAGE
                    }
                })
            );
        }
        // Blockquotes
        else if (tagName === 'blockquote') {
            elements.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: element.textContent,
                            italics: true,
                            color: '666666'
                        })
                    ],
                    indent: {
                        left: 720
                    },
                    spacing: {
                        before: 120,
                        after: 120
                    }
                })
            );
        }
        // ASCII diagram SVG (insert as text placeholder)
        else if (element.classList.contains('ascii-diagram-svg')) {
            elements.push(
                new Paragraph({
                    text: '[ASCII Diagram - см. предпросмотр]',
                    spacing: {
                        before: 120,
                        after: 120
                    },
                    alignment: AlignmentType.CENTER,
                    italics: true,
                    color: '0066CC'
                })
            );
        }
        // Horizontal rule
        else if (tagName === 'hr') {
            elements.push(
                new Paragraph({
                    text: '─'.repeat(50),
                    alignment: AlignmentType.CENTER,
                    spacing: {
                        before: 120,
                        after: 120
                    }
                })
            );
        }
        // Default: just text
        else if (element.textContent.trim()) {
            elements.push(
                new Paragraph({
                    text: element.textContent,
                    spacing: {
                        after: 80
                    }
                })
            );
        }

        return elements;
    }

    // Show error
    function showError(message) {
        optionsSection.style.display = 'none';
        previewSection.style.display = 'none';
        progressSection.style.display = 'none';
        errorSection.style.display = 'block';
        errorMessage.textContent = message;
    }

    // Reset to initial state
    function reset() {
        selectedFile = null;
        markdownContent = '';
        parsedHtml = '';
        metadata = {};
        fileInput.value = '';

        fileInfo.style.display = 'none';
        previewSection.style.display = 'none';
        optionsSection.style.display = 'none';
        progressSection.style.display = 'none';
        errorSection.style.display = 'none';

        uploadArea.style.display = 'block';
    }

    // Initialize application
    init();
})();
