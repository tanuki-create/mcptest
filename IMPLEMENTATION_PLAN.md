# Google Calendar MCP Server Implementation Plan

This document outlines the steps to build an MCP server for Google Calendar integration.

## Requirements

- Connect to Google Calendar API.
- Expose calendar events as MCP resources.
- Provide MCP tools for adding and editing calendar events.
- Designed for personal schedule assistant use.

## Technology Stack

- Node.js
- TypeScript
- Express.js
- `googleapis` library
- `@google-cloud/local-auth` for OAuth

## Task List

- [x] **Step 1: Project Setup**
  - [x] Initialize Node.js project (`package.json`).
  - [x] Configure TypeScript (`tsconfig.json`).
  - [x] Install dependencies (`npm install`).
- [ ] **Step 2: Google Calendar API Setup (User Action Required)**
  - [ ] Create Google Cloud Project.
  - [ ] Enable Google Calendar API.
  - [ ] Configure OAuth Consent Screen.
  - [ ] Create OAuth 2.0 Desktop App Credentials.
  - [ ] Download `credentials.json` and place it in the project root.
- [ ] **Step 3: Authentication Module (`src/auth.ts`)**
  - [ ] Implement OAuth 2.0 flow using `@google-cloud/local-auth`.
  - [ ] Function to load/save/refresh tokens.
  - [ ] Function to get an authenticated Google Calendar API client.
- [ ] **Step 4: MCP Server Structure (`src/server.ts`)**
  - [ ] Set up Express server.
  - [ ] Implement `/.well-known/mcp` endpoint for capability discovery.
  - [ ] Implement `/mcp` endpoint for handling MCP requests.
  - [ ] Integrate authentication module.
- [ ] **Step 5: Resource Implementation (`src/resources.ts`)**
  - [ ] Implement `mcp/resources/list` handler.
  - [ ] Fetch upcoming events from Google Calendar API.
  - [ ] Format events as MCP resources.
- [ ] **Step 6: Tool Implementation (`src/tools.ts`)**
  - [ ] Define schema for `addEvent` tool.
  - [ ] Implement `mcp/tools/addEvent` handler.
    - [ ] Parse input parameters.
    - [ ] Call Google Calendar API to add event.
    - [ ] Format response.
  - [ ] Define schema for `editEvent` tool.
  - [ ] Implement `mcp/tools/editEvent` handler.
    - [ ] Parse input parameters.
    - [ ] Call Google Calendar API to find and update event.
    - [ ] Format response.
- [ ] **Step 7: Error Handling**
  - [ ] Add error handling middleware in Express.
  - [ ] Handle errors from Google API calls.
  - [ ] Return appropriate MCP error responses.
- [ ] **Step 8: README (`README.md`)**
  - [ ] Add instructions for Google API setup.
  - [ ] Add instructions for running the server.
  - [ ] Document MCP endpoints and tool usage. 