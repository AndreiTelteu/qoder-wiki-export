import * as vscode from 'vscode';
import { QoderApiService, WikiCatalog, WikiDocument, QoderApi, ExportError, ExportErrorType } from '../../types/qoder';

/**
 * Service for integrating with the Qoder extension API
 * Provides methods to check availability, authentication status, and retrieve wiki content
 */
export class QoderApiServiceImpl implements QoderApiService {
  private static readonly QODER_EXTENSION_ID = 'aicoding.aicoding-agent';
  private qoderApi: QoderApi | null = null;

  /**
   * Check if the Qoder extension is available and activated
   * @returns true if Qoder extension is available, false otherwise
   */
  isQoderAvailable(): boolean {
    try {
      const qoderExtension = vscode.extensions.getExtension(QoderApiServiceImpl.QODER_EXTENSION_ID);
      
      if (!qoderExtension) {
        return false;
      }

      if (!qoderExtension.isActive) {
        return false;
      }

      // Try to access the qoderApi from the extension's exports
      const exports = qoderExtension.exports;
      if (!exports || !exports.qoderApi) {
        return false;
      }

      this.qoderApi = exports.qoderApi;
      return true;
    } catch (error) {
      console.error('Error checking Qoder extension availability:', error);
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
      throw new ExportError(
        ExportErrorType.QODER_NOT_AVAILABLE,
        'Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated.'
      );
    }

    try {
      if (!this.qoderApi?.auth?.isLogin) {
        throw new ExportError(
          ExportErrorType.API_ERROR,
          'Qoder API auth methods are not available. Please check your Qoder extension version.'
        );
      }

      const isLoggedIn = this.qoderApi.auth.isLogin();
      return isLoggedIn;
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      
      throw new ExportError(
        ExportErrorType.AUTHENTICATION_FAILED,
        `Failed to check authentication status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve all wiki catalogs from Qoder
   * @returns Promise<WikiCatalog[]> array of wiki catalogs
   * @throws ExportError if Qoder is not available, user not logged in, or API call fails
   */
  async getWikiCatalogs(): Promise<WikiCatalog[]> {
    if (!this.isQoderAvailable()) {
      throw new ExportError(
        ExportErrorType.QODER_NOT_AVAILABLE,
        'Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated.'
      );
    }

    try {
      const isLoggedIn = await this.isUserLoggedIn();
      if (!isLoggedIn) {
        throw new ExportError(
          ExportErrorType.AUTHENTICATION_FAILED,
          'User is not logged in to Qoder. Please log in to access wiki catalogs.'
        );
      }

      if (!this.qoderApi?.repoWiki?.getWikiCatalogs) {
        throw new ExportError(
          ExportErrorType.API_ERROR,
          'Qoder API repoWiki methods are not available. Please check your Qoder extension version.'
        );
      }

      const catalogs = await this.qoderApi.repoWiki.getWikiCatalogs();
      
      if (!Array.isArray(catalogs)) {
        throw new ExportError(
          ExportErrorType.API_ERROR,
          'Invalid response format from getWikiCatalogs API call.'
        );
      }

      return catalogs;
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      
      throw new ExportError(
        ExportErrorType.API_ERROR,
        `Failed to retrieve wiki catalogs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve wiki content for a specific document
   * @param documentId - The ID of the document to retrieve
   * @returns Promise<WikiDocument> the wiki document with content
   * @throws ExportError if Qoder is not available, user not logged in, or API call fails
   */
  async getWikiContent(documentId: string): Promise<WikiDocument> {
    if (!documentId || typeof documentId !== 'string') {
      throw new ExportError(
        ExportErrorType.API_ERROR,
        'Invalid document ID provided. Document ID must be a non-empty string.'
      );
    }

    if (!this.isQoderAvailable()) {
      throw new ExportError(
        ExportErrorType.QODER_NOT_AVAILABLE,
        'Qoder extension is not available or not activated. Please ensure the Qoder extension is installed and activated.'
      );
    }

    try {
      const isLoggedIn = await this.isUserLoggedIn();
      if (!isLoggedIn) {
        throw new ExportError(
          ExportErrorType.AUTHENTICATION_FAILED,
          'User is not logged in to Qoder. Please log in to access wiki content.'
        );
      }

      if (!this.qoderApi?.repoWiki?.getWikiContent) {
        throw new ExportError(
          ExportErrorType.API_ERROR,
          'Qoder API repoWiki methods are not available. Please check your Qoder extension version.'
        );
      }

      const document = await this.qoderApi.repoWiki.getWikiContent(documentId);
      
      if (!document || typeof document !== 'object') {
        throw new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid response format from getWikiContent API call for document ID: ${documentId}`
        );
      }

      // Validate required properties
      if (!document.id || !document.name || typeof document.content !== 'string') {
        throw new ExportError(
          ExportErrorType.API_ERROR,
          `Invalid document structure returned for document ID: ${documentId}. Missing required properties.`
        );
      }

      return document;
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      
      throw new ExportError(
        ExportErrorType.API_ERROR,
        `Failed to retrieve wiki content for document ${documentId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

