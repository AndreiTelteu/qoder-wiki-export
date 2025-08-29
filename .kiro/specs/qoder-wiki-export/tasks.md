# Implementation Plan

- [x] 1. Set up VSCode extension project structure and configuration






  - Create package.json with extension metadata, dependencies, and command definitions
  - Set up TypeScript configuration with appropriate compiler options
  - Create basic directory structure for src/, types/
  - _Requirements: 1.3_

- [ ] 2. Implement core type definitions and interfaces

  - Create types/qoder.ts with WikiCatalog, WikiDocument, and API response interfaces
  - Define ExportResult, ExportError, and configuration interfaces
  - Add TypeScript definitions for VSCode extension API usage
  - _Requirements: 1.1, 2.1, 2.2_

- [ ] 3. Create QoderApiService for integration with Qoder extension

  - Implement isQoderAvailable() method to check for Qoder extension presence
  - Create isUserLoggedIn() method using qoderApi.auth.isLogin()
  - Implement getWikiCatalogs() method using qoderApi.repoWiki.getWikiCatalogs()
  - Add getWikiContent() method using qoderApi.repoWiki.getWikiContent(id)
  - Include proper error handling and type safety for all API calls
  - _Requirements: 1.1, 1.2, 2.1, 6.1, 6.2_

- [ ] 4. Implement FileService for file system operations

  - Create methods for directory creation and file writing operations
  - Implement file existence checking and overwrite confirmation logic
  - Add filename sanitization for special characters and invalid names
  - Create utility methods for path manipulation and directory structure creation
  - _Requirements: 4.2, 4.3, 4.4_

- [ ] 5. Create MarkdownExporter for document export functionality

  - Implement export() method that processes WikiDocument arrays
  - Add logic to preserve original markdown content and formatting
  - Create directory structure matching wiki catalog hierarchy
  - Implement cross-reference and file link handling for markdown format
  - Add index file generation with navigation links to all exported documents
  - _Requirements: 2.3, 3.1, 3.2, 3.4, 3.5, 3.6_

- [ ] 6. Implement DocumentSelector UI for user interaction

  - Create showSelectionDialog() using VSCode QuickPick API for document selection
  - Implement hierarchical document tree display with checkboxes
  - Add showDestinationPicker() using VSCode folder selection dialog
  - Include filtering options to show only completed documents
  - _Requirements: 2.2, 2.5, 2.6, 4.1_

- [ ] 7. Create ExportService to orchestrate the export process

  - Implement exportDocuments() method that coordinates all export steps
  - Add progress tracking and callback functionality for UI updates
  - Create error aggregation and handling logic for partial exports
  - Implement retry logic for transient API failures
  - Add cleanup functionality for cancelled or failed exports
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.3, 6.4_

- [ ] 8. Implement main export command and extension activation

  - Create exportCommand.ts with command handler implementation
  - Add extension.ts with activation function and command registration
  - Implement progress reporting using VSCode's withProgress API
  - Add proper error handling and user notification for all error scenarios
  - Include authentication check and login prompts when needed
  - _Requirements: 1.3, 4.5, 5.5, 6.1, 6.5_

- [ ] 9. Add comprehensive error handling and user feedback

  - Implement specific error types for different failure scenarios
  - Create user-friendly error messages with actionable suggestions
  - Add logging functionality for debugging and troubleshooting
  - Implement graceful degradation when individual documents fail
  - _Requirements: 5.3, 6.2, 6.3, 6.4_

- [ ] 12. Finalize extension packaging and documentation
  - Update package.json with final command definitions and activation events
  - Ensure all TypeScript compilation and linting passes without errors
  - _Requirements: 1.3, 4.5_
