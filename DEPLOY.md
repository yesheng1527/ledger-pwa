# 海风小账本部署说明

项目使用 Vite 构建，并通过 GitHub Pages 发布。

## 本地验证

```bash
npm ci
npm run test:run
npm run build
```

构建产物位于 `dist/`。发布前应确认：

- 页面标题为“海风小账本”。
- `dist/manifest.webmanifest` 存在。
- `dist/icons/` 包含 180、192、512 像素的海岛图标。

## GitHub Pages

仓库的 Pages 发布目录为 `gh-pages` 分支根目录。手动运行
`Deploy GitHub Pages` 工作流时，它只会构建并发布当前海风版本。

旧版静态站、旧恢复包和旧 Render 部署配置均已移除，禁止重新发布。
