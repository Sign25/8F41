#!/usr/bin/env python3
"""
PDF Font and Encoding Analyzer
Checks if a PDF file contains Cyrillic text and which fonts are used
"""

import sys
import re
from pathlib import Path

def analyze_pdf_fonts(pdf_path):
    """Analyze fonts used in a PDF file"""
    print(f"\n🔍 Analyzing PDF: {pdf_path}")
    print("=" * 70)

    try:
        import PyPDF2

        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)

            print(f"\n📄 Basic Info:")
            print(f"   Pages: {len(reader.pages)}")

            # Try to extract metadata
            if reader.metadata:
                print(f"\n📋 Metadata:")
                for key, value in reader.metadata.items():
                    print(f"   {key}: {value}")

            # Extract text from all pages
            full_text = ""
            for i, page in enumerate(reader.pages):
                try:
                    text = page.extract_text()
                    full_text += text
                    if i == 0:
                        print(f"\n📝 Sample text from page 1 (first 500 chars):")
                        print(f"   {text[:500]}")
                except Exception as e:
                    print(f"   ⚠️  Could not extract text from page {i+1}: {e}")

            # Check for Cyrillic characters
            cyrillic_pattern = re.compile(r'[а-яА-ЯЁё]')
            cyrillic_matches = cyrillic_pattern.findall(full_text)

            print(f"\n🔤 Character Analysis:")
            print(f"   Total characters: {len(full_text)}")
            print(f"   Cyrillic characters found: {len(cyrillic_matches)}")

            if cyrillic_matches:
                print(f"   ✅ Cyrillic encoding appears to be working!")
                print(f"   Sample Cyrillic text: {''.join(cyrillic_matches[:50])}")
            else:
                print(f"   ❌ No Cyrillic characters found!")
                print(f"   This might indicate an encoding issue.")

            # Try to get font information
            print(f"\n🖋️  Font Analysis:")
            fonts_found = set()
            for page_num, page in enumerate(reader.pages):
                try:
                    if '/Resources' in page:
                        resources = page['/Resources']
                        if '/Font' in resources:
                            fonts = resources['/Font']
                            for font_name, font_obj in fonts.items():
                                font_data = font_obj.get_object()
                                base_font = font_data.get('/BaseFont', 'Unknown')
                                fonts_found.add(str(base_font))
                except Exception as e:
                    pass

            if fonts_found:
                print(f"   Fonts detected ({len(fonts_found)}):")
                for font in sorted(fonts_found):
                    # Check if it's our Roboto font
                    if 'Roboto' in font:
                        print(f"   ✅ {font} (Cyrillic-compatible)")
                    elif 'Helvetica' in font or 'Courier' in font:
                        print(f"   ⚠️  {font} (May not support Cyrillic)")
                    else:
                        print(f"   📝 {font}")
            else:
                print(f"   ℹ️  Could not extract font information")

            return True

    except ImportError:
        print("❌ PyPDF2 not installed. Install with: pip install PyPDF2")
        print("\n🔄 Trying alternative method with pdfplumber...")

        try:
            import pdfplumber

            with pdfplumber.open(pdf_path) as pdf:
                print(f"\n📄 Basic Info:")
                print(f"   Pages: {len(pdf.pages)}")

                # Extract text from first page
                first_page = pdf.pages[0]
                text = first_page.extract_text()

                print(f"\n📝 Sample text from page 1 (first 500 chars):")
                print(f"   {text[:500]}")

                # Check for Cyrillic
                cyrillic_pattern = re.compile(r'[а-яА-ЯЁё]')
                cyrillic_matches = cyrillic_pattern.findall(text)

                print(f"\n🔤 Character Analysis:")
                if cyrillic_matches:
                    print(f"   ✅ Cyrillic characters found: {len(cyrillic_matches)}")
                    print(f"   Sample: {''.join(cyrillic_matches[:50])}")
                else:
                    print(f"   ❌ No Cyrillic characters found!")

                return True

        except ImportError:
            print("❌ pdfplumber not installed either.")
            print("\nPlease install one of:")
            print("   pip install PyPDF2")
            print("   pip install pdfplumber")
            return False

    except Exception as e:
        print(f"❌ Error analyzing PDF: {e}")
        return False

def analyze_raw_pdf(pdf_path):
    """Analyze PDF by searching for font names in raw file"""
    print(f"\n🔍 Raw PDF Analysis (searching for font references):")
    print("=" * 70)

    try:
        with open(pdf_path, 'rb') as f:
            content = f.read()

        # Search for font names
        fonts = {
            'Roboto': b'Roboto',
            'Helvetica': b'Helvetica',
            'Arial': b'Arial',
            'Courier': b'Courier',
            'Times': b'Times'
        }

        print("\n🖋️  Font references found in PDF:")
        for font_name, font_bytes in fonts.items():
            count = content.count(font_bytes)
            if count > 0:
                if font_name == 'Roboto':
                    print(f"   ✅ {font_name}: {count} reference(s) (Good - supports Cyrillic)")
                elif font_name in ['Helvetica', 'Courier']:
                    print(f"   ⚠️  {font_name}: {count} reference(s) (Warning - may not support Cyrillic)")
                else:
                    print(f"   📝 {font_name}: {count} reference(s)")

        # Search for Cyrillic characters in raw PDF
        # Cyrillic Unicode range: U+0400 to U+04FF
        cyrillic_found = False
        for byte_val in range(0x0400, 0x0500):
            try:
                char = chr(byte_val).encode('utf-8')
                if char in content:
                    cyrillic_found = True
                    break
            except:
                pass

        if cyrillic_found:
            print(f"\n✅ Cyrillic character data found in PDF")
        else:
            print(f"\n⚠️  No obvious Cyrillic character data found (this is normal for embedded fonts)")

        return True

    except Exception as e:
        print(f"❌ Error in raw analysis: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_pdf.py <pdf_file>")
        print("\nThis script will:")
        print("  1. Extract text from the PDF")
        print("  2. Check for Cyrillic characters")
        print("  3. Identify fonts used")
        print("  4. Verify encoding correctness")
        sys.exit(1)

    pdf_file = Path(sys.argv[1])

    if not pdf_file.exists():
        print(f"❌ File not found: {pdf_file}")
        sys.exit(1)

    # Try structured analysis first
    success = analyze_pdf_fonts(pdf_file)

    # Also do raw analysis
    analyze_raw_pdf(pdf_file)

    print("\n" + "=" * 70)
    print("Analysis complete!")
