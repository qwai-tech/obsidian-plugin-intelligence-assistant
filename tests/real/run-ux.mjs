// Real suites run independently so one service failure does not hide other results.
for (const suite of ['./ux-routing.mjs', './ux-streaming.mjs', './ux-reasoning.mjs']) {
  try { await import(suite); }
  catch (error) { console.error(`Real regression failed in ${suite}: ${error.message}`); process.exitCode = 1; }
}
