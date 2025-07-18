#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Tool,
  Prompt,
} from "@modelcontextprotocol/sdk/types.js";
import {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminGetUserCommand,
  AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { z } from "zod";
// Neo4j dependencies removed

// AWS client initialization
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const awsSessionToken = process.env.AWS_SESSION_TOKEN;
const awsRegion = process.env.AWS_REGION || "us-east-1";

let dynamoClient: DynamoDBClient | null = null;
let cognitoClient: CognitoIdentityProviderClient | null = null;

if (!awsAccessKeyId || !awsSecretAccessKey) {
  console.warn(
    "AWS credentials not provided. AWS operations will be disabled."
  );
  console.warn(
    "To enable AWS operations, set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables."
  );
} else {
  const credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  } = {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  };

  if (awsSessionToken) {
    credentials.sessionToken = awsSessionToken;
  }

  dynamoClient = new DynamoDBClient({
    region: awsRegion,
    credentials,
  });

  cognitoClient = new CognitoIdentityProviderClient({
    region: awsRegion,
    credentials,
  });
}

console.error(`AWS clients initialized with region: ${awsRegion}`);

// Neo4j Action Tracker removed

// Define tools
const VERSION_TOOL: Tool = {
  name: "get_version",
  description: "Get the version of the DynamoDB MCP server",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const CREATE_TABLE_TOOL: Tool = {
  name: "create_table",
  description: "Creates a new DynamoDB table with specified configuration",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table to create" },
      partitionKey: {
        type: "string",
        description: "Name of the partition key",
      },
      partitionKeyType: {
        type: "string",
        enum: ["S", "N", "B"],
        description: "Type of partition key (S=String, N=Number, B=Binary)",
      },
      sortKey: {
        type: "string",
        description: "Name of the sort key (optional)",
      },
      sortKeyType: {
        type: "string",
        enum: ["S", "N", "B"],
        description: "Type of sort key (optional)",
      },
      readCapacity: {
        type: "number",
        description: "Provisioned read capacity units",
      },
      writeCapacity: {
        type: "number",
        description: "Provisioned write capacity units",
      },
    },
    required: [
      "tableName",
      "partitionKey",
      "partitionKeyType",
      "readCapacity",
      "writeCapacity",
    ],
  },
};

const LIST_TABLES_TOOL: Tool = {
  name: "list_tables",
  description: "Lists all DynamoDB tables in the account",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of tables to return (optional)",
      },
      exclusiveStartTableName: {
        type: "string",
        description:
          "Name of the table to start from for pagination (optional)",
      },
    },
  },
};

const CREATE_GSI_TOOL: Tool = {
  name: "create_gsi",
  description: "Creates a global secondary index on a table",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      indexName: { type: "string", description: "Name of the new index" },
      partitionKey: {
        type: "string",
        description: "Partition key for the index",
      },
      partitionKeyType: {
        type: "string",
        enum: ["S", "N", "B"],
        description: "Type of partition key",
      },
      sortKey: {
        type: "string",
        description: "Sort key for the index (optional)",
      },
      sortKeyType: {
        type: "string",
        enum: ["S", "N", "B"],
        description: "Type of sort key (optional)",
      },
      projectionType: {
        type: "string",
        enum: ["ALL", "KEYS_ONLY", "INCLUDE"],
        description: "Type of projection",
      },
      nonKeyAttributes: {
        type: "array",
        items: { type: "string" },
        description: "Non-key attributes to project (optional)",
      },
      readCapacity: {
        type: "number",
        description: "Provisioned read capacity units",
      },
      writeCapacity: {
        type: "number",
        description: "Provisioned write capacity units",
      },
    },
    required: [
      "tableName",
      "indexName",
      "partitionKey",
      "partitionKeyType",
      "projectionType",
      "readCapacity",
      "writeCapacity",
    ],
  },
};

const UPDATE_GSI_TOOL: Tool = {
  name: "update_gsi",
  description: "Updates the provisioned capacity of a global secondary index",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      indexName: { type: "string", description: "Name of the index to update" },
      readCapacity: { type: "number", description: "New read capacity units" },
      writeCapacity: {
        type: "number",
        description: "New write capacity units",
      },
    },
    required: ["tableName", "indexName", "readCapacity", "writeCapacity"],
  },
};

const CREATE_LSI_TOOL: Tool = {
  name: "create_lsi",
  description:
    "Creates a local secondary index on a table (must be done during table creation)",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      indexName: { type: "string", description: "Name of the new index" },
      partitionKey: {
        type: "string",
        description: "Partition key for the table",
      },
      partitionKeyType: {
        type: "string",
        enum: ["S", "N", "B"],
        description: "Type of partition key",
      },
      sortKey: { type: "string", description: "Sort key for the index" },
      sortKeyType: {
        type: "string",
        enum: ["S", "N", "B"],
        description: "Type of sort key",
      },
      projectionType: {
        type: "string",
        enum: ["ALL", "KEYS_ONLY", "INCLUDE"],
        description: "Type of projection",
      },
      nonKeyAttributes: {
        type: "array",
        items: { type: "string" },
        description: "Non-key attributes to project (optional)",
      },
      readCapacity: {
        type: "number",
        description: "Provisioned read capacity units (optional, default: 5)",
      },
      writeCapacity: {
        type: "number",
        description: "Provisioned write capacity units (optional, default: 5)",
      },
    },
    required: [
      "tableName",
      "indexName",
      "partitionKey",
      "partitionKeyType",
      "sortKey",
      "sortKeyType",
      "projectionType",
    ],
  },
};

