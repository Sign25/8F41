// Markdown Document Converter - Client-Side Application
// Полностью работает в браузере, без бэкенда

(function() {
    'use strict';

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

    // Initialize Markdown-it
    const md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
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
    });

    // Initialize Mermaid
    mermaid.initialize({ startOnLoad: false, theme: 'default' });

    // Initialize
    function init() {
        setupEventListeners();
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
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;

        const mermaidBlocks = tempDiv.querySelectorAll('code.language-mermaid');

        for (let i = 0; i < mermaidBlocks.length; i++) {
            const block = mermaidBlocks[i];
            const mermaidCode = block.textContent;

            try {
                const { svg } = await mermaid.render(`mermaid-${i}`, mermaidCode);
                const svgDiv = document.createElement('div');
                svgDiv.className = 'mermaid-diagram';
                svgDiv.innerHTML = svg;
                block.parentElement.replaceWith(svgDiv);
            } catch (error) {
                console.warn('Failed to render Mermaid diagram:', error);
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
        const style = document.getElementById('styleSelect').value;

        // Show progress
        optionsSection.style.display = 'none';
        previewSection.style.display = 'none';
        fileInfo.style.display = 'none';
        progressSection.style.display = 'block';

        try {
            if (format === 'pdf') {
                progressText.textContent = 'Генерация PDF...';
                await generatePDF(style);
            } else if (format === 'docx') {
                progressText.textContent = 'Генерация DOCX...';
                await generateDOCX(style);
            }

            // Success - reset after download
            setTimeout(reset, 2000);

        } catch (error) {
            console.error('Conversion error:', error);
            showError('Ошибка при генерации документа: ' + error.message);
        }
    }

    // Generate PDF using jsPDF and html2canvas
    async function generatePDF(style) {
        const { jsPDF } = window.jspdf;

        // Create styled container
        const container = document.createElement('div');
        container.style.width = '800px';
        container.style.padding = '40px';
        container.style.backgroundColor = 'white';
        container.style.fontFamily = 'Arial, sans-serif';
        container.innerHTML = `
            <h1 style="color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px;">
                ${metadata.title}
            </h1>
            ${metadata.author ? `<p style="color: #7f8c8d;">Автор: ${metadata.author}</p>` : ''}
            ${metadata.date ? `<p style="color: #7f8c8d;">Дата: ${metadata.date}</p>` : ''}
            <div style="margin-top: 30px;">
                ${parsedHtml}
            </div>
        `;

        // Apply style-specific CSS
        applyStyle(container, style);

        document.body.appendChild(container);

        try {
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 210; // A4 width in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= 297; // A4 height

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= 297;
            }

            const filename = metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';
            pdf.save(filename);

        } finally {
            document.body.removeChild(container);
        }
    }

    // Generate DOCX using docx library
    async function generateDOCX(style) {
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

    // Apply style to container
    function applyStyle(container, style) {
        if (style === 'professional') {
            container.style.fontFamily = 'Georgia, serif';
            container.querySelectorAll('h1, h2, h3').forEach(h => {
                h.style.color = '#2c3e50';
            });
        } else if (style === 'minimal') {
            container.style.fontFamily = 'Helvetica, Arial, sans-serif';
            container.style.color = '#000';
        }
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
        document.getElementById('styleSelect').value = 'default';
    }

    // Initialize application
    init();
})();
