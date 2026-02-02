# MCP E2E Test Coverage Analysis

## Current Test Coverage

### Existing Test File: `tests/e2e/specs/settings/mcp.spec.ts`
**Lines:** 88
**Test Cases:** 3

#### Covered Scenarios:
1. **Basic UI Display** (1 test)
   - ✅ Shows toolbar buttons and seeded server rows
   - ✅ Verifies toolbar button presence
   - ✅ Checks status badge display
   - ✅ Checks count badge display

2. **Validation** (1 test)
   - ✅ Validates test button when command is missing

3. **Enable/Disable Toggle** (1 test)
   - ✅ Toggles enable state for MCP server
   - ✅ Persists state across settings reopens

**Coverage Assessment:** ~15% of MCP functionality

---

## MCP Implementation Overview

### MCP Tab Components (`src/presentation/components/tabs/mcp-tab.ts` - 377 lines)

#### Toolbar Actions:
- 🔍 **MCP Inspector** - Opens modal to view all registered tools
- 🧪 **Test All Connections** - Tests connectivity of all enabled servers
- 🔄 **Refresh All Tools** - Refreshes tool cache for all enabled servers
- ➕ **Add MCP Server** - Opens modal to create new server configuration

#### Server Configuration Table:
**Columns:**
- **Name** - Server name + environment variable count
- **Command** - Executable command
- **Arguments** - Command-line arguments
- **Status** - Connection status (Enabled/Disabled, Connected/Disconnected, auto/manual mode)
- **Tools** - Tool count badge (live or cached)
- **Actions** - Edit, Enable/Disable, Connect/Disconnect, Test, Delete

#### Server States:
- **Enabled/Disabled** - Whether server is active
- **Connected/Disconnected** - Current connection status
- **Connection Mode:**
  - `auto` - Auto-connect when chat opens
  - `manual` - Manual connection only
- **Tool Caching:**
  - Cached tools stored for offline availability
  - Cache timestamp tracked
  - Live tools vs cached tools differentiated

### MCP Server Modal (`src/presentation/components/modals/mcp-server-modal.ts` - 231 lines)

**Configuration Fields:**
1. **Server Name** - Friendly name (required)
2. **Connection Mode** - Auto/Manual dropdown
3. **Command** - Executable path (required)
4. **Arguments** - Comma or newline separated (optional)
5. **Environment Variables** - KEY=VALUE pairs, one per line (optional)
6. **Enabled** - Toggle to enable/disable

**Validation:**
- Server name required
- Command required
- Environment variables must follow KEY=VALUE format
- Invalid env format shows red border

**Operations:**
- Create new server
- Edit existing server
- Validates on save

### MCP Types (`src/types/features/mcp.ts`)

```typescript
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  connectionMode?: MCPConnectionMode; // 'auto' | 'manual'
  cachedTools?: CachedMCPTool[];
  cacheTimestamp?: number;
}

export interface CachedMCPTool {
  name: string;
  description?: string;
  inputSchema?: { ... };
}
```

---

## Gap Analysis

### Missing Test Coverage

#### P0 - Critical Functionality (Not Tested)

1. **CRUD Operations** (0% coverage)
   - ❌ Create new MCP server via modal
   - ❌ Edit existing server configuration
   - ❌ Delete server with confirmation
   - ❌ Cancel create/edit operations
   - ❌ Form validation (required fields)
   - ❌ Environment variable parsing and validation

2. **Connection Management** (0% coverage)
   - ❌ Connect button functionality
   - ❌ Disconnect button functionality
   - ❌ Test connection button
   - ❌ Test all connections
   - ❌ Auto-connect mode behavior
   - ❌ Manual connect mode behavior
   - ❌ Connection status updates

3. **Tool Management** (0% coverage)
   - ❌ Refresh all tools functionality
   - ❌ Tool cache updates
   - ❌ Tool count display (live vs cached)
   - ❌ Cache timestamp tracking
   - ❌ Tool availability indicators

4. **MCP Inspector** (0% coverage)
   - ❌ Open MCP inspector modal
   - ❌ View registered tools
   - ❌ Tool detail display

5. **Integration with Chat** (0% coverage)
   - ❌ MCP tools available in chat
   - ❌ Using MCP tools in conversations
   - ❌ Auto-connect on chat open (for auto mode servers)
   - ❌ Tool call execution from chat

#### P1 - Important Scenarios (Partially Tested)

6. **Error Handling** (10% coverage)
   - ✅ Missing command validation
   - ❌ Connection failures
   - ❌ Invalid command path
   - ❌ Tool refresh errors
   - ❌ Invalid environment variable format
   - ❌ Duplicate server names
   - ❌ Network timeout errors

7. **State Management** (30% coverage)
   - ✅ Enable/disable toggle persistence
   - ❌ Connection mode persistence
   - ❌ Configuration updates across sessions
   - ❌ Cache persistence

#### P2 - Edge Cases (Not Tested)

8. **UI/UX Scenarios** (0% coverage)
   - ❌ Empty state display
   - ❌ Large number of servers
   - ❌ Long server names/commands
   - ❌ Special characters in names
   - ❌ Multiple concurrent operations

9. **Multi-Server Scenarios** (0% coverage)
   - ❌ Multiple servers enabled
   - ❌ Mix of auto and manual servers
   - ❌ Some servers connected, some disconnected
   - ❌ Tool conflicts between servers

---

## Recommended Test Suite Structure

### File 1: `tests/e2e/specs/settings/mcp-crud.spec.ts` (NEW)
**Focus:** Server CRUD operations and configuration

**Test Suites:**
1. **Create MCP Server**
   - Open modal and create server with minimal config
   - Create server with full config (args, env vars)
   - Validate required fields (name, command)
   - Cancel creation
   - Special characters in fields
   - Invalid environment variable format

2. **Edit MCP Server**
   - Open edit modal for existing server
   - Update server name
   - Update command and arguments
   - Add/remove environment variables
   - Change connection mode
   - Cancel edit without saving

3. **Delete MCP Server**
   - Delete server with confirmation
   - Cancel deletion
   - Delete server that's connected
   - Delete last server (verify empty state)

**Estimated Tests:** 15-18 tests

---

### File 2: `tests/e2e/specs/settings/mcp-connection.spec.ts` (NEW)
**Focus:** Connection management and testing

**Test Suites:**
1. **Manual Connection**
   - Connect to server manually
   - Disconnect from server
   - Test connection before connecting
   - Test connection for disabled server
   - Connection state persistence

2. **Auto Connection**
   - Auto-connect mode server
   - Verify auto-connect on chat open
   - Disable auto-connect server
   - Re-enable and verify auto-connect

3. **Connection Testing**
   - Test single server connection
   - Test all connections
   - Handle connection failures gracefully
   - Display connection error messages

4. **Status Indicators**
   - Enabled status badge
   - Disabled status badge
   - Connected status badge
   - Disconnected status badge
   - Connection mode display

**Estimated Tests:** 12-15 tests

---

### File 3: `tests/e2e/specs/settings/mcp-tools.spec.ts` (NEW)
**Focus:** Tool management and caching

**Test Suites:**
1. **Tool Display**
   - Tool count badge for connected server
   - Tool count badge for cached tools
   - Zero tools indicator
   - Live vs cached tool differentiation

2. **Tool Refresh**
   - Refresh all tools
   - Refresh single server tools
   - Tool cache update after refresh
   - Cache timestamp update
   - Refresh disabled servers (skip)

3. **Tool Caching**
   - Tools cached after connection
   - Cached tools persist after disconnect
   - Cache timestamp displayed
   - Old cache indicators

**Estimated Tests:** 10-12 tests

---

### File 4: `tests/e2e/specs/settings/mcp-inspector.spec.ts` (NEW)
**Focus:** MCP Inspector modal

**Test Suites:**
1. **Inspector Modal**
   - Open MCP inspector
   - Display registered tools
   - Show tool details (name, description, schema)
   - Close inspector
   - Empty state when no tools

2. **Tool Details**
   - Tool name display
   - Tool description display
   - Input schema display
   - Provider identification

**Estimated Tests:** 6-8 tests

---

### File 5: `tests/e2e/specs/integration/mcp-chat-integration.spec.ts` (NEW)
**Focus:** MCP integration with Chat View

**Test Suites:**
1. **Tool Availability in Chat**
   - Configure MCP server in settings
   - Open chat and verify tools available
   - Verify auto-connect for auto mode servers
   - Verify manual servers not auto-connected

