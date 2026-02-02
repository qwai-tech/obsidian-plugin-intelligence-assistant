# RAG Settings E2E Test Coverage Analysis

## Overview

This document analyzes the current E2E test coverage for RAG (Retrieval-Augmented Generation) settings and outlines a comprehensive testing strategy.

### RAG Tab Structure

The RAG settings tab (`src/presentation/components/tabs/rag-tab.ts`) contains **6 subtabs**:

1. **Overview** - General settings + Index management operations
2. **Chunking** - Document chunking strategy and parameters
3. **Search** - Search type and retrieval parameters
4. **Filters** - Folder/file/tag filtering rules
5. **Advanced** - Compression, caching, re-ranking settings
6. **Web Search** - Web search integration (separate component)

### Configuration Properties (25+)

From `src/types/features/rag.ts`:

```typescript
export interface RAGConfig {
  // General
  enabled: boolean;
  embeddingModel: string;
  vectorStore: string; // 'memory' | 'disk'
  embedChangedFiles: boolean;

  // Chunking
  chunkingStrategy: string; // 'recursive' | 'fixed' | 'sentence' | 'paragraph'
  chunkSize: number;
  chunkOverlap: number;
  maxTokensPerChunk: number;
  minChunkSize: number;

  // Search
  searchType: string; // 'similarity' | 'mmr' | 'hybrid'
  topK: number;
  similarityThreshold: number;
  relevanceScoreWeight: number;

  // Filters
  excludeFolders: string[];
  includeFileTypes: string[];
  excludeFileTypes: string[];
  filterByTags: string[];
  excludeTags: string[];

  // Advanced
  enableCompression: boolean;
  embeddingBatchSize: number;
  indexingMode: string;
  contextWindowLimit: number;
  enableSemanticCaching: boolean;
  cacheSize: number;
  reRankingEnabled: boolean;
  reRankingModel: string;
  enableGradingThreshold: boolean;
  gradingThreshold: number;
}
```

## Current Test Coverage

### Existing Tests

**Status**: ❌ **0% coverage** - No RAG E2E tests exist

### Coverage Gap

- ❌ No tests for general RAG settings
- ❌ No tests for index management operations
- ❌ No tests for chunking configuration
- ❌ No tests for search parameters
- ❌ No tests for filter rules
- ❌ No tests for advanced features
- ❌ No tests for state persistence
- ❌ No tests for UI behavior

## Required Test Coverage

### 1. Overview Subtab Tests

#### 1.1 General Settings Display (P0)
- [ ] Should display RAG enabled toggle
- [ ] Should display embedding model selector
- [ ] Should display vector store selector (memory/disk)
- [ ] Should display auto-embed toggle
- [ ] Should show embedding model count/status
- [ ] Should display info callouts for guidance

#### 1.2 Enable/Disable RAG (P0)
- [ ] Should enable RAG functionality
- [ ] Should disable RAG functionality
- [ ] Should show disabled state UI when RAG is off
- [ ] Should persist enabled state across reopens

#### 1.3 Embedding Model Selection (P0)
- [ ] Should list available embedding models
- [ ] Should allow selecting embedding model
- [ ] Should display model metadata (provider, dimensions)
- [ ] Should show model availability status
- [ ] Should persist model selection

#### 1.4 Vector Store Configuration (P0)
- [ ] Should allow selecting memory vector store
- [ ] Should allow selecting disk vector store
- [ ] Should show storage location for disk store
- [ ] Should persist vector store selection
- [ ] Should show vector store statistics

#### 1.5 Index Management Operations (P0)
- [ ] Should display index statistics (doc count, chunk count, size)
- [ ] Should rebuild index with confirmation
- [ ] Should refresh index (embed new/changed files)
- [ ] Should clear index with confirmation
- [ ] Should show operation progress indicators
- [ ] Should update statistics after operations
- [ ] Should handle operation errors gracefully

