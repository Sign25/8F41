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
            if (lang && window.hljs && window.hljs.getLanguage(lang)) {
                try {
                    return '<pre class="hljs"><code>' +
                           window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                           '</code></pre>';
                } catch (__) {}
            }
            return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
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
        uploadArea.addEventListener('click', () => fileInput.click());
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

    // Generate PDF with academic style using jsPDF
    async function generatePDF() {
        const { jsPDF } = window.jspdf;

        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            putOnlyUsedFonts: true,
            compress: true
        });

        // Academic style settings
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 25; // 25mm margins
        const contentWidth = pageWidth - 2 * margin;
        let yPosition = margin;

        // Font sizes (12pt = ~4.23mm)
        const fontSize = {
            title: 18,
            h1: 16,
            h2: 14,
            h3: 12,
            normal: 12,
            small: 10
        };

        // Line heights
        const lineHeight = {
            title: 8,
            h1: 7,
            h2: 6,
            h3: 5,
            normal: 5,
            small: 4
        };

        // Helper function to add new page
        function checkAddPage(requiredHeight = 20) {
            if (yPosition + requiredHeight > pageHeight - margin) {
                pdf.addPage();
                yPosition = margin;
                return true;
            }
            return false;
        }

        // Helper function to split text into lines
        function splitText(text, maxWidth) {
            return pdf.splitTextToSize(text, maxWidth);
        }

        // Title page
        if (metadata.title && metadata.title.trim()) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(fontSize.title);
            const titleLines = splitText(metadata.title, contentWidth);
            titleLines.forEach(line => {
                pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
                yPosition += lineHeight.title;
            });
            yPosition += 10;
        }

        // Metadata
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(fontSize.small);
        if (metadata.author) {
            pdf.text(`Автор: ${metadata.author}`, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += lineHeight.small;
        }
        if (metadata.date) {
            pdf.text(`Дата: ${metadata.date}`, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += lineHeight.small;
        }

        yPosition += 15;

        // Parse HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;

        // Process each element
        const elements = tempDiv.children;

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const tagName = element.tagName.toLowerCase();

            // H1 - start new page
            if (tagName === 'h1') {
                if (yPosition > margin + 20) {
                    pdf.addPage();
                    yPosition = margin;
                }
                checkAddPage(20);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(fontSize.h1);
                const lines = splitText(element.textContent.trim(), contentWidth);
                lines.forEach(line => {
                    pdf.text(line, margin, yPosition);
                    yPosition += lineHeight.h1;
                });
                yPosition += 5;
            }
            // H2
            else if (tagName === 'h2') {
                checkAddPage(15);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(fontSize.h2);
                const lines = splitText(element.textContent.trim(), contentWidth);
                lines.forEach(line => {
                    pdf.text(line, margin, yPosition);
                    yPosition += lineHeight.h2;
                });
                yPosition += 4;
            }
            // H3
            else if (tagName === 'h3') {
                checkAddPage(12);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(fontSize.h3);
                const lines = splitText(element.textContent.trim(), contentWidth);
                lines.forEach(line => {
                    pdf.text(line, margin, yPosition);
                    yPosition += lineHeight.h3;
                });
                yPosition += 3;
            }
            // Paragraph
            else if (tagName === 'p') {
                checkAddPage(10);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(fontSize.normal);
                const lines = splitText(element.textContent.trim(), contentWidth);
                lines.forEach(line => {
                    checkAddPage(lineHeight.normal + 2);
                    pdf.text(line, margin, yPosition);
                    yPosition += lineHeight.normal;
                });
                yPosition += 3;
            }
            // Code block
            else if (tagName === 'pre') {
                checkAddPage(15);
                const code = element.textContent.trim();
                pdf.setFont('courier', 'normal');
                pdf.setFontSize(fontSize.small);
                pdf.setFillColor(246, 248, 250);
                const codeLines = code.split('\n');
                const codeHeight = codeLines.length * lineHeight.small + 4;

                checkAddPage(codeHeight);

                pdf.rect(margin, yPosition - 2, contentWidth, codeHeight, 'F');
                codeLines.forEach(line => {
                    const splitLines = splitText(line || ' ', contentWidth - 4);
                    splitLines.forEach(subLine => {
                        pdf.text(subLine, margin + 2, yPosition);
                        yPosition += lineHeight.small;
                    });
                });
                yPosition += 5;
            }
            // Table
            else if (tagName === 'table') {
                const headers = [];
                const rows = [];

                // Extract headers
                const headerCells = element.querySelectorAll('thead th, tr:first-child th');
                headerCells.forEach(cell => headers.push(cell.textContent.trim()));

                // Extract rows
                const bodyRows = element.querySelectorAll('tbody tr, tr:not(:first-child)');
                bodyRows.forEach(row => {
                    const rowData = [];
                    row.querySelectorAll('td').forEach(cell => {
                        rowData.push(cell.textContent.trim());
                    });
                    if (rowData.length > 0) rows.push(rowData);
                });

                checkAddPage(20);

                pdf.autoTable({
                    head: headers.length > 0 ? [headers] : undefined,
                    body: rows,
                    startY: yPosition,
                    margin: { left: margin, right: margin },
                    styles: {
                        font: 'helvetica',
                        fontSize: fontSize.normal,
                        cellPadding: 2,
                        lineColor: [208, 215, 222],
                        lineWidth: 0.1
                    },
                    headStyles: {
                        fillColor: [246, 248, 250],
                        textColor: [0, 0, 0],
                        fontStyle: 'bold'
                    },
                    alternateRowStyles: {
                        fillColor: [246, 248, 250]
                    },
                    tableLineColor: [208, 215, 222],
                    tableLineWidth: 0.1
                });

                yPosition = pdf.lastAutoTable.finalY + 5;
            }
            // Mermaid diagram
            else if (element.classList.contains('mermaid-diagram')) {
                checkAddPage(80);

                const svg = element.querySelector('svg');
                if (svg) {
                    try {
                        // Create temporary container for diagram
                        const diagramContainer = document.createElement('div');
                        diagramContainer.style.position = 'absolute';
                        diagramContainer.style.left = '-9999px';
                        diagramContainer.style.background = 'white';
                        diagramContainer.style.padding = '20px';
                        diagramContainer.appendChild(svg.cloneNode(true));
                        document.body.appendChild(diagramContainer);

                        const canvas = await html2canvas(diagramContainer, {
                            scale: 2,
                            backgroundColor: '#ffffff'
                        });

                        document.body.removeChild(diagramContainer);

                        // Check if canvas is valid
                        if (canvas.width === 0 || canvas.height === 0) {
                            console.warn('Invalid canvas size for diagram');
                            return;
                        }

                        const imgData = canvas.toDataURL('image/png');
                        const imgWidth = contentWidth;
                        const imgHeight = (canvas.height * imgWidth) / canvas.width;

                        // Ensure diagram fits on one page
                        if (imgHeight > pageHeight - margin * 2) {
                            const scale = (pageHeight - margin * 2) / imgHeight;
                            const scaledWidth = imgWidth * scale;
                            const scaledHeight = imgHeight * scale;
                            checkAddPage(scaledHeight);
                            pdf.addImage(imgData, 'PNG', margin, yPosition, scaledWidth, scaledHeight);
                            yPosition += scaledHeight + 5;
                        } else {
                            checkAddPage(imgHeight);
                            pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
                            yPosition += imgHeight + 5;
                        }
                    } catch (error) {
                        console.error('Error rendering diagram:', error);
                    }
                }
            }
            // Blockquote
            else if (tagName === 'blockquote') {
                checkAddPage(10);
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(fontSize.normal);
                pdf.setDrawColor(208, 215, 222);
                pdf.setLineWidth(1);

                const quoteText = element.textContent.trim();
                const lines = splitText(quoteText, contentWidth - 10);
                const quoteHeight = lines.length * lineHeight.normal;

                checkAddPage(quoteHeight + 4);

                pdf.line(margin + 2, yPosition - 2, margin + 2, yPosition + quoteHeight);
                lines.forEach(line => {
                    pdf.text(line, margin + 6, yPosition);
                    yPosition += lineHeight.normal;
                });
                yPosition += 4;
            }
            // Lists
            else if (tagName === 'ul' || tagName === 'ol') {
                const items = element.querySelectorAll('li');
                items.forEach((item, index) => {
                    checkAddPage(8);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(fontSize.normal);

                    const bullet = tagName === 'ul' ? '•' : `${index + 1}.`;
                    const text = item.textContent.trim();
                    const lines = splitText(text, contentWidth - 10);

                    pdf.text(bullet, margin + 2, yPosition);
                    lines.forEach((line, lineIndex) => {
                        pdf.text(line, margin + 8, yPosition + (lineIndex * lineHeight.normal));
                    });
                    yPosition += lines.length * lineHeight.normal + 2;
                });
                yPosition += 3;
            }
        }

        const filename = metadata.title.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase() + '.pdf';
        pdf.save(filename);
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
