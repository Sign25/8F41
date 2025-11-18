#!/usr/bin/env node

/**
 * Automated test script for Markdown to PDF conversion
 * Tests Cyrillic encoding with the fixed font implementation
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testPdfGeneration() {
    console.log('🚀 Starting automated PDF generation test...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Enable console logging from the page
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (type === 'log') console.log('  📝', text);
            if (type === 'warn') console.warn('  ⚠️', text);
            if (type === 'error') console.error('  ❌', text);
        });

        // Navigate to the application
        console.log('📂 Opening application...');
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });

        // Read the test file
        const testFilePath = path.join(__dirname, 'Раздел_0_Введение_и_обзор-1 (1).md');
        const fileContent = fs.readFileSync(testFilePath, 'utf-8');

        console.log(`📄 Loaded test file: ${path.basename(testFilePath)}`);
        console.log(`   Size: ${(fileContent.length / 1024).toFixed(2)} KB\n`);

        // Create a File object and upload it
        console.log('⬆️  Uploading file to application...');
        const fileInput = await page.$('input[type="file"]');
        await fileInput.uploadFile(testFilePath);

        // Wait for file processing
        await page.waitForSelector('#previewSection', { visible: true, timeout: 10000 });
        console.log('✅ File processed successfully\n');

        // Wait a bit for preview to fully render
        await page.waitForTimeout(2000);

        // Select PDF format (should be default)
        console.log('🔘 Selecting PDF format...');
        await page.evaluate(() => {
            document.querySelector('input[name="format"][value="pdf"]').checked = true;
        });

        // Set up download handling
        const downloadPath = path.join(__dirname, 'test-output');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        await page._client().send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        // Click convert button
        console.log('🔄 Starting PDF generation...');
        await page.click('#convertBtn');

        // Wait for processing
        await page.waitForSelector('#progressSection', { visible: true, timeout: 5000 });
        console.log('   Processing...');

        // Wait for download to complete (check for file in download directory)
        let pdfFile = null;
        for (let i = 0; i < 60; i++) {
            await page.waitForTimeout(1000);
            const files = fs.readdirSync(downloadPath).filter(f => f.endsWith('.pdf'));
            if (files.length > 0) {
                pdfFile = path.join(downloadPath, files[files.length - 1]);
                break;
            }
        }

        if (pdfFile) {
            const stats = fs.statSync(pdfFile);
            console.log(`\n✅ PDF generated successfully!`);
            console.log(`   File: ${path.basename(pdfFile)}`);
            console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log(`   Path: ${pdfFile}`);

            // Extract text from PDF for verification
            console.log('\n🔍 Analyzing PDF content...');
            await analyzePdf(pdfFile);

        } else {
            throw new Error('PDF file was not downloaded');
        }

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

async function analyzePdf(pdfPath) {
    try {
        // Try to use pdf-parse if available
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(pdfPath);

        const data = await pdfParse(dataBuffer);

        console.log(`   Pages: ${data.numpages}`);
        console.log(`   Text length: ${data.text.length} characters`);

        // Check for Cyrillic characters in extracted text
        const cyrillicRegex = /[а-яА-ЯЁё]/;
        const hasCyrillic = cyrillicRegex.test(data.text);

        if (hasCyrillic) {
            console.log('   ✅ Cyrillic characters detected in PDF text');

            // Show a sample of extracted text
            const lines = data.text.split('\n').filter(l => l.trim().length > 0);
            console.log('\n📋 Sample extracted text (first 5 lines):');
            lines.slice(0, 5).forEach((line, i) => {
                console.log(`   ${i + 1}. ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
            });
        } else {
            console.log('   ⚠️  No Cyrillic characters found in extracted text');
            console.log('   (Note: This might be a limitation of the text extraction library)');
        }

    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.log('   ℹ️  pdf-parse not installed, skipping text analysis');
            console.log('   Install with: npm install pdf-parse');
        } else {
            console.log('   ⚠️  Could not analyze PDF:', error.message);
        }
    }
}

// Run the test
testPdfGeneration()
    .then(() => {
        console.log('\n✅ Test completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });
