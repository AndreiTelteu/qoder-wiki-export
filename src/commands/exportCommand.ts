/**
 * Export command implementation for Qoder Wiki Export extension
 * Handles the main export workflow including user interaction, progress reporting, and error handling
 */

import * as vscode from 'vscode';
import { 
  WikiCatalog, 
  ExportResult, 
  ExportError, 
  ExportErrorType,
  ProgressInfo,
  ExportStructureType,
  MarkdownExportOptions
} from '../../types/qoder';
import { ExportService } from '../services/exportService';
import { QoderApiServiceImpl } from '../services/qoderApiService';
import { DocumentSelector } from '../ui/documentSelector';
import { ErrorHandler } from '../services/errorHandler';
import { NotificationService } from '../services/notificationService';

/**
 * Main export command handler that orchestrates the complete export workflow
 * Includes authentication checks, document selection, progress reporting, and error handling
 */
export class ExportCommand {
  private exportService: ExportService;
  private qoderApiService: QoderApiServiceImpl;
  private documentSelector: DocumentSelector;
  private errorHandler: ErrorHandler;
  private notificationService: NotificationService;

  constructor(
    exportService?: ExportService,
    qoderApiService?: QoderApiServiceImpl,
    documentSelector?: DocumentSelector,
    errorHandler?: ErrorHandler,
    notificationService?: NotificationService
  ) {
    this.errorHandler = errorHandler || new ErrorHandler();
    this.notificationService = notificationService || new NotificationService();
    this.qoderApiService = qoderApiService || new QoderApiServiceImpl(this.errorHandler);
    this.exportService = exportService || new ExportService(
      this.qoderApiService, 
      undefined, 
      undefined, 
      this.errorHandler, 
      this.notificationService
    );
    this.documentSelector = documentSelector || new DocumentSelector();
  }

