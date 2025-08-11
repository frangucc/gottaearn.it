#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function killPort(port) {
  try {
    // Find process using the port
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    
    if (pids.length > 0) {
      console.log(`🔪 Killing processes on port ${port}: ${pids.join(', ')}`);
      
      // Kill each process
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`   ✅ Killed process ${pid}`);
        } catch (err) {
          console.log(`   ⚠️  Could not kill process ${pid}: ${err.message}`);
        }
      }
      
      // Wait a moment for ports to be released
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(`✨ Port ${port} is now free`);
    } else {
      console.log(`✅ Port ${port} is already free`);
    }
  } catch (error) {
    if (error.code === 1) {
      // No process found on port (this is fine)
      console.log(`✅ Port ${port} is already free`);
    } else {
      console.error(`❌ Error checking port ${port}:`, error.message);
    }
  }
}

// Get port from command line arguments or use default
const port = process.argv[2] || 9000;

killPort(port).then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
