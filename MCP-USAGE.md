# MCP Configuration for Docker

Your DynamoDB MCP server is now available on Docker Hub as `yusuf2403/dynamodb-mcp-server:latest`!

## 🚀 MCP Configuration Examples

### Option 1: Full Configuration (with Neo4j)
```json
{
  "mcpServers": {
    "dynamodb-mcp-server": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}",
        "-e", "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}",
        "-e", "AWS_REGION=${AWS_REGION}",
        "-e", "AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN}",
        "-e", "NEO4J_URI=${NEO4J_URI}",
        "-e", "NEO4J_USERNAME=${NEO4J_USERNAME}",
        "-e", "NEO4J_PASSWORD=${NEO4J_PASSWORD}",
        "yusuf2403/dynamodb-mcp-server:latest"
      ],
      "env": {
        "AWS_ACCESS_KEY_ID": "your_aws_access_key_id",
        "AWS_SECRET_ACCESS_KEY": "your_aws_secret_access_key",
        "AWS_REGION": "us-east-1",
        "AWS_SESSION_TOKEN": "",
        "NEO4J_URI": "",
        "NEO4J_USERNAME": "",
        "NEO4J_PASSWORD": ""
      }
    }
  }
}
```

### Option 2: Minimal Configuration (DynamoDB only)
```json
{
  "mcpServers": {
    "dynamodb-mcp-server": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}",
        "-e", "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}",
        "-e", "AWS_REGION=${AWS_REGION}",
        "yusuf2403/dynamodb-mcp-server:latest"
      ],
      "env": {
        "AWS_ACCESS_KEY_ID": "your_aws_access_key_id",
        "AWS_SECRET_ACCESS_KEY": "your_aws_secret_access_key",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

### Option 3: With Neo4j Action Tracking
```json
{
  "mcpServers": {
    "dynamodb-mcp-server": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}",
        "-e", "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}",
        "-e", "AWS_REGION=${AWS_REGION}",
        "-e", "NEO4J_URI=${NEO4J_URI}",
        "-e", "NEO4J_USERNAME=${NEO4J_USERNAME}",
        "-e", "NEO4J_PASSWORD=${NEO4J_PASSWORD}",
        "yusuf2403/dynamodb-mcp-server:latest"
      ],
      "env": {
        "AWS_ACCESS_KEY_ID": "your_aws_access_key_id",
        "AWS_SECRET_ACCESS_KEY": "your_aws_secret_access_key",
        "AWS_REGION": "us-east-1",
        "NEO4J_URI": "neo4j+s://your-instance.databases.neo4j.io",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your_neo4j_password"
      }
    }
  }
}
```

## 📋 Setup Instructions

### 1. Choose Your Configuration
Copy one of the JSON configurations above to your MCP configuration file (typically `~/.mcp/config.json` or similar location depending on your MCP client).

### 2. Set Environment Variables
Replace the placeholder values with your actual credentials:

**Required:**
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `AWS_REGION`: AWS region (e.g., `us-east-1`)

**Optional:**
- `AWS_SESSION_TOKEN`: For temporary credentials
- `NEO4J_URI`: Your Neo4j database URI
- `NEO4J_USERNAME`: Neo4j username
- `NEO4J_PASSWORD`: Neo4j password

### 3. Test the Configuration
The MCP client will automatically pull the Docker image and start the server when needed.

## 🔧 Available Tools

### DynamoDB Operations (15 tools)
- `create_table` - Create a new DynamoDB table
- `list_tables` - List all tables
- `describe_table` - Get table details
- `put_item` - Insert/update an item
- `get_item` - Retrieve an item
- `query_table` - Query a table
- `scan_table` - Scan a table
- `update_item` - Update an item
- `update_capacity` - Update table capacity
- `create_gsi` - Create Global Secondary Index
- `update_gsi` - Update GSI capacity
- `create_lsi` - Create Local Secondary Index

### Assistant Management (3 tools)
- `get_assistant_by_id` - Get assistant by ID
- `search_assistants_by_name` - Search assistants by name
- `upassistant_put_item` - Put assistant item

### Cognito Operations (1 tool)
- `find_user_by_email` - Find user by email

### Neo4j Action Tracking (4 tools - optional)
- `get_similar_actions` - Find similar actions
- `get_user_history` - Get user action history
- `suggest_next_action` - Suggest next action
- `get_action_recommendations` - Get action recommendations

## 🚨 Important Notes

1. **Docker Required**: The MCP client must have Docker installed and running
2. **Internet Access**: The Docker image will be pulled from Docker Hub on first use
3. **Neo4j Optional**: If Neo4j credentials are not provided, action tracking will be disabled but DynamoDB functionality will work normally
4. **Security**: Never commit actual credentials to version control - use environment variables or secure credential storage

## 🧪 Testing

You can test the Docker image directly:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | docker run -i \
  -e AWS_ACCESS_KEY_ID=your_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret \
  -e AWS_REGION=us-east-1 \
  yusuf2403/dynamodb-mcp-server:latest
```

## 🔄 Updates

The Docker image will be automatically updated when you push new versions. Users can get the latest version by pulling the image:
```bash
docker pull yusuf2403/dynamodb-mcp-server:latest
```

## 📖 More Information

- **Docker Hub**: https://hub.docker.com/r/yusuf2403/dynamodb-mcp-server
- **GitHub**: Your repository URL
- **Documentation**: See `DOCKER.md` and `DEPLOYMENT.md` for detailed deployment options