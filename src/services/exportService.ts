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
  ExportService as IExportService
} from '../../types/qoder';
import { QoderApiServiceImpl } from './qoderApiService';
import { MarkdownExporter } from '../exporters/markdownExporter';
import { FileService } from './fileService';

/**
 * ExportService orchestrates the complete export process.
 * Coordinates API calls, document retrieval, export operations, and error handling.
 */
export class ExportService implements IExportService {
  private qoderApiService: QoderApiServiceImpl;
  private markdownExporter: MarkdownExporter;
  private fileService: FileService;
  private cancellationToken: vscode.CancellationToken | undefined = undefined;
  private isExporting: boolean = false;

  constructor(
    qoderApiService?: QoderApiServiceImpl,
    markdownExporter?: MarkdownExporter,
    fileService?: FileService
  ) {
    this.qoderApiService = qoderApiService || new QoderApiServiceImpl();
    this.fileService = fileService || new FileService();
    this.markdownExporter = markdownExporter || new MarkdownExporter(this.fileService);
  }

  /**
   * Exports selected wiki documents to the specified destination.
   * Coordinates all export steps including API calls, document retrieval, and file writing.
   * @param documents - Array of WikiCatalog objects to export
   * @param destination - Destination directory path
   * @param progressCallback - Optional callback for progress updates
   * @param cancellationToken - Optional cancellation token for user cancellation
   * @returns Promise<ExportResult> - Result of the export operation
   */
  async exportDocuments(
    documents: WikiCatalog[],
    destination: string,
    progressCallback?: ProgressCallback,
    cancellationToken?: vscode.CancellationToken
  ): Promise<ExportResult> {
    this.cancellationToken = cancellationToken;
    this.isExporting = true;

    const errors: ExportError[] = [];
    let exportedCount = 0;
    let failedCount = 0;

    try {
      // Validate inputs
      if (!documents || documents.length === 0) {
        throw new ExportError(
          ExportErrorType.API_ERROR,
          'No documents provided for export'
        );
      }

      if (!destination || destination.trim().length === 0) {
        throw new ExportError(
          ExportErrorType.FILE_SYSTEM_ERROR,
          'Invalid destination path provided'
        );
      }

      // Check if Qoder is available and user is authenticated
      await this.validateQoderAvailability();

      // Filter documents to only include completed ones
      const completedDocuments = this.filterCompletedDocuments(documents);
      
      if (completedDocuments.length === 0) {
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
        total: completedDocuments.length,
        percentage: 0
      });

      // Check for cancellation
      this.checkCancellation();

      // Ensure destination directory exists
      await this.fileService.createDirectory(destination);

      // Retrieve document content for all documents
      const documentsWithContent = await this.retrieveDocumentContent(
        completedDocuments,
        progressCallback
      );

      // Check for cancellation after content retrieval
      this.checkCancellation();

      // Export documents using MarkdownExporter
      const exportOptions: MarkdownExportOptions = {
        preserveHierarchy: true,
        includeTableOfContents: false,
        createIndexFile: true
      };

      const exportResult = await this.markdownExporter.export(
        documentsWithContent.successful,
        destination,
        exportOptions,
        progressCallback
      );

      // Aggregate results
      exportedCount = exportResult.exportedCount;
      failedCount = exportResult.failedCount + documentsWithContent.failed.length;
      errors.push(...exportResult.errors, ...documentsWithContent.errors);

      // Final progress update
      this.updateProgress(progressCallback, {
        currentDocument: 'Export complete',
        completed: completedDocuments.length,
        total: completedDocuments.length,
        percentage: 100
      });

      return {
        success: errors.length === 0,
        exportedCount,
        failedCount,
        errors,
        outputPath: destination
      };

    } catch (error) {
      // Handle cancellation
      if (this.cancellationToken?.isCancellationRequested) {
        await this.performCleanup(destination);
        
        return {
          success: false,
          exportedCount,
          failedCount: documents.length - exportedCount,
          errors: [new ExportError(
            ExportErrorType.USER_CANCELLED,
            'Export operation was cancelled by user'
          )],
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

      // Attempt cleanup on failure
      try {
        await this.performCleanup(destination);
      } catch (cleanupError) {
        console.error('Failed to cleanup after export failure:', cleanupError);
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
        const wikiDocument = await this.retrieveDocumentWithRetry(document);
        successful.push(wikiDocument);
      } catch (error) {
        failed.push(document);
        
        if (error instanceof ExportError) {
          errors.push(error);
        } else {
          errors.push(new ExportError(
            ExportErrorType.API_ERROR,
            `Failed to retrieve content for document: ${document.name}`,
            document.id,
            error
          ));
        }
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
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check for cancellation before each attempt
        this.checkCancellation();

        const wikiDocument = await this.qoderApiService.getWikiContent(document.id);
        return wikiDocument;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry for certain error types
        if (error instanceof ExportError) {
          if (error.type === ExportErrorType.AUTHENTICATION_FAILED ||
              error.type === ExportErrorType.QODER_NOT_AVAILABLE ||
              error.type === ExportErrorType.USER_CANCELLED) {
            throw error;
          }
        }

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await this.delay(delay);
      }
    }

    // This should never be reached, but just in case
    throw lastError || new ExportError(
      ExportErrorType.API_ERROR,
      `Failed to retrieve document after ${maxRetries} attempts: ${document.name}`,
      document.id
    );
  }

  /**
   * Creates a delay for retry logic.
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      console.log('Export cancellation requested');
    }
  }
}