  /**
   * Executes the main export workflow
   * Handles all user interactions, progress reporting, and error scenarios
   */
  async execute(): Promise<void> {
    try {
      this.errorHandler.logInfo('Starting export command execution');

      // Step 1: Check Qoder availability and authentication
      await this.validateQoderSetup();

      // Step 2: Retrieve available wiki catalogs
      const catalogs = await this.retrieveWikiCatalogs();
      if (!catalogs || catalogs.length === 0) {
        this.errorHandler.logInfo('No wiki documents found');
        this.notificationService.showQuickInfo(
          'No wiki documents found. Generate some documentation with Qoder first.'
        );
        return;
      }

      // Step 3: Let user select documents to export
      const selectedDocuments = await this.selectDocumentsForExport(catalogs);
      if (!selectedDocuments || selectedDocuments.length === 0) {
        this.errorHandler.logInfo('User cancelled document selection or no documents selected');
        return;
      }

      // Step 4: Let user choose export structure 
      const exportStructure = await this.selectExportStructure();
      if (!exportStructure) {
        this.errorHandler.logInfo('User cancelled structure selection');
        return;
      }

      // Step 5: Let user choose export destination
      const destination = await this.selectExportDestination();
      if (!destination) {
        this.errorHandler.logInfo('User cancelled destination selection');
        return;
      }

      // Step 6: Execute export with progress reporting
      await this.executeExportWithProgress(selectedDocuments, destination, exportStructure, catalogs);

    } catch (error) {
      this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        'Export command execution'
      );
      await this.handleExportError(error);
    }
  }

  /**
   * Validates that Qoder extension is available and user is authenticated
   * Shows appropriate error messages and login prompts if needed
   */
  private async validateQoderSetup(): Promise<void> {
    // Check if Qoder extension is available
    if (!this.qoderApiService.isQoderAvailable()) {
      const message = 'Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated.';
      const action = await vscode.window.showErrorMessage(
        message,
        'Open Extensions'
      );
      
      if (action === 'Open Extensions') {
        vscode.commands.executeCommand('workbench.view.extensions');
      }
      
      throw new ExportError(ExportErrorType.QODER_NOT_AVAILABLE, message);
    }

    // Check authentication status
    const isLoggedIn = await this.qoderApiService.isUserLoggedIn();
    if (!isLoggedIn) {
      const message = 'You are not logged in to Qoder. Please log in to access your wiki documentation.';
      const action = await vscode.window.showWarningMessage(
        message,
        'Login to Qoder',
        'Cancel'
      );
      
      if (action === 'Login to Qoder') {
        // Attempt to trigger Qoder login command if available
        try {
          await vscode.commands.executeCommand('qoder.login');
          
          // Re-check authentication after login attempt
          const isNowLoggedIn = await this.qoderApiService.isUserLoggedIn();
          if (!isNowLoggedIn) {
            throw new ExportError(
              ExportErrorType.AUTHENTICATION_FAILED,
              'Login was not successful. Please try logging in to Qoder manually.'
            );
          }
        } catch (loginError) {
          const fallbackMessage = 'Please log in to Qoder manually and try the export again.';
          vscode.window.showErrorMessage(fallbackMessage);
          throw new ExportError(ExportErrorType.AUTHENTICATION_FAILED, fallbackMessage);
        }
      } else {
        throw new ExportError(ExportErrorType.AUTHENTICATION_FAILED, 'Export cancelled - authentication required.');
      }
    }
  }

  /**
   * Retrieves wiki catalogs from Qoder API with error handling
   */
  private async retrieveWikiCatalogs(): Promise<WikiCatalog[]> {
    try {
      return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Loading wiki documents...',
        cancellable: false
      }, async () => {
        return await this.qoderApiService.getWikiCatalogs();
      });
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      
      throw new ExportError(
        ExportErrorType.API_ERROR,
        `Failed to load wiki documents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Shows document selection dialog and returns user's selection
   */
  private async selectDocumentsForExport(catalogs: WikiCatalog[]): Promise<WikiCatalog[]> {
    try {
      return await this.documentSelector.showSelectionDialog(catalogs);
    } catch (error) {
      throw new ExportError(
        ExportErrorType.API_ERROR,
        `Failed to show document selection: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Shows export structure selection dialog
   */
  private async selectExportStructure(): Promise<ExportStructureType | undefined> {
    try {
      return await this.documentSelector.showExportStructureDialog();
    } catch (error) {
      throw new ExportError(
        ExportErrorType.API_ERROR,
        `Failed to show export structure selection: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Shows destination folder picker and returns selected path
   */
  private async selectExportDestination(): Promise<string> {
    try {
      const destination = await this.documentSelector.showDestinationPicker();
      
      if (!destination) {
        return '';
      }

      // Validate the selected destination
      if (!destination.trim()) {
        vscode.window.showErrorMessage('Invalid destination folder selected.');
        return '';
      }

      return destination;
    } catch (error) {
      throw new ExportError(
        ExportErrorType.FILE_SYSTEM_ERROR,
        `Failed to select export destination: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Executes the export operation with VSCode progress reporting
   */
  private async executeExportWithProgress(
    documents: WikiCatalog[],
    destination: string,
    exportStructure: ExportStructureType,
    originalCatalogs: WikiCatalog[]
  ): Promise<void> {
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting Qoder Wiki Documentation',
      cancellable: true
    }, async (progress, token) => {
      // Create progress callback for the export service
      const progressCallback = (progressInfo: ProgressInfo) => {
        const increment = progressInfo.percentage - (progress as any).lastReported || 0;
        (progress as any).lastReported = progressInfo.percentage;
        
        progress.report({
          increment,
          message: progressInfo.currentDocument
        });
      };

      // Initialize progress tracking
      (progress as any).lastReported = 0;
      
      try {
        return await this.exportService.exportDocuments(
          documents,
          destination,
          exportStructure,
          progressCallback,
          token,
          originalCatalogs
        );
      } catch (error) {
        // Handle cancellation
        if (token.isCancellationRequested) {
          throw new ExportError(
            ExportErrorType.USER_CANCELLED,
            'Export operation was cancelled by user'
          );
        }
        throw error;
      }
    });

    // Handle export results
    await this.handleExportResult(result, destination);
  }

  /**
   * Handles and displays export results to the user
   */
  private async handleExportResult(result: ExportResult, destination: string): Promise<void> {
    this.errorHandler.logInfo('Handling export result', {
      success: result.success,
      exportedCount: result.exportedCount,
      failedCount: result.failedCount,
      errorCount: result.errors.length
    });

    if (result.success && result.exportedCount > 0) {
      // Successful export
      this.notificationService.showExportSuccess(result);
      
    } else if (result.exportedCount === 0 && result.failedCount === 0) {
      // No documents to export
      this.notificationService.showQuickInfo('No documents were available for export.');
      
    } else if (result.exportedCount > 0 && result.failedCount > 0) {
      // Partial success
      this.notificationService.showPartialSuccess(result);
      
    } else {
      // Complete failure
      this.notificationService.showExportFailure(result);
    }
  }



  /**
   * Handles and displays export errors to the user
   */
  private async handleExportError(error: unknown): Promise<void> {
    if (error instanceof ExportError && error.type === ExportErrorType.USER_CANCELLED) {
      // Don't show error for user cancellation
      this.errorHandler.logInfo('Export cancelled by user');
      return;
    }

    // The error has already been handled by the ErrorHandler in most cases
    // This is just for any remaining edge cases or to provide retry functionality
    
    let actions: string[] = [];

    if (error instanceof ExportError) {
      switch (error.type) {
        case ExportErrorType.QODER_NOT_AVAILABLE:
          actions = ['Open Extensions'];
          break;
          
        case ExportErrorType.AUTHENTICATION_FAILED:
          actions = ['Retry'];
          break;
          
        case ExportErrorType.API_ERROR:
        case ExportErrorType.FILE_SYSTEM_ERROR:
        case ExportErrorType.CONVERSION_ERROR:
        default:
          actions = ['Retry', 'View Log'];
          break;
      }
    } else {
      actions = ['Retry', 'View Log'];
    }

    // Show a simple retry option since detailed error handling is done elsewhere
    const action = await vscode.window.showErrorMessage(
      'Export operation failed. Check the output log for details.',
      ...actions
    );
    
    if (action === 'Open Extensions') {
      vscode.commands.executeCommand('workbench.view.extensions');
    } else if (action === 'Retry') {
      // Retry the export operation
      setTimeout(() => this.execute(), 1000);
    } else if (action === 'View Log') {
      this.errorHandler.showOutputChannel();
    }
  }

  /**
   * Disposes of resources used by the export command.
   */
  public dispose(): void {
    this.errorHandler.dispose();
    this.exportService.dispose();
    this.qoderApiService.dispose();
  }
}

/**
 * Factory function to create and execute the export command
 * This is the main entry point called by the extension activation
 */
export async function executeExportCommand(): Promise<void> {
  const exportCommand = new ExportCommand();
  await exportCommand.execute();
}