import neo4j from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';

export class ActionTracker {
    private driver: neo4j.Driver | null = null;
    private session: neo4j.Session | null = null;
    private enabled: boolean = false;

    constructor(uri?: string, username?: string, password?: string) {
        if (uri && username && password) {
            this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
            this.enabled = true;
        } else {
            console.warn('Neo4j connection parameters not provided. Action tracking will be disabled.');
            this.enabled = false;
        }
    }

    async connect() {
        if (!this.enabled || !this.driver) {
            console.log('Neo4j Action Tracker is disabled - skipping connection');
            return;
        }

        try {
            await this.driver.verifyConnectivity();
            console.log('Connected to Neo4j Action Tracker');

            // Initialize schema constraints
            await this.initializeSchema();
        } catch (error) {
            console.error('Failed to connect to Neo4j Action Tracker:', error);
            console.warn('Disabling Neo4j Action Tracker and continuing without it');
            this.enabled = false;
            this.driver = null;
        }
    }

    private async initializeSchema() {
        if (!this.enabled || !this.driver) {
            return;
        }

        const session = this.driver.session();
        try {
            // Create constraints for unique IDs
            await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (user:User) REQUIRE user.id IS UNIQUE
      `);

            await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (action:Action) REQUIRE action.id IS UNIQUE
      `);

            await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (mcp:MCP) REQUIRE mcp.id IS UNIQUE
      `);

            // Create indices for faster lookups
            await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (action:Action) ON (action.timestamp)
      `);

            await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (action:Action) ON (action.mcpType)
      `);
        } finally {
            await session.close();
        }
    }

    async close() {
        if (this.enabled && this.driver) {
            await this.driver.close();
        }
    }

    async recordAction({
        userId,
        userName,
        mcpId,
        mcpType,
        mcpName,
        actionType,
        actionName,
        parameters,
        result,
        status
    }: {
        userId: string;
        userName: string;
        mcpId: string;
        mcpType: string;
        mcpName: string;
        actionType: string;
        actionName: string;
        parameters: Record<string, any>;
        result: any;
        status: 'success' | 'failure';
    }) {
        if (!this.enabled || !this.driver) {
            return {
                success: true,
                actionId: uuidv4(),
                message: 'Action tracking is disabled - action not recorded'
            };
        }

        const session = this.driver.session();
        const actionId = uuidv4();
        const timestamp = new Date().toISOString();

        try {
            // Create the action record with all relationships
            await session.run(`
        // Ensure the User exists
        MERGE (user:User {id: $userId})
        ON CREATE SET user.name = $userName, user.createdAt = $timestamp
        
        // Ensure the MCP exists
        MERGE (mcp:MCP {id: $mcpId})
        ON CREATE SET mcp.type = $mcpType, mcp.name = $mcpName, mcp.createdAt = $timestamp
        
        // Create a new Action node
        CREATE (action:Action {
          id: $actionId,
          type: $actionType,
          name: $actionName,
          parameters: $parametersJson,
          result: $resultJson,
          status: $status,
          timestamp: $timestamp
        })
        
        // Create relationships
        CREATE (user)-[:PERFORMED]->(action)
        CREATE (action)-[:USED]->(mcp)
        
        // Create relationships with resources if applicable
        WITH action
        
        RETURN action.id as actionId
      `, {
                userId,
                userName,
                mcpId,
                mcpType,
                mcpName,
                actionId,
                actionType,
                actionName,
                parametersJson: JSON.stringify(parameters),
                resultJson: JSON.stringify(result),
                status,
                timestamp
            });

            return {
                success: true,
                actionId,
                message: 'Action recorded successfully'
            };
        } catch (error) {
            console.error('Error recording action:', error);
            return {
                success: false,
                message: `Failed to record action: ${error}`
            };
        } finally {
            await session.close();
        }
    }

    async getRelatedActions({
        actionId,
        maxDepth = 2
    }: {
        actionId: string;
        maxDepth?: number;
    }) {
        if (!this.enabled || !this.driver) {
            return {
                success: false,
                message: 'Action tracking is disabled - cannot retrieve related actions'
            };
        }

        const session = this.driver.session();

        try {
            const result = await session.run(`
        MATCH (action:Action {id: $actionId})
        CALL apoc.path.subgraphAll(action, {maxLevel: $maxDepth}) 
        YIELD nodes, relationships
        RETURN nodes, relationships
      `, {
                actionId,
                maxDepth
            });

            return {
                success: true,
                graph: result.records[0]
            };
        } catch (error) {
            console.error('Error getting related actions:', error);
            return {
                success: false,
                message: `Failed to get related actions: ${error}`
            };
        } finally {
            await session.close();
        }
    }

    async findSimilarActions({
        mcpType,
        actionType,
        parameters,
        limit = 5
    }: {
        mcpType: string;
        actionType: string;
        parameters: Record<string, any>;
        limit?: number;
    }) {
        if (!this.enabled || !this.driver) {
            return {
                success: false,
                message: 'Action tracking is disabled - cannot find similar actions'
            };
        }

        const session = this.driver.session();

        try {
            // Find similar actions based on MCP type, action type, and parameters
            const result = await session.run(`
        MATCH (action:Action)-[:USED]->(mcp:MCP)
        WHERE mcp.type = $mcpType AND action.type = $actionType
        WITH action, mcp
        // Calculate similarity score based on parameters
        CALL apoc.text.jaroWinklerDistance($parametersJson, action.parameters) YIELD similarity
        WHERE similarity > 0.7
        RETURN action, mcp, similarity
        ORDER BY similarity DESC, action.timestamp DESC
        LIMIT $limit
      `, {
                mcpType,
                actionType,
                parametersJson: JSON.stringify(parameters),
                limit: neo4j.int(limit)
            });

            const similarActions = result.records.map((record: neo4j.Record) => {
                const action = record.get('action').properties;
                const mcp = record.get('mcp').properties;
                const similarity = record.get('similarity');

                return {
                    action: {
                        ...action,
                        parameters: JSON.parse(action.parameters as string),
                        result: JSON.parse(action.result as string)
                    },
                    mcp,
                    similarity
                };
            });

            return {
                success: true,
                similarActions
            };
        } catch (error) {
            console.error('Error finding similar actions:', error);
            return {
                success: false,
                message: `Failed to find similar actions: ${error}`
            };
        } finally {
            await session.close();
        }
    }

    async getUserActionHistory(userId: string, limit = 20) {
        if (!this.enabled || !this.driver) {
            return {
                success: false,
                message: 'Action tracking is disabled - cannot retrieve user action history'
            };
        }

        const session = this.driver.session();

        try {
            const result = await session.run(`
        MATCH (user:User {id: $userId})-[:PERFORMED]->(action:Action)-[:USED]->(mcp:MCP)
        RETURN action, mcp
        ORDER BY action.timestamp DESC
        LIMIT $limit
      `, {
                userId,
                limit: neo4j.int(limit)
            });

            const actions = result.records.map((record: neo4j.Record) => {
                const action = record.get('action').properties;
                const mcp = record.get('mcp').properties;

                return {
                    action: {
                        ...action,
                        parameters: JSON.parse(action.parameters as string),
                        result: JSON.parse(action.result as string)
                    },
                    mcp
                };
            });

            return {
                success: true,
                actions
            };
        } catch (error) {
            console.error('Error getting user action history:', error);
            return {
                success: false,
                message: `Failed to get user action history: ${error}`
            };
        } finally {
            await session.close();
        }
    }

    async suggestNextAction({
        userId,
        mcpType,
        currentActionType,
        currentParameters
    }: {
        userId: string;
        mcpType: string;
        currentActionType: string;
        currentParameters: Record<string, any>;
    }) {
        if (!this.enabled || !this.driver) {
            return {
                success: false,
                message: 'Action tracking is disabled - cannot suggest next action'
            };
        }

        const session = this.driver.session();

        try {
            // Find patterns in previous action sequences to suggest the next action
            const result = await session.run(`
        // Find similar current actions
        MATCH (currentAction:Action {type: $currentActionType})-[:USED]->(mcp:MCP {type: $mcpType})
        WHERE apoc.text.jaroWinklerDistance($currentParamsJson, currentAction.parameters) > 0.7
        
        // Find users who performed these actions
        MATCH (user:User)-[:PERFORMED]->(currentAction)
        
        // Find what these users did next with the same MCP
        MATCH (user)-[:PERFORMED]->(nextAction:Action)-[:USED]->(mcp)
        WHERE nextAction.timestamp > currentAction.timestamp
        
        // Get the next action within a reasonable time window (30 minutes)
        WITH currentAction, nextAction, mcp,
             duration.between(datetime(currentAction.timestamp), datetime(nextAction.timestamp)) AS timeDiff
        WHERE timeDiff.minutes < 30
        
        // Count occurrences of each next action type to find patterns
        RETURN nextAction.type AS nextActionType, 
               nextAction.name AS nextActionName,
               COLLECT(DISTINCT nextAction.parameters) AS parametersList,
               COUNT(nextAction) AS frequency
        ORDER BY frequency DESC
        LIMIT 3
      `, {
                userId,
                mcpType,
                currentActionType,
                currentParamsJson: JSON.stringify(currentParameters)
            });

            const suggestions = result.records.map((record: neo4j.Record) => {
                return {
                    actionType: record.get('nextActionType'),
                    actionName: record.get('nextActionName'),
                    possibleParameters: record.get('parametersList').map((param: string) => JSON.parse(param)),
                    frequency: record.get('frequency').toInt()
                };
            });

            return {
                success: true,
                suggestions
            };
        } catch (error) {
            console.error('Error suggesting next action:', error);
            return {
                success: false,
                message: `Failed to suggest next action: ${error}`
            };
        } finally {
            await session.close();
        }
    }

    async getActionRecommendations(userId: string, context: string) {
        if (!this.enabled || !this.driver) {
            return {
                success: false,
                message: 'Action tracking is disabled - cannot get action recommendations'
            };
        }

        const session = this.driver.session();

        try {
            // Use context to find relevant previous actions
            const result = await session.run(`
        // Find actions related to this context
        CALL db.index.fulltext.queryNodes("actionContext", $context) YIELD node as action
        
        // Get the MCPs used and user who performed them
        MATCH (action)-[:USED]->(mcp:MCP)
        MATCH (user:User)-[:PERFORMED]->(action)
        
        // Find patterns in what was done
        WITH mcp, action, user
        
        // Group and count to find most common actions
        RETURN mcp.type as mcpType, 
               mcp.name as mcpName, 
               action.type as actionType,
               action.name as actionName,
               COLLECT(DISTINCT action.parameters) as parameterSamples,
               COUNT(action) as frequency
        ORDER BY frequency DESC
        LIMIT 5
      `, {
                userId,
                context
            });

            const recommendations = result.records.map((record: neo4j.Record) => {
                return {
                    mcpType: record.get('mcpType'),
                    mcpName: record.get('mcpName'),
                    actionType: record.get('actionType'),
                    actionName: record.get('actionName'),
                    parameterSamples: record.get('parameterSamples').map((param: string) => JSON.parse(param)),
                    frequency: record.get('frequency').toInt()
                };
            });

            return {
                success: true,
                recommendations
            };
        } catch (error) {
            console.error('Error getting action recommendations:', error);
            return {
                success: false,
                message: `Failed to get action recommendations: ${error}`
            };
        } finally {
            await session.close();
        }
    }
} 