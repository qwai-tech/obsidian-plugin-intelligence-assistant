# Quick Actions Settings E2E Test Coverage Analysis

## Overview

This document analyzes the current E2E test coverage for Quick Actions settings and outlines a comprehensive testing strategy.

### Quick Actions Tab Structure

The Quick Actions settings tab (`src/presentation/components/tabs/quickactions-tab.ts`) is a **single-page interface** with:

1. **Action Prefix Configuration** - Customize the prefix for all quick actions
2. **Quick Actions Table** - List of configured actions with CRUD operations
3. **Edit Modal** - Modal dialog to create/edit quick action details
4. **Empty State** - Shown when no actions are configured
5. **Usage Info** - Instructions for using quick actions

### Quick Action Configuration Properties

From `src/types/settings.ts`:

```typescript
export interface QuickActionConfig {
  id: string;                        // Unique identifier
  name: string;                      // Display name in context menu
  enabled: boolean;                  // Whether action is active
  prompt: string;                    // AI prompt template
  model?: string;                    // Optional: specific model to use
  actionType: 'replace' | 'explain'; // How to handle AI response
}
```

### Default Quick Actions

The plugin comes with 2 default quick actions:
1. **Make text longer** - Expands and elaborates on selected text (replace)
2. **Summarize text** - Provides a concise summary (replace)

## Current Test Coverage

### Existing Tests

**Status**: ❌ **0% coverage** - No Quick Actions E2E tests exist

### Coverage Gap

- ❌ No tests for action prefix configuration
- ❌ No tests for CRUD operations
- ❌ No tests for enable/disable functionality
- ❌ No tests for edit modal operations
- ❌ No tests for action types (replace/explain)
- ❌ No tests for model selection
- ❌ No tests for state persistence
- ❌ No tests for empty state
- ❌ No tests for default actions

## Required Test Coverage

### 1. Display and Navigation Tests

#### 1.1 Tab Display (P0)
- [ ] Should display Quick Actions tab in settings
- [ ] Should show tab title "Quick actions"
- [ ] Should display description text
- [ ] Should show action summary with counts

#### 1.2 Action Summary Display (P0)
- [ ] Should display total action count
- [ ] Should display enabled action count
- [ ] Should update counts when actions change
- [ ] Should show correct singular/plural text

### 2. Action Prefix Configuration Tests

#### 2.1 Prefix Display and Editing (P0)
- [ ] Should display action prefix input
- [ ] Should show default prefix (⚡)
- [ ] Should allow changing prefix
- [ ] Should persist prefix value
- [ ] Should accept emoji prefixes
- [ ] Should accept text prefixes
- [ ] Should allow empty prefix

#### 2.2 Prefix Validation (P1)
- [ ] Should trim whitespace from prefix
- [ ] Should handle multi-character prefixes

### 3. Quick Actions Table Display Tests

#### 3.1 Table Structure (P0)
- [ ] Should display table with 5 columns (Action, Type, Model, Prompt Preview, Actions)
- [ ] Should show table headers
- [ ] Should display all configured actions as rows

#### 3.2 Action Row Display (P0)
- [ ] Should show action name
- [ ] Should display enable/disable checkbox
- [ ] Should show checkbox state correctly
- [ ] Should display action type badge
- [ ] Should show model name (or "Default")
- [ ] Should display prompt preview (truncated to 60 chars)
- [ ] Should show Edit and Delete buttons

#### 3.3 Empty State (P0)
- [ ] Should show empty state when no actions configured
- [ ] Should display empty state message
- [ ] Should hide table when empty
- [ ] Should show "add quick action" button in empty state

### 4. CRUD Operations Tests

#### 4.1 Create Quick Action (P0)
- [ ] Should show "add quick action" button
- [ ] Should create new action with default values
- [ ] Should open edit modal for new action
- [ ] Should add action to table after creation
- [ ] Should increment action count
- [ ] Should generate unique ID for new action

#### 4.2 Read/List Quick Actions (P0)
- [ ] Should display all configured actions
- [ ] Should show actions in order
- [ ] Should preserve action order

#### 4.3 Update Quick Action (P0)
- [ ] Should open edit modal when Edit clicked
- [ ] Should show current action values in modal
- [ ] Should update action name
- [ ] Should update action type
- [ ] Should update model selection
- [ ] Should update prompt template
- [ ] Should save changes on Save click
- [ ] Should discard changes on Cancel click
- [ ] Should reflect changes in table after save

#### 4.4 Delete Quick Action (P0)
- [ ] Should show Delete button for each action
- [ ] Should show confirmation dialog on delete
- [ ] Should delete action on confirmation
- [ ] Should cancel delete on dialog cancel
- [ ] Should remove action from table after deletion
- [ ] Should decrement action count
- [ ] Should show empty state after deleting all actions

