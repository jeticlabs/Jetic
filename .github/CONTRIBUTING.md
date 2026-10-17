# Contributing to Jetic

Welcome — and thank you for your interest in contributing to Jetic!

Jetic is an AI-native API behavior testing, workflow simulation, and discovery platform. We welcome contributions to the CLI, Jetic Studio dashboard, core behavioral graph engine, documentation, and plugins.

## How to Contribute

### Report a Problem
Open an issue using the **Bug Report** template with clear steps to reproduce the issue.

### Propose a Feature
Open an issue using the **Feature Request** template describing the use case and proposed solution for Jetic.

### Submit a Pull Request
1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-change`)
3. Install dependencies using `pnpm install`
4. Make your changes and ensure typechecks pass
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` for new features (e.g., `feat(cli): add endpoint simulation flag`)
   - `fix:` for bug fixes (e.g., `fix(dashboard): resolve memory masking hover toggle`)
   - `docs:` for documentation updates
   - `chore:` for maintenance tasks
6. Push to your fork and open a pull request
7. Describe what changed and why

### Commit Messages
Use clear, descriptive commit messages. Examples:
- `feat(cli): implement deep nested router discovery`
- `fix(dashboard): mask memory values on agent inspector page`
- `docs: update setup and CLI commands in README`

## Local Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/jetic.git
cd jetic

# Install dependencies
pnpm install

# Run CLI in dev mode
pnpm --filter @jetic/cli dev

# Run Dashboard in dev mode
pnpm --filter @jetic/dashboard dev
```

## Questions?
Join our community on [Discord](https://discord.gg/jeticlabs) or open a GitHub issue — we're happy to help.

## Code of Conduct
All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
