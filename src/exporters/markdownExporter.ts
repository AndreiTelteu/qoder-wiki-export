import * as path from 'path';
import { 
  WikiDocument, 
  WikiCatalog, 
  ExportResult, 
  ExportError, 
  ExportErrorType, 
  MarkdownExportOptions,
  ProgressCallback,
  ProgressInfo
} from '../../types/qoder';
import { FileService } from '../services/fileService';

/**
 * MarkdownExporter handles the export of WikiDocument arrays to Markdown files.
 * Preserves original markdown content, creates directory structure, and handles cross-references.
 */
export class MarkdownExporter {
  private fileService: FileService;

  constructor(fileService?: FileService) {
    this.fileService = fileService || new FileService();
  }

  /**
   * Exports WikiDocument arrays to Markdown files with proper directory structure.
   * @param documents - Array of WikiDocument objects to export
   * @param destination - Base destination directory path
   * @param options - Export options for customizing output
   * @param progressCallback - Optional callback for progress updates
   * @returns Promise<ExportResult> - Result of the export operation
   */
  async export(
    documents: WikiDocument[],
    destination: string,
    options?: MarkdownExportOptions,
    progressCallback?: ProgressCallback
  ): Promise<ExportResult> {
    const exportOptions = this.getDefaultOptions(options);
    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

    try {
      // Ensure destination directory exists
      await this.fileService.createDirectory(destination);

      // Process each document
      for (let i = 0; i < documents.length; i++) {
        const document = documents[i];
        if (!document) continue;
        
        // Update progress
        if (progressCallback) {
          const progressInfo: ProgressInfo = {
            currentDocument: document.name,
            completed: i,
            total: documents.length,
            percentage: Math.round((i / documents.length) * 100)
          };
          progressCallback(progressInfo);
        }

        try {
          await this.exportSingleDocument(document, destination, exportOptions);
          exportedCount++;
        } catch (error) {
          failedCount++;
          if (error instanceof ExportError) {
            errors.push(error);
          } else {
            errors.push(new ExportError(
              ExportErrorType.CONVERSION_ERROR,
              `Failed to export document: ${document.name}`,
              document.id,
              error
            ));
          }
        }
      }

      // Create index file if requested
      if (exportOptions.createIndexFile && documents.length > 0) {
        try {
          await this.createIndexFile(documents, destination, exportOptions);
        } catch (error) {
          errors.push(new ExportError(
            ExportErrorType.FILE_SYSTEM_ERROR,
            'Failed to create index file',
            undefined,
            error
          ));
        }
      }

      // Final progress update
      if (progressCallback) {
        const finalProgress: ProgressInfo = {
          currentDocument: 'Export complete',
          completed: documents.length,
          total: documents.length,
          percentage: 100
        };
        progressCallback(finalProgress);
      }

      return {
        success: errors.length === 0,
        exportedCount,
        failedCount,
        errors,
        outputPath: destination
      };

    } catch (error) {
      // Handle catastrophic failures
      const exportError = error instanceof ExportError 
        ? error 
        : new ExportError(
            ExportErrorType.FILE_SYSTEM_ERROR,
            'Export operation failed',
            undefined,
            error
          );

      return {
        success: false,
        exportedCount,
        failedCount: documents.length - exportedCount,
        errors: [exportError, ...errors],
        outputPath: destination
      };
    }
  }

