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
  ProgressInfo
} from '../../types/qoder';
import { ExportService } from '../services/exportService';
import { QoderApiServiceImpl } from '../services/qoderApiService';
import { DocumentSelector } from '../ui/documentSelector';

/**
 * Main export command handler that orchestrates the complete export workflow
 * Includes authentication checks, document selection, progress reporting, and error handling
 */
export class ExportCommand {
  private exportService: ExportService;
  private qoderApiService: QoderApiServiceImpl;
  private documentSelector: DocumentSelector;

  constructor(
    exportService?: ExportService,
    qoderApiService?: QoderApiServiceImpl,
    documentSelector?: DocumentSelector
  ) {
    this.qoderApiService = qoderApiService || new QoderApiServiceImpl();
    this.exportService = exportService || new ExportService(this.qoderApiService);
    this.documentSelector = documentSelector || new DocumentSelector();
  }

  /**
   * Executes the main export workflow
   * Handles all user interactions, progress reporting, and error scenarios
   */
  async execute(): Promise<void> {
    try {
      // Step 1: Check Qoder availability and authentication
      await this.validateQoderSetup();

      // Step 2: Retrieve available wiki catalogs
      const catalogs = await this.retrieveWikiCatalogs();
      if (!catalogs || catalogs.length === 0) {
        vscode.window.showInformationMessage(
          'No wiki documents found. Generate some documentation with Qoder first.'
        );
        return;
      }

      // Step 3: Let user select documents to export
      const selectedDocuments = await this.selectDocumentsForExport(catalogs);
      if (!selectedDocuments || selectedDocuments.length === 0) {
        // User cancelled or no documents selected
        return;
      }

      // Step 4: Let user choose export destination
      const destination = await this.selectExportDestination();
      if (!destination) {
        // User cancelled destination selection
        return;
      }

      // Step 5: Execute export with progress reporting
      await this.executeExportWithProgress(selectedDocuments, destination);

    } catch (error) {
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
    destination: string
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
          progressCallback,
          token
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
    if (result.success && result.exportedCount > 0) {
      // Successful export
      const message = `Successfully exported ${result.exportedCount} document${result.exportedCount === 1 ? '' : 's'} to ${destination}`;
      const action = await vscode.window.showInformationMessage(
        message,
        'Open Folder',
        'Show in Explorer'
      );
      
      if (action === 'Open Folder') {
        // Open the destination folder in VSCode
        const uri = vscode.Uri.file(destination);
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
      } else if (action === 'Show in Explorer') {
        // Reveal the folder in system file explorer
        const uri = vscode.Uri.file(destination);
        await vscode.commands.executeCommand('revealFileInOS', uri);
      }
      
    } else if (result.exportedCount === 0 && result.failedCount === 0) {
      // No documents to export
      vscode.window.showInformationMessage('No documents were available for export.');
      
    } else if (result.exportedCount > 0 && result.failedCount > 0) {
      // Partial success
      const message = `Export completed with warnings: ${result.exportedCount} succeeded, ${result.failedCount} failed.`;
      const action = await vscode.window.showWarningMessage(
        message,
        'View Details',
        'Open Folder'
      );
      
      if (action === 'View Details') {
        await this.showExportErrors(result.errors);
      } else if (action === 'Open Folder') {
        const uri = vscode.Uri.file(destination);
        await vscode.commands.executeCommand('revealFileInOS', uri);
      }
      
    } else {
      // Complete failure
      const message = `Export failed: ${result.failedCount} document${result.failedCount === 1 ? '' : 's'} could not be exported.`;
      const action = await vscode.window.showErrorMessage(
        message,
        'View Details'
      );
      
      if (action === 'View Details') {
        await this.showExportErrors(result.errors);
      }
    }
  }

  /**
   * Shows detailed error information to the user
   */
  private async showExportErrors(errors: ExportError[]): Promise<void> {
    if (!errors || errors.length === 0) {
      return;
    }

    // Create a summary of errors
    const errorSummary = errors.map((error, index) => {
      const documentInfo = error.documentId ? ` (Document: ${error.documentId})` : '';
      return `${index + 1}. ${error.message}${documentInfo}`;
    }).join('\n');

    const message = `Export Errors:\n\n${errorSummary}`;
    
    // Show in a new document for better readability
    const doc = await vscode.workspace.openTextDocument({
      content: message,
      language: 'plaintext'
    });
    
    await vscode.window.showTextDocument(doc);
  }

  /**
   * Handles and displays export errors to the user
   */
  private async handleExportError(error: unknown): Promise<void> {
    let message: string;
    let actions: string[] = [];

    if (error instanceof ExportError) {
      switch (error.type) {
        case ExportErrorType.QODER_NOT_AVAILABLE:
          message = error.message;
          actions = ['Open Extensions'];
          break;
          
        case ExportErrorType.AUTHENTICATION_FAILED:
          message = error.message;
          actions = ['Retry'];
          break;
          
        case ExportErrorType.USER_CANCELLED:
          // Don't show error for user cancellation
          return;
          
        case ExportErrorType.API_ERROR:
        case ExportErrorType.FILE_SYSTEM_ERROR:
        case ExportErrorType.CONVERSION_ERROR:
        default:
          message = `Export failed: ${error.message}`;
          actions = ['Retry'];
          break;
      }
    } else {
      message = `Export failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
      actions = ['Retry'];
    }

    const action = await vscode.window.showErrorMessage(message, ...actions);
    
    if (action === 'Open Extensions') {
      vscode.commands.executeCommand('workbench.view.extensions');
    } else if (action === 'Retry') {
      // Retry the export operation
      setTimeout(() => this.execute(), 1000);
    }
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