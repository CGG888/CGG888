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
（`D:\github\SrcBox`、`D:\github\channel-sentinel`），
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

**本地删掉一个文件，线上也会跟着删。** 新树是用 `base_tree` 建的，没被提到的路径会原样保留，
所以 `deploy.cjs` 会拿「远端有、本地没有、且属于本工具管辖」的路径去发 `sha: null` 删除项，
干跑时会打印在 `to retire` 一栏。判断归属用的是 `managed()`——只认 `docs/**`、`tools/*.cjs|py|json`
和三个根文件，所以同仓库里的 `CGG888_PROFILE.md` 永远不会被误删。

### 4.2.1 页面上的实时数字

星标、fork、版本、最后提交都不是写死的：`projects.js` 在页面打开时现抓，
`docs/index.html` 的读数格与 `docs/projects.html` 的 `gh pinned --list` 都带 `data-live` / `data-repo` 钩子，
`tools/build-projects.cjs` 生成的 `projects.json` 只是**构建快照**（无 JS、断网、接口挂了时的兜底）。

抓取顺序是 **api.github.com → ungh.cc**，理由写在 `projects.js` 顶部注释里：
GitHub 的限额是公开的（匿名 60 次/小时，一次页面消耗 4 次），ungh.cc 没有限额文档、
而且一并发几个请求就会回 403/429，所以只能当备胎。为了不把 60 次额度浪费在反复刷新的自己身上，
成功的取值会在 `sessionStorage` 里缓存 5 分钟。

两种失败都必须**如实说出来**：接口全挂时页面保留快照并把戳记改成 `SNAPSHOT …（实时源暂时不可用）`，
只有真的抓到了才显示青色的 `LIVE hh:mm · n/m 个仓库已实时核对`。
单个 `/releases` 请求失败时 `release` 记为 `null` 而不是空串——否则会用 `—` 把快照里正确的版本号盖掉。

### 4.3 首次开通 Pages 之后要做的事

1. 确认 `docs/CNAME` 内容是 `mtoo.vip`（已就位）。
2. 仓库 → Settings → Pages 确认 Source 是 **Deploy from a branch** / `main` / `/docs`。
3. 勾上 **Enforce HTTPS**（证书签发要等几分钟，签发完才能勾）。
4. 在 Actions 之外，Pages 每次提交 main 都会自动重新发布。

`docs/.nojekyll` 已就位 —— 没有它，Jekyll 会吞掉以 `_` 开头的路径。

## 5. DNS（阿里云万网，`dns1/dns2.hichina.com`）

**实测状态（2026-10-11）：**

| 记录 | 现状（2026-10-11 实测，6 个公共解析器 + 万网权威 NS 一致） | 还要不要动 |
|---|---|---|
| `www` → CNAME `cgg888.github.io` | ✅ **已经生效** | 不用动 |
| `mtoo.vip` → A `183.7.146.149` | ❌ 还指着家宽路由器 | **要删** |
| `mtoo.vip` → AAAA `240e:3b3:4030:9730::1` | ❌ 旧的电信 IPv6，同样要删 | **要删** |
| 4 条 GitHub A + 4 条 GitHub AAAA | ❌ **一条都不存在** | **要加** |
| `MX` → `mxn/mxw.mxhichina.com`、`git` 的 CNAME、TXT | 原样 | **不要动** |

`www` 那条已经验证过了：`http://www.mtoo.vip/` 返回 `301 → http://mtoo.vip/`，
这个跳转就是 GitHub Pages 认出了这个自定义域名。所以**只差 apex 那 8 条**。

**删掉旧的 A（`183.7.146.149`）和旧的 AAAA（`240e:3b3:4030:9730::1`）**
（家宽 80/443 被运营商封，海外节点实测三个全超时，留着会连到打不开的机器上），换成下面 8 条。
**旧记录不删掉的话 GitHub 会一直报 `mtoo.vip 及其备用名称均配置不正确 / 无法检索域的 DNS 记录`** ——
因为根域解析出来不是它家的 IP。

> ⚠️ 主机记录一律填 `@`（表示根域），**线路必须选「默认」**。只填某个线路（如「境外」）
> 会导致不同网络看到的解析结果不一致，GitHub 的检查照样过不了。
> 另外：**根域上绝对不要加 CNAME**，万网不允许，GitHub 的 CNAME 只放在 `www`。

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

**改完之后：** 等解析生效（几分钟到半小时），GitHub 才会去签 TLS 证书。
证书签发完成之前 `https://mtoo.vip` 会报证书错误，这是正常的。

证书就绪后再开强制 HTTPS：

```bash
node -e "…"   # 或直接在仓库 Settings → Pages 勾 Enforce HTTPS
```

用 API 的话是 `PUT /repos/CGG888/CGG888/pages` + `{"https_enforced":true}`。
现在调它会返回 `404 The certificate does not exist yet` —— 这正是「DNS 还没指过来」的证据。

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
  projects.html           作品 · 门口只挂两件东西
  about.html              关于 · 一份很长的自白
  sponsor.html            赞助 · 不必赞助，也能用一辈子
  404.html                glitch 404
  CNAME  .nojekyll  robots.txt  sitemap.xml
  assets/
    css/neon.css          唯一全站样式表
    js/site.js            reveal / 滚动 ticker / 抽屉 / 复制
    js/projects.js        渲染置顶两件 + 打开页面时现抓星标/版本
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
