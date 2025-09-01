import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { MarkdownExporter } from '../exporters/markdownExporter';
import { WikiDocument, WikiCatalog, MarkdownExportOptions, ExportStructureType } from '../../types/qoder';

/**
 * Manual test for MarkdownExporter functionality
 * Run with: node out/test/markdownExporter.manual.js
 */
async function runTests() {
  console.log('Starting MarkdownExporter manual tests...\n');
  
  const exporter = new MarkdownExporter();
  let tempDir: string;
  
  try {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-export-test-'));
    console.log(`Using temp directory: ${tempDir}\n`);
    
    // Test 1: Export single document
    console.log('Test 1: Export single document');
    await testSingleDocumentExport(exporter, tempDir);
    
    // Test 2: Export with index file
    console.log('\nTest 2: Export with index file');
    await testIndexFileCreation(exporter, tempDir);
    
    // Test 3: Export catalog hierarchy
    console.log('\nTest 3: Export catalog hierarchy');
    await testCatalogHierarchy(exporter, tempDir);
    
    // Test 4: Test internal links processing
    console.log('\nTest 4: Test internal links processing');
    await testInternalLinks(exporter, tempDir);
    
    console.log('\n✅ All tests passed!');
    
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

async function testSingleDocumentExport(exporter: MarkdownExporter, tempDir: string) {
  const testDir = path.join(tempDir, 'single-doc');
  
  const documents: WikiDocument[] = [
    {
      id: '1',
      name: 'Test Document',
      content: '# Test Document\n\nThis is a test document with **bold** text and `code`.',
      status: 'completed'
    }
  ];

  const result = await exporter.export(documents, testDir);
  
  if (!result.success) {
    throw new Error(`Export failed: ${result.errors.map((e: any) => e.message).join(', ')}`);
  }
  
  if (result.exportedCount !== 1) {
    throw new Error(`Expected 1 exported document, got ${result.exportedCount}`);
  }

  // Check if file was created
  const expectedFile = path.join(testDir, 'Test Document.md');
  const fileExists = await fs.access(expectedFile).then(() => true).catch(() => false);
  
  if (!fileExists) {
    throw new Error('Expected markdown file was not created');
  }

  // Check file content
  const content = await fs.readFile(expectedFile, 'utf8');
  if (!content.includes('# Test Document') || !content.includes('**bold**')) {
    throw new Error('File content does not match expected content');
  }
  
  console.log('  ✅ Single document export successful');
}

async function testIndexFileCreation(exporter: MarkdownExporter, tempDir: string) {
  const testDir = path.join(tempDir, 'with-index');
  
  const documents: WikiDocument[] = [
    {
      id: '1',
      name: 'Document One',
      content: '# Document One\n\nContent one.',
      status: 'completed'
    },
    {
      id: '2',
      name: 'Document Two',
      content: '# Document Two\n\nContent two.',
      status: 'completed'
    }
  ];

  const options: MarkdownExportOptions = {
    preserveHierarchy: true,
    includeTableOfContents: false,
    createIndexFile: true,
    exportStructure: ExportStructureType.FLAT
  };

  const result = await exporter.export(documents, testDir, options);
  
  if (!result.success || result.exportedCount !== 2) {
    throw new Error(`Export failed or wrong count: ${result.exportedCount}`);
  }

  // Check if index file was created
  const indexFile = path.join(testDir, 'index.md');
  const indexExists = await fs.access(indexFile).then(() => true).catch(() => false);
  
  if (!indexExists) {
    throw new Error('Index file was not created');
  }

  // Check index content
  const indexContent = await fs.readFile(indexFile, 'utf8');
  if (!indexContent.includes('Document One') || !indexContent.includes('Document Two')) {
    throw new Error('Index file does not contain expected document links');
  }
  
  if (!indexContent.includes('Total documents: 2')) {
    throw new Error('Index file does not contain correct document count');
  }
  
  console.log('  ✅ Index file creation successful');
}

async function testCatalogHierarchy(exporter: MarkdownExporter, tempDir: string) {
  const testDir = path.join(tempDir, 'catalog-hierarchy');
  
  const catalogs: WikiCatalog[] = [
    {
      id: '1',
      name: 'Main Category',
      status: 'completed',
      subCatalog: [
        {
          id: '2',
          name: 'Sub Document',
          status: 'completed'
        },
        {
          id: '3',
          name: 'Failed Document',
          status: 'failed'
        }
      ]
    }
  ];

  const options: MarkdownExportOptions = {
    preserveHierarchy: true,
    includeTableOfContents: false,
    createIndexFile: true,
    exportStructure: ExportStructureType.FLAT
  };

  const result = await exporter.exportCatalogs(catalogs, testDir, options);
  
  if (!result.success) {
    throw new Error(`Catalog export failed: ${result.errors.map((e: any) => e.message).join(', ')}`);
  }
  
  // Should only export completed documents (2 total: Main Category + Sub Document)
  if (result.exportedCount !== 2) {
    throw new Error(`Expected 2 exported documents, got ${result.exportedCount}`);
  }

  // Check if hierarchical index was created
  const indexFile = path.join(testDir, 'index.md');
  const indexExists = await fs.access(indexFile).then(() => true).catch(() => false);
  
  if (!indexExists) {
    throw new Error('Hierarchical index file was not created');
  }

  const indexContent = await fs.readFile(indexFile, 'utf8');
  if (!indexContent.includes('Main Category') || !indexContent.includes('Sub Document')) {
    throw new Error('Hierarchical index does not contain expected content');
  }
  
  // Failed document should be marked as such
  if (!indexContent.includes('*(failed)*')) {
    throw new Error('Failed document not properly marked in index');
  }
  
  console.log('  ✅ Catalog hierarchy export successful');
}

async function testInternalLinks(exporter: MarkdownExporter, tempDir: string) {
  const testDir = path.join(tempDir, 'internal-links');
  
  const documents: WikiDocument[] = [
    {
      id: '1',
      name: 'Document with Links',
      content: '# Document with Links\n\nSee [[Other Document]] for more info.\n\nAlso check [Internal Link](#section).\n\nAnd here is an image: ![Test Image](./images/test.png)',
      status: 'completed'
    }
  ];

  const result = await exporter.export(documents, testDir);
  
  if (!result.success) {
    throw new Error(`Export with links failed: ${result.errors.map((e: any) => e.message).join(', ')}`);
  }

  const expectedFile = path.join(testDir, 'Document with Links.md');
  const content = await fs.readFile(expectedFile, 'utf8');
  
  // Check that wiki-style links are converted
  if (!content.includes('[Other Document](./Other Document.md)')) {
    throw new Error('Wiki-style links were not converted properly');
  }
  
  // Check that internal anchors are preserved
  if (!content.includes('[Internal Link](#section)')) {
    throw new Error('Internal anchor links were not preserved');
  }
  
  // Check that image paths are normalized
  if (!content.includes('![Test Image](./images/test.png)')) {
    throw new Error('Image paths were not normalized properly');
  }
  
  console.log('  ✅ Internal links processing successful');
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };