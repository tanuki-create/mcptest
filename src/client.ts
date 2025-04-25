import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Notification } from '@modelcontextprotocol/sdk/types.js'; // Remove ToolResult import
import process from 'process';

async function main() {
  // 1. Get task description from command line arguments
  const taskDescription = process.argv[2]; // First argument after node and script name
  if (!taskDescription) {
    console.error('Usage: node dist/client.js "<Your task description>"');
    process.exit(1);
  }
  console.log(`Task to schedule: ${taskDescription}`);

  // 2. Configure the StdioClientTransport to connect to the server
  // Assumes the server is started with `npm run start` or `node dist/server.js`
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/server.js'],
    // Optional: Increase timeout if the server takes long to initialize or process
    // connectionTimeoutMs: 10000,
  });

  // 3. Create an MCP Client instance
  const client = new Client({
    name: 'mcp-cli-client',
    version: '0.1.0',
  });

  // 4. Setup notification listener
  // Attempting EventEmitter style based on potential common patterns
  // Note: SDK documentation might be needed for the exact way to listen to notifications.
  // Commenting out if client.on does not exist.
  /*
  client.on('notification', (notification: Notification) => { 
    if (notification.method === 'progress' && notification.params) {
      const params = notification.params as { message: string; error?: boolean };
      if (params.error) {
        console.error(`[Server Error Progress]: ${params.message}`);
      } else {
        console.log(`[Server Progress]: ${params.message}`);
      }
    } else {
      console.log(`[Server Notification ${notification.method}]:`, notification.params);
    }
  });
  */
  // Let's assume for now notifications are handled by transport logging or are TBD
  console.log("Notification listener setup is currently placeholder.");

  // 5. Connect to the server
  try {
    console.log('Connecting to MCP server...');
    await client.connect(transport);
    console.log('Connected successfully.');

    // Optional: List available tools
    // const tools = await client.listTools();
    // console.log('Available tools:', tools);

    // 6. Call the plan_and_schedule tool
    console.log(`Calling tool 'plan_and_schedule'...`);
    // Remove explicit type annotation for result
    const result = await client.callTool({
      name: 'plan_and_schedule',
      // Wrap arguments in the 'arguments' key as per SDK examples
      arguments: { 
        taskDescription: taskDescription 
      },
    });

    // 7. Display the result
    console.log('\n--- Tool Result ---');
    if (result.isError) {
      console.error('Tool execution failed:');
    } else {
      console.log('Tool executed successfully:');
    }
    // Handle content as unknown array
    const content = result.content as unknown[]; 
    content.forEach((item: unknown) => {
      // Basic type check before accessing properties
      if (typeof item === 'object' && item !== null && 'type' in item) {
        if (item.type === 'text' && 'text' in item) {
           console.log(item.text);
        } else {
           console.log(`[${item.type}]:`, item);
        }
      } else {
        console.log('[Unknown content item]:', item);
      }
    });
    console.log('-------------------');

  } catch (error: unknown) {
    console.error('\n--- Client Error ---');
    if (error instanceof Error) {
      console.error(`Connection or call failed: ${error.message}`);
      // Log stack trace for debugging
      // console.error(error.stack);
    } else {
      console.error('An unknown client error occurred:', error);
    }
    console.log('--------------------');
    process.exitCode = 1; // Indicate error
  } finally {
    // 8. Close the transport connection
    console.log('Closing client transport...');
    await transport.close(); // Try closing the transport
    console.log('Client transport closed.');
    // Client itself might not need explicit destroy/disconnect with StdioTransport
    // await client.destroy(); 
  }
}

main(); 