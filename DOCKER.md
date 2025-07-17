# Docker Deployment Guide

This guide explains how to deploy the DynamoDB MCP Server using Docker.

## Prerequisites

- Docker installed and running
- Valid AWS credentials
- (Optional) Neo4j database for action tracking

## Building the Docker Image

1. **Build the image:**
   ```bash
   docker build -t dynamodb-mcp-server .
   ```

   > **Note**: The build process uses yarn for dependency management and includes a multi-stage build for optimal image size.

## Running the Container

### Basic Usage (DynamoDB only)

```bash
docker run -it \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret_key \
  -e AWS_REGION=us-east-1 \
  dynamodb-mcp-server
```

### With Neo4j Action Tracking

```bash
docker run -it \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret_key \
  -e AWS_REGION=us-east-1 \
  -e NEO4J_URI=neo4j+s://your-neo4j-instance.databases.neo4j.io \
  -e NEO4J_USERNAME=neo4j \
  -e NEO4J_PASSWORD=your_neo4j_password \
  dynamodb-mcp-server
```

### Using Environment File

Create a `.env` file:
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
NEO4J_URI=neo4j+s://your-neo4j-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password
```

Run with environment file:
```bash
docker run -it --env-file .env dynamodb-mcp-server
```

## Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  dynamodb-mcp:
    build: .
    environment:
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_REGION=${AWS_REGION:-us-east-1}
      - NEO4J_URI=${NEO4J_URI}
      - NEO4J_USERNAME=${NEO4J_USERNAME}
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
    stdin_open: true
    tty: true
    restart: unless-stopped
```

Run with Docker Compose:
```bash
docker-compose up
```

## Environment Variables

### Required
- `AWS_ACCESS_KEY_ID`: AWS Access Key ID
- `AWS_SECRET_ACCESS_KEY`: AWS Secret Access Key
- `AWS_REGION`: AWS region (e.g., us-east-1)

### Optional
- `AWS_SESSION_TOKEN`: AWS Session Token for temporary credentials
- `NEO4J_URI`: Neo4j database URI for action tracking
- `NEO4J_USERNAME`: Neo4j username
- `NEO4J_PASSWORD`: Neo4j password

## Testing the Container

Test the server by sending a JSON-RPC request:

```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | docker run -i \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret_key \
  -e AWS_REGION=us-east-1 \
  dynamodb-mcp-server
```

## Available Tools

The server provides 19 tools:

### DynamoDB Operations
- `create_table`: Create a new DynamoDB table
- `list_tables`: List all tables
- `describe_table`: Get table details
- `put_item`: Insert/update an item
- `get_item`: Retrieve an item
- `query_table`: Query a table
- `scan_table`: Scan a table
- `update_item`: Update an item
- `update_capacity`: Update table capacity
- `create_gsi`: Create Global Secondary Index
- `update_gsi`: Update GSI capacity
- `create_lsi`: Create Local Secondary Index

### Assistant Management
- `get_assistant_by_id`: Get assistant by ID
- `search_assistants_by_name`: Search assistants by name
- `upassistant_put_item`: Put assistant item

### Cognito Operations
- `find_user_by_email`: Find user by email

### Neo4j Action Tracking (Optional)
- `get_similar_actions`: Find similar actions
- `get_user_history`: Get user action history
- `suggest_next_action`: Suggest next action
- `get_action_recommendations`: Get action recommendations

## Troubleshooting

### Neo4j Connection Issues
If Neo4j environment variables are not provided or connection fails, the server will:
- Log a warning message
- Disable action tracking features
- Continue running with DynamoDB functionality

### AWS Permission Issues
Ensure your AWS credentials have the necessary permissions for:
- DynamoDB operations
- Cognito operations (if using user lookup features)

### Container Exits Immediately
The server runs as a stdio-based MCP server. Use `-it` flags to keep it interactive:
```bash
docker run -it dynamodb-mcp-server
```

## Security Notes

- Never hardcode credentials in the Dockerfile
- Use environment variables or secrets management
- The container runs as a non-root user for security
- Consider using AWS IAM roles when running in AWS environments

## Building for Production

For production deployment, consider:
1. Using multi-stage builds (already implemented)
2. Scanning for vulnerabilities
3. Using specific version tags
4. Implementing health checks
5. Using secrets management systems