# Security

## Reporting a problem

Please report vulnerabilities privately through
[GitHub's security advisories](https://github.com/teo-clerk/MDlearn/security/advisories/new), not in a public
issue. Say what you found, how to reproduce it and what it lets someone do. MDlearn is maintained by one person in
their own time, so there is no response deadline, but every report gets read.

Only the latest release is supported.

## What MDlearn protects

MDlearn runs on your own computer. These are the things it is built to defend:

- **Your files from what you open.** A lesson, a class file or a web page may be hostile. Documents are sanitized,
  scripts stay out, and nothing in a document reaches the web by itself.
- **Your files from AI jobs.** A job can only write Markdown inside the folders it was given, every change can be
  undone, and text from your class files is treated as data, not as instructions.
- **Studio from other websites and devices.** The server answers only on this computer unless you turn on sharing,
  which needs a token and gives other devices less access.

The details are in [docs/STUDIO.md](docs/STUDIO.md), under Security.

The desktop builds are not code-signed yet. Each release lists a SHA-256 checksum for every file.
