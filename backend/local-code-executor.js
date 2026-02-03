/**
 * Local Code Execution Module
 * Runs Python, JavaScript, Java, C++ code locally without external APIs
 * Works completely offline
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TMP_DIR = path.join(__dirname, 'tmp_code');

// Ensure tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Execute code locally
 * @param {string} code - Source code to execute
 * @param {string} language - Language (python, javascript, java, cpp)
 * @param {string} stdin - Standard input for the program
 * @returns {Promise<{stdout: string, stderr: string, error: boolean}>}
 */
async function executeCode(code, language, stdin = '') {
  const sessionId = crypto.randomBytes(8).toString('hex');
  const tempDir = path.join(TMP_DIR, sessionId);
  
  try {
    // Create session directory
    fs.mkdirSync(tempDir, { recursive: true });

    let command;
    let sourceFile;

    switch (language.toLowerCase()) {
      case 'python':
        sourceFile = path.join(tempDir, 'main.py');
        fs.writeFileSync(sourceFile, code);
        command = `python "${sourceFile}"`;
        break;

      case 'javascript':
      case 'js':
        sourceFile = path.join(tempDir, 'main.js');
        fs.writeFileSync(sourceFile, code);
        command = `node "${sourceFile}"`;
        break;

      case 'java':
        // Extract class name from code
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Main';
        sourceFile = path.join(tempDir, `${className}.java`);
        fs.writeFileSync(sourceFile, code);
        command = `cd "${tempDir}" && javac "${className}.java" && java ${className}`;
        break;

      case 'cpp':
      case 'c++':
        sourceFile = path.join(tempDir, 'main.cpp');
        const executable = path.join(tempDir, 'main.exe');
        fs.writeFileSync(sourceFile, code);
        command = `g++ "${sourceFile}" -o "${executable}" && "${executable}"`;
        break;

      default:
        throw new Error(`Unsupported language: ${language}`);
    }

    // Execute with timeout and stdin
    return await new Promise((resolve) => {
      const child = exec(command, {
        timeout: 5000, // 5 second timeout
        maxBuffer: 1024 * 1024, // 1MB output limit
        cwd: tempDir
      }, (error, stdout, stderr) => {
        // Clean up temp files
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.error('Cleanup error:', cleanupErr.message);
        }

        if (error && error.killed) {
          resolve({
            stdout: '',
            stderr: 'Execution timeout (5 seconds exceeded)',
            error: true
          });
        } else {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            error: !!error
          });
        }
      });

      // Send stdin to the process
      if (stdin) {
        child.stdin.write(stdin + '\n');
        child.stdin.end();
      }
    });

  } catch (err) {
    // Clean up on error
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }

    return {
      stdout: '',
      stderr: err.message,
      error: true
    };
  }
}

module.exports = { executeCode };
