import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod'; // Import zod
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { authorize } from './auth.js'; // Import authorize function
import { createDocsWithSubtasks } from './docs.js'; // Import docs function
import { createCalendarEvent, getFreeBusy } from './calendar.js'; // Import getFreeBusy
import { findEarliestFitSlot } from './scheduler.js'; // Import scheduler function
import { OAuth2Client } from 'google-auth-library'; // Ensure OAuth2Client is imported

// --- Constants ---
const TASK_PLANNING_PROMPT_TEMPLATE = `
You are an expert project manager assistant. Your goal is to break down a given task into smaller, manageable subtasks and estimate the duration required for each subtask in minutes.

Analyze the following task description provided by the user:
"{taskDescription}"

Based on your analysis, generate a list of subtasks required to complete the main task. For each subtask, provide a realistic estimated duration in minutes.

Output the results strictly in the following JSON format:
[
  {
    "subtask": "<Subtask description>",
    "duration_minutes": <Estimated duration in minutes (integer)>
  },
  {
    "subtask": "<Another subtask description>",
    "duration_minutes": <Estimated duration in minutes (integer)>
  }
  ...
]

Guidelines:
- Break down the task into logical steps.
- Ensure each subtask is a concrete action.
- Estimate durations realistically. Assume focused work time.
- Use only integers for 'duration_minutes'.
- Ensure the output is a valid JSON array of objects with exactly the keys "subtask" and "duration_minutes".
`;

// --- Google AI Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or another suitable model

