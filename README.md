# Browser Minimap

为网页右侧添加一个结构化的 minimap，像编辑器里的 minimap 一样快速预览和滚动页面。

## 功能

- **右侧 minimap**：在页面右侧生成一个 150px 宽的 minimap 列，根据页面 DOM 结构绘制简化缩略图。
- **滑块滚动**：minimap 内有一个可拖动滑块，拖动即可控制页面滚动；点击 minimap 轨道可快速跳转。
- **视口同步**：蓝色半透明框实时显示当前视口位置，并随页面滚动同步更新。
- **智能隐藏**：当页面无需滚动时自动隐藏 minimap。
- **刘海切换按钮**：默认显示为右侧边缘的 iPhone 刘海风格细条，hover 时展开为完整按钮。
- **触摸支持**：支持鼠标和触摸屏操作。
- **自动刷新**：窗口 resize 或页面内容变化后自动重绘 minimap。

## 安装

### 方式一：加载已解压的扩展

1. 下载并解压 `browser-minimap.zip`。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择解压后的目录。

### 方式二：直接加载项目目录

1. 克隆或下载本项目到本地。
2. 按方式一的步骤 2–4，选择项目目录。

## 文件结构

```
browser-minimap/
├── manifest.json          # Chrome 扩展 V3 配置
├── content.js             # 核心：注入 minimap、绘制、交互
├── styles.css             # minimap 和切换按钮样式
├── background.js          # 后台服务脚本
├── popup.html             # 扩展图标弹出面板
├── popup.js               # 弹出面板交互
├── icons/                 # 扩展图标
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── generate_icons.py      # 图标生成脚本
└── browser-minimap.zip    # 可直接安装的打包文件
```

## 使用

- **打开/关闭 minimap**：
  - 将鼠标移到右侧刘海细条上，hover 展开后点击。
  - 或点击扩展图标，在弹出面板中点击「切换 minimap」。
- **滚动页面**：
  - 拖动 minimap 中的蓝色滑块。
  - 或直接点击 minimap 轨道跳转到对应位置。
- **临时隐藏**：点击刘海按钮或 popup 中的切换按钮，扩展会记住你的选择。

## 颜色说明

minimap 中不同颜色代表不同类型的页面元素：

| 颜色 | 元素类型 |
|------|----------|
| 橙黄色 | 标题（h1–h6） |
| 绿色 | 图片、视频、canvas |
| 浅蓝色 | 链接（a） |
| 紫色 | 按钮、summary、label |
| 淡黄色 | 列表（ul/ol/li） |
| 青绿色 | 表格 |
| 白色/灰色 | 普通区块 |

## 权限

- `activeTab`：读取当前标签页以注入 minimap。
- `storage`：保存 minimap 显示/隐藏状态。
- `scripting`：在需要时向页面注入脚本。
- `<all_urls>`：在所有网页上启用 minimap。

## 更新日志

- 初始版本：右侧 minimap、滑块滚动、智能隐藏、刘海切换按钮。

## 许可证

MIT
