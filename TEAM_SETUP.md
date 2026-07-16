# Team Setup Guide

This guide is for teammates who are cloning `ai-node-studio` for the first time and want to work on it locally in Codex or Claude Code.

## Goal

Each teammate should be able to:

- log into Git properly
- clone the repository
- install dependencies
- run the app locally
- optionally install Ollama for local models
- optionally add Anthropic later for stronger hosted-model workflows
- make changes on their own branch

## 1. Install What You Need

Please install these first:

- Git
- Node.js and npm
- Codex or Claude Code
- Ollama, if you want local AI models

Check if they are installed:

```bash
git --version
node -v
npm -v
```

If using Ollama:

```bash
ollama --version
```

## 2. Configure Git Login For The First Time

If you have never used Git on your machine before, run:

```bash
git config --global user.name "Your Full Name"
git config --global user.email "your-email@example.com"
```

Then confirm:

```bash
git config --global user.name
git config --global user.email
```

This identifies your commits.

## 3. Accept GitHub Access

Make sure you have accepted the GitHub collaborator invite before trying to clone or push.

## 4. Clone The Repository

```bash
git clone https://github.com/sushibot21/ai-node-studio.git
cd ai-node-studio
```

## 5. Install Dependencies

```bash
npm install
```

## 6. Create Your Environment File

```bash
cp .env.example .env
```

Then open `.env`.

### Recommended default

If you are using Ollama locally, you can leave the API key fields blank.

### Optional Anthropic setup

If we begin using Anthropic for hosted model quality or MCP-related workflows later, add:

```bash
ANTHROPIC_API_KEY=your_key_here
```

Important:

- Never commit `.env`
- Never share API keys in chat, screenshots, or pull requests

## 7. Install Ollama

Ollama is the easiest default way to run local models for this project.

Install Ollama from:
[https://ollama.com/download](https://ollama.com/download)

After installing, make sure Ollama is running.

Check available models:

```bash
ollama list
```

If you need to pull a model, examples are:

```bash
ollama pull hermes3:latest
ollama pull gemma3:4b
ollama pull qwen3:14b
```

## 8. Run The App

```bash
npm run dev
```

Open:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8787](http://localhost:8787)

## 9. Open In Codex Or Claude Code

Once the repo is cloned, open the folder in Codex or Claude Code and work from that local copy.

The agent helps you edit code, but Git rules still apply.

## 10. Always Create A Branch Before Editing

Do not work directly on `main`.

```bash
git checkout -b your-branch-name
```

Examples:

- `improve-ui`
- `fix-memory`
- `ollama-setup`
- `anthropic-mcp-option`

## 11. Save Your Work

```bash
git add .
git commit -m "Describe what you changed"
```

## 12. Ask Before Pushing Major Work

Please ask before pushing if your change affects:

- workflow execution
- memory or persistence
- MCP behavior
- Figma-related tooling
- provider configuration
- major UI behavior

When approved, push your branch:

```bash
git push -u origin your-branch-name
```

## 13. Notes On Anthropic And Figma

Anthropic can be enabled as an optional provider in `.env`, and the app already supports Anthropic nodes.

However, this is important:

- An Anthropic API key does not automatically create Figma write access
- Figma write ability depends on the MCP server and its exposed tools
- Anthropic is the model layer, not the permission layer

So the setup is:

- Ollama = local default
- Anthropic = optional hosted model
- MCP/Figma write access = depends on external MCP configuration

## 14. Useful Commands

```bash
git status
git branch
git pull origin main
```

## 15. Safety Rules

- Never commit `.env`
- Never push directly to `main`
- Never expose tokens
- If unsure, ask before pushing
