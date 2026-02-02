# TOOLS E2E Test Coverage Analysis

## Current Test Coverage

### Existing Test Files: **NONE**
**Total Test Cases:** 0
**Coverage:** 0%

**Finding:** No E2E tests exist for the Tools settings tab.

---

## TOOLS Implementation Overview

### Tools Tab Structure (`src/presentation/components/tabs/tools-tab.ts` - 584 lines)

The Tools tab has **3 subtabs**:

#### 1. **Built-in Tools** (Read-only configuration)
- Displays 6 built-in tools for file operations and note management
- Users can enable/disable each tool via checkbox
- **No CRUD operations** - tools are predefined

**Built-in Tools:**
- `read_file` - Read file contents from vault
- `write_file` - Write or update file in vault
- `list_files` - List files in vault or folder
- `search_files` - Search files by name or content
- `create_note` - Create new note with content
- `append_to_note` - Append content to existing note

**Table Columns:**
- Name (with icon)
- Category
- Description
- Parameters
- Enabled (checkbox)

#### 2. **MCP Tools** (Read-only view)
- Displays tools from connected MCP servers
- Shows both **live** and **cached** tools
- Server connection status indicators
- **No actions** - managed in MCP tab

**Table Columns:**
- Server (with connection status)
- Tool name
- Description
- Parameters
- Source (Live/Cached)

**Features:**
- Groups tools by server
- Shows server connection status (connected/disconnected)
- Differentiates live vs cached tools
- Empty state when no MCP tools available

#### 3. **OpenAPI / HTTP Tools** (Full CRUD)
- Configure HTTP/OpenAPI tool sources
- Full CRUD operations (Add, Edit, Delete)
- Reload and refetch functionality
- **Most complex subtab**

**Configuration Fields:**
- `id` - Unique identifier
- `name` - Display name
- `enabled` - Enable/disable toggle
- `sourceType` - 'file' or 'url'
- `specPath` - Local file path (for file sources)
- `specUrl` - Remote URL (for URL sources)
- `baseUrl` - Base URL override (optional)
- `authType` - 'none', 'header', or 'query'
- `authKey` - Authentication key name
- `authValue` - Authentication credential value
- `lastFetchedAt` - Timestamp of last fetch (for URL sources)

**Table Columns:**
- Name
- Source (file path or URL)
- Auth (type and key)
- Status (Enabled/Disabled)
- Actions (Edit, Reload, Refetch, Delete)

**Actions:**
- **Add HTTP source** - Opens modal to create new source
- **Edit** - Opens modal to edit existing source
- **Reload** - Reload tools from spec (uses cache for URLs)
- **Refetch** - Fetch fresh spec from URL (URL sources only)
- **Delete** - Remove HTTP source

### OpenAPI Config Modal

**Settings:**
1. **Display name** - Text input
2. **Enabled** - Toggle (triggers reload on change)
3. **Source type** - Dropdown (file/url, reopens modal on change)
4. **OpenAPI file path** - Text input (file sources only)
5. **OpenAPI URL** - Text input (URL sources only)
6. **Base URL override** - Text input (optional)
7. **Authentication** - Dropdown (none/header/query)
8. **Credential key** - Text input (e.g., "Authorization", "api_key")
9. **Credential value** - Text input (e.g., "Bearer token", "secret")

**Modal Actions:**
- **Reload tools** - Reload from existing spec
- **Refetch** - Icon button (URL sources only)
- **Delete source** - Icon button (removes and closes modal)
- **Close** - X button or backdrop click

**Validation:**
- Auto-saves on field blur
- Cache path displayed for URL sources
- Last fetched timestamp shown
- Notices displayed for actions

---

## Gap Analysis

### P0 - Critical Functionality (Not Tested)

#### 1. **Built-in Tools Tab** (0% coverage)
**Missing Tests:**
- ❌ Display all 6 built-in tools
- ❌ Show tool metadata (name, category, description, parameters)
- ❌ Enable/disable tool checkboxes
- ❌ Persist enabled state across sessions
- ❌ Display tool icons
- ❌ Show info callout at bottom

