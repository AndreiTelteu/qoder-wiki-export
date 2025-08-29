import * as vscode from 'vscode';
import { ExportResult } from '../../types/qoder';

/**
 * Service for providing user notifications and feedback during export operations.
 * Handles success messages, progress updates, and user confirmations.
 */
export class NotificationService {
  
  /**
   * Shows a success notification for completed exports.
   * @param result - The export result to show success for
   */
  public showExportSuccess(result: ExportResult): void {
    const message = this.buildSuccessMessage(result);
    const actions = ['Open Folder', 'View Details'];
    
    vscode.window.showInformationMessage(message, ...actions).then(selectedAction => {
      if (selectedAction === 'Open Folder') {
        this.openExportFolder(result.outputPath);
      } else if (selectedAction === 'View Details') {
        this.showExportDetails(result);
      }
    });
  }

  /**
   * Shows a warning notification for exports with partial failures.
   * @param result - The export result with some failures
   */
  public showPartialSuccess(result: ExportResult): void {
    const message = this.buildPartialSuccessMessage(result);
    const actions = ['Open Folder', 'View Errors', 'Retry Failed'];
    
    vscode.window.showWarningMessage(message, ...actions).then(selectedAction => {
      if (selectedAction === 'Open Folder') {
        this.openExportFolder(result.outputPath);
      } else if (selectedAction === 'View Errors') {
        this.showExportDetails(result);
      } else if (selectedAction === 'Retry Failed') {
        vscode.window.showInformationMessage('Retry functionality would be implemented by the export service.');
      }
    });
  }

  /**
   * Shows a failure notification for completely failed exports.
   * @param result - The failed export result
   */
  public showExportFailure(result: ExportResult): void {
    const message = this.buildFailureMessage(result);
    const actions = ['View Details', 'Try Again'];
    
    vscode.window.showErrorMessage(message, ...actions).then(selectedAction => {
      if (selectedAction === 'View Details') {
        this.showExportDetails(result);
      } else if (selectedAction === 'Try Again') {
        vscode.commands.executeCommand('qoderWikiExport.exportWiki');
      }
    });
  }

  /**
   * Shows a confirmation dialog before overwriting existing files.
   * @param filePath - The path of the file that would be overwritten
   * @returns Promise<boolean> - true if user confirms overwrite, false otherwise
   */
  public async confirmOverwrite(filePath: string): Promise<boolean> {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const message = `The file "${fileName}" already exists. Do you want to overwrite it?`;
    const overwriteAction = 'Overwrite';
    const skipAction = 'Skip';
    const cancelAction = 'Cancel';
    
    const result = await vscode.window.showWarningMessage(
      message, 
      { modal: true }, 
      overwriteAction, 
      skipAction, 
      cancelAction
    );
    
    return result === overwriteAction;
  }

  /**
   * Shows a confirmation dialog for batch overwrite operations.
   * @param fileCount - Number of files that would be overwritten
   * @returns Promise<'overwrite' | 'skip' | 'cancel'> - User's choice
   */
  public async confirmBatchOverwrite(fileCount: number): Promise<'overwrite' | 'skip' | 'cancel'> {
    const message = `${fileCount} file${fileCount === 1 ? '' : 's'} already exist${fileCount === 1 ? 's' : ''} in the destination. What would you like to do?`;
    const overwriteAction = 'Overwrite All';
    const skipAction = 'Skip Existing';
    const cancelAction = 'Cancel Export';
    
    const result = await vscode.window.showWarningMessage(
      message, 
      { modal: true }, 
      overwriteAction, 
      skipAction, 
      cancelAction
    );
    
    switch (result) {
      case overwriteAction:
        return 'overwrite';
      case skipAction:
        return 'skip';
      default:
        return 'cancel';
    }
  }

