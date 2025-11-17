// Markdown Document Converter - Frontend Application
(function() {
    'use strict';

    // DOM Elements
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const removeFileBtn = document.getElementById('removeFile');
    const optionsSection = document.getElementById('optionsSection');
    const convertBtn = document.getElementById('convertBtn');
    const progressSection = document.getElementById('progressSection');
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    const resultsSection = document.getElementById('resultsSection');
    const stats = document.getElementById('stats');
    const downloadLinks = document.getElementById('downloadLinks');
    const newConversionBtn = document.getElementById('newConversionBtn');
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');

    // State
    let selectedFile = null;

    // Initialize
    function init() {
        setupEventListeners();
    }

    // Event Listeners
    function setupEventListeners() {
        // File input change
        fileInput.addEventListener('change', handleFileSelect);

        // Drag and drop
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);

        // Remove file
        removeFileBtn.addEventListener('click', removeFile);

        // Convert button
        convertBtn.addEventListener('click', convertFile);

        // New conversion
        newConversionBtn.addEventListener('click', reset);
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
    function processFile(file) {
        // Validate file type
        const validExtensions = ['md', 'markdown', 'txt'];
        const extension = file.name.split('.').pop().toLowerCase();

        if (!validExtensions.includes(extension)) {
            showError('Неподдерживаемый формат файла. Используйте .md, .markdown или .txt');
            return;
        }

        // Validate file size (16MB max)
        if (file.size > 16 * 1024 * 1024) {
            showError('Файл слишком большой. Максимальный размер: 16MB');
            return;
        }

        selectedFile = file;
        displayFileInfo(file);
    }

    // Display file information
    function displayFileInfo(file) {
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);

        // Show file info and options
        fileInfo.style.display = 'block';
        optionsSection.style.display = 'block';

        // Hide upload area
        uploadArea.style.display = 'none';
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

    // Convert file
    async function convertFile() {
        if (!selectedFile) {
            showError('Файл не выбран');
            return;
        }

        // Get selected options
        const format = document.querySelector('input[name="format"]:checked').value;
        const style = document.getElementById('styleSelect').value;
        const asciiMode = document.getElementById('asciiModeSelect').value;

        // Hide options and show progress
        optionsSection.style.display = 'none';
        fileInfo.style.display = 'none';
        progressSection.style.display = 'block';

        // Prepare form data
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('format', format);
        formData.append('style', style);
        formData.append('ascii_mode', asciiMode);

        // Simulate progress
        simulateProgress();

        try {
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка при конвертации');
            }

            const result = await response.json();

            if (result.success) {
                showResults(result);
            } else {
                throw new Error(result.error || 'Неизвестная ошибка');
            }

        } catch (error) {
            console.error('Conversion error:', error);
            showError(error.message);
        }
    }

    // Simulate progress
    function simulateProgress() {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) {
                progress = 90;
                clearInterval(interval);
            }
            progressFill.style.width = progress + '%';
        }, 300);
    }

    // Show results
    function showResults(result) {
        progressSection.style.display = 'none';
        resultsSection.style.display = 'block';

        // Display stats
        const statsData = result.stats;
        stats.innerHTML = `
            <p><strong>Название:</strong> <span>${statsData.title}</span></p>
            <p><strong>Блоков кода:</strong> <span>${statsData.code_blocks}</span></p>
            <p><strong>Диаграмм:</strong> <span>${statsData.diagrams}</span></p>
            <p><strong>ASCII-арт:</strong> <span>${statsData.ascii_art}</span></p>
        `;

        // Display download links
        downloadLinks.innerHTML = '';
        result.files.forEach(file => {
            const icon = file.type === 'pdf' ? '📄' : '📝';
            const link = document.createElement('a');
            link.href = file.url;
            link.className = 'download-btn';
            link.innerHTML = `
                <span>${icon}</span>
                <span>Скачать ${file.type.toUpperCase()}</span>
                <span>(${file.filename})</span>
            `;
            downloadLinks.appendChild(link);
        });
    }

    // Show error
    function showError(message) {
        optionsSection.style.display = 'none';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        errorSection.style.display = 'block';
        errorMessage.textContent = message;
    }

    // Reset to initial state
    function reset() {
        selectedFile = null;
        fileInput.value = '';

        // Hide all sections
        fileInfo.style.display = 'none';
        optionsSection.style.display = 'none';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        errorSection.style.display = 'none';

        // Show upload area
        uploadArea.style.display = 'block';

        // Reset progress
        progressFill.style.width = '0%';

        // Reset form
        document.querySelector('input[name="format"][value="pdf"]').checked = true;
        document.getElementById('styleSelect').value = 'default';
        document.getElementById('asciiModeSelect').value = 'optimize';
    }

    // Initialize application
    init();
})();
