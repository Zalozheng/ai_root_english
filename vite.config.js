import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: '.',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    // terser 混淆压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,  // 保留 console
        drop_debugger: true,  // 移除 debugger
        passes: 2,
      },
      mangle: {
        toplevel: false,      // 不混淆顶层（保护 window.xxx）
      },
      format: {
        comments: false,      // 移除所有注释
      },
    },

    sourcemap: false,
  },

  plugins: [
    webExtension({
      manifest: 'manifest.json',
      additionalInputs: ['docs.html'],
      webExtConfig: {
        browser: 'chrome',
      },
    }),

    // 复制静态资源目录
    viteStaticCopy({
      targets: [
        { src: '_locales', dest: '.' },  // 多语言（必须）
        { src: 'icons',    dest: '.' },  // 图标（必须）
      ],
    }),
  ],
});