### 5. Enable/Disable Tests

#### 5.1 Toggle Functionality (P0)
- [ ] Should show checkbox for each action
- [ ] Should enable action when checkbox checked
- [ ] Should disable action when checkbox unchecked
- [ ] Should persist enabled state
- [ ] Should update enabled count in summary

#### 5.2 Enabled State Behavior (P1)
- [ ] Should show correct checkbox state on reload
- [ ] Should allow enabling all actions
- [ ] Should allow disabling all actions
- [ ] Should maintain enabled state during edit

### 6. Edit Modal Tests

#### 6.1 Modal Display (P0)
- [ ] Should open modal when Edit clicked
- [ ] Should open modal when creating new action
- [ ] Should display modal title "Edit quick action"
- [ ] Should show all configuration fields
- [ ] Should close modal on Cancel
- [ ] Should close modal on Save
- [ ] Should close modal on Escape key

#### 6.2 Name Field (P0)
- [ ] Should display name input
- [ ] Should show current name value
- [ ] Should allow editing name
- [ ] Should show placeholder text
- [ ] Should validate name is not empty (P1)

#### 6.3 Action Type Field (P0)
- [ ] Should display action type dropdown
- [ ] Should show both options (Replace/Explain)
- [ ] Should show current action type
- [ ] Should allow changing action type
- [ ] Should update type badge in table after save

#### 6.4 Model Selection Field (P0)
- [ ] Should display model dropdown
- [ ] Should show "Use default model" option
- [ ] Should list all available models
- [ ] Should show current model selection
- [ ] Should allow selecting default model
- [ ] Should allow selecting specific model
- [ ] Should update model display in table after save

#### 6.5 Prompt Template Field (P0)
- [ ] Should display prompt textarea
- [ ] Should show current prompt value
- [ ] Should allow editing prompt
- [ ] Should show placeholder text
- [ ] Should support multi-line prompts
- [ ] Should validate prompt is not empty (P1)

#### 6.6 Modal Actions (P0)
- [ ] Should show Save and Cancel buttons
- [ ] Should save changes on Save click
- [ ] Should discard changes on Cancel click
- [ ] Should close modal after Save
- [ ] Should close modal after Cancel

### 7. Action Type Behavior Tests

#### 7.1 Replace Action Type (P1)
- [ ] Should show "replace" badge for replace actions
- [ ] Should display correct type in modal
- [ ] Should persist type selection

#### 7.2 Explain Action Type (P1)
- [ ] Should show "explain" badge for explain actions
- [ ] Should display correct type in modal
- [ ] Should persist type selection

### 8. Model Selection Tests

#### 8.1 Default Model (P0)
- [ ] Should display "Default" when no model selected
- [ ] Should allow selecting "Use default model"
- [ ] Should clear model field when default selected

#### 8.2 Specific Model (P0)
- [ ] Should list all available models
- [ ] Should display model name in table
- [ ] Should persist model selection
- [ ] Should show full model name (not ID)

### 9. State Persistence Tests

#### 9.1 Configuration Persistence (P0)
- [ ] Should persist action prefix
- [ ] Should persist all quick actions
- [ ] Should persist action properties (name, type, model, prompt, enabled)
- [ ] Should restore all settings on plugin reload
- [ ] Should restore settings after closing/reopening settings modal

#### 9.2 Edit Session Persistence (P1)
- [ ] Should preserve unsaved changes during edit session
- [ ] Should discard unsaved changes on cancel
- [ ] Should not affect other actions during edit

### 10. Validation Tests

#### 10.1 Required Fields (P1)
- [ ] Should require action name
- [ ] Should require prompt template
- [ ] Should show validation errors for empty fields
- [ ] Should prevent saving with invalid data

#### 10.2 Data Integrity (P1)
- [ ] Should prevent duplicate action IDs
- [ ] Should maintain action order
- [ ] Should preserve action data during operations

### 11. Usage Info Tests

#### 11.1 Info Display (P2)
- [ ] Should display usage info section
- [ ] Should show usage instructions
- [ ] Should explain action types
- [ ] Should describe context menu integration

### 12. Default Actions Tests

#### 12.1 Default Actions Presence (P1)
- [ ] Should include default actions on first install
- [ ] Should show "Make text longer" action
- [ ] Should show "Summarize text" action
- [ ] Should allow editing default actions
- [ ] Should allow deleting default actions

## Test File Structure

Based on the single-page interface and test complexity, recommend **2 main test files**:

### Test Files

