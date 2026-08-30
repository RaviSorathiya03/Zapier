# FlowForge

An event-driven workflow automation platform designed to explore and implement practical distributed systems concepts through asynchronous event processing and reliable execution delivery.

---

## Overview

FlowForge is a backend system for creating and executing automated workflows. Users define workflows consisting of a trigger event and a sequence of actions to be executed in response. The system decouples workflow definition from execution through asynchronous event-driven processing, using Apache Kafka as the event transport layer.

The architecture prioritizes reliability, clear separation of concerns, and demonstration of real-world distributed systems patterns.

---

## Why FlowForge?

This project was built to implement and understand:

- **Event-driven architecture** with asynchronous message processing
- **Transactional Outbox Pattern** for reliable event publishing without dual-writes
- **Workflow execution** with tracking and state management
- **At-least-once delivery** semantics and idempotent consumer design
- **Database modeling** for workflow definitions and execution history
- **Worker-based processing** of asynchronous tasks
- **Distributed system reliability** concepts

Rather than building a straightforward CRUD application, FlowForge demonstrates how to structure a system around event delivery guarantees and asynchronous processing.

---

## Architecture

FlowForge follows an event-driven, layered architecture:

```
┌─────────────────┐
│    Frontend     │
└────────┬────────┘
         │ API Requests
         ▼
┌─────────────────┐
│    Backend      │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│   PostgreSQL         │
│  (Outbox Pattern)    │
└──────────┬───────────┘
           │
           ├─► Workflow Definitions
           ├─► Execution History
           └─► Unpublished Events
           
┌──────────────────────┐
│   Sweeper            │
│ (Event Publisher)    │
└──────────┬───────────┘
           │ Polls & Publishes
           ▼
┌──────────────────────┐
│   Apache Kafka       │
│ (Event Transport)    │
└──────────┬───────────┘
           │ Consumes
           ▼
┌──────────────────────┐
│   Worker             │
│ (Action Executor)    │
└──────────┬───────────┘
           │ Writes Results
           ▼
┌──────────────────────┐
│   PostgreSQL         │
│ (Execution Records)  │
└──────────────────────┘
```

### High-Level Flow

**Workflow Creation:**
1. User defines a workflow (Zap) with a trigger and ordered actions
2. Configuration is stored in PostgreSQL

**Event Trigger:**
1. External system sends webhook event to trigger service
2. Backend creates a `ZapExecution` record
3. Database writes are immediately visible to downstream components

**Event Publishing (Transactional Outbox):**
1. Sweeper polls for unpublished outbox events
2. Events are published to Kafka
3. Successfully published events are marked as published

**Workflow Execution:**
1. Worker consumes Kafka event
2. Loads workflow definition and execution context
3. Executes actions sequentially
4. Records results in `ActionExecution` records
5. Updates `ZapExecution` status

---

## Mermaid Architecture Diagram

```mermaid
flowchart TD
    FE["Frontend (UI)"]
    BE["Backend (API)"]
    DB["PostgreSQL"]
    EXT["External Trigger"]
    WH["Webhook Endpoint"]
    SWEEP["Sweeper"]
    KAFKA["Apache Kafka"]
    WORKER["Worker"]
    
    FE -->|Create/Manage Workflows| BE
    BE -->|Query/Write| DB
    
    EXT -->|Event| WH
    WH -->|Create Execution| DB
    
    DB -->|Poll Outbox| SWEEP
    SWEEP -->|Publish| KAFKA
    KAFKA -->|Consume Event| WORKER
    WORKER -->|Execute Actions| WORKER
    WORKER -->|Write Results| DB
```

---

## Core Concepts

### Workflow Definition vs. Execution

**Workflow Definition:** The static configuration of a workflow.
- **Zap:** Contains a trigger type, trigger configuration, and ordered actions
- **Trigger:** References an `AvailableTrigger` type with JSON configuration
- **Action:** References an `AvailableAction` type with JSON configuration and execution order

**Workflow Execution:** The runtime instance of a workflow triggered by an event.
- **ZapExecution:** Represents one run of a workflow, created when a trigger event arrives
- **ActionExecution:** Represents the execution of a single action within that workflow run

### Domain Model

```
User
├── Zaps (owned by user)
    ├── Trigger (single)
    │   └── AvailableTrigger (type reference)
    ├── Actions (ordered)
    │   └── AvailableAction (type reference per action)
    └── ZapExecutions (execution history)
        ├── ActionExecutions (results per action)
```

**Entity Definitions:**