#### 1.6 Auto-Embed Configuration (P1)
- [ ] Should enable auto-embed on file changes
- [ ] Should disable auto-embed
- [ ] Should persist auto-embed setting
- [ ] Should show auto-embed status in UI

### 2. Chunking Subtab Tests

#### 2.1 Chunking Strategy Selection (P0)
- [ ] Should display all 4 chunking strategies (recursive/fixed/sentence/paragraph)
- [ ] Should allow selecting recursive chunking
- [ ] Should allow selecting fixed-size chunking
- [ ] Should allow selecting sentence-based chunking
- [ ] Should allow selecting paragraph-based chunking
- [ ] Should show strategy description/help text
- [ ] Should persist strategy selection

#### 2.2 Chunk Size Configuration (P0)
- [ ] Should allow setting chunk size
- [ ] Should validate chunk size range (min/max)
- [ ] Should show chunk size help text
- [ ] Should persist chunk size value
- [ ] Should handle invalid chunk size input

#### 2.3 Chunk Overlap Configuration (P0)
- [ ] Should allow setting chunk overlap
- [ ] Should validate overlap range (0 to chunk size)
- [ ] Should show overlap help text
- [ ] Should persist overlap value
- [ ] Should prevent overlap >= chunk size

#### 2.4 Advanced Chunking Parameters (P1)
- [ ] Should allow setting max tokens per chunk
- [ ] Should allow setting min chunk size
- [ ] Should validate parameter relationships
- [ ] Should persist all chunking parameters

#### 2.5 Chunking Strategy Switching (P1)
- [ ] Should show/hide relevant fields when switching strategies
- [ ] Should preserve common parameters across strategies
- [ ] Should reset strategy-specific parameters
- [ ] Should update help text when switching

### 3. Search Subtab Tests

#### 3.1 Search Type Selection (P0)
- [ ] Should display all 3 search types (similarity/MMR/hybrid)
- [ ] Should allow selecting similarity search
- [ ] Should allow selecting MMR (Maximum Marginal Relevance)
- [ ] Should allow selecting hybrid search
- [ ] Should show search type descriptions
- [ ] Should persist search type selection

#### 3.2 Top K Configuration (P0)
- [ ] Should allow setting top K value
- [ ] Should validate top K range (1-100)
- [ ] Should show top K help text
- [ ] Should persist top K value
- [ ] Should handle invalid top K input

#### 3.3 Similarity Threshold Configuration (P0)
- [ ] Should allow setting similarity threshold (0-1)
- [ ] Should validate threshold range
- [ ] Should show threshold help text (slider/input)
- [ ] Should persist threshold value
- [ ] Should handle invalid threshold input

#### 3.4 Relevance Score Weight (P1)
- [ ] Should allow setting relevance score weight
- [ ] Should show weight impact description
- [ ] Should persist weight value
- [ ] Should validate weight range

#### 3.5 Search Type Behavior (P1)
- [ ] Should show MMR-specific parameters when MMR selected
- [ ] Should show hybrid-specific parameters when hybrid selected
- [ ] Should hide irrelevant parameters for each search type
- [ ] Should provide examples for each search type

### 4. Filters Subtab Tests

#### 4.1 Folder Exclusion (P0)
- [ ] Should display exclude folders list
- [ ] Should add folder to exclusion list
- [ ] Should remove folder from exclusion list
- [ ] Should show folder path validation
- [ ] Should persist folder exclusions
- [ ] Should handle multiple folder exclusions

#### 4.2 File Type Inclusion (P0)
- [ ] Should display include file types list
- [ ] Should add file type to inclusion list (e.g., .md, .txt)
- [ ] Should remove file type from inclusion list
- [ ] Should validate file type format
- [ ] Should persist file type inclusions
- [ ] Should show common file type suggestions

#### 4.3 File Type Exclusion (P0)
- [ ] Should display exclude file types list
- [ ] Should add file type to exclusion list
- [ ] Should remove file type from exclusion list
- [ ] Should persist file type exclusions
- [ ] Should prevent same type in both include/exclude