1. **`quickactions-crud.spec.ts`** (~400 lines)
   - Display and navigation (4 test groups, ~15 tests)
   - Action prefix configuration (2 test groups, ~9 tests)
   - CRUD operations (4 test groups, ~25 tests)
   - Enable/disable functionality (2 test groups, ~7 tests)
   - Covers core functionality entirely

2. **`quickactions-modal.spec.ts`** (~350 lines)
   - Edit modal display (2 test groups, ~7 tests)
   - Modal field operations (5 test groups, ~25 tests)
   - Action type behavior (2 test groups, ~6 tests)
   - Model selection (2 test groups, ~9 tests)
   - State persistence (2 test groups, ~8 tests)
   - Validation (2 test groups, ~5 tests)
   - Covers modal operations entirely

**Total**: ~750 lines, **~116 tests**

## Helper Functions Required

### Navigation Helpers

```typescript
export async function openQuickActionsTab(): Promise<void>
export async function getActionSummary(): Promise<{ total: number; enabled: number }>
```

### Action Prefix Helpers

```typescript
export async function getActionPrefix(): Promise<string>
export async function setActionPrefix(prefix: string): Promise<void>
```

### Quick Actions Table Helpers

```typescript
export async function getQuickActions(): Promise<string[]>
export async function isQuickActionExists(actionName: string): Promise<boolean>
export async function getQuickActionCount(): Promise<number>
export async function hasQuickActionsEmptyState(): Promise<boolean>
```

### CRUD Helpers

```typescript
export async function addQuickAction(config: Partial<QuickActionConfig>): Promise<void>
export async function editQuickAction(actionName: string, updates: Partial<QuickActionConfig>): Promise<void>
export async function deleteQuickAction(actionName: string, confirm: boolean): Promise<void>
```

### Enable/Disable Helpers

```typescript
export async function isQuickActionEnabled(actionName: string): Promise<boolean>
export async function toggleQuickAction(actionName: string, enabled: boolean): Promise<void>
```

### Action Details Helpers

```typescript
export async function getQuickActionType(actionName: string): Promise<'replace' | 'explain'>
export async function getQuickActionModel(actionName: string): Promise<string>
export async function getQuickActionPrompt(actionName: string): Promise<string>
```

### Modal Helpers

```typescript
export async function openQuickActionModal(actionName?: string): Promise<void>
export async function closeQuickActionModal(): Promise<void>
export async function isQuickActionModalOpen(): Promise<boolean>
export async function fillQuickActionForm(config: Partial<QuickActionConfig>): Promise<void>
export async function saveQuickActionModal(): Promise<void>
export async function cancelQuickActionModal(): Promise<void>
```

### Model Selection Helpers

```typescript
export async function getAvailableModels(): Promise<string[]>
export async function selectModel(modelName: string): Promise<void>
```

**Total**: ~25 helper functions

## Selectors Required

### Quick Actions Tab Selectors

```typescript
quickActions: {
  // Tab navigation
  tab: '.settings-tab*=Quick Actions',
  tabContent: '.settings-tab-content',

  // Action prefix
  prefixInput: settingByName('Action prefix') + '//input',

  // Summary
  summary: '.ia-section-summary',
  addButton: 'button*=add quick action',

  // Table
  table: '.settings-tab-content .ia-table',
  tableRows: '.settings-tab-content .ia-table .ia-table-row',
  emptyState: '.ia-empty-state',

  // Row selectors
  actionRow: (actionName: string) => `.ia-table-row:has(.ia-table-title*="${actionName}")`,
  enableCheckbox: (actionName: string) => `.ia-table-row:has(.ia-table-title*="${actionName}") input[type="checkbox"]`,
  typeBadge: (actionName: string) => `.ia-table-row:has(.ia-table-title*="${actionName}") .ia-tag`,
  modelCell: (actionName: string) => `.ia-table-row:has(.ia-table-title*="${actionName}") .ia-table-cell:nth-child(3)`,
  promptPreview: (actionName: string) => `.ia-table-row:has(.ia-table-title*="${actionName}") .ia-table-subtext`,
  editButton: (actionName: string) => `.ia-table-row:has(.ia-table-title*="${actionName}") button*=Edit`,
  deleteButton: (actionName: string) => `.ia-table-row:has(.ia-table-title*="${actionName}") button*=delete`,

  // Edit Modal
  modal: {
    container: '.modal:has(h2*=Edit quick action)',
    header: '.modal h2',
    nameInput: settingByName('Name') + '//input',
    actionTypeDropdown: settingByName('Action type') + '//select',
    modelDropdown: settingByName('Model') + '//select',
    promptTextarea: settingByName('Prompt template') + '//textarea',
    saveButton: 'button*=Save',
    cancelButton: 'button*=Cancel',
  },

  // Usage info
  usageInfo: '.ia-info-box',
}
```

**Total**: ~25 selectors

