// options 页面单一入口（替代 options.html 里原来的 7 个 <script>）
// 按原有加载顺序依次 import，window.xxx 全局变量写法完全保留
import './global.js';
import './settings-context.js';
import './settings-data.js';
import './settings.js';
import './words.js';
import './roots.js';
import './tree.js';
