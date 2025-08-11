#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PORTS = [7000, 9000];
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

async function killPort(port) {
  try {
    // Find all processes using the port
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    
    if (pids.length > 0) {
      console.log(`${COLORS.yellow}🔪 Killing ${pids.length} process(es) on port ${port}${COLORS.reset}`);
      
      // Kill each process
      for (const pid of pids) {
        try {
          // Try graceful shutdown first
          await execAsync(`kill -TERM ${pid}`);
          console.log(`   ${COLORS.green}✅ Terminated process ${pid}${COLORS.reset}`);
          
          // Give it a moment to shut down gracefully
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Force kill if still running
          try {
            await execAsync(`kill -0 ${pid} 2>/dev/null`);
            // Process still exists, force kill
            await execAsync(`kill -9 ${pid}`);
            console.log(`   ${COLORS.yellow}⚠️  Force killed stubborn process ${pid}${COLORS.reset}`);
          } catch {
            // Process already terminated gracefully
          }
        } catch (err) {
          // Process might have already been killed
          if (!err.message.includes('No such process')) {
            console.log(`   ${COLORS.red}⚠️  Could not kill process ${pid}: ${err.message}${COLORS.reset}`);
          }
        }
      }
      
      return pids.length;
    }
    return 0;
  } catch (error) {
    if (error.code === 1 || error.message.includes('No such process')) {
      // No process found on port (this is fine)
      return 0;
    } else {
      console.error(`${COLORS.red}❌ Error checking port ${port}: ${error.message}${COLORS.reset}`);
      return 0;
    }
  }
}

async function killNodemonAndVite() {
  console.log(`${COLORS.cyan}🔍 Looking for nodemon and vite processes...${COLORS.reset}`);
  
  try {
    // Kill nodemon processes
    try {
      const { stdout: nodemonPids } = await execAsync(`pgrep -f "nodemon.*server.js"`);
      const pids = nodemonPids.trim().split('\n').filter(Boolean);
      if (pids.length > 0) {
        console.log(`${COLORS.yellow}🔪 Killing ${pids.length} nodemon process(es)${COLORS.reset}`);
        for (const pid of pids) {
          await execAsync(`kill -9 ${pid}`);
          console.log(`   ${COLORS.green}✅ Killed nodemon process ${pid}${COLORS.reset}`);
        }
      }
    } catch {
      // No nodemon processes found
    }
    
    // Kill vite processes
    try {
      const { stdout: vitePids } = await execAsync(`pgrep -f "vite.*--port"`);
      const pids = vitePids.trim().split('\n').filter(Boolean);
      if (pids.length > 0) {
        console.log(`${COLORS.yellow}🔪 Killing ${pids.length} vite process(es)${COLORS.reset}`);
        for (const pid of pids) {
          await execAsync(`kill -9 ${pid}`);
          console.log(`   ${COLORS.green}✅ Killed vite process ${pid}${COLORS.reset}`);
        }
      }
    } catch {
      // No vite processes found
    }
  } catch (error) {
    console.log(`${COLORS.yellow}⚠️  Could not check for nodemon/vite processes${COLORS.reset}`);
  }
}

async function main() {
  console.log(`${COLORS.magenta}🧹 Cleaning up development environment...${COLORS.reset}`);
  console.log(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  
  // Kill any nodemon and vite processes first
  await killNodemonAndVite();
  
  // Kill processes on specified ports
  let totalKilled = 0;
  for (const port of PORTS) {
    const killed = await killPort(port);
    totalKilled += killed;
  }
  
  // Wait a moment for ports to be fully released
  if (totalKilled > 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  
  // Verify ports are free
  let allPortsFree = true;
  for (const port of PORTS) {
    try {
      await execAsync(`lsof -ti:${port}`);
      console.log(`${COLORS.red}❌ Port ${port} is still occupied!${COLORS.reset}`);
      allPortsFree = false;
    } catch {
      console.log(`${COLORS.green}✅ Port ${port} is free${COLORS.reset}`);
    }
  }
  
  if (allPortsFree) {
    console.log(`${COLORS.green}✨ All ports are clear! Ready to start fresh.${COLORS.reset}`);
  } else {
    console.log(`${COLORS.yellow}⚠️  Some ports may still be occupied. You might need to manually kill the processes.${COLORS.reset}`);
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(`${COLORS.red}Fatal error: ${err}${COLORS.reset}`);
  process.exit(1);
});