  /**
   * Exports WikiCatalog hierarchies to Markdown files with directory structure matching catalog hierarchy.
   * @param catalogs - Array of WikiCatalog objects with hierarchical structure
   * @param destination - Base destination directory path
   * @param options - Export options for customizing output
   * @param progressCallback - Optional callback for progress updates
   * @returns Promise<ExportResult> - Result of the export operation
   */
  async exportCatalogs(
    catalogs: WikiCatalog[],
    destination: string,
    options?: MarkdownExportOptions,
    progressCallback?: ProgressCallback
  ): Promise<ExportResult> {
    const exportOptions = this.getDefaultOptions(options);
    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

    try {
      // Ensure destination directory exists
      await this.fileService.createDirectory(destination);

      // Flatten catalog hierarchy to get all documents with their paths
      const catalogItems = this.flattenCatalogHierarchy(catalogs);
      const totalItems = catalogItems.length;

      // Process each catalog item
      for (let i = 0; i < catalogItems.length; i++) {
        const item = catalogItems[i];
        if (!item) continue;
        
        // Update progress
        if (progressCallback) {
          const progressInfo: ProgressInfo = {
            currentDocument: item.name,
            completed: i,
            total: totalItems,
            percentage: Math.round((i / totalItems) * 100)
          };
          progressCallback(progressInfo);
        }

        try {
          await this.exportCatalogItem(item, destination, exportOptions);
          exportedCount++;
        } catch (error) {
          failedCount++;
          if (error instanceof ExportError) {
            errors.push(error);
          } else {
            errors.push(new ExportError(
              ExportErrorType.CONVERSION_ERROR,
              `Failed to export catalog item: ${item.name}`,
              item.id,
              error
            ));
          }
        }
      }

      // Create hierarchical index file if requested
      if (exportOptions.createIndexFile && catalogItems.length > 0) {
        try {
          await this.createHierarchicalIndexFile(catalogs, destination, exportOptions);
        } catch (error) {
          errors.push(new ExportError(
            ExportErrorType.FILE_SYSTEM_ERROR,
            'Failed to create hierarchical index file',
            undefined,
            error
          ));
        }
      }

      // Final progress update
      if (progressCallback) {
        const finalProgress: ProgressInfo = {
          currentDocument: 'Export complete',
          completed: totalItems,
          total: totalItems,
          percentage: 100
        };
        progressCallback(finalProgress);
      }

      return {
        success: errors.length === 0,
        exportedCount,
        failedCount,
        errors,
        outputPath: destination
      };

    } catch (error) {
      // Handle catastrophic failures
      const exportError = error instanceof ExportError 
        ? error 
        : new ExportError(
            ExportErrorType.FILE_SYSTEM_ERROR,
            'Catalog export operation failed',
            undefined,
            error
          );

      const totalItems = this.flattenCatalogHierarchy(catalogs).length;
      return {
        success: false,
        exportedCount,
        failedCount: totalItems - exportedCount,
        errors: [exportError, ...errors],
        outputPath: destination
      };
    }
  }
  /**
 
  * Flattens catalog hierarchy to get all items with their relative paths.
   * @param catalogs - Array of WikiCatalog objects
   * @param basePath - Base path for recursion (default: empty)
   * @returns Array of catalog items with path information
   */
  private flattenCatalogHierarchy(
    catalogs: WikiCatalog[], 
    basePath: string = ''
  ): Array<WikiCatalog & { relativePath: string }> {
    const items: Array<WikiCatalog & { relativePath: string }> = [];

    for (const catalog of catalogs) {
      const currentPath = basePath ? path.join(basePath, catalog.name) : catalog.name;
      
      // Add current catalog item
      items.push({
        ...catalog,
        relativePath: currentPath
      });

      // Recursively process sub-catalogs
      if (catalog.subCatalog && catalog.subCatalog.length > 0) {
        const subItems = this.flattenCatalogHierarchy(catalog.subCatalog, currentPath);
        items.push(...subItems);
      }
    }

    return items;
  }

  /**
   * Exports a single catalog item with proper directory structure.
   * @param item - Catalog item with path information
   * @param destination - Base destination directory
   * @param options - Export options
   */
  private async exportCatalogItem(
    item: WikiCatalog & { relativePath: string },
    destination: string,
    options: MarkdownExportOptions
  ): Promise<void> {
    // Only export completed documents
    if (item.status !== 'completed') {
      return;
    }

    // Create directory structure if preserveHierarchy is enabled
    let targetPath = destination;
    if (options.preserveHierarchy) {
      const dirPath = path.dirname(item.relativePath);
      if (dirPath && dirPath !== '.') {
        targetPath = path.join(destination, dirPath);
        await this.fileService.createDirectory(targetPath);
      }
    }

    // Generate filename and full path
    const filename = this.generateFilename(item.name);
    const filePath = path.join(targetPath, filename);

    // For now, create a placeholder document since we don't have the actual content
    // In a real implementation, this would fetch the content using QoderApiService
    const placeholderContent = this.createPlaceholderContent(item);

    // Write the file
    await this.fileService.writeFile(filePath, placeholderContent);
  }

  /**
   * Creates placeholder content for catalog items when actual content is not available.
   * @param item - Catalog item
   * @returns Placeholder markdown content
   */
  private createPlaceholderContent(item: WikiCatalog & { relativePath: string }): string {
    let content = `# ${item.name}\n\n`;
    content += `**Status:** ${item.status}\n`;
    content += `**Path:** ${item.relativePath}\n\n`;
    content += `This document was exported from Qoder wiki catalog.\n\n`;
    
    if (item.subCatalog && item.subCatalog.length > 0) {
      content += `## Sub-documents\n\n`;
      item.subCatalog.forEach(subItem => {
        const subFilename = this.generateFilename(subItem.name);
        content += `- [${subItem.name}](./${subFilename})\n`;
      });
      content += '\n';
    }

    content += `*Generated on ${new Date().toISOString()}*\n`;
    
    return content;
  }

