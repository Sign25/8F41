// Markdown to Word Converter - Browser-Only Application
// Полностью работает в браузере, без бэкенда
// Версия 3.3.4 - Удалены emoji для академического стиля

(async function() {
    'use strict';

    // Version
    const APP_VERSION = '3.3.4';
    const APP_NAME = 'Markdown to Word Converter';
    const BUILD_DATE = '2025-11-19';

    // Load svgbob-wasm dynamically
    let svgbobRender = null;
    console.log('Attempting to load svgbob-wasm...');
    try {
        // Try unpkg first
        const svgbobModule = await import('https://unpkg.com/svgbob-wasm@1.0.0/svgbob_wasm.js');
        await svgbobModule.default();  // Initialize WASM
        svgbobRender = svgbobModule.render;
        console.log('[OK] svgbob-wasm loaded successfully from unpkg');
    } catch (error) {
        console.warn('Failed to load svgbob-wasm from unpkg:', error.message);
        try {
            // Try esm.sh as fallback
            const svgbobModule = await import('https://esm.sh/svgbob-wasm@1.0.0');
            svgbobRender = svgbobModule.render;
            console.log('[OK] svgbob-wasm loaded successfully from esm.sh');
        } catch (error2) {
            console.warn('Failed to load svgbob-wasm from esm.sh:', error2.message);
            console.warn('[FALLBACK] ASCII diagrams will be displayed as formatted code');
        }
    }

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

            // For Mermaid diagrams, just return code block with language class
            if (lang === 'mermaid') {
                return `<pre class="mermaid-diagram"><code${langClass}>${md.utils.escapeHtml(str)}</code></pre>`;
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

    // Initialize Mermaid
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose'
        });
    }

    // Initialize
    function init() {
        setupEventListeners();
        updateVersionInfo();
        console.log(`${APP_NAME} v${APP_VERSION} (Build: ${BUILD_DATE})`);

        // Check if required libraries are loaded
        console.log('Libraries loaded:');
        console.log('- markdown-it:', typeof markdownit !== 'undefined' ? '[OK]' : '[FAIL]');
        console.log('- docx:', typeof docx !== 'undefined' ? '[OK]' : '[FAIL]');
        console.log('- jsyaml:', typeof jsyaml !== 'undefined' ? '[OK]' : '[FAIL]');
        console.log('- hljs:', typeof hljs !== 'undefined' ? '[OK]' : '[FAIL]');
        console.log('- mermaid:', typeof mermaid !== 'undefined' ? '[OK]' : '[FAIL]');
        console.log('- svgbob:', svgbobRender !== null ? '[OK]' : '[FAIL]');
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

            // Process Mermaid diagrams
            await processMermaidDiagrams();

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

    // Process Mermaid diagrams
    async function processMermaidDiagrams() {
        if (typeof mermaid === 'undefined') {
            console.warn('Mermaid library not loaded');
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;

        // Find all code blocks with mermaid language
        const mermaidBlocks = tempDiv.querySelectorAll('pre.mermaid-diagram > code');

        console.log(`Found ${mermaidBlocks.length} Mermaid code blocks`);

        if (mermaidBlocks.length === 0) {
            return;
        }

        for (let i = 0; i < mermaidBlocks.length; i++) {
            const block = mermaidBlocks[i];
            const mermaidCode = block.textContent.trim();

            if (!mermaidCode) {
                continue;
            }

            console.log(`Processing Mermaid diagram ${i + 1}:`, mermaidCode.substring(0, 50));

            try {
                const uniqueId = `mermaid-diagram-${Date.now()}-${i}`;
                const { svg } = await mermaid.render(uniqueId, mermaidCode);
                const svgDiv = document.createElement('div');
                svgDiv.className = 'mermaid-diagram-svg';
                svgDiv.innerHTML = svg;

                // Replace the code block's parent <pre> element
                const preElement = block.closest('pre');
                if (preElement) {
                    preElement.replaceWith(svgDiv);
                    console.log(`Replaced <pre> with Mermaid diagram ${i + 1}`);
                } else {
                    block.parentElement.replaceWith(svgDiv);
                    console.log(`Replaced parent with Mermaid diagram ${i + 1}`);
                }
            } catch (error) {
                console.error(`Failed to render Mermaid diagram ${i + 1}:`, error);
                // Keep the original code block if rendering fails
                const errorDiv = document.createElement('div');
                errorDiv.className = 'mermaid-error';
                errorDiv.style.color = '#e74c3c';
                errorDiv.style.padding = '10px';
                errorDiv.style.border = '1px solid #e74c3c';
                errorDiv.style.borderRadius = '4px';
                errorDiv.style.margin = '10px 0';
                errorDiv.textContent = `Ошибка рендеринга Mermaid диаграммы: ${error.message}`;
                const preElement = block.closest('pre');
                if (preElement) {
                    preElement.insertAdjacentElement('afterend', errorDiv);
                }
            }
        }

        parsedHtml = tempDiv.innerHTML;
    }

    // Process ASCII art diagrams using svgbob-wasm
    async function processAsciiArtDiagrams() {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;

        // Find all code blocks with ascii/diagram language
        const asciiBlocks = tempDiv.querySelectorAll('pre.ascii-diagram > code');

        console.log(`=== ASCII Art Processing ===`);
        console.log(`Found ${asciiBlocks.length} ASCII art code blocks`);
        console.log(`svgbob-wasm available: ${svgbobRender !== null}`);

        if (asciiBlocks.length === 0) {
            console.log('No ASCII art blocks found. Check if code is marked with ```ascii language tag.');
            return;
        }

        for (let i = 0; i < asciiBlocks.length; i++) {
            const block = asciiBlocks[i];
            const asciiCode = block.textContent.trim();

            if (!asciiCode) {
                console.log(`Diagram ${i + 1}: Empty content, skipping`);
                continue;
            }

            console.log(`\n--- Processing ASCII diagram ${i + 1} ---`);
            console.log(`Content length: ${asciiCode.length} characters`);
            console.log(`First line: ${asciiCode.split('\n')[0]}`);
            console.log(`Contains Unicode: ${/[^\x00-\x7F]/.test(asciiCode)}`);

            // Detect Unicode box-drawing characters
            const hasUnicodeBoxDrawing = /[─│┌┐└┘├┤┬┴┼╭╮╯╰]/.test(asciiCode);
            const hasUnicodeArrows = /[→←↑↓►◄▲▼]/.test(asciiCode);
            if (hasUnicodeBoxDrawing) {
                console.log(`✓ Contains Unicode box-drawing characters`);
            }
            if (hasUnicodeArrows) {
                console.log(`✓ Contains Unicode arrow characters`);
            }

            // Try to convert to SVG using svgbob-wasm
            if (svgbobRender) {
                try {
                    console.log(`Attempting svgbob conversion...`);
                    const svg = svgbobRender(asciiCode);

                    console.log(`svgbob returned: ${svg ? svg.length : 0} characters`);

                    if (svg && svg.length > 0) {
                        const svgDiv = document.createElement('div');
                        svgDiv.className = 'ascii-diagram-svg';
                        svgDiv.innerHTML = svg;

                        // Replace the code block's parent <pre> element
                        const preElement = block.closest('pre');
                        if (preElement) {
                            preElement.replaceWith(svgDiv);
                            console.log(`✓ Successfully converted ASCII diagram ${i + 1} to SVG`);
                            continue; // Successfully converted, move to next
                        }
                    } else {
                        console.warn(`svgbob returned empty result for diagram ${i + 1}`);
                    }
                } catch (error) {
                    console.error(`svgbob error for diagram ${i + 1}:`, error);
                    console.error(`Error type: ${error.name}, Message: ${error.message}`);
                }
            } else {
                console.warn(`svgbob-wasm not loaded, cannot convert diagram ${i + 1}`);
            }

            // Fallback: display as formatted code block (no conversion)
            console.log(`Using fallback display for diagram ${i + 1}`);
            const preElement = block.closest('pre');
            if (preElement) {
                // Add special class for ASCII diagrams that will be styled differently
                preElement.classList.add('ascii-diagram-code');
                // Use fonts that support Unicode box-drawing characters
                preElement.style.fontFamily = '"Courier New", Courier, "DejaVu Sans Mono", monospace';
                preElement.style.fontSize = '12px';
                preElement.style.lineHeight = '1.2';
                preElement.style.backgroundColor = '#f8f8f8';
                preElement.style.padding = '15px';
                preElement.style.border = '1px solid #ddd';
                preElement.style.borderRadius = '4px';
                preElement.style.overflowX = 'auto';
                preElement.style.whiteSpace = 'pre';
                // Ensure Unicode characters render properly
                block.style.fontFamily = 'inherit';
                console.log(`[FALLBACK] Displaying ASCII diagram ${i + 1} as formatted code (Unicode-aware)`);
            }
        }

        parsedHtml = tempDiv.innerHTML;
        console.log(`=== ASCII Art Processing Complete ===\n`);
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

    // Convert SVG element to PNG data URL
    async function svgToPng(svgElement) {
        return new Promise((resolve, reject) => {
            try {
                // Get the SVG element (either the div contains SVG or is SVG itself)
                let svgNode = svgElement.querySelector('svg');
                if (!svgNode && svgElement.tagName.toLowerCase() === 'svg') {
                    svgNode = svgElement;
                }

                if (!svgNode) {
                    reject(new Error('No SVG element found'));
                    return;
                }

                // Clone and get SVG string
                const svgClone = svgNode.cloneNode(true);

                // Ensure SVG has proper attributes
                if (!svgClone.hasAttribute('xmlns')) {
                    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                }

                // Get dimensions
                const bbox = svgNode.getBoundingClientRect();
                let width = parseInt(svgClone.getAttribute('width')) || bbox.width || 800;
                let height = parseInt(svgClone.getAttribute('height')) || bbox.height || 600;

                // Set explicit dimensions if not present
                svgClone.setAttribute('width', width);
                svgClone.setAttribute('height', height);

                const svgString = new XMLSerializer().serializeToString(svgClone);

                // Use data URI instead of blob URL to avoid CORS issues
                const svgDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));

                // Create image
                const img = new Image();
                img.crossOrigin = 'anonymous';  // Try to avoid CORS issues

                img.onload = function() {
                    try {
                        // Create canvas with proper dimensions
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        // White background
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);

                        // Convert to PNG using toDataURL instead of toBlob to avoid CORS
                        const pngDataUrl = canvas.toDataURL('image/png');

                        // Convert data URL to ArrayBuffer
                        const base64 = pngDataUrl.split(',')[1];
                        const binaryString = atob(base64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }

                        console.log('SVG converted to PNG, size:', bytes.length, 'bytes');
                        resolve(bytes.buffer);
                    } catch (error) {
                        console.error('Canvas conversion error:', error);
                        reject(error);
                    }
                };

                img.onerror = (e) => {
                    console.error('Failed to load SVG image:', e);
                    reject(new Error('Failed to load SVG image'));
                };

                img.src = svgDataUri;
            } catch (error) {
                console.error('svgToPng error:', error);
                reject(error);
            }
        });
    }

    // Generate DOCX using docx library
    async function generateDOCX() {
        console.log('Starting DOCX generation...');

        // Check if docx library is loaded
        if (typeof docx === 'undefined') {
            throw new Error('Библиотека docx.js не загружена. Обновите страницу.');
        }

        console.log('docx library loaded, extracting components...');
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, ImageRun, Media, BorderStyle } = docx;

        const children = [];
        console.log('Starting to process elements...');

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

        console.log(`Processing ${tempDiv.children.length} HTML elements...`);

        // Process all child elements
        let elementIndex = 0;
        for (const element of tempDiv.children) {
            elementIndex++;
            console.log(`Processing element ${elementIndex}/${tempDiv.children.length}: ${element.tagName}`);
            try {
                const docxElements = await convertElementToDOCX(element);
                children.push(...docxElements);
            } catch (error) {
                console.error(`Error processing element ${elementIndex}:`, error);
                throw error;
            }
        }

        console.log('Creating DOCX document structure...');
        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: {
                            font: 'Times New Roman',
                            size: 22  // 11pt (half-points)
                        },
                        paragraph: {
                            spacing: {
                                line: 276,  // 1.15 line spacing
                                before: 0,
                                after: 160
                            }
                        }
                    }
                },
                paragraphStyles: [
                    {
                        id: 'Normal',
                        name: 'Normal',
                        basedOn: 'Normal',
                        next: 'Normal',
                        run: {
                            font: 'Times New Roman',
                            size: 22
                        },
                        paragraph: {
                            spacing: {
                                line: 276,
                                before: 0,
                                after: 160
                            },
                            indent: {
                                firstLine: 720  // 0.5 inch first line indent
                            },
                            alignment: AlignmentType.JUSTIFIED
                        }
                    },
                    {
                        id: 'Heading1',
                        name: 'Heading 1',
                        basedOn: 'Normal',
                        next: 'Normal',
                        run: {
                            font: 'Times New Roman',
                            size: 32,  // 16pt
                            bold: true
                        },
                        paragraph: {
                            spacing: {
                                before: 480,
                                after: 240
                            },
                            alignment: AlignmentType.LEFT
                        }
                    }
                ]
            },
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440,    // 1 inch
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                children: children,
            }],
        });

        console.log('Packing document to blob...');
        const blob = await Packer.toBlob(doc);
        console.log('Blob created, size:', blob.size, 'bytes');

        const filename = metadata.title.replace(/[^a-z0-9а-яё ]/gi, '_').toLowerCase().replace(/\s+/g, '_') + '.docx';

        console.log('Saving file:', filename);
        saveAs(blob, filename);
        console.log('[OK] DOCX generated successfully:', filename);
    }

    // Convert HTML element to DOCX element(s)
    async function convertElementToDOCX(element) {
        const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, Media } = docx;
        const tagName = element.tagName.toLowerCase();
        const elements = [];

        // Headings - академический стиль
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

            // Размеры шрифтов для заголовков (в half-points)
            const fontSizes = {
                1: 32,  // 16pt
                2: 28,  // 14pt
                3: 26,  // 13pt
                4: 24,  // 12pt
                5: 22,  // 11pt
                6: 22   // 11pt
            };

            elements.push(
                new Paragraph({
                    text: element.textContent,
                    heading: headingLevels[level] || HeadingLevel.HEADING_1,
                    style: 'Heading' + level,
                    spacing: {
                        before: level === 1 ? 480 : 360,
                        after: level === 1 ? 240 : 180
                    },
                    run: {
                        font: 'Times New Roman',
                        size: fontSizes[level] || 22,
                        bold: true
                    }
                })
            );
        }
        // Paragraphs - академический стиль с выравниванием по ширине
        else if (tagName === 'p') {
            elements.push(
                new Paragraph({
                    text: element.textContent,
                    style: 'Normal',
                    alignment: AlignmentType.JUSTIFIED,
                    indent: {
                        firstLine: 720  // отступ первой строки
                    },
                    spacing: {
                        line: 276,
                        after: 160
                    },
                    run: {
                        font: 'Times New Roman',
                        size: 22
                    }
                })
            );
        }
        // Code blocks - моноширинный шрифт
        else if (tagName === 'pre') {
            const codeText = element.textContent;
            elements.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: codeText,
                            font: 'Courier New',
                            size: 20  // 10pt
                        })
                    ],
                    spacing: {
                        before: 240,
                        after: 240
                    },
                    shading: {
                        fill: 'F5F5F5'
                    },
                    indent: {
                        left: 360,
                        right: 360
                    }
                })
            );
        }
        // Lists - компактный стиль
        else if (tagName === 'ul' || tagName === 'ol') {
            const listItems = element.querySelectorAll('li');
            listItems.forEach((li, index) => {
                const bullet = tagName === 'ul' ? '•' : `${index + 1}.`;
                elements.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `${bullet} ${li.textContent}`,
                                font: 'Times New Roman',
                                size: 22
                            })
                        ],
                        spacing: {
                            after: 100,
                            line: 276
                        },
                        indent: {
                            left: 720,
                            hanging: 360
                        },
                        alignment: AlignmentType.JUSTIFIED
                    })
                );
            });
        }
        // Tables - академический минималистичный стиль
        else if (tagName === 'table') {
            const rows = element.querySelectorAll('tr');
            const tableRows = [];

            rows.forEach((tr, rowIndex) => {
                const cells = tr.querySelectorAll('th, td');
                const tableCells = [];
                const isHeader = rowIndex === 0 || tr.querySelector('th') !== null;

                cells.forEach(cell => {
                    const isHeaderCell = cell.tagName.toLowerCase() === 'th';
                    tableCells.push(
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: cell.textContent,
                                            font: 'Times New Roman',
                                            size: 20,  // 10pt для таблиц
                                            bold: isHeaderCell
                                        })
                                    ],
                                    alignment: AlignmentType.LEFT
                                })
                            ],
                            width: {
                                size: 100 / cells.length,
                                type: WidthType.PERCENTAGE
                            },
                            margins: {
                                top: 100,
                                bottom: 100,
                                left: 100,
                                right: 100
                            }
                        })
                    );
                });

                tableRows.push(new TableRow({ children: tableCells }));
            });

            const { BorderStyle } = docx;
            elements.push(
                new Table({
                    rows: tableRows,
                    width: {
                        size: 100,
                        type: WidthType.PERCENTAGE
                    },
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
                        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
                        left: { style: BorderStyle.NONE, size: 0 },
                        right: { style: BorderStyle.NONE, size: 0 },
                        insideHorizontal: { style: BorderStyle.SINGLE, size: 3, color: 'CCCCCC' },
                        insideVertical: { style: BorderStyle.NONE, size: 0 }
                    }
                })
            );
            elements.push(new Paragraph({ text: '' })); // Пустая строка после таблицы
        }
        // Blockquotes - академический стиль
        else if (tagName === 'blockquote') {
            elements.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: element.textContent,
                            font: 'Times New Roman',
                            size: 20,  // 10pt
                            italics: true
                        })
                    ],
                    indent: {
                        left: 720,
                        right: 720
                    },
                    spacing: {
                        before: 240,
                        after: 240
                    },
                    alignment: AlignmentType.JUSTIFIED
                })
            );
        }
        // ASCII diagram as SVG - вставка как изображение
        else if (element.classList.contains('ascii-diagram-svg')) {
            console.log('Converting ASCII diagram SVG to PNG...');
            try {
                const imageBuffer = await svgToPng(element);
                const imageData = new Uint8Array(imageBuffer);

                elements.push(
                    new Paragraph({
                        children: [
                            new ImageRun({
                                data: imageData,
                                transformation: {
                                    width: 600,
                                    height: 400
                                }
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: {
                            before: 240,
                            after: 240
                        }
                    })
                );
                console.log('[OK] ASCII diagram inserted as image');
            } catch (error) {
                console.error('Failed to convert ASCII diagram to image:', error);
                // Fallback to text
                const asciiText = element.textContent || '[ASCII Diagram - ошибка конвертации]';
                elements.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: asciiText,
                                font: 'Courier New',
                                size: 18
                            })
                        ],
                        spacing: {
                            before: 240,
                            after: 240
                        },
                        alignment: AlignmentType.CENTER,
                        shading: {
                            fill: 'F5F5F5'
                        }
                    })
                );
            }
        }
        // ASCII diagram as code (fallback) - вставка как моноширинный текст
        else if (element.classList.contains('ascii-diagram-code')) {
            const codeElement = element.querySelector('code');
            const asciiText = codeElement ? codeElement.textContent : element.textContent;

            // Split into lines and create TextRun for each line with breaks
            const lines = asciiText.split('\n');
            const children = [];

            for (let i = 0; i < lines.length; i++) {
                children.push(
                    new TextRun({
                        text: lines[i],
                        font: 'Courier New',
                        size: 18  // 9pt для ASCII art
                    })
                );
                // Add line break between lines (except after last line)
                if (i < lines.length - 1) {
                    children.push(new TextRun({ break: 1 }));
                }
            }

            elements.push(
                new Paragraph({
                    children: children,
                    spacing: {
                        before: 240,
                        after: 240,
                        line: 240  // Fixed line spacing for ASCII art
                    },
                    indent: {
                        left: 360,
                        right: 360
                    },
                    shading: {
                        fill: 'F8F8F8'
                    },
                    border: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
                        left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
                        right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' }
                    }
                })
            );
            console.log(`[FALLBACK] ASCII diagram inserted as formatted code (${lines.length} lines, Unicode-aware)`);
        }
        // Mermaid diagram SVG - вставка как изображение
        else if (element.classList.contains('mermaid-diagram-svg')) {
            console.log('Converting Mermaid diagram SVG to PNG...');
            try {
                const imageBuffer = await svgToPng(element);
                const imageData = new Uint8Array(imageBuffer);

                elements.push(
                    new Paragraph({
                        children: [
                            new ImageRun({
                                data: imageData,
                                transformation: {
                                    width: 600,
                                    height: 400
                                }
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: {
                            before: 240,
                            after: 240
                        }
                    })
                );
                console.log('[OK] Mermaid diagram inserted as image');
            } catch (error) {
                console.error('Failed to convert Mermaid diagram to image:', error);
                elements.push(
                    new Paragraph({
                        text: '[Mermaid Diagram - ошибка конвертации]',
                        spacing: {
                            before: 240,
                            after: 240
                        },
                        alignment: AlignmentType.CENTER,
                        italics: true,
                        color: '999999'
                    })
                );
            }
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