- **User:** Owns workflows and can create/modify them
- **Zap:** A workflow definition; belongs to a User; enabled/disabled
- **Trigger:** References an available trigger type with stored configuration
- **AvailableTrigger:** Metadata for a supported trigger type
- **Action:** Ordered step in a workflow; references available action type
- **AvailableAction:** Metadata for a supported action type
- **ZapExecution:** Runtime instance of a workflow execution
  - Tracks: trigger input, execution status, start/end times
  - Status: `PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`, `CANCELLED`
- **ActionExecution:** Runtime result of a single action execution
  - Tracks: input, output, errors, execution order, start/end times, status

### Execution Status

```
PENDING    → Initial state after creation
PROCESSING → Currently being processed by worker
SUCCESS    → Completed successfully
FAILED     → Encountered an error
CANCELLED  → Explicitly cancelled
```

---

## How the System Works

### 1. Trigger Event Arrives

An external system sends a webhook to the trigger service with event data.

```json
{
  "zapId": "workflow-123",
  "triggerData": { "user_email": "user@example.com", "amount": 100 }
}
```

### 2. Execution Creation (Atomic)

Backend performs a **single atomic transaction**:

```sql
BEGIN TRANSACTION
  INSERT INTO zap_executions (zapId, triggerId, triggerInput, status, startedAt)
    VALUES (...)
  INSERT INTO outbox_events (eventType, payload, published)
    VALUES ('workflow.triggered', {...}, false)
COMMIT
```

This ensures that:
- The execution record exists in the database
- The outbox event is created
- Both succeed or both fail (no partial writes)

### 3. Sweeper Discovers Event

Sweeper service polls the database:

```sql
SELECT * FROM outbox_events WHERE published = false LIMIT 100;
```

### 4. Event Published to Kafka

Sweeper publishes events to Kafka:

```
Topic: workflow.events
Message: { zapExecutionId: "...", actions: [...], status: "PENDING" }
```

After successful publishing, the event is marked:

```sql
UPDATE outbox_events SET published = true WHERE id = ...;
```

### 5. Worker Consumes and Executes

Worker consumes from Kafka:

1. Loads `ZapExecution` and `Zap` from database
2. For each `Action` in order:
   - Execute action (HTTP request, email, etc.)
   - Create `ActionExecution` record
   - Store output or error
3. Update `ZapExecution` status to `SUCCESS` or `FAILED`

---

## Transactional Outbox Pattern

The Transactional Outbox Pattern solves the **dual-write problem**.

### The Problem

Without a coordinated approach, two scenarios can occur:

**Scenario A: Database succeeds, message fails**
```
Database write succeeds  ✓
Kafka publish fails      ✗
→ Event is lost
```

**Scenario B: Message succeeds, database fails**
```
Kafka publish succeeds   ✓
Database write fails     ✗
→ Duplicate/orphaned event
```

### The Solution

All writes happen in a **single database transaction**:

```
BEGIN TRANSACTION
  1. Create ZapExecution
  2. Create OutboxEvent (unpublished)
COMMIT
  → Either both succeed or both fail (atomic)

LATER (asynchronous):
  Sweeper publishes OutboxEvent to Kafka
  Sweeper marks event as published
```

### Guarantees

- **No data loss:** Event is either fully created or not created
- **Eventual consistency:** Events are published asynchronously
- **At-least-once delivery:** Worker may receive duplicate events
  - Solution: Consumers must be idempotent

### Implementation Details

The outbox table:

```sql
CREATE TABLE outbox_events (
  id BIGSERIAL PRIMARY KEY,
  eventType VARCHAR(255) NOT NULL,
  aggregateId VARCHAR(255),
  payload JSONB NOT NULL,
  published BOOLEAN DEFAULT false,
  createdAt TIMESTAMP DEFAULT NOW(),
  publishedAt TIMESTAMP
);
```

The sweeper:
1. Queries unpublished events
2. Publishes to Kafka
3. Updates `published = true` only after Kafka confirms
4. Repeats periodically

---

## Event Flow

```
External Event
    │
    ▼
Webhook Handler
    │
    ├─ Load Zap configuration
    ├─ Create ZapExecution record
    └─ Create OutboxEvent (atomic transaction)
    │
    ▼
PostgreSQL (both records persisted)
    │
    ▼
Sweeper (periodic polling)
    │
    ├─ Find unpublished events
    └─ Publish to Kafka
    │
    ▼
Kafka Topic: workflow.events
    │
    ▼
Worker (consumes)
    │
    ├─ Load Zap and execution context
    ├─ FOR each Action IN order:
    │  ├─ Execute action
    │  ├─ Create ActionExecution record
    │  └─ Store output/error
    │
    └─ Update ZapExecution status
    │
    ▼
PostgreSQL (execution results persisted)
```

