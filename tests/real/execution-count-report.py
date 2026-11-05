"""Generate an English evidence report without altering native screenshots."""
import json, pathlib, html, datetime

root=pathlib.Path('test-results/execution-counts-2026-11-05')
load=lambda p:json.loads((root/p).read_text())
audit=load('native-count-audit.json')
architecture=load('architecture-default/architecture-real.json')
assert all(c['status']=='passed' for c in architecture['checks'])
live=load('live-final/live-validated.json')
zero=load('live-final/zero-validated.json')
captions={
 '01-prior-failed-description.jpg':'Historical baseline: the model combined a live count with already-included calls and reported an unsupported total.',
 '02-traversal-stopped.jpg':'Initial native A: actual manual Stop after 44 reads (40 sources and 4 verification re-reads).',
 '03-reloaded-stopped.jpg':'Initial native A: native reload retained the stopped state.',
 '04-bare-continue.jpg':'Initial native A: only Continue was entered; no restart count or manifest was supplied.',
 '05-native-final-json.jpg':'Initial ordering fix: native A resume actually read 16 times and reported 16 in JSON.',
 '06-native-count-explanation.jpg':'Initial native A: scoped explanation of 16 current-run reads and 20 task verification re-reads.',
 '07-initial-zero-run-scope-failure.jpg':'Preserved intermediate failure: current count 0 was used to falsely withdraw the valid prior count of 16.',
 '08-final-build-budget-stop.jpg':'Receipt build, native B: the real 50-step budget halt. This was not a successful manual Stop.',
 '09-final-build-resume-json.jpg':'Native B resumed with exactly 10 reads; explanation and JSON agree, preserving the previous 50-read receipt.',
 '10-zero-current-valid-previous.jpg':'Native B: Continue after completion performed 0 reads and kept the prior 10-read receipt valid.',
 '11-final-manual-stopped.jpg':'Exact final artifact, native C: manual Stop after 12 reads (1 initial read and 11 checks).',
 '12-final-manual-reloaded.jpg':'Exact final artifact: native reload retained the stopped record without auto-resume.',
 '13-final-manual-json.jpg':'Exact final artifact: bare Continue completed the remaining 9 checks; JSON agrees with actual logs.',
 '14-final-manual-run-scopes.jpg':'Exact final artifact: 21 total visits, 20 verification re-reads, comprising 11 before interruption and 9 after resume.',
}
esc=html.escape
gallery=''.join(f'<figure><a href="screens/{esc(p.name)}"><img loading="lazy" src="screens/{esc(p.name)}" alt="{esc(captions[p.name])}"></a><figcaption>{esc(captions[p.name])}</figcaption></figure>' for p in sorted((root/'screens').glob('*.jpg')))
report=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Execution count accuracy — real retest</title><style>
body{{font:16px/1.65 system-ui;max-width:1180px;margin:40px auto;padding:0 24px;background:#f8fafc;color:#172338}}h1{{line-height:1.2}}h2{{margin-top:34px}}a{{color:#1754b5;overflow-wrap:anywhere}}.summary{{border-left:5px solid #15803d;background:#f0fdf4;padding:18px}}table{{width:100%;border-collapse:collapse;background:white;font-size:14px}}td,th{{border:1px solid #cbd5e1;padding:12px;text-align:left;vertical-align:top}}.pass{{color:#166534;font-weight:bold}}.fail{{color:#a31622;font-weight:bold}}.gallery{{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:20px}}figure{{margin:0}}img{{width:100%;border:1px solid #cbd5e1}}figcaption{{font-size:14px}}code,pre{{overflow-wrap:anywhere;white-space:pre-wrap}}small{{color:#475569}}</style></head><body>
<h1>Execution count accuracy</h1><p>November 5, 2026 (Pacific) · Real native Obsidian 1.15.0 · Manifold / deepseek/deepseek-flash · Service-default reasoning · UI unchanged · No mocks.</p>
<div class="summary"><strong>RESUME-03 passed the recorded retests.</strong> Final explanations and JSON now agree with actual successful read_file events for the tested continuation, cumulative-verification and zero-new-work scopes. The final native manual Stop → reload → bare Continue case recorded <strong>12 reads before Stop and 9 afterward</strong>; its answer correctly reports <strong>9 current-run reads, 20 verification re-reads and 1 unique file</strong>. A separate 40-source case reports <strong>10 resumed reads, then 0 on another Continue</strong>, preserving each previous run's valid count.</div>
<h2>Diagnosis and changes</h2><table><tr><th>Problem</th><th>Targeted change</th></tr>
<tr><td>A live cumulative snapshot appeared before recent tool messages. The model treated it as an earlier boundary and added those calls again.</td><td>Append refreshed execution facts after the entire retained tool history. State explicitly that preceding calls are already included. Real wire captures verify the ordering.</td></tr>
<tr><td>A new Continue's zero counter was confused with a prior run's valid nonzero counter.</td><td>Persist the finished run's ID, outcome and successful-call counts in the task checkpoint. Give each new run its own ID and zero-based counter. Recover legacy receipts from actual saved successful action records. Current and previous counts are separate evidence.</td></tr>
<tr><td>Self-review accepted contradictions in final prose and JSON.</td><td>Before completion review, validate canonical thisRunReads values and recognized explicit English run-count claims against actual successful tool events. Check explicit previousRun counts separately; reject recognized false withdrawals of valid historical counts. A contradiction requests a fresh concise report, excludes the rejected candidate and stops after two unsuccessful corrections without accepting it as completed. No tool is forced or newly authorized.</td></tr>
<tr><td>At a budget halt, the last model progress update could predate the last successful tool (9 checks described after 10 had actually run).</td><td>Generate the budget summary from host events and mark the task incomplete. Do not promote the model's stale pre-tool update into the final budget status. The formatter was checked against the actual native 50-step halt and its actual 50 successful reads.</td></tr></table>
<h2>Independent acceptance results</h2><table><tr><th>Case</th><th>Actual execution</th><th>Explanation / JSON</th><th>Result</th></tr>
<tr><td>Exact prior failed checkpoint, real service, shortened 6-message history window</td><td>19 prior reads retained; exactly 13 remaining first-file checks. No completed intermediate prefix replay.</td><td>thisRunReads 13; verificationReads 20; totalItems 12. The actual final prose distinguishes these scopes correctly.</td><td class="pass">PASS</td></tr>
<tr><td>Real service Continue after that completion</td><td>0 additional tool calls.</td><td>thisRunReads 0; previous run's 13 remains valid; cumulative verificationReads 20. No false withdrawal.</td><td class="pass">PASS</td></tr>
<tr><td>Native B: 40-source task → real 50-step budget halt → native reload → Continue</td><td>50 reads before halt (40 distinct sources + 10 checks); exactly 10 remaining checks after Continue. Reload left the saved halt unchanged.</td><td>Current run 10; previous run 50; verificationReads 20; totalItems 40. Both explanation and JSON match the independently reconciled journals.</td><td class="pass">PASS</td></tr>
<tr><td>Native B: another Continue after completion</td><td>0 new calls; no replay.</td><td>Current run 0; previous run 10 stays valid; cumulative verificationReads 20.</td><td class="pass">PASS</td></tr>
<tr><td>Native C, exact final artifact: manual Stop → native reload → Continue</td><td>12 reads before Stop (initial read + 11 checks); exactly 9 after Continue. One unique file, 21 total visits, 20 re-reads. NextFile was not followed, as instructed.</td><td>Explanation correctly states previous run 12, current run 9, cumulative repeats 20; JSON thisRunReads 9, verificationReads 20, totalItems 1.</td><td class="pass">PASS</td></tr>
<tr><td>Known wrong responses replayed into the production guard</td><td>Actual historical response claimed 25 current-run reads when its actual log has 13. Its prose-only excerpt is also checked. A separate actual zero-run response falsely withdrew a valid prior 16.</td><td>All identified contradictions rejected. Repeating an unchanged contradiction is stopped after two correction attempts. This is recorded-response validation, not a simulated model call.</td><td class="pass">PASS</td></tr>
<tr><td>Budget host-summary replay</td><td>Actual native journal and saved actions establish 50 successful reads.</td><td>New host summary reports 50 and incomplete status; excludes the stale 9-of-20 model update. This check replays the actual halt through the formatter; it is not claimed as another native budget run.</td><td class="pass">PASS</td></tr>
<tr><td>Regression and artifact checks</td><td>{len(architecture['checks'])} architecture checks passed; lint, both type checks, build and isolated QA deploy passed.</td><td>40 native fixture hashes unchanged. No out-of-list calls in accepted native cases. Exact final artifact matches deployed files; CSS byte-identical to task-start baseline.</td><td class="pass">PASS</td></tr></table>
<h2>Actual stage counts</h2><pre>Native B — same logical 40-source task:
  budget run:        50 successful reads = 40 traversal + 10 verification
  resumed run:       10 successful reads = 10 remaining verification
  completed Continue: 0 successful reads
  task total:        60 successful reads; 40 unique files; 20 verification re-reads

Native C — same logical one-file verification task, exact final artifact:
  manually stopped: 12 successful reads = 1 initial + 11 verification
  resumed run:       9 successful reads = 9 remaining verification
  task total:        21 successful reads; 1 unique file; 20 verification re-reads</pre>
<h2>Failures and timing attempts preserved</h2><p>Initial native A already produced a correct 16-read resume answer, but another Continue with no work falsely withdrew that earlier valid count. That intermediate failure prompted run receipts and historical-scope validation; its raw conversation and screenshot remain. In B, an attempted Stop used an index that became stale; no manual Stop is claimed for B. It instead reached the real 50-step budget, and the actual budget record remains. C is the verified native manual-interruption case on the exact final artifact. No failed or missed attempt is silently converted into a pass.</p>
<h2>Evidence</h2><ul>
<li><a href="native-count-audit.json">Independent native journal / conversation / hash audit</a> · <a href="native-c-final-conversation.json">Final manual-resume conversation</a> · <a href="native-b-final-conversation.json">40-source budget and zero-work history</a>.</li>
<li><a href="live-final/live-validated.json">Real service continuation validation</a> · <a href="live-final/live-result.json">Actual real model result and events</a> · <a href="live-final/zero-result.json">Real zero-work result</a> · <a href="live-final/request-14.json">Wire request with trailing live snapshot</a>.</li>
<li><a href="live-final/recorded-failure-rejection.json">Known 25-versus-13 failure rejected (including prose-only)</a> · <a href="live-final/recorded-scope-failure-rejection.json">False historical withdrawal rejected</a> · <a href="budget-report-replay.json">Actual budget halt, corrected host formatter</a>.</li>
<li><a href="native-a-zero-failed.json">Preserved intermediate zero-run narration failure</a> · <a href="native-b-budget.json">Actual native budget halt</a> · <a href="architecture-default/architecture-real.json">24-check architecture regression details</a>.</li>
<li><a href="tested-artifacts.json">Exact final native C artifact hashes</a> · <a href="receipt-build-artifacts.json">Native B receipt-build hashes</a> · <a href="verification-summary.json">Verification summary</a> · <a href="report-validation.json">Report validation</a> · <a href="evidence.zip">Evidence ZIP</a>.</li>
<li><a href="lint.log">Lint</a> · <a href="typecheck.log">Type checks</a> · <a href="build.log">Build</a> · <a href="deploy.log">QA deployment</a>.</li></ul>
<p>Local evidence: <code>{esc(str(root.resolve()))}</code><br>QA vault: <code>/tmp/ia-codex-ux-20261103/vault</code>.</p>
<h2>Native screenshots ({len(list((root/'screens').glob('*.jpg')))})</h2><div class="gallery">{gallery}</div>
<h2>Scope</h2><p>All native input used actual Obsidian Stop, Reload app and the chat composer through native accessibility controls. No WebDriver, hidden app API, injected AbortController or emulated app/model/tool result controlled these native cases. Fixtures are real synthetic files with independent hashes. The replay tests use captured real model responses or an actual native budget halt as input to production validation/formatting; they do not substitute fake responses for service calls.</p>
<p>Native request bodies were not intercepted. Native configuration retained a 6,000-token output budget and no reasoning override; separate real wire captures assert no thinking/reasoning override and tool_choice auto. Ollama was ignored and SAP received no live calls. Native B exercised the run-receipt build; the subsequent change replaces only host budget-status text. Native C verifies the exact final built/deployed artifact. The real CLI replay can flag changed serialized output versus the earlier native tool representation; all 12 underlying disk hashes in that replay remained unchanged.</p>
<p>The guard validates known runtime count fields and recognized explicit English claims. It is not a general proof of arbitrary domain arithmetic, every paraphrase or every language, and does not silently rewrite model numbers. The successful retests establish the stated count scopes; they do not certify all providers or exactly-once external mutations. No UI layout/styles/controls were changed, and no commit, push or publication was performed.</p>
<p><a href="../manual-resume-fixes-2026-11-04/report-en.html">Previous report with the original count-description failure</a></p><small>Generated {datetime.datetime.now(datetime.timezone.utc).isoformat()}.</small></body></html>'''
(root/'report-en.html').write_text(report)
print(root/'report-en.html')
