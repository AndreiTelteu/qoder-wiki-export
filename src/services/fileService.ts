import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExportError, ExportErrorType } from '../../types/qoder';

/**
 * FileService handles all file system operations for the wiki export functionality.
 * Provides methods for directory creation, file writing, existence checking, and filename sanitization.
 */
export class FileService {
  /**
   * Creates a directory at the specified path, including any necessary parent directories.
   * @param dirPath - The path where the directory should be created
   * @throws ExportError if directory creation fails
   */
  async createDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Determine specific error type based on error code
      let errorType = ExportErrorType.FILE_SYSTEM_ERROR;
      const nodeError = error as NodeJS.ErrnoException;
      
      if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        errorType = ExportErrorType.PERMISSION_DENIED;
      } else if (nodeError.code === 'ENOSPC') {
        errorType = ExportErrorType.DISK_SPACE_ERROR;
      }

      throw new ExportError(
        errorType,
        `Failed to create directory: ${dirPath}`,
        undefined,
        error
      );
    }
  }

  /**
   * Writes content to a file at the specified path.
   * Creates parent directories if they don't exist.
   * @param filePath - The path where the file should be written
   * @param content - The content to write to the file
   * @throws ExportError if file writing fails
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(filePath);
      await this.createDirectory(parentDir);
      
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      // Determine specific error type based on error code
      let errorType = ExportErrorType.FILE_SYSTEM_ERROR;
      const nodeError = error as NodeJS.ErrnoException;
      
      if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        errorType = ExportErrorType.PERMISSION_DENIED;
      } else if (nodeError.code === 'ENOSPC') {
        errorType = ExportErrorType.DISK_SPACE_ERROR;
      }

      throw new ExportError(
        errorType,
        `Failed to write file: ${filePath}`,
        undefined,
        error
      );
    }
  }

  /**
   * Checks if a file exists at the specified path.
   * @param filePath - The path to check for file existence
   * @returns Promise<boolean> - true if file exists, false otherwise
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a directory exists at the specified path.
   * @param dirPath - The path to check for directory existence
   * @returns Promise<boolean> - true if directory exists, false otherwise
   */
  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Prompts user for overwrite confirmation when files already exist.
   * @param filePath - The path of the file that would be overwritten
   * @returns Promise<boolean> - true if user confirms overwrite, false otherwise
   */
  async confirmOverwrite(filePath: string): Promise<boolean> {
    const fileName = path.basename(filePath);
    const choice = await vscode.window.showWarningMessage(
      `File "${fileName}" already exists. Do you want to overwrite it?`,
      { modal: true },
      'Overwrite',
      'Skip'
    );
    
    return choice === 'Overwrite';
  }

  /**
   * Sanitizes a filename by removing or replacing invalid characters.
   * Handles special characters, reserved names, and length limitations.
   * @param filename - The original filename to sanitize
   * @returns string - The sanitized filename safe for file system use
   */
  sanitizeFilename(filename: string): string {
    if (!filename || filename.trim().length === 0) {
      return 'untitled';
    }

    let sanitized = filename.trim();

    // Replace invalid characters with underscores
    // Windows invalid characters: < > : " | ? * \ /
    // Also handle control characters (0-31) and DEL (127)
    sanitized = sanitized.replace(/[<>:"|?*\\/\x00-\x1f\x7f]/g, '_');

    // Handle reserved Windows names (case-insensitive)
    const reservedNames = [
      'CON', 'PRN', 'AUX', 'NUL',
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
      'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ];
    
    const nameWithoutExt = path.parse(sanitized).name.toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      sanitized = `_${sanitized}`;
    }

    // Remove trailing dots and spaces (Windows limitation)
    sanitized = sanitized.replace(/[. ]+$/, '');

    // Ensure filename is not empty after sanitization
    if (sanitized.length === 0) {
      sanitized = 'untitled';
    }

    // Limit filename length (255 bytes is common filesystem limit)
    // Using 200 to be safe with UTF-8 encoding
    if (sanitized.length > 200) {
      const ext = path.extname(sanitized);
      const nameOnly = path.parse(sanitized).name;
      sanitized = nameOnly.substring(0, 200 - ext.length) + ext;
    }

    return sanitized;
  }

  /**
   * Creates a safe file path by sanitizing the filename and ensuring directory structure.
   * @param basePath - The base directory path
   * @param relativePath - The relative path including filename
   * @returns string - The complete sanitized file path
   */
  createSafeFilePath(basePath: string, relativePath: string): string {
    const pathParts = relativePath.split(/[/\\]/);
    const sanitizedParts = pathParts.map(part => this.sanitizeFilename(part));
    return path.join(basePath, ...sanitizedParts);
  }

  /**
   * Creates the complete directory structure for a given file path.
   * @param filePath - The complete file path
   * @returns Promise<string> - The directory path that was created
   */
  async ensureDirectoryStructure(filePath: string): Promise<string> {
    const dirPath = path.dirname(filePath);
    await this.createDirectory(dirPath);
    return dirPath;
  }

  /**
   * Writes a file with overwrite confirmation if the file already exists.
   * @param filePath - The path where the file should be written
   * @param content - The content to write to the file
   * @param forceOverwrite - If true, skip confirmation dialog
   * @returns Promise<boolean> - true if file was written, false if skipped
   */
  async writeFileWithConfirmation(
    filePath: string, 
    content: string, 
    forceOverwrite: boolean = false
  ): Promise<boolean> {
    const exists = await this.fileExists(filePath);
    
    if (exists && !forceOverwrite) {
      const shouldOverwrite = await this.confirmOverwrite(filePath);
      if (!shouldOverwrite) {
        return false;
      }
    }
    
    await this.writeFile(filePath, content);
    return true;
  }

  /**
   * Gets the relative path from a base directory to a target file.
   * Useful for creating index files with relative links.
   * @param from - The base directory path
   * @param to - The target file path
   * @returns string - The relative path
   */
  getRelativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  /**
   * Normalizes a path to use forward slashes (useful for cross-platform compatibility).
   * @param filePath - The path to normalize
   * @returns string - The normalized path with forward slashes
   */
  normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}