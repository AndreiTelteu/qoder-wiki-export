import { ExportError, ExportErrorType, WikiCatalog, WikiDocument } from '../../types/qoder';
import { ErrorHandler } from './errorHandler';

/**
 * Utility service for implementing graceful degradation when individual documents fail.
 * Provides strategies for handling partial failures and continuing operations.
 */
export class GracefulDegradation {
  private errorHandler: ErrorHandler;

  constructor(errorHandler?: ErrorHandler) {
    this.errorHandler = errorHandler || new ErrorHandler();
  }

  /**
   * Filters out documents that are likely to fail based on previous errors.
   * @param documents - Array of documents to filter
   * @param previousErrors - Array of previous errors to learn from
   * @returns Filtered array of documents with better success probability
   */
  public filterProblematicDocuments(
    documents: WikiCatalog[],
    previousErrors: ExportError[]
  ): WikiCatalog[] {
    if (previousErrors.length === 0) {
      return documents;
    }

    // Extract document IDs that have failed before
    const failedDocumentIds = new Set(
      previousErrors
        .filter(error => error.documentId)
        .map(error => error.documentId!)
    );

    // Filter out documents that have failed before
    const filtered = documents.filter(doc => !failedDocumentIds.has(doc.id));

    if (filtered.length < documents.length) {
      const skippedCount = documents.length - filtered.length;
      this.errorHandler.logInfo(
        `Graceful degradation: Skipping ${skippedCount} document(s) that failed previously`
      );
    }

    return filtered;
  }

  /**
   * Attempts to recover from API errors by implementing retry strategies.
   * @param operation - The operation to retry
   * @param maxRetries - Maximum number of retry attempts
   * @param backoffMs - Initial backoff time in milliseconds
   * @returns Promise with the operation result
   */
  public async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    backoffMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry for certain error types
        if (error instanceof ExportError) {
          if (this.shouldNotRetry(error.type)) {
            throw error;
          }

          // Handle rate limiting with longer delays
          if (error.type === ExportErrorType.RATE_LIMIT_ERROR) {
            const rateLimitDelay = this.calculateRateLimitDelay(attempt);
            this.errorHandler.logInfo(`Rate limit encountered, waiting ${rateLimitDelay}ms before retry (attempt ${attempt}/${maxRetries})`);
            await this.delay(rateLimitDelay);
            continue;
          }
        }

        if (attempt === maxRetries) {
          this.errorHandler.logWarning(
            `Operation failed after ${maxRetries} attempts`,
            { lastError: lastError.message }
          );
          throw lastError;
        }