---

## Workflow Execution Model

### Sequential Action Execution

Actions are executed in order (determined by `Action.index`):

```
Action 1 → Action 2 → Action 3 → Complete
   ✓          ✓          ✓
```

### Execution Context

Each action receives:
- Its own input configuration
- Outputs from prior actions (if designed to chain)
- Trigger data

### Status Propagation

```
ZapExecution: PROCESSING
  ├─ ActionExecution 1: SUCCESS
  ├─ ActionExecution 2: PROCESSING
  └─ ActionExecution 3: PENDING

→ After action 2 fails:

ZapExecution: FAILED
  ├─ ActionExecution 1: SUCCESS
  ├─ ActionExecution 2: FAILED (with error)
  └─ ActionExecution 3: SKIPPED (not executed)
```

---

## Database Model

### Core Tables

**users**
```
id (UUID)
name (VARCHAR)
email (VARCHAR, unique)
password (VARCHAR)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
```

**zaps**
```
id (UUID)
name (VARCHAR)
userId (FK → users)
enabled (BOOLEAN)
triggerId (FK → triggers)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
```

**triggers**
```
id (UUID)
zapId (FK → zaps)
availableTriggerId (FK → available_triggers)
config (JSONB)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
```

**available_triggers**
```
id (UUID)
name (VARCHAR)
description (TEXT)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
```

**actions**
```
id (UUID)
zapId (FK → zaps)
availableActionId (FK → available_actions)
index (INTEGER)
config (JSONB)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
UNIQUE(zapId, index)
```

**available_actions**
```
id (UUID)
name (VARCHAR)
description (TEXT)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
```

**zap_executions**
```
id (UUID)
zapId (FK → zaps)
triggerId (FK → triggers)
triggerInput (JSONB)
status (VARCHAR) [PENDING, PROCESSING, SUCCESS, FAILED, CANCELLED]
startedAt (TIMESTAMP)
endedAt (TIMESTAMP)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
```

**action_executions**
```
id (UUID)
zapExecutionId (FK → zap_executions)
actionId (FK → actions)
index (INTEGER)
status (VARCHAR) [PENDING, PROCESSING, SUCCESS, FAILED, SKIPPED]
input (JSONB)
output (JSONB)
error (JSONB)
startedAt (TIMESTAMP)
endedAt (TIMESTAMP)
createdAt (TIMESTAMP)
updatedAt (TIMESTAMP)
```

**outbox_events**
```
id (BIGSERIAL)
eventType (VARCHAR)
aggregateId (VARCHAR)
payload (JSONB)
published (BOOLEAN, default: false)
createdAt (TIMESTAMP)
publishedAt (TIMESTAMP)
```

---

## Tech Stack

### Backend
- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js (or similar REST framework)

### Database
- **Primary Datastore:** PostgreSQL
- **ORM:** Prisma

### Messaging & Events
- **Event Transport:** Apache Kafka
- **Pattern:** Transactional Outbox

### Infrastructure
- **Containerization:** Docker
- **Local Development:** Docker Compose

### Frontend (Planned)
- React or Next.js

---

## Project Structure

```
flowforge/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── zaps.ts
│   │   │   │   ├── triggers.ts
│   │   │   │   ├── actions.ts
│   │   │   │   └── webhooks.ts
│   │   │   └── middleware/
│   │   ├── services/
│   │   │   ├── userService.ts
│   │   │   ├── zapService.ts
│   │   │   ├── executionService.ts
│   │   │   └── webhookService.ts
│   │   ├── workers/
│   │   │   ├── workflowWorker.ts
│   │   │   └── kafkaConsumer.ts
│   │   ├── sweeper/
│   │   │   └── outboxSweeper.ts
│   │   ├── db/
│   │   │   └── prisma/
│   │   │       └── schema.prisma
│   │   └── index.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   └── [React/Next.js application] (Planned)
├── docker-compose.yml
├── README.md
└── .gitignore
```

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL (via Docker)
- Apache Kafka (via Docker)

### Environment Variables

Create a `.env` file in the backend directory:

