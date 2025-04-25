import { google, docs_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// Define the structure of a subtask (adjust if your actual structure differs)
interface Subtask {
  subtask: string;
  duration_minutes: number;
}

/**
 * Creates a new Google Doc and populates it with the subtask list.
 * @param taskDescription The original task description for the document title.
 * @param subtasks An array of subtask objects.
 * @param authClient An authorized OAuth2 client.
 * @returns The URL of the created Google Document.
 */
export async function createDocsWithSubtasks(
  taskDescription: string,
  subtasks: Subtask[],
  authClient: OAuth2Client
): Promise<string> {
  const docs = google.docs({ version: 'v1', auth: authClient });
  const title = `Plan for: ${taskDescription}`;

  try {
    // 1. Create a new document
    console.log('Creating Google Doc...');
    const createResponse = await docs.documents.create({ requestBody: { title } });
    const documentId = createResponse.data.documentId;

    if (!documentId) {
      throw new Error('Failed to create document: No document ID returned.');
    }
    console.log(`Document created with ID: ${documentId}`);

    // 2. Prepare batch update requests to insert content
    let currentIndex = 1; // Start inserting content after the initial title paragraph
    const requests: docs_v1.Schema$Request[] = [];

    // Insert Title (as Heading 1)
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: title + '\n', // Add newline after title
      }
    });
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: currentIndex,
          endIndex: currentIndex + title.length,
        },
        paragraphStyle: { namedStyleType: 'HEADING_1' },
        fields: 'namedStyleType',
      }
    });
    currentIndex += title.length + 1; // Update index

    // Insert Subtasks as a bulleted list
    const subtaskListText = subtasks
      .map(st => `- ${st.subtask} (${st.duration_minutes} min)`)
      .join('\n');
    
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: subtaskListText + '\n', // Add newline at the end
      }
    });

    // Apply bullet points to the inserted subtask list
    requests.push({
      createParagraphBullets: {
        range: {
          startIndex: currentIndex,
          endIndex: currentIndex + subtaskListText.length,
        },
        bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE', // Or other presets
      }
    });

    // 3. Execute the batch update
    console.log('Updating Google Doc content...');
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests,
      },
    });

    console.log('Google Doc content updated successfully.');

    // 4. Return the document URL
    return `https://docs.google.com/document/d/${documentId}/edit`;

  } catch (error: unknown) {
    console.error('Error interacting with Google Docs API:', error);
    // Attempt to extract more specific error info if available
    let detail = '';
    if (typeof error === 'object' && error !== null && 'errors' in error) {
      detail = JSON.stringify((error as any).errors);
    }
    throw new Error(`Failed to create/update Google Doc: ${error instanceof Error ? error.message : String(error)} ${detail}`);
  }
} 