  /**
   * Creates a hierarchical index file that reflects the catalog structure.
   * @param catalogs - Original catalog hierarchy
   * @param destination - Destination directory
   * @param options - Export options
   */
  private async createHierarchicalIndexFile(
    catalogs: WikiCatalog[],
    destination: string,
    options: MarkdownExportOptions
  ): Promise<void> {
    let indexContent = '# Wiki Documentation Index\n\n';
    indexContent += 'This index provides hierarchical navigation to all exported wiki documents.\n\n';
    
    indexContent += this.generateHierarchicalTOC(catalogs, 0);
    
    indexContent += '\n---\n\n';
    indexContent += `*Generated on ${new Date().toISOString()}*\n`;
    
    const totalDocs = this.countTotalDocuments(catalogs);
    indexContent += `*Total documents: ${totalDocs}*\n`;

    const indexPath = path.join(destination, 'index.md');
    await this.fileService.writeFile(indexPath, indexContent);
  }

  /**
   * Generates hierarchical table of contents for catalog structure.
   * @param catalogs - Catalog hierarchy
   * @param level - Current nesting level
   * @returns Markdown TOC string
   */
  private generateHierarchicalTOC(catalogs: WikiCatalog[], level: number): string {
    let toc = '';
    const indent = '  '.repeat(level);

    for (const catalog of catalogs) {
      if (catalog.status === 'completed') {
        const filename = this.generateFilename(catalog.name);
        const relativePath = this.fileService.normalizePath(filename);
        toc += `${indent}- [${catalog.name}](./${relativePath})\n`;
      } else {
        toc += `${indent}- ${catalog.name} *(${catalog.status})*\n`;
      }

      if (catalog.subCatalog && catalog.subCatalog.length > 0) {
        toc += this.generateHierarchicalTOC(catalog.subCatalog, level + 1);
      }
    }

    return toc;
  }

  /**
   * Counts total number of documents in catalog hierarchy.
   * @param catalogs - Catalog hierarchy
   * @returns Total document count
   */
  private countTotalDocuments(catalogs: WikiCatalog[]): number {
    let count = 0;
    
    for (const catalog of catalogs) {
      if (catalog.status === 'completed') {
        count++;
      }
      
      if (catalog.subCatalog && catalog.subCatalog.length > 0) {
        count += this.countTotalDocuments(catalog.subCatalog);
      }
    }
    
    return count;
  }

  /**
   * Exports a single WikiDocument to a Markdown file.
   * @param document - The WikiDocument to export
   * @param destination - Base destination directory
   * @param options - Export options
   */
  private async exportSingleDocument(
    document: WikiDocument,
    destination: string,
    options: MarkdownExportOptions
  ): Promise<void> {
    // Generate filename from document name
    const filename = this.generateFilename(document.name);
    const filePath = path.join(destination, filename);

    // Process markdown content
    let processedContent = this.processMarkdownContent(document.content, options);

    // Add document metadata if needed
    if (options.includeTableOfContents) {
      processedContent = this.addTableOfContents(processedContent, document.name);
    }

    // Write the file
    await this.fileService.writeFile(filePath, processedContent);
  }

  /**
   * Processes markdown content to handle cross-references and file links.
   * @param content - Original markdown content
   * @param options - Export options
   * @returns Processed markdown content
   */
  private processMarkdownContent(content: string, options: MarkdownExportOptions): string {
    let processedContent = content;

    // Handle cross-references and internal links
    processedContent = this.processInternalLinks(processedContent);

    // Handle file links and attachments
    processedContent = this.processFileLinks(processedContent);

    // Preserve original formatting
    processedContent = this.preserveMarkdownFormatting(processedContent);

    return processedContent;
  }

