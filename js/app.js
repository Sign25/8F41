// Markdown Document Converter - Client-Side Application
// Полностью работает в браузере, без бэкенда

(function() {
    'use strict';

    // Version
    const APP_VERSION = '2.1.0';
    const APP_NAME = 'Markdown Document Converter';
    const BUILD_DATE = '2024-11-18';

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
    const hiddenPreview = document.getElementById('hiddenPreview');

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

            // For Mermaid diagrams, just return code block with language class
            if (lang === 'mermaid') {
                return `<pre class="hljs"><code${langClass}>${md.utils.escapeHtml(str)}</code></pre>`;
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
    }

    // Update version info in footer
    function updateVersionInfo() {
        const versionEl = document.getElementById('versionInfo');
        if (versionEl) {
            versionEl.textContent = `${APP_NAME} v${APP_VERSION}`;
        }
        console.log(`${APP_NAME} v${APP_VERSION} (Build: ${BUILD_DATE})`);
    }

    // Event Listeners
    function setupEventListeners() {
        fileInput.addEventListener('change', handleFileSelect);

        // Click handler for upload area - but not on the label itself
        uploadArea.addEventListener('click', (e) => {
            // Don't trigger if clicking on the label
            if (e.target.tagName !== 'LABEL' && !e.target.closest('label')) {
                fileInput.value = ''; // Reset to allow selecting the same file twice
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
        const mermaidBlocks = tempDiv.querySelectorAll('pre > code.language-mermaid, code.language-mermaid');

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
                svgDiv.className = 'mermaid-diagram';
                svgDiv.innerHTML = svg;

                // Replace the code block's parent <pre> element
                const preElement = block.closest('pre');
                if (preElement) {
                    preElement.replaceWith(svgDiv);
                    console.log(`Replaced <pre> with diagram ${i + 1}`);
                } else {
                    block.parentElement.replaceWith(svgDiv);
                    console.log(`Replaced parent with diagram ${i + 1}`);
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

        const format = document.querySelector('input[name="format"]:checked').value;

        // Show progress
        optionsSection.style.display = 'none';
        previewSection.style.display = 'none';
        fileInfo.style.display = 'none';
        progressSection.style.display = 'block';

        try {
            if (format === 'pdf') {
                progressText.textContent = 'Генерация PDF...';
                await generatePDF();
            } else if (format === 'docx') {
                progressText.textContent = 'Генерация DOCX...';
                await generateDOCX();
            }

            // Success - reset after download
            setTimeout(reset, 2000);

        } catch (error) {
            console.error('Conversion error:', error);
            showError('Ошибка при генерации документа: ' + error.message);
        }
    }

    // Generate PDF using html2pdf.js for better Cyrillic support
    async function generatePDF() {
        console.log('Starting PDF generation with html2pdf.js for Cyrillic support');

        // Create a container for PDF generation with proper styling
        const pdfContainer = document.createElement('div');
        pdfContainer.style.cssText = `
            position: absolute;
            left: -9999px;
            width: 210mm;
            padding: 25mm;
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
        `;

        // Add title page if metadata exists
        let titleHtml = '';
        if (metadata.title && metadata.title.trim()) {
            titleHtml += `
                <div style="text-align: center; margin-bottom: 30mm;">
                    <h1 style="font-size: 24pt; margin: 60mm 0 20mm 0; font-weight: bold;">${metadata.title}</h1>
            `;
            if (metadata.author) {
                titleHtml += `<p style="font-size: 14pt; margin: 10mm 0;">Автор: ${metadata.author}</p>`;
            }
            if (metadata.date) {
                titleHtml += `<p style="font-size: 14pt; margin: 10mm 0;">Дата: ${metadata.date}</p>`;
            }
            titleHtml += `</div>`;
        }

        // Add content with proper styling
        const contentHtml = `
            <style>
                @page {
                    margin: 0;
                }
                body {
                    margin: 0;
                    padding: 0;
                }
                h1 {
                    font-size: 20pt;
                    margin: 15mm 0 8mm 0;
                    font-weight: bold;
                    page-break-before: always;
                    page-break-after: avoid;
                }
                h1:first-of-type {
                    page-break-before: auto;
                }
                h2 {
                    font-size: 16pt;
                    margin: 12mm 0 6mm 0;
                    font-weight: bold;
                    page-break-after: avoid;
                }
                h3 {
                    font-size: 14pt;
                    margin: 10mm 0 5mm 0;
                    font-weight: bold;
                    page-break-after: avoid;
                }
                p {
                    margin: 0 0 5mm 0;
                    text-align: justify;
                }
                pre {
                    background: #f6f8fa;
                    padding: 3mm;
                    border-radius: 1mm;
                    overflow-x: auto;
                    font-family: "Courier New", Courier, monospace;
                    font-size: 10pt;
                    line-height: 1.4;
                    page-break-inside: avoid;
                }
                code {
                    background: #f6f8fa;
                    padding: 1mm 2mm;
                    border-radius: 0.5mm;
                    font-family: "Courier New", Courier, monospace;
                    font-size: 10pt;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 5mm 0;
                    page-break-inside: avoid;
                }
                th, td {
                    border: 0.5pt solid #d0d7de;
                    padding: 2mm 3mm;
                    text-align: left;
                }
                th {
                    background: #f6f8fa;
                    font-weight: bold;
                }
                blockquote {
                    margin: 5mm 0;
                    padding-left: 4mm;
                    border-left: 1mm solid #d0d7de;
                    color: #57606a;
                }
                ul, ol {
                    margin: 5mm 0;
                    padding-left: 8mm;
                }
                li {
                    margin: 2mm 0;
                }
                img {
                    max-width: 100%;
                    height: auto;
                    page-break-inside: avoid;
                }
                .mermaid-diagram {
                    text-align: center;
                    margin: 5mm 0;
                    page-break-inside: avoid;
                }
            </style>
            ${titleHtml}
            ${parsedHtml}
        `;

        pdfContainer.innerHTML = contentHtml;
        document.body.appendChild(pdfContainer);

        try {
            // Configure html2pdf options
            const filename = metadata.title.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase() + '.pdf';

            const options = {
                margin: 0, // We handle margins in CSS
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    letterRendering: true
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait',
                    compress: true
                },
                pagebreak: {
                    mode: ['avoid-all', 'css', 'legacy'],
                    before: '.page-break-before',
                    after: '.page-break-after',
                    avoid: ['h1', 'h2', 'h3', 'pre', 'table', '.mermaid-diagram']
                }
            };

            console.log('Generating PDF with filename:', filename);

            // Generate and save PDF
            await html2pdf().set(options).from(pdfContainer).save();

            console.log('PDF generated successfully with Cyrillic support');
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        } finally {
            // Clean up
            document.body.removeChild(pdfContainer);
        }
    }

// Generate DOCX using docx library
    async function generateDOCX() {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

        // Parse HTML to docx elements
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;

        const children = [];

        // Add title
        if (metadata.title) {
            children.push(
                new Paragraph({
                    text: metadata.title,
                    heading: HeadingLevel.TITLE,
                })
            );
        }

        // Add metadata
        if (metadata.author) {
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: `Автор: ${metadata.author}`, italics: true })],
                })
            );
        }

        children.push(new Paragraph({ text: '' })); // Empty line

        // Convert HTML elements to docx paragraphs (simplified)
        const elements = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, ul, ol');

        elements.forEach(el => {
            const tagName = el.tagName.toLowerCase();

            if (tagName.startsWith('h')) {
                const level = parseInt(tagName.substring(1));
                children.push(
                    new Paragraph({
                        text: el.textContent,
                        heading: HeadingLevel[`HEADING_${level}`] || HeadingLevel.HEADING_1,
                    })
                );
            } else if (tagName === 'p') {
                children.push(
                    new Paragraph({
                        text: el.textContent,
                    })
                );
            } else if (tagName === 'pre') {
                children.push(
                    new Paragraph({
                        children: [new TextRun({ text: el.textContent, font: 'Courier New' })],
                    })
                );
            }
        });

        const doc = new Document({
            sections: [{
                properties: {},
                children: children,
            }],
        });

        const blob = await Packer.toBlob(doc);
        const filename = metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.docx';

        saveAs(blob, filename);
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

        document.querySelector('input[name="format"][value="pdf"]').checked = true;
    }

    // Initialize application
    init();
})();
