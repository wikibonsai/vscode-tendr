import { spawn } from 'child_process';


export function startFastAPIServer() {
  const pythonExecutable: string = 'python3'; // Or 'python3', depending on your system
  const serverScript: string = 'server.py';   // The path to your FastAPI server script

  const serverProcess = spawn(pythonExecutable, [serverScript]);

  serverProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`FastAPI server process exited with code ${code}`);
  });
}