**Estimated Tests:** 6-8 tests

#### 2. **MCP Tools Tab** (0% coverage)
**Missing Tests:**
- ❌ Display MCP tools from connected servers
- ❌ Show live vs cached tools
- ❌ Display server connection status
- ❌ Group tools by server
- ❌ Show tool parameters
- ❌ Display empty state when no MCP tools
- ❌ Update when servers connect/disconnect

**Estimated Tests:** 7-9 tests

#### 3. **OpenAPI CRUD Operations** (0% coverage)
**Missing Tests:**
- ❌ Create HTTP source with file source type
- ❌ Create HTTP source with URL source type
- ❌ Edit existing HTTP source
- ❌ Delete HTTP source
- ❌ Display all HTTP sources in table
- ❌ Show source details (name, source, auth, status)
- ❌ Empty state when no sources configured

**Estimated Tests:** 8-10 tests

#### 4. **OpenAPI Modal Configuration** (0% coverage)
**Missing Tests:**
- ❌ Open modal from Add button
- ❌ Open modal from Edit button
- ❌ Change source type (file ↔ URL)
- ❌ Configure file source with path
- ❌ Configure URL source with URL
- ❌ Set base URL override
- ❌ Configure authentication (none/header/query)
- ❌ Set credential key and value
- ❌ Enable/disable source toggle
- ❌ Auto-save on field blur
- ❌ Close modal (save changes persist)

**Estimated Tests:** 12-15 tests

#### 5. **OpenAPI Actions** (0% coverage)
**Missing Tests:**
- ❌ Reload tools from spec
- ❌ Refetch tools from URL (URL sources only)
- ❌ Delete source from modal
- ❌ Delete source from table
- ❌ Display notices for actions
- ❌ Update tool count after reload

**Estimated Tests:** 6-8 tests

#### 6. **Tab Navigation** (0% coverage)
**Missing Tests:**
- ❌ Switch between subtabs (Built-in/MCP/OpenAPI)
- ❌ Persist active subtab state
- ❌ Highlight active subtab
- ❌ Load correct content for each subtab

**Estimated Tests:** 4-5 tests

---

### P1 - Important Scenarios (Not Tested)

#### 7. **Validation and Error Handling** (0% coverage)
**Missing Tests:**
- ❌ Validation for empty OpenAPI name
- ❌ Validation for empty spec path/URL
- ❌ Handle invalid file path
- ❌ Handle invalid URL
- ❌ Handle network errors for URL fetch
- ❌ Handle malformed OpenAPI spec
- ❌ Display error notices

**Estimated Tests:** 7-9 tests

#### 8. **State Persistence** (0% coverage)
**Missing Tests:**
- ❌ Built-in tool enabled states persist
- ❌ OpenAPI sources persist across sessions
- ❌ Active subtab persists
- ❌ Modal changes persist on save

**Estimated Tests:** 4-5 tests

---

### P2 - Edge Cases (Not Tested)

#### 9. **UI/UX Scenarios** (0% coverage)
**Missing Tests:**
- ❌ Long tool names/descriptions
- ❌ Many OpenAPI sources
- ❌ Special characters in names
- ❌ Large OpenAPI specs
- ❌ Concurrent operations

**Estimated Tests:** 5-6 tests

#### 10. **Integration Scenarios** (0% coverage)
**Missing Tests:**
- ❌ MCP tools update when MCP servers change
- ❌ OpenAPI tools available in chat
- ❌ Built-in tools available in chat
- ❌ Tool availability based on enabled state

**Estimated Tests:** 4-5 tests

---

## Recommended Test Suite Structure

### File 1: `tests/e2e/specs/settings/tools-builtin.spec.ts` (NEW)
**Focus:** Built-in tools configuration

