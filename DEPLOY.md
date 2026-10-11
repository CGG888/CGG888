# mtoo.vip — 发布与维护说明

风格：**cyberpunk-neon**（近黑底 `#0a0a0f` + 青色 `#00ffff` / 品红 `#ff00ff` 辉光 + 全 mono 字 + CRT 扫描线）。
零依赖静态站，没有任何构建步骤、没有 npm 包、没有框架 —— 浏览器打开就是成品。

> ⚠️ **仓库根目录的 `README.md` 是你的 GitHub 个人主页展示文件。**
> 这个文件夹就是 `github.com/CGG888/CGG888`，那个 `README.md` 会**直接渲染在你的 GitHub 主页上**。
> 它已经被重写过一次（清掉了模板里的占位邮箱、假技术栈和坏掉的 badge），改它之前想清楚。
> 本说明文件故意叫 `DEPLOY.md`，就是为了不跟它抢位置。

---

## 1. 本地预览

```bash
node tools/serve.cjs 8788      # → http://127.0.0.1:8788/
```

`tools/serve.cjs` 复刻 GitHub Pages 的解析规则（`/projects` 不带 `.html` 也能开、
未知路径返回自定义 404 页 + 真实 404 状态码），所以本地看到的 = 线上看到的。

## 2. 自检

```bash
node tools/build.cjs
```

离线检查七件事，输出 `BUILD OK` 才算可发布：

| # | 检查 |
|---|---|
| 1 | 每页所有本地 `href`/`src` 都能解析到真实文件 |
| 2 | 没有任何 `<img>` 缺 `src` |
| 3 | 四个置顶仓库的 cover / gallery 图都在磁盘上 |
| 3b | `docs/assets/img/` 里没有没被引用的图（死重） |
| 4 | 五页的 `lang` / charset / viewport / title / description / canonical / og:* / favicon 齐全（`404.html` 按 `noindex` 标准） |
| 5 | 生成物不比生成脚本旧 |
| 6 | `docs/` 里没有 `_*` / `.bak` / `.orig` 之类的开发残留 |
| 7 | 统计发布体积 |

## 3. 重新生成数据与图片

```bash
node tools/build-projects.cjs   # → docs/assets/data/projects.json
python tools/prepare-assets.py  # → docs/assets/img/**（需要 Pillow）
```

`build-projects.cjs` 只产出**四个置顶仓库**，置顶名单与文案写在脚本内的 `PINNED` 常量表里，
那是唯一真源。星标数据来自 GitHub GraphQL `pinnedItems`（token 依次从 `$GH_TOKEN`
或 `C:\Users\Administrator\.git-credentials` 运行时读取，**从不打印**），
失败时依次回退 ungh.cc → api.github.com → 上次发布的快照 → `tools/stars-cache.json`，
所以任何一次限流都不会把已知星标清零。

`prepare-assets.py` 从**相邻仓库**读取原始截图
（`D:\github\SrcBox`、`D:\github\channel-sentinel`、`D:\github\headplaneCN`），
所以它只能在这台机器上重跑；产物已提交，线上不依赖它。

## 4. 发布

发布源：仓库 `CGG888/CGG888`，从 **main 分支的 `/docs` 目录**发布（不需要 Actions）。

### 4.1 为什么不是 `git push`

**这台机器上 `github.com` 的 git 通道是断的。** TCP 连得上，但 TLS 一交换就被重置：

```
$ git clone https://github.com/CGG888/CGG888.git
fatal: unable to access '…': Recv failure: Connection was reset
```

`api.github.com`、`codeload.github.com` 正常。所以发布走 `tools/deploy.cjs` ——
它用 Git Data API 造一个**真正的 commit**（`blobs → tree → commit → PATCH refs/heads/main`），
历史、blame、网页版全都跟 push 上去的一模一样，而且顺手还能开 Pages（`git push` 做不到）。

