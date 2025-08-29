/**
 * Standalone test for error handling functionality that doesn't require VSCode
 */

import { ExportError, ExportErrorType } from '../../types/qoder';

/**
 * Simple standalone test for ExportError functionality
 */
function runStandaloneErrorTest() {
  console.log('Starting standalone error handling test...\n');
  
  try {
    // Test 1: ExportError creation with all new error types
    console.log('Test 1: ExportError creation with new error types');
    
    const errorTypes = [
      ExportErrorType.NETWORK_ERROR,
      ExportErrorType.RATE_LIMIT_ERROR,
      ExportErrorType.DOCUMENT_NOT_FOUND,
      ExportErrorType.PERMISSION_DENIED,
      ExportErrorType.DISK_SPACE_ERROR,
      ExportErrorType.TIMEOUT_ERROR,
      ExportErrorType.VALIDATION_ERROR
    ];
    
    errorTypes.forEach(errorType => {
      const error = new ExportError(errorType, `Test ${errorType} message`, 'doc123');
      if (error.type !== errorType) {
        throw new Error(`ExportError type not set correctly for ${errorType}`);
      }
      if (error.documentId !== 'doc123') {
        throw new Error(`ExportError documentId not set correctly for ${errorType}`);
      }
    });
    
    console.log('✅ All new ExportError types created successfully');
    
    // Test 2: ExportError inheritance
    console.log('\nTest 2: ExportError inheritance');
    
    const error = new ExportError(ExportErrorType.API_ERROR, 'Test message');
    
    if (!(error instanceof Error)) {
      throw new Error('ExportError should inherit from Error');
    }
    if (error.name !== 'ExportError') {
      throw new Error('ExportError name should be "ExportError"');
    }
    
    console.log('✅ ExportError inheritance works correctly');
    
    // Test 3: Error serialization
    console.log('\nTest 3: Error serialization');
    
    const complexError = new ExportError(
      ExportErrorType.CONVERSION_ERROR,
      'Complex error message',
      'doc456',
      { nested: { data: 'test' }, array: [1, 2, 3] }
    );
    
    const serialized = JSON.stringify(complexError);
    const parsed = JSON.parse(serialized);
    
    if (parsed.type !== ExportErrorType.CONVERSION_ERROR) {
      throw new Error('Error type not preserved in serialization');
    }
    if (parsed.message !== 'Complex error message') {
      throw new Error('Error message not preserved in serialization');
    }
    if (parsed.documentId !== 'doc456') {
      throw new Error('Document ID not preserved in serialization');
    }
    
    console.log('✅ Error serialization works correctly');
    
    console.log('\n🎉 All standalone error handling tests passed!');
    
  } catch (error) {
    console.error('\n❌ Standalone error handling test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runStandaloneErrorTest();
}

export { runStandaloneErrorTest };