import * as vscode from 'vscode';
import { 
  WikiCatalog, 
  WikiDocument, 
  ExportResult, 
  ExportError, 
  ExportErrorType, 
  ProgressCallback,
  ProgressInfo,
  MarkdownExportOptions,
  ExportStructureType,
  ExportService as IExportService
} from '../../types/qoder';
import { QoderApiServiceImpl } from './qoderApiService';
import { MarkdownExporter } from '../exporters/markdownExporter';
import { FileService } from './fileService';
import { ErrorHandler } from './errorHandler';
import { NotificationService } from './notificationService';
import { GracefulDegradation } from './gracefulDegradation';

/**
 * ExportService orchestrates the complete export process.
 * Coordinates API calls, document retrieval, export operations, and error handling.
 */
export class ExportService implements IExportService {
  private qoderApiService: QoderApiServiceImpl;
  private markdownExporter: MarkdownExporter;
  private fileService: FileService;
  private errorHandler: ErrorHandler;
  private notificationService: NotificationService;
  private gracefulDegradation: GracefulDegradation;
  private cancellationToken: vscode.CancellationToken | undefined = undefined;
  private isExporting: boolean = false;

  constructor(
    qoderApiService?: QoderApiServiceImpl,
    markdownExporter?: MarkdownExporter,
    fileService?: FileService,
    errorHandler?: ErrorHandler,
    notificationService?: NotificationService,
    gracefulDegradation?: GracefulDegradation
  ) {
    this.errorHandler = errorHandler || new ErrorHandler();
    this.qoderApiService = qoderApiService || new QoderApiServiceImpl(this.errorHandler);
    this.fileService = fileService || new FileService();
    this.markdownExporter = markdownExporter || new MarkdownExporter(this.fileService, this.qoderApiService);
    this.notificationService = notificationService || new NotificationService();
    this.gracefulDegradation = gracefulDegradation || new GracefulDegradation(this.errorHandler);
  }

