# TrafficLedger desktop

One app. Two installers. Same license.

| Build | File | How |
|---|---|---|
| Windows (this PC) | `dist/TrafficLedger-1.0.0-Windows.exe` | `npm run dist:win` |
| Windows installer | `dist/TrafficLedger-1.0.0-Setup.exe` | same |
| Mac Apple silicon | `dist/TrafficLedger-1.0.0-AppleSilicon.dmg` | on a Mac: `npm run dist:mac` |

The lock, trial, seats, signed lease, and payment server are not duplicated. Windows and Mac both call `src/license/` in the **main process**. If the exe accepts a key, the dmg will accept that key the same way.

License server must be running (`../license-system`, http://127.0.0.1:8787) for trial and activate. Public product page: https://mansinghgurjar.in/software/traffic-ledger.