**Test Suites:**
1. **Built-in Tools Display**
   - Display all 6 built-in tools
   - Show tool metadata (icons, names, categories)
   - Display tool descriptions
   - Show tool parameters
   - Display info callout

2. **Built-in Tools Enable/Disable**
   - Enable tool via checkbox
   - Disable tool via checkbox
   - Persist enabled state across sessions
   - All tools enabled by default
   - Multiple tools can be enabled simultaneously

**Estimated Tests:** 8-10 tests
**Estimated LOC:** 180-220 lines

---

### File 2: `tests/e2e/specs/settings/tools-mcp.spec.ts` (NEW)
**Focus:** MCP tools read-only view

**Test Suites:**
1. **MCP Tools Display**
   - Display tools from connected MCP server
   - Show server name and connection status
   - Display tool names and descriptions
   - Show tool parameters
   - Display source indicator (Live/Cached)

2. **MCP Tools Grouping**
   - Group tools by server
   - Show server status badge
   - Display multiple servers
   - Empty state when no MCP tools

3. **MCP Tools Updates**
   - Update when server connects
   - Update when server disconnects
   - Show cached tools when disconnected
   - Show live tools when connected

**Estimated Tests:** 9-11 tests
**Estimated LOC:** 220-260 lines

---

### File 3: `tests/e2e/specs/settings/tools-openapi-crud.spec.ts` (NEW)
**Focus:** OpenAPI source CRUD operations

**Test Suites:**
1. **Create OpenAPI Source**
   - Create file source with minimal config
   - Create URL source with full config
   - Validate required fields
   - Cancel creation
   - Default values applied

2. **Edit OpenAPI Source**
   - Edit source name
   - Change source type (file ↔ URL)
   - Update spec path/URL
   - Update base URL
   - Update authentication config
   - Save changes persist

3. **Delete OpenAPI Source**
   - Delete source from table
   - Delete source from modal
   - Empty state after deleting all sources
   - Deletion confirmation

4. **OpenAPI Table Display**
   - Display all sources
   - Show source details
   - Show authentication info
   - Show enabled status
   - Show action buttons

**Estimated Tests:** 15-18 tests
**Estimated LOC:** 350-400 lines

---

### File 4: `tests/e2e/specs/settings/tools-openapi-config.spec.ts` (NEW)
**Focus:** OpenAPI configuration modal

**Test Suites:**
1. **Modal Basic Operations**
   - Open modal from Add button
   - Open modal from Edit button
   - Close modal saves changes
   - Display modal title

2. **File Source Configuration**
   - Set display name
   - Select file source type
   - Set spec file path
   - Set base URL override
   - Configure authentication
   - Enable/disable source

3. **URL Source Configuration**
   - Select URL source type
   - Set spec URL
   - Display cache path
   - Display last fetched timestamp
   - Configure authentication
   - Set base URL override

4. **Authentication Configuration**
   - None authentication
   - Header authentication (key + value)
   - Query authentication (key + value)
   - Credential fields update based on type

5. **Auto-save Behavior**
   - Auto-save on field blur
   - Changes persist immediately
   - Enabled toggle triggers reload

**Estimated Tests:** 15-17 tests
**Estimated LOC:** 350-390 lines

---

### File 5: `tests/e2e/specs/settings/tools-openapi-actions.spec.ts` (NEW)
**Focus:** OpenAPI actions (reload, refetch, delete)

**Test Suites:**
1. **Reload Actions**
   - Reload tools from spec
   - Show notice after reload
   - Update tool count
   - Handle reload errors

2. **Refetch Actions** (URL sources only)
   - Refetch spec from URL
   - Update cache timestamp
   - Show notice after refetch
   - Handle network errors

3. **Delete Actions**
   - Delete from table button
   - Delete from modal button
   - Show confirmation
   - Remove from list
   - Show notice after deletion

**Estimated Tests:** 8-10 tests
**Estimated LOC:** 200-240 lines

---