```
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/flowforge"

# Server
PORT=3000
NODE_ENV=development

# Kafka
KAFKA_BROKERS="kafka:9092"
KAFKA_GROUP_ID="flowforge-worker"

# Sweeper
SWEEPER_POLL_INTERVAL_MS=5000

# Frontend (when implemented)
REACT_APP_API_URL="http://localhost:3000"
```

### Running Locally

**1. Start services with Docker Compose:**

```bash
docker-compose up
```

This starts:
- PostgreSQL (port 5432)
- Apache Kafka (port 9092)
- Backend server (port 3000)

**2. Set up the database:**

```bash
npm run prisma:migrate
npm run prisma:seed  # (if seed script exists)
```

**3. Start the backend:**

```bash
npm install
npm run dev
```

**4. Start the sweeper:**

```bash
npm run sweeper
```

**5. Start the worker:**

```bash
npm run worker
```

---

## Example Workflow

### Scenario: Send Email on Webhook

**Workflow Definition:**

```
Trigger: Webhook (receives user signup data)
Action 1: Send Email (welcome message)
Action 2: Log to Database
```

### Step-by-Step Execution

**1. Trigger Event:**

```bash
curl -X POST http://localhost:3000/webhooks/workflow-123 \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "name": "John Doe"
  }'
```

**2. Backend Processing:**

```
POST /webhooks/:zapId
├─ Load Zap
├─ Create ZapExecution
├─ Create OutboxEvent
└─ Return 202 Accepted
```

**3. Database State:**

```sql
-- zap_executions
INSERT INTO zap_executions (zapId, triggerId, triggerInput, status)
VALUES ('zap-123', 'trigger-1', '{"email":"newuser@example.com",...}', 'PENDING');

-- outbox_events
INSERT INTO outbox_events (eventType, payload, published)
VALUES ('workflow.triggered', '{...}', false);
```

**4. Sweeper Publishes:**

```
Poll: SELECT * FROM outbox_events WHERE published = false
Publish: Kafka topic "workflow.events" message
Mark: UPDATE outbox_events SET published = true
```

**5. Worker Executes:**

```
Consume: Kafka event
Load: Zap and execution context

Action 1: Send Email
├─ Call email service
├─ Create ActionExecution (SUCCESS, output: { messageId: "..." })

Action 2: Log to Database
├─ Insert log record
├─ Create ActionExecution (SUCCESS)

Update: ZapExecution status = SUCCESS
```

**6. Final State:**

```sql
-- Execution history persisted
SELECT * FROM zap_executions WHERE id = 'exec-123';
-- Status: SUCCESS, endedAt: 2024-01-15 10:30:45

-- Action results available
SELECT * FROM action_executions WHERE zapExecutionId = 'exec-123';
-- Action 1: SUCCESS, output: {...}
-- Action 2: SUCCESS, output: {...}
```

---

## Reliability & Failure Handling

### Failure Scenarios

**Scenario 1: Worker crashes during execution**
- ZapExecution remains in `PROCESSING`
- Worker (or another instance) retries after timeout
- Action is re-executed

**Scenario 2: Action fails (e.g., email service down)**
- ActionExecution status: `FAILED`
- Error logged in `ActionExecution.error`
- ZapExecution status: `FAILED`
- Retry handling is **planned**

**Scenario 3: Kafka message lost (unlikely)**
- Outbox event remains unpublished
- Sweeper retries on next poll cycle
- Eventually published

### Guarantees

- **No duplicate executions** if worker gracefully handles idempotency
- **No lost events** (atomicity via Transactional Outbox)
- **Eventual consistency** (events may be processed with delay)

### Retry Handling (Planned)

- Configurable retry policies per action
- Exponential backoff
- Dead letter queue for failed executions

---

## Idempotency

Since the system uses at-least-once delivery semantics, the **same Kafka event may be consumed multiple times**.

Workers must be designed to handle duplicate events safely.

### Example: Idempotent Email Action

**Naive (Not Idempotent):**
```javascript
// Vulnerable to sending duplicate emails
await emailService.send(email);
```

**Idempotent:**
```javascript
const executionId = actionExecution.id;
const cacheKey = `email:${executionId}`;

// Check if already executed
const cached = await cache.get(cacheKey);
if (cached) {
  return cached; // Return cached result
}

// Execute and cache
const result = await emailService.send(email);
await cache.set(cacheKey, result, { ttl: 3600 });
return result;
```

Or using **database uniqueness constraints**:

```sh
npx turbo link
bun exec turbo link
bun exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.dev/docs/reference/configuration)
- [CLI Usage](https://turborepo.dev/docs/reference/command-line-reference)
