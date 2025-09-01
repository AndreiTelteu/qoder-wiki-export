import * as path from 'path';
import { 
  WikiDocument, 
  WikiCatalog, 
  ExportResult, 
  ExportError, 
  ExportErrorType, 
  MarkdownExportOptions,
  ExportStructureType,
  ProgressCallback,
  ProgressInfo
} from '../../types/qoder';
import { FileService } from '../services/fileService';
import { QoderApiServiceImpl } from '../services/qoderApiService';

/**
 * MarkdownExporter handles the export of WikiDocument arrays to Markdown files.
 * Preserves original markdown content, creates directory structure, and handles cross-references.
 */
export class MarkdownExporter {
  private fileService: FileService;
  private qoderApiService: QoderApiServiceImpl | undefined;

  constructor(fileService?: FileService, qoderApiService?: QoderApiServiceImpl) {
    this.fileService = fileService || new FileService();
    this.qoderApiService = qoderApiService;
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

      // Use the new export structure logic
      if (exportOptions.exportStructure === ExportStructureType.FLAT) {
        return await this.exportDocumentsFlatStructure(documents, destination, exportOptions, progressCallback);
      } else {
        return await this.exportDocumentsTreeStructure(documents, destination, exportOptions, progressCallback);
      }

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
   * Exports WikiDocument arrays using flat structure (all files in root with numbered names)
   * @param documents - Array of WikiDocument objects with content
   * @param destination - Destination directory
   * @param options - Export options
   * @param progressCallback - Progress callback
   * @returns Export result
   */
  private async exportDocumentsFlatStructure(
    documents: WikiDocument[],
    destination: string,
    options: MarkdownExportOptions,
    progressCallback?: ProgressCallback
  ): Promise<ExportResult> {
    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

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
        // Simple numbering: index + 1
        const documentNumber = i + 1;
        const cleanName = this.cleanDocumentName(document.name);
        const filename = `${documentNumber}. ${cleanName}.md`;
        const filePath = path.join(destination, filename);
        
        // Process the actual document content
        let content = this.processMarkdownContent(document.content, options);
        
        // Add title to content if needed
        if (!content.startsWith('#')) {
          content = `# ${documentNumber}. ${cleanName}\n\n${content}`;
        }
        
        await this.fileService.writeFile(filePath, content);
        exportedCount++;
      } catch (error) {
        failedCount++;
        errors.push(new ExportError(
          ExportErrorType.CONVERSION_ERROR,
          `Failed to export ${document.name}`,
          document.id,
          error
        ));
      }
    }

    // Create index file if requested
    if (options.createIndexFile && documents.length > 0) {
      try {
        await this.createIndexFileForDocuments(documents, destination, options);
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
  }

  /**
   * Exports WikiDocument arrays using tree structure (organized folders)
   * @param documents - Array of WikiDocument objects with content
   * @param destination - Destination directory
   * @param options - Export options
   * @param progressCallback - Progress callback
   * @returns Export result
   */
  private async exportDocumentsTreeStructure(
    documents: WikiDocument[],
    destination: string,
    options: MarkdownExportOptions,
    progressCallback?: ProgressCallback
  ): Promise<ExportResult> {
    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

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
        // Simple numbering: index + 1
        const documentNumber = i + 1;
        const cleanName = this.cleanDocumentName(document.name);
        const folderName = `${documentNumber}. ${cleanName}`;
        const folderPath = path.join(destination, folderName);
        
        // Create folder
        await this.fileService.createDirectory(folderPath);
        
        // Create README.md with the document content
        const readmePath = path.join(folderPath, 'README.md');
        let content = this.processMarkdownContent(document.content, options);
        
        // Add title to content if needed
        if (!content.startsWith('#')) {
          content = `# ${documentNumber}. ${cleanName}\n\n${content}`;
        }
        
        await this.fileService.writeFile(readmePath, content);
        exportedCount++;
      } catch (error) {
        failedCount++;
        errors.push(new ExportError(
          ExportErrorType.CONVERSION_ERROR,
          `Failed to export ${document.name}`,
          document.id,
          error
        ));
      }
    }

