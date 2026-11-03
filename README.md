# 机台本 · iOS 安装包构建仓库

这个仓库里是「机台本」的完整源码，外加快捷构建脚本：**在 GitHub 上点一下，云端 macOS 帮你编译出 `.ipa`**，不需要你有一台 Mac。

---

## 一、把仓库推上去

如果你还没建仓库：

1. 打开 https://github.com/new
2. Repository name 填 `jitaiben`
3. **选 Public**（Public 仓库的 macOS 构建分钟是免费的；Private 会消耗额度）
4. 不要勾 Add a README，直接 Create

然后在**这个文件夹里**依次执行（把 `你的用户名` 换成自己的 GitHub 用户名）：

```
git remote add origin https://github.com/你的用户名/jitaiben.git
git branch -M main
git push -u origin main
```

推上去会要求登录：GitHub 现在不收密码，弹窗里选「Sign in with your browser」，或者用 Personal Access Token 当密码。

---

## 二、等它编译

推上去以后：

1. 打开 `https://github.com/你的用户名/jitaiben/actions`
2. 左边选 **构建 iOS App** → 右边点 **Run workflow** → 再点绿色的 **Run workflow**
3. 等 5～8 分钟。第一次要装 CocoaPods 依赖，会慢一点
4. 绿勾以后，点进这次运行 → 拉到最下面 **Artifacts** → 下载 **jitaiben-ipa**

下载下来是一个 zip，解压就是 `jitaiben.ipa`。

> 这个 ipa 是**未签名**的。未签名的包 iPhone 不会直接装，下一步给它签名。

---

## 三、装到 iPhone 上

免费签名工具用 **Sideloadly**（Windows 能用，不需要 Mac）：

1. 电脑装 iTunes（微软商店版就行）和 [Sideloadly](https://sideloadly.io)
2. iPhone 用数据线连电脑，手机上点「信任此电脑」
3. 打开 Sideloadly，把 `jitaiben.ipa` 拖进去
4. Apple ID 填你自己的（免费账号即可，不需要开发者账号）
5. 点 Start，输入 Apple ID 密码
6. 手机上：设置 → 通用 → VPN 与设备管理 → 信任你的 Apple ID
7. 回桌面，就有「机台本」了

**有效期**：免费 Apple ID 签的 app **7 天后失效**，重新用 Sideloadly 签一次即可，**app 里的数据不会丢**（数据存在 App 沙盒里，重签不覆盖）。

想省掉 7 天续签：加入 Apple Developer Program（99 美元/年），或者用 TestFlight 发给同事。

---

## 四、改东西以后怎么重新出包

改完 `www/` 里的文件，提交推送：

```
git add .
git commit -m "改了点什么"
git push
```

推到 main 会自动触发构建（因为我配了 `paths`，只改 `www/` 才会跑）。也可以在 Actions 页面手动 Run workflow。

---

## 仓库结构

```
www/                     ← 整个 app（改这里）
capacitor.config.json    ← appId / appName / 网页目录
package.json             ← Capacitor 依赖
.github/workflows/ios.yml ← 云端编译脚本
```

`ios/` 目录是 `npx cap add ios` 在云端生成的，不进仓库。

---

## 常见问题

**构建失败，卡在 `pod install`？**
CocoaPods 偶尔抽风，重新 Run 一次通常就好。

**报 `requires a development team`？**
说明 `CODE_SIGNING_ALLOWED=NO` 没生效。检查 workflow 里那四行签名参数是否被改动过。

**能直接上架 App Store 吗？**
不能。这里产出的是未签名包，用于个人安装；上架需要开发者账号、证书、App Store Connect 一整套流程。

**为什么不直接用 PWA？**
也行，而且更简单（见 `安装说明.txt` 里的方式一）。区别是：PWA 需要电脑开着服务、或者有公网托管；`.ipa` 装完是独立的，断网也能用。