        // Calculate backoff time with exponential backoff
        const delay = Math.min(backoffMs * Math.pow(2, attempt - 1), 10000);
        this.errorHandler.logInfo(`Retrying operation in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        
        await this.delay(delay);
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Calculates appropriate delay for rate limiting scenarios.
   * @param attempt - Current attempt number
   * @returns Delay in milliseconds
   */
  private calculateRateLimitDelay(attempt: number): number {
    // Start with 5 seconds and increase exponentially for rate limiting
    const baseDelay = 5000;
    return Math.min(baseDelay * Math.pow(2, attempt - 1), 60000); // Max 1 minute
  }

  /**
   * Handles batch operations with graceful degradation for individual failures.
   * @param items - Array of items to process
   * @param processor - Function to process each item
   * @param options - Processing options
   * @returns Results with successful and failed items
   */
  public async processBatchWithDegradation<TInput, TOutput>(
    items: TInput[],
    processor: (item: TInput, index: number) => Promise<TOutput>,
    options: {
      continueOnError?: boolean;
      maxConcurrent?: number;
      progressCallback?: (completed: number, total: number) => void;
    } = {}
  ): Promise<{
    successful: Array<{ item: TInput; result: TOutput; index: number }>;
    failed: Array<{ item: TInput; error: Error; index: number }>;
  }> {
    const {
      continueOnError = true,
      maxConcurrent = 5,
      progressCallback
    } = options;

    const successful: Array<{ item: TInput; result: TOutput; index: number }> = [];
    const failed: Array<{ item: TInput; error: Error; index: number }> = [];

    // Process items in batches to avoid overwhelming the system
    for (let i = 0; i < items.length; i += maxConcurrent) {
      const batch = items.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (item, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        try {
          const result = await processor(item, globalIndex);
          successful.push({ item, result, index: globalIndex });
          
          if (progressCallback) {
            progressCallback(successful.length + failed.length, items.length);
          }
        } catch (error) {
          const processError = error instanceof Error ? error : new Error(String(error));
          failed.push({ item, error: processError, index: globalIndex });
          
          this.errorHandler.logWarning(
            `Batch processing failed for item ${globalIndex}`,
            { error: processError.message }
          );

          if (progressCallback) {
            progressCallback(successful.length + failed.length, items.length);
          }

          if (!continueOnError) {
            throw processError;
          }
        }
      });

      // Wait for the current batch to complete before starting the next
      await Promise.all(batchPromises);
    }

    this.errorHandler.logInfo(
      `Batch processing completed: ${successful.length} successful, ${failed.length} failed`
    );

    return { successful, failed };
  }

  /**
   * Creates a fallback document when the original document cannot be retrieved.
   * @param catalog - The catalog item that failed
   * @param error - The error that occurred
   * @returns Fallback WikiDocument
   */
  public createFallbackDocument(catalog: WikiCatalog, error: ExportError): WikiDocument {
    const fallbackContent = this.generateFallbackContent(catalog, error);
    
    return {
      id: catalog.id,
      name: catalog.name,
      content: fallbackContent,
      status: 'failed'
    };
  }

  /**
   * Determines if an operation should be retried based on error type.
   * @param errorType - The type of error that occurred
   * @returns true if the operation should not be retried
   */
  private shouldNotRetry(errorType: ExportErrorType): boolean {
    const nonRetryableErrors = [
      ExportErrorType.QODER_NOT_AVAILABLE,
      ExportErrorType.AUTHENTICATION_FAILED,
      ExportErrorType.USER_CANCELLED,
      ExportErrorType.DOCUMENT_NOT_FOUND,
      ExportErrorType.PERMISSION_DENIED,
      ExportErrorType.DISK_SPACE_ERROR,
      ExportErrorType.VALIDATION_ERROR,
      ExportErrorType.FILE_SYSTEM_ERROR // Most file system errors are not transient
    ];

    return nonRetryableErrors.includes(errorType);
  }

  /**
   * Creates a delay for retry operations.
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generates fallback content for documents that couldn't be retrieved.
   * @param catalog - The catalog item that failed
   * @param error - The error that occurred
   * @returns Fallback markdown content
   */
  private generateFallbackContent(catalog: WikiCatalog, error: ExportError): string {
    let content = `# ${catalog.name}\n\n`;
    content += `**⚠️ Document Export Failed**\n\n`;
    content += `This document could not be exported from Qoder due to an error.\n\n`;
    content += `**Error Details:**\n`;
    content += `- Type: ${error.type}\n`;
    content += `- Message: ${error.message}\n`;
    content += `- Document ID: ${catalog.id}\n`;
    content += `- Status: ${catalog.status}\n\n`;
    
    if (catalog.subCatalog && catalog.subCatalog.length > 0) {
      content += `**Sub-documents:**\n`;
      catalog.subCatalog.forEach(subDoc => {
        content += `- ${subDoc.name} (${subDoc.status})\n`;
      });
      content += '\n';
    }
    
    content += `**Suggested Actions:**\n`;
    content += `1. Check your internet connection\n`;
    content += `2. Verify you're logged in to Qoder\n`;
    content += `3. Ensure the document generation completed successfully\n`;
    content += `4. Try exporting this document individually\n\n`;
    
    content += `*This fallback document was generated on ${new Date().toISOString()}*\n`;
    
    return content;
  }

  /**
   * Disposes of resources used by the graceful degradation service.
   */
  public dispose(): void {
    this.errorHandler.dispose();
  }
}