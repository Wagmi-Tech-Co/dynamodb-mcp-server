#!/usr/bin/env node
import { spawn } from "child_process";

// Test the MCP server's prompts functionality
async function testPrompts() {
  console.log("Testing DynamoDB MCP Server prompts functionality...");

  const server = spawn("node", ["dist/index.js"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Test prompts/list request
  const listPromptsRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "prompts/list",
    params: {},
  };

  return new Promise((resolve, reject) => {
    let output = "";
    let hasReceivedResponse = false;

    server.stdout.on("data", (data) => {
      output += data.toString();
      try {
        const lines = output.split("\n").filter((line) => line.trim());
        for (const line of lines) {
          if (line.trim()) {
            const response = JSON.parse(line);
            if (response.id === 1 && !hasReceivedResponse) {
              hasReceivedResponse = true;
              console.log(
                "✅ Server response:",
                JSON.stringify(response, null, 2)
              );

              if (response.error) {
                console.log("❌ Error: Method still not found");
                reject(new Error("Method not found"));
              } else if (response.result && response.result.prompts) {
                console.log(
                  `✅ Success! Found ${response.result.prompts.length} prompts`
                );
                response.result.prompts.forEach((prompt) => {
                  console.log(`   - ${prompt.name}: ${prompt.description}`);
                });
                resolve(response);
              } else {
                console.log("⚠️  Unexpected response format");
                reject(new Error("Unexpected response"));
              }

              server.kill();
              return;
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors for partial data
      }
    });

    server.stderr.on("data", (data) => {
      console.log("Server stderr:", data.toString());
    });

    server.on("error", (error) => {
      console.error("❌ Failed to start server:", error);
      reject(error);
    });

    // Send the request
    setTimeout(() => {
      console.log("📤 Sending prompts/list request...");
      server.stdin.write(JSON.stringify(listPromptsRequest) + "\n");
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!hasReceivedResponse) {
        console.log("❌ Timeout: No response received");
        server.kill();
        reject(new Error("Timeout"));
      }
    }, 5000);
  });
}

testPrompts().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
