import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Notification } from '@modelcontextprotocol/sdk/types.js'; // Remove ToolResult import
import process from 'process';
import readline from 'readline/promises'; // Import readline for user input

// Helper function for user confirmation
async function askForConfirmation(query: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(`${query} (Y/n): `);
    return answer.trim().toLowerCase() !== 'n';
  } finally {
    rl.close();
  }
}

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

  let originalTaskDescription = process.argv[2]; // Store original task description
  let subtasksToSchedule: any[] | null = null; // To store subtasks after planning

  try {
    console.log('Connecting to MCP server...');
    await client.connect(transport);
    console.log('Connected successfully.');

    // --- Step 1: Call plan_task --- 
    console.log(`Calling tool 'plan_task'...`);
    const planResult = await client.callTool({
      name: 'plan_task', // Call the renamed tool
      arguments: { 
        taskDescription: originalTaskDescription 
      },
    });

    console.log('\n--- Planning Result ---');
    if (planResult.isError) {
      console.error('Task planning failed:');
      // Display error content after checking if it's an array
      if (Array.isArray(planResult.content)) {
         (planResult.content as any[]).forEach((item: any) => console.log(item?.text || item));
      } else {
         console.log('Raw error content:', planResult.content);
      }
      throw new Error('Planning phase failed'); // Throw to exit via finally block
    } else if (!Array.isArray(planResult.content) || planResult.content.length === 0) {
      // Handle cases where content is not an array or is empty
      console.error('Invalid or empty content received from plan_task:', planResult.content);
      throw new Error('Invalid response from planning phase');
    } else {
      console.log('Subtasks generated successfully:');
      // Assuming content[0] is the text/json item we expect
      const contentItem = planResult.content[0] as { type: string; text?: string; json?: any };
      if (contentItem?.type === 'text' && contentItem.text) {
        try {
          subtasksToSchedule = JSON.parse(contentItem.text);
          // Pretty print the subtasks for review
          console.log(JSON.stringify(subtasksToSchedule, null, 2)); 
        } catch (parseError) {
          console.error('Failed to parse subtasks JSON:', parseError);
          console.log('Raw response:', contentItem.text);
          throw new Error('Could not parse subtasks');
        }
      } else if (contentItem?.type === 'json') { // Handle if server returns json directly
         subtasksToSchedule = contentItem.json;
         console.log(JSON.stringify(subtasksToSchedule, null, 2));
      } else {
         console.error('Unexpected content format received from plan_task:', planResult.content);
         throw new Error('Invalid response from planning phase');
      }
    }
    console.log('----------------------');

    // --- Step 2: User Confirmation --- 
    if (!subtasksToSchedule || subtasksToSchedule.length === 0) {
       console.log('No subtasks generated, nothing to schedule.');
       return; // Exit gracefully
    }

    const proceed = await askForConfirmation('Do you want to schedule these tasks?');

    if (!proceed) {
      console.log('Scheduling cancelled by user.');
      return; // Exit gracefully
    }

    // --- Step 3: Call schedule_tasks --- 
    console.log(`\nCalling tool 'schedule_tasks'...`);
    const scheduleResult = await client.callTool({
      name: 'schedule_tasks', 
      arguments: { 
         taskDescription: originalTaskDescription, // Pass original description
         subtasks: subtasksToSchedule // Pass the parsed/confirmed subtasks
       },
    });

    console.log('\n--- Scheduling Result ---');
    if (scheduleResult.isError) {
      console.error('Task scheduling failed:');
    } else {
      console.log('Task scheduling finished:');
    }
    // Display result content after checking if it's an array
    if (Array.isArray(scheduleResult.content)) {
       (scheduleResult.content as any[]).forEach((item: unknown) => {
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
    } else {
       console.log('Raw scheduling result content:', scheduleResult.content);
    }
    console.log('-----------------------');

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