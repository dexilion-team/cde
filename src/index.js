#!/usr/bin/env node

import { spawnSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { homedir, networkInterfaces } from "os";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

/**
 * Returns a canonical os name for the current platform
 * @returns {string} - Path to the executable for the current platform
 */
function getOS() {
  if (["win32", "cygwin"].includes(process.platform)) {
    return "windows";
  }
  return process.platform;
}

/**
 * Reads the .dexilion.cde.conf file from the user's home directory
 * @returns {Object} - Configuration object with optional sshKeysDir and required dockerSocket properties
 */
function getConfig() {
  const configFileName = '.dexilion.cde.conf';
  const configPath = join(homedir(), configFileName);

  try {
    if (existsSync(configPath)) {
      // Read existing config file
      const configContent = readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      // Validate that config is an object
      if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        throw new Error('Configuration file must contain a JSON object');
      }

      return config;
    }

    return null; // No config file found
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${configPath}`);
    }
    throw error;
  }
}

/**
 * Checks if a command exists and is available in the system PATH
 * @param {string} command - The command to check for
 * @returns {boolean} - True if command exists, false otherwise
 */
function commandExists(command) {
  try {
    let result;
    
    if (getOS() === 'windows') {
      // Windows: use 'where' command
      result = spawnSync('where', [command], {
        stdio: 'pipe',
        timeout: 3000
      });
    } else {
      // Unix/Linux/macOS: use 'which' command
      result = spawnSync('which', [command], {
        stdio: 'pipe',
        timeout: 3000
      });
    }

    return result.status === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a Docker socket path exists and is accessible by testing Docker daemon connectivity
 * @param {string} socketPath - Path to the Docker socket
 * @returns {boolean} - True if socket is accessible, false otherwise
 */
function checkDockerSocketAccess(socketPath) {
  try {
    const dockerCommand = commandExists('docker') ? 'docker' : 'podman';

    let result = spawnSync(dockerCommand, [
        'run', 
        '--rm',
        '-v', `${socketPath}:/var/run/docker.sock`,
        'alpinelinux/docker-cli', 
        'docker', 'version', '--format', 'json'
      ],
      {
        stdio: 'pipe',
        timeout: 3000, // 3 seconds timeout
      }
    );

    if (result.status === 0) {
      return true;
    }

  } catch { }

  return false;
}

/**
 * Checks for active Docker socket and validates access
 * @returns {string|null} - Docker socket path if available and accessible, null otherwise
 */
function getDockerSocketPath() {
  // Platform-specific default socket paths
  const defaultSocketPaths =
    [
      '/var/run/docker.sock',             // Standard Unix socket
      '/run/docker.sock',                 // Alternative location
      join(homedir(), '.docker/desktop/docker.sock'), // Docker Desktop on macOS
      '/usr/local/var/run/docker.sock',   // Homebrew Docker on macOS
      
    ];

    if (getOS() !== 'windows') {
      defaultSocketPaths.push(
        ...[
          `/run/user/${process.getuid()}/docker.sock`, // User-specific socket on Linux
          `/run/user/${process.getuid()}/podman/podman.sock` // User-specific Podman socket on Linux
        ]
    );
    }

  for (const socketPath of defaultSocketPaths) {
    if (checkDockerSocketAccess(socketPath)) {      
      return socketPath;
    }
  }

  return null;
}

/**
 * Locates the .ssh directory in the user's home directory
 * @returns {string|null} - Absolute path to .ssh directory if it exists, null otherwise
 */
function getSshDirectory() {
  // Default .ssh directory in user's home
  const defaultSshPath = join(homedir(), '.ssh');

  if (existsSync(defaultSshPath)) {
    return defaultSshPath;
  }

  // On Windows, also check for alternative locations
  if (getOS() === 'windows') {
    const alternativePaths = [
      join(process.env.USERPROFILE || homedir(), '.ssh'),
      join(process.env.HOMEDRIVE || 'C:', process.env.HOMEPATH || `\\Users\\${process.env.USERNAME}`, '.ssh'),
      join('C:', 'Users', process.env.USERNAME || 'user', '.ssh')
    ];

    for (const sshPath of alternativePaths) {
      if (existsSync(sshPath)) {
        return sshPath;
      }
    }
  }

  return null;
}

/**
 * Gets the first non-localhost IP address of the current machine
 * @returns {string|null} - First non-localhost IP address, null if not found
 */
function getExternalIP() {
  try {
    // Use Node.js built-in network interfaces
    const nets = networkInterfaces();

    // Priority order for interface types (prefer ethernet/wifi over virtual)
    const interfacePriority = ['eth', 'en', 'wlan', 'wifi', 'ethernet'];

    // First pass: look for priority interfaces
    for (const priority of interfacePriority) {
      for (const name of Object.keys(nets)) {
        if (name.toLowerCase().startsWith(priority)) {
          const net = nets[name];
          if (net) {
            for (const addr of net) {
              // Skip internal (localhost) and non-IPv4 addresses
              if (addr.family === 'IPv4' && !addr.internal) {
                return addr.address;
              }
            }
          }
        }
      }
    }

    // Second pass: any non-internal IPv4 address
    for (const name of Object.keys(nets)) {
      const net = nets[name];
      if (net) {
        for (const addr of net) {
          // Skip internal (localhost) and non-IPv4 addresses
          if (addr.family === 'IPv4' && !addr.internal) {
            return addr.address;
          }
        }
      }
    }

    // Fallback: try command-line approach for edge cases
    return getExternalIPCommandLine();

  } catch (error) {
    // Fallback to command-line approach
    return getExternalIPCommandLine();
  }
}

/**
 * Fallback method to get external IP using command-line tools
 * @returns {string|null} - First non-localhost IP address, null if not found
 */
function getExternalIPCommandLine() {
  try {
    let result;

    if (getOS() === 'windows') {
      // Windows: use ipconfig
      result = spawnSync('ipconfig', [], {
        timeout: 5000,
        stdio: 'pipe',
        encoding: 'utf8'
      });

      if (result.status === 0 && result.stdout) {
        // Look for IPv4 addresses in ipconfig output
        const ipRegex = /IPv4[^:]*:\s*([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/g;
        let match;
        while ((match = ipRegex.exec(result.stdout)) !== null) {
          const ip = match[1];
          if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) {
            return ip;
          }
        }
      }
    } else {
      // Linux/Mac: try multiple approaches
      const commands = [
        // Try hostname command with -I flag (Linux)
        ['hostname', ['-I']],
        // Try ip route (Linux)
        ['ip', ['route', 'get', '1.1.1.1']],
        // Try ifconfig (Mac/Linux)
        ['ifconfig'],
        // Try route command (Mac)
        ['route', ['get', 'default']]
      ];

      for (const [cmd, args] of commands) {
        try {
          result = spawnSync(cmd, args || [], {
            timeout: 3000,
            stdio: 'pipe',
            encoding: 'utf8'
          });

          if (result.status === 0 && result.stdout) {
            const output = result.stdout;

            if (cmd === 'hostname' && args && args[0] === '-I') {
              // hostname -I returns space-separated IPs
              const ips = output.trim().split(/\s+/);
              for (const ip of ips) {
                if (ip.match(/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/) &&
                  !ip.startsWith('127.') && !ip.startsWith('169.254.')) {
                  return ip;
                }
              }
            } else if (cmd === 'ip') {
              // Extract src IP from ip route output
              const srcMatch = output.match(/src\s+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
              if (srcMatch) {
                return srcMatch[1];
              }
            } else {
              // General IP extraction for ifconfig/route
              const ipRegex = /inet\s+(?:addr:)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/g;
              let match;
              while ((match = ipRegex.exec(output)) !== null) {
                const ip = match[1];
                if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) {
                  return ip;
                }
              }
            }
          }
        } catch (cmdError) {
          // Continue to next command
          continue;
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Prompts user for input with a default value
 * @param {string} question - The question to ask
 * @param {string} defaultValue - Default value if user just presses enter
 * @returns {Promise<string>} - User's input or default value
 */
function promptUser(question, defaultValue = '') {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const promptText = defaultValue
      ? `${question} (${defaultValue}): `
      : `${question}: `;

    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Prompts user for yes/no confirmation
 * @param {string} question - The question to ask
 * @param {boolean} defaultValue - Default value (true for yes, false for no)
 * @returns {Promise<boolean>} - User's confirmation
 */
function promptConfirm(question, defaultValue = true) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    rl.question(`${question} (${defaultText}): `, (answer) => {
      rl.close();
      const input = answer.trim().toLowerCase();
      if (input === '') {
        resolve(defaultValue);
      } else {
        resolve(input === 'y' || input === 'yes');
      }
    });
  });
}

/**
 * Saves configuration to file
 * @param {Object} config - Configuration object
 */
function saveConfig(config) {
  const configFileName = '.dexilion.cde.conf';
  const configPath = join(homedir(), configFileName);

  const configData = {
    dockerSocket: config.dockerSocket,
    sshKeysDir: config.sshKeysDir,
    externalIP: config.externalIP
  };

  writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
  console.log(`\n💾 Configuration saved to ${configPath}:`);
}

/**
 * Builds the Docker image if it doesn't exist
 */
async function buildDockerImage() {
  const buildDirectory = findDockerBuildDirectory();
  
  if (!buildDirectory) {
    throw new Error('❌ @dexilion/cde Dockerfile not found in current directory or any parent directories');
  }
  
  const buildArgs = [
    'build', '--no-cache', '-t', 'dexilion-cde', '-f', 'Dockerfile', '.'
  ];

  // Spinning indicator characters
  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIndex = 0;

  // Start the spinner
  const spinner = setInterval(() => {
    process.stdout.write(`\r${spinnerChars[spinnerIndex]} Building Docker image...`);
    spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
  }, 100);

  return new Promise((resolve, reject) => {
    // Try Docker first
    const dockerProcess = spawn('docker', buildArgs, {
      cwd: buildDirectory,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    dockerProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    dockerProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    dockerProcess.on('close', (code) => {
      // Clear the spinner
      clearInterval(spinner);
      process.stdout.write('\r'); // Clear the line

      if (code === 0) {
        console.log('✅ Docker image built successfully');
        resolve();
      } else {
        // Restart spinner for Podman
        const podmanSpinner = setInterval(() => {
          process.stdout.write(`\r${spinnerChars[spinnerIndex]} Building with Podman...`);
          spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
        }, 100);

        const podmanProcess = spawn('podman', buildArgs, {
          cwd: buildDirectory,
          stdio: 'pipe'
        });

        let podmanStdout = '';
        let podmanStderr = '';

        podmanProcess.stdout.on('data', (data) => {
          podmanStdout += data.toString();
        });

        podmanProcess.stderr.on('data', (data) => {
          podmanStderr += data.toString();
        });

        podmanProcess.on('close', (podmanCode) => {
          clearInterval(podmanSpinner);
          process.stdout.write('\r');

          if (podmanCode === 0) {
            console.log('✅ Docker image built successfully with Podman');
            resolve();
          } else {
            console.error('❌ Both Docker and Podman build failed\n');
            if (stdout || podmanStdout) {
              console.log('Build output:');
              console.log(stdout || podmanStdout);
            }
            if (stderr || podmanStderr) {
              console.error('Build errors:');
              console.error(stderr || podmanStderr);
            }
            console.error(`Exit codes - Docker: ${code}, Podman: ${podmanCode}`);
            reject(new Error(`Build failed - Docker: ${code}, Podman: ${podmanCode}`));
          }
        });

        podmanProcess.on('error', (error) => {
          clearInterval(podmanSpinner);
          process.stdout.write('\r');
          console.error('❌ Docker build failed and Podman not available\n');
          if (stdout) {
            console.log('Docker build output:');
            console.log(stdout);
          }
          if (stderr) {
            console.error('Docker build errors:');
            console.error(stderr);
          }
          console.error(`Docker exit code: ${code}`);
          reject(new Error(`Build failed - Docker: ${code}, Podman error: ${error.message}`));
        });
      }
    });

    dockerProcess.on('error', (error) => {
      // Clear the spinner on error
      clearInterval(spinner);
      process.stdout.write('\r');

      // Restart spinner for Podman
      const podmanSpinner = setInterval(() => {
        process.stdout.write(`\r${spinnerChars[spinnerIndex]} Building with Podman...`);
        spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
      }, 100);

      const podmanProcess = spawn('podman', buildArgs, {
        cwd: buildDirectory,
        stdio: 'pipe'
      });

      let podmanStdout = '';
      let podmanStderr = '';

      podmanProcess.stdout.on('data', (data) => {
        podmanStdout += data.toString();
      });

      podmanProcess.stderr.on('data', (data) => {
        podmanStderr += data.toString();
      });

      podmanProcess.on('close', (podmanCode) => {
        clearInterval(podmanSpinner);
        process.stdout.write('\r');

        if (podmanCode === 0) {
          console.log('✅ Docker image built successfully with Podman');
          resolve();
        } else {
          console.error('❌ Both Docker and Podman are unavailable or failed');
          if (podmanStdout) {
            console.log('Podman build output:');
            console.log(podmanStdout);
          }
          if (podmanStderr) {
            console.error('Podman build errors:');
            console.error(podmanStderr);
          }
          console.error(`Podman exit code: ${podmanCode}`);
          reject(new Error(`Build failed - Docker error: ${error.message}, Podman: ${podmanCode}`));
        }
      });

      podmanProcess.on('error', (podmanError) => {
        clearInterval(podmanSpinner);
        process.stdout.write('\r');
        console.error('❌ Neither Docker nor Podman are available');
        reject(new Error(`Build failed - Docker: ${error.message}, Podman: ${podmanError.message}`));
      });
    });
  });
}

/**
 * Checks if the dexilion-cde Docker image is available locally
 * @returns {boolean} - True if image exists locally, false otherwise
 */
function checkDockerImageExists() {
  try {
    // Try to inspect the image to see if it exists
    let result = spawnSync('docker', ['image', 'inspect', 'dexilion-cde'], {
      stdio: 'pipe',
      timeout: 5000
    });

    // If docker command failed, try podman
    if (result.error || result.status !== 0) {
      result = spawnSync('podman', ['image', 'inspect', 'dexilion-cde'], {
        stdio: 'pipe',
        timeout: 5000
      });
    }

    // If the command succeeded, the image exists
    return result.status === 0;
  } catch (error) {
    // If any error occurs, assume image doesn't exist
    return false;
  }
}

/**
 * Runs the Docker container with the provided configuration
 * @param {Object} config - Configuration object
 */
async function runDockerContainer(config) {
  console.log('\n🚀 Starting Docker container...\n');

  // Check if image exists locally, build if it doesn't
  if (!checkDockerImageExists()) {
    console.log('📦 Docker image not found, building...\n');
    try {
      await buildDockerImage();
      console.log(''); // Add spacing after build completion
    } catch (error) {
      console.error('❌ Failed to build Docker image');
      process.exit(1);
    }
  }

  // Build Docker command
  const dockerArgs = [
    'run', '--rm', '-it',
    '-v', 'dexilion-cde-root:/root',
    '-v', 'dexilion-ced-yarn-cache:/usr/local/share/.cache/yarn',
    '--network=bridge',
    '-p', '8081:8081',
    '-p', '3000:3000',
    '-e', `REACT_NATIVE_PACKAGER_HOSTNAME=${config.externalIP}`
  ];

  // Check if .env.local exists and adds it
  if (existsSync('.env.local')) {
    dockerArgs.push('--env-file', '.env.local');
  }

  // Add SSH mount if directory is provided
  if (config.sshKeysDir) {
    dockerArgs.push('--mount', `type=bind,src=${config.sshKeysDir},dst=/root/.ssh`);
  }

  // Add Docker socket mount
  dockerArgs.push('--mount', `type=bind,src=${config.dockerSocket},dst=/var/run/docker.sock`);

  // Add image name
  dockerArgs.push('dexilion-cde');

  // Execute Docker command
  let result = spawnSync('docker', dockerArgs, {
    stdio: 'inherit',
    env: { ...process.env }
  });

  if (result.error) {
    result = spawnSync('podman', dockerArgs, {
      stdio: 'inherit',
      env: { ...process.env }
    });
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

/**
 * Checks if an IP address is available (not in use) on the local network.
 * Works on Windows, Linux, and macOS.
 * @param {string} ip - The IP address to check
 * @returns {boolean} - True if the IP is available (no response), false if in use (responds to ping)
 */
function isIPAvailable(ip) {
  try {
    // Validate IP format
    if (!ip || typeof ip !== 'string') {
      return false;
    }

    // Basic IP format validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return false;
    }

    let pingCmd, pingArgs;

    if (getOS() === 'windows') {
      // Windows: -n 1 (one ping), -w 1000 (timeout 1000ms)
      pingCmd = 'ping';
      pingArgs = ['-n', '1', '-w', '1000', ip];
    } else if (process.platform === 'darwin') {
      // macOS: -c 1 (one ping), -W 1000 (timeout 1000ms)
      pingCmd = 'ping';
      pingArgs = ['-c', '1', '-W', '1000', ip];
    } else {
      // Linux: -c 1 (one ping), -W 1 (timeout 1 second)
      pingCmd = 'ping';
      pingArgs = ['-c', '1', '-W', '1', ip];
    }

    const result = spawnSync(pingCmd, pingArgs, {
      stdio: 'pipe',
      timeout: 3000 // Overall timeout
    });

    // If ping succeeds (exit code 0), the IP is in use (not available)
    // If ping fails (non-zero exit code), the IP is available
    return result.status === 0;
  } catch (error) {
    // If there's an error running ping, assume IP is not available
    return false;
  }
}

/**
 * Finds the directory containing the Dockerfile by walking up from the current script's directory
 * @returns {string|null} - Absolute path to the directory containing Dockerfile, null if not found
 */
function findDockerBuildDirectory() {
  // Get the directory of the current script
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
  let currentDir = resolve(__dirname);
  const rootDir = resolve('/');
  
  while (currentDir !== rootDir) {
    const dockerfilePath = join(currentDir, 'Dockerfile');
    
    if (existsSync(dockerfilePath)) {
      return currentDir;
    }
    
    // Move up one directory
    const parentDir = dirname(currentDir);
    
    // Prevent infinite loop if dirname returns the same directory
    if (parentDir === currentDir) {
      break;
    }
    
    currentDir = parentDir;
  }
  
  // Check root directory as well
  const rootDockerfilePath = join(rootDir, 'Dockerfile');
  if (existsSync(rootDockerfilePath)) {
    return rootDir;
  }
  
  return null;
}

/**
 * Main CLI function
 */
async function main() {
  console.log('🪨  Welcome to the Dexilion Expo & Supabase Development Environment\n');

  const config = getConfig() ?? {};

  if (!config || !config.externalIP || !config.externalIP) {
    console.log('📂 No existing configuration found, gathering required information...\n');
    if (!config.dockerSocket) {
      config.dockerSocket = await promptUser('Docker Socket path', getDockerSocketPath() || '');
      if (!config.dockerSocket) {
        console.error('❌ Docker socket is required');

        process.exit(1);
      }
    }

    if (!config.externalIP) {
      config.externalIP = await promptUser('IP address for React Native packager', getExternalIP() || '');
      if (!config.externalIP) {
        console.error('❌ IP address is required');

        process.exit(1);
      }
    }

    const sshKeysDir = getSshDirectory();
    if (!sshKeysDir) {
      console.warn('⚠️ No SSH keys directory found, provide one if needed or leave empty to skip\n');

      const sshKeysDir = await promptUser('SSH Keys directory (leave empty to skip)', '');
      if (sshKeysDir && existsSync(sshKeysDir)) {
        config.sshKeysDir = sshKeysDir;
      }
    } else {
      config.sshKeysDir = sshKeysDir;
    }

    // Save the gathered or updated configuration
    saveConfig(config);
  } else {
    console.log(`📋 Found existing configuration file at ${homedir() + "/.dexilion.cde.conf"}:`);
  }

  if (!isIPAvailable(config.externalIP)) {
    console.log(`❌ The IP address ${config.externalIP} doesn't seem to be available.`);
    config.externalIP = await promptUser('Please provide an available IP address', getExternalIP() || config.externalIP);
  }

  console.log(`  Docker Socket: ${config.dockerSocket}`);
  console.log(`  SSH Directory: ${config.sshKeysDir || '(none)'}`);
  console.log(`  External IP: ${config.externalIP}`);

  // Run the Docker container
  await runDockerContainer(config);
}

main();