# 🎫 Ticket Classifier

A ticket management system with automatic AI-powered classification.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Choices](#technology-choices)
4. [Project Structure](#project-structure)
5. [API Reference](#api-reference)
6. [Setup](#setup)

---

## Overview

Ticket Classifier is a web app that lets authenticated users create, manage, and classify support tickets. Each ticket is automatically analyzed by an LLM that determines its category. Users can also dictate tickets by voice and translate them into different languages.

---

## Architecture

The application follows a classic two-tier **client-server** architecture:

```
Browser (HTML + CSS + vanilla JS)
        ↕ HTTP / REST API
Node.js Server (Express)
        ↕
    OpenAI API (GPT-3.5, Whisper)
        ↕
    File system (one JSON file per user)
```

### Frontend

Built with plain HTML, CSS, and vanilla JavaScript — no framework. This keeps the project simple and avoids unnecessary dependencies. The frontend communicates with the backend via `fetch` over a REST API.

### Backend

An Express server that exposes REST endpoints, handles authentication, communicates with OpenAI, and manages data persistence.

---

## Technology Choices

### Authentication — Google OAuth 2.0 (Passport.js)

Google OAuth was chosen over a custom auth system for several reasons:
- no password management on our side (security delegated to Google)
- familiar and fast user experience
- `passport-google-oauth20` is a mature, well-maintained library

Sessions are managed server-side via `express-session`, with the user profile serialized in memory.

### Ticket Classification — GPT-3.5-turbo

The ticket text is sent to GPT-3.5-turbo with a system prompt that instructs the model to respond with a single word (the category). `temperature: 0.3` and `max_tokens: 10` are used to get fast, deterministic responses.

Supported categories:

| Category | Description |
|---|---|
| `task` | General work item |
| `bug` | Defect or error |
| `enhancement` | Feature extension |
| `research` | Investigation or feasibility study |
| `design` | UI/UX or mockup |
| `testing` | QA or validation |
| `deployment` | Release, infrastructure, CI/CD |
| `documentation` | Docs or guides |

### Voice Transcription — Whisper (OpenAI)

Audio is recorded in the browser via `MediaRecorder` in `audio/webm;codecs=opus` format. The file is sent to the server as `multipart/form-data` (handled by `multer`), renamed with a `.webm` extension, and passed to the Whisper API. Temporary files are deleted immediately after transcription.

Whisper was chosen over the browser's Web Speech API because:
- works across all browsers without relying on native APIs
- better transcription quality, especially for non-English languages
- no dependency on browser-specific services (Web Speech API is Chrome-only)

### Translation — GPT-3.5-turbo

Translation happens client-side on demand, via a prompt that specifies the target language. Translations are temporary (not persisted) and the user can revert to the original text at any time.

### Persistence — Per-user JSON files

Tickets are saved to the file system in the `tickets/` directory, with one JSON file per user named after their Google ID (e.g. `tickets/1234567890.json`).

This was chosen for simplicity: no external database required, works fine for a limited number of users. For a production system with many users, migrating to a database like PostgreSQL or MongoDB would be recommended.

File structure:
```json
{
  "tickets": [
    {
      "id": 1,
      "description": "Login broken on Safari",
      "classification": "bug",
      "timestamp": "2026-03-15T10:00:00.000Z"
    }
  ],
  "counter": 2
}
```

---

## Project Structure

```
picampus/
├── server.js          # Express server, REST API, OpenAI integration
├── app.js             # Frontend logic (vanilla JS)
├── index.html         # Main page
├── login.html         # Login page
├── style.css          # Styles
├── package.json
├── .env               # Environment variables (not in git)
├── .env.example       # Environment variables template
├── tickets/           # Per-user ticket data (not in git)
│   └── <google-id>.json
└── uploads/           # Temporary audio files (not in git)
```

---

## API Reference

All `/api/*` routes require authentication. Unauthenticated requests return `401 Unauthorized`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/google` | Start Google OAuth flow |
| `GET` | `/auth/google/callback` | OAuth callback |
| `GET` | `/auth/logout` | Logout and redirect to `/login.html` |
| `GET` | `/auth/user` | Returns the authenticated user's data |
| `GET` | `/api/tickets` | List tickets for the current user |
| `POST` | `/api/tickets` | Create a new ticket |
| `PUT` | `/api/tickets/:id` | Update a ticket's text |
| `DELETE` | `/api/tickets/:id` | Delete a ticket |
| `POST` | `/api/classify` | Classify text via GPT |
| `POST` | `/api/translate` | Translate text to a specified language |
| `POST` | `/api/transcribe` | Transcribe an audio file via Whisper |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Google OAuth

- Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Create a project and enable the Google+ API
- Create OAuth 2.0 credentials
- Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI

### 3. Create the `.env` file

```bash
cp .env.example .env
```

Fill in the variables:

```env
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=a_long_random_string
```

### 4. Start the server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
