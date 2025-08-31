import * as vscode from "vscode";
import {
  QoderApiService,
  WikiCatalog,
  WikiDocument,
  QoderApi,
  QoderApiResponse,
  ExportError,
  ExportErrorType,
} from "../../types/qoder";
import { ErrorHandler } from "./errorHandler";

/**
 * Service for integrating with the Qoder extension API
 * Provides methods to check availability, authentication status, and retrieve wiki content
 */
export class QoderApiServiceImpl implements QoderApiService {
  private static readonly QODER_EXTENSION_ID = "aicoding.aicoding-agent";
  private qoderApi: QoderApi | null = null;
  private errorHandler: ErrorHandler;

  constructor(errorHandler?: ErrorHandler) {
    this.errorHandler = errorHandler || new ErrorHandler();
  }

  /**
   * Check if the Qoder extension is available and activated
   * @returns true if Qoder extension is available, false otherwise
   */
  isQoderAvailable(): boolean {
    try {
      const qoderExtension = vscode.extensions.getExtension(
        QoderApiServiceImpl.QODER_EXTENSION_ID
      );

      if (!qoderExtension) {
        this.errorHandler.logInfo("Qoder extension not found");
        return false;
      }

      if (!qoderExtension.isActive) {
        this.errorHandler.logInfo("Qoder extension found but not active");
        return false;
      }

      // Log detailed information about the extension
      this.errorHandler.logInfo(`Extension found: ${qoderExtension.id}, Active: ${qoderExtension.isActive}`);
      
      // Access the exports directly
      const exports = qoderExtension.exports;
      this.errorHandler.logInfo(`Extension exports: ${exports ? Object.keys(exports).join(', ') : 'none'}`);
      
      if (!exports) {
        this.errorHandler.logWarning("Extension exports is null or undefined");
        return false;
      }

      // Check for required exports: repoWiki and auth
      if (!exports.repoWiki || !exports.auth) {
        this.errorHandler.logWarning(
          `Qoder extension missing required exports. Available: ${Object.keys(exports).join(', ')}, Required: repoWiki, auth`
        );
        return false;
      }

      // Create a qoderApi-like object from the direct exports
      this.qoderApi = {
        repoWiki: exports.repoWiki,
        auth: exports.auth
      };
      
      this.errorHandler.logInfo("Qoder extension API successfully accessed with repoWiki and auth exports");
      return true;
    } catch (error) {
      this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        "Checking Qoder extension availability",
        false
      );
      return false;
    }
  }

  /**
   * Check if the user is logged in to Qoder
   * @returns Promise<boolean> true if user is logged in, false otherwise
   * @throws ExportError if Qoder is not available or API call fails
   */
  async isUserLoggedIn(): Promise<boolean> {
    if (!this.isQoderAvailable()) {
      const error = new ExportError(
        ExportErrorType.QODER_NOT_AVAILABLE,
        "Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated."
      );
      this.errorHandler.handleError(error, "Authentication check", false);
      throw error;
    }

    try {
      if (!this.qoderApi?.auth?.isLogin) {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          "Qoder API auth methods are not available. Please check your Qoder extension version."
        );
        this.errorHandler.handleError(error, "Authentication API check", false);
        throw error;
      }

      const isLoggedIn = this.qoderApi.auth.isLogin();
      this.errorHandler.logInfo(
        `User authentication status: ${
          isLoggedIn ? "logged in" : "not logged in"
        }`
      );
      return isLoggedIn;
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }

      // Determine specific error type based on error message
      let errorType = ExportErrorType.AUTHENTICATION_FAILED;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
        errorType = ExportErrorType.NETWORK_ERROR;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorType = ExportErrorType.TIMEOUT_ERROR;
      }

      const authError = new ExportError(
        errorType,
        `Failed to check authentication status: ${errorMessage}`
      );
      this.errorHandler.handleError(
        authError,
        "Authentication status check",
        false
      );
      throw authError;
    }
  }

  /**
   * Retrieve all wiki catalogs from Qoder
   * @returns Promise<WikiCatalog[]> array of wiki catalogs
   * @throws ExportError if Qoder is not available, user not logged in, or API call fails
   */
  async getWikiCatalogs(): Promise<WikiCatalog[]> {
    if (!this.isQoderAvailable()) {
      const error = new ExportError(
        ExportErrorType.QODER_NOT_AVAILABLE,
        "Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated."
      );
      this.errorHandler.handleError(error, "Wiki catalogs retrieval", false);
      throw error;
    }

    try {
      const isLoggedIn = await this.isUserLoggedIn();
      if (!isLoggedIn) {
        const error = new ExportError(
          ExportErrorType.AUTHENTICATION_FAILED,
          "User is not logged in to Qoder. Please log in to access wiki catalogs."
        );
        this.errorHandler.handleError(
          error,
          "Wiki catalogs authentication",
          false
        );
        throw error;
      }

      if (!this.qoderApi?.repoWiki?.getWikiCatalogs) {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          "Qoder API repoWiki methods are not available. Please check your Qoder extension version."
        );
        this.errorHandler.handleError(
          error,
          "Wiki catalogs API availability",
          false
        );
        throw error;
      }

      this.errorHandler.logInfo("Retrieving wiki catalogs from Qoder API");
      const response: QoderApiResponse<WikiCatalog[]> = await this.qoderApi.repoWiki.getWikiCatalogs();

      // Add debugging logs
      console.log("Raw API response:", JSON.stringify(response, null, 2));
      this.errorHandler.logInfo(`Raw API response type: ${typeof response}`);
      this.errorHandler.logInfo(`Raw API response keys: ${response ? Object.keys(response).join(', ') : 'none'}`);

      // The API returns an object with a Result property containing the array
      if (!response || typeof response !== "object") {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid response format from getWikiCatalogs API call. Expected object, got ${typeof response}`
        );
        this.errorHandler.handleError(
          error,
          "Wiki catalogs response validation",
          false
        );
        throw error;
      }

      // Extract catalogs from Result property
      const catalogs = response.Result;
      
      if (!Array.isArray(catalogs)) {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid Result format from getWikiCatalogs API call. Expected array, got ${typeof catalogs}. Response structure: ${Object.keys(response).join(', ')}`
        );
        this.errorHandler.handleError(
          error,
          "Wiki catalogs result validation",
          false
        );
        throw error;
      }

      this.errorHandler.logInfo(
        `Successfully retrieved ${catalogs.length} wiki catalogs from Result property`
      );
      console.log("Extracted catalogs:", JSON.stringify(catalogs, null, 2));
      return catalogs;
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }

      // Determine specific error type based on error message
      let errorType = ExportErrorType.API_ERROR;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
        errorType = ExportErrorType.NETWORK_ERROR;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorType = ExportErrorType.TIMEOUT_ERROR;
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorType = ExportErrorType.RATE_LIMIT_ERROR;
      }

      const apiError = new ExportError(
        errorType,
        `Failed to retrieve wiki catalogs: ${errorMessage}`
      );
      this.errorHandler.handleError(apiError, "Wiki catalogs retrieval", false);
      throw apiError;
    }
  }

  /**
   * Retrieve wiki content for a specific document
   * @param documentId - The ID of the document to retrieve
   * @returns Promise<WikiDocument> the wiki document with content
   * @throws ExportError if Qoder is not available, user not logged in, or API call fails
   */
  async getWikiContent(documentId: string): Promise<WikiDocument> {
    if (!documentId || typeof documentId !== "string") {
      const error = new ExportError(
        ExportErrorType.API_ERROR,
        "Invalid document ID provided. Document ID must be a non-empty string."
      );
      this.errorHandler.handleError(
        error,
        "Wiki content input validation",
        false
      );
      throw error;
    }

    if (!this.isQoderAvailable()) {
      const error = new ExportError(
        ExportErrorType.QODER_NOT_AVAILABLE,
        "Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated."
      );
      this.errorHandler.handleError(
        error,
        `Wiki content retrieval for ${documentId}`,
        false
      );
      throw error;
    }

    try {
      const isLoggedIn = await this.isUserLoggedIn();
      if (!isLoggedIn) {
        const error = new ExportError(
          ExportErrorType.AUTHENTICATION_FAILED,
          "User is not logged in to Qoder. Please log in to access wiki content."
        );
        this.errorHandler.handleError(
          error,
          `Wiki content authentication for ${documentId}`,
          false
        );
        throw error;
      }

      if (!this.qoderApi?.repoWiki?.getWikiContent) {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          "Qoder API repoWiki methods are not available. Please check your Qoder extension version."
        );
        this.errorHandler.handleError(
          error,
          `Wiki content API availability for ${documentId}`,
          false
        );
        throw error;
      }

      this.errorHandler.logInfo(
        `Retrieving wiki content for document: ${documentId}`
      );
      const response: QoderApiResponse<any> = await this.qoderApi.repoWiki.getWikiContent(documentId);

      // Add debugging logs
      console.log(`Raw getWikiContent response for ${documentId}:`, JSON.stringify(response, null, 2));
      this.errorHandler.logInfo(`getWikiContent response type: ${typeof response}`);
      this.errorHandler.logInfo(`getWikiContent response keys: ${response ? Object.keys(response).join(', ') : 'none'}`);

      if (!response || typeof response !== "object") {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid response format from getWikiContent API call for document ID: ${documentId}. Expected object, got ${typeof response}`
        );
        this.errorHandler.handleError(
          error,
          `Wiki content response validation for ${documentId}`,
          false
        );
        throw error;
      }

      // Extract document from Result property
      const document = response.Result;
      
      if (!document || typeof document !== "object") {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid Result format from getWikiContent API call for document ID: ${documentId}. Expected object, got ${typeof document}. Response structure: ${Object.keys(response).join(', ')}`
        );
        this.errorHandler.handleError(
          error,
          `Wiki content result validation for ${documentId}`,
          false
        );
        throw error;
      }

      // Validate required properties - adjust based on actual API structure
      if (!document.content || typeof document.content !== "string") {
        console.log(`Document structure for ${documentId}:`, JSON.stringify(document, null, 2));
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid document structure returned for document ID: ${documentId}. Missing or invalid content property. Available properties: ${Object.keys(document).join(', ')}`
        );
        this.errorHandler.handleError(
          error,
          `Wiki content structure validation for ${documentId}`,
          false
        );
        throw error;
      }

      // Create a normalized WikiDocument structure
      const normalizedDocument = {
        id: documentId,
        name: document.name || `Document ${documentId}`,
        content: document.content
      };

      this.errorHandler.logInfo(
        `Successfully retrieved wiki content for document: ${normalizedDocument.name} (${documentId})`
      );
      console.log(`Normalized document for ${documentId}:`, JSON.stringify(normalizedDocument, null, 2));
      return normalizedDocument;
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }

      // Determine specific error type based on error message
      let errorType = ExportErrorType.API_ERROR;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
        errorType = ExportErrorType.NETWORK_ERROR;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorType = ExportErrorType.TIMEOUT_ERROR;
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorType = ExportErrorType.RATE_LIMIT_ERROR;
      } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        errorType = ExportErrorType.DOCUMENT_NOT_FOUND;
      }

      const apiError = new ExportError(
        errorType,
        `Failed to retrieve wiki content for document ${documentId}: ${errorMessage}`
      );
      this.errorHandler.handleError(
        apiError,
        `Wiki content retrieval for ${documentId}`,
        false
      );
      throw apiError;
    }
  }

  /**
   * Disposes of resources used by the API service.
   */
  public dispose(): void {
    this.errorHandler.dispose();
  }
}
