# Tasks Module

## Overview

The Tasks module is the ERP’s operational work-management layer. It handles task creation, assignment, progress tracking, approvals, recurring schedules, comments, attachments, reminders, dashboard metrics, and role-aware reporting. It is implemented as a NestJS module backed by TypeORM entities and PostgreSQL arrays/JSONB structures, and it is surfaced in the frontend through a board, list, calendar-style dashboards, and task detail views.

This module is not a simple CRUD feature. It is a business workflow system designed for multi-department assignment, reporting-manager visibility, escalation logic, recurring tasks, and approval gates before closure.

## Why this module exists

The task system is built to support real operational work across departments:

- assign tasks to one or more users
- route tasks to approvers before completion
- track progress and due dates
- support recurring work schedules
- let managers see team workload and direct reports
- keep a timeline of task activity
- send in-app and email notifications on major changes
- support dashboard and reporting views for management

## Module structure

```text
src/tasks/
├── crons/
│   └── tasks-crons.service.ts
├── dto/
│   ├── add-attachment.dto.ts
│   ├── add-comment.dto.ts
│   ├── approve-task.dto.ts
│   ├── assign-task.dto.ts
│   ├── create-task-due-reminder.dto.ts
│   ├── create-task.dto.ts
│   ├── status-transition.dto.ts
│   ├── task-approval-response.dto.ts
│   ├── time-entry.dto.ts
│   ├── update-task-progress.dto.ts
│   └── update-task.dto.ts
├── entities/
│   ├── task-activity.entity.ts
│   ├── task-approval.entity.ts
│   ├── task-attachment.entity.ts
│   ├── task-comment.entity.ts
│   ├── task-due-reminder.entity.ts
│   ├── task-notification.entity.ts
│   ├── task-time-entry.entity.ts
│   └── task.entity.ts
├── utils/
│   └── task-reminder-pkt.util.ts
├── tasks.controller.ts
├── tasks.module.ts
├── tasks.service.ts
└── README.md
```

## Core responsibilities

### 1. Task lifecycle management

The central domain model is `Task` and it supports these core states:

- `draft`
- `open`
- `in_progress`
- `blocked`
- `pending_approval`
- `approved`
- `rejected`
- `completed`
- `closed`
- `cancelled`

The service enforces strict state transitions. For example:

- `open` can move to `in_progress` or `cancelled`
- `in_progress` can move to `completed`, `blocked`, or `cancelled`
- `completed` can only go to `closed` or `in_progress` in standard mode
- `completed` can go to `pending_approval` in approval workflow mode
- `pending_approval` can become `approved`, `rejected`, `closed`, or `in_progress`
- terminal states like `closed` and `cancelled` are not editable in normal update flows

This prevents invalid task flow and helps preserve business rule integrity.

### 2. Task creation and validation

`create()` routes into `createInternal()`, where the service:

- validates assignee metadata
- resolves reporting managers from `reported_to` / `reported_to_ids`
- creates the task record
- stores attachment metadata and MOV checklist items as structured arrays
- logs creation activity
- sends assignment emails
- dispatches app notifications to assignees and approvers

The create DTO supports many operational fields such as:

- title / description
- department / priority / status
- workflow type (`standard` or `approval_required`)
- task type (`one_time`, `recurring`, `project_linked`)
- dates (`start_date`, `due_date`, `recurrence_end_date`)
- assignee IDs and metadata
- reporting manager IDs
- project linkage
- recurrence configuration
- approval-required user IDs
- MOV checklist and MOV assignment metadata

### 3. Search, filtering, and list queries

`findAll()` is the main list/search engine for tasks. It builds a TypeORM query builder and applies:

- role-based visibility filters
- direct-report filtering
- department filters
- assignee filters
- team filters
- status/priority search
- search against title, description, project name, department, priority, status, IDs, and assignee metadata
- date filtering for created date or due date logic
- calendar conditions and KPI category logic

This is one of the most important parts of the module because the frontend relies on it for dashboard, board, list, report, and search views.

Special handling exists for:

- KPI modal filtering
- overdue dashboards
- date drill-down filters
- direct-report team scope
- recurring due-date matching

### 4. Dashboard and reporting intelligence

`getDashboardStats()` produces the metrics used in task dashboards and calendar views. It aggregates:

- total tasks
- status counts
- priority counts
- department counts
- completion rate
- overdue counts
- calendar day breakdowns
- team-specific breakdowns

