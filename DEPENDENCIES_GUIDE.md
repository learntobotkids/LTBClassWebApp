# Dependencies Guide - Understanding package.json

## What is package.json?

Think of `package.json` as a **shopping list** for your project. It tells Node.js (JavaScript runtime) what tools and libraries your project needs to work.

## How It Works

When you run `npm install`, Node.js:
1. Reads `package.json`
2. Downloads all the listed tools from the internet
3. Installs them in a folder called `node_modules`
4. Creates `package-lock.json` to remember exact versions

## Project Information

```json
{
  "name": "ltb-class-webapp",
  "version": "1.0.0",
  "description": "LearnToBot Class Web Application - Local network video instruction platform"
}
```

- **name**: Internal project name (used by npm, no spaces allowed)
- **version**: Current version number (1.0.0 = major.minor.patch)
- **description**: One-sentence explanation of what this project does

## Scripts (Commands You Can Run)

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js --ignore public/ --ignore data/"
}
```

### npm start
- **What it does**: Starts the server normally
- **Command**: `npm start`
- **Use when**: Running in production or testing

### npm run dev
- **What it does**: Starts server with auto-restart on file changes
- **Command**: `npm run dev`
- **Use when**: Developing/coding (saves time, auto-restarts when you save files)
- **Note**: Requires `nodemon` to be installed (see devDependencies)

## Dependencies (Required Tools)

These are **required** for the app to run. Without these, the app won't work.

### 1. express (v4.18.2)
- **What it is**: Web server framework
- **Why we need it**: Creates the web server, handles web requests, serves pages
- **Simple analogy**: Like the foundation of a building - everything else sits on top of it
- **Used in**: `server.js` (creates `app`, defines routes with `app.get()`, `app.post()`)

### 2. socket.io (v4.7.2)
- **What it is**: Real-time communication library
- **Why we need it**: Enables WebSockets for instant teacher→student communication
- **Simple analogy**: Like a phone line that stays open - teacher can instantly talk to students
- **Used in**: `server.js` (teacher navigation control, real-time updates)
- **Key feature**: Allows teacher to control all student screens at once

### 3. googleapis (v165.0.0)
- **What it is**: Official Google APIs client library
- **Why we need it**: Connects to Google Sheets to read student data
- **Simple analogy**: Like a translator that speaks Google's language
- **Used in**: `google-sheets-service.js` (fetches student names, assignments, progress)
- **Note**: Requires `google-credentials.json` file to authenticate

### 4. csv-parser (v3.0.0)
- **What it is**: CSV (spreadsheet) file reader
- **Why we need it**: Reads CSV files if you export student data as CSV
- **Simple analogy**: Like being able to read Excel files saved as text
- **Used in**: `server.js` (imported but currently not heavily used - available if needed)
- **Optional**: Could be removed if you only use JSON files

## Dev Dependencies (Development Tools)

These are only needed **during development**. They're not required to run the app in production.

### nodemon (v3.0.1)
- **What it is**: Auto-restart tool for development
- **Why we need it**: Automatically restarts server when you change code
- **Simple analogy**: Like having an assistant who restarts your car every time you adjust something
- **How to use**: `npm run dev` instead of `npm start`
- **Saves time**: No need to manually stop and restart server after every code change

## Understanding Version Numbers

```
express: "^4.18.2"
         ↑  │  │  │
         │  │  │  └─ Patch version (bug fixes)
         │  │  └──── Minor version (new features, backward compatible)
         │  └─────── Major version (breaking changes)
         └────────── Caret (^) means "compatible with 4.18.2"
```

### Version Symbols:
- **^4.18.2** (caret): Allow updates to 4.x.x (but not 5.0.0)
  - Example: Can update to 4.19.0 or 4.20.1, but NOT 5.0.0
- **~4.18.2** (tilde): Allow updates to 4.18.x only
  - Example: Can update to 4.18.3, but NOT 4.19.0
- **4.18.2** (exact): Only this exact version
  - Example: Always install 4.18.2, never anything else

**Our project uses caret (^)** which is the most common and recommended approach.

## Installation Guide

### First Time Setup
```bash
# Navigate to project folder
cd "path/to/LTB Class Web App"