const UPDATE_ITEM_TOOL: Tool = {
  name: "update_item",
  description: "Updates specific attributes of an item in a table",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      key: { type: "object", description: "Primary key of the item to update" },
      updateExpression: {
        type: "string",
        description: "Update expression (e.g., 'SET #n = :name')",
      },
      expressionAttributeNames: {
        type: "object",
        description: "Attribute name mappings",
      },
      expressionAttributeValues: {
        type: "object",
        description: "Values for the update expression",
      },
      conditionExpression: {
        type: "string",
        description: "Condition for update (optional)",
      },
      returnValues: {
        type: "string",
        enum: ["NONE", "ALL_OLD", "UPDATED_OLD", "ALL_NEW", "UPDATED_NEW"],
        description: "What values to return",
      },
    },
    required: [
      "tableName",
      "key",
      "updateExpression",
      "expressionAttributeNames",
      "expressionAttributeValues",
    ],
  },
};

const UPDATE_CAPACITY_TOOL: Tool = {
  name: "update_capacity",
  description: "Updates the provisioned capacity of a table",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      readCapacity: { type: "number", description: "New read capacity units" },
      writeCapacity: {
        type: "number",
        description: "New write capacity units",
      },
    },
    required: ["tableName", "readCapacity", "writeCapacity"],
  },
};

const PUT_ITEM_TOOL: Tool = {
  name: "put_item",
  description: "Inserts or replaces an item in a table",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      item: { type: "object", description: "Item to put into the table" },
    },
    required: ["tableName", "item"],
  },
};

const GET_ITEM_TOOL: Tool = {
  name: "get_item",
  description: "Retrieves an item from a table by its primary key",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      key: {
        type: "object",
        description: "Primary key of the item to retrieve",
      },
    },
    required: ["tableName", "key"],
  },
};

const QUERY_TABLE_TOOL: Tool = {
  name: "query_table",
  description: "Queries a DynamoDB table using key conditions and optional filters. Optimized for high performance with comprehensive response metadata.",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { 
        type: "string", 
        description: "Name of the table to query" 
      },
      keyConditionExpression: {
        type: "string",
        description: "Key condition expression (e.g., 'userId = :userId')",
      },
      expressionAttributeValues: {
        type: "object",
        description: "Values for the key condition expression (e.g., {':userId': 'user-123'})",
      },
      indexName: {
        type: "string",
        description: "Name of the Global Secondary Index to query (optional)",
        optional: true,
      },
      expressionAttributeNames: {
        type: "object",
        description: "Attribute name mappings for reserved words (e.g., {'#createdAt': 'createdAt'})",
        optional: true,
      },
      filterExpression: {
        type: "string",
        description: "Filter expression for additional filtering (e.g., '#createdAt >= :date')",
        optional: true,
      },
      projectionExpression: {
        type: "string",
        description: "Attributes to retrieve (e.g., 'userId, email, createdAt')",
        optional: true,
      },
      limit: {
        type: "number",
        description: "Maximum number of items to return (1-1000)",
        optional: true,
      },
      scanIndexForward: {
        type: "boolean",
        description: "Sort order for range key: true = ascending, false = descending",
        optional: true,
      },
      exclusiveStartKey: {
        type: "object",
        description: "Pagination key from previous query's lastEvaluatedKey",
        optional: true,
      },
    },
    required: [
      "tableName",
      "keyConditionExpression",
      "expressionAttributeValues",
    ],
  },
};

const SCAN_TABLE_TOOL: Tool = {
  name: "scan_table",
  description: "Scans an entire table with optional filters",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      filterExpression: {
        type: "string",
        description: "Filter expression",
        optional: true,
      },
      expressionAttributeValues: {
        type: "object",
        description: "Values for the filter expression",
        optional: true,
      },
      expressionAttributeNames: {
        type: "object",
        description: "Attribute name mappings",
        optional: true,
      },
      limit: {
        type: "number",
        description: "Maximum number of items to return",
        optional: true,
      },
    },
    required: ["tableName"],
  },
};

const DESCRIBE_TABLE_TOOL: Tool = {
  name: "describe_table",
  description: "Gets detailed information about a DynamoDB table",
  inputSchema: {
    type: "object",
    properties: {
      tableName: {
        type: "string",
        description: "Name of the table to describe",
      },
    },
    required: ["tableName"],
  },
};

const GET_ASSISTANT_BY_ID_TOOL: Tool = {
  name: "get_assistant_by_id",
  description:
    "Retrieves an UpAssistant item by id from the correct table based on environment (uat/prod)",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "ID of the item to retrieve" },
      env: {
        type: "string",
        enum: ["uat", "prod"],
        description: "Environment: 'uat' or 'prod'",
      },
    },
    required: ["id", "env"],
  },
};

const SEARCH_ASSISTANTS_BY_NAME_TOOL: Tool = {
  name: "search_assistants_by_name",
  description:
    "Searches for UpAssistant items by name from the correct table based on environment (uat/prod). Can return multiple items.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name to search for" },
      env: {
        type: "string",
        enum: ["uat", "prod"],
        description: "Environment: 'uat' or 'prod'",
      },
      limit: {
        type: "number",
        description: "Maximum number of items to return (optional)",
        optional: true,
      },
    },
    required: ["name", "env"],
  },
};