#### 4.4 Tag Filtering (P1)
- [ ] Should display filter by tags list
- [ ] Should add tag to filter list
- [ ] Should remove tag from filter list
- [ ] Should show tag suggestions from vault
- [ ] Should persist tag filters

#### 4.5 Tag Exclusion (P1)
- [ ] Should display exclude tags list
- [ ] Should add tag to exclusion list
- [ ] Should remove tag from exclusion list
- [ ] Should persist tag exclusions
- [ ] Should prevent same tag in both filter/exclude

#### 4.6 Filter Validation (P1)
- [ ] Should validate folder paths exist
- [ ] Should validate file type format (.ext)
- [ ] Should validate tag format (#tag)
- [ ] Should show filter impact summary (files affected)
- [ ] Should clear all filters option

### 5. Advanced Subtab Tests

#### 5.1 Compression Settings (P1)
- [ ] Should display enable compression toggle
- [ ] Should enable compression
- [ ] Should disable compression
- [ ] Should show compression description/benefits
- [ ] Should persist compression setting

#### 5.2 Batch Size Configuration (P1)
- [ ] Should allow setting embedding batch size
- [ ] Should validate batch size range
- [ ] Should show batch size impact description
- [ ] Should persist batch size value

#### 5.3 Indexing Mode (P1)
- [ ] Should display indexing mode selector
- [ ] Should show available indexing modes
- [ ] Should allow selecting indexing mode
- [ ] Should persist indexing mode selection

#### 5.4 Context Window Limit (P1)
- [ ] Should allow setting context window limit
- [ ] Should validate limit range
- [ ] Should show limit help text
- [ ] Should persist limit value

#### 5.5 Semantic Caching (P0)
- [ ] Should display semantic caching toggle
- [ ] Should enable semantic caching
- [ ] Should disable semantic caching
- [ ] Should show cache size input when enabled
- [ ] Should allow setting cache size
- [ ] Should persist caching settings
- [ ] Should show cache statistics

#### 5.6 Re-ranking Configuration (P0)
- [ ] Should display re-ranking enabled toggle
- [ ] Should enable re-ranking
- [ ] Should disable re-ranking
- [ ] Should show re-ranking model selector when enabled
- [ ] Should allow selecting re-ranking model
- [ ] Should persist re-ranking settings
- [ ] Should hide model selector when disabled

#### 5.7 Document Grading (P0)
- [ ] Should display grading threshold toggle
- [ ] Should enable grading threshold
- [ ] Should disable grading threshold
- [ ] Should show threshold input when enabled
- [ ] Should allow setting grading threshold (0-1)
- [ ] Should persist grading settings
- [ ] Should hide threshold input when disabled

#### 5.8 Conditional UI Rendering (P1)
- [ ] Should show/hide cache size based on caching toggle
- [ ] Should show/hide re-ranking model based on re-ranking toggle
- [ ] Should show/hide grading threshold based on grading toggle
- [ ] Should maintain values when toggling features off/on

### 6. Web Search Subtab Tests

#### 6.1 Web Search Display (P2)
- [ ] Should display web search subtab
- [ ] Should load websearch-tab component
- [ ] Should show web search settings
- [ ] Should persist web search configuration

**Note**: Web Search uses a separate component (`websearch-tab.ts`). Detailed web search tests should be in a separate test file.

### 7. Navigation and UI Tests

#### 7.1 Subtab Navigation (P0)
- [ ] Should navigate to Overview subtab
- [ ] Should navigate to Chunking subtab
- [ ] Should navigate to Search subtab
- [ ] Should navigate to Filters subtab
- [ ] Should navigate to Advanced subtab
- [ ] Should navigate to Web Search subtab
- [ ] Should highlight active subtab
- [ ] Should preserve subtab state on settings reopen

#### 7.2 Tab Icons and Labels (P2)
- [ ] Should display correct icon for each subtab
- [ ] Should display correct label for each subtab
- [ ] Should show subtab descriptions

### 8. State Persistence Tests

#### 8.1 Configuration Persistence (P0)
- [ ] Should persist all Overview settings
- [ ] Should persist all Chunking settings
- [ ] Should persist all Search settings
- [ ] Should persist all Filter settings
- [ ] Should persist all Advanced settings
- [ ] Should restore all settings on plugin reload
- [ ] Should restore settings after closing/reopening settings modal

#### 8.2 Default Values (P1)
- [ ] Should show correct default values for all settings
- [ ] Should allow resetting to defaults
- [ ] Should show "reset to defaults" button/option

### 9. Validation and Error Handling Tests

#### 9.1 Input Validation (P0)
- [ ] Should validate numeric inputs (chunk size, top K, etc.)
- [ ] Should validate range constraints (0-1 for thresholds)
- [ ] Should validate path formats (folders)
- [ ] Should validate file type formats (.ext)
- [ ] Should show validation error messages
- [ ] Should prevent saving invalid values

#### 9.2 Relationship Validation (P1)
- [ ] Should validate chunk overlap < chunk size
- [ ] Should validate min chunk size <= chunk size
- [ ] Should validate filter/exclude lists don't conflict
- [ ] Should show relationship validation errors

#### 9.3 Operation Error Handling (P0)
- [ ] Should handle rebuild index errors
- [ ] Should handle refresh index errors
- [ ] Should handle clear index errors
- [ ] Should handle missing embedding model errors
- [ ] Should show user-friendly error messages
- [ ] Should allow retry after errors

### 10. Integration Tests

#### 10.1 Cross-Subtab Dependencies (P1)
- [ ] Should update search parameters when chunking changes
- [ ] Should show warnings if settings conflict
- [ ] Should coordinate embedding model across subtabs
- [ ] Should show impact of filter changes on index

#### 10.2 RAG with LLM Integration (P2)
- [ ] Should show RAG status in chat view when enabled
- [ ] Should use selected embedding model
- [ ] Should respect filter rules in searches
- [ ] Should apply re-ranking when enabled

## Test File Structure

Based on the 6 subtabs and test complexity, recommend **6 main test files** + 1 integration file:

### Test Files

1. **`rag-overview.spec.ts`** (~350 lines)
   - General settings display and configuration (6 test groups, ~20 tests)
   - Index management operations (1 test group, ~7 tests)
   - Covers Overview subtab entirely

2. **`rag-chunking.spec.ts`** (~280 lines)
   - Chunking strategy selection (1 test group, ~7 tests)
   - Chunk size/overlap configuration (2 test groups, ~10 tests)
   - Advanced chunking parameters (2 test groups, ~8 tests)
   - Covers Chunking subtab entirely

3. **`rag-search.spec.ts`** (~250 lines)
   - Search type selection (1 test group, ~6 tests)
   - Top K and threshold configuration (2 test groups, ~10 tests)
   - Search type behavior (2 test groups, ~8 tests)
   - Covers Search subtab entirely

4. **`rag-filters.spec.ts`** (~350 lines)
   - Folder exclusion (1 test group, ~6 tests)
   - File type inclusion/exclusion (2 test groups, ~12 tests)
   - Tag filtering/exclusion (2 test groups, ~10 tests)
   - Filter validation (1 test group, ~6 tests)
   - Covers Filters subtab entirely

5. **`rag-advanced.spec.ts`** (~400 lines)
   - Compression and batch settings (3 test groups, ~10 tests)
   - Semantic caching (1 test group, ~7 tests)
   - Re-ranking configuration (1 test group, ~6 tests)
   - Document grading (1 test group, ~6 tests)
   - Conditional UI rendering (1 test group, ~4 tests)
   - Covers Advanced subtab entirely

6. **`rag-navigation.spec.ts`** (~200 lines)
   - Subtab navigation (1 test group, ~8 tests)
   - State persistence (2 test groups, ~10 tests)
   - Validation and error handling (3 test groups, ~15 tests)
   - Covers cross-cutting concerns

7. **`rag-integration.spec.ts`** (~150 lines, P2)
   - Cross-subtab dependencies (1 test group, ~4 tests)
   - RAG with LLM integration (1 test group, ~4 tests)
   - End-to-end RAG workflows

**Total**: ~1,980 lines, **~125 tests**

## Helper Functions Required

### Navigation Helpers

```typescript
export async function openRagTab(): Promise<void>
export async function switchRagSubtab(subtab: 'overview' | 'chunking' | 'search' | 'filters' | 'advanced' | 'websearch'): Promise<void>
export async function getCurrentRagSubtab(): Promise<string>
```

### Overview Helpers

```typescript
export async function isRagEnabled(): Promise<boolean>
export async function toggleRagEnabled(enabled: boolean): Promise<void>
export async function getEmbeddingModel(): Promise<string>
export async function selectEmbeddingModel(model: string): Promise<void>
export async function getVectorStore(): Promise<'memory' | 'disk'>
export async function selectVectorStore(store: 'memory' | 'disk'): Promise<void>
export async function isAutoEmbedEnabled(): Promise<boolean>
export async function toggleAutoEmbed(enabled: boolean): Promise<void>

// Index management
export async function getIndexStats(): Promise<{ docCount: number; chunkCount: number; size: string }>
export async function rebuildIndex(confirm: boolean): Promise<void>
export async function refreshIndex(): Promise<void>
export async function clearIndex(confirm: boolean): Promise<void>
export async function waitForIndexOperation(timeout?: number): Promise<void>
```

### Chunking Helpers

```typescript
export async function getChunkingStrategy(): Promise<string>
export async function selectChunkingStrategy(strategy: 'recursive' | 'fixed' | 'sentence' | 'paragraph'): Promise<void>
export async function getChunkSize(): Promise<number>
export async function setChunkSize(size: number): Promise<void>
export async function getChunkOverlap(): Promise<number>
export async function setChunkOverlap(overlap: number): Promise<void>
export async function getMaxTokensPerChunk(): Promise<number>
export async function setMaxTokensPerChunk(tokens: number): Promise<void>
export async function getMinChunkSize(): Promise<number>
export async function setMinChunkSize(size: number): Promise<void>
```

### Search Helpers

```typescript
export async function getSearchType(): Promise<string>
export async function selectSearchType(type: 'similarity' | 'mmr' | 'hybrid'): Promise<void>
export async function getTopK(): Promise<number>
export async function setTopK(k: number): Promise<void>
export async function getSimilarityThreshold(): Promise<number>
export async function setSimilarityThreshold(threshold: number): Promise<void>
export async function getRelevanceScoreWeight(): Promise<number>
export async function setRelevanceScoreWeight(weight: number): Promise<void>
```

### Filters Helpers

```typescript
export async function getExcludedFolders(): Promise<string[]>
export async function addExcludedFolder(folder: string): Promise<void>
export async function removeExcludedFolder(folder: string): Promise<void>
export async function getIncludedFileTypes(): Promise<string[]>
export async function addIncludedFileType(type: string): Promise<void>
export async function removeIncludedFileType(type: string): Promise<void>
export async function getExcludedFileTypes(): Promise<string[]>
export async function addExcludedFileType(type: string): Promise<void>
export async function removeExcludedFileType(type: string): Promise<void>
export async function getFilterTags(): Promise<string[]>
export async function addFilterTag(tag: string): Promise<void>
export async function removeFilterTag(tag: string): Promise<void>
export async function getExcludedTags(): Promise<string[]>
export async function addExcludedTag(tag: string): Promise<void>
export async function removeExcludedTag(tag: string): Promise<void>
export async function clearAllFilters(): Promise<void>
```

### Advanced Helpers

```typescript
export async function isCompressionEnabled(): Promise<boolean>
export async function toggleCompression(enabled: boolean): Promise<void>
export async function getEmbeddingBatchSize(): Promise<number>
export async function setEmbeddingBatchSize(size: number): Promise<void>
export async function getIndexingMode(): Promise<string>
export async function selectIndexingMode(mode: string): Promise<void>
export async function getContextWindowLimit(): Promise<number>
export async function setContextWindowLimit(limit: number): Promise<void>

// Semantic caching
export async function isSemanticCachingEnabled(): Promise<boolean>
export async function toggleSemanticCaching(enabled: boolean): Promise<void>
export async function getCacheSize(): Promise<number>
export async function setCacheSize(size: number): Promise<void>
export async function isCacheSizeVisible(): Promise<boolean>

// Re-ranking
export async function isReRankingEnabled(): Promise<boolean>
export async function toggleReRanking(enabled: boolean): Promise<void>
export async function getReRankingModel(): Promise<string>
export async function selectReRankingModel(model: string): Promise<void>
export async function isReRankingModelVisible(): Promise<boolean>

// Document grading
export async function isGradingThresholdEnabled(): Promise<boolean>
export async function toggleGradingThreshold(enabled: boolean): Promise<void>
export async function getGradingThreshold(): Promise<number>
export async function setGradingThreshold(threshold: number): Promise<void>
export async function isGradingThresholdInputVisible(): Promise<boolean>
```

### Validation Helpers

```typescript
export async function getValidationError(fieldName: string): Promise<string | null>
export async function hasValidationError(): Promise<boolean>
export async function isFieldValid(fieldName: string): Promise<boolean>
```

**Total**: ~70 helper functions

## Selectors Required

### RAG Tab Selectors

```typescript
rag: {
  // Tab navigation
  tab: '.settings-tab*=RAG',
  tabContent: '.settings-tab-content',
  subtabBar: '.settings-tabs',
  overviewSubtab: '.settings-tab[data-slug="overview"]',
  chunkingSubtab: '.settings-tab[data-slug="chunking"]',
  searchSubtab: '.settings-tab[data-slug="search"]',
  filtersSubtab: '.settings-tab[data-slug="filters"]',
  advancedSubtab: '.settings-tab[data-slug="advanced"]',
  websearchSubtab: '.settings-tab[data-slug="websearch"]',
  activeSubtab: '.settings-tab.is-active',

  // Overview subtab
  overview: {
    enabledToggle: settingByName('Enable RAG') + '//div[@class="checkbox-container"]',
    embeddingModelDropdown: settingByName('Embedding model') + '//select',
    vectorStoreDropdown: settingByName('Vector store') + '//select',
    autoEmbedToggle: settingByName('Auto-embed') + '//div[@class="checkbox-container"]',

    // Index management
    indexStats: '.rag-index-stats',
    docCountText: '.rag-index-stats .doc-count',
    chunkCountText: '.rag-index-stats .chunk-count',
    indexSizeText: '.rag-index-stats .index-size',
    rebuildButton: 'button*=Rebuild index',
    refreshButton: 'button*=Refresh index',
    clearButton: 'button*=Clear index',
    operationProgress: '.rag-operation-progress',
  },

  // Chunking subtab
  chunking: {
    strategyDropdown: settingByName('Chunking strategy') + '//select',
    chunkSizeInput: settingByName('Chunk size') + '//input',
    chunkOverlapInput: settingByName('Chunk overlap') + '//input',
    maxTokensInput: settingByName('Max tokens per chunk') + '//input',
    minChunkSizeInput: settingByName('Min chunk size') + '//input',
  },

  // Search subtab
  search: {
    searchTypeDropdown: settingByName('Search type') + '//select',
    topKInput: settingByName('Top K') + '//input',
    similarityThresholdInput: settingByName('Similarity threshold') + '//input',
    relevanceWeightInput: settingByName('Relevance score weight') + '//input',
  },

  // Filters subtab
  filters: {
    excludeFoldersList: '.rag-exclude-folders-list',
    addFolderButton: 'button*=Add folder',
    removeFolderButton: (folder: string) => `button[aria-label*="Remove ${folder}"]`,

    includeFileTypesList: '.rag-include-types-list',
    addIncludeTypeButton: 'button*=Add include type',
    removeIncludeTypeButton: (type: string) => `button[aria-label*="Remove ${type}"]`,

    excludeFileTypesList: '.rag-exclude-types-list',
    addExcludeTypeButton: 'button*=Add exclude type',
    removeExcludeTypeButton: (type: string) => `button[aria-label*="Remove ${type}"]`,

    filterTagsList: '.rag-filter-tags-list',
    addFilterTagButton: 'button*=Add filter tag',
    removeFilterTagButton: (tag: string) => `button[aria-label*="Remove ${tag}"]`,

    excludeTagsList: '.rag-exclude-tags-list',
    addExcludeTagButton: 'button*=Add exclude tag',
    removeExcludeTagButton: (tag: string) => `button[aria-label*="Remove ${tag}"]`,

    clearAllButton: 'button*=Clear all filters',
  },

  // Advanced subtab
  advanced: {
    compressionToggle: settingByName('Enable compression') + '//div[@class="checkbox-container"]',
    batchSizeInput: settingByName('Embedding batch size') + '//input',
    indexingModeDropdown: settingByName('Indexing mode') + '//select',
    contextWindowInput: settingByName('Context window limit') + '//input',

    // Semantic caching
    semanticCachingToggle: settingByName('Enable semantic caching') + '//div[@class="checkbox-container"]',
    cacheSizeInput: settingByName('Cache size') + '//input',

    // Re-ranking
    reRankingToggle: settingByName('Enable re-ranking') + '//div[@class="checkbox-container"]',
    reRankingModelDropdown: settingByName('Re-ranking model') + '//select',

    // Document grading
    gradingToggle: settingByName('Enable grading threshold') + '//div[@class="checkbox-container"]',
    gradingThresholdInput: settingByName('Grading threshold') + '//input',
  },

  // Common elements
  infoCallout: '.info-callout',
  validationError: '.validation-error',
  helpText: '.setting-item-description',
}
```

**Total**: ~60 selectors

## Test Priority Breakdown

### P0 (Must Have) - ~75 tests
- Overview general settings and index management (27 tests)
- Chunking core configuration (15 tests)
- Search core configuration (13 tests)
- Filters folder/file type management (12 tests)
- Advanced caching/re-ranking/grading (20 tests)
- Navigation and state persistence (18 tests)
- Validation and error handling (15 tests)

**Coverage**: ~60% of RAG functionality

### P1 (Should Have) - ~35 tests
- Advanced chunking parameters (8 tests)
- Search type behavior (8 tests)
- Filter tag management (10 tests)
- Advanced compression/batch/indexing (9 tests)

**Coverage**: ~28% additional (total ~88%)

### P2 (Nice to Have) - ~15 tests
- UI/UX details (8 tests)
- Web Search integration (4 tests)
- Integration tests (8 tests)

**Coverage**: ~12% additional (total ~100%)

## Implementation Roadmap

### Phase 1: Core Infrastructure (P0)
**Estimated**: 2-3 days

1. Extend `selectors.ts` with ~60 RAG selectors
2. Create `rag-helpers.ts` with ~70 helper functions
3. Set up test file structure (6 spec files)

### Phase 2: Overview and Chunking Tests (P0)
**Estimated**: 2-3 days

4. Implement `rag-overview.spec.ts` (~27 tests)
5. Implement `rag-chunking.spec.ts` (~15 tests)
6. Validate with lint and build

### Phase 3: Search and Filters Tests (P0)
**Estimated**: 2-3 days

7. Implement `rag-search.spec.ts` (~13 tests)
8. Implement `rag-filters.spec.ts` (~12 tests)
9. Validate with lint and build

### Phase 4: Advanced and Navigation Tests (P0)
**Estimated**: 2-3 days

10. Implement `rag-advanced.spec.ts` (~20 tests)
11. Implement `rag-navigation.spec.ts` (~18 tests)
12. Validate with lint and build

### Phase 5: P1 Tests (Should Have)
**Estimated**: 2 days

13. Add P1 tests across all spec files (~35 tests)
14. Validate with lint and build

### Phase 6: P2 Tests and Integration (Nice to Have)
**Estimated**: 1-2 days

15. Implement `rag-integration.spec.ts` (~8 tests)
16. Add P2 tests (~15 tests)
17. Final validation

## Coverage Goals

- **Immediate Goal**: 60% coverage with P0 tests (~75 tests)
- **Medium-term Goal**: 88% coverage with P0+P1 tests (~110 tests)
- **Long-term Goal**: 100% coverage with all tests (~125 tests)

## Notes

### Complexity Assessment

RAG settings are **the most complex settings tab** in the plugin:
- **6 subtabs** (vs 3 for Tools, 1 for MCP)
- **25+ configuration properties** (vs ~10 for MCP)
- **Conditional UI rendering** (cache size, re-ranking model, grading threshold)
- **Index management operations** (rebuild/refresh/clear with async behavior)
- **Complex validation rules** (chunk overlap < chunk size, filter conflicts)
- **Cross-subtab dependencies** (embedding model affects chunking and search)

### Special Testing Considerations

1. **Async Operations**: Index rebuild/refresh/clear are async and may take time
   - Need `waitForIndexOperation()` helper with timeout
   - Need to test operation progress indicators
   - Need to test operation cancellation (if supported)

2. **Conditional UI**: Several fields show/hide based on toggles
   - Cache size (depends on semantic caching toggle)
   - Re-ranking model (depends on re-ranking toggle)
   - Grading threshold (depends on grading toggle)
   - Must test visibility state and value persistence

3. **Validation Complexity**: Multiple validation rules
   - Range validation (chunk size, top K, thresholds)
   - Relationship validation (overlap < chunk size)
   - Format validation (folder paths, file types, tags)
   - Conflict validation (include/exclude lists)

4. **State Persistence**: More complex than other tabs
   - 25+ properties to persist
   - 6 subtabs to restore state for
   - Index state must persist across reloads

### Estimated Lines of Code

- **Selectors**: ~150 lines (added to selectors.ts)
- **Helpers**: ~900 lines (new rag-helpers.ts)
- **Tests**: ~1,980 lines (6-7 spec files)
- **Coverage doc**: ~960 lines (this file)

**Total**: ~4,000 lines of test infrastructure

### Comparison with Previous Tabs

| Tab | Subtabs | Properties | Test Files | Tests | LOC |
|-----|---------|------------|------------|-------|-----|
| MCP | 1 | ~10 | 3 | 45 | ~1,200 |
| Tools | 3 | ~15 | 2 | 39 | ~850 |
| **RAG** | **6** | **25+** | **6-7** | **~125** | **~1,980** |

RAG testing is **2.3x larger** than MCP and Tools combined.

## Success Criteria

### Definition of Done

✅ All P0 tests implemented and passing (~75 tests)
✅ All helper functions implemented (~70 functions)
✅ All selectors added (~60 selectors)
✅ Lint checks pass with no new errors
✅ Build succeeds with no TypeScript errors
✅ Tests are maintainable and follow established patterns
✅ Code coverage reaches 60%+ of RAG functionality

### Stretch Goals

🎯 All P1 tests implemented (~110 total tests, 88% coverage)
🎯 Integration tests implemented
🎯 All P2 tests implemented (~125 total tests, 100% coverage)
🎯 Performance tests for index operations
🎯 Accessibility tests for RAG UI
