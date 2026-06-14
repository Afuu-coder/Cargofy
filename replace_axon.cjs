const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', 'dist', '.git', '__pycache__', 'venv', '.venv', '.firebase', '.pytest_cache'];
const validExts = ['.ts', '.tsx', '.py', '.md', '.json', '.html', '.css', '.js', '.cjs'];

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content
    .replace(/Cargofy/g, 'Cargofy')
    .replace(/cargofy/g, 'cargofy')
    .replace(/CARGOFY/g, 'CARGOFY');

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (excludeDirs.includes(file)) continue;
    
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else {
      const ext = path.extname(fullPath);
      // Skip binary images or non-text files based on extension whitelist
      if (validExts.includes(ext) || file === 'Dockerfile' || file === 'docker-compose.yml' || file === '.env.example' || file.startsWith('.env')) {
        replaceInFile(fullPath);
      }
    }
  }
}

walkDir('.');
console.log('Global replacement complete.');
