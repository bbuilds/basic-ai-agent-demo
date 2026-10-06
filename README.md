# AI Agent Learning Repo with Vercel's AI SDK

This is a learning and compnanion repo for my [blog post covering the fundamentals of building an AI agent](https://brandenbuilds.com/engineering-ai-agents-fundamentals-part-1).

**What this repo IS NOT**
- Starter repo
- Production ready repo

## Project Description

A CLI agent made with Vercel's AI SDK that can be installed and run via `demo agent` from the terminal. As stated before, it's literally a learning repo to learn about creating tools, evals, observability, agent UIs, and more.

## Getting Started

This project is built on top of Vercel's AI SDK, using OpenAI's API for the model and Laminar for observability. You'll need Node.js 24+ and an OpenAI API key. A Laminar API key is optional but recommended for tracing and evals.

#### 1. Install dependencies


```bash
git clone https://github.com/bbuilds/basic-ai-agent-demo.git
cd basic-ai-agent-demo
npm install
```

#### 2. Add your API keys

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Used by the agent's model |
| `LMNR_API_KEY` | No | Sends traces to Laminar; also needed for `npm run eval` |
| `AGENT_MODEL` | No | Model the agent runs on (defaults to `gpt-5.6-luna`) |
| `JUDGE_MODEL` | No | Model used to grade evals (defaults to `gpt-5.6-terra`) |

The agent only reads the `.env` in this repo, and its values override anything in your shell.

#### 3. Build and install the CLI


```bash
npm run build
npm install -g
```

then you can run `demo agent` from any directory in your terminal.

The global install links to this repo, so after changing code you only need to run `npm run build` again. If `demo-agent` says `permission denied`, reinstall the link to restore the executable bit:

```bash
npm uninstall -g ai-agents-learning && npm install -g .
```
