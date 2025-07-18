#!/usr/bin/env node

/**
 * Test Runner - Executes all test suites
 * Runs functional, performance, and integration tests
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// Test configuration
const TEST_SUITE_CONFIG = {
  timeout: 300000, // 5 minutes total
  tests: [
    {
      name: 'Functional Tests',
      file: 'query-tool.test.js',
      description: 'Core query functionality and tool validation',
      required: true
    },
    {
      name: 'Performance Tests',
      file: 'performance.test.js',
      description: 'Performance benchmarks and scalability',
      required: false
    },
    {
      name: 'Integration Tests',
      file: 'integration.test.js',
      description: 'End-to-end workflow validation',
      required: true
    }
  ]
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
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

class TestSuiteRunner {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      testResults: []
    };
    this.startTime = Date.now();
  }

  async runTestFile(testFile) {
    return new Promise((resolve, reject) => {
      const testPath = join(process.cwd(), 'tests', testFile);
      
      const testProcess = spawn('node', [testPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';
      let timeout;

      timeout = setTimeout(() => {
        testProcess.kill();
        reject(new Error('Test suite timeout'));
      }, TEST_SUITE_CONFIG.timeout);

      testProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Real-time output
        process.stdout.write(output);
      });

      testProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        // Real-time error output
        process.stderr.write(output);
      });

      testProcess.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          code,
          stdout,
          stderr
        });
      });

      testProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async runSuite(testSuite) {
    console.log(`${colors.bold}${colors.blue}🧪 Running ${testSuite.name}${colors.reset}`);
    console.log(`${colors.dim}   ${testSuite.description}${colors.reset}`);
    console.log(`${colors.dim}   File: ${testSuite.file}${colors.reset}\n`);

    const startTime = Date.now();

    try {
      const result = await this.runTestFile(testSuite.file);
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (result.success) {
        console.log(`\n${colors.green}✅ ${testSuite.name} - PASSED${colors.reset} (${duration}ms)`);
        this.results.passed++;
      } else {
        console.log(`\n${colors.red}❌ ${testSuite.name} - FAILED${colors.reset} (${duration}ms)`);
        this.results.failed++;
      }

      this.results.testResults.push({
        name: testSuite.name,
        file: testSuite.file,
        success: result.success,
        duration,
        required: testSuite.required
      });

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`\n${colors.red}💥 ${testSuite.name} - ERROR${colors.reset} (${duration}ms)`);
      console.log(`${colors.red}   Error: ${error.message}${colors.reset}`);
      
      this.results.failed++;
      this.results.testResults.push({
        name: testSuite.name,
        file: testSuite.file,
        success: false,
        duration,
        error: error.message,
        required: testSuite.required
      });
    }

    this.results.total++;
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  }

  async runAllTests() {
    console.log(`${colors.bold}${colors.magenta}🚀 DynamoDB MCP Server Test Suite${colors.reset}`);
    console.log(`${colors.magenta}Running comprehensive test validation...${colors.reset}\n`);

    // Pre-flight checks
    await this.preflightChecks();

    // Run all test suites
    for (const testSuite of TEST_SUITE_CONFIG.tests) {
      await this.runSuite(testSuite);
    }

    // Print final results
    this.printFinalResults();
  }

  async preflightChecks() {
    console.log(`${colors.bold}${colors.yellow}🔍 Pre-flight Checks${colors.reset}`);

    // Check if build exists
    try {
      const serverPath = join(process.cwd(), 'dist/index.js');
      readFileSync(serverPath);
      console.log(`${colors.green}✅ Server build found${colors.reset}`);
    } catch (error) {
      console.log(`${colors.red}❌ Server build not found${colors.reset}`);
      console.log(`${colors.yellow}   Please run 'npm run build' first${colors.reset}`);
      process.exit(1);
    }

    // Check if test files exist
    for (const testSuite of TEST_SUITE_CONFIG.tests) {
      try {
        const testPath = join(process.cwd(), 'tests', testSuite.file);
        readFileSync(testPath);
        console.log(`${colors.green}✅ ${testSuite.name} test file found${colors.reset}`);
      } catch (error) {
        console.log(`${colors.red}❌ ${testSuite.name} test file not found${colors.reset}`);
        process.exit(1);
      }
    }

    // Check environment
    if (process.env.NODE_ENV === 'production') {
      console.log(`${colors.yellow}⚠️  Running in production mode${colors.reset}`);
    }

    // Check for required environment variables
    const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      console.log(`${colors.red}❌ Missing environment variables: ${missingEnvVars.join(', ')}${colors.reset}`);
      console.log(`${colors.yellow}   Some tests may fail without proper AWS credentials${colors.reset}`);
    } else {
      console.log(`${colors.green}✅ AWS credentials configured${colors.reset}`);
    }

    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  }

  printFinalResults() {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;

    console.log(`${colors.bold}${colors.cyan}📊 Final Test Results${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    
    // Summary statistics
    console.log(`${colors.green}Passed: ${this.results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.results.failed}${colors.reset}`);
    console.log(`${colors.yellow}Skipped: ${this.results.skipped}${colors.reset}`);
    console.log(`Total: ${this.results.total}`);
    
    console.log(`\n${colors.bold}Execution Time: ${totalDuration}ms${colors.reset}`);

    // Detailed results
    if (this.results.testResults.length > 0) {
      console.log(`\n${colors.bold}Test Suite Details:${colors.reset}`);
      this.results.testResults.forEach(result => {
        const icon = result.success ? '✅' : '❌';
        const color = result.success ? colors.green : colors.red;
        const required = result.required ? '(required)' : '(optional)';
        
        console.log(`  ${icon} ${result.name} - ${color}${result.success ? 'PASSED' : 'FAILED'}${colors.reset} ${colors.dim}${required}${colors.reset}`);
        console.log(`    ${colors.dim}Duration: ${result.duration}ms${colors.reset}`);
        
        if (result.error) {
          console.log(`    ${colors.red}Error: ${result.error}${colors.reset}`);
        }
      });
    }

    // Determine overall success
    const requiredTestsFailed = this.results.testResults.filter(r => r.required && !r.success).length;
    const optionalTestsFailed = this.results.testResults.filter(r => !r.required && !r.success).length;
    
    console.log(`\n${colors.bold}Overall Result:${colors.reset}`);
    
    if (requiredTestsFailed === 0) {
      console.log(`${colors.green}✅ ALL REQUIRED TESTS PASSED!${colors.reset}`);
      
      if (optionalTestsFailed > 0) {
        console.log(`${colors.yellow}⚠️  ${optionalTestsFailed} optional test(s) failed${colors.reset}`);
      }
      
      console.log(`${colors.green}🎉 Test suite completed successfully!${colors.reset}`);
    } else {
      console.log(`${colors.red}❌ ${requiredTestsFailed} REQUIRED TEST(S) FAILED!${colors.reset}`);
      console.log(`${colors.red}💥 Test suite failed!${colors.reset}`);
    }

    // Performance summary
    const avgDuration = this.results.testResults.reduce((sum, r) => sum + r.duration, 0) / this.results.testResults.length;
    console.log(`\n${colors.dim}Average test duration: ${avgDuration.toFixed(2)}ms${colors.reset}`);
    
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    
    // Exit with appropriate code
    const exitCode = requiredTestsFailed === 0 ? 0 : 1;
    console.log(`${colors.dim}Exiting with code: ${exitCode}${colors.reset}\n`);
    
    return exitCode;
  }
}

// Generate test report
function generateTestReport(results) {
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      skipped: results.skipped
    },
    testResults: results.testResults,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };

  try {
    const reportPath = join(process.cwd(), 'test-report.json');
    import('fs').then(fs => {
      fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`${colors.dim}Test report saved to: ${reportPath}${colors.reset}`);
    });
  } catch (error) {
    console.log(`${colors.yellow}Warning: Could not save test report: ${error.message}${colors.reset}`);
  }
}

// Main execution
async function main() {
  const testRunner = new TestSuiteRunner();
  
  try {
    await testRunner.runAllTests();
    generateTestReport(testRunner.results);
    
    // Exit with appropriate code
    const requiredTestsFailed = testRunner.results.testResults.filter(r => r.required && !r.success).length;
    process.exit(requiredTestsFailed === 0 ? 0 : 1);
    
  } catch (error) {
    console.error(`${colors.red}💥 Test runner failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}🛑 Test suite interrupted by user${colors.reset}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(`${colors.red}💥 Unhandled Rejection at: ${promise}, reason: ${reason}${colors.reset}`);
  process.exit(1);
});

// Run all tests
main();