  /**
   * Exports selected wiki documents to the specified destination.
   * Coordinates all export steps including API calls, document retrieval, and file writing.
   * @param documents - Array of WikiCatalog objects to export
   * @param destination - Destination directory path
   * @param exportStructure - Export structure type (flat or tree)
   * @param progressCallback - Optional callback for progress updates
   * @param cancellationToken - Optional cancellation token for user cancellation
   * @returns Promise<ExportResult> - Result of the export operation
   */
  async exportDocuments(
    documents: WikiCatalog[],
    destination: string,
    exportStructure: ExportStructureType,
    progressCallback?: ProgressCallback,
    cancellationToken?: vscode.CancellationToken,
    originalCatalogs?: WikiCatalog[]
  ): Promise<ExportResult> {
    this.cancellationToken = cancellationToken;
    this.isExporting = true;

    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

    try {
      // Log export start and create performance timer
      const exportTimer = this.errorHandler.createPerformanceTimer('Export Operation');
      this.errorHandler.logInfo('Starting export operation', {
        documentCount: documents.length,
        destination,
        hasProgressCallback: !!progressCallback,
        hasCancellationToken: !!cancellationToken
      });

      // Validate inputs
      if (!documents || documents.length === 0) {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          'No documents provided for export'
        );
        this.errorHandler.handleError(error, 'Input validation');
        throw error;
      }

      if (!destination || destination.trim().length === 0) {
        const error = new ExportError(
          ExportErrorType.FILE_SYSTEM_ERROR,
          'Invalid destination path provided'
        );
        this.errorHandler.handleError(error, 'Input validation');
        throw error;
      }

      // Check if Qoder is available and user is authenticated
      await this.validateQoderAvailability();

      // Documents are already selected as completed from the UI, so no need to filter again
      // But let's verify they have the completed status
      const validDocuments = documents.filter(doc => doc.status === 'completed');
      
      this.errorHandler.logInfo(`Selected documents: ${validDocuments.length} out of ${documents.length} total`);
      
      if (validDocuments.length === 0) {
        this.errorHandler.logWarning('No valid completed documents selected for export');
        this.notificationService.showQuickWarning('No valid completed documents found to export.');
        
        return {
          success: true,
          exportedCount: 0,
          failedCount: 0,
          errors: [],
          outputPath: destination
        };
      }

      // Update progress - starting export
      this.updateProgress(progressCallback, {
        currentDocument: 'Preparing export...',
        completed: 0,
        total: validDocuments.length,
        percentage: 0
      });

      // Check for cancellation
      this.checkCancellation();

      // Ensure destination directory exists
      await this.fileService.createDirectory(destination);

      // Export documents using MarkdownExporter with original hierarchy
      const exportOptions: MarkdownExportOptions = {
        preserveHierarchy: true,
        includeTableOfContents: false,
        createIndexFile: true,
        exportStructure: exportStructure
      };

      // Reconstruct hierarchy for selected documents
      const hierarchicalDocuments = originalCatalogs ? 
        this.reconstructHierarchy(originalCatalogs, validDocuments) :
        validDocuments; // Fallback to flat structure if no original catalogs provided
      
      // Use exportCatalogs with reconstructed hierarchy
      const exportResult = await this.markdownExporter.exportCatalogs(
        hierarchicalDocuments,
        destination,
        exportOptions,
        progressCallback
      );

      // Aggregate results
      exportedCount = exportResult.exportedCount;
      failedCount = exportResult.failedCount;
      errors.push(...exportResult.errors);

      // Final progress update
      this.updateProgress(progressCallback, {
        currentDocument: 'Export complete',
        completed: validDocuments.length,
        total: validDocuments.length,
        percentage: 100
      });

      // Log export completion with performance metrics
      exportTimer({
        success: errors.length === 0,
        exportedCount,
        failedCount,
        errorCount: errors.length,
        documentsProcessed: validDocuments.length
      });
      
      this.errorHandler.logInfo('Export operation completed', {
        success: errors.length === 0,
        exportedCount,
        failedCount,
        errorCount: errors.length
      });

      // Handle errors gracefully - don't show individual errors here as they're handled elsewhere
      if (errors.length > 0) {
        this.errorHandler.handleMultipleErrors(errors, 'Export operation', false);
      }

      const result: ExportResult = {
        success: errors.length === 0,
        exportedCount,
        failedCount,
        errors,
        outputPath: destination
      };

      return result;

    } catch (error) {
      // Handle cancellation
      if (this.cancellationToken?.isCancellationRequested) {
        this.errorHandler.logInfo('Export operation cancelled by user');
        await this.performCleanup(destination);
        
        const cancelError = new ExportError(
          ExportErrorType.USER_CANCELLED,
          'Export operation was cancelled by user'
        );
        
        return {
          success: false,
          exportedCount,
          failedCount: documents.length - exportedCount,
          errors: [cancelError],
          outputPath: destination
        };
      }

      // Handle other errors
      const exportError = error instanceof ExportError 
        ? error 
        : new ExportError(
            ExportErrorType.API_ERROR,
            `Export operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            undefined,
            error
          );

      // Log the critical error
      this.errorHandler.handleError(exportError, 'Critical export failure', false);

      // Attempt cleanup on failure
      try {
        await this.performCleanup(destination);
      } catch (cleanupError) {
        this.errorHandler.handleError(
          cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
          'Cleanup after export failure',
          false
        );
      }

      return {
        success: false,
        exportedCount,
        failedCount: documents.length - exportedCount,
        errors: [exportError, ...errors],
        outputPath: destination
      };

    } finally {
      this.isExporting = false;
      this.cancellationToken = undefined;
    }
  }

  /**
   * Validates that Qoder extension is available and user is authenticated.
   * @throws ExportError if validation fails
   */
  private async validateQoderAvailability(): Promise<void> {
    if (!this.qoderApiService.isQoderAvailable()) {
      throw new ExportError(
        ExportErrorType.QODER_NOT_AVAILABLE,
        'Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated.'
      );
    }

    const isLoggedIn = await this.qoderApiService.isUserLoggedIn();
    if (!isLoggedIn) {
      throw new ExportError(
        ExportErrorType.AUTHENTICATION_FAILED,
        'User is not logged in to Qoder. Please log in to access wiki content.'
      );
    }
  }

  /**
   * Reconstructs hierarchical structure from selected documents with encoded hierarchy paths.
   * Decodes hierarchy paths (like "parent1_parent2_documentId") to rebuild the proper structure.
   * @param originalDocuments - Original hierarchical documents from API
   * @param selectedDocuments - Flat array of selected completed documents with encoded hierarchy paths
   * @returns Hierarchical structure containing only selected documents with preserved hierarchy
   */
  private reconstructHierarchy(
    originalDocuments: WikiCatalog[],
    selectedDocuments: WikiCatalog[]
  ): WikiCatalog[] {
    // Create a map to build the hierarchy structure
    const hierarchyMap = new Map<string, WikiCatalog>();
    const rootDocuments: WikiCatalog[] = [];
    
    // First, decode all selected documents and create original ID mapping
    const originalIdMap = new Map<string, WikiCatalog>();
    const createOriginalIdMap = (catalogs: WikiCatalog[]) => {
      for (const catalog of catalogs) {
        originalIdMap.set(catalog.id, catalog);
        if (catalog.subCatalog) {
          createOriginalIdMap(catalog.subCatalog);
        }
      }
    };
    createOriginalIdMap(originalDocuments);
    
    // Process each selected document
    for (const selectedDoc of selectedDocuments) {
      const hierarchyPath = selectedDoc.id; // This contains the encoded path like "parent1_parent2_docId"
      const pathParts = hierarchyPath.split('_');
      
      // Build the hierarchy from root to leaf
      let currentParent: WikiCatalog[] = rootDocuments;
      let currentPath = '';
      
      for (let i = 0; i < pathParts.length; i++) {
        const currentId = pathParts[i];
        if (!currentId) continue; // Skip empty parts
        
        currentPath = currentPath ? `${currentPath}_${currentId}` : currentId;
        
        // Check if we already have this node in our hierarchy
        let existingNode = currentParent.find(doc => this.getOriginalId(doc.id) === currentId);
        
        if (!existingNode) {
          // Create new node using original document data
          const originalDoc = originalIdMap.get(currentId);
          if (originalDoc) {
            const newNode: WikiCatalog = {
              id: currentId, // Use original ID, not encoded path
              name: originalDoc.name,
              status: originalDoc.status
            };
            
            // Add subCatalog array if this is not a leaf node
            if (i < pathParts.length - 1) {
              newNode.subCatalog = [];
            }
            
            currentParent.push(newNode);
            existingNode = newNode;
          }
        }
        
        // Move to the next level if this is not the last part
        if (i < pathParts.length - 1 && existingNode?.subCatalog) {
          currentParent = existingNode.subCatalog;
        }
      }
    }
    
    return rootDocuments;
  }

  /**
   * Extracts the original document ID from a potentially encoded hierarchy path
   * @param hierarchyId - The ID which might be encoded (e.g., "parent1_parent2_docId")
   * @returns Original document ID (e.g., "docId")
   */
  private getOriginalId(hierarchyId: string): string {
    const parts = hierarchyId.split('_');
    return parts[parts.length - 1] || hierarchyId;
  }

  /**
   * Filters documents to only include completed ones.
   * @param documents - Array of WikiCatalog objects
   * @returns Array of completed WikiCatalog objects
   */
  private filterCompletedDocuments(documents: WikiCatalog[]): WikiCatalog[] {
    const completed: WikiCatalog[] = [];

    const processDocument = (doc: WikiCatalog) => {
      if (doc.status === 'completed') {
        completed.push(doc);
      }

      // Recursively process sub-catalogs
      if (doc.subCatalog && doc.subCatalog.length > 0) {
        doc.subCatalog.forEach(processDocument);
      }
    };

    documents.forEach(processDocument);
    return completed;
  }

  /**
   * Retrieves content for all documents with retry logic and error handling.
   * @param documents - Array of WikiCatalog objects
   * @param progressCallback - Optional progress callback
   * @returns Object containing successful and failed document retrievals
   */
  private async retrieveDocumentContent(
    documents: WikiCatalog[],
    progressCallback?: ProgressCallback
  ): Promise<{
    successful: WikiDocument[];
    failed: WikiCatalog[];
    errors: ExportError[];
  }> {
    const successful: WikiDocument[] = [];
    const failed: WikiCatalog[] = [];
    const errors: ExportError[] = [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      
      if (!document) {
        continue;
      }
      
      // Update progress
      this.updateProgress(progressCallback, {
        currentDocument: `Retrieving: ${document.name}`,
        completed: i,
        total: documents.length,
        percentage: Math.round((i / documents.length) * 50) // First 50% for content retrieval
      });

      // Check for cancellation
      this.checkCancellation();

      try {
        const documentTimer = this.errorHandler.createPerformanceTimer(`Document Retrieval: ${document.name}`);
        const wikiDocument = await this.retrieveDocumentWithRetry(document);
        successful.push(wikiDocument);
        documentTimer({ documentId: document.id, status: document.status });
        this.errorHandler.logDebug(`Successfully retrieved document: ${document.name}`, { 
          documentId: document.id, 
          contentLength: wikiDocument.content.length 
        });
      } catch (error) {
        failed.push(document);
        
        const exportError = error instanceof ExportError 
          ? error 
          : new ExportError(
              ExportErrorType.API_ERROR,
              `Failed to retrieve content for document: ${document.name}`,
              document.id,
              error
            );
        
        errors.push(exportError);
        
        // Log individual document failures for debugging, but don't show to user yet
        this.errorHandler.handleError(exportError, `Document retrieval: ${document.name}`, false);
        this.errorHandler.logDebug(`Document retrieval failed`, {
          documentId: document.id,
          documentName: document.name,
          errorType: exportError.type,
          attempt: `${i + 1}/${documents.length}`
        });
      }
    }

    return { successful, failed, errors };
  }

  /**
   * Retrieves document content with retry logic for transient failures.
   * @param document - WikiCatalog object to retrieve content for
   * @param maxRetries - Maximum number of retry attempts
   * @returns Promise<WikiDocument> - Retrieved document with content
   */
  private async retrieveDocumentWithRetry(
    document: WikiCatalog,
    maxRetries: number = 3
  ): Promise<WikiDocument> {
    return this.gracefulDegradation.retryWithBackoff(
      async () => {
        // Check for cancellation before each attempt
        this.checkCancellation();
        const wikiDocument = await this.qoderApiService.getWikiContent(document.id);
        
        // Preserve the human-readable name from the catalog
        return {
          id: wikiDocument.id,
          name: document.name, // Use catalog name instead of API name
          content: wikiDocument.content,
          status: wikiDocument.status || 'completed'
        };
      },
      maxRetries,
      1000
    );
  }



  /**
   * Updates progress callback if provided.
   * @param progressCallback - Optional progress callback
   * @param progress - Progress information to report
   */
  private updateProgress(
    progressCallback: ProgressCallback | undefined,
    progress: ProgressInfo
  ): void {
    if (progressCallback) {
      progressCallback(progress);
    }
  }

  /**
   * Checks if the operation has been cancelled and throws appropriate error.
   * @throws ExportError if operation is cancelled
   */
  private checkCancellation(): void {
    if (this.cancellationToken?.isCancellationRequested) {
      throw new ExportError(
        ExportErrorType.USER_CANCELLED,
        'Export operation was cancelled by user'
      );
    }
  }

  /**
   * Performs cleanup operations for cancelled or failed exports.
   * Removes partially created files and directories.
   * @param destination - Destination directory to clean up
   */
  private async performCleanup(destination: string): Promise<void> {
    try {
      // Check if destination directory exists and was created by this export
      const exists = await this.fileService.directoryExists(destination);
      if (!exists) {
        return;
      }

      // For safety, only clean up if the directory appears to be empty or contains only our files
      // In a production implementation, you might want to be more sophisticated about this
      // For now, we'll just log that cleanup was attempted
      console.log(`Cleanup attempted for export destination: ${destination}`);
      
      // Note: Actual file deletion is intentionally not implemented here for safety
      // In a real implementation, you would want to:
      // 1. Track which files were created during this export session
      // 2. Only delete files that were created by this export
      // 3. Provide user confirmation for cleanup operations
      
    } catch (error) {
      console.error('Error during cleanup operation:', error);
      // Don't throw cleanup errors - they shouldn't fail the main operation
    }
  }

  /**
   * Checks if an export operation is currently in progress.
   * @returns boolean - true if export is in progress, false otherwise
   */
  public isExportInProgress(): boolean {
    return this.isExporting;
  }

  /**
   * Cancels the current export operation if one is in progress.
   * Note: This sets the cancellation flag, but the actual cancellation
   * depends on the operation checking the cancellation token.
   */
  public cancelExport(): void {
    if (this.cancellationToken && this.isExporting) {
      // The cancellation token should be managed by the caller (VSCode progress API)
      // This method is here for completeness but the actual cancellation
      // is handled through the cancellation token passed to exportDocuments
      this.errorHandler.logInfo('Export cancellation requested');
    }
  }

  /**
   * Disposes of resources used by the export service.
   */
  public dispose(): void {
    this.errorHandler.dispose();
    this.gracefulDegradation.dispose();
  }
}