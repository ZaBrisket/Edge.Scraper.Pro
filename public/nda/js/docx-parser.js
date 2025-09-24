// Parse .docx files and extract text content with tracked changes awareness
import mammoth from "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";

/**
 * Extract text from a .docx file with tracked changes handling
 * @param {File} file - The .docx file to parse
 * @returns {Promise<string>} - Extracted text content
 */
export async function extractTextFromDocx(file) {
  try {
    // Security: Validate file size to prevent memory exhaustion
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("File too large. Maximum size is 10MB.");
    }
    
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Extract text using mammoth with options
    const result = await mammoth.extractRawText({
      arrayBuffer: arrayBuffer,
      includeEditedText: false, // Exclude deleted text from tracked changes
      includeComments: true // Include comment text for context
    });
    
    if (result.messages && result.messages.length > 0) {
      console.warn("Docx extraction warnings:", result.messages);
    }
    
    // Post-process text to clean up extra whitespace
    let text = result.value || "";
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();
    
    return text;
    
  } catch (error) {
    console.error("Error extracting text from docx:", error);
    throw new Error(`Failed to extract text from Word document: ${error.message}`);
  }
}

/**
 * Parse .docx with structure preservation for better redlining
 * @param {File} file - The .docx file to parse
 * @returns {Promise<Object>} - Structured document data
 */
export async function parseDocxStructure(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Convert to HTML to preserve structure
    const result = await mammoth.convertToHtml({
      arrayBuffer: arrayBuffer,
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Normal'] => p:fresh",
        "r[style-name='Strong'] => strong",
        "r[style-name='Emphasis'] => em"
      ]
    });
    
    // Parse HTML to extract paragraphs with positions
    const parser = new DOMParser();
    const doc = parser.parseFromString(result.value, 'text/html');
    
    const paragraphs = [];
    let offset = 0;
    
    doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach((elem, idx) => {
      const text = elem.textContent.trim();
      if (text) {
        paragraphs.push({
          index: idx,
          type: elem.tagName.toLowerCase(),
          text: text,
          offset: offset,
          length: text.length
        });
        offset += text.length + 1; // +1 for newline
      }
    });
    
    return {
      html: result.value,
      text: paragraphs.map(p => p.text).join('\n'),
      paragraphs: paragraphs,
      messages: result.messages || []
    };
    
  } catch (error) {
    console.error("Error parsing docx structure:", error);
    throw new Error(`Failed to parse Word document structure: ${error.message}`);
  }
}

/**
 * Security sanitization for extracted content
 * @param {string} content - Raw extracted content
 * @returns {string} - Sanitized content
 */
export function sanitizeDocxContent(content) {
  // Remove potential XXE attack vectors
  content = content.replace(/<!ENTITY[^>]*>/gi, '');
  content = content.replace(/<!DOCTYPE[^>]*>/gi, '');
  
  // Remove script tags and event handlers
  content = content.replace(/<script[^>]*>.*?<\/script>/gi, '');
  content = content.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove external references
  content = content.replace(/xmlns[^=]*="[^"]*"/gi, '');
  content = content.replace(/xlink:href="[^"]*"/gi, '');
  
  return content;
}
