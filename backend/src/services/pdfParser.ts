import pdf from 'pdf-parse';
import { ResumeChunk } from '../types';

export class PDFParser {
  async extractText(buffer: Buffer, filename?: string): Promise<string> {
    // Check if it's a text file
    if (filename && filename.toLowerCase().endsWith('.txt')) {
      return buffer.toString('utf-8');
    }
    
    // Try to parse as PDF
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch (error) {
      // If PDF parsing fails, try as plain text
      return buffer.toString('utf-8');
    }
  }

  chunkText(text: string, type: 'resume' | 'jobDescription'): ResumeChunk[] {
    const chunks: ResumeChunk[] = [];
    
    if (type === 'resume') {
      // Split by common resume sections
      const sections = this.splitBySections(text);
      sections.forEach((section, index) => {
        if (section.text.trim().length > 50) {
          chunks.push({
            text: section.text,
            section: section.name,
            index
          });
        }
      });
    } else {
      // For job descriptions, chunk by paragraphs
      const paragraphs = text.split(/\n\n+/);
      paragraphs.forEach((para, index) => {
        if (para.trim().length > 50) {
          chunks.push({
            text: para.trim(),
            section: 'requirement',
            index
          });
        }
      });
    }

    return chunks;
  }

  private splitBySections(text: string): Array<{ name: string; text: string }> {
    const sectionHeaders = [
      'summary', 'objective', 'profile',
      'experience', 'work experience', 'employment',
      'education', 'academic',
      'skills', 'technical skills', 'competencies',
      'projects', 'certifications', 'awards'
    ];

    const sections: Array<{ name: string; text: string }> = [];
    const lines = text.split('\n');
    let currentSection = 'general';
    let currentText: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim();
      const matchedHeader = sectionHeaders.find(header => 
        lowerLine === header || lowerLine.startsWith(header + ':')
      );

      if (matchedHeader) {
        if (currentText.length > 0) {
          sections.push({
            name: currentSection,
            text: currentText.join('\n')
          });
        }
        currentSection = matchedHeader;
        currentText = [];
      } else {
        currentText.push(line);
      }
    }

    if (currentText.length > 0) {
      sections.push({
        name: currentSection,
        text: currentText.join('\n')
      });
    }

    return sections;
  }
}
