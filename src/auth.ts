import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/calendar'
];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'client_secret_422208870387-11n44i2chevck7d1fba4bu6qeuhaluq7.apps.googleusercontent.com.json'); // Adjust filename if needed

/**
 * Reads previously authorized credentials from the save file.
 */
async function loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials) as OAuth2Client;
  } catch (err) {
    // If token file doesn't exist or is invalid, return null
    console.debug('No valid token found or error loading token:', err);
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 */
async function saveCredentials(client: OAuth2Client): Promise<void> {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
    console.log('Token saved to', TOKEN_PATH);
  } catch (err) {
    console.error('Error saving credentials:', err);
    throw new Error('Failed to save credentials');
  }
}

/**
 * Load or request authorization to call APIs.
 */
export async function authorize(): Promise<OAuth2Client> {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    // Verify the token is still valid (or refresh it)
    try {
      // Attempt to get an access token to force refresh if necessary
      await client.getAccessToken();
      console.log('Using saved token.');
      return client;
    } catch (err) {
      console.warn('Saved token is invalid or expired, attempting to delete token.json and re-authenticate...', err);
      // Attempt to delete the invalid token file
      try {
        await fs.unlink(TOKEN_PATH);
        console.log('Deleted invalid token file:', TOKEN_PATH);
      } catch (deleteErr) {
        // Log error if deletion fails, but proceed with re-authentication attempt
        console.error('Failed to delete invalid token file:', deleteErr);
      }
      client = null; // Force re-authentication
    }
  }

  // If no valid client, authenticate the user
  try {
    console.log('Starting authentication flow. Please follow the instructions in your browser.');
    client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    if (client?.credentials) {
      await saveCredentials(client);
      console.log('Authentication successful and token saved.');
      return client;
    } else {
      throw new Error('Authentication failed: No credentials received.');
    }
  } catch (err) {
    console.error('Authentication failed:', err);
    throw new Error(`Failed to authenticate: ${err instanceof Error ? err.message : String(err)}`);
  }
} 