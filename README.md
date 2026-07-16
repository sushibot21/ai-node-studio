# AI Node Studio

AI Node Studio is a local, node-based workflow builder for experimenting with AI models, iterative refinement, conversational workflow generation, and MCP-connected tools.

This README is written for someone who may be new to GitHub, coding, Codex, or Claude Code.

## What This Project Does

- Lets you build AI workflows visually using nodes
- Lets you describe a problem in chat mode and have the system generate a workflow for you
- Supports local and hosted AI providers
- Supports Ollama for local models
- Supports MCP tools
- Includes a small Figma screen-builder plugin

## Project Location

If you are working locally on this machine, the project folder is:

`/Users/spandan.das/Documents/Codex/2026-07-14/so/work/ai-node-studio`

## Before Anything Else

There are 3 important ideas:

1. Git is the version history of the code on your computer.
2. GitHub is the online place where the code is shared with collaborators.
3. `main` is the primary branch, and it should stay stable.

If multiple people work directly on `main`, things get messy very quickly. The safer approach is:

- each person creates their own branch
- they make their changes there
- they ask before pushing important work to the shared repo
- they open a Pull Request when ready

## How To Add A Collaborator On GitHub

If you own the repository and want someone else to work on it:

1. Open the GitHub repository page.
2. Click `Settings`.
3. Click `Collaborators` or `Manage access`.
4. Click `Add people`.
5. Enter their GitHub username or email.
6. Send the invite.
7. The other person must accept the invite before they can push to the repository.

Important:

- If the repo is `Private`, only invited collaborators can access it.
- If you do not want someone pushing directly to your repo, you can still ask them to work in their own fork instead.

## How Someone Else Should Start Using This Repo

After they are invited and have access, they should:

1. Clone the repository to their own machine
2. Install the dependencies
3. Create their own `.env`
4. Run the app locally
5. Work in a new branch, not `main`

## Clone The Repo

```bash
git clone https://github.com/sushibot21/ai-node-studio.git
cd ai-node-studio
```

## Install And Run

```bash
npm install
cp .env.example .env
npm run dev
```

Then open:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8787](http://localhost:8787)

## API Keys And Local Models

This project can work with different providers, but not every person needs every provider.

Examples:

- Anthropic API key
- OpenAI API key
- Gemini API key
- Ollama running locally for local models

Rules everyone should follow:

- Never commit real API keys
- Never paste secrets into GitHub issues, PRs, or chat screenshots
- Keep real secrets only inside `.env`
- `.env` is already ignored by Git and should stay that way

## If Someone Wants To Use This In Codex Or Claude Code

They can clone the repo normally and open the folder in whichever coding agent they use.

Typical flow:

1. Clone the repo
2. Open the folder in Codex or Claude Code
3. Read this README first
4. Run the app locally
5. Make changes on a separate branch
6. Test the changes
7. Ask for approval before pushing major work

That means the coding assistant is just helping them edit the local repo. The repo flow stays the same.

## The Safe Collaboration Workflow

This is the recommended workflow for anyone contributing.

### 1. Start from the latest code

```bash
git checkout main
git pull origin main
```

### 2. Create a new branch for your work

Use a branch name that describes the change:

```bash
git checkout -b improve-chat-mode
```

Other examples:

- `fix-toggle-overlap`
- `add-better-readme`
- `ollama-model-selector`
- `figma-mcp-experiment`

### 3. Make and test your changes

For example:

```bash
npm run dev
```

Before sharing, it is a good idea to run:

```bash
npm run build
npx tsc --noEmit
```

### 4. Save your work locally

```bash
git add .
git commit -m "Improve chat mode and workflow generation"
```

### 5. Ask for approval before pushing major work

If the change is large, risky, or changes behavior significantly, ask first.

Examples of changes that should be approved before pushing:

- redesigning the UI
- changing the workflow execution logic
- changing MCP behavior
- adding or removing providers
- changing persistence or memory behavior
- modifying Figma integration

Examples of smaller changes that are usually okay to push after agreement on process:

- README improvements
- typo fixes
- small UI polish
- isolated bug fixes

If your team wants stricter control, use this rule:

- no one pushes to `main` directly
- everyone pushes only to feature branches
- all merges happen through Pull Requests

## How To Push Your Branch

```bash
git push -u origin improve-chat-mode
```

After that, open GitHub and create a Pull Request into `main`.

## What Permission Means In Practice

For a beginner, "permission" usually means one of these:

- asking the project owner before pushing a large branch
- asking before opening a Pull Request for a major change
- asking before changing the architecture
- asking before deleting files or removing features

A simple message is enough:

`I made changes to conversational mode, workflow auto-run, and output rendering. Can I push this branch and open a PR?`

## Recommended Team Rules

- Do not work directly on `main`
- Do not commit `.env`
- Do not commit tokens or secrets
- Do not force-push unless everyone agrees
- Do not delete someone else's branch without checking
- Use clear commit messages
- Test before asking to merge
- Explain what changed in plain language

## Suggested Commit Message Examples

- `Add conversational workflow auto-run`
- `Fix view toggle position and overlap`
- `Improve Ollama support in iterative refiner`
- `Update README for beginner contributors`

## If Something Goes Wrong

### "I changed files and now I am confused"

Run:

```bash
git status
```

This shows what changed.

### "I want to see which branch I am on"

Run:

```bash
git branch
```

The current branch will have a `*` beside it.

### "I want the newest code from main"

Run:

```bash
git checkout main
git pull origin main
```

### "My push is failing"

Possible reasons:

- you are not a collaborator yet
- you are using the wrong GitHub account
- your token expired
- the branch name is wrong
- GitHub auth needs to be refreshed

### "I do not know whether I should push yet"

If you are unsure, ask first. That is always safer than pushing something confusing.

## Current Tech Stack

- Vite
- React
- TypeScript
- React Flow
- Express
- Zustand
- Ollama support for local models
- MCP support for external tool connections

## Main Folders

- `src/` - frontend app
- `src/nodes/` - visual workflow node components
- `src/components/` - app UI pieces
- `src/lib/` - graph execution logic and types
- `server/` - local backend and provider logic
- `figma-screen-plugin/` - Figma plugin for creating screens from structured specs

## Notes About The Figma Plugin

The included Figma plugin is a native Figma plugin inside:

`figma-screen-plugin/`

It is separate from the main web app. If someone wants to use it, they should read:

`figma-screen-plugin/README.md`

## Security Basics

If you are new to this, these rules matter a lot:

- Never commit `.env`
- Never share API keys in screenshots
- Never paste tokens into README files
- Never accept random code changes without reviewing what they do
- Be careful with anything that can write to external services

## Recommended Beginner Workflow

If you are totally new, follow this exact process:

1. Accept the GitHub collaborator invite
2. Clone the repo
3. Run `npm install`
4. Create `.env`
5. Run `npm run dev`
6. Open the app locally
7. Create a new branch
8. Make a small change first
9. Test it
10. Commit it
11. Ask before pushing if the change is important
12. Push your branch
13. Open a Pull Request

## For The Repository Owner

If you want outside contributors without chaos, the cleanest policy is:

- keep the repo private
- invite only trusted collaborators
- ask everyone to use feature branches
- ask everyone to open Pull Requests
- merge into `main` only after review

That gives you control without blocking progress.
