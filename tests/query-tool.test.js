#!/usr/bin/env node

/**
 * DynamoDB MCP Server Query Tool Test Suite
 * Comprehensive tests for the enhanced query_table functionality
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  retries: 3,
  server: {
    command: 'node',
    args: ['dist/index.js'],
    cwd: '/Users/yusuf/Software/Tools/MCP-Servers/dynamodb-mcp-server'
  }
};

// Test data
const TEST_DATA = {
  validUserId: '33ec8713-0451-4f0b-89fa-ee67bb4a8699',
  validTableName: 'UpConversationMessage-upwagmitec',
  validIndexName: 'userIdIndex',
  invalidUserId: 'invalid-user-id-123',
  invalidTableName: 'NonExistentTable-upwagmitec'
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class TestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async runMCPQuery(query) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(TEST_CONFIG.server.command, TEST_CONFIG.server.args, {
        cwd: TEST_CONFIG.server.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';
      let timeout;

      // Set timeout
      timeout = setTimeout(() => {
        childProcess.kill();
        reject(new Error('Query timeout'));
      }, TEST_CONFIG.timeout);

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeout);
        try {
          // Find JSON response in stdout
          const lines = stdout.split('\n');
          const jsonLine = lines.find(line => line.trim().startsWith('{"result"'));
          
          if (jsonLine) {
            const response = JSON.parse(jsonLine);
            resolve(response);
          } else {
            reject(new Error(`No JSON response found. stderr: ${stderr}`));
          }
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}. stdout: ${stdout}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Send query
      childProcess.stdin.write(JSON.stringify(query) + '\n');
      childProcess.stdin.end();
    });
  }

  async runTest(test) {
    console.log(`${colors.blue}Running: ${test.name}${colors.reset}`);
    try {
      await test.testFn();
      console.log(`${colors.green}✓ ${test.name}${colors.reset}`);
      this.results.passed++;
    } catch (error) {
      console.log(`${colors.red}✗ ${test.name}${colors.reset}`);
      console.log(`${colors.red}  Error: ${error.message}${colors.reset}`);
      this.results.failed++;
      this.results.errors.push({ test: test.name, error: error.message });
    }
  }

  async runAllTests() {
    console.log(`${colors.bold}${colors.blue}DynamoDB MCP Server Query Tool Test Suite${colors.reset}`);
    console.log(`${colors.blue}Testing ${this.tests.length} scenarios...${colors.reset}\n`);

    this.results.total = this.tests.length;

    for (const test of this.tests) {
      await this.runTest(test);
    }

    this.printResults();
  }

  printResults() {
    console.log(`\n${colors.bold}Test Results:${colors.reset}`);
    console.log(`${colors.green}Passed: ${this.results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.results.failed}${colors.reset}`);
    console.log(`Total: ${this.results.total}`);

    if (this.results.errors.length > 0) {
      console.log(`\n${colors.red}Errors:${colors.reset}`);
      this.results.errors.forEach(error => {
        console.log(`${colors.red}  ${error.test}: ${error.error}${colors.reset}`);
      });
    }

    const success = this.results.failed === 0;
    console.log(`\n${success ? colors.green : colors.red}${success ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED!'}${colors.reset}`);
    
    return success;
  }
}

// Initialize test runner
const testRunner = new TestRunner();

// Test 1: Basic query with primary key
testRunner.addTest('Basic query with primary key', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        },
        limit: 1
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  
  if (!response.result || !response.result.content) {
    throw new Error('Invalid response structure');
  }

  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Query failed: ${content.message}`);
  }

  if (typeof content.count !== 'number') {
    throw new Error('Response missing count field');
  }

  if (!content.queryMetadata) {
    throw new Error('Response missing queryMetadata');
  }
});

// Test 2: Query with filter expression
testRunner.addTest('Query with filter expression', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        filterExpression: '#createdAt >= :weekAgo',
        expressionAttributeNames: {
          '#createdAt': 'createdAt'
        },
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId,
          ':weekAgo': '2025-07-01 00:00:00.000000'
        },
        limit: 5
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Query failed: ${content.message}`);
  }

  if (!content.queryMetadata.filterExpression) {
    throw new Error('Filter expression not preserved in metadata');
  }
});

// Test 3: Query with projection expression
testRunner.addTest('Query with projection expression', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        projectionExpression: 'userId, createdAt, #role',
        expressionAttributeNames: {
          '#role': 'role'
        },
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        },
        limit: 2
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Query failed: ${content.message}`);
  }

  // Check if items have only projected attributes
  if (content.items && content.items.length > 0) {
    const item = content.items[0];
    const hasOnlyProjectedAttrs = Object.keys(item).every(key => 
      ['userId', 'createdAt', 'role'].includes(key)
    );
    
    if (!hasOnlyProjectedAttrs) {
      throw new Error('Projection expression not working correctly');
    }
  }
});

// Test 4: Query with pagination
testRunner.addTest('Query with pagination', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        },
        limit: 2
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Query failed: ${content.message}`);
  }

  if (typeof content.hasMoreItems !== 'boolean') {
    throw new Error('Response missing hasMoreItems field');
  }

  if (content.hasMoreItems && !content.lastEvaluatedKey) {
    throw new Error('hasMoreItems is true but lastEvaluatedKey is missing');
  }
});

// Test 5: Query with descending sort order
testRunner.addTest('Query with descending sort order', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        },
        scanIndexForward: false,
        limit: 3
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Query failed: ${content.message}`);
  }

  if (content.queryMetadata.scanIndexForward !== false) {
    throw new Error('scanIndexForward not preserved in metadata');
  }
});

// Test 6: Error handling - missing expressionAttributeValues
testRunner.addTest('Error handling - missing expressionAttributeValues', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        keyConditionExpression: 'userId = :userId'
        // Missing expressionAttributeValues
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (content.success) {
    throw new Error('Query should have failed due to missing expressionAttributeValues');
  }

  if (!content.message.includes('expressionAttributeValues is required')) {
    throw new Error('Error message should mention missing expressionAttributeValues');
  }
});

// Test 7: Error handling - invalid table name
testRunner.addTest('Error handling - invalid table name', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.invalidTableName,
        keyConditionExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        }
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (content.success) {
    throw new Error('Query should have failed due to invalid table name');
  }

  if (!content.error && !content.message.includes('does not exist')) {
    throw new Error('Error should mention table does not exist');
  }
});

// Test 8: Query metadata completeness
testRunner.addTest('Query metadata completeness', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        filterExpression: '#createdAt >= :date',
        expressionAttributeNames: {
          '#createdAt': 'createdAt'
        },
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId,
          ':date': '2025-01-01 00:00:00.000000'
        },
        limit: 1,
        scanIndexForward: false
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Query failed: ${content.message}`);
  }

  const metadata = content.queryMetadata;
  const requiredFields = [
    'tableName', 'indexName', 'keyConditionExpression', 
    'filterExpression', 'limit', 'scanIndexForward'
  ];

  for (const field of requiredFields) {
    if (metadata[field] === undefined) {
      throw new Error(`Missing metadata field: ${field}`);
    }
  }
});

// Test 9: Large result set handling
testRunner.addTest('Large result set handling', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        },
        limit: 100
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Query failed: ${content.message}`);
  }

  if (content.items && content.items.length > 100) {
    throw new Error('Limit not respected');
  }

  if (content.scannedCount > 100) {
    throw new Error('Scan count exceeds limit');
  }
});

// Test 10: Version tool integration
testRunner.addTest('Version tool integration', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'get_version',
      arguments: {}
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (!content.success) {
    throw new Error(`Version query failed: ${content.message}`);
  }

  if (!content.version || !content.version.startsWith('v')) {
    throw new Error('Invalid version format');
  }

  if (!content.features || !Array.isArray(content.features)) {
    throw new Error('Features list missing or invalid');
  }
});

// Test 11: Force ValidationException - ExpressionAttributeValues must not be empty (Query)
testRunner.addTest('Force ValidationException - Query ExpressionAttributeValues empty', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        keyConditionExpression: 'userId = :userId',
        expressionAttributeValues: {}, // Empty object should cause ValidationException
        expressionAttributeNames: {
          '#userId': 'userId'
        }
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (content.success) {
    throw new Error('Query should have failed with empty ExpressionAttributeValues');
  }

  if (!content.message || !content.message.includes('ValidationException')) {
    throw new Error(`Expected ValidationException, got: ${content.message}`);
  }

  if (!content.message.includes('ExpressionAttributeValues must not be empty')) {
    throw new Error(`Expected "ExpressionAttributeValues must not be empty" error, got: ${content.message}`);
  }
});

// Test 12: Force ValidationException - ExpressionAttributeValues must not be empty (Scan)
testRunner.addTest('Force ValidationException - Scan ExpressionAttributeValues empty', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'scan_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        filterExpression: 'userId = :userId',
        expressionAttributeValues: {}, // Empty object should cause ValidationException
        expressionAttributeNames: {
          '#userId': 'userId'
        }
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (content.success) {
    throw new Error('Scan should have failed with empty ExpressionAttributeValues');
  }

  if (!content.message || !content.message.includes('ValidationException')) {
    throw new Error(`Expected ValidationException, got: ${content.message}`);
  }

  if (!content.message.includes('ExpressionAttributeValues must not be empty')) {
    throw new Error(`Expected "ExpressionAttributeValues must not be empty" error, got: ${content.message}`);
  }
});

// Test 13: Force ValidationException - Query with unused ExpressionAttributeNames
testRunner.addTest('Force ValidationException - Query unused ExpressionAttributeNames', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'query_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        indexName: TEST_DATA.validIndexName,
        keyConditionExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        },
        expressionAttributeNames: {
          '#unusedAttribute': 'unusedAttribute' // This should cause ValidationException
        }
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (content.success) {
    throw new Error('Query should have failed with unused ExpressionAttributeNames');
  }

  if (!content.message || !content.message.includes('ValidationException')) {
    throw new Error(`Expected ValidationException, got: ${content.message}`);
  }

  if (!content.message.includes('unused in expressions')) {
    throw new Error(`Expected "unused in expressions" error, got: ${content.message}`);
  }
});

// Test 14: Force ValidationException - Scan with unused ExpressionAttributeNames
testRunner.addTest('Force ValidationException - Scan unused ExpressionAttributeNames', async () => {
  const query = {
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'scan_table',
      arguments: {
        tableName: TEST_DATA.validTableName,
        filterExpression: 'userId = :userId',
        expressionAttributeValues: {
          ':userId': TEST_DATA.validUserId
        },
        expressionAttributeNames: {
          '#unusedAttribute': 'unusedAttribute' // This should cause ValidationException
        }
      }
    }
  };

  const response = await testRunner.runMCPQuery(query);
  const content = JSON.parse(response.result.content[0].text);
  
  if (content.success) {
    throw new Error('Scan should have failed with unused ExpressionAttributeNames');
  }

  if (!content.message || !content.message.includes('ValidationException')) {
    throw new Error(`Expected ValidationException, got: ${content.message}`);
  }

  if (!content.message.includes('unused in expressions')) {
    throw new Error(`Expected "unused in expressions" error, got: ${content.message}`);
  }
});

// Run all tests
async function main() {
  console.log(`${colors.bold}${colors.yellow}Setting up test environment...${colors.reset}`);
  
  // Check if server files exist
  try {
    const serverPath = join(TEST_CONFIG.server.cwd, 'dist/index.js');
    readFileSync(serverPath);
  } catch (error) {
    console.log(`${colors.red}Server not found. Please run 'npm run build' first.${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✓ Server files found${colors.reset}`);
  console.log(`${colors.green}✓ Test environment ready${colors.reset}\n`);

  const success = await testRunner.runAllTests();
  process.exit(success ? 0 : 1);
}

// Handle process signals
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Tests interrupted by user${colors.reset}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(`${colors.red}Unhandled Rejection at: ${promise}, reason: ${reason}${colors.reset}`);
  process.exit(1);
});

// Run tests
main().catch(error => {
  console.error(`${colors.red}Test runner failed: ${error.message}${colors.reset}`);
  process.exit(1);
});