## Test Priority Breakdown

### P0 (Must Have) - ~85 tests
- Display and navigation (15 tests)
- Action prefix configuration (7 tests)
- CRUD operations (25 tests)
- Enable/disable functionality (7 tests)
- Edit modal operations (25 tests)
- State persistence (6 tests)

**Coverage**: ~75% of Quick Actions functionality

### P1 (Should Have) - ~25 tests
- Prefix validation (2 tests)
- Enable state behavior (3 tests)
- Name/prompt validation (2 tests)
- Action type behavior (6 tests)
- Model selection (6 tests)
- Data integrity (3 tests)
- Default actions (5 tests)

**Coverage**: ~22% additional (total ~97%)

### P2 (Nice to Have) - ~6 tests
- Usage info display (4 tests)
- UI/UX details (2 tests)

**Coverage**: ~3% additional (total ~100%)

## Implementation Roadmap

### Phase 1: Core Infrastructure (P0)
**Estimated**: 1 day

1. Extend `selectors.ts` with ~25 Quick Actions selectors
2. Create `quickactions-helpers.ts` with ~25 helper functions
3. Set up test file structure (2 spec files)

### Phase 2: CRUD and Table Tests (P0)
**Estimated**: 1-2 days

4. Implement `quickactions-crud.spec.ts` (~56 tests)
5. Validate with lint and build

### Phase 3: Modal Tests (P0)
**Estimated**: 1-2 days

6. Implement `quickactions-modal.spec.ts` (~60 tests)
7. Validate with lint and build

### Phase 4: P1 and P2 Tests (Optional)
**Estimated**: 1 day

8. Add P1 tests (~25 tests)
9. Add P2 tests (~6 tests)
10. Final validation

## Coverage Goals

- **Immediate Goal**: 75% coverage with P0 tests (~85 tests)
- **Medium-term Goal**: 97% coverage with P0+P1 tests (~110 tests)
- **Long-term Goal**: 100% coverage with all tests (~116 tests)

## Notes

### Complexity Assessment

Quick Actions settings are **moderately complex**:
- **Single page** (no subtabs) - simpler than RAG and Tools
- **6 configuration properties** - similar to MCP
- **CRUD operations** - standard operations
- **Edit modal** - 4 fields with validation
- **2 action types** - replace vs explain
- **Model selection** - optional, defaults to "Use default model"
- **Enable/disable toggle** - per-action control

### Comparison with Other Tabs

| Tab | Pages | Properties | Test Files | Tests | LOC |
|-----|-------|------------|------------|-------|-----|
| MCP | 1 | ~10 | 3 | 45 | ~1,200 |
| Tools | 3 | ~15 | 2 | 39 | ~850 |
| RAG | 6 | 25+ | 6 | ~118 | ~1,980 |
| **Quick Actions** | **1** | **6** | **2** | **~116** | **~750** |

Quick Actions has **high test count** relative to complexity due to:
- Comprehensive CRUD testing
- Modal operations testing
- Enable/disable for each action
- Multiple action types and models

### Special Testing Considerations

1. **Modal Operations**: Edit modal is the primary interaction point
   - Need to test modal open/close
   - Field validation
   - Save/cancel behavior
   - Data persistence

2. **Action Types**: Two distinct behaviors (replace vs explain)
   - Both types need testing
   - Type switching needs validation
   - Display differences need verification

3. **Model Selection**: Optional model override
   - Default model behavior
   - Specific model selection
   - Model name display (not ID)

4. **Enable/Disable**: Per-action toggle
   - Affects action availability in context menu
   - Affects enabled count
   - Persists across sessions

5. **Empty State**: Special UI when no actions
   - Shows different content
   - Still allows adding actions
   - Transitions to table view when actions added

### Estimated Lines of Code

- **Selectors**: ~100 lines (added to selectors.ts)
- **Helpers**: ~350 lines (new quickactions-helpers.ts)
- **Tests**: ~750 lines (2 spec files)
- **Coverage doc**: ~600 lines (this file)

**Total**: ~1,800 lines of test infrastructure

## Success Criteria

### Definition of Done

✅ All P0 tests implemented and passing (~85 tests)
✅ All helper functions implemented (~25 functions)
✅ All selectors added (~25 selectors)
✅ Lint checks pass with no new errors
✅ Build succeeds with no TypeScript errors
✅ Tests are maintainable and follow established patterns
✅ Code coverage reaches 75%+ of Quick Actions functionality

### Stretch Goals

🎯 All P1 tests implemented (~110 total tests, 97% coverage)
🎯 All P2 tests implemented (~116 total tests, 100% coverage)
🎯 Integration tests with context menu
🎯 Tests for actual AI action execution (replace/explain)