const UPASSISTANT_PUT_ITEM_TOOL: Tool = {
  name: "upassistant_put_item",
  description:
    "Puts an UpAssistant item into the correct table based on environment (uat/prod)",
  inputSchema: {
    type: "object",
    properties: {
      item: {
        type: "object",
        description: "Item to put into the table (as JSON object)",
      },
      env: {
        type: "string",
        enum: ["uat", "prod"],
        description: "Environment: 'uat' or 'prod'",
      },
    },
    required: ["item", "env"],
  },
};

const FIND_USER_BY_EMAIL_TOOL: Tool = {
  name: "find_user_by_email",
  description: "Finds a user by email in Cognito and returns their attributes.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Email of the user to find" },
      env: {
        type: "string",
        enum: ["uat", "prod"],
        description: "Environment: 'uat' or 'prod'",
      },
    },
    required: ["email", "env"],
  },
};

const UpAssistantGetItemByIdParamsSchema = z.object({
  id: z.string(),
  env: z.enum(["uat", "prod"]),
});

const SearchAssistantsByNameParamsSchema = z.object({
  name: z.string(),
  env: z.enum(["uat", "prod"]),
  limit: z.number().optional(),
});

const AssistantMessageSchema = z.object({
  type: z.string(),
  value: z.string(),
});

const AssistantTemplateItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  type: z.string(),
  value: z.array(z.any()), // Assuming value can be an array of any type for now
});

const AssistantItemSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  description: z.string(),
  extra: z.object({}).passthrough().optional(), // Making extra optional and flexible
  frequencyPenalty: z.string(),
  introductionMessages: z.array(AssistantMessageSchema),
  maxTokens: z.string(),
  modelName: z.string(),
  name: z.string(),
  presencePenalty: z.string(),
  prompt: z.string(),
  src: z.string().url(),
  status: z.boolean(),
  temperature: z.string(),
  template: z.array(AssistantTemplateItemSchema),
  title: z.string(),
  topP: z.string(),
  type: z.string(),
  updatedAt: z.string().datetime(),
  userId: z.string(),
});

const UpAssistantPutItemParamsSchema = z.object({
  item: AssistantItemSchema,
  env: z.enum(["uat", "prod"]),
});

const FindUserByEmailParamsSchema = z.object({
  email: z.string().email(),
  env: z.enum(["uat", "prod"]),
});

function getUpAssistantTableName(env: string): string {
  if (env === "uat") return "UpAssistant-myenv";
  if (env === "prod") return "UpAssistant-upwagmitec";
  throw new Error(`Invalid env: ${env}`);
}

function getCognitoUserPoolId(env: string): string {
  if (env === "uat") return "us-east-1_akkBktCUt";
  if (env === "prod") return "us-east-1_tTejiiLwi";
  throw new Error(`Invalid env for Cognito: ${env}`);
}

// Implementation functions
async function createTable(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new CreateTableCommand({
      TableName: params.tableName,
      AttributeDefinitions: [
        {
          AttributeName: params.partitionKey,
          AttributeType: params.partitionKeyType,
        },
        ...(params.sortKey
          ? [
              {
                AttributeName: params.sortKey,
                AttributeType: params.sortKeyType,
              },
            ]
          : []),
      ],
      KeySchema: [
        { AttributeName: params.partitionKey, KeyType: "HASH" as const },
        ...(params.sortKey
          ? [{ AttributeName: params.sortKey, KeyType: "RANGE" as const }]
          : []),
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: params.readCapacity,
        WriteCapacityUnits: params.writeCapacity,
      },
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Table ${params.tableName} created successfully`,
      details: response.TableDescription,
    };
  } catch (error) {
    console.error("Error creating table:", error);
    return {
      success: false,
      message: `Failed to create table: ${error}`,
    };
  }
}

async function listTables(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new ListTablesCommand({
      Limit: params.limit,
      ExclusiveStartTableName: params.exclusiveStartTableName,
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: "Tables listed successfully",
      tables: response.TableNames,
      lastEvaluatedTable: response.LastEvaluatedTableName,
    };
  } catch (error) {
    console.error("Error listing tables:", error);
    return {
      success: false,
      message: `Failed to list tables: ${error}`,
    };
  }
}

async function createGSI(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new UpdateTableCommand({
      TableName: params.tableName,
      AttributeDefinitions: [
        {
          AttributeName: params.partitionKey,
          AttributeType: params.partitionKeyType,
        },
        ...(params.sortKey
          ? [
              {
                AttributeName: params.sortKey,
                AttributeType: params.sortKeyType,
              },
            ]
          : []),
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: params.indexName,
            KeySchema: [
              { AttributeName: params.partitionKey, KeyType: "HASH" as const },
              ...(params.sortKey
                ? [{ AttributeName: params.sortKey, KeyType: "RANGE" as const }]
                : []),
            ],
            Projection: {
              ProjectionType: params.projectionType,
              ...(params.projectionType === "INCLUDE"
                ? { NonKeyAttributes: params.nonKeyAttributes }
                : {}),
            },
            ProvisionedThroughput: {
              ReadCapacityUnits: params.readCapacity,
              WriteCapacityUnits: params.writeCapacity,
            },
          },
        },
      ],
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `GSI ${params.indexName} creation initiated on table ${params.tableName}`,
      details: response.TableDescription,
    };
  } catch (error) {
    console.error("Error creating GSI:", error);
    return {
      success: false,
      message: `Failed to create GSI: ${error}`,
    };
  }
}

async function updateGSI(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new UpdateTableCommand({
      TableName: params.tableName,
      GlobalSecondaryIndexUpdates: [
        {
          Update: {
            IndexName: params.indexName,
            ProvisionedThroughput: {
              ReadCapacityUnits: params.readCapacity,
              WriteCapacityUnits: params.writeCapacity,
            },
          },
        },
      ],
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `GSI ${params.indexName} capacity updated on table ${params.tableName}`,
      details: response.TableDescription,
    };
  } catch (error) {
    console.error("Error updating GSI:", error);
    return {
      success: false,
      message: `Failed to update GSI: ${error}`,
    };
  }
}

async function createLSI(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    // Note: LSIs must be created during table creation, so we need the table's primary key info
    const command = new CreateTableCommand({
      TableName: params.tableName,
      AttributeDefinitions: [
        {
          AttributeName: params.partitionKey,
          AttributeType: params.partitionKeyType,
        },
        { AttributeName: params.sortKey, AttributeType: params.sortKeyType },
      ],
      KeySchema: [
        { AttributeName: params.partitionKey, KeyType: "HASH" as const },
      ],
      LocalSecondaryIndexes: [
        {
          IndexName: params.indexName,
          KeySchema: [
            { AttributeName: params.partitionKey, KeyType: "HASH" as const },
            { AttributeName: params.sortKey, KeyType: "RANGE" as const },
          ],
          Projection: {
            ProjectionType: params.projectionType,
            ...(params.projectionType === "INCLUDE"
              ? { NonKeyAttributes: params.nonKeyAttributes }
              : {}),
          },
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: params.readCapacity || 5,
        WriteCapacityUnits: params.writeCapacity || 5,
      },
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `LSI ${params.indexName} created on table ${params.tableName}`,
      details: response.TableDescription,
    };
  } catch (error) {
    console.error("Error creating LSI:", error);
    return {
      success: false,
      message: `Failed to create LSI: ${error}`,
    };
  }
}

async function updateItem(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new UpdateItemCommand({
      TableName: params.tableName,
      Key: marshall(params.key),
      UpdateExpression: params.updateExpression,
      ExpressionAttributeNames: params.expressionAttributeNames,
      ExpressionAttributeValues: marshall(params.expressionAttributeValues),
      ConditionExpression: params.conditionExpression,
      ReturnValues: params.returnValues || "NONE",
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Item updated successfully in table ${params.tableName}`,
      attributes: response.Attributes ? unmarshall(response.Attributes) : null,
    };
  } catch (error) {
    console.error("Error updating item:", error);
    return {
      success: false,
      message: `Failed to update item: ${error}`,
    };
  }
}

