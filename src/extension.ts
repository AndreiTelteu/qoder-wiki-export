/**
 * Main extension entry point for Qoder Wiki Export
 * Handles extension activation, command registration, and lifecycle management
 */

import * as vscode from 'vscode';
import { executeExportCommand, ExportCommand } from './commands/exportCommand';
import { ErrorHandler } from './services/errorHandler';

// Global error handler for the extension
let globalErrorHandler: ErrorHandler | undefined;
let exportCommandInstance: ExportCommand | undefined;

/**
 * Extension activation function
 * Called when the extension is activated by VSCode
 * @param context - VSCode extension context
 */
export function activate(context: vscode.ExtensionContext) {
  try {
    globalErrorHandler = new ErrorHandler();
    globalErrorHandler.logInfo('Qoder Wiki Export extension is now active');

    // Create a single instance of the export command for resource management
    exportCommandInstance = new ExportCommand();

    // Register the main export command
    const exportCommand = vscode.commands.registerCommand(
      'qoderWikiExport.exportWiki',
      async () => {
        try {
          if (exportCommandInstance) {
            await exportCommandInstance.execute();
          } else {
            await executeExportCommand();
          }
        } catch (error) {
          if (globalErrorHandler) {
            globalErrorHandler.handleError(
              error instanceof Error ? error : new Error(String(error)),
              'Export command execution'
            );
          } else {
            console.error('Error executing export command:', error);
            const message = error instanceof Error 
              ? `Export command failed: ${error.message}`
              : 'Export command failed with an unknown error';
            vscode.window.showErrorMessage(message);
          }
        }
      }
    );

    // Register the export selected documents command (alias for main command)
    const exportSelectedCommand = vscode.commands.registerCommand(
      'qoderWikiExport.exportSelected',
      async () => {
        try {
          if (exportCommandInstance) {
            await exportCommandInstance.execute();
          } else {
            await executeExportCommand();
          }
        } catch (error) {
          if (globalErrorHandler) {
            globalErrorHandler.handleError(
              error instanceof Error ? error : new Error(String(error)),
              'Export selected command execution'
            );
          } else {
            console.error('Error executing export selected command:', error);
            const message = error instanceof Error 
              ? `Export command failed: ${error.message}`
              : 'Export command failed with an unknown error';
            vscode.window.showErrorMessage(message);
          }
        }
      }
    );

    // Add commands to extension subscriptions for proper cleanup
    context.subscriptions.push(exportCommand);
    context.subscriptions.push(exportSelectedCommand);

    // Register additional commands that might be useful
    registerUtilityCommands(context);

    // Add error handler to subscriptions for proper disposal
    if (globalErrorHandler) {
      context.subscriptions.push({
        dispose: () => globalErrorHandler?.dispose()
      });
    }

    // Add export command instance to subscriptions for proper disposal
    if (exportCommandInstance) {
      context.subscriptions.push({
        dispose: () => exportCommandInstance?.dispose()
      });
    }

    globalErrorHandler.logInfo('Qoder Wiki Export extension commands registered successfully');
    
  } catch (error) {
    console.error('Failed to activate Qoder Wiki Export extension:', error);
    vscode.window.showErrorMessage(
      `Failed to activate Qoder Wiki Export extension: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Registers additional utility commands for the extension
 * @param context - VSCode extension context
 */
function registerUtilityCommands(context: vscode.ExtensionContext) {
  // Command to check Qoder extension status
  const checkQoderStatusCommand = vscode.commands.registerCommand(
    'qoderWikiExport.checkQoderStatus',
    async () => {
      try {
        const { QoderApiServiceImpl } = await import('./services/qoderApiService');
        const qoderService = new QoderApiServiceImpl(globalErrorHandler);
        
        const isAvailable = qoderService.isQoderAvailable();
        
        if (!isAvailable) {
          vscode.window.showWarningMessage(
            'Qoder extension is not available or not activated. Please ensure it is installed and activated.',
            'Open Extensions'
          ).then(action => {
            if (action === 'Open Extensions') {
              vscode.commands.executeCommand('workbench.view.extensions');
            }
          });
          qoderService.dispose();
          return;
        }

        const isLoggedIn = await qoderService.isUserLoggedIn();
        
        if (isLoggedIn) {
          vscode.window.showInformationMessage('✅ Qoder is available and you are logged in. Ready to export!');
        } else {
          const action = await vscode.window.showWarningMessage(
            '⚠️ Qoder is available but you are not logged in. Please log in to export wiki documents.',
            'Login to Qoder'
          );
          
          if (action === 'Login to Qoder') {
            try {
              await vscode.commands.executeCommand('qoder.login');
            } catch (error) {
              vscode.window.showErrorMessage('Could not trigger Qoder login. Please log in manually.');
            }
          }
        }
        
        qoderService.dispose();
        
      } catch (error) {
        if (globalErrorHandler) {
          globalErrorHandler.handleError(
            error instanceof Error ? error : new Error(String(error)),
            'Qoder status check'
          );
        } else {
          console.error('Error checking Qoder status:', error);
          vscode.window.showErrorMessage(
            `Failed to check Qoder status: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
  );

  // Command to show extension information
  const showInfoCommand = vscode.commands.registerCommand(
    'qoderWikiExport.showInfo',
    () => {
      const message = `
Qoder Wiki Export Extension

This extension allows you to export documentation generated by the Qoder extension to various formats.

Features:
• Export individual documents or entire wiki catalogs
• Markdown format support with preserved formatting
• Hierarchical folder structure preservation
• Progress tracking for large exports
• Error handling and retry logic

Requirements:
• Qoder extension must be installed and activated
• You must be logged in to Qoder
• Wiki documentation must be generated in Qoder

Commands:
• Export Wiki Documentation: Main export command
• Check Qoder Status: Verify Qoder availability and login status
      `.trim();

      vscode.window.showInformationMessage(message, { modal: true });
    }
  );

  context.subscriptions.push(checkQoderStatusCommand);
  context.subscriptions.push(showInfoCommand);
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated by VSCode
 */
export function deactivate() {
  try {
    if (globalErrorHandler) {
      globalErrorHandler.logInfo('Qoder Wiki Export extension is being deactivated');
    } else {
      console.log('Qoder Wiki Export extension is being deactivated');
    }
    
    // Dispose of resources manually if needed
    // Note: VSCode automatically disposes of registered commands and subscriptions
    // but we want to ensure proper cleanup of our services
    
    if (exportCommandInstance) {
      exportCommandInstance.dispose();
      exportCommandInstance = undefined;
    }
    
    if (globalErrorHandler) {
      globalErrorHandler.logInfo('Qoder Wiki Export extension deactivated successfully');
      globalErrorHandler.dispose();
      globalErrorHandler = undefined;
    } else {
      console.log('Qoder Wiki Export extension deactivated successfully');
    }
    
  } catch (error) {
    console.error('Error during extension deactivation:', error);
  }
}