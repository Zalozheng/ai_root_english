/**
 * 构建后自动打包 dist/ 为带版本号的 zip
 * 用法: npm run zip
 */
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.resolve(__dirname, '..');
const distDir   = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ 目录不存在，请先运行 npm run build');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf-8'));
const zipName  = `extension-v${manifest.version}.zip`;
const zipPath  = path.join(rootDir, zipName);

const output  = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✅ 打包完成: ${zipName}  (${sizeMB} MB)`);
  console.log(`📦 路径: ${zipPath}`);
  console.log(`🚀 可以上传到 Chrome Web Store 了！`);
});

archive.on('error', err => { throw err; });
archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