    // Create index file if requested
    if (options.createIndexFile && documents.length > 0) {
      try {
        await this.createIndexFileForDocuments(documents, destination, options);
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
  }

  /**
   * Creates an index file for exported documents
   */
  private async createIndexFileForDocuments(
    documents: WikiDocument[],
    destination: string,
    options: MarkdownExportOptions
  ): Promise<void> {
    let indexContent = '# Exported Documentation\n\n';
    indexContent += 'This index provides navigation links to all exported documents.\n\n';
    indexContent += '## Documents\n\n';

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      if (!document) continue;
      
      const documentNumber = i + 1;
      const cleanName = this.cleanDocumentName(document.name);
      
      if (options.exportStructure === ExportStructureType.FLAT) {
        const filename = `${documentNumber}. ${cleanName}.md`;
        indexContent += `- [${documentNumber}. ${cleanName}](./${filename})\n`;
      } else {
        const folderName = `${documentNumber}. ${cleanName}`;
        indexContent += `- [${documentNumber}. ${cleanName}](./${folderName}/README.md)\n`;
      }
    }

    indexContent += '\n---\n\n';
    indexContent += `*Generated on ${new Date().toISOString()}*\n`;
    indexContent += `*Total documents: ${documents.length}*\n`;

    const indexPath = path.join(destination, 'index.md');
    await this.fileService.writeFile(indexPath, indexContent);
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

      // Assign numbers to all documents for consistent naming
      const numberMap = this.assignDocumentNumbers(catalogs);

      if (exportOptions.exportStructure === ExportStructureType.FLAT) {
        // Flat structure: all files in root with numbered names
        return await this.exportFlatStructure(catalogs, destination, exportOptions, progressCallback, numberMap);
      } else {
        // Tree structure: folders with README files
        return await this.exportTreeStructure(catalogs, destination, exportOptions, progressCallback, numberMap);
      }

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
   * Exports catalogs using flat structure (all files in root with numbered names)
   * @param catalogs - Array of wiki catalogs
   * @param destination - Destination directory
   * @param options - Export options
   * @param progressCallback - Progress callback
   * @param numberMap - Map of document IDs to numbering info
   * @returns Export result
   */
  private async exportFlatStructure(
    catalogs: WikiCatalog[],
    destination: string,
    options: MarkdownExportOptions,
    progressCallback?: ProgressCallback,
    numberMap?: Map<string, { number: string, cleanName: string }>
  ): Promise<ExportResult> {
    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

    // Flatten all catalogs to a simple list
    const allCatalogs = this.flattenCatalogHierarchy(catalogs);
    const completedCatalogs = allCatalogs.filter(c => c.status === 'completed');

    for (let i = 0; i < completedCatalogs.length; i++) {
      const catalog = completedCatalogs[i];
      if (!catalog) continue;
      
      // Update progress
      if (progressCallback) {
        const progressInfo: ProgressInfo = {
          currentDocument: catalog.name,
          completed: i,
          total: completedCatalogs.length,
          percentage: Math.round((i / completedCatalogs.length) * 100)
        };
        progressCallback(progressInfo);
      }

      try {
        // Get numbering info
        const numberInfo = numberMap?.get(catalog.id);
        const filename = numberInfo 
          ? `${numberInfo.number}. ${numberInfo.cleanName}.md`
          : this.generateFilename(catalog.name);
        
        const filePath = path.join(destination, filename);
        
        // Create content from API or placeholder
        const content = await this.createContentFlat(catalog, numberInfo);
        
        await this.fileService.writeFile(filePath, content);
        exportedCount++;
      } catch (error) {
        failedCount++;
        errors.push(new ExportError(
          ExportErrorType.CONVERSION_ERROR,
          `Failed to export ${catalog.name}`,
          catalog.id,
          error
        ));
      }
    }

    // Final progress update
    if (progressCallback) {
      const finalProgress: ProgressInfo = {
        currentDocument: 'Export complete',
        completed: completedCatalogs.length,
        total: completedCatalogs.length,
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
  }

  /**
   * Exports catalogs using tree structure (folders with README files)
   * @param catalogs - Array of wiki catalogs
   * @param destination - Destination directory
   * @param options - Export options
   * @param progressCallback - Progress callback
   * @param numberMap - Map of document IDs to numbering info
   * @returns Export result
   */
  private async exportTreeStructure(
    catalogs: WikiCatalog[],
    destination: string,
    options: MarkdownExportOptions,
    progressCallback?: ProgressCallback,
    numberMap?: Map<string, { number: string, cleanName: string }>
  ): Promise<ExportResult> {
    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

    // Process hierarchically
    const processLevel = async (items: WikiCatalog[], basePath: string, currentProgress: { completed: number, total: number }) => {
      for (const catalog of items) {
        if (catalog.status !== 'completed') {
          continue;
        }

        // Update progress
        if (progressCallback) {
          const progressInfo: ProgressInfo = {
            currentDocument: catalog.name,
            completed: currentProgress.completed,
            total: currentProgress.total,
            percentage: Math.round((currentProgress.completed / currentProgress.total) * 100)
          };
          progressCallback(progressInfo);
        }

        try {
          const numberInfo = numberMap?.get(catalog.id);
          const folderName = numberInfo 
            ? `${numberInfo.number}. ${numberInfo.cleanName}`
            : this.cleanDocumentName(catalog.name);
          
          const folderPath = path.join(basePath, folderName);
          
          if (catalog.subCatalog && catalog.subCatalog.length > 0) {
            // Create folder and README.md
            await this.fileService.createDirectory(folderPath);
            
            const readmePath = path.join(folderPath, 'README.md');
            const readmeContent = await this.createReadmeContent(catalog, numberInfo);
            await this.fileService.writeFile(readmePath, readmeContent);
            
            // Process sub-catalogs
            await processLevel(catalog.subCatalog, folderPath, currentProgress);
          } else {
            // Leaf document - create as .md file directly
            const filename = `${folderName}.md`;
            const filePath = path.join(basePath, filename);
            const content = await this.createContentTree(catalog, numberInfo);
            await this.fileService.writeFile(filePath, content);
          }
          
          exportedCount++;
          currentProgress.completed++;
        } catch (error) {
          failedCount++;
          currentProgress.completed++;
          errors.push(new ExportError(
            ExportErrorType.CONVERSION_ERROR,
            `Failed to export ${catalog.name}`,
            catalog.id,
            error
          ));
        }
      }
    };

    const totalItems = this.flattenCatalogHierarchy(catalogs).filter(c => c.status === 'completed').length;
    await processLevel(catalogs, destination, { completed: 0, total: totalItems });

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
  }

  /**
   * Creates content for flat structure, fetching from API if available
   */
  private async createContentFlat(catalog: WikiCatalog, numberInfo?: { number: string, cleanName: string }): Promise<string> {
    const title = numberInfo ? `${numberInfo.number}. ${numberInfo.cleanName}` : catalog.name;
    
    if (this.qoderApiService && catalog.status === 'completed') {
      try {
        // Use original document ID for API calls (extract from potentially encoded hierarchy path)
        const originalId = this.getOriginalDocumentId(catalog.id);
        const wikiDocument = await this.qoderApiService.getWikiContent(originalId);
        let content = this.processMarkdownContent(wikiDocument.content, {
          preserveHierarchy: true,
          includeTableOfContents: false,
          createIndexFile: false,
          exportStructure: ExportStructureType.FLAT
        });
        
        // Add title if not present
        if (!content.startsWith('#')) {
          content = `# ${title}\n\n${content}`;
        }
        return content;
      } catch (error) {
        // Fall back to placeholder if API call fails
        console.warn(`Failed to fetch content for ${catalog.name}:`, error);
      }
    }
    
    // Placeholder content as fallback
    let content = `# ${title}\n\n`;
    content += `**Document ID:** ${catalog.id}\n`;
    content += `**Status:** ${catalog.status}\n\n`;
    content += `This document was exported from Qoder wiki catalog.\n\n`;
    content += `*Generated on ${new Date().toISOString()}*\n`;
    return content;
  }

  /**
   * Creates README content for tree structure
   */
  private async createReadmeContent(catalog: WikiCatalog, numberInfo?: { number: string, cleanName: string }): Promise<string> {
    const title = numberInfo ? `${numberInfo.number}. ${numberInfo.cleanName}` : catalog.name;
    
    // Try to fetch actual content if this catalog has content and no sub-catalogs
    if (this.qoderApiService && catalog.status === 'completed' && (!catalog.subCatalog || catalog.subCatalog.length === 0)) {
      try {
        // Use original document ID for API calls (extract from potentially encoded hierarchy path)
        const originalId = this.getOriginalDocumentId(catalog.id);
        const wikiDocument = await this.qoderApiService.getWikiContent(originalId);
        let content = this.processMarkdownContent(wikiDocument.content, {
          preserveHierarchy: true,
          includeTableOfContents: false,
          createIndexFile: false,
          exportStructure: ExportStructureType.TREE
        });
        
        // Add title if not present
        if (!content.startsWith('#')) {
          content = `# ${title}\n\n${content}`;
        }
        return content;
      } catch (error) {
        console.warn(`Failed to fetch content for ${catalog.name}:`, error);
      }
    }
    
    // Default README content with navigation
    let content = `# ${title}\n\n`;
    content += `This section contains documentation for ${catalog.name}.\n\n`;
    
    if (catalog.subCatalog && catalog.subCatalog.length > 0) {
      content += `## Contents\n\n`;
      catalog.subCatalog.forEach((subCatalog, index) => {
        const subNumberInfo = numberInfo ? `${numberInfo.number}.${index + 1}` : '';
        const subName = this.cleanDocumentName(subCatalog.name);
        const linkName = subNumberInfo ? `${subNumberInfo}. ${subName}` : subName;
        if (subCatalog.subCatalog && subCatalog.subCatalog.length > 0) {
          content += `- [${linkName}](./${linkName}/README.md)\n`;
        } else {
          content += `- [${linkName}](./${linkName}.md)\n`;
        }
      });
      content += '\n';
    }
    
    content += `*Generated on ${new Date().toISOString()}*\n`;
    return content;
  }

  /**
   * Creates content for tree structure leaf documents, fetching from API if available
   */
  private async createContentTree(catalog: WikiCatalog, numberInfo?: { number: string, cleanName: string }): Promise<string> {
    const title = numberInfo ? `${numberInfo.number}. ${numberInfo.cleanName}` : catalog.name;
    
    if (this.qoderApiService && catalog.status === 'completed') {
      try {
        // Use original document ID for API calls (extract from potentially encoded hierarchy path)
        const originalId = this.getOriginalDocumentId(catalog.id);
        const wikiDocument = await this.qoderApiService.getWikiContent(originalId);
        let content = this.processMarkdownContent(wikiDocument.content, {
          preserveHierarchy: true,
          includeTableOfContents: false,
          createIndexFile: false,
          exportStructure: ExportStructureType.TREE
        });
        
        // Add title if not present
        if (!content.startsWith('#')) {
          content = `# ${title}\n\n${content}`;
        }
        return content;
      } catch (error) {
        // Fall back to placeholder if API call fails
        console.warn(`Failed to fetch content for ${catalog.name}:`, error);
      }
    }
    
    // Placeholder content as fallback
    let content = `# ${title}\n\n`;
    content += `**Document ID:** ${catalog.id}\n`;
    content += `**Status:** ${catalog.status}\n\n`;
    content += `This document was exported from Qoder wiki catalog.\n\n`;
    content += `*Generated on ${new Date().toISOString()}*\n`;
    return content;
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
    return content.replace(/(```[\s\S]*?```)/g, (codeBlock) => {
      return `\n${codeBlock}\n`;
    });
  }

  /**
   * Preserves table formatting.
   * @param content - Content to process
   * @returns Content with preserved tables
   */
  private preserveTables(content: string): string {
    // Ensure tables have proper spacing
    return content.replace(/(\|.*\|.*\n)/g, (tableRow) => {
      return tableRow;
    });
  }

  /**
   * Preserves list formatting.
   * @param content - Content to process
   * @returns Content with preserved lists
   */
  private preserveLists(content: string): string {
    // Ensure proper spacing around lists
    return content.replace(/^(\s*[-*+]\s+.+)$/gm, (listItem) => {
      return listItem;
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
   * Generates a numbered filename for flat structure
   * @param documentName - Original document name
   * @param index - Document index (1-based)
   * @param parentIndex - Parent document index for sub-documents
   * @returns Numbered filename like "1. Introduction.md" or "2.1. Core Architecture.md"
   */
  private generateNumberedFilename(documentName: string, index: number, parentIndex?: number): string {
    const cleanName = this.cleanDocumentName(documentName);
    const number = parentIndex ? `${parentIndex}.${index}` : `${index}`;
    return `${number}. ${cleanName}.md`;
  }

  /**
   * Cleans document name for better readability
   * @param name - Original document name
   * @returns Cleaned name
   */
  private cleanDocumentName(name: string): string {
    // Remove common prefixes and suffixes
    let cleaned = name
      .replace(/^(Document|Doc|File|Page)[\s\-_]*/i, '')
      .replace(/[\s\-_]*(Document|Doc|File|Page)$/i, '')
      .replace(/^[0-9]+[\.\-_\s]*/, '') // Remove existing numbers
      .replace(/[_-]/g, ' ') // Replace underscores and hyphens with spaces
      .trim();

    // Capitalize first letter and each word
    cleaned = cleaned
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return cleaned || 'Untitled';
  }

  /**
   * Assigns hierarchical numbers to documents based on their catalog structure
   * @param catalogs - Array of wiki catalogs
   * @returns Map of document ID to numbering info
   */
  private assignDocumentNumbers(catalogs: WikiCatalog[]): Map<string, { number: string, cleanName: string }> {
    const numberMap = new Map<string, { number: string, cleanName: string }>();
    let currentIndex = 1;

    const processLevel = (items: WikiCatalog[], parentNumber?: string) => {
      let levelIndex = parentNumber ? 1 : currentIndex;

      for (const catalog of items) {
        const number = parentNumber ? `${parentNumber}.${levelIndex}` : `${levelIndex}`;
        const cleanName = this.cleanDocumentName(catalog.name);
        
        numberMap.set(catalog.id, { number, cleanName });

        if (catalog.subCatalog && catalog.subCatalog.length > 0) {
          processLevel(catalog.subCatalog, number);
        }

        levelIndex++;
      }

      if (!parentNumber) {
        currentIndex = levelIndex;
      }
    };

    processLevel(catalogs);
    return numberMap;
  }

  /**
   * Extracts the original document ID from a potentially encoded hierarchy path.
   * @param hierarchyId - The ID which might be encoded (e.g., "parent1_parent2_docId")
   * @returns Original document ID (e.g., "docId")
   */
  private getOriginalDocumentId(hierarchyId: string): string {
    const parts = hierarchyId.split('_');
    return parts[parts.length - 1] || hierarchyId;
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
      exportStructure: ExportStructureType.FLAT,
      ...options
    };
  }
}