async function updateCapacity(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new UpdateTableCommand({
      TableName: params.tableName,
      ProvisionedThroughput: {
        ReadCapacityUnits: params.readCapacity,
        WriteCapacityUnits: params.writeCapacity,
      },
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Capacity updated successfully for table ${params.tableName}`,
      details: response.TableDescription,
    };
  } catch (error) {
    console.error("Error updating capacity:", error);
    return {
      success: false,
      message: `Failed to update capacity: ${error}`,
    };
  }
}

async function putItem(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new PutItemCommand({
      TableName: params.tableName,
      Item: marshall(params.item),
    });

    await dynamoClient.send(command);
    return {
      success: true,
      message: `Item added successfully to table ${params.tableName}`,
      item: params.item,
    };
  } catch (error) {
    console.error("Error putting item:", error);
    return {
      success: false,
      message: `Failed to put item: ${error}`,
    };
  }
}

async function getItem(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new GetItemCommand({
      TableName: params.tableName,
      Key: marshall(params.key),
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Item retrieved successfully from table ${params.tableName}`,
      item: response.Item ? unmarshall(response.Item) : null,
    };
  } catch (error) {
    console.error("Error getting item:", error);
    return {
      success: false,
      message: `Failed to get item: ${error}`,
    };
  }
}

async function queryTable(params: any) {
  // Validate parameters before AWS operations
  if (!params.tableName) {
    return {
      success: false,
      message: "tableName is required",
    };
  }

  if (!params.keyConditionExpression) {
    return {
      success: false,
      message: "keyConditionExpression is required",
    };
  }

  // Check for empty ExpressionAttributeValues
  if (params.expressionAttributeValues && Object.keys(params.expressionAttributeValues).length === 0) {
    return {
      success: false,
      message: "ValidationException: ExpressionAttributeValues must not be empty",
    };
  }

  if (!dynamoClient) {
    return {
      success: false,
      message: "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    // Build query parameters step by step
    const queryParams: any = {
      TableName: params.tableName,
      KeyConditionExpression: params.keyConditionExpression,
    };

    // Add expression attribute values - REQUIRED for key condition
    if (params.expressionAttributeValues) {
      queryParams.ExpressionAttributeValues = marshall(params.expressionAttributeValues);
    } else {
      return {
        success: false,
        message: "expressionAttributeValues is required for query operations",
      };
    }

    // Add expression attribute names - only if provided and not empty
    if (params.expressionAttributeNames && Object.keys(params.expressionAttributeNames).length > 0) {
      queryParams.ExpressionAttributeNames = params.expressionAttributeNames;
    }

    // Add filter expression - only if provided
    if (params.filterExpression) {
      queryParams.FilterExpression = params.filterExpression;
    }

    // Add limit - only if provided
    if (params.limit && params.limit > 0) {
      queryParams.Limit = params.limit;
    }

    // Add index name - only if provided
    if (params.indexName) {
      queryParams.IndexName = params.indexName;
    }

    // Add projection expression - only if provided
    if (params.projectionExpression) {
      queryParams.ProjectionExpression = params.projectionExpression;
    }

    // Add scan index forward - only if provided
    if (params.scanIndexForward !== undefined) {
      queryParams.ScanIndexForward = params.scanIndexForward;
    }

    // Add exclusive start key for pagination - only if provided
    if (params.exclusiveStartKey) {
      queryParams.ExclusiveStartKey = marshall(params.exclusiveStartKey);
    }

    const command = new QueryCommand(queryParams);

    const response = await dynamoClient.send(command);
    
    // Build comprehensive response
    const result: any = {
      success: true,
      message: `Query executed successfully on table ${params.tableName}`,
      items: response.Items ? response.Items.map((item) => unmarshall(item)) : [],
      count: response.Count || 0,
      scannedCount: response.ScannedCount || 0,
    };

    // Add pagination info if available
    if (response.LastEvaluatedKey) {
      result.lastEvaluatedKey = unmarshall(response.LastEvaluatedKey);
      result.hasMoreItems = true;
    } else {
      result.hasMoreItems = false;
    }

    // Add capacity information if available
    if (response.ConsumedCapacity) {
      result.consumedCapacity = response.ConsumedCapacity;
    }

    // Add query metadata
    result.queryMetadata = {
      tableName: params.tableName,
      indexName: params.indexName || "primary",
      keyConditionExpression: params.keyConditionExpression,
      filterExpression: params.filterExpression || null,
      limit: params.limit || null,
      scanIndexForward: params.scanIndexForward !== undefined ? params.scanIndexForward : true,
    };

    return result;
  } catch (error) {
    console.error("Error querying table:", error);
    return {
      success: false,
      message: `Failed to query table: ${error}`,
      error: error instanceof Error ? error.message : String(error),
      queryMetadata: {
        tableName: params.tableName,
        indexName: params.indexName || "primary",
        keyConditionExpression: params.keyConditionExpression,
      },
    };
  }
}

async function scanTable(params: any) {
  // Validate parameters before AWS operations
  if (!params.tableName) {
    return {
      success: false,
      message: "tableName is required",
    };
  }

  // Check for empty ExpressionAttributeValues
  if (params.expressionAttributeValues && Object.keys(params.expressionAttributeValues).length === 0) {
    return {
      success: false,
      message: "ValidationException: ExpressionAttributeValues must not be empty",
    };
  }

  if (!dynamoClient) {
    return {
      success: false,
      message: "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    // Build scan parameters step by step
    const scanParams: any = {
      TableName: params.tableName,
    };

    // Add filter expression - only if provided
    if (params.filterExpression) {
      scanParams.FilterExpression = params.filterExpression;
    }

    // Add expression attribute values - only if provided and not empty
    if (params.expressionAttributeValues) {
      scanParams.ExpressionAttributeValues = marshall(params.expressionAttributeValues);
    }

    // Add expression attribute names - only if provided and not empty
    if (params.expressionAttributeNames && Object.keys(params.expressionAttributeNames).length > 0) {
      scanParams.ExpressionAttributeNames = params.expressionAttributeNames;
    }

    // Add limit - only if provided and positive
    if (params.limit && params.limit > 0) {
      scanParams.Limit = params.limit;
    }

    // Add index name - only if provided
    if (params.indexName) {
      scanParams.IndexName = params.indexName;
    }

    // Add projection expression - only if provided
    if (params.projectionExpression) {
      scanParams.ProjectionExpression = params.projectionExpression;
    }

    // Add select parameter - only if provided
    if (params.select) {
      scanParams.Select = params.select;
    }

    // Add segment and total segments for parallel scans - only if provided
    if (params.segment !== undefined && params.totalSegments !== undefined) {
      scanParams.Segment = params.segment;
      scanParams.TotalSegments = params.totalSegments;
    }

    // Add exclusive start key for pagination - only if provided
    if (params.exclusiveStartKey) {
      scanParams.ExclusiveStartKey = marshall(params.exclusiveStartKey);
    }

    // Add consistent read - only if provided
    if (params.consistentRead !== undefined) {
      scanParams.ConsistentRead = params.consistentRead;
    }

    // Add return consumed capacity - only if provided
    if (params.returnConsumedCapacity) {
      scanParams.ReturnConsumedCapacity = params.returnConsumedCapacity;
    }

    const command = new ScanCommand(scanParams);

    const response = await dynamoClient.send(command);
    
    // Build comprehensive response
    const result: any = {
      success: true,
      message: `Scan executed successfully on table ${params.tableName}`,
      items: response.Items ? response.Items.map((item) => unmarshall(item)) : [],
      count: response.Count || 0,
      scannedCount: response.ScannedCount || 0,
    };

    // Add pagination info if available
    if (response.LastEvaluatedKey) {
      result.lastEvaluatedKey = unmarshall(response.LastEvaluatedKey);
      result.hasMoreItems = true;
    } else {
      result.hasMoreItems = false;
    }

    // Add capacity information if available
    if (response.ConsumedCapacity) {
      result.consumedCapacity = response.ConsumedCapacity;
    }

    // Add scan metadata
    result.scanMetadata = {
      tableName: params.tableName,
      indexName: params.indexName || "primary",
      filterExpression: params.filterExpression || null,
      limit: params.limit || null,
      segment: params.segment || null,
      totalSegments: params.totalSegments || null,
      consistentRead: params.consistentRead || false,
      select: params.select || null,
    };

    return result;
  } catch (error) {
    console.error("Error scanning table:", error);
    return {
      success: false,
      message: `Failed to scan table: ${error}`,
      error: error instanceof Error ? error.message : String(error),
      scanMetadata: {
        tableName: params.tableName,
        indexName: params.indexName || "primary",
        filterExpression: params.filterExpression || null,
      },
    };
  }
}

async function describeTable(params: any) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const command = new DescribeTableCommand({
      TableName: params.tableName,
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Table ${params.tableName} described successfully`,
      table: response.Table,
    };
  } catch (error) {
    console.error("Error describing table:", error);
    return {
      success: false,
      message: `Failed to describe table: ${error}`,
    };
  }
}

async function getAssistantById(
  params: z.infer<typeof UpAssistantGetItemByIdParamsSchema>
) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const validatedParams = UpAssistantGetItemByIdParamsSchema.parse(params);
    const tableName = getUpAssistantTableName(validatedParams.env);
    const command = new GetItemCommand({
      TableName: tableName,
      Key: marshall({ id: validatedParams.id }),
    });
    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Item retrieved from ${tableName}`,
      item: response.Item ? unmarshall(response.Item) : null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Invalid parameters for getAssistantById",
        errors: error.errors,
      };
    }
    console.error("Error in getAssistantById:", error);
    return {
      success: false,
      message: `Failed to get item: ${error}`,
    };
  }
}