// Safety settings (adjust as needed)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Real Gemini API Call ---
async function callGeminiApi(prompt: string): Promise<string> {
  console.log("--- Calling Gemini API Start ---");
  console.log("Prompt:", prompt);
  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // Ensure JSON output - might need specific model/prompt adjustments if output is not clean
        // responseMimeType: "application/json", // Use if supported and needed
        temperature: 0.5, // Adjust creativity vs consistency
      },
      safetySettings,
    });
    const response = result.response;
    const responseText = response.text();
    console.log("Gemini Raw Response Text:", responseText);
    console.log("--- Calling Gemini API End ---");

    // Extract JSON part if necessary (basic extraction)
    const jsonMatch = responseText.match(/```json\\n([\s\S]*?)\\n```|(\[[\s\S]*\])/);
    if (jsonMatch) {
      const jsonString = jsonMatch[1] || jsonMatch[2];
      console.log("Extracted JSON String:", jsonString);
      // Attempt to parse to ensure it's valid before returning
      JSON.parse(jsonString);
      return jsonString;
    } else {
      console.error("Could not extract valid JSON from Gemini response.", responseText);
      throw new Error("LLM response did not contain expected JSON format.");
    }

  } catch (error: unknown) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error && error.message.includes("SAFETY")) {
      throw new Error("Gemini API request blocked due to safety settings.");
    } else if (error instanceof Error && error.message.includes("API key not valid")) {
      throw new Error("Invalid GEMINI_API_KEY provided");
    }
    throw new Error(`Gemini API call failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// --- Subtask Validation Schema ---
// Added zod schema for validating the structure of subtasks from LLM
const SubtaskSchema = z.object({
  subtask: z.string(),
  duration_minutes: z.number().int(),
});
const SubtaskListSchema = z.array(SubtaskSchema);

// --- Tool Input Schemas ---
const PlanInputSchema = z.object({
  taskDescription: z.string().describe("The user's task described in natural language."),
});
const ScheduleInputSchema = z.object({
  taskDescription: z.string(), // Keep original description for context/titles
  subtasks: SubtaskListSchema, // Pass the validated subtasks
});

// --- Scheduling Constants (can be moved to scheduler.ts or config) ---
const SCHEDULING_START_OFFSET_DAYS = 1;
const SCHEDULING_WINDOW_DAYS = 7;
const SCHEDULING_WORK_DAY_START_HOUR = 9;
const SCHEDULING_WORK_DAY_END_HOUR = 17;
const SCHEDULING_BUFFER_MINUTES = 15;

console.log('MCP Server starting...');

// Create an MCP server instance
const server = new McpServer({
  name: 'mcp-scheduler-server', // Choose a descriptive name
  version: '0.1.0', // Initial version
  // Define server capabilities if needed (e.g., prompts, resources, tools)
  // capabilities: {}
});

// --- Resource, Tool, and Prompt definitions will go here later ---

// --- Tool Definition: plan_task (renamed from plan_and_schedule) ---
server.tool(
  'plan_task', // Renamed for clarity
  PlanInputSchema.shape,
  async (
    params,
    extra
  ) => {
    const { taskDescription } = params as z.infer<typeof PlanInputSchema>;
    console.log(`Received plan_task request: ${taskDescription}`);
    // extra.sendNotification('progress', { message: 'Starting task planning...' });

    try {
      // 1. Call Gemini API and Validate Response
      // extra.sendNotification('progress', { message: 'Generating subtasks with AI...' });
      const prompt = TASK_PLANNING_PROMPT_TEMPLATE.replace("{taskDescription}", taskDescription);
      const llmResponse = await callGeminiApi(prompt);

      // extra.sendNotification('progress', { message: 'Validating AI response...' });
      const parsedJson = JSON.parse(llmResponse);
      const validationResult = SubtaskListSchema.safeParse(parsedJson);
      if (!validationResult.success) {
        throw new Error(`LLM response structure is invalid: ${validationResult.error.message}`);
      }
      const subtasks = validationResult.data;
      console.log("Validated subtasks:", subtasks);

      // 2. Return the generated subtasks
      // extra.sendNotification('progress', { message: 'Subtask planning complete.' });
      return {
        // Return subtasks as a JSON string within a text content block
        content: [{ type: 'text', text: JSON.stringify(subtasks, null, 2) }], 
      };

    } catch (error: unknown) {
      // extra.sendNotification('progress', { message: 'An error occurred during planning.', error: true });
      console.error("Error during plan_task:", error);
      let errorMessage = "Failed to generate subtasks.";
      // ... (Keep refined error message generation, remove Docs/Calendar specific parts)
      if (error instanceof SyntaxError) {
        errorMessage = "Failed to parse LLM response (Invalid JSON).";
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.startsWith('LLM')) {
          errorMessage = `LLM Processing Error: ${error.message}`;
        } else if (error.message.startsWith('Gemini API')) {
          errorMessage = `Gemini API Error: ${error.message}`;
        }
      } else {
        errorMessage = `An unknown error occurred: ${String(error)}`;
      }
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true,
      };
    }
  }
);

// --- Tool Definition: schedule_tasks ---
server.tool(
  'schedule_tasks',
  ScheduleInputSchema.shape,
  async (
    params,
    extra
  ) => {
    const { taskDescription, subtasks } = params as z.infer<typeof ScheduleInputSchema>;
    console.log(`Received schedule_tasks request for: ${taskDescription}`);
    // extra.sendNotification('progress', { message: 'Starting scheduling process...' });

    let documentUrl = '';
    const scheduledEvents: { subtask: string; url: string | null }[] = [];
    const unscheduledSubtasks: string[] = [];

    try {
      // 1. Authenticate with Google (Moved from plan_task)
      // extra.sendNotification('progress', { message: 'Authenticating with Google...' });
      console.log("Attempting Google authentication...");
      const authClient = await authorize();
      console.log("Google authentication successful.");

      // 2. Create Google Doc (Moved from plan_task)
      // extra.sendNotification('progress', { message: 'Creating Google Document...' });
      documentUrl = await createDocsWithSubtasks(taskDescription, subtasks, authClient);
      console.log(`Google Doc created: ${documentUrl}`);

      // 3b. Dynamically register the created document as an MCP resource (Moved from plan_task)
      // extra.sendNotification('progress', { message: 'Registering document resource...' });
      try {
        server.resource(
          'generated_plan_document', // Consistent name for this type of resource
          documentUrl, // Use the actual Doc URL as the static URI
          async (uri) => ({
            contents: [{
              uri: uri.href, // Return the URI itself
              metadata: { title: `Plan for: ${taskDescription}` }, // Add title metadata
              text: `Link to the generated plan document for task: ${taskDescription}`
            }]
          })
        );
        console.log(`Registered MCP resource for document: ${documentUrl}`);
      } catch (resourceError) {
         console.error(`Failed to register MCP resource for ${documentUrl}:`, resourceError);
      }

      // 4. Schedule Subtasks on Google Calendar (Moved from plan_task)
      // extra.sendNotification('progress', { message: 'Querying calendar availability...' });
      console.log("Starting calendar scheduling...");
      const now = new Date();
      const searchRangeStart = new Date(now);
      searchRangeStart.setDate(now.getDate() + SCHEDULING_START_OFFSET_DAYS);
      searchRangeStart.setHours(SCHEDULING_WORK_DAY_START_HOUR, 0, 0, 0);

      const searchRangeEnd = new Date(searchRangeStart);
      searchRangeEnd.setDate(searchRangeStart.getDate() + SCHEDULING_WINDOW_DAYS);
      searchRangeEnd.setHours(SCHEDULING_WORK_DAY_END_HOUR, 0, 0, 0);

      const freeBusyResponse = await getFreeBusy(
        searchRangeStart.toISOString(),
        searchRangeEnd.toISOString(),
        authClient
      );

      const busyTimes = freeBusyResponse.calendars?.primary?.busy?.map(b => ({
        start: new Date(b.start!),
        end: new Date(b.end!),
      })) || [];
      let nextAvailableStartTime = new Date(searchRangeStart.getTime());
      let scheduledCount = 0;

      for (const subtask of subtasks) {
         const slot = findEarliestFitSlot(
           nextAvailableStartTime,
           subtask.duration_minutes,
           busyTimes,
           SCHEDULING_WORK_DAY_START_HOUR,
           SCHEDULING_WORK_DAY_END_HOUR,
           SCHEDULING_BUFFER_MINUTES,
           searchRangeEnd
         );
         if (slot) {
            try {
               const eventUrl = await createCalendarEvent(
                 subtask.subtask,
                 slot.start.toISOString(),
                 slot.end.toISOString(),
                 authClient
               );
               scheduledEvents.push({ subtask: subtask.subtask, url: eventUrl });
               const busySlotEnd = new Date(slot.end.getTime() + SCHEDULING_BUFFER_MINUTES * 60000);
               busyTimes.push({ start: slot.start, end: busySlotEnd });
               busyTimes.sort((a, b) => a.start.getTime() - b.start.getTime());
               nextAvailableStartTime = busySlotEnd;
               scheduledCount++;
            } catch (calendarError) {
               console.error(`Failed to create calendar event for '${subtask.subtask}':`, calendarError);
               unscheduledSubtasks.push(`${subtask.subtask} (Calendar API error)`);
               nextAvailableStartTime.setMinutes(nextAvailableStartTime.getMinutes() + 1);
            }
         } else {
            console.log(`No suitable slot found for '${subtask.subtask}' within the search window.`);
            unscheduledSubtasks.push(`${subtask.subtask} (No slot found)`);
         }
      }
      // extra.sendNotification('progress', { message: `Finished scheduling attempt (${scheduledCount}/${subtasks.length} scheduled).` });
      console.log("Scheduling attempt finished.");

      // 5. Return final response (Moved from plan_task)
      // extra.sendNotification('progress', { message: 'Task scheduling complete.' });
      let successMessage = `Plan created: ${documentUrl}`;
      if (scheduledEvents.length > 0) {
        successMessage += `\nScheduled ${scheduledEvents.length} / ${subtasks.length} subtasks.`;
      }
      if (unscheduledSubtasks.length > 0) {
        successMessage += `\nCould not schedule: ${unscheduledSubtasks.join(', ')}.`;
      }
      return {
        content: [{ type: 'text', text: successMessage }],
        _meta: { documentUrl, scheduledEvents, unscheduledSubtasks }
      };

    } catch (error: unknown) {
      // extra.sendNotification('progress', { message: 'An error occurred during scheduling.', error: true });
      console.error("Error during schedule_tasks:", error);
      // Keep the refined error handling, ensure it covers Auth, Docs, Calendar errors
      let errorMessage = "Failed to schedule tasks.";
      let errorCode = -32000; // Reuse error code logic if needed

      // Check for specific error types (Copy logic from previous step)
      if (error instanceof SyntaxError) {
        errorMessage = "Failed to parse LLM response (Invalid JSON)."; // Should not happen here, but include for completeness
        errorCode = -32700;
      } else if (error instanceof Error) {
        errorMessage = error.message;
        // Google API Errors (GaxiosError)
        if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error && 'config' in error) {
           const gaxiosError = error as any;
           const httpStatusCode = parseInt(gaxiosError.code, 10);
           if (httpStatusCode === 401 || httpStatusCode === 403 && gaxiosError.message.includes('invalid_grant')) {
              errorMessage = `Google Authentication Error: Token might be invalid or expired. (${gaxiosError.message})`;
           } else if (httpStatusCode === 403) {
              if (gaxiosError.message.includes('quotaExceeded') || gaxiosError.message.includes('User Rate Limit Exceeded')) {
                 errorMessage = `Google API Quota/Rate Limit Exceeded: Please wait and try again later. (${gaxiosError.message})`;
              } else if (gaxiosError.message.includes('insufficient permissions')) {
                 errorMessage = `Google API Permission Denied: Please ensure correct permissions. (${gaxiosError.message})`;
              } else {
                 errorMessage = `Google API Forbidden Error (403): ${gaxiosError.message}`;
              }
           } else if (httpStatusCode === 429) {
              errorMessage = `Google API Rate Limit Exceeded (429): ${gaxiosError.message}`;
           } else if (httpStatusCode >= 400 && httpStatusCode < 500) {
               errorMessage = `Google API Client Error (${httpStatusCode}): ${gaxiosError.message}`;
           } else if (httpStatusCode >= 500) {
               errorMessage = `Google API Server Error (${httpStatusCode}): ${gaxiosError.message}`;
           }
        }
        // Override with more specific internal errors if applicable
        if (error.message.startsWith('Failed to authenticate')) {
            errorMessage = `Google Authentication Error: ${error.message}`;
        } else if (error.message.startsWith('Failed to create/update Google Doc')) {
            errorMessage = `Google Docs API Error: ${error.message}`;
        } else if (error.message.startsWith('Failed to query free/busy')) {
             errorMessage = `Google Calendar API Error (Free/Busy): ${error.message}`;
        } else if (error.message.startsWith('Failed to create calendar event')) {
          errorMessage = `Google Calendar API Error (Event): ${error.message}`;
        }
        // Removed LLM/Gemini specific errors as they shouldn't occur in schedule_tasks
      } else {
         errorMessage = `An unknown error occurred: ${String(error)}`;
      }
      // Ensure a valid return structure in case of error
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true,
      };
    }
  }
);

// Function to start the server
async function startServer() {
  try {
    // Use StdioTransport for communication via standard input/output
    const transport = new StdioServerTransport();
    console.log('Connecting server to StdioTransport...');
    await server.connect(transport);
    console.log('MCP Server connected and listening via stdio.');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1); // Exit if connection fails
  }
}

// Start the server
startServer();

// Optional: Keep the process alive if needed for other async operations,
// but server.connect typically handles the lifecycle.
// setInterval(() => {}, 1 << 30); // Keep alive with a long interval 