只有被改动的文件才会传 blob（本地先算 git 的 `sha1("blob <len>\0"+content)` 比对），
未改动路径靠 `base_tree` 自动保留 —— 所以 `CGG888_PROFILE.md` 不受影响。

### 4.2 发布命令

```bash
node tools/deploy.cjs                 # 干跑：列出会新增/修改哪些文件
node tools/deploy.cjs --push          # 真的提交并移动 main
node tools/deploy.cjs --push --pages  # 顺便开通 Pages（main /docs）
```

token 依次取 `$GH_TOKEN` → `~/.git-credentials` 里的 github.com 条目（需要 `repo` scope），
**从不打印**。发布前先 `node tools/build.cjs` 跑到 `BUILD OK`。

### 4.3 首次开通 Pages 之后要做的事

1. 确认 `docs/CNAME` 内容是 `mtoo.vip`（已就位）。
2. 仓库 → Settings → Pages 确认 Source 是 **Deploy from a branch** / `main` / `/docs`。
3. 勾上 **Enforce HTTPS**（证书签发要等几分钟，签发完才能勾）。
4. 在 Actions 之外，Pages 每次提交 main 都会自动重新发布。

`docs/.nojekyll` 已就位 —— 没有它，Jekyll 会吞掉以 `_` 开头的路径。

## 5. DNS（阿里云万网，`dns1/dns2.hichina.com`）

**删掉**现有的 `mtoo.vip → 183.7.146.149` 与 `www → 119.128.128.41`（家宽 80/443 被运营商封，
海外节点实测三个全超时，留着会连到打不开的机器上）。

| 主机记录 | 类型 | 记录值 |
|---|---|---|
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |
| `@` | AAAA | `2606:50c0:8000::153` |
| `@` | AAAA | `2606:50c0:8001::153` |
| `@` | AAAA | `2606:50c0:8002::153` |
| `@` | AAAA | `2606:50c0:8003::153` |
| `www` | CNAME | `cgg888.github.io` |

邮件相关记录（`MX` → `mxn/mxw.mxhichina.com`、`git` 的 CNAME、TXT）**不要动**。

## 6. 联系邮箱

站上（页脚、关于页两处、作品页、赞助页）用的是 **`cgg@mtoo.vip`**（按你的要求从 `hi@` 改成 `cgg@`）。
如果这个邮箱还没在阿里云企业邮里开通，记得去开一个，或者在 `docs/*.html` 里全局替换掉
（`mailto:cgg@mtoo.vip` 与显示文本各一处，共 6 处）。

## 7. 目录

```
README.md                 ← GitHub 个人主页展示文件（已验证，改之前想清楚）
CGG888_PROFILE.md         ← 历史遗留的模板副本，没被引用，保持原样
DEPLOY.md  .gitignore
docs/                     ← 只有这里会发布
  index.html              首页 · 诊断报告
  projects.html           作品 · 门口只挂四件东西
  about.html              关于 · 一份很长的自白
  sponsor.html            赞助 · 不必赞助，也能用一辈子
  404.html                glitch 404
  CNAME  .nojekyll  robots.txt  sitemap.xml
  assets/
    css/neon.css          唯一全站样式表
    js/site.js            reveal / 滚动 ticker / 抽屉 / 复制
    js/projects.js        渲染置顶四件东西
    img/og.png            OG 分享卡
    img/projects/*.webp   9 张真实截图
    img/qr/wechat.png     微信收款码（原图 764×760）
    img/qr/alipay.png     支付宝收款码（992×1000）
    data/projects.json    构建期快照（页面不调 GitHub API）
tools/                    ← 不发布
  deploy.cjs              发布到 GitHub（REST API，本机 git 通道不通时用这个）
  build.cjs  build-projects.cjs  prepare-assets.py  serve.cjs  stars-cache.json
```

`tools/_*`（`_shots/`、`_pull/`、`_contact-sheet.png` 等）都是给人眼验收或一次性侦察用的
工件，已被 `.gitignore` 与 `deploy.cjs` 双重排除，永远不会进提交。