async function searchAssistantsByName(
  params: z.infer<typeof SearchAssistantsByNameParamsSchema>
) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const validatedParams = SearchAssistantsByNameParamsSchema.parse(params);
    const tableName = getUpAssistantTableName(validatedParams.env);
    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: "contains(#nm, :name_val)",
      ExpressionAttributeNames: { "#nm": "name" },
      ExpressionAttributeValues: marshall({
        ":name_val": validatedParams.name,
      }),
      Limit: validatedParams.limit,
    });
    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Items matching name '${validatedParams.name}' retrieved from ${tableName}`,
      items: response.Items
        ? response.Items.map((item) => unmarshall(item))
        : [],
      count: response.Count,
      scannedCount: response.ScannedCount,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Invalid parameters for searchAssistantsByName",
        errors: error.errors,
      };
    }
    console.error("Error in searchAssistantsByName:", error);
    return {
      success: false,
      message: `Failed to search items by name: ${error}`,
    };
  }
}

async function upAssistantPutItem(
  params: z.infer<typeof UpAssistantPutItemParamsSchema>
) {
  if (!dynamoClient) {
    return {
      success: false,
      message:
        "AWS DynamoDB client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const validatedParams = UpAssistantPutItemParamsSchema.parse(params);
    const tableName = getUpAssistantTableName(validatedParams.env);
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(validatedParams.item),
    });
    await dynamoClient.send(command);
    return {
      success: true,
      message: `Item added to ${tableName}`,
      item: validatedParams.item,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Invalid parameters for upAssistantPutItem",
        errors: error.errors,
      };
    }
    console.error("Error in upAssistantPutItem:", error);
    return {
      success: false,
      message: `Failed to put item: ${error}`,
    };
  }
}

async function findUserByEmail(
  params: z.infer<typeof FindUserByEmailParamsSchema>
) {
  if (!cognitoClient) {
    return {
      success: false,
      message:
        "AWS Cognito client not initialized. Please provide AWS credentials.",
    };
  }

  try {
    const validatedParams = FindUserByEmailParamsSchema.parse(params);
    const userPoolId = getCognitoUserPoolId(validatedParams.env);
    const emailToSearch = validatedParams.email;

    // Attempt 1: Use AdminGetUserCommand (if email can be a username)
    try {
      const adminGetUserResponse = await cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: emailToSearch,
        })
      );

      if (adminGetUserResponse.UserAttributes) {
        const attributes = adminGetUserResponse.UserAttributes.reduce(
          (acc: Record<string, string | undefined>, attr: AttributeType) => {
            if (attr.Name) acc[attr.Name] = attr.Value;
            return acc;
          },
          {} as Record<string, string | undefined>
        );
        return {
          success: true,
          message: `User found successfully using AdminGetUser in ${validatedParams.env}`,
          user: {
            username: adminGetUserResponse.Username,
            attributes: attributes,
            userStatus: adminGetUserResponse.UserStatus,
            enabled: adminGetUserResponse.Enabled,
            userCreateDate: adminGetUserResponse.UserCreateDate,
            userLastModifiedDate: adminGetUserResponse.UserLastModifiedDate,
          },
        };
      }
    } catch (adminGetUserError: any) {
      // If AdminGetUser fails (e.g., UserNotFoundException, or email is not the username format),
      // log the error and proceed to ListUsers.
      console.warn(
        `AdminGetUserCommand failed for ${emailToSearch} (will attempt ListUsers): ${adminGetUserError.name} - ${adminGetUserError.message}`
      );
    }

    // Attempt 2: Use ListUsersCommand with a filter
    const listUsersResponse = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${emailToSearch}"`,
        Limit: 1,
      })
    );

    if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
      const user = listUsersResponse.Users[0];
      const attributes = user.Attributes?.reduce(
        (acc: Record<string, string | undefined>, attr: AttributeType) => {
          if (attr.Name) acc[attr.Name] = attr.Value;
          return acc;
        },
        {} as Record<string, string | undefined>
      );
      return {
        success: true,
        message: `User found successfully using ListUsers in ${validatedParams.env}`,
        user: {
          username: user.Username,
          attributes: attributes,
          userStatus: user.UserStatus,
          enabled: user.Enabled,
          userCreateDate: user.UserCreateDate,
          userLastModifiedDate: user.UserLastModifiedDate,
        },
      };
    } else {
      return {
        success: false,
        message: `User with email ${emailToSearch} not found in ${validatedParams.env} using ListUsers.`,
      };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Invalid parameters for findUserByEmail",
        errors: error.errors,
      };
    }
    console.error("Error in findUserByEmail:", error);
    return {
      success: false,
      message: `Failed to find user by email due to an unexpected error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// Simple user analytics functions
async function getUserMessageStatsSimple(params: {
  userId: string;
  days?: number;
}) {
  try {
    if (!dynamoClient) {
      return { success: false, message: "DynamoDB client not initialized" };
    }

    const days = params.days || 7;

    const queryParams: any = {
      TableName: "UpConversationMessage-upwagmitec",
      IndexName: "userIdIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: marshall({
        ":userId": params.userId,
      }),
      Limit: 1000,
    };

    const command = new QueryCommand(queryParams);
    const response = await dynamoClient.send(command);
    const items = response.Items
      ? response.Items.map((item) => unmarshall(item))
      : [];

    const stats = {
      totalMessages: items.length,
      userMessages: items.filter((m) => m.role === "user").length,
      assistantMessages: items.filter((m) => m.role === "assistant").length,
      widgetMessages: items.filter((m) => m.type === "widget").length,
      recentMessages: items.slice(0, 10),
    };

    return {
      success: true,
      message: `Message statistics for user ${params.userId} (${items.length} total messages)`,
      stats,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to get message stats: ${error.message}`,
    };
  }
}

