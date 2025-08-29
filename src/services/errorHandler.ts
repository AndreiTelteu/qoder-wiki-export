import * as vscode from 'vscode';
import { ExportError, ExportErrorType } from '../../types/qoder';

/**
 * Centralized error handling service for the Qoder Wiki Export extension.
 * Provides user-friendly error messages, logging, and actionable suggestions.
 */
export class ErrorHandler {
  private static readonly LOG_CHANNEL_NAME = 'Qoder Wiki Export';
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(ErrorHandler.LOG_CHANNEL_NAME);
  }

  /**
   * Handles export errors by logging them and showing appropriate user messages.
   * @param error - The error to handle
   * @param context - Additional context about where the error occurred
   * @param showToUser - Whether to show the error to the user (default: true)
   */
  public handleError(error: Error | ExportError, context?: string, showToUser: boolean = true): void {
    const exportError = this.normalizeError(error);
    
    // Log the error for debugging
    this.logError(exportError, context);

    // Show user-friendly message if requested
    if (showToUser) {
      this.showUserError(exportError);
    }
  }

  /**
   * Handles multiple errors from batch operations.
   * @param errors - Array of errors to handle
   * @param context - Additional context about the operation
   * @param showSummary - Whether to show a summary to the user (default: true)
   */
  public handleMultipleErrors(
    errors: (Error | ExportError)[], 
    context?: string, 
    showSummary: boolean = true
  ): void {
    if (errors.length === 0) {
      return;
    }

    // Log all errors
    errors.forEach((error, index) => {
      const exportError = this.normalizeError(error);
      this.logError(exportError, `${context} - Error ${index + 1}/${errors.length}`);
    });

    // Show summary to user if requested
    if (showSummary) {
      this.showErrorSummary(errors.map(e => this.normalizeError(e)), context);
    }
  }

  /**
   * Logs informational messages for debugging and troubleshooting.
   * @param message - The message to log
   * @param data - Optional additional data to log
   */
  public logInfo(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] INFO: ${message}`;
    
    if (data) {
      logMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    this.outputChannel.appendLine(logMessage);
  }

  /**
   * Logs warning messages.
   * @param message - The warning message to log
   * @param data - Optional additional data to log
   */
  public logWarning(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] WARNING: ${message}`;
    
    if (data) {
      logMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    this.outputChannel.appendLine(logMessage);
  }

  /**
   * Logs debug messages for detailed troubleshooting.
   * @param message - The debug message to log
   * @param data - Optional additional data to log
   */
  public logDebug(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] DEBUG: ${message}`;
    
    if (data) {
      logMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    this.outputChannel.appendLine(logMessage);
  }

  /**
   * Logs performance metrics for operation timing.
   * @param operation - Name of the operation
   * @param duration - Duration in milliseconds
   * @param additionalData - Optional additional performance data
   */
  public logPerformance(operation: string, duration: number, additionalData?: any): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] PERFORMANCE: ${operation} completed in ${duration}ms`;
    
    if (additionalData) {
      logMessage += `\nMetrics: ${JSON.stringify(additionalData, null, 2)}`;
    }
    
    this.outputChannel.appendLine(logMessage);
  }

  /**
   * Creates a performance timer for measuring operation duration.
   * @param operation - Name of the operation being timed
   * @returns Function to call when operation completes
   */
  public createPerformanceTimer(operation: string): (additionalData?: any) => void {
    const startTime = Date.now();
    
    return (additionalData?: any) => {
      const duration = Date.now() - startTime;
      this.logPerformance(operation, duration, additionalData);
    };
  }

  /**
   * Shows the output channel to the user for debugging purposes.
   */
  public showOutputChannel(): void {
    this.outputChannel.show();
  }

  /**
   * Clears the output channel.
   */
  public clearLog(): void {
    this.outputChannel.clear();
  }

  /**
   * Normalizes any error to an ExportError for consistent handling.
   * @param error - The error to normalize
   * @returns ExportError instance
   */
  private normalizeError(error: Error | ExportError): ExportError {
    if (error instanceof ExportError) {
      return error;
    }

    // Convert generic errors to ExportError
    return new ExportError(
      ExportErrorType.API_ERROR,
      error.message || 'Unknown error occurred',
      undefined,
      error
    );
  }

  /**
   * Logs an error with full details for debugging.
   * @param error - The ExportError to log
   * @param context - Additional context information
   */
  private logError(error: ExportError, context?: string): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ERROR: ${error.type}`;
    
    if (context) {
      logMessage += ` (${context})`;
    }
    
    logMessage += `\nMessage: ${error.message}`;
    
    if (error.documentId) {
      logMessage += `\nDocument ID: ${error.documentId}`;
    }
    
    if (error.details) {
      logMessage += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }
    
    if (error.stack) {
      logMessage += `\nStack trace: ${error.stack}`;
    }
    
    this.outputChannel.appendLine(logMessage);
  }

  /**
   * Shows a user-friendly error message with actionable suggestions.
   * @param error - The ExportError to show to the user
   */
  private showUserError(error: ExportError): void {
    const userMessage = this.getUserFriendlyMessage(error);
    const actions = this.getErrorActions(error);

    if (actions.length > 0) {
      vscode.window.showErrorMessage(userMessage, ...actions).then(selectedAction => {
        if (selectedAction) {
          this.executeErrorAction(selectedAction, error);
        }
      });
    } else {
      vscode.window.showErrorMessage(userMessage);
    }
  }

  /**
   * Shows a summary of multiple errors to the user.
   * @param errors - Array of ExportError instances
   * @param context - Additional context about the operation
   */
  private showErrorSummary(errors: ExportError[], context?: string): void {
    const errorCounts = this.categorizeErrors(errors);
    const totalErrors = errors.length;
    
    let summaryMessage = `Export completed with ${totalErrors} error${totalErrors === 1 ? '' : 's'}`;
    
    if (context) {
      summaryMessage += ` during ${context}`;
    }
    
    summaryMessage += ':\n';
    
    // Add error breakdown
    Object.entries(errorCounts).forEach(([type, count]) => {
      if (count > 0) {
        summaryMessage += `\n• ${this.getErrorTypeDisplayName(type as ExportErrorType)}: ${count}`;
      }
    });

    const actions = ['View Details', 'Retry Failed'];
    
    vscode.window.showWarningMessage(summaryMessage, ...actions).then(selectedAction => {
      if (selectedAction === 'View Details') {
        this.showOutputChannel();
      } else if (selectedAction === 'Retry Failed') {
        // This would need to be implemented by the calling code
        vscode.window.showInformationMessage('Retry functionality would be implemented by the export service.');
      }
    });
  }

  /**
   * Gets a user-friendly error message for display.
   * @param error - The ExportError to get a message for
   * @returns User-friendly error message
   */
  private getUserFriendlyMessage(error: ExportError): string {
    switch (error.type) {
      case ExportErrorType.QODER_NOT_AVAILABLE:
        return 'Qoder extension is not available. Please ensure the Qoder extension is installed and activated, then try again.';
      
      case ExportErrorType.AUTHENTICATION_FAILED:
        return 'You are not logged in to Qoder. Please log in to your Qoder account to access wiki content.';
      
      case ExportErrorType.NETWORK_ERROR:
        return 'Network error occurred while communicating with Qoder. Please check your internet connection and try again.';
      
      case ExportErrorType.TIMEOUT_ERROR:
        return 'Request timed out while communicating with Qoder. Please try again or check your network connection.';
      
      case ExportErrorType.RATE_LIMIT_ERROR:
        return 'Too many requests to Qoder API. Please wait a moment and try again.';
      
      case ExportErrorType.DOCUMENT_NOT_FOUND:
        return `Document not found: ${error.message}. The document may have been deleted or is no longer available.`;
      
      case ExportErrorType.API_ERROR:
        if (error.message.includes('network') || error.message.includes('timeout')) {
          return 'Network error occurred while communicating with Qoder. Please check your internet connection and try again.';
        }
        return `API error: ${error.message}. Please try again or check the output log for more details.`;
      
      case ExportErrorType.PERMISSION_DENIED:
        return 'Permission denied while writing files. Please check that you have write access to the destination folder and try again.';
      
      case ExportErrorType.DISK_SPACE_ERROR:
        return 'Insufficient disk space to complete the export. Please free up some space and try again.';
      
      case ExportErrorType.FILE_SYSTEM_ERROR:
        if (error.message.includes('permission') || error.message.includes('access')) {
          return 'Permission denied while writing files. Please check that you have write access to the destination folder.';
        }
        if (error.message.includes('space') || error.message.includes('disk')) {
          return 'Insufficient disk space. Please free up some space and try again.';
        }
        return `File system error: ${error.message}. Please check the destination path and permissions.`;
      
      case ExportErrorType.CONVERSION_ERROR:
        return `Document conversion failed: ${error.message}. The document may contain unsupported content.`;
      
      case ExportErrorType.VALIDATION_ERROR:
        return `Validation error: ${error.message}. Please check your input and try again.`;
      
      case ExportErrorType.USER_CANCELLED:
        return 'Export operation was cancelled.';
      
      default:
        return `An unexpected error occurred: ${error.message}`;
    }
  }

  /**
   * Gets available actions for an error type.
   * @param error - The ExportError to get actions for
   * @returns Array of action button labels
   */
  private getErrorActions(error: ExportError): string[] {
    switch (error.type) {
      case ExportErrorType.QODER_NOT_AVAILABLE:
        return ['Install Qoder', 'View Details'];
      
      case ExportErrorType.AUTHENTICATION_FAILED:
        return ['Login to Qoder', 'View Details'];
      
      case ExportErrorType.NETWORK_ERROR:
      case ExportErrorType.TIMEOUT_ERROR:
        return ['Retry', 'Check Connection', 'View Details'];
      
      case ExportErrorType.RATE_LIMIT_ERROR:
        return ['Wait and Retry', 'View Details'];
      
      case ExportErrorType.DOCUMENT_NOT_FOUND:
        return ['Skip Document', 'Refresh Catalogs', 'View Details'];
      
      case ExportErrorType.API_ERROR:
        return ['Retry', 'View Details'];
      
      case ExportErrorType.PERMISSION_DENIED:
        return ['Choose Different Location', 'Check Permissions', 'View Details'];
      
      case ExportErrorType.DISK_SPACE_ERROR:
        return ['Free Up Space', 'Choose Different Location', 'View Details'];
      
      case ExportErrorType.FILE_SYSTEM_ERROR:
        return ['Choose Different Location', 'View Details'];
      
      case ExportErrorType.CONVERSION_ERROR:
        return ['Skip Document', 'View Details'];
      
      case ExportErrorType.VALIDATION_ERROR:
        return ['Fix Input', 'View Details'];
      
      default:
        return ['View Details'];
    }
  }

  /**
   * Executes an action selected by the user in response to an error.
   * @param action - The action button label that was selected
   * @param error - The original error
   */
  private executeErrorAction(action: string, error: ExportError): void {
    switch (action) {
      case 'Install Qoder':
        vscode.commands.executeCommand('workbench.extensions.search', 'aicoding.aicoding-agent');
        break;
      
      case 'Login to Qoder':
        // This would need to trigger the Qoder login command if available
        vscode.window.showInformationMessage('Please use the Qoder extension to log in to your account.');
        break;
      
      case 'Retry':
        vscode.window.showInformationMessage('Retry functionality would be implemented by the calling code.');
        break;
      
      case 'Wait and Retry':
        vscode.window.showInformationMessage('Please wait a moment before retrying to avoid rate limiting.');
        break;
      
      case 'Check Connection':
        vscode.commands.executeCommand('workbench.action.openSettings', 'http.proxy');
        break;
      
      case 'Skip Document':
        vscode.window.showInformationMessage('Document will be skipped in future export attempts.');
        break;
      
      case 'Refresh Catalogs':
        vscode.commands.executeCommand('qoderWikiExport.exportWiki');
        break;
      
      case 'Choose Different Location':
        vscode.commands.executeCommand('qoderWikiExport.exportWiki');
        break;
      
      case 'Check Permissions':
        vscode.window.showInformationMessage('Please check that you have write permissions to the destination folder.');
        break;
      
      case 'Free Up Space':
        vscode.window.showInformationMessage('Please free up disk space and try again.');
        break;
      
      case 'Fix Input':
        vscode.window.showInformationMessage('Please check your input parameters and try again.');
        break;
      
      case 'View Details':
        this.showOutputChannel();
        break;
      
      default:
        this.showOutputChannel();
        break;
    }
  }

  /**
   * Categorizes errors by type for summary reporting.
   * @param errors - Array of ExportError instances
   * @returns Object with error type counts
   */
  private categorizeErrors(errors: ExportError[]): Record<ExportErrorType, number> {
    const counts: Record<ExportErrorType, number> = {
      [ExportErrorType.QODER_NOT_AVAILABLE]: 0,
      [ExportErrorType.AUTHENTICATION_FAILED]: 0,
      [ExportErrorType.API_ERROR]: 0,
      [ExportErrorType.FILE_SYSTEM_ERROR]: 0,
      [ExportErrorType.CONVERSION_ERROR]: 0,
      [ExportErrorType.USER_CANCELLED]: 0,
      [ExportErrorType.NETWORK_ERROR]: 0,
      [ExportErrorType.RATE_LIMIT_ERROR]: 0,
      [ExportErrorType.DOCUMENT_NOT_FOUND]: 0,
      [ExportErrorType.PERMISSION_DENIED]: 0,
      [ExportErrorType.DISK_SPACE_ERROR]: 0,
      [ExportErrorType.TIMEOUT_ERROR]: 0,
      [ExportErrorType.VALIDATION_ERROR]: 0
    };

    errors.forEach(error => {
      counts[error.type]++;
    });

    return counts;
  }

  /**
   * Gets a display-friendly name for an error type.
   * @param errorType - The ExportErrorType to get a display name for
   * @returns Display-friendly error type name
   */
  private getErrorTypeDisplayName(errorType: ExportErrorType): string {
    switch (errorType) {
      case ExportErrorType.QODER_NOT_AVAILABLE:
        return 'Qoder Extension Issues';
      case ExportErrorType.AUTHENTICATION_FAILED:
        return 'Authentication Problems';
      case ExportErrorType.NETWORK_ERROR:
        return 'Network Connection Errors';
      case ExportErrorType.TIMEOUT_ERROR:
        return 'Request Timeout Errors';
      case ExportErrorType.RATE_LIMIT_ERROR:
        return 'Rate Limiting Errors';
      case ExportErrorType.DOCUMENT_NOT_FOUND:
        return 'Document Not Found Errors';
      case ExportErrorType.API_ERROR:
        return 'API Communication Errors';
      case ExportErrorType.PERMISSION_DENIED:
        return 'Permission Denied Errors';
      case ExportErrorType.DISK_SPACE_ERROR:
        return 'Disk Space Errors';
      case ExportErrorType.FILE_SYSTEM_ERROR:
        return 'File System Errors';
      case ExportErrorType.CONVERSION_ERROR:
        return 'Document Conversion Errors';
      case ExportErrorType.VALIDATION_ERROR:
        return 'Input Validation Errors';
      case ExportErrorType.USER_CANCELLED:
        return 'User Cancellations';
      default:
        return 'Unknown Errors';
    }
  }

  /**
   * Disposes of resources used by the error handler.
   */
  public dispose(): void {
    this.outputChannel.dispose();
  }
}