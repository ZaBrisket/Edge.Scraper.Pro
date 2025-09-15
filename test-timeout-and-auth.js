/**
 * Test timeout functionality and API key validation
 */

const handler = require('./netlify/functions/fetch-url').handler;

async function testTimeoutFunctionality() {
  console.log('Testing timeout functionality...');
  
  // Test with a URL that will timeout
  const mockEvent = {
    queryStringParameters: {
      url: 'https://httpbin.org/delay/10' // This will take 10 seconds
    },
    requestContext: {
      requestId: 'timeout-test-123'
    },
    httpMethod: 'GET',
    headers: {
      'x-api-key': 'public-2024'
    }
  };
  
  const startTime = Date.now();
  
  try {
    const result = await handler(mockEvent);
    const elapsed = Date.now() - startTime;
    
    console.log(`✓ Timeout test completed in ${elapsed}ms`);
    console.log(`Status: ${result.statusCode}`);
    
    const body = JSON.parse(result.body);
    if (body.error && body.error.errorClass === 'timeout') {
      console.log('✓ Timeout properly detected and handled');
    } else {
      console.log('⚠ Timeout not detected as expected');
    }
    
    // Should complete in less than 5 seconds (timeout is 3 seconds)
    if (elapsed < 5000) {
      console.log('✓ Request timed out within expected timeframe');
    } else {
      console.log('⚠ Request took longer than expected');
    }
    
  } catch (error) {
    console.error('✗ Timeout test failed:', error.message);
  }
}

async function testApiKeyValidation() {
  console.log('\nTesting API key validation...');
  
  // Test without API key
  const mockEventNoKey = {
    queryStringParameters: {
      url: 'https://example.com'
    },
    requestContext: {
      requestId: 'auth-test-123'
    },
    httpMethod: 'GET',
    headers: {}
  };
  
  try {
    const result = await handler(mockEventNoKey);
    console.log(`Status without API key: ${result.statusCode}`);
    
    const body = JSON.parse(result.body);
    if (result.statusCode === 401 && body.error.code === 'UNAUTHORIZED') {
      console.log('✓ API key validation working - correctly rejected request without key');
    } else {
      console.log('⚠ API key validation not working - should have rejected request');
    }
  } catch (error) {
    console.error('✗ API key test failed:', error.message);
  }
  
  // Test with wrong API key
  const mockEventWrongKey = {
    queryStringParameters: {
      url: 'https://example.com'
    },
    requestContext: {
      requestId: 'auth-test-456'
    },
    httpMethod: 'GET',
    headers: {
      'x-api-key': 'wrong-key'
    }
  };
  
  try {
    const result = await handler(mockEventWrongKey);
    console.log(`Status with wrong API key: ${result.statusCode}`);
    
    const body = JSON.parse(result.body);
    if (result.statusCode === 401 && body.error.code === 'UNAUTHORIZED') {
      console.log('✓ API key validation working - correctly rejected wrong key');
    } else {
      console.log('⚠ API key validation not working - should have rejected wrong key');
    }
  } catch (error) {
    console.error('✗ API key test failed:', error.message);
  }
  
  // Test with correct API key
  const mockEventCorrectKey = {
    queryStringParameters: {
      url: 'https://example.com'
    },
    requestContext: {
      requestId: 'auth-test-789'
    },
    httpMethod: 'GET',
    headers: {
      'x-api-key': 'public-2024'
    }
  };
  
  try {
    const result = await handler(mockEventCorrectKey);
    console.log(`Status with correct API key: ${result.statusCode}`);
    
    const body = JSON.parse(result.body);
    if (result.statusCode === 200 && body.ok) {
      console.log('✓ API key validation working - correctly accepted valid key');
    } else {
      console.log('⚠ API key validation not working - should have accepted valid key');
    }
  } catch (error) {
    console.error('✗ API key test failed:', error.message);
  }
}

async function testBypassAuth() {
  console.log('\nTesting BYPASS_AUTH functionality...');
  
  // Set environment variable to bypass auth
  process.env.BYPASS_AUTH = 'true';
  
  const mockEvent = {
    queryStringParameters: {
      url: 'https://example.com'
    },
    requestContext: {
      requestId: 'bypass-test-123'
    },
    httpMethod: 'GET',
    headers: {}
  };
  
  try {
    const result = await handler(mockEvent);
    console.log(`Status with BYPASS_AUTH=true: ${result.statusCode}`);
    
    const body = JSON.parse(result.body);
    if (result.statusCode === 200 && body.ok) {
      console.log('✓ BYPASS_AUTH working - request accepted without API key');
    } else {
      console.log('⚠ BYPASS_AUTH not working - should have accepted request');
    }
  } catch (error) {
    console.error('✗ BYPASS_AUTH test failed:', error.message);
  }
  
  // Reset environment variable
  process.env.BYPASS_AUTH = 'false';
}

async function runAllTests() {
  console.log('Running timeout and authentication tests...\n');
  
  await testTimeoutFunctionality();
  await testApiKeyValidation();
  await testBypassAuth();
  
  console.log('\nAll tests completed!');
}

// Run tests
runAllTests().catch(console.error);