2. **Using MCP Tools in Chat**
   - Send message that triggers tool use
   - Verify tool call execution
   - Verify tool response in chat
   - Multi-turn conversation with tools

3. **Tool State Management**
   - Add server → tools appear in chat
   - Remove server → tools disappear from chat
   - Disconnect server → tools unavailable
   - Reconnect server → tools available again

**Estimated Tests:** 8-10 tests

---

### File 6: Extend `tests/e2e/specs/settings/mcp.spec.ts`
**Keep existing tests, add:**

1. **Empty State**
   - Display empty state when no servers configured
   - Add first server from empty state

2. **Toolbar Buttons**
   - All toolbar buttons functional
   - Button states (disabled when appropriate)

**Estimated Tests:** 4-5 additional tests

---

## Test Utilities Needed

### New Helper File: `tests/e2e/utils/mcp-helpers.ts`

```typescript
// Server Management
export async function addMcpServer(config: MCPServerConfig): Promise<void>
export async function editMcpServer(serverName: string, updates: Partial<MCPServerConfig>): Promise<void>
export async function deleteMcpServer(serverName: string, confirm: boolean): Promise<void>
export async function getMcpServers(): Promise<string[]>
export async function isMcpServerExists(serverName: string): Promise<boolean>

// Connection Management
export async function connectMcpServer(serverName: string): Promise<void>
export async function disconnectMcpServer(serverName: string): Promise<void>
export async function testMcpConnection(serverName: string): Promise<void>
export async function testAllMcpConnections(): Promise<void>
export async function getMcpServerStatus(serverName: string): Promise<'connected' | 'disconnected' | 'disabled'>

// Tool Management
export async function refreshAllMcpTools(): Promise<void>
export async function getMcpToolCount(serverName: string): Promise<number>
export async function isMcpServerConnected(serverName: string): Promise<boolean>
export async function getMcpCachedToolCount(serverName: string): Promise<number>

// Inspector
export async function openMcpInspector(): Promise<void>
export async function closeMcpInspector(): Promise<void>
export async function getRegisteredTools(): Promise<string[]>

// Utilities
export async function waitForMcpServerStatus(serverName: string, status: string, timeout?: number): Promise<void>
export async function waitForToolCountUpdate(serverName: string, minCount: number, timeout?: number): Promise<void>
export async function hasEmptyState(): Promise<boolean>
```

**Estimated Helper Functions:** 20-25 functions

---

### Extended Selectors: `tests/e2e/utils/selectors.ts`

Add to existing `mcp` section:

```typescript
mcp: {
  // ... existing selectors

  // Modal selectors
  modal: {
    container: '.modal:has(h2*=MCP server)',
    nameInput: '.setting-item:has(.setting-item-name*=Server name) input',
    commandInput: '.setting-item:has(.setting-item-name*=Command) input',
    argsInput: '.setting-item:has(.setting-item-name*=Arguments) input',
    envTextarea: '.setting-item:has(.setting-item-name*=Environment) textarea',
    connectionModeDropdown: '.setting-item:has(.setting-item-name*=Connection mode) select',
    enabledToggle: '.setting-item:has(.setting-item-name*=Enabled) .checkbox-container',
    saveButton: 'button*=Save',
    addButton: 'button*=Add server',
    cancelButton: 'button*=Cancel',
  },

  // Inspector modal selectors
  inspector: {
    modal: '.modal:has(h2*=MCP inspector)',
    toolList: '.ia-tool-list',
    toolItem: '.ia-tool-item',
    toolName: '.ia-tool-name',
    toolDescription: '.ia-tool-description',
    closeButton: 'button*=Close',
  },

  // Row-specific selectors
  serverRow: (serverName: string) => `.ia-table-row:has(*="${serverName}")`,
  editButton: (serverName: string) => `.ia-table-row:has(*="${serverName}") button*=Edit`,
  deleteButton: (serverName: string) => `.ia-table-row:has(*="${serverName}") button*=Delete`,
  connectButton: (serverName: string) => `.ia-table-row:has(*="${serverName}") button*=connect`,
  disconnectButton: (serverName: string) => `.ia-table-row:has(*="${serverName}") button*=disconnect`,
  testButton: (serverName: string) => `.ia-table-row:has(*="${serverName}") button*=Test`,
  toggleButton: (serverName: string) => `.ia-table-row:has(*="${serverName}") button*=Enabled, button*=Disabled`,
  toolCountBadge: (serverName: string) => `.ia-table-row:has(*="${serverName}") .ia-count-badge`,
  statusIndicator: (serverName: string) => `.ia-table-row:has(*="${serverName}") .ia-status-badge`,
}
```

