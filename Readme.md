# 🚀 Agentic AI Planner — Autonomous Task Execution via Telegram

An **Agentic AI system** that converts any user goal into a multi-step executable plan, selects the appropriate tools, and executes them autonomously — all through a **Telegram Bot interface**.

Built using **Node.js, MongoDB, Tavily Search, Nodemailer, Gemini (or Ollama Llama 3)** with a modular agent architecture.

---

# ✨ Features

### 🤖 Agentic Planning

- User enters a natural-language goal
- AI planner generates structured steps in JSON
- Strict, validated plan format
- Automatic retries & plan regeneration on errors
- Planner supports **Gemini** or **Ollama Llama 3**

### ⚙️ Execution Engine

- Executes steps one-by-one
- Supported tools:
  - 🔍 Tavily Search
  - 📧 Nodemailer Email
  - 📆 Calendar (MongoDB)
- Dynamic injection (e.g., search → email)
- Tool result storage and logging

### 💬 Telegram Integration

- Polling or webhook support
- Real-time log streaming
- Success, retry, and completed messages

### 🛡 Reliability Layer

- Exponential backoff
- Jitter
- Retry for 429/503
- JSON validation
- Planner fallback options

---

# 🧩 Tech Stack

| Component   | Technology                        |
| ----------- | --------------------------------- |
| AI Planner  | Gemini 2.5 Flash / Ollama Llama 3 |
| Bot         | Telegram Bot API                  |
| Backend     | Node.js                           |
| Search      | Tavily                            |
| Email       | Nodemailer                        |
| Database    | MongoDB                           |
| Reliability | Retry, backoff, strict parsing    |

---

# 📂 Project Structure

server/
├── 🧠 ai/
│ ├── 📝 safePlanner.js
│ ├── 🔑 geminiClient.js
│
├── 🔧 services/
│ ├── ⚙️ executor.js
│ ├── 🔍 searchTool.js
│ ├── ✉️ emailTool.js
│ ├── 📆 calendarTool.js
│
├── 🧰 utils/
│ ├── ♻️ geminiRetry.js
│ ├── 🧩 extractJSON.js
│
├── 🗂 models/
│ ├── 📄 planModel.js
│ ├── 📄 logModel.js
│
├── 🌐 routes/
│ ├── 🤖 telegramBot.js
│ ├── 🔌 agentRoutes.js
│
└── 🚀 index.js

---

# 🔥 How It Works

## 1️⃣ User sends a goal in Telegram

Example:

## 2️⃣ AI Planner Generates a JSON Plan

Example:

```json
{
  "goal": "Find 3 salons near me and email results",
  "steps": [
    {
      "id": 1,
      "action": "SearchTopSalons",
      "tool": "search",
      "args": { "query": "best salons near me" }
    },
    {
      "id": 2,
      "action": "EmailSalonResults",
      "tool": "email",
      "args": {
        "to": "user@example.com",
        "subject": "Top 3 Salons",
        "body": "Here are your top salons:"
      }
    }
  ]
}
```

## Executor Runs Steps with Tool Results

### Step 1 → Search

### Step 2 → Inject search results into email body

### Send email

## Stream logs to Telegram

### 📘 Log: Starting step 1

### 📘 Log: Step 1 done

### 📘 Log: Step 2 done

### ✅ Execution finished!

# Setup Instructions

## 1. Clone the project

```
git clone https://github.com/1amSumit/Autonomous-Personal-Productivity-Agent.git

```

```
cd agentic-ai-planner/server

```

## 2. Install Packages

```
npm install
```

## 3. Setup environment variables

```GEMINI_API_KEY=your-key
TAVILY_API_KEY=your-key
TELEGRAM_BOT_TOKEN=your-token

MONGO_URI=mongodb://localhost:27017/agent

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
```

## 4. Run MongoDB

```
docker run -p 27017:27017 mongo
```

## 5. Start the Agent Server

```
npm run dev
```

## 🤖 Telegram Bot Setup

### 1. Create Bot in BotFather

#### Get your bot token.

## 2. Use Polling Mode (easy for development)

### Nothing else needed — server connects automatically.

# 🔍 Tools

## 🔍 Tools

### Uses Tavily for web results.

## 📧 Email Tool

### Uses Nodemailer to send emails with dynamic content injection.

## 📆 Calendar Tool

### Stores user events/reminders in MongoDB.

## 🧪 Example Goals to Test

```
Find 5 ML tutorials and email me.
```

```
Plan my Sunday routine and remind me at 7 AM.
```

```
Search best laptops under 50k and send me a list.
```

```
Find remote internships and email me top 10 links.
```

```
Search best restaurants near me and email me recommendations.
```