  /**
   * Shows a progress notification with cancellation support.
   * @param title - Title for the progress notification
   * @param task - The task function to execute with progress reporting
   * @returns Promise with the task result
   */
  public async showProgressWithCancellation<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Promise<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true
      },
      task
    );
  }

  /**
   * Shows a simple progress notification without cancellation.
   * @param title - Title for the progress notification
   * @param task - The task function to execute with progress reporting
   * @returns Promise with the task result
   */
  public async showProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false
      },
      (progress) => task(progress)
    );
  }

  /**
   * Shows a status bar message temporarily.
   * @param message - Message to show in status bar
   * @param timeout - Timeout in milliseconds (default: 5000)
   */
  public showStatusMessage(message: string, timeout: number = 5000): void {
    const statusBarItem = vscode.window.setStatusBarMessage(message, timeout);
    
    // Clean up after timeout
    setTimeout(() => {
      statusBarItem.dispose();
    }, timeout);
  }

  /**
   * Shows a quick information message that auto-dismisses.
   * @param message - Message to show
   */
  public showQuickInfo(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  /**
   * Shows a quick warning message that auto-dismisses.
   * @param message - Warning message to show
   */
  public showQuickWarning(message: string): void {
    vscode.window.showWarningMessage(message);
  }

  /**
   * Builds a success message for completed exports.
   * @param result - The successful export result
   * @returns Formatted success message
   */
  private buildSuccessMessage(result: ExportResult): string {
    const docCount = result.exportedCount;
    const docWord = docCount === 1 ? 'document' : 'documents';
    
    return `Successfully exported ${docCount} ${docWord} to ${result.outputPath}`;
  }

  /**
   * Builds a partial success message for exports with some failures.
   * @param result - The export result with partial success
   * @returns Formatted partial success message
   */
  private buildPartialSuccessMessage(result: ExportResult): string {
    const successCount = result.exportedCount;
    const failCount = result.failedCount;
    const totalCount = successCount + failCount;
    
    return `Export completed: ${successCount}/${totalCount} documents exported successfully. ${failCount} failed.`;
  }

  /**
   * Builds a failure message for completely failed exports.
   * @param result - The failed export result
   * @returns Formatted failure message
   */
  private buildFailureMessage(result: ExportResult): string {
    const errorCount = result.errors.length;
    const primaryError = result.errors[0];
    
    if (errorCount === 1 && primaryError) {
      return `Export failed: ${primaryError.message}`;
    }
    
    return `Export failed with ${errorCount} error${errorCount === 1 ? '' : 's'}. Check the output log for details.`;
  }

  /**
   * Opens the export folder in the system file explorer.
   * @param folderPath - Path to the folder to open
   */
  private openExportFolder(folderPath: string): void {
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folderPath));
  }

  /**
   * Shows detailed export information in a new document.
   * @param result - The export result to show details for
   */
  private showExportDetails(result: ExportResult): void {
    const details = this.formatExportDetails(result);
    
    vscode.workspace.openTextDocument({
      content: details,
      language: 'markdown'
    }).then(doc => {
      vscode.window.showTextDocument(doc);
    });
  }

  /**
   * Formats export result details for display.
   * @param result - The export result to format
   * @returns Formatted details as markdown
   */
  private formatExportDetails(result: ExportResult): string {
    let details = '# Export Details\n\n';
    
    details += `**Status:** ${result.success ? 'Success' : 'Failed'}\n`;
    details += `**Output Path:** ${result.outputPath}\n`;
    details += `**Exported:** ${result.exportedCount} documents\n`;
    details += `**Failed:** ${result.failedCount} documents\n`;
    details += `**Total Errors:** ${result.errors.length}\n\n`;
    
    if (result.errors.length > 0) {
      details += '## Errors\n\n';
      
      result.errors.forEach((error, index) => {
        details += `### Error ${index + 1}\n\n`;
        details += `**Type:** ${error.type}\n`;
        details += `**Message:** ${error.message}\n`;
        
        if (error.documentId) {
          details += `**Document ID:** ${error.documentId}\n`;
        }
        
        if (error.details) {
          details += `**Details:**\n\`\`\`json\n${JSON.stringify(error.details, null, 2)}\n\`\`\`\n`;
        }
        
        details += '\n';
      });
    }
    
    details += `\n---\n*Generated on ${new Date().toISOString()}*\n`;
    
    return details;
  }
}