**Estimated Additional Selectors:** 25-30 new selectors

---

## Implementation Priority

### Phase 1 - P0 Tests (Highest Priority)
**Estimated LOC:** 800-1000 lines
**Estimated Time:** High priority

1. Create `mcp-helpers.ts` with 20-25 helper functions
2. Extend selectors in `selectors.ts` (+25-30 selectors)
3. Create `mcp-crud.spec.ts` (15-18 tests, ~300 lines)
4. Create `mcp-connection.spec.ts` (12-15 tests, ~350 lines)
5. Create `mcp-tools.spec.ts` (10-12 tests, ~250 lines)

### Phase 2 - P1 Tests (Important)
**Estimated LOC:** 400-500 lines

6. Create `mcp-inspector.spec.ts` (6-8 tests, ~150 lines)
7. Create `mcp-chat-integration.spec.ts` (8-10 tests, ~300 lines)

### Phase 3 - P2 Tests (Enhancement)
**Estimated LOC:** 200-300 lines

8. Extend existing `mcp.spec.ts` with edge cases (4-5 tests, ~100 lines)
9. Add error handling tests across all files (~150 lines)

---

## Expected Outcomes

### After Phase 1 (P0):
- **Test Coverage:** 15% → 70%
- **Total Test Files:** 1 → 4 files
- **Total Test Cases:** 3 → 40-45 tests
- **Total LOC:** 88 → 900-1100 lines
- **Coverage Areas:**
  - ✅ CRUD operations
  - ✅ Connection management
  - ✅ Tool management
  - ✅ Basic configuration

### After Phase 2 (P1):
- **Test Coverage:** 70% → 90%
- **Total Test Files:** 4 → 6 files
- **Total Test Cases:** 40-45 → 55-65 tests
- **Total LOC:** 900-1100 → 1300-1600 lines
- **Coverage Areas:**
  - ✅ All Phase 1 areas
  - ✅ MCP Inspector
  - ✅ Chat integration

### After Phase 3 (P2):
- **Test Coverage:** 90% → 95%+
- **Total Test Files:** 6 files
- **Total Test Cases:** 55-65 → 65-75 tests
- **Total LOC:** 1300-1600 → 1500-1900 lines
- **Coverage Areas:**
  - ✅ All Phase 2 areas
  - ✅ Edge cases
  - ✅ Comprehensive error handling

---

## Success Criteria

### Phase 1 Complete When:
1. ✅ All CRUD operations tested and working
2. ✅ Connection management fully tested
3. ✅ Tool caching and refresh tested
4. ✅ All tests pass with real MCP server
5. ✅ No lint errors
6. ✅ Build succeeds

### Phase 2 Complete When:
1. ✅ MCP Inspector modal tested
2. ✅ Chat integration end-to-end tested
3. ✅ Tools usable in chat conversations
4. ✅ Auto-connect behavior verified
5. ✅ All tests pass

### Phase 3 Complete When:
1. ✅ All edge cases covered
2. ✅ Error scenarios handled gracefully
3. ✅ 95%+ functionality coverage achieved
4. ✅ Documentation updated
5. ✅ All tests pass consistently

---

## Notes

### Test Data Requirements:
- Need sample MCP servers for testing
- Consider using mock/demo MCP servers
- Environment variables for test credentials

### Known Challenges:
1. **MCP Server Availability** - Tests may need mock servers
2. **Connection Timing** - Network-dependent, need proper timeouts
3. **Tool Execution** - May need to mock tool calls for consistent testing
4. **Environment Cleanup** - Must clean up created servers after tests

### Dependencies:
- MCP SDK (`@modelcontextprotocol/sdk`)
- Test MCP servers (demo servers in project)
- Chat View (for integration tests)

---

**Document Version:** 1.0
**Created:** 2025-11-27
**Status:** Planning Phase
