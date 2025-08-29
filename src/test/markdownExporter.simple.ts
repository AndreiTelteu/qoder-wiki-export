import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { MarkdownExporter } from '../exporters/markdownExporter';
import { WikiDocument, WikiCatalog, MarkdownExportOptions, FileService } from '../../types/qoder';

/**
 * Mock FileService that doesn't depend on VSCode
 */
class MockFileService implements FileService {
  async createDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const parentDir = path.dirname(filePath);
    await this.createDirectory(parentDir);
    await fs.writeFile(filePath, content, 'utf8');
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async confirmOverwrite(filePath: string): Promise<boolean> {
    // For testing, always return true
    return true;
  }

  sanitizeFilename(filename: string): string {
    if (!filename || filename.trim().length === 0) {
      return 'untitled';
    }

    let sanitized = filename.trim();
    
    // Replace invalid characters with underscores
    sanitized = sanitized.replace(/[<>:"|?*\\/\x00-\x1f\x7f]/g, '_');
    
    // Handle reserved Windows names
    const reservedNames = [
      'CON', 'PRN', 'AUX', 'NUL',
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
      'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ];
    
    const nameWithoutExt = path.parse(sanitized).name.toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      sanitized = `_${sanitized}`;
    }

    // Remove trailing dots and spaces
    sanitized = sanitized.replace(/[. ]+$/, '');

    if (sanitized.length === 0) {
      sanitized = 'untitled';
    }

    // Limit filename length
    if (sanitized.length > 200) {
      const ext = path.extname(sanitized);
      const nameOnly = path.parse(sanitized).name;
      sanitized = nameOnly.substring(0, 200 - ext.length) + ext;
    }

    return sanitized;
  }

  createSafeFilePath(basePath: string, relativePath: string): string {
    const pathParts = relativePath.split(/[/\\]/);
    const sanitizedParts = pathParts.map(part => this.sanitizeFilename(part));
    return path.join(basePath, ...sanitizedParts);
  }

  async ensureDirectoryStructure(filePath: string): Promise<string> {
    const dirPath = path.dirname(filePath);
    await this.createDirectory(dirPath);
    return dirPath;
  }

  async writeFileWithConfirmation(
    filePath: string, 
    content: string, 
    forceOverwrite: boolean = false
  ): Promise<boolean> {
    await this.writeFile(filePath, content);
    return true;
  }

  getRelativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}

/**
 * Simple test for MarkdownExporter functionality
 */
async function runSimpleTest() {
  console.log('Starting MarkdownExporter simple test...\n');
  
  const mockFileService = new MockFileService();
  const exporter = new MarkdownExporter(mockFileService);
  let tempDir: string;
  
  try {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-export-simple-test-'));
    console.log(`Using temp directory: ${tempDir}\n`);
    
    // Test: Export single document
    console.log('Test: Export single document with internal links');
    
    const documents: WikiDocument[] = [
      {
        id: '1',
        name: 'Test Document',
        content: '# Test Document\n\nThis is a test document with **bold** text.\n\nSee [[Other Document]] for more info.\n\nAlso check [Internal Link](#section).',
        status: 'completed'
      }
    ];

    const options: MarkdownExportOptions = {
      preserveHierarchy: true,
      includeTableOfContents: false,
      createIndexFile: true
    };

    const result = await exporter.export(documents, tempDir, options);
    
    if (!result.success) {
      throw new Error(`Export failed: ${result.errors.map((e: any) => e.message).join(', ')}`);
    }
    
    console.log(`✅ Export successful: ${result.exportedCount} documents exported`);

    // Check if files were created
    const expectedFile = path.join(tempDir, 'Test Document.md');
    const indexFile = path.join(tempDir, 'index.md');
    
    const fileExists = await mockFileService.fileExists(expectedFile);
    const indexExists = await mockFileService.fileExists(indexFile);
    
    if (!fileExists) {
      throw new Error('Expected markdown file was not created');
    }
    
    if (!indexExists) {
      throw new Error('Index file was not created');
    }

    // Check file content
    const content = await fs.readFile(expectedFile, 'utf8');
    console.log('\nGenerated content preview:');
    console.log('---');
    console.log(content.substring(0, 200) + '...');
    console.log('---');
    
    // Verify internal links were processed
    if (!content.includes('[Other Document](./Other Document.md)')) {
      throw new Error('Wiki-style links were not converted properly');
    }
    
    if (!content.includes('[Internal Link](#section)')) {
      throw new Error('Internal anchor links were not preserved');
    }
    
    console.log('✅ Internal links processed correctly');

    // Check index content
    const indexContent = await fs.readFile(indexFile, 'utf8');
    if (!indexContent.includes('Test Document') || !indexContent.includes('Total documents: 1')) {
      throw new Error('Index file content is incorrect');
    }
    
    console.log('✅ Index file created correctly');
    
    console.log('\n🎉 All tests passed! MarkdownExporter is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (tempDir!) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`\nCleaned up temp directory: ${tempDir}`);
      } catch (error) {
        console.warn('Failed to cleanup temp directory:', error);
      }
    }
  }
}

// Run the test
if (require.main === module) {
  runSimpleTest().catch(console.error);
}

export { runSimpleTest };