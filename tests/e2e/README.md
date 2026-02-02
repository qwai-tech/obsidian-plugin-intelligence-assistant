# E2E Testing Suite Documentation

Complete end-to-end testing suite for the Obsidian Intelligence Assistant Plugin.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Configuration](#configuration)
- [CI/CD Integration](#cicd-integration)
- [Writing New Tests](#writing-new-tests)
- [Troubleshooting](#troubleshooting)

## 🔍 Overview

This E2E test suite provides comprehensive coverage of the plugin's functionality:

- **270+ test cases** across all features
- **Security testing** (prompt injection, SSRF, sandboxing)
- **Performance benchmarks**
- **Accessibility compliance**
- **Visual regression testing**
- **Cross-browser support**
- **Mobile responsiveness**
- **Load testing**

### Test Coverage

| Priority | Status | Test Count |
|----------|--------|------------|
| P0 (Critical) | ✅ 100% | 70+ tests |
| P1 (High) | ✅ 100% | 125+ tests |
| P2 (Medium) | ✅ 100% | 75+ tests |
| **Total** | **✅ Complete** | **270+ tests** |

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Build the plugin
npm run build
```

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run specific test suite
npx wdio run wdio.conf.ts --spec='tests/e2e/specs/security/**/*.spec.ts'
```

### Environment Setup

Create `.env.test` file:

```env
E2E_TEST_PROVIDER=deepseek
E2E_TEST_API_KEY=your-api-key-here
E2E_TEST_MODEL=deepseek-chat
```

## 📁 Test Structure

```
tests/e2e/
├── config/              # Test configuration
├── specs/              # Test specifications
│   ├── accessibility/  # A11y tests
│   ├── agent/          # Agent system tests
│   ├── chat/           # Chat feature tests
│   ├── error/          # Error handling tests
│   ├── load/           # Load testing
│   ├── mobile/         # Mobile responsiveness
│   ├── models/         # Model capability tests
│   ├── performance/    # Performance benchmarks
│   ├── security/       # Security testing
│   ├── settings/       # Settings and configuration
│   └── visual/         # Visual regression
├── utils/              # Test utilities
└── test-vault/         # Test Obsidian vault
```

## ✅ Test Categories Summary

- **Security**: 5 files, 50+ tests
- **Settings**: 3 files, 35+ tests
- **Chat Features**: 3 files, 80+ tests
- **Agent System**: 1 file, 15+ tests
- **Performance**: 1 file, 25+ tests
- **Accessibility**: 1 file, 35+ tests
- **Visual Regression**: 1 file, 15+ tests
- **Mobile**: 1 file, 10+ tests
- **Load Testing**: 1 file, 10+ tests

## 🔄 CI/CD Integration

Tests run automatically on push/PR via GitHub Actions. See `.github/workflows/e2e-tests.yml`.

---

**Last Updated**: 2025-01-28  
**Coverage**: 85%+ of functionality
