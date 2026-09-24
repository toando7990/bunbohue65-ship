# Project Guidance

## User Preferences

- Only fix the new same-day invoice issuance flow
- Do not process old stuck orders
- Show the real BKAV rejection reason and log the raw response
- Verify on production
- Fix the BKAV decrypt path directly in the VPS proxy (vps-worker/bkav-proxy/server.js)

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- The BKAV invoice failure was a reporting bug in the VPS worker (vps-worker/), not the Motoko canister: the decrypt proxy's normalizeSoapFault() replaced a missing <faultcode> with the literal 'UNKNOWN', and the worker's parseProxyResponse() then hard-coded errorCode 'SOAP_FAULT' and kept only the code, discarding the real faultstring/reason.
- BKAV SOAP faults may arrive as SOAP 1.1 (<faultcode>/<faultstring>) or SOAP 1.2 (<Code><Value>/<Reason><Text>); read both, and when neither yields a code, fall back to the raw fault text rather than inventing a placeholder.
- vps-worker has no build/typecheck/lint scripts — `node --check <file>` is the meaningful syntax verification for its .js files; the Motoko mops check/build sequence does not apply to it.
- The invoice cron window uses startOfTodayUtc7() (UTC+7 day start) plus invoice_status='none', so orders already marked 'failed' are never rescanned; startOfPreviousWorkingDayUtc7 is retained only for the manual reissue path in enterprise-actions.js.
- The VPS worker (vps-worker/) has no test runner and is not exercised by any test lane; its cron selection window, bkav.js parseProxyResponse, bkav-proxy normalizeSoapFault, bkav_logs raw write, and invoiceId/pdfUrl recording are unverified by the suite.
- pnpm fix (biome) reformats src/frontend/src/__tests__/AccountingPage.failed-invoice.test.tsx on every run; revert it with git checkout so the tester-owned test file stays untouched.
- The BKAV invoice fix spans vps-worker/ (cron window, parseProxyResponse, normalizeSoapFault, bkav_logs raw write) and the frontend AccountingPage; vps-worker has no test runner and is not exercised by any lane, so its behavior is verified only by source reading.
- The BKAV fault path spans two files: bkav-proxy/server.js normalizeSoapFault emits '<R><E>FAULT:code | reason</E></R>' and bkav.js parseProxyResponse splits on the first ' | ' — read both together to confirm no 'UNKNOWN' placeholder.
- The same-day invoice cron window (created_at >= startOfTodayUtc7 plus invoice_status='none') is what guarantees old stuck/failed orders are never rescanned.
- The manual reissue path in enterprise-actions.js accepts orders back to the previous working day, but the cron only scans same-day orders, so a yesterday-created order queued for reissue stays 'none' — this is the explicitly out-of-scope old-order path.
- src/frontend/env.json holds literal 'undefined' placeholders by design; Caffeine injects real values at deploy time, so a local build failing the env-json-precheck is expected and must not be 'fixed' in source.
- The BKAV decrypt failure ('wrong final block length') is fixed in vps-worker/bkav-proxy/server.js: decryptBkavResponse now returns { xml, label } and tryDecryptVariants attempts valid AES-256-CBC variants (padding none, hex key/iv, double-base64) before giving up.
- On decrypt failure the proxy emits '<R><E>DECRYPT_ERROR:<reason></E></R>' (empty payload arrives as 'DECRYPT_ERROR:EMPTY_PAYLOAD | ...') instead of returning raw ciphertext; parseProxyResponse in vps-worker/src/lib/bkav.js must keep matching DECRYPT_ERROR/EMPTY_PAYLOAD or the real reason degrades to PARSE_FAILED.
- parseProxyResponse marker branch order must stay FAULT: -> PROXY_ERROR -> DECRYPT_ERROR: -> EMPTY_PAYLOAD -> empty -> ExecCommandResult -> direct JSON -> PARSE_FAILED so specific markers are never shadowed.
- The proxy is not importable into any test lane (standalone CommonJS systemd service, no exports, import-time HTTP listener); only the worker's parseProxyResponse contract is pinned by src/frontend/src/__tests__/bkav-proxy-response-contract.test.ts.
- The local preflight build cannot run because src/frontend/env.json holds literal 'undefined' placeholders by design; Caffeine injects real values at deploy time, so the env-json-precheck failure is expected and must not be 'fixed' in source.
