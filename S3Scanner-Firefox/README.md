# S3Scanner-Firefox

A Firefox extension (Manifest V3) that passively scans web traffic for S3-style hostnames and probes them for public access permissions.

## Features

- **Passive Detection**: Monitors outgoing requests for S3-like hostnames.
- **Active Probing**: Checks for `ListBucket` (GET /) and `ACL` (GET /?acl) public access.
- **Local Storage**: Saves discovered buckets to browser local storage.
- **Privacy Focused**: No telemetry, no external reporting. All data stays on your machine.

## Privacy Notice

This extension does **not** collect or transmit any data to external servers.
- Discovered bucket data is stored in `browser.storage.local`.
- Probing is performed directly from your browser to the candidate host.
- No analytics or tracking scripts are included.

## Installation (Developer)

1. Clone this repository.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file from the project directory.

## Usage

1. Click the extension icon in the toolbar.
2. Toggle **Recording** to ON.
3. Browse the web. The extension will scan requests.
4. If a public bucket is found, the badge counter (if implemented) or the popup list will update.
5. Open the popup to view details, export results, or clear the list.

## Development

### Prerequisites

- Node.js (for tests/linting)
- Firefox Developer Edition (recommended)

### Scripts

- `npm install`: Install dev dependencies.
- `npm test`: Run unit tests for parsers.
- `npm run lint`: Lint code.
- `npm run pack`: Create a .xpi file.

### Testing with Mitmproxy (PowerShell)

To verify the extension is probing correctly without browsing the real web, you can use `mitmproxy`.

1. **Install mitmproxy**: `choco install mitmproxy` (Windows) or `pip install mitmproxy`.
2. **Create a temporary Firefox profile**:
   ```powershell
   $ProfilePath = "$env:TEMP\FirefoxTempProfile"
   New-Item -ItemType Directory -Force -Path $ProfilePath
   ```
3. **Run Firefox with the profile**:
   ```powershell
   & "C:\Program Files\Mozilla Firefox\firefox.exe" -profile $ProfilePath -no-remote
   ```
4. **Configure Proxy**: In Firefox, set Network Proxy to `127.0.0.1:8080` (mitmproxy default).
5. **Run mitmproxy**:
   ```powershell
   mitmproxy
   ```
6. **Trigger Traffic**: Visit a site or use `curl` through the proxy to generate traffic to a fake S3 bucket.

## License

MIT
