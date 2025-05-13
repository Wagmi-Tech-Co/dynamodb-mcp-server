#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
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
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { z } from "zod";
import { ActionTracker } from "./action-tracker.js";
import { neo4jActionTools } from "./neo4j-tools.js";

// AWS client initialization
const credentials: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
};

if (process.env.AWS_SESSION_TOKEN) {
  credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials,
});

// Initialize Neo4j Action Tracker
const actionTracker = new ActionTracker(
  process.env.NEO4J_URI || 'neo4j+s://2bb97179.databases.neo4j.io',
  process.env.NEO4J_USERNAME || 'neo4j',
  process.env.NEO4J_PASSWORD || 'pLyHlW4TtoC4Sh-7xToWqx_LeIFOuQ6rLN91v6hIPbc'
);

// Define tools
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
  description: "Queries a table using key conditions and optional filters",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table" },
      keyConditionExpression: {
        type: "string",
        description: "Key condition expression",
      },
      expressionAttributeValues: {
        type: "object",
        description: "Values for the key condition expression",
      },
      expressionAttributeNames: {
        type: "object",
        description: "Attribute name mappings",
        optional: true,
      },
      filterExpression: {
        type: "string",
        description: "Filter expression for results",
        optional: true,
      },
      limit: {
        type: "number",
        description: "Maximum number of items to return",
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

function getUpAssistantTableName(env: string): string {
  if (env === "uat") return "UpAssistant-myenv";
  if (env === "prod") return "UpAssistant-upwagmitec";
  throw new Error(`Invalid env: ${env}`);
}

// Implementation functions
async function createTable(params: any) {
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
  try {
    const command = new QueryCommand({
      TableName: params.tableName,
      KeyConditionExpression: params.keyConditionExpression,
      ExpressionAttributeValues: marshall(params.expressionAttributeValues),
      ExpressionAttributeNames: params.expressionAttributeNames,
      FilterExpression: params.filterExpression,
      Limit: params.limit,
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Query executed successfully on table ${params.tableName}`,
      items: response.Items
        ? response.Items.map((item) => unmarshall(item))
        : [],
      count: response.Count,
      scannedCount: response.ScannedCount,
    };
  } catch (error) {
    console.error("Error querying table:", error);
    return {
      success: false,
      message: `Failed to query table: ${error}`,
    };
  }
}

async function scanTable(params: any) {
  try {
    const command = new ScanCommand({
      TableName: params.tableName,
      FilterExpression: params.filterExpression,
      ExpressionAttributeValues: params.expressionAttributeValues
        ? marshall(params.expressionAttributeValues)
        : undefined,
      ExpressionAttributeNames: params.expressionAttributeNames,
      Limit: params.limit,
    });

    const response = await dynamoClient.send(command);
    return {
      success: true,
      message: `Scan executed successfully on table ${params.tableName}`,
      items: response.Items
        ? response.Items.map((item) => unmarshall(item))
        : [],
      count: response.Count,
      scannedCount: response.ScannedCount,
    };
  } catch (error) {
    console.error("Error scanning table:", error);
    return {
      success: false,
      message: `Failed to scan table: ${error}`,
    };
  }
}

async function describeTable(params: any) {
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

// Server setup
const server = new Server(
  {
    name: "dynamodb-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
    ...neo4jActionTools
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    // Ensure args is not undefined and is a plain object for Zod parsing
    const validatedArgs = typeof args === "object" && args !== null ? args : {};

    // Extract user information if available
    const userInfo = {
      userId: String(validatedArgs.userId || 'anonymous'),
      userName: String(validatedArgs.userName || 'Anonymous User')
    };

    switch (name) {
      case "create_table":
        result = await createTable(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'table_management',
          actionName: 'create_table',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "list_tables":
        result = await listTables(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'table_management',
          actionName: 'list_tables',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "create_gsi":
        result = await createGSI(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'index_management',
          actionName: 'create_gsi',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "update_gsi":
        result = await updateGSI(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'index_management',
          actionName: 'update_gsi',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "create_lsi":
        result = await createLSI(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'index_management',
          actionName: 'create_lsi',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "update_item":
        result = await updateItem(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'data_operation',
          actionName: 'update_item',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "update_capacity":
        result = await updateCapacity(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'capacity_management',
          actionName: 'update_capacity',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "put_item":
        result = await putItem(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'data_operation',
          actionName: 'put_item',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "get_item":
        result = await getItem(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'data_operation',
          actionName: 'get_item',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "query_table":
        result = await queryTable(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'data_operation',
          actionName: 'query_table',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "scan_table":
        result = await scanTable(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'data_operation',
          actionName: 'scan_table',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "describe_table":
        result = await describeTable(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'table_management',
          actionName: 'describe_table',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "get_assistant_by_id":
        result = await getAssistantById(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'assistant_management',
          actionName: 'get_assistant_by_id',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "search_assistants_by_name":
        result = await searchAssistantsByName(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'assistant_management',
          actionName: 'search_assistants_by_name',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "upassistant_put_item":
        result = await upAssistantPutItem(validatedArgs as any);
        await actionTracker.recordAction({
          userId: userInfo.userId,
          userName: userInfo.userName,
          mcpId: 'dynamodb-mcp-server',
          mcpType: 'DynamoDB',
          mcpName: 'AWS DynamoDB',
          actionType: 'assistant_management',
          actionName: 'upassistant_put_item',
          parameters: validatedArgs,
          result,
          status: result.success ? 'success' : 'failure'
        }).catch(error => {
          console.error('Error recording action:', error);
        });
        break;
      case "get_similar_actions":
        result = await actionTracker.findSimilarActions(validatedArgs as any);
        break;
      case "get_user_history":
        result = await actionTracker.getUserActionHistory(
          String(validatedArgs.userId),
          validatedArgs.limit !== undefined ? Number(validatedArgs.limit) : undefined
        );
        break;
      case "suggest_next_action":
        result = await actionTracker.suggestNextAction(validatedArgs as any);
        break;
      case "get_action_recommendations":
        result = await actionTracker.getActionRecommendations(
          String(validatedArgs.userId),
          String(validatedArgs.context)
        );
        break;
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
    // Connect to Neo4j first
    await actionTracker.connect();

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DynamoDB and Neo4j Action Tracking Server running on stdio");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