  /**
   * Processes internal links and cross-references in markdown content.
   * @param content - Markdown content to process
   * @returns Content with processed internal links
   */
  private processInternalLinks(content: string): string {
    // Handle wiki-style links [[Document Name]]
    content = content.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
      const filename = this.generateFilename(linkText);
      return `[${linkText}](./${filename})`;
    });

    // Handle Qoder-specific internal references
    content = content.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (match, linkText, anchor) => {
      // Convert internal anchors to proper markdown links
      return `[${linkText}](#${anchor.toLowerCase().replace(/\s+/g, '-')})`;
    });

    return content;
  }

  /**
   * Processes file links and attachments in markdown content.
   * @param content - Markdown content to process
   * @returns Content with processed file links
   */
  private processFileLinks(content: string): string {
    // Handle relative file paths
    content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altText, imagePath) => {
      // Keep relative paths as-is, but ensure they're properly formatted
      if (imagePath.startsWith('http') || imagePath.startsWith('https')) {
        return match; // Keep external links unchanged
      }
      
      // Normalize local file paths
      const normalizedPath = this.fileService.normalizePath(imagePath);
      return `![${altText}](${normalizedPath})`;
    });

    // Handle regular links
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
      if (linkPath.startsWith('http') || linkPath.startsWith('https') || linkPath.startsWith('#')) {
        return match; // Keep external links and anchors unchanged
      }
      
      // Normalize local file paths
      const normalizedPath = this.fileService.normalizePath(linkPath);
      return `[${linkText}](${normalizedPath})`;
    });

    return content;
  }

  /**
   * Preserves original markdown formatting and ensures proper structure.
   * @param content - Markdown content to preserve
   * @returns Content with preserved formatting
   */
  private preserveMarkdownFormatting(content: string): string {
    // Ensure proper line endings
    let formatted = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Ensure code blocks are properly formatted
    formatted = this.preserveCodeBlocks(formatted);

    // Ensure tables are properly formatted
    formatted = this.preserveTables(formatted);

    // Ensure lists are properly formatted
    formatted = this.preserveLists(formatted);

    return formatted;
  }

  /**
   * Preserves code block formatting.
   * @param content - Content to process
   * @returns Content with preserved code blocks
   */
  private preserveCodeBlocks(content: string): string {
    // Ensure fenced code blocks have proper spacing
    return content.replace(/(```[\s\S]*?```)/g, (match) => {
      return `\n${match}\n`;
    });
  }

  /**
   * Preserves table formatting.
   * @param content - Content to process
   * @returns Content with preserved tables
   */
  private preserveTables(content: string): string {
    // Ensure tables have proper spacing
    return content.replace(/(\|.*\|.*\n)/g, (match) => {
      return match;
    });
  }

  /**
   * Preserves list formatting.
   * @param content - Content to process
   * @returns Content with preserved lists
   */
  private preserveLists(content: string): string {
    // Ensure proper spacing around lists
    return content.replace(/^(\s*[-*+]\s+.+)$/gm, (match) => {
      return match;
    });
  }

  /**
   * Adds a table of contents to the document.
   * @param content - Document content
   * @param documentName - Name of the document
   * @returns Content with table of contents
   */
  private addTableOfContents(content: string, documentName: string): string {
    const headers = this.extractHeaders(content);
    
    if (headers.length === 0) {
      return content;
    }

    let toc = `# ${documentName}\n\n## Table of Contents\n\n`;
    
    headers.forEach(header => {
      const indent = '  '.repeat(header.level - 1);
      const anchor = header.text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      toc += `${indent}- [${header.text}](#${anchor})\n`;
    });

    toc += '\n---\n\n';
    
    return toc + content;
  }

  /**
   * Extracts headers from markdown content.
   * @param content - Markdown content
   * @returns Array of header objects
   */
  private extractHeaders(content: string): Array<{ level: number; text: string }> {
    const headers: Array<{ level: number; text: string }> = [];
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;

    while ((match = headerRegex.exec(content)) !== null) {
      if (match[1] && match[2]) {
        headers.push({
          level: match[1].length,
          text: match[2].trim()
        });
      }
    }

    return headers;
  }

  /**
   * Creates an index file with navigation links to all exported documents.
   * @param documents - Array of exported documents
   * @param destination - Destination directory
   * @param options - Export options
   */
  private async createIndexFile(
    documents: WikiDocument[],
    destination: string,
    options: MarkdownExportOptions
  ): Promise<void> {
    let indexContent = '# Wiki Documentation Index\n\n';
    indexContent += 'This index provides navigation links to all exported wiki documents.\n\n';
    indexContent += '## Documents\n\n';

    // Sort documents by name for better organization
    const sortedDocuments = [...documents].sort((a, b) => a.name.localeCompare(b.name));

    sortedDocuments.forEach(document => {
      const filename = this.generateFilename(document.name);
      const relativePath = this.fileService.normalizePath(filename);
      indexContent += `- [${document.name}](./${relativePath})\n`;
    });

    indexContent += '\n---\n\n';
    indexContent += `*Generated on ${new Date().toISOString()}*\n`;
    indexContent += `*Total documents: ${documents.length}*\n`;

    const indexPath = path.join(destination, 'index.md');
    await this.fileService.writeFile(indexPath, indexContent);
  }

  /**
   * Generates a safe filename from a document name.
   * @param documentName - Original document name
   * @returns Safe filename with .md extension
   */
  private generateFilename(documentName: string): string {
    const sanitized = this.fileService.sanitizeFilename(documentName);
    
    // Ensure .md extension
    if (!sanitized.toLowerCase().endsWith('.md')) {
      return `${sanitized}.md`;
    }
    
    return sanitized;
  }

  /**
   * Gets default export options merged with provided options.
   * @param options - Provided options (optional)
   * @returns Complete options object with defaults
   */
  private getDefaultOptions(options?: MarkdownExportOptions): MarkdownExportOptions {
    return {
      preserveHierarchy: true,
      includeTableOfContents: false,
      createIndexFile: true,
      ...options
    };
  }
}