It also expands recurring tasks for calendar views and computes metrics accurately for due-date-based calendar queries. This logic is sophisticated and specifically tuned to avoid date-shift bugs and inconsistent totals between list, modal, and calendar views.

`getReports()` is designed for KPI/reporting pages and supports category filters like:

- pending
- completed
- overdue
- total

It ensures the report category is applied consistently in both count and data queries so pagination totals and visible rows remain aligned.

### 5. Approval-driven workflows

The module has a dedicated approval mechanism:

- `task_approvals` stores the approval status and metadata
- `approval_required_user_ids` identifies approvers
- `approved_by_id` and `rejected_by_id` track decisions
- `approvals_meta` keeps per-user decision state
- `submission_note`, `approved_note`, and `rejected_note` capture comments and reasons

Approval flow:

- task is created or updated in approval-required mode
- assignee submits completion or marks status for approval
- approvers review via `approve()`
- decision moves task to `approved` or `rejected`
- rework may reset the approval state and reopen the workflow

This pattern allows strong governance without losing traceability.

### 6. Notifications and app reminders

The module is tightly integrated with the notification system.

Notification triggers include:

- task assignment
- reassignment
- approver assignment
- status transitions
- comment creation
- mentions
- due reminder events
- overdue escalation

The service uses `sendTaskAppNotification()` to send in-app notifications with metadata including:

- task ID
- task title
- event type
- actor ID
- assigned IDs

This allows the frontend to refresh task views when a task is updated elsewhere in the app.

### 7. Due reminders and escalation

The module has a dedicated reminder feature:

- `TaskDueReminder` entity stores reminder configuration
- reminder times can be scheduled for a task
- reminder checks are executed by cron jobs
- overdue escalation runs daily
- reminder windows are calculated using PKT-aware date utilities

This is specifically important for operational use cases where a task needs reminders before due date or escalation when it becomes overdue.

### 8. Recurrence engine

Recurring tasks are first-class in the model. The `Task` entity includes:

- `task_type`
- `recurrence_rule`
- `recurrence_next_date`
- `recurrence_end_type`
- `recurrence_end_date`
- `recurrence_end_occurrences`
- `recurrence_created_count`

The service supports cadence rules like:

- daily
- weekly
- monthly
- quarterly
- annually
- `N days`

The `getNextOccurrence()` utility calculates the next occurrence while normalizing for PKT timezone realities. The service also builds recurring task calendars and ensures next-occurrence logic is compatible with dashboard and due-date queries.

Recurring tasks are processed via cron jobs:

- `processRecurrence()` creates new task instances based on schedules
- `finalizeRecurringCutoffs()` handles end-of-cycle transitions

### 9. Attachments, comments, and work history

A task can include:

- file attachments (uploaded to storage and tied to task)
- comments with user mentions
- activity records for every meaningful change
- work history entries for auditing

The system maintains an activity log for events such as:

- created
- updated
- reopened
- progress updated
- task assignment changes
- status changes
- approval events

This gives both operational visibility and auditability.

### 10. Time tracking and progress updates

The module supports:

- time-entry records via `TaskTimeEntry`
- progress updates on tasks
- progress percentage tracking
- close/reopen logic that resets or preserves progress appropriately

This is especially relevant for tasks that require a measurable completion percentage or time logging for internal work tracking.

## Data model highlights

### Task entity

The `Task` entity is the center of the module. It stores:

- identity and metadata
- ownership and assignment ids
- department and project references
- progress and completion information
- recurrence metadata
- approval links
- reporting manager relationships
- MOV item checklist and MOV assignment mapping
- timestamps
- source and source ID for external integrations

Important note: the entity supports multiple reporting managers by storing arrays of IDs and also includes derived compatibility fields such as `reported_to_id` and `reported_to_users` for richer UI rendering.

### Supporting entities

- `TaskAttachment`: stores uploaded file metadata and relationships
- `TaskComment`: stores comments and author links
- `TaskActivity`: stores task activity trail
- `TaskNotification`: tracks notification records for tasks
- `TaskTimeEntry`: stores time log entries and task effort data
- `TaskApproval`: stores approval workflow state and notes
- `TaskDueReminder`: stores reminder configuration and schedule details

## Security and access model

The module is protected by NestJS guards:

- `JwtGuard`
- `PermissionsGuard`

