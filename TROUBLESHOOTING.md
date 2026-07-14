# Troubleshooting (client side)

Symptoms as seen from `useDocumentScanner`'s return values in your React app.
For bridge-side / kiosk PC issues, see
[`thales-scanner-bridge`'s README](https://github.com/REPLACE_ME/thales-scanner-bridge#readme)
and its `setup.ps1 -Doctor` diagnostic.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `connection` stuck at `'connecting'` forever | The bridge isn't running or isn't reachable at the configured `url` | Confirm the bridge process is running on the same PC (`setup.ps1 -Doctor` on the kiosk); check `url` matches the bridge's actual port |
| `connection` flips `connecting` → `disconnected` on a loop | Bridge process crashed/exited right after accepting the connection, or wrong port is open by something else | Check the bridge's own console/Scheduled Task logs; `netstat -ano \| findstr :8765` on the kiosk to confirm what's actually listening |
| `phase` never leaves `'waiting_for_document'` even with a document on the glass | An `error` frame is likely arriving and being overwritten, or the reader itself isn't detecting the document | Check `error` — don't assume silence means idle. If `error` is also empty, the reader hardware itself may not be seeing the document (glass dirty, wrong orientation) |
| `error` is a generic string like "does not match the contract" | Contract version mismatch between this package and the bridge, or a bridge-side bug producing an unexpected frame shape | Wire `onProtocolError` (see README) to log the raw frame + `zodError.issues` — tells you exactly which field broke. Confirm both repos are on compatible contract versions |
| `error` shows an SDK error code you don't recognize (e.g. `ERROR_FEATURE_NOT_SUPPORTED`) | The bridge forwards Thales SDK errors verbatim — this is bridge/hardware-side, not a client bug | Check `thales-scanner-bridge`'s README "Known issue" sections for that exact code |
| `lastScan` never updates even though the reader's indicator light looks like it scanned | You forgot to call `clearScan()` after consuming the previous scan — a new `result` frame *does* still update `lastScan`, so re-check your effect's dependency array isn't stale | Call `clearScan()` once you've read `lastScan`, and make sure the effect/handler consuming it re-runs on every `lastScan` change |
| Nothing happens at all, no state ever changes from initial | `enabled` is `false` (dialog closed / feature flag off) | Check the `enabled` option you passed in |

## Reading raw WebSocket traffic

Since the bridge only uses `ws://localhost`, Chrome/Edge DevTools shows every
frame live: **Network tab → filter WS → click the connection → Messages**.
This works even outside this hook (curl, a different client, etc.) and is
usually faster than adding temporary `console.log`s inside application code.
