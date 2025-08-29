# Design Document

## Overview

The Qoder Wiki Export extension will be a standalone VSCode extension that integrates with the existing Qoder extension to provide export functionality for generated repository documentation. The extension will follow VSCode extension best practices and provide a clean, intuitive interface for exporting wiki content in multiple formats.

## Architecture

### Extension Structure
```
qoder-wiki-export/
├── src/
│   ├── extension.ts           # Main extension entry point
│   ├── commands/
│   │   ├── exportCommand.ts   # Export command implementation
│   │   └── index.ts          # Command registry
│   ├── services/
│   │   ├── qoderApiService.ts # Qoder API integration
│   │   ├── exportService.ts   # Core export logic
│   │   └── fileService.ts     # File system operations
│   ├── exporters/
│   │   └── markdownExporter.ts # Markdown export implementation
│   ├── ui/
│   │   ├── documentSelector.ts # Document selection interface
│   │   └── progressReporter.ts # Progress tracking UI
│   └── types/
│       └── qoder.ts           # Type definitions for Qoder API
├── package.json
├── tsconfig.json
└── README.md
```

### Key Design Principles
1. **Separation of Concerns**: Clear separation between API integration, export logic, and UI components
2. **Simplicity**: Focus on Markdown export to provide immediate value with minimal complexity
3. **Error Resilience**: Graceful handling of API failures and partial exports
4. **User Experience**: Progress feedback and clear error messages

## Components and Interfaces

### QoderApiService
Handles integration with the Qoder extension API.

```typescript
interface QoderApiService {
  isQoderAvailable(): boolean;
  isUserLoggedIn(): Promise<boolean>;
  getWikiCatalogs(): Promise<WikiCatalog[]>;
  getWikiContent(documentId: string): Promise<WikiDocument>;
}

interface WikiCatalog {
  id: string;
  name: string;
  status: 'completed' | 'failed' | 'generating' | 'unknown';
  subCatalog?: WikiCatalog[];
}

interface WikiDocument {
  id: string;
  name: string;
  content: string;
  status: string;
}
```

### ExportService
Orchestrates the export process and coordinates between different components.

```typescript
interface ExportService {
  exportDocuments(
    documents: WikiCatalog[],
    destination: string,
    progressCallback?: ProgressCallback
  ): Promise<ExportResult>;
}

interface ExportResult {
  success: boolean;
  exportedCount: number;
  failedCount: number;
  errors: ExportError[];
  outputPath: string;
}
```

### MarkdownExporter
Handles the export of wiki documents to Markdown files.

```typescript
interface MarkdownExporter {
  export(
    documents: WikiDocument[],
    destination: string,
    options?: MarkdownExportOptions
  ): Promise<ExportResult>;
}

interface MarkdownExportOptions {
  preserveHierarchy: boolean;
  includeTableOfContents: boolean;
  createIndexFile: boolean;
}
```

### Document Selection UI
Provides an interface for users to select which documents to export.

```typescript
interface DocumentSelector {
  showSelectionDialog(catalogs: WikiCatalog[]): Promise<WikiCatalog[]>;
  showDestinationPicker(): Promise<string>;
}
```

## Data Models

### WikiCatalog Hierarchy
The system will work with hierarchical wiki catalogs that mirror the structure from the Qoder API:

```typescript
interface WikiCatalogNode {
  id: string;
  name: string;
  path: string;
  status: DocumentStatus;
  children?: WikiCatalogNode[];
  parent?: WikiCatalogNode;
}

type DocumentStatus = 'completed' | 'failed' | 'generating' | 'paused' | 'unknown';
```

### Export Configuration
User preferences and export settings:

```typescript
interface ExportConfiguration {
  destination: string;
  selectedDocuments: string[]; // Document IDs
  options: MarkdownExportOptions;
  overwriteExisting: boolean;
}
```

## Error Handling

### Error Types
```typescript
enum ExportErrorType {
  QODER_NOT_AVAILABLE = 'qoder_not_available',
  AUTHENTICATION_FAILED = 'authentication_failed',
  API_ERROR = 'api_error',
  FILE_SYSTEM_ERROR = 'file_system_error',
  CONVERSION_ERROR = 'conversion_error',
  USER_CANCELLED = 'user_cancelled'
}

interface ExportError {
  type: ExportErrorType;
  message: string;
  documentId?: string;
  details?: any;
}
```

### Error Handling Strategy
1. **Graceful Degradation**: Continue processing remaining documents when individual documents fail
2. **User Feedback**: Clear error messages with actionable suggestions
3. **Retry Logic**: Automatic retry for transient network errors
4. **Logging**: Comprehensive logging for debugging purposes

## Testing Strategy

### Unit Tests
- **QoderApiService**: Mock Qoder API responses and test error handling
- **MarkdownExporter**: Test Markdown export with sample wiki content
- **FileService**: Test file system operations with temporary directories
- **ExportService**: Test orchestration logic and error aggregation

### Integration Tests
- **End-to-End Export**: Test complete export workflow with mock Qoder extension
- **Markdown Validation**: Verify exported Markdown files are valid and properly formatted
- **Error Scenarios**: Test behavior when Qoder extension is unavailable or API fails

### Manual Testing Scenarios
1. Export single document as Markdown
2. Export complete wiki catalog with nested structure
3. Handle authentication errors and re-authentication
4. Test progress reporting with large document sets
5. Verify file overwrite behavior and user prompts

## Implementation Details

### Extension Activation
The extension will activate when:
1. User executes export command from command palette
2. User right-clicks in explorer and selects export option (if applicable)

### Command Registration
```typescript
// Commands to register in package.json
{
  "commands": [
    {
      "command": "qoderWikiExport.exportWiki",
      "title": "Export Qoder Wiki Documentation",
      "category": "Qoder Wiki Export"
    },
    {
      "command": "qoderWikiExport.exportSelected",
      "title": "Export Selected Wiki Documents",
      "category": "Qoder Wiki Export"
    }
  ]
}
```

### Progress Reporting
Use VSCode's built-in progress API to show export progress:
```typescript
vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Exporting Qoder Wiki Documentation",
  cancellable: true
}, async (progress, token) => {
  // Export implementation with progress updates
});
```

### File Organization
Exported files will maintain the hierarchical structure:
```
exported-wiki/
├── README.md                    # Overview document
├── Architecture/
│   ├── system-overview.md
│   └── component-design.md
├── API/
│   ├── endpoints.md
│   └── authentication.md
└── index.html                   # Navigation index (for HTML export)
```

### Markdown Export Features
- Preserve original markdown formatting and syntax
- Maintain file links and cross-references between documents
- Create directory structure matching wiki catalog hierarchy
- Generate index file with navigation links to all exported documents
- Handle special characters and ensure valid filenames
- Preserve code blocks, tables, and other markdown elements

This design provides a solid foundation for implementing the Qoder Wiki Export extension while maintaining flexibility for future enhancements and ensuring a good user experience.