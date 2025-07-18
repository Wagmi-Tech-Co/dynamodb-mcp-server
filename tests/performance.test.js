#!/usr/bin/env node

/**
 * DynamoDB MCP Server Performance Test Suite
 * Tests for query performance, memory usage, and scalability
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

// Performance test configuration
const PERF_CONFIG = {
  timeout: 60000,
  iterations: 10,
  concurrency: 5,
  server: {
    command: 'node',
    args: ['dist/index.js'],
    cwd: '/Users/yusuf/Software/Tools/MCP-Servers/dynamodb-mcp-server'
  }
};

// Test data
const TEST_DATA = {
  userId: '33ec8713-0451-4f0b-89fa-ee67bb4a8699',
  tableName: 'UpConversationMessage-upwagmitec',
  indexName: 'userIdIndex'
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class PerformanceTestRunner {
  constructor() {
    this.results = {
      queryTimes: [],
      memoryUsage: [],
      errors: [],
      concurrentResults: []
    };
  }

  async runMCPQuery(query, timeout = PERF_CONFIG.timeout) {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      const childProcess = spawn(PERF_CONFIG.server.command, PERF_CONFIG.server.args, {
        cwd: PERF_CONFIG.server.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';
      let timeoutHandle;

      timeoutHandle = setTimeout(() => {
        childProcess.kill();
        reject(new Error('Query timeout'));
      }, timeout);

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const endTime = performance.now();
        const duration = endTime - startTime;

        try {
          const lines = stdout.split('\n');
          const jsonLine = lines.find(line => line.trim().startsWith('{"result"'));
          
          if (jsonLine) {
            const response = JSON.parse(jsonLine);
            const content = JSON.parse(response.result.content[0].text);
            
            resolve({
              success: content.success,
              duration,
              content,
              memoryUsage: childProcess.memoryUsage ? childProcess.memoryUsage() : null
            });
          } else {
            reject(new Error(`No JSON response found. stderr: ${stderr}`));
          }
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });

      childProcess.stdin.write(JSON.stringify(query) + '\n');
      childProcess.stdin.end();
    });
  }

  async testQueryPerformance() {
    console.log(`${colors.blue}Testing query performance (${PERF_CONFIG.iterations} iterations)...${colors.reset}`);
    
    const query = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'query_table',
        arguments: {
          tableName: TEST_DATA.tableName,
          indexName: TEST_DATA.indexName,
          keyConditionExpression: 'userId = :userId',
          expressionAttributeValues: {
            ':userId': TEST_DATA.userId
          },
          limit: 10
        }
      }
    };

    const times = [];
    const errors = [];

    for (let i = 0; i < PERF_CONFIG.iterations; i++) {
      try {
        const result = await this.runMCPQuery(query);
        times.push(result.duration);
        
        if (result.memoryUsage) {
          this.results.memoryUsage.push(result.memoryUsage);
        }
        
        process.stdout.write(`${colors.green}.${colors.reset}`);
      } catch (error) {
        errors.push(error.message);
        process.stdout.write(`${colors.red}x${colors.reset}`);
      }
    }

    console.log('');
    
    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const medianTime = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

      console.log(`${colors.green}Performance Results:${colors.reset}`);
      console.log(`  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Median: ${medianTime.toFixed(2)}ms`);
      console.log(`  Min: ${minTime.toFixed(2)}ms`);
      console.log(`  Max: ${maxTime.toFixed(2)}ms`);
      console.log(`  Success Rate: ${((times.length / PERF_CONFIG.iterations) * 100).toFixed(1)}%`);

      this.results.queryTimes = times;
    }

    if (errors.length > 0) {
      console.log(`${colors.red}Errors: ${errors.length}${colors.reset}`);
      this.results.errors = errors;
    }

    return times.length > 0;
  }

  async testConcurrentQueries() {
    console.log(`${colors.blue}Testing concurrent queries (${PERF_CONFIG.concurrency} concurrent)...${colors.reset}`);
    
    const query = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'query_table',
        arguments: {
          tableName: TEST_DATA.tableName,
          indexName: TEST_DATA.indexName,
          keyConditionExpression: 'userId = :userId',
          expressionAttributeValues: {
            ':userId': TEST_DATA.userId
          },
          limit: 5
        }
      }
    };

    const startTime = performance.now();
    const promises = [];

    for (let i = 0; i < PERF_CONFIG.concurrency; i++) {
      promises.push(this.runMCPQuery(query));
    }

    try {
      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`${colors.green}Concurrent Query Results:${colors.reset}`);
      console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Successful: ${successful}/${PERF_CONFIG.concurrency}`);
      console.log(`  Failed: ${failed}/${PERF_CONFIG.concurrency}`);
      console.log(`  Avg Time per Query: ${(totalTime / PERF_CONFIG.concurrency).toFixed(2)}ms`);

      this.results.concurrentResults = results;
      return successful === PERF_CONFIG.concurrency;
    } catch (error) {
      console.log(`${colors.red}Concurrent test failed: ${error.message}${colors.reset}`);
      return false;
    }
  }

  async testMemoryUsage() {
    console.log(`${colors.blue}Testing memory usage patterns...${colors.reset}`);
    
    const queries = [
      // Small query
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_DATA.tableName,
            indexName: TEST_DATA.indexName,
            keyConditionExpression: 'userId = :userId',
            expressionAttributeValues: {
              ':userId': TEST_DATA.userId
            },
            limit: 1
          }
        }
      },
      // Medium query
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_DATA.tableName,
            indexName: TEST_DATA.indexName,
            keyConditionExpression: 'userId = :userId',
            expressionAttributeValues: {
              ':userId': TEST_DATA.userId
            },
            limit: 50
          }
        }
      },
      // Large query
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_DATA.tableName,
            indexName: TEST_DATA.indexName,
            keyConditionExpression: 'userId = :userId',
            expressionAttributeValues: {
              ':userId': TEST_DATA.userId
            },
            limit: 100
          }
        }
      }
    ];

    const memoryResults = [];

    for (const [index, query] of queries.entries()) {
      try {
        const result = await this.runMCPQuery(query);
        memoryResults.push({
          querySize: ['Small', 'Medium', 'Large'][index],
          duration: result.duration,
          itemCount: result.content.count,
          scannedCount: result.content.scannedCount
        });
        
        console.log(`${colors.green}✓ ${['Small', 'Medium', 'Large'][index]} query completed${colors.reset}`);
      } catch (error) {
        console.log(`${colors.red}✗ ${['Small', 'Medium', 'Large'][index]} query failed: ${error.message}${colors.reset}`);
      }
    }

    if (memoryResults.length > 0) {
      console.log(`${colors.green}Memory Test Results:${colors.reset}`);
      memoryResults.forEach(result => {
        console.log(`  ${result.querySize}: ${result.duration.toFixed(2)}ms, ${result.itemCount} items, ${result.scannedCount} scanned`);
      });
    }

    return memoryResults.length === queries.length;
  }

  async testErrorHandling() {
    console.log(`${colors.blue}Testing error handling performance...${colors.reset}`);
    
    const errorQueries = [
      // Missing table
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: 'NonExistentTable-upwagmitec',
            keyConditionExpression: 'userId = :userId',
            expressionAttributeValues: {
              ':userId': TEST_DATA.userId
            }
          }
        }
      },
      // Missing required params
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_DATA.tableName,
            keyConditionExpression: 'userId = :userId'
            // Missing expressionAttributeValues
          }
        }
      },
      // Invalid expression
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_DATA.tableName,
            keyConditionExpression: 'invalid expression syntax',
            expressionAttributeValues: {
              ':userId': TEST_DATA.userId
            }
          }
        }
      }
    ];

    const errorResults = [];

    for (const [index, query] of errorQueries.entries()) {
      try {
        const result = await this.runMCPQuery(query);
        errorResults.push({
          test: ['Missing Table', 'Missing Params', 'Invalid Expression'][index],
          duration: result.duration,
          handled: !result.success // Should be false for error cases
        });
        
        if (!result.success) {
          console.log(`${colors.green}✓ ${['Missing Table', 'Missing Params', 'Invalid Expression'][index]} error handled correctly${colors.reset}`);
        } else {
          console.log(`${colors.yellow}? ${['Missing Table', 'Missing Params', 'Invalid Expression'][index]} unexpectedly succeeded${colors.reset}`);
        }
      } catch (error) {
        console.log(`${colors.red}✗ ${['Missing Table', 'Missing Params', 'Invalid Expression'][index]} test failed: ${error.message}${colors.reset}`);
      }
    }

    if (errorResults.length > 0) {
      console.log(`${colors.green}Error Handling Results:${colors.reset}`);
      errorResults.forEach(result => {
        console.log(`  ${result.test}: ${result.duration.toFixed(2)}ms, handled: ${result.handled}`);
      });
    }

    return errorResults.length === errorQueries.length;
  }

  async testComplexQueries() {
    console.log(`${colors.blue}Testing complex query performance...${colors.reset}`);
    
    const complexQuery = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'query_table',
        arguments: {
          tableName: TEST_DATA.tableName,
          indexName: TEST_DATA.indexName,
          keyConditionExpression: 'userId = :userId',
          filterExpression: '#createdAt >= :startDate AND #createdAt <= :endDate AND #role = :role',
          projectionExpression: 'userId, createdAt, #role, #content',
          expressionAttributeNames: {
            '#createdAt': 'createdAt',
            '#role': 'role',
            '#content': 'content'
          },
          expressionAttributeValues: {
            ':userId': TEST_DATA.userId,
            ':startDate': '2025-01-01 00:00:00.000000',
            ':endDate': '2025-12-31 23:59:59.999999',
            ':role': 'user'
          },
          limit: 25,
          scanIndexForward: false
        }
      }
    };

    try {
      const result = await this.runMCPQuery(complexQuery);
      
      console.log(`${colors.green}Complex Query Results:${colors.reset}`);
      console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
      console.log(`  Success: ${result.success}`);
      console.log(`  Items: ${result.content.count}`);
      console.log(`  Scanned: ${result.content.scannedCount}`);
      console.log(`  Has More: ${result.content.hasMoreItems}`);
      
      return result.success;
    } catch (error) {
      console.log(`${colors.red}Complex query failed: ${error.message}${colors.reset}`);
      return false;
    }
  }

  printSummary() {
    console.log(`\n${colors.bold}${colors.cyan}Performance Test Summary${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);
    
    if (this.results.queryTimes.length > 0) {
      const avgTime = this.results.queryTimes.reduce((a, b) => a + b, 0) / this.results.queryTimes.length;
      console.log(`${colors.green}Average Query Time: ${avgTime.toFixed(2)}ms${colors.reset}`);
      
      // Performance assessment
      if (avgTime < 1000) {
        console.log(`${colors.green}Performance: Excellent${colors.reset}`);
      } else if (avgTime < 3000) {
        console.log(`${colors.yellow}Performance: Good${colors.reset}`);
      } else {
        console.log(`${colors.red}Performance: Needs Improvement${colors.reset}`);
      }
    }
    
    if (this.results.errors.length > 0) {
      console.log(`${colors.red}Total Errors: ${this.results.errors.length}${colors.reset}`);
    }
    
    console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  }
}

// Run performance tests
async function main() {
  console.log(`${colors.bold}${colors.magenta}DynamoDB MCP Server Performance Test Suite${colors.reset}`);
  console.log(`${colors.magenta}Testing server performance and scalability...${colors.reset}\n`);

  const testRunner = new PerformanceTestRunner();
  const testResults = [];

  // Run all performance tests
  testResults.push(await testRunner.testQueryPerformance());
  testResults.push(await testRunner.testConcurrentQueries());
  testResults.push(await testRunner.testMemoryUsage());
  testResults.push(await testRunner.testErrorHandling());
  testResults.push(await testRunner.testComplexQueries());

  // Print summary
  testRunner.printSummary();

  const allPassed = testResults.every(result => result);
  const passedCount = testResults.filter(result => result).length;
  
  console.log(`\n${colors.bold}Overall Result: ${allPassed ? colors.green : colors.red}${passedCount}/${testResults.length} tests passed${colors.reset}`);
  
  process.exit(allPassed ? 0 : 1);
}

// Handle process signals
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Performance tests interrupted by user${colors.reset}`);
  process.exit(1);
});

// Run performance tests
main().catch(error => {
  console.error(`${colors.red}Performance test runner failed: ${error.message}${colors.reset}`);
  process.exit(1);
});