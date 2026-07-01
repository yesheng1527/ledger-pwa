# 轻账本上线说明

这个项目是纯前端静态 PWA，线上数据使用 Supabase。

## 推荐部署方式：Render Static Site

1. 把当前项目推到 GitHub、GitLab 或 Bitbucket。
2. 打开 Render Blueprint：
   `https://dashboard.render.com/blueprint/new`
3. 选择这个仓库。
4. Render 会读取根目录的 `render.yaml`。
5. 点击 Apply 部署。

部署成功后会得到类似：

`https://ledger-pwa.onrender.com`

## 需要注意

- `supabase-config.js` 里现在使用的是 Supabase publishable/anon key，可以放前端。
- Supabase 必须正确配置 RLS，否则别人可能读写不该读写的数据。
- 如果换域名，需要在 Supabase Auth 设置里把线上域名加到允许跳转地址。
