# Project Rules

## Post-Task Verification

After completing any task, you MUST:

1. **Run lint check** - Ensure no new lint errors or warnings are introduced:
   ```bash
   npm run lint
   ```

2. **Run build** - Ensure the build completes successfully:
   ```bash
   npm run build
   ```

3. **Deploy to local Obsidian** - Deploy the built plugin to the local dev sandbox:
   ```bash
   node scripts/deploy.js --local
   ```

If lint or build fails, fix the issues before considering the task complete.
