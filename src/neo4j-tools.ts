import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const GET_SIMILAR_ACTIONS_TOOL: Tool = {
  name: "get_similar_actions",
  description: "Finds similar actions to the current one",
  inputSchema: {
    type: "object",
    properties: {
      mcpType: {
        type: "string",
        description: "Type of MCP (DynamoDB, Mattermost, Jira, etc.)",
      },
      actionType: {
        type: "string",
        description: "Type of action being performed",
      },
      parameters: {
        type: "object",
        description: "Parameters of the action",
      },
      limit: {
        type: "number",
        description: "Maximum number of similar actions to return",
        default: 5,
      },
    },
    required: ["mcpType", "actionType", "parameters"],
  },
};

export const GET_USER_HISTORY_TOOL: Tool = {
  name: "get_user_history",
  description: "Gets a user's action history",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description: "ID of the user",
      },
      limit: {
        type: "number",
        description: "Maximum number of actions to return",
        default: 20,
      },
    },
    required: ["userId"],
  },
};

export const SUGGEST_NEXT_ACTION_TOOL: Tool = {
  name: "suggest_next_action",
  description: "Suggests the next action based on typical patterns",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description: "ID of the user",
      },
      mcpType: {
        type: "string",
        description: "Type of MCP (DynamoDB, Mattermost, Jira, etc.)",
      },
      currentActionType: {
        type: "string",
        description: "Type of the current action",
      },
      currentParameters: {
        type: "object",
        description: "Parameters of the current action",
      },
    },
    required: ["userId", "mcpType", "currentActionType", "currentParameters"],
  },
};

export const GET_ACTION_RECOMMENDATIONS_TOOL: Tool = {
  name: "get_action_recommendations",
  description: "Gets action recommendations based on a context description",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description: "ID of the user",
      },
      context: {
        type: "string",
        description: "Context description to find relevant actions",
      },
    },
    required: ["userId", "context"],
  },
};

export const neo4jActionTools: Tool[] = [
  GET_SIMILAR_ACTIONS_TOOL,
  GET_USER_HISTORY_TOOL,
  SUGGEST_NEXT_ACTION_TOOL,
  GET_ACTION_RECOMMENDATIONS_TOOL,
];