Permission checks are role-aware and allow a rich matrix of access patterns:

- task creation permissions
- task update permissions
- assignment permissions
- approval permissions
- view permissions
- delete permissions
- department-specific reporting
- direct-report visibility

The service does not rely only on raw role checks. It also calculates access based on:

- assigned tasks
- approver responsibilities
- direct report relationships
- department visibility configuration
- task creator / reporter relationships
- manager access on assigned users

This is one of the most business-critical parts of the module because task visibility requirements are often more nuanced than standard admin roles.

## Frontend integration

The frontend task experience is organized into a task management UI under:

- `mtjf_erp_fe/src/components/admin/tasks/`

Main areas:

- `index.jsx`: top-level task page, view mode switching
- `board/`: kanban board implementation
- `list/`: paginated list view
- `view/`: task detail modal/page with comments, attachments, quick actions, progress, status changes
- `reports/`: KPI/report dashboards
- `shared/`: filters, view mode, queries, hooks
- `add/` and `update/`: create and edit task forms

Frontend behavior includes:

- list/board toggle
- filter panel and search
- task notification refresh callbacks
- drag-and-drop status changes
- assignee-based tabs
- report dashboard, KPI breakdowns, and status transitions
- modal-based task detail previews

The board and list both depend on `useTasksServerQuery` and a server-backed filter model to keep task data consistent with backend logic.

## Important implementation patterns

### Query-builder-first design

Most of the business logic lives in service methods using TypeORM query builders rather than ad hoc SQL. This makes the module flexible for:

- filters
- role constraints
- reporting-tree logic
- date comparisons
- dashboard aggregations
- recurring scheduling

### Permission-aware filtering

Every listing and dashboard query is filtered through permission logic. The module is designed to respect departmental and reporting visibility while still allowing admin and super-admin access.

### Multi-manager reporting support

The `Task` entity explicitly supports multiple reporting-manager IDs (`reported_to`, `reported_to_ids`) while preserving compatibility with legacy single-manager structures. This is especially important in ERP environments where tasks may be routed across different manager hierarchies.

### MOV checklist handling

The module includes MOV (maintaining/monitoring/oversight or project-specific checklist) support with:

- `mov_items`
- `mov_assignments`
- checklist extraction from descriptions for backward compatibility
- visibility filtering depending on user access rights

This is a specialized feature and shows that the task system is customized beyond a generic task tracker.

## Scheduled jobs

The module runs scheduled jobs under `TasksCronsService` using NestJS `@Cron`:

- hourly due reminder processing
- hourly recurring task cutoff handling
- daily overdue escalation at 2:00 AM PKT
- daily recurrence creation at 2:00 AM PKT

These jobs ensure the module is operational even without direct user actions.

## Typical task flow

1. User creates a task with assignee(s), department, due date, optional recurrence, and approval configuration.
2. System resolves reporting managers and stores assignee/approver metadata.
3. Assignees receive app/email notifications.
4. Task appears in board, list, and dashboard views subject to permissions.
5. User updates task progress and status.
6. If approval workflow is enabled, task enters `pending_approval` before closure.
7. Approvers review and approve or reject.
8. Task history and notifications are logged.
9. Recurring tasks continue using the recurrence engine.
10. Due reminders and overdue escalation keep the task visible and actionable.

## Operational strengths

- strong task governance and status rules
- rich reporting and KPI support
- direct-report visibility for management
- recurring task automation
- approval workflows for controlled closure
- robust notification system
- actionable task history and audit trail
- frontend integration with board/list/calendar experiences

## Operational caveats / design notes

- The task module is large and highly domain-specific; it is not a generic simple task board.
- Many filters are intentionally custom-built to reflect ERP-specific reporting and business visibility rules.
- Some logic is tuned to avoid date drift, especially in PKT time and recurring calendar calculations.
- The module assumes a permission-rich environment and relies on permission metadata from the broader ERP platform.
- Backend and frontend are tightly coupled in behavior, so UI changes often require corresponding server filtering logic updates.

## Summary

The Tasks module is a complete operational task management engine for the ERP. It combines assignment, workflow enforcement, approval logic, due-date automation, recurring scheduling, notiications, permissions, and reporting into a single cohesive backend system. It is one of the most important workflow modules in the application because it sits directly between business process execution and management visibility.

In short, this module is not just a “task list”; it is the ERP’s workflow orchestration layer for execution, accountability, and oversight.