async function getUserConversationStatsSimple(params: {
  userId: string;
  days?: number;
}) {
  try {
    if (!dynamoClient) {
      return { success: false, message: "DynamoDB client not initialized" };
    }

    const queryParams: any = {
      TableName: "UpConversations-upwagmitec",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: marshall({
        ":userId": params.userId,
      }),
      Limit: 1000,
    };

    const command = new QueryCommand(queryParams);
    const response = await dynamoClient.send(command);
    const items = response.Items
      ? response.Items.map((item) => unmarshall(item))
      : [];

    const stats = {
      totalConversations: items.length,
      recentConversations: items.slice(0, 10),
      assistantTypes: {},
    };

    return {
      success: true,
      message: `Conversation statistics for user ${params.userId} (${items.length} total conversations)`,
      stats,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to get conversation stats: ${error.message}`,
    };
  }
}

async function getUserWeeklyActivitySimple(params: {
  userId: string;
  startDate?: string;
  endDate?: string;
}) {
  try {
    const messageStats = await getUserMessageStatsSimple({
      userId: params.userId,
    });
    const conversationStats = await getUserConversationStatsSimple({
      userId: params.userId,
    });

    return {
      success: true,
      message: `Weekly activity for user ${params.userId}`,
      activity: {
        messages: messageStats.success ? messageStats.stats : null,
        conversations: conversationStats.success
          ? conversationStats.stats
          : null,
        summary: {
          totalMessages: messageStats.success
            ? messageStats.stats?.totalMessages || 0
            : 0,
          totalConversations: conversationStats.success
            ? conversationStats.stats?.totalConversations || 0
            : 0,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to get weekly activity: ${error.message}`,
    };
  }
}

