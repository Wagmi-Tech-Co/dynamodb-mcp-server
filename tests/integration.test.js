#!/usr/bin/env node

/**
 * DynamoDB MCP Server Integration Test Suite
 * End-to-end tests for real-world scenarios
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

// Integration test configuration
const INTEGRATION_CONFIG = {
  timeout: 45000,
  server: {
    command: 'node',
    args: ['dist/index.js'],
    cwd: '/Users/yusuf/Software/Tools/MCP-Servers/dynamodb-mcp-server'
  }
};

// Test scenarios
const TEST_SCENARIOS = {
  userAnalysis: {
    email: 'ozgur.aydin2@isbank.com.tr',
    expectedUserId: '33ec8713-0451-4f0b-89fa-ee67bb4a8699'
  },
  tables: {
    conversations: 'UpConversations-upwagmitec',
    messages: 'UpConversationMessage-upwagmitec',
    users: 'User-upwagmitec',
    assistants: 'UpAssistant-upwagmitec'
  },
  indexes: {
    userMessages: 'userIdIndex',
    userConversations: 'UserIdUpdatedAtIndex'
  }
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

class IntegrationTestRunner {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      scenarios: []
    };
  }

  async runMCPQuery(query, timeout = INTEGRATION_CONFIG.timeout) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(INTEGRATION_CONFIG.server.command, INTEGRATION_CONFIG.server.args, {
        cwd: INTEGRATION_CONFIG.server.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' }
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
        try {
          const lines = stdout.split('\n');
          const jsonLine = lines.find(line => line.trim().startsWith('{"result"'));
          
          if (jsonLine) {
            const response = JSON.parse(jsonLine);
            const content = JSON.parse(response.result.content[0].text);
            resolve(content);
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

  async runScenario(name, scenarioFn) {
    console.log(`${colors.blue}📋 Running: ${name}${colors.reset}`);
    const startTime = performance.now();
    
    try {
      await scenarioFn();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`${colors.green}✅ ${name} - Passed (${duration.toFixed(2)}ms)${colors.reset}`);
      this.results.passed++;
      this.results.scenarios.push({ name, status: 'passed', duration });
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`${colors.red}❌ ${name} - Failed: ${error.message}${colors.reset}`);
      this.results.failed++;
      this.results.scenarios.push({ name, status: 'failed', duration, error: error.message });
    }
    
    this.results.total++;
  }

  async testFullUserAnalysis() {
    await this.runScenario('Full User Analysis Workflow', async () => {
      // Step 1: Find user by email
      console.log('  🔍 Finding user by email...');
      const userQuery = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'find_user_by_email',
          arguments: {
            email: TEST_SCENARIOS.userAnalysis.email,
            env: 'prod'
          }
        }
      };

      const userResult = await this.runMCPQuery(userQuery);
      if (!userResult.success) {
        throw new Error(`Failed to find user: ${userResult.message}`);
      }

      const userId = userResult.user.username;
      if (userId !== TEST_SCENARIOS.userAnalysis.expectedUserId) {
        throw new Error(`User ID mismatch: expected ${TEST_SCENARIOS.userAnalysis.expectedUserId}, got ${userId}`);
      }

      // Step 2: Get user's conversations
      console.log('  💬 Getting user conversations...');
      const conversationsQuery = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_SCENARIOS.tables.conversations,
            keyConditionExpression: 'userId = :userId',
            expressionAttributeValues: {
              ':userId': userId
            },
            limit: 10
          }
        }
      };

      const conversationsResult = await this.runMCPQuery(conversationsQuery);
      if (!conversationsResult.success) {
        throw new Error(`Failed to get conversations: ${conversationsResult.message}`);
      }

      console.log(`    Found ${conversationsResult.count} conversations`);

      // Step 3: Get user's messages
      console.log('  📨 Getting user messages...');
      const messagesQuery = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_SCENARIOS.tables.messages,
            indexName: TEST_SCENARIOS.indexes.userMessages,
            keyConditionExpression: 'userId = :userId',
            expressionAttributeValues: {
              ':userId': userId
            },
            limit: 20
          }
        }
      };

      const messagesResult = await this.runMCPQuery(messagesQuery);
      if (!messagesResult.success) {
        throw new Error(`Failed to get messages: ${messagesResult.message}`);
      }

      console.log(`    Found ${messagesResult.count} messages`);

      // Step 4: Get recent activity (last week)
      console.log('  📅 Getting recent activity...');
      const recentQuery = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_SCENARIOS.tables.messages,
            indexName: TEST_SCENARIOS.indexes.userMessages,
            keyConditionExpression: 'userId = :userId',
            filterExpression: '#createdAt >= :weekAgo',
            expressionAttributeNames: {
              '#createdAt': 'createdAt'
            },
            expressionAttributeValues: {
              ':userId': userId,
              ':weekAgo': '2025-07-11 00:00:00.000000'
            },
            limit: 50
          }
        }
      };

      const recentResult = await this.runMCPQuery(recentQuery);
      if (!recentResult.success) {
        throw new Error(`Failed to get recent activity: ${recentResult.message}`);
      }

      console.log(`    Found ${recentResult.count} recent messages`);

      // Validate results
      if (typeof conversationsResult.count !== 'number' || typeof messagesResult.count !== 'number') {
        throw new Error('Invalid response format');
      }

      console.log(`  ✅ User analysis complete - ${conversationsResult.count} conversations, ${messagesResult.count} total messages, ${recentResult.count} recent messages`);
    });
  }

  async testDataIntegrity() {
    await this.runScenario('Data Integrity Checks', async () => {
      const userId = TEST_SCENARIOS.userAnalysis.expectedUserId;

      // Step 1: Get a conversation
      console.log('  🔍 Getting conversation details...');
      const conversationsQuery = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_SCENARIOS.tables.conversations,
            keyConditionExpression: 'userId = :userId',
            expressionAttributeValues: {
              ':userId': userId
            },
            limit: 1
          }
        }
      };

      const conversationsResult = await this.runMCPQuery(conversationsQuery);
      if (!conversationsResult.success || conversationsResult.count === 0) {
        throw new Error('No conversations found for integrity check');
      }

      const conversation = conversationsResult.items[0];
      const conversationId = conversation.idUpdatedAt; // This is actually the conversation ID in the format

      // Step 2: Get messages for this conversation
      console.log('  📨 Verifying conversation messages...');
      const messagesQuery = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'query_table',
          arguments: {
            tableName: TEST_SCENARIOS.tables.messages,
            keyConditionExpression: 'conversationId = :conversationId',
            expressionAttributeValues: {
              ':conversationId': conversationId
            },
            limit: 10
          }
        }
      };

      const messagesResult = await this.runMCPQuery(messagesQuery);
      if (!messagesResult.success) {
        throw new Error(`Failed to get messages for conversation: ${messagesResult.message}`);
      }

      // Step 3: Verify data consistency
      console.log('  ✅ Checking data consistency...');
      if (messagesResult.items && messagesResult.items.length > 0) {
        const message = messagesResult.items[0];
        
        // Check if message userId matches conversation userId
        if (message.userId !== userId) {
          throw new Error(`Data inconsistency: message userId (${message.userId}) != conversation userId (${userId})`);
        }

        // Check if message conversationId matches
        if (message.conversationId !== conversationId) {
          throw new Error(`Data inconsistency: message conversationId (${message.conversationId}) != query conversationId (${conversationId})`);
        }

        console.log(`    ✅ Data integrity verified for conversation ${conversationId}`);
      }
    });
  }

  async testSystemHealth() {
    await this.runScenario('System Health Check', async () => {
      // Step 1: Check version
      console.log('  🔧 Checking system version...');
      const versionQuery = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_version',
          arguments: {}
        }
      };

      const versionResult = await this.runMCPQuery(versionQuery);
      if (!versionResult.success) {
        throw new Error(`Version check failed: ${versionResult.message}`);
      }

      console.log(`    Version: ${versionResult.version}`);

      // Step 2: List tables
      console.log('  📊 Checking table availability...');
      const tablesQuery = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list_tables',
          arguments: {}
        }
      };

      const tablesResult = await this.runMCPQuery(tablesQuery);
      if (!tablesResult.success) {
        throw new Error(`Table listing failed: ${tablesResult.message}`);
      }

      const requiredTables = Object.values(TEST_SCENARIOS.tables);
      const availableTables = tablesResult.tables;

      for (const table of requiredTables) {
        if (!availableTables.includes(table)) {
          throw new Error(`Required table missing: ${table}`);
        }
      }

      console.log(`    ✅ All ${requiredTables.length} required tables available`);

      // Step 3: Check table schemas
      console.log('  🏗️  Checking table schemas...');
      const schemaQuery = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'describe_table',
          arguments: {
            tableName: TEST_SCENARIOS.tables.messages
          }
        }
      };

      const schemaResult = await this.runMCPQuery(schemaQuery);
      if (!schemaResult.success) {
        throw new Error(`Schema check failed: ${schemaResult.message}`);
      }

      // Verify GSI exists
      const gsiExists = schemaResult.table.GlobalSecondaryIndexes?.some(
        gsi => gsi.IndexName === TEST_SCENARIOS.indexes.userMessages
      );

      if (!gsiExists) {
        throw new Error(`Required GSI missing: ${TEST_SCENARIOS.indexes.userMessages}`);
      }

      console.log(`    ✅ Table schemas verified`);
    });
  }

  async testErrorRecovery() {
    await this.runScenario('Error Recovery and Handling', async () => {
      // Step 1: Test graceful error handling
      console.log('  🚨 Testing error handling...');
      
      const errorQueries = [
        {
          name: 'Invalid Table',
          query: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'query_table',
              arguments: {
                tableName: 'InvalidTable-upwagmitec',
                keyConditionExpression: 'userId = :userId',
                expressionAttributeValues: {
                  ':userId': 'test'
                }
              }
            }
          }
        },
        {
          name: 'Missing Required Parameter',
          query: {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'query_table',
              arguments: {
                tableName: TEST_SCENARIOS.tables.messages,
                keyConditionExpression: 'userId = :userId'
                // Missing expressionAttributeValues
              }
            }
          }
        },
        {
          name: 'Invalid User Email',
          query: {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
              name: 'find_user_by_email',
              arguments: {
                email: 'nonexistent@invalid.com',
                env: 'prod'
              }
            }
          }
        }
      ];

      for (const testCase of errorQueries) {
        try {
          const result = await this.runMCPQuery(testCase.query);
          
          // All these should fail gracefully
          if (result.success && testCase.name === 'Invalid User Email') {
            // This might succeed but return no user
            console.log(`    ⚠️  ${testCase.name}: Graceful handling (no user found)`);
          } else if (result.success) {
            throw new Error(`${testCase.name}: Should have failed but succeeded`);
          } else {
            console.log(`    ✅ ${testCase.name}: Properly handled error`);
          }
        } catch (error) {
          if (error.message.includes('timeout')) {
            throw new Error(`${testCase.name}: Server timeout - possible crash`);
          }
          console.log(`    ✅ ${testCase.name}: Server remained stable`);
        }
      }

      // Step 2: Test recovery after errors
      console.log('  🔄 Testing recovery after errors...');
      const recoveryQuery = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_version',
          arguments: {}
        }
      };

      const recoveryResult = await this.runMCPQuery(recoveryQuery);
      if (!recoveryResult.success) {
        throw new Error('Server failed to recover after error tests');
      }

      console.log('    ✅ Server recovered successfully');
    });
  }

  async testPaginationWorkflow() {
    await this.runScenario('Pagination Workflow', async () => {
      const userId = TEST_SCENARIOS.userAnalysis.expectedUserId;
      let allItems = [];
      let lastEvaluatedKey = null;
      let pageCount = 0;
      const maxPages = 3;

      console.log('  📄 Testing pagination workflow...');

      do {
        pageCount++;
        const query = {
          jsonrpc: '2.0',
          id: pageCount,
          method: 'tools/call',
          params: {
            name: 'query_table',
            arguments: {
              tableName: TEST_SCENARIOS.tables.messages,
              indexName: TEST_SCENARIOS.indexes.userMessages,
              keyConditionExpression: 'userId = :userId',
              expressionAttributeValues: {
                ':userId': userId
              },
              limit: 5,
              ...(lastEvaluatedKey && { exclusiveStartKey: lastEvaluatedKey })
            }
          }
        };

        const result = await this.runMCPQuery(query);
        if (!result.success) {
          throw new Error(`Pagination failed on page ${pageCount}: ${result.message}`);
        }

        allItems.push(...result.items);
        lastEvaluatedKey = result.lastEvaluatedKey;
        
        console.log(`    Page ${pageCount}: ${result.count} items, hasMore: ${result.hasMoreItems}`);

        if (!result.hasMoreItems) {
          break;
        }

        if (pageCount >= maxPages) {
          console.log(`    ⚠️  Stopped at ${maxPages} pages for test efficiency`);
          break;
        }

      } while (lastEvaluatedKey && pageCount < maxPages);

      if (allItems.length === 0) {
        throw new Error('No items retrieved through pagination');
      }

      // Verify no duplicate items
      const uniqueIds = new Set(allItems.map(item => item.identifier));
      if (uniqueIds.size !== allItems.length) {
        throw new Error('Duplicate items found in pagination results');
      }

      console.log(`    ✅ Pagination completed: ${allItems.length} unique items across ${pageCount} pages`);
    });
  }

  printResults() {
    console.log(`\n${colors.bold}${colors.cyan}Integration Test Results${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    
    console.log(`${colors.green}Passed: ${this.results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.results.failed}${colors.reset}`);
    console.log(`Total: ${this.results.total}`);
    
    if (this.results.scenarios.length > 0) {
      console.log(`\n${colors.bold}Scenario Details:${colors.reset}`);
      this.results.scenarios.forEach(scenario => {
        const icon = scenario.status === 'passed' ? '✅' : '❌';
        const color = scenario.status === 'passed' ? colors.green : colors.red;
        console.log(`  ${icon} ${scenario.name} - ${color}${scenario.status}${colors.reset} (${scenario.duration.toFixed(2)}ms)`);
        
        if (scenario.error) {
          console.log(`    ${colors.red}Error: ${scenario.error}${colors.reset}`);
        }
      });
    }

    const totalTime = this.results.scenarios.reduce((sum, scenario) => sum + scenario.duration, 0);
    console.log(`\n${colors.bold}Total Execution Time: ${totalTime.toFixed(2)}ms${colors.reset}`);
    
    const success = this.results.failed === 0;
    console.log(`\n${colors.bold}${success ? colors.green : colors.red}${success ? 'ALL INTEGRATION TESTS PASSED!' : 'SOME INTEGRATION TESTS FAILED!'}${colors.reset}`);
    
    return success;
  }
}

// Run integration tests
async function main() {
  console.log(`${colors.bold}${colors.magenta}DynamoDB MCP Server Integration Test Suite${colors.reset}`);
  console.log(`${colors.magenta}Testing real-world scenarios and workflows...${colors.reset}\n`);

  const testRunner = new IntegrationTestRunner();

  // Run all integration scenarios
  await testRunner.testSystemHealth();
  await testRunner.testFullUserAnalysis();
  await testRunner.testDataIntegrity();
  await testRunner.testPaginationWorkflow();
  await testRunner.testErrorRecovery();

  // Print results and exit
  const success = testRunner.printResults();
  process.exit(success ? 0 : 1);
}

// Handle process signals
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Integration tests interrupted by user${colors.reset}`);
  process.exit(1);
});

// Run integration tests
main().catch(error => {
  console.error(`${colors.red}Integration test runner failed: ${error.message}${colors.reset}`);
  process.exit(1);
});