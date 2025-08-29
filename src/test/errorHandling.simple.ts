import { ExportError, ExportErrorType } from '../../types/qoder';
import { ErrorHandler } from '../services/errorHandler';
import { GracefulDegradation } from '../services/gracefulDegradation';
import { NotificationService } from '../services/notificationService';

/**
 * Simple test for error handling and graceful degradation functionality
 */
async function runErrorHandlingTest() {
  console.log('Starting Error Handling simple test...\n');
  
  let errorHandler: ErrorHandler | undefined;
  let gracefulDegradation: GracefulDegradation | undefined;
  let notificationService: NotificationService | undefined;
  
  try {
    // Initialize services
    errorHandler = new ErrorHandler();
    gracefulDegradation = new GracefulDegradation(errorHandler);
    notificationService = new NotificationService();
    
    console.log('✅ Services initialized successfully');
    
    // Test 1: ExportError creation
    console.log('\nTest 1: ExportError creation');
    const error = new ExportError(
      ExportErrorType.API_ERROR,
      'Test error message',
      'doc123',
      { additional: 'data' }
    );
    
    if (error.type !== ExportErrorType.API_ERROR) {
      throw new Error('ExportError type not set correctly');
    }
    if (error.message !== 'Test error message') {
      throw new Error('ExportError message not set correctly');
    }
    if (error.documentId !== 'doc123') {
      throw new Error('ExportError documentId not set correctly');
    }
    if (!error.details || error.details.additional !== 'data') {
      throw new Error('ExportError details not set correctly');
    }
    if (error.name !== 'ExportError') {
      throw new Error('ExportError name not set correctly');
    }
    
    console.log('✅ ExportError created with correct properties');
    
    // Test 2: Error handler logging
    console.log('\nTest 2: Error handler logging');
    errorHandler.logInfo('Test info message', { test: 'data' });
    errorHandler.logWarning('Test warning message');
    errorHandler.handleError(error, 'test context', false);
    
    console.log('✅ Error handler logging works (check output channel for details)');
    
    // Test 3: Graceful degradation retry
    console.log('\nTest 3: Graceful degradation retry');
    let attemptCount = 0;
    const maxRetries = 3;
    
    const operation = async () => {
      attemptCount++;
      if (attemptCount < maxRetries) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      return 'success';
    };

    const result = await gracefulDegradation.retryWithBackoff(operation, maxRetries, 10);
    
    if (result !== 'success') {
      throw new Error('Retry operation did not return expected result');
    }
    if (attemptCount !== maxRetries) {
      throw new Error(`Expected ${maxRetries} attempts, got ${attemptCount}`);
    }
    
    console.log('✅ Graceful degradation retry works correctly');
    
    // Test 4: Non-retryable errors
    console.log('\nTest 4: Non-retryable errors');
    let nonRetryAttemptCount = 0;
    
    const nonRetryOperation = async () => {
      nonRetryAttemptCount++;
      throw new ExportError(ExportErrorType.AUTHENTICATION_FAILED, 'Auth failed');
    };

    try {
      await gracefulDegradation.retryWithBackoff(nonRetryOperation, 3, 10);
      throw new Error('Should have thrown an error');
    } catch (retryError) {
      if (!(retryError instanceof ExportError)) {
        throw new Error('Expected ExportError to be thrown');
      }
      if (retryError.type !== ExportErrorType.AUTHENTICATION_FAILED) {
        throw new Error('Expected AUTHENTICATION_FAILED error type');
      }
      if (nonRetryAttemptCount !== 1) {
        throw new Error('Non-retryable error should not be retried');
      }
    }
    
    console.log('✅ Non-retryable errors handled correctly');
    
    // Test 5: Batch processing with degradation
    console.log('\nTest 5: Batch processing with degradation');
    const items = [1, 2, 3, 4, 5];
    
    const processor = async (item: number) => {
      if (item === 3) {
        throw new Error(`Item ${item} failed`);
      }
      return item * 2;
    };

    const batchResult = await gracefulDegradation.processBatchWithDegradation(
      items,
      processor,
      { continueOnError: true, maxConcurrent: 2 }
    );

    if (batchResult.successful.length !== 4) {
      throw new Error(`Expected 4 successful items, got ${batchResult.successful.length}`);
    }
    if (batchResult.failed.length !== 1) {
      throw new Error(`Expected 1 failed item, got ${batchResult.failed.length}`);
    }
    if (batchResult.failed[0]?.item !== 3) {
      throw new Error('Expected item 3 to fail');
    }
    
    // Check successful results
    const successfulValues = batchResult.successful.map(s => s.result).sort();
    const expectedValues = [2, 4, 8, 10];
    if (JSON.stringify(successfulValues) !== JSON.stringify(expectedValues)) {
      throw new Error(`Expected ${JSON.stringify(expectedValues)}, got ${JSON.stringify(successfulValues)}`);
    }
    
    console.log('✅ Batch processing with degradation works correctly');
    
    // Test 6: Fallback document creation
    console.log('\nTest 6: Fallback document creation');
    const catalog = {
      id: 'doc123',
      name: 'Test Document',
      status: 'completed' as const,
      subCatalog: []
    };
    
    const testError = new ExportError(
      ExportErrorType.API_ERROR,
      'Failed to retrieve content'
    );

    const fallbackDoc = gracefulDegradation.createFallbackDocument(catalog, testError);
    
    if (fallbackDoc.id !== 'doc123') {
      throw new Error('Fallback document ID not correct');
    }
    if (fallbackDoc.name !== 'Test Document') {
      throw new Error('Fallback document name not correct');
    }
    if (fallbackDoc.status !== 'failed') {
      throw new Error('Fallback document status not correct');
    }
    if (!fallbackDoc.content.includes('Document Export Failed')) {
      throw new Error('Fallback document content missing failure message');
    }
    if (!fallbackDoc.content.includes('API_ERROR')) {
      throw new Error('Fallback document content missing error type');
    }
    
    console.log('✅ Fallback document creation works correctly');
    
    // Test 7: Filter problematic documents
    console.log('\nTest 7: Filter problematic documents');
    const documents = [
      { id: 'doc1', name: 'Doc 1', status: 'completed' as const },
      { id: 'doc2', name: 'Doc 2', status: 'completed' as const },
      { id: 'doc3', name: 'Doc 3', status: 'completed' as const }
    ];

    const previousErrors = [
      new ExportError(ExportErrorType.API_ERROR, 'Error', 'doc2')
    ];

    const filtered = gracefulDegradation.filterProblematicDocuments(documents, previousErrors);
    
    if (filtered.length !== 2) {
      throw new Error(`Expected 2 filtered documents, got ${filtered.length}`);
    }
    if (!filtered.find(d => d.id === 'doc1')) {
      throw new Error('Expected doc1 to be included');
    }
    if (!filtered.find(d => d.id === 'doc3')) {
      throw new Error('Expected doc3 to be included');
    }
    if (filtered.find(d => d.id === 'doc2')) {
      throw new Error('Expected doc2 to be filtered out');
    }
    
    console.log('✅ Problematic document filtering works correctly');
    
    console.log('\n🎉 All error handling tests passed! Error handling system is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Error handling test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (gracefulDegradation) {
      gracefulDegradation.dispose();
    }
    if (errorHandler) {
      errorHandler.dispose();
    }
  }
}

// Run the test
if (require.main === module) {
  runErrorHandlingTest().catch(console.error);
}

export { runErrorHandlingTest };