// Server setup
const server = new Server(
  {
    name: "dynamodb-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// Define prompts
const PROMPTS: Prompt[] = [
  {
    name: "create_dynamodb_table",
    description: "Helps create a DynamoDB table with proper configuration",
    arguments: [
      {
        name: "table_purpose",
        description: "What the table will be used for",
        required: true,
      },
      {
        name: "primary_key_type",
        description: "Type of primary key needed (simple or composite)",
        required: false,
      },
    ],
  },
  {
    name: "query_optimization",
    description: "Provides guidance on optimizing DynamoDB queries",
    arguments: [
      {
        name: "table_name",
        description: "Name of the table to optimize",
        required: true,
      },
      {
        name: "access_patterns",
        description: "Description of how data will be accessed",
        required: false,
      },
    ],
  },
  {
    name: "troubleshoot_dynamodb",
    description: "Helps troubleshoot common DynamoDB issues",
    arguments: [
      {
        name: "error_description",
        description: "Description of the error or issue",
        required: true,
      },
      {
        name: "operation_type",
        description: "Type of operation that failed (query, scan, put, etc.)",
        required: false,
      },
    ],
  },
];

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    VERSION_TOOL,
    CREATE_TABLE_TOOL,
    UPDATE_CAPACITY_TOOL,
    PUT_ITEM_TOOL,
    GET_ITEM_TOOL,
    QUERY_TABLE_TOOL,
    SCAN_TABLE_TOOL,
    DESCRIBE_TABLE_TOOL,
    LIST_TABLES_TOOL,
    CREATE_GSI_TOOL,
    UPDATE_GSI_TOOL,
    CREATE_LSI_TOOL,
    UPDATE_ITEM_TOOL,
    GET_ASSISTANT_BY_ID_TOOL,
    SEARCH_ASSISTANTS_BY_NAME_TOOL,
    UPASSISTANT_PUT_ITEM_TOOL,
    FIND_USER_BY_EMAIL_TOOL,
    {
      name: "get_user_message_stats",
      description: "Gets comprehensive message statistics for a user",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID to analyze" },
          days: {
            type: "number",
            description: "Number of days to analyze (default: 7)",
          },
        },
        required: ["userId"],
      },
    },
    {
      name: "get_user_conversation_stats",
      description: "Gets comprehensive conversation statistics for a user",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID to analyze" },
          days: {
            type: "number",
            description: "Number of days to analyze (default: 7)",
          },
        },
        required: ["userId"],
      },
    },
    {
      name: "get_user_weekly_activity",
      description:
        "Gets user's complete weekly activity report with messages and conversations",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID to analyze" },
          startDate: {
            type: "string",
            description: "Start date (YYYY-MM-DD format)",
          },
          endDate: {
            type: "string",
            description: "End date (YYYY-MM-DD format)",
          },
        },
        required: ["userId"],
      },
    },
    // Neo4j action tools removed
  ],
}));

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const promptArgs = args || {};

  switch (name) {
    case "create_dynamodb_table":
      const tablePurpose = promptArgs.table_purpose || "general purpose";
      const primaryKeyType = promptArgs.primary_key_type || "simple";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I need to create a DynamoDB table for ${tablePurpose}. I want a ${primaryKeyType} primary key. Please help me design the table schema and provide the create_table command with appropriate parameters.

Consider:
- Partition key selection for even data distribution
- Sort key if needed for ${
                primaryKeyType === "composite"
                  ? "composite primary key"
                  : "query patterns"
              }
- Appropriate capacity settings
- Any secondary indexes that might be needed

Please provide specific recommendations and the exact create_table tool call.`,
            },
          },
        ],
      };

    case "query_optimization":
      const tableName = promptArgs.table_name || "your_table";
      const accessPatterns = promptArgs.access_patterns || "not specified";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I need help optimizing queries for the DynamoDB table "${tableName}". 

Access patterns: ${accessPatterns}

Please analyze and provide:
1. Current table structure (use describe_table if needed)
2. Query optimization recommendations
3. Whether GSI/LSI would help
4. Best practices for the described access patterns
5. Example optimized query commands

Focus on cost efficiency and performance.`,
            },
          },
        ],
      };

    case "troubleshoot_dynamodb":
      const errorDescription =
        promptArgs.error_description || "unspecified error";
      const operationType = promptArgs.operation_type || "unknown";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I'm experiencing an issue with DynamoDB:

