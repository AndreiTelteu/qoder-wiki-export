import * as vscode from "vscode";
import {
  QoderApiService,
  WikiCatalog,
  WikiDocument,
  QoderApi,
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

      // Try to access the qoderApi from the extension's exports
      const exports = qoderExtension.exports;
      if (!exports || !exports.qoderApi) {
        this.errorHandler.logWarning(
          "Qoder extension active but qoderApi not available in exports"
        );
        return false;
      }

      this.qoderApi = exports.qoderApi;
      this.errorHandler.logInfo("Qoder extension API successfully accessed");
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
      const catalogs = await this.qoderApi.repoWiki.getWikiCatalogs();

      if (!Array.isArray(catalogs)) {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          "Invalid response format from getWikiCatalogs API call."
        );
        this.errorHandler.handleError(
          error,
          "Wiki catalogs response validation",
          false
        );
        throw error;
      }

      this.errorHandler.logInfo(
        `Successfully retrieved ${catalogs.length} wiki catalogs`
      );
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
      const document = await this.qoderApi.repoWiki.getWikiContent(documentId);

      if (!document || typeof document !== "object") {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid response format from getWikiContent API call for document ID: ${documentId}`
        );
        this.errorHandler.handleError(
          error,
          `Wiki content response validation for ${documentId}`,
          false
        );
        throw error;
      }

      // Validate required properties
      if (
        !document.id ||
        !document.name ||
        typeof document.content !== "string"
      ) {
        const error = new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid document structure returned for document ID: ${documentId}. Missing required properties.`
        );
        this.errorHandler.handleError(
          error,
          `Wiki content structure validation for ${documentId}`,
          false
        );
        throw error;
      }

      this.errorHandler.logInfo(
        `Successfully retrieved wiki content for document: ${document.name} (${documentId})`
      );
      return document;
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