# Install all dependencies
npm install
```

This will:
1. Read `package.json`
2. Download all dependencies (express, socket.io, googleapis, csv-parser)
3. Download all devDependencies (nodemon)
4. Create `node_modules` folder with all downloaded code
5. Create `package-lock.json` with exact versions used

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update all to latest compatible versions (within ^ range)
npm update

# Update a specific package
npm update express
```

### Installing New Dependencies

```bash
# Add a new dependency (required for production)
npm install package-name

# Add a new dev dependency (only for development)
npm install --save-dev package-name
```

## Troubleshooting

### Problem: "Cannot find module 'express'"
**Solution**: Run `npm install` to install dependencies

### Problem: node_modules folder is huge (hundreds of MB)
**Explanation**: Normal! Dependencies include many sub-dependencies
**Solution**: Nothing needed - this is expected

### Problem: npm install fails
**Solutions**:
1. Check internet connection
2. Delete `node_modules` and `package-lock.json`, run `npm install` again
3. Update Node.js to latest LTS version
4. Run `npm cache clean --force` then `npm install`

### Problem: Different versions on different computers
**Solution**: Share `package-lock.json` file with your team
- This file locks exact versions for everyone
- Ensures everyone has identical dependencies

## Best Practices

### DO:
✅ Commit `package.json` and `package-lock.json` to version control (git)
✅ Run `npm install` after pulling new code from git
✅ Keep dependencies reasonably up-to-date (security fixes)
✅ Use `npm outdated` periodically to check for updates

### DON'T:
❌ Don't commit `node_modules` folder to git (too large, can be regenerated)
❌ Don't manually edit `package-lock.json` (let npm manage it)
❌ Don't delete `package-lock.json` unless troubleshooting
❌ Don't update major versions without testing (breaking changes)

## Adding to .gitignore

Your `.gitignore` file should include:
```
node_modules/
```

This prevents uploading hundreds of MB of dependencies to git.

## Dependency Tree (How They Connect)

```
Your Server (server.js)
    │
    ├── express ────────────→ Creates web server
    │   └── (25+ sub-dependencies)
    │
    ├── socket.io ──────────→ Real-time communication
    │   └── (40+ sub-dependencies)
    │
    ├── googleapis ─────────→ Google Sheets connection
    │   └── (60+ sub-dependencies)
    │
    └── csv-parser ─────────→ CSV file reading
        └── (10+ sub-dependencies)
```

**Total**: ~150+ packages in `node_modules` (including all sub-dependencies)

## Security

### Keeping Dependencies Secure

```bash
# Check for security vulnerabilities
npm audit

# Automatically fix vulnerabilities (when possible)
npm audit fix

# See detailed vulnerability report
npm audit --json
```

Run `npm audit` periodically to check for security issues in dependencies.

## License Information

```json
"license": "ISC"
```

- **ISC**: A permissive open-source license
- Allows anyone to use, modify, and distribute the code
- Similar to MIT license
- Good choice for educational projects

## Summary

| Package | Required? | Size | Purpose |
|---------|-----------|------|---------|
| express | ✅ Yes | Medium | Web server foundation |
| socket.io | ✅ Yes | Large | Real-time communication |
| googleapis | ✅ Yes | Very Large | Google Sheets integration |
| csv-parser | ⚠️ Optional | Small | CSV file reading |
| nodemon | 🔧 Dev only | Small | Auto-restart during development |

**Total install size**: ~50-100 MB (normal for Node.js projects)

---

## Quick Reference Commands

```bash
# Install all dependencies
npm install

# Start server (production)
npm start

# Start server (development with auto-restart)
npm run dev

# Check for outdated packages
npm outdated

# Update all packages
npm update

# Check for security issues
npm audit

# Fix security issues
npm audit fix
```

---

*This guide explains package.json in simple terms suitable for beginners, students, and AI assistants who need to understand the project dependencies.*