Error: ${errorDescription}
Operation type: ${operationType}

Please help me:
1. Identify the root cause
2. Provide step-by-step troubleshooting
3. Suggest specific tools to diagnose the issue
4. Recommend fixes or workarounds
5. Preventive measures for the future

If you need more information about the table structure or data, please suggest which diagnostic commands to run.`,
            },
          },
        ],
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    // Ensure args is not undefined and is a plain object for Zod parsing
    const validatedArgs = typeof args === "object" && args !== null ? args : {};

    // Extract user information if available
    const userInfo = {
      userId: String(validatedArgs.userId || "anonymous"),
      userName: String(validatedArgs.userName || "Anonymous User"),
    };

    switch (name) {
      case "get_version":
        result = {
          success: true,
          version: "v0.2.1",
          description: "DynamoDB MCP Server - Enhanced validation, rewritten scan tool with advanced features",
          features: [
            "DynamoDB operations (query, scan, get, put, update)",
            "Cognito user management",
            "Environment-aware table naming",
            "Enhanced query and scan tools with comprehensive validation",
            "Parallel scanning and advanced pagination support",
            "Robust error handling with ValidationException detection",
            "Complete metadata responses for all operations",
            "No external dependencies"
          ]
        };
        break;
      case "create_table":
        result = await createTable(validatedArgs as any);
        break;
      case "list_tables":
        result = await listTables(validatedArgs as any);
        break;
      case "create_gsi":
        result = await createGSI(validatedArgs as any);
        break;
      case "update_gsi":
        result = await updateGSI(validatedArgs as any);
        break;
      case "create_lsi":
        result = await createLSI(validatedArgs as any);
        break;
      case "update_item":
        result = await updateItem(validatedArgs as any);
        break;
      case "update_capacity":
        result = await updateCapacity(validatedArgs as any);
        break;
      case "put_item":
        result = await putItem(validatedArgs as any);
        break;
      case "get_item":
        result = await getItem(validatedArgs as any);
        break;
      case "query_table":
        result = await queryTable(validatedArgs as any);
        break;
      case "scan_table":
        result = await scanTable(validatedArgs as any);
        break;
      case "describe_table":
        result = await describeTable(validatedArgs as any);
        break;
      case "get_assistant_by_id":
        result = await getAssistantById(validatedArgs as any);
        break;
      case "search_assistants_by_name":
        result = await searchAssistantsByName(validatedArgs as any);
        break;
      case "upassistant_put_item":
        result = await upAssistantPutItem(validatedArgs as any);
        break;
      case "find_user_by_email":
        result = await findUserByEmail(validatedArgs as any);
        break;
      case "get_user_message_stats":
        result = await getUserMessageStatsSimple(validatedArgs as any);
        break;
      case "get_user_conversation_stats":
        result = await getUserConversationStatsSimple(validatedArgs as any);
        break;
      case "get_user_weekly_activity":
        result = await getUserWeeklyActivitySimple(validatedArgs as any);
        break;
      // Neo4j action cases removed
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error occurred: ${error}` }],
      isError: true,
    };
  }
});

// Server startup
async function runServer() {
  try {
    // Neo4j connection removed

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DynamoDB MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
