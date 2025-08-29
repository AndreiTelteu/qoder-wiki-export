/**
 * DocumentSelector UI for user interaction
 * Provides interfaces for document selection and destination picking
 */

import * as vscode from 'vscode';
import { WikiCatalog, DocumentStatus, DocumentSelector as IDocumentSelector } from '../../types/qoder';

interface DocumentQuickPickItem extends vscode.QuickPickItem {
  catalog: WikiCatalog;
  level: number;
  isParent: boolean;
}

export class DocumentSelector implements IDocumentSelector {
  
  /**
   * Shows a hierarchical document selection dialog using VSCode QuickPick API
   * @param catalogs Array of wiki catalogs to display
   * @returns Promise resolving to selected catalogs
   */
  async showSelectionDialog(catalogs: WikiCatalog[]): Promise<WikiCatalog[]> {
    if (!catalogs || catalogs.length === 0) {
      vscode.window.showWarningMessage('No wiki documents available for export.');
      return [];
    }

    // Create quick pick items from catalog hierarchy
    const items = this.createQuickPickItems(catalogs);
    
    // Filter to show only completed documents by default
    const completedItems = items.filter(item => 
      item.catalog.status === 'completed' || item.isParent
    );

    const quickPick = vscode.window.createQuickPick<DocumentQuickPickItem>();
    quickPick.title = 'Select Wiki Documents to Export';
    quickPick.placeholder = 'Choose documents to export (use checkboxes to select multiple)';
    quickPick.canSelectMany = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    
    // Add filter buttons
    quickPick.buttons = [
      {
        iconPath: new vscode.ThemeIcon('filter'),
        tooltip: 'Show All Documents'
      },
      {
        iconPath: new vscode.ThemeIcon('check'),
        tooltip: 'Show Only Completed Documents'
      }
    ];

    let showingAll = false;
    quickPick.items = completedItems;

    return new Promise((resolve, reject) => {
      // Handle button clicks for filtering
      quickPick.onDidTriggerButton((button) => {
        if (button.tooltip === 'Show All Documents') {
          showingAll = true;
          quickPick.items = items;
          quickPick.title = 'Select Wiki Documents to Export (All Documents)';
        } else if (button.tooltip === 'Show Only Completed Documents') {
          showingAll = false;
          quickPick.items = completedItems;
          quickPick.title = 'Select Wiki Documents to Export (Completed Only)';
        }
      });

      quickPick.onDidAccept(() => {
        const selectedItems = quickPick.selectedItems;
        if (selectedItems.length === 0) {
          vscode.window.showWarningMessage('No documents selected for export.');
          resolve([]);
        } else {
          // Extract catalogs from selected items, excluding parent items
          const selectedCatalogs = selectedItems
            .filter(item => !item.isParent)
            .map(item => item.catalog);
          resolve(selectedCatalogs);
        }
        quickPick.dispose();
      });

      quickPick.onDidHide(() => {
        resolve([]);
        quickPick.dispose();
      });

      quickPick.show();
    });
  }

  /**
   * Shows a folder selection dialog for choosing export destination
   * @returns Promise resolving to selected folder path
   */
  async showDestinationPicker(): Promise<string> {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      canSelectFiles: false,
      canSelectFolders: true,
      openLabel: 'Select Export Destination',
      title: 'Choose folder to export wiki documents'
    };

    const result = await vscode.window.showOpenDialog(options);
    
    if (result && result.length > 0) {
      return result[0]?.fsPath || '';
    }
    
    return '';
  }

  /**
   * Creates hierarchical QuickPick items from wiki catalogs
   * @param catalogs Array of wiki catalogs
   * @param level Current nesting level for indentation
   * @returns Array of QuickPickItem objects
   */
  private createQuickPickItems(catalogs: WikiCatalog[], level: number = 0): DocumentQuickPickItem[] {
    const items: DocumentQuickPickItem[] = [];

    for (const catalog of catalogs) {
      const indent = '  '.repeat(level);
      const hasChildren = catalog.subCatalog && catalog.subCatalog.length > 0;
      
      // Create item for current catalog
      const item: DocumentQuickPickItem = {
        label: `${indent}${hasChildren ? '📁' : '📄'} ${catalog.name}`,
        description: this.getStatusDescription(catalog.status),
        detail: hasChildren ? `Contains ${this.countDocuments(catalog)} documents` : catalog.id,
        catalog: catalog,
        level: level,
        isParent: hasChildren ? !this.isLeafDocument(catalog) : false
      };

      // Add status icon to label based on document status
      item.label = `${indent}${this.getStatusIcon(catalog.status)} ${catalog.name}`;
      
      items.push(item);

      // Recursively add sub-catalogs
      if (catalog.subCatalog && catalog.subCatalog.length > 0) {
        const subItems = this.createQuickPickItems(catalog.subCatalog, level + 1);
        items.push(...subItems);
      }
    }

    return items;
  }

  /**
   * Gets a descriptive status text for display
   * @param status Document status
   * @returns Human-readable status description
   */
  private getStatusDescription(status: DocumentStatus): string {
    switch (status) {
      case 'completed':
        return 'Ready to export';
      case 'failed':
        return 'Generation failed';
      case 'generating':
        return 'Currently generating';
      case 'paused':
        return 'Generation paused';
      case 'unknown':
      default:
        return 'Status unknown';
    }
  }

  /**
   * Gets an appropriate icon for the document status
   * @param status Document status
   * @returns Icon string for display
   */
  private getStatusIcon(status: DocumentStatus): string {
    switch (status) {
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'generating':
        return '⏳';
      case 'paused':
        return '⏸️';
      case 'unknown':
      default:
        return '❓';
    }
  }

  /**
   * Counts total number of documents in a catalog (including sub-catalogs)
   * @param catalog Wiki catalog to count
   * @returns Total document count
   */
  private countDocuments(catalog: WikiCatalog): number {
    let count = this.isLeafDocument(catalog) ? 1 : 0;
    
    if (catalog.subCatalog) {
      for (const subCatalog of catalog.subCatalog) {
        count += this.countDocuments(subCatalog);
      }
    }
    
    return count;
  }

  /**
   * Determines if a catalog represents a leaf document (no sub-catalogs or empty sub-catalogs)
   * @param catalog Wiki catalog to check
   * @returns True if this is a leaf document
   */
  private isLeafDocument(catalog: WikiCatalog): boolean {
    return !catalog.subCatalog || catalog.subCatalog.length === 0;
  }
}