### File 6: `tests/e2e/specs/settings/tools-navigation.spec.ts` (NEW)
**Focus:** Tab navigation and subtab switching

**Test Suites:**
1. **Subtab Navigation**
   - Switch to Built-in subtab
   - Switch to MCP subtab
   - Switch to OpenAPI subtab
   - Active subtab highlighted
   - Subtab content loads correctly

2. **State Persistence**
   - Active subtab persists across settings reopens
   - Built-in tool states persist
   - OpenAPI sources persist

**Estimated Tests:** 6-8 tests
**Estimated LOC:** 140-180 lines

---

### File 7: Extend `tests/e2e/specs/integration/tools-chat-integration.spec.ts` (NEW)
**Focus:** Tools integration with Chat

**Test Suites:**
1. **Built-in Tools in Chat**
   - Enabled built-in tools available in chat
   - Disabled built-in tools not available
   - Built-in tool execution in chat

2. **OpenAPI Tools in Chat**
   - Enabled OpenAPI tools available in chat
   - Disabled OpenAPI tools not available
   - OpenAPI tool execution in chat

3. **MCP Tools in Chat**
   - Live MCP tools available in chat
   - Cached MCP tools behavior
   - MCP tool execution in chat

**Estimated Tests:** 9-11 tests
**Estimated LOC:** 250-300 lines

---

## Test Utilities Needed

### New Helper File: `tests/e2e/utils/tools-helpers.ts`

```typescript
// === Navigation ===
export async function openToolsTab(): Promise<void>
export async function switchToolsSubtab(subtab: 'built-in' | 'mcp' | 'openapi'): Promise<void>

// === Built-in Tools ===
export async function getBuiltInTools(): Promise<string[]>
export async function isToolEnabled(toolName: string): Promise<boolean>
export async function toggleTool(toolName: string, enabled: boolean): Promise<void>
export async function getToolMetadata(toolName: string): Promise<{ category: string; description: string }>

// === MCP Tools (Read-only) ===
export async function getMcpToolsForServer(serverName: string): Promise<string[]>
export async function getMcpToolSource(serverName: string, toolName: string): Promise<'live' | 'cached'>
export async function getMcpServerStatus(serverName: string): Promise<'connected' | 'disconnected'>
export async function hasMcpToolsEmptyState(): Promise<boolean>

// === OpenAPI CRUD ===
export async function addOpenApiSource(config: OpenApiSourceConfig): Promise<void>
export async function editOpenApiSource(sourceName: string, updates: Partial<OpenApiSourceConfig>): Promise<void>
export async function deleteOpenApiSource(sourceName: string, confirm: boolean): Promise<void>
export async function getOpenApiSources(): Promise<string[]>
export async function isOpenApiSourceExists(sourceName: string): Promise<boolean>

// === OpenAPI Modal ===
export async function openOpenApiModal(sourceName?: string): Promise<void>
export async function closeOpenApiModal(): Promise<void>
export async function fillOpenApiForm(config: Partial<OpenApiSourceConfig>): Promise<void>
export async function getOpenApiSourceType(sourceName: string): Promise<'file' | 'url'>
export async function getOpenApiAuthType(sourceName: string): Promise<'none' | 'header' | 'query'>

// === OpenAPI Actions ===
export async function reloadOpenApiSource(sourceName: string): Promise<void>
export async function refetchOpenApiSource(sourceName: string): Promise<void>
export async function isRefetchAvailable(sourceName: string): Promise<boolean>

// === Utilities ===
export async function waitForToolsLoad(timeout?: number): Promise<void>
export async function getToolCount(subtab: 'built-in' | 'mcp' | 'openapi'): Promise<number>
export async function hasOpenApiEmptyState(): Promise<boolean>
```

**Estimated Helper Functions:** 25-30 functions
**Estimated LOC:** 450-550 lines

---

### Extended Selectors: `tests/e2e/utils/selectors.ts`

Add new `tools` section:

```typescript
tools: {
  // Tab navigation
  tab: '.settings-tab*=Tools',
  tabBar: '.settings-tabs',
  builtInSubtab: '.settings-tab[data-slug="built-in"]',
  mcpSubtab: '.settings-tab[data-slug="mcp"]',
  openapiSubtab: '.settings-tab[data-slug="openapi"]',
  activeSubtab: '.settings-tab.is-active',
  tabContent: '.settings-tab-content',

  // Built-in Tools
  builtInTable: '.settings-tab-content .ia-table',
  builtInToolRow: (toolName: string) => `.ia-table-row:has(.tool-name*="${toolName}")`,
  toolIcon: '.tool-icon',
  toolCheckbox: 'input[type="checkbox"]',
  toolCategory: '.ia-table-cell:nth-child(2)',
  toolDescription: '.ia-table-cell:nth-child(3)',
  toolParameters: '.ia-table-cell:nth-child(4)',
  infoCallout: '.info-callout',

  // MCP Tools (read-only)
  mcpToolsTable: '.settings-tab-content .ia-table',
  mcpToolRow: '.ia-table-row',
  mcpServerCell: '.ia-table-cell:nth-child(1)',
  mcpToolName: '.ia-table-cell:nth-child(2)',
  mcpToolDescription: '.ia-table-cell:nth-child(3)',
  mcpToolParameters: '.ia-table-cell:nth-child(4)',
  mcpToolSource: '.ia-table-cell:nth-child(5)',
  mcpServerStatus: '.ia-status-badge',
  mcpEmptyState: '.ia-table-subtext',

  // OpenAPI Tools
  openApiAddButton: 'button*=Add HTTP source',
  openApiTable: '.settings-tab-content .ia-table',
  openApiSourceRow: (sourceName: string) => `.ia-table-row:has(td*="${sourceName}")`,
  openApiEditButton: (sourceName: string) => `.ia-table-row:has(td*="${sourceName}") button*=Edit`,
  openApiReloadButton: (sourceName: string) => `.ia-table-row:has(td*="${sourceName}") button*=Reload`,
  openApiRefetchButton: (sourceName: string) => `.ia-table-row:has(td*="${sourceName}") button*=Refetch`,
  openApiDeleteButton: (sourceName: string) => `.ia-table-row:has(td*="${sourceName}") button*=Delete`,
  openApiEmptyState: '.ia-table-subtext',

  // OpenAPI Modal
  openApiModal: {
    container: '.modal:has(h3*=HTTP)',
    header: '.modal h3',
    nameInput: '.setting-item:has(.setting-item-name*=Display name) input',
    enabledToggle: '.setting-item:has(.setting-item-name*=Enabled) .checkbox-container',
    sourceTypeDropdown: '.setting-item:has(.setting-item-name*=Source type) select',
    filePathInput: '.setting-item:has(.setting-item-name*=file path) input',
    urlInput: '.setting-item:has(.setting-item-name*=URL) input',
    baseUrlInput: '.setting-item:has(.setting-item-name*=Base URL) input',
    authDropdown: '.setting-item:has(.setting-item-name*=Authentication) select',
    credKeyInput: '.setting-item:has(.setting-item-name*=Credential key) input',
    credValueInput: '.setting-item:has(.setting-item-name*=Credential value) input',
    reloadButton: 'button*=Reload tools',
    refetchButton: 'button[aria-label*=Refetch]',
    deleteButton: 'button[aria-label*=Delete]',
    cachePathText: 'p*=Cached file',
  },
}
```

**Estimated Additional Selectors:** 40-45 new selectors

---

## Implementation Priority

### Phase 1 - P0 Tests (Highest Priority)
**Estimated LOC:** 1,440-1,730 lines
**Estimated Tests:** 62-73 tests

1. Create `tools-helpers.ts` (25-30 functions, 450-550 lines)
2. Extend `selectors.ts` (+40-45 selectors)
3. Create `tools-builtin.spec.ts` (8-10 tests, 180-220 lines)
4. Create `tools-mcp.spec.ts` (9-11 tests, 220-260 lines)
5. Create `tools-openapi-crud.spec.ts` (15-18 tests, 350-400 lines)
6. Create `tools-openapi-config.spec.ts` (15-17 tests, 350-390 lines)
7. Create `tools-openapi-actions.spec.ts` (8-10 tests, 200-240 lines)
8. Create `tools-navigation.spec.ts` (6-8 tests, 140-180 lines)

### Phase 2 - P1 Tests (Important)
**Estimated LOC:** 300-350 lines
**Estimated Tests:** 11-14 tests

9. Add validation tests to existing spec files (~150-180 lines)
10. Add state persistence tests (~150-170 lines)

### Phase 3 - P2 Tests (Enhancement)
**Estimated LOC:** 500-600 lines
**Estimated Tests:** 13-16 tests

11. Create `tools-chat-integration.spec.ts` (9-11 tests, 250-300 lines)
12. Add edge case tests across spec files (~250-300 lines)

---

## Expected Outcomes

### After Phase 1 (P0):
- **Test Coverage:** 0% → 70%
- **Total Test Files:** 0 → 6 files
- **Total Test Cases:** 0 → 62-73 tests
- **Total LOC:** 0 → 1,440-1,730 lines
- **Coverage Areas:**
  - ✅ Built-in tools display and configuration
  - ✅ MCP tools read-only view
  - ✅ OpenAPI CRUD operations
  - ✅ OpenAPI modal configuration
  - ✅ OpenAPI actions (reload/refetch/delete)
  - ✅ Tab navigation

### After Phase 2 (P1):
- **Test Coverage:** 70% → 85%
- **Total Test Cases:** 62-73 → 73-87 tests
- **Total LOC:** 1,440-1,730 → 1,740-2,080 lines
- **Coverage Areas:**
  - ✅ All Phase 1 areas
  - ✅ Validation and error handling
  - ✅ State persistence

### After Phase 3 (P2):
- **Test Coverage:** 85% → 95%+
- **Total Test Cases:** 73-87 → 86-103 tests
- **Total LOC:** 1,740-2,080 → 2,240-2,680 lines
- **Coverage Areas:**
  - ✅ All Phase 2 areas
  - ✅ Tools-Chat integration
  - ✅ Edge cases and stress testing

---

## Success Criteria

### Phase 1 Complete When:
1. ✅ All 3 subtabs tested (Built-in, MCP, OpenAPI)
2. ✅ CRUD operations fully tested for OpenAPI
3. ✅ OpenAPI modal configuration tested
4. ✅ Tab navigation working correctly
5. ✅ All tests pass
6. ✅ No lint errors
7. ✅ Build succeeds

### Phase 2 Complete When:
1. ✅ Validation scenarios covered
2. ✅ Error handling tested
3. ✅ State persistence verified
4. ✅ All tests pass consistently

### Phase 3 Complete When:
1. ✅ Tools-Chat integration tested end-to-end
2. ✅ Edge cases handled gracefully
3. ✅ 95%+ functionality coverage achieved
4. ✅ All tests pass consistently

---

## Notes

### Test Data Requirements:
- Sample OpenAPI spec files (JSON/YAML)
- Test URLs for remote spec fetching
- Mock authentication credentials
- Test MCP servers with tools

### Known Challenges:
1. **OpenAPI Spec Loading** - Network-dependent for URL sources
2. **Tool Execution** - May need to mock actual tool calls
3. **MCP Integration** - Depends on MCP servers being available
4. **File System Access** - Local file path validation

### Dependencies:
- OpenAPI specification files
- MCP servers with tools (for MCP tools subtab)
- Chat View (for integration tests)
- Tool Manager service

---

**Document Version:** 1.0
**Created:** 2025-11-27
**Status:** Planning Phase
