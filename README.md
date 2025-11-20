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

## Understanding Results

The extension categorizes discovered buckets based on their permissions:

- **ListBucket (Warning)**: The bucket allows public listing of files. Anyone can see the filenames.
- **ACL Read (Danger)**: The bucket's Access Control List is readable by the public.
- **ACL Write (Danger)**: The bucket allows the public to write/modify permissions.
- **Private**: The bucket exists and is owned by S3, but no public permissions were detected.
- **Region**: Displays the AWS region (e.g., `us-east-1`) if detected.

## Development

### Prerequisites

- Node.js (for tests/linting)
- Firefox Developer Edition (recommended)

### Scripts

- `npm install`: Install dev dependencies.
- `npm test`: Run unit tests for parsers.
- `npm run lint`: Lint code.
- `npm run pack`: Create a .xpi file.

## License

MIT

## Disclaimer

This tool is for educational and security research purposes only. The author is not responsible for any misuse of this tool. Always ensure you have permission before scanning or probing targets.

