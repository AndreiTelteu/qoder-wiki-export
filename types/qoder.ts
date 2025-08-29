/**
 * Type definitions for Qoder Wiki Export extension
 * Defines interfaces for Qoder API integration, export functionality, and VSCode extension usage
 */

// Core Qoder API Types
export interface WikiCatalog {
  id: string;
  name: string;
  status: DocumentStatus;
  subCatalog?: WikiCatalog[];
}

export interface WikiDocument {
  id: string;
  name: string;
  content: string;
  status: string;
}

export type DocumentStatus = 'completed' | 'failed' | 'generating' | 'paused' | 'unknown';

// Hierarchical catalog structure for internal processing
export interface WikiCatalogNode {
  id: string;
  name: string;
  path: string;
  status: DocumentStatus;
  children?: WikiCatalogNode[];
  parent?: WikiCatalogNode;
}

// Export Result Types
export interface ExportResult {
  success: boolean;
  exportedCount: number;
  failedCount: number;
  errors: ExportError[];
  outputPath: string;
}

export interface ExportError {
  type: ExportErrorType;
  message: string;
  documentId?: string;
  details?: any;
}

export enum ExportErrorType {
  QODER_NOT_AVAILABLE = 'qoder_not_available',
  AUTHENTICATION_FAILED = 'authentication_failed',
  API_ERROR = 'api_error',
  FILE_SYSTEM_ERROR = 'file_system_error',
  CONVERSION_ERROR = 'conversion_error',
  USER_CANCELLED = 'user_cancelled'
}

// Configuration Types
export interface ExportConfiguration {
  destination: string;
  selectedDocuments: string[]; // Document IDs
  options: MarkdownExportOptions;
  overwriteExisting: boolean;
}

export interface MarkdownExportOptions {
  preserveHierarchy: boolean;
  includeTableOfContents: boolean;
  createIndexFile: boolean;
}

// Progress Callback Type
export type ProgressCallback = (progress: ProgressInfo) => void;

export interface ProgressInfo {
  currentDocument: string;
  completed: number;
  total: number;
  percentage: number;
}

// Service Interface Types
export interface QoderApiService {
  isQoderAvailable(): boolean;
  isUserLoggedIn(): Promise<boolean>;
  getWikiCatalogs(): Promise<WikiCatalog[]>;
  getWikiContent(documentId: string): Promise<WikiDocument>;
}

export interface ExportService {
  exportDocuments(
    documents: WikiCatalog[],
    destination: string,
    progressCallback?: ProgressCallback
  ): Promise<ExportResult>;
}

export interface MarkdownExporter {
  export(
    documents: WikiDocument[],
    destination: string,
    options?: MarkdownExportOptions
  ): Promise<ExportResult>;
}

export interface DocumentSelector {
  showSelectionDialog(catalogs: WikiCatalog[]): Promise<WikiCatalog[]>;
  showDestinationPicker(): Promise<string>;
}

export interface FileService {
  createDirectory(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  sanitizeFilename(filename: string): string;
}

// VSCode Extension API Types
export interface VSCodeProgressOptions {
  location: number; // vscode.ProgressLocation
  title: string;
  cancellable: boolean;
}

export interface VSCodeQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
  alwaysShow?: boolean;
}

export interface VSCodeQuickPickOptions {
  canPickMany?: boolean;
  ignoreFocusOut?: boolean;
  matchOnDescription?: boolean;
  matchOnDetail?: boolean;
  placeHolder?: string;
}

// Qoder Extension API Types (external dependency)
export interface QoderApi {
  auth: {
    isLogin(): boolean;
  };
  repoWiki: {
    getWikiCatalogs(): Promise<WikiCatalog[]>;
    getWikiContent(documentId: string): Promise<WikiDocument>;
  };
}

// Extension activation context
export interface ExtensionContext {
  subscriptions: any[];
  workspaceState: any;
  globalState: any;
  extensionPath: string;
}