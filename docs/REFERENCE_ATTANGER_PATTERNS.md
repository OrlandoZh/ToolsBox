# REFERENCE_ATTANGER_PATTERNS.md

> 参考来源：`reference/plugin/zotero-attanger-main/`（zotero-attanger，作者 MuiseDestiny）
> 用途：Zotero 附件文件管理（重命名、移动、自动识别）的架构模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：attanger 源码](../reference/plugin/zotero-attanger-main/)

## 1. 核心架构概览

attanger 是一个附件管理插件，核心职责是：**源目录到目标目录的路径映射、按 Zotero 内置规则重命名文件、链接附件的自动移动、附件导入时自动识别文献元数据**。

与 duplicate workflow 关注**条目元数据合并**不同，attanger 关注的是**附件文件层面的操作**（移动、重命名、识别）。两者都基于 notifier 监控，但事件类型和处理管线完全不同。

### 1.1 源码文件索引

| 文件 | 职责 | 说明 |
|---|---|---|
| `src/index.ts` | 入口引导 | 全局 `addon`/`ztoolkit` 对象注入 |
| `src/addon.ts` | 插件实例类 | 生命周期数据、图标注册、ztoolkit 初始化 |
| `src/hooks.ts` | 生命周期钩子 | `onStartup`/`onShutdown`/`onMainWindowLoad`/`onPrefsEvent` |
| `src/modules/menu.ts` | 核心业务逻辑 |  notifier 注册、菜单、重命名、移动、匹配、快捷键（~1345 行） |
| `src/modules/preferenceScript.ts` | 偏好设置脚本 | 目录选择器、快捷键录入、UI 联动 |
| `src/utils/prefs.ts` | 偏好读写封装 | `getPref`/`setPref`/`clearPref` 包装 |
| `src/utils/shortcut.ts` | 快捷键注册 | `registerShortcut` + `listenShortcut` |
| `src/utils/locale.ts` | 国际化 | `getString` 封装 |
| `src/utils/wait.ts` | 等待工具 | `waitUntil`/`waitUtilAsync` 轮询 |
| `src/utils/window.ts` | 窗口工具 | 窗口辅助 |
| `src/utils/ztoolkit.ts` | ztoolkit 初始化 | `createZToolkit` + 图标/日志配置 |

源码文件总计 **11 个 TS 文件**（含 `typings/global.d.ts` 则 12 个）。

### 1.2 数据流概览

```
Notifier ("item" + "add")
  -> 判断是否导入附件 / 是否顶层常规条目
  -> Zotero.RecognizeDocument.recognizeItems()（自动识别）
  -> checkFileType()（过滤可处理类型）
  -> isFilenameMatched("filenameSkipAutoMoveRenameRules")（跳过规则）
  -> renameFile()（Zotero 内置重命名规则）
  -> moveFile()（链接附件：源目录 -> 目标目录 + 子路径）
  -> showAttachmentItem()（ProgressWindow 通知）
```

## 2. Notifier 监控模式

### 2.1 注册方式

```typescript
registerNotify(["item"],
  async (event, type, ids, extraData) => {
    if (type == "item" && event == "add") {
      window.setTimeout(async () => {
        const items = Zotero.Items.get(ids as number[]);
        // ... 处理逻辑
      });
    }
  }
);
```

使用 `window.setTimeout` 包裹异步处理，避免阻塞 notifier 回调主线程。

### 2.2 附件类型分支

```typescript
for (const item of items) {
  // 分支1：导入附件 -> 自动识别
  if (item.isImportedAttachment() && (await item.fileExists())) {
    await Zotero.RecognizeDocument.recognizeItems([item]);
    attItems.push(item);
  }
  // 分支2：顶层常规条目 -> 等待1秒，收集其子附件
  if (item.isTopLevelItem() && item.isRegularItem()) {
    await Zotero.Promise.delay(1000);
    for (const id of item.getAttachments()) {
      attItems.push(Zotero.Items.get(id));
    }
  }
}
```

两个分支分别处理：
- **直接拖入/导入的附件**：立即触发文献识别
- **通过条目新增操作间接触发的附件**：延迟等待后收集子附件

### 2.3 Notifier 生命周期管理

```typescript
export function registerNotify(types, onNotify) {
  const callback = {
    notify: async (...data) => {
      if (!addon?.data.alive) {
        unregisterNotify(notifyID);
        return;
      }
      onNotify(...data);
    },
  };
  const notifyID = Zotero.Notifier.registerObserver(callback, types);
  window.addEventListener("unload", () => unregisterNotify(notifyID), false);
}
```

关键设计：
- `addon.data.alive` 守卫：插件卸载后自动停止回调
- `window.addEventListener("unload")` 兜底注销
- 双保险确保 notifier 不泄漏

## 3. 文件操作管线

### 3.1 文件类型过滤

```typescript
function checkFileType(attItem: Zotero.Item) {
  const fileTypes = getPref("fileTypes") as string;
  if (!fileTypes) return true;  // 未配置则处理所有类型
  const pos = attItem.attachmentFilename.lastIndexOf(".");
  const fileType = pos == -1 ? "" : attItem.attachmentFilename.substring(pos + 1).toLowerCase();
  const regex = fileTypes.toLowerCase().replace(/,/gi, "|");
  return fileType.search(new RegExp(regex)) >= 0;
}
```

偏好驱动的白名单机制，逗号分隔扩展名列表（如 `pdf,epub,caj`）。

### 3.2 跳过规则匹配

```typescript
function getRuleList(prefName: string) {
  return (getPref(prefName) as string || "").split(/,\s*/).filter(Boolean);
}

function isFilenameMatched(prefName: string, filenameNoExt: string | null) {
  if (!filenameNoExt) return false;
  const rules = getRuleList(prefName);
  if (rules.length === 0) return false;
  return rules.some((rule: string) => (new RegExp(rule)).test(filenameNoExt));
}
```

两套跳过规则：
- `filenameSkipAutoMoveRenameRules`：跳过重命名+移动
- `filenameSkipRenameRules`：仅跳过重命名

使用正则表达式匹配（非简单的 `string-comparison` 模糊匹配，实际实现为 RegExp）。

### 3.3 renameFile() —— Zotero 内置规则重命名

```typescript
async function renameFile(attItem: Zotero.Item, retry = 0) {
  if (!checkFileType(attItem)) return;
  const file = (await attItem.getFilePathAsync()) as string;
  const parentItemID = attItem.parentItemID as number;
  if (!parentItemID) { return attItem; }  // 无父元素不重命名

  const parentItem = await Zotero.Items.getAsync(parentItemID);
  // 使用 Zotero 官方的文件命名规则
  let newName = Zotero.Attachments.getFileBaseNameFromItem(parentItem, {
    attachmentTitle: attItem.getField("title") as string
  });

  // 附加扩展名
  const origFilename = PathUtils.split(file).pop() as string;
  const ext = origFilename.match(filenameExtRE);
  if (ext) { newName = newName + ext[0]; }

  // 跳过规则检查
  const origFilenameNoExt = origFilename.replace(filenameExtRE, "");
  if (isFilenameMatched("filenameSkipRenameRules", origFilenameNoExt)) {
    return attItem;
  }
  // 前缀模式：原文件名作为前缀保留
  if (isFilenameMatched("filenameAsPrefixRules", origFilenameNoExt)) {
    newName = origFilenameNoExt + "_" + newName;
  }

  // 执行重命名（带重试）
  const renamed = await attItem.renameAttachmentFile(newName, false, true);
  if (renamed !== true) {
    await Zotero.Promise.delay(3e3);
    if (retry < 5) {
      return await renameFile(attItem, retry + 1);
    }
  }

  // 同步更新附件标题
  const origTitle = attItem.getField("title") as string;
  if (origTitle === origFilename || origTitle === origFilenameNoExt) {
    attItem.setField("title", newName);
  }
  await attItem.saveTx();
}
```

关键设计点：
- **依赖 Zotero 官方 `getFileBaseNameFromItem`**：不自己拼接命名规则
- **带重试机制**：文件被占用时延迟 3 秒重试，最多 5 次
- **标题同步**：当原标题等于原文件名时，同步更新标题
- **前缀保留**：`filenameAsPrefixRules` 允许将原文件名作为前缀保留

### 3.4 moveFile() —— 链接附件的源到目标移动

```typescript
export async function moveFile(attItem: any) {
  const attachType = getPref("attachType");
  if (attachType != "linking") { return; }  // 仅处理链接附件
  if (!checkFileType(attItem)) { return; }

  let destDir = await checkDir("destDir", "destination directory");
  if (!destDir) return;

  // 计算子路径（支持 subfolderFormat 变量替换）
  const subfolder = getSubfolderPath(attItem.topLevelItem);
  if (subfolder.length > 0) {
    destDir = PathUtils.joinRelative(destDir, subfolder);
  }

  const sourcePath = (await attItem.getFilePathAsync()) as string;
  if (!sourcePath) return;
  const filename = PathUtils.filename(sourcePath);
  let destPath = PathUtils.joinRelative(destDir, filename);
  if (sourcePath == destPath) return;

  // 目标文件已存在 -> MD5 比较 -> 冲突处理
  if (await IOUtils.exists(destPath)) {
    if (file2md5(sourcePath) != file2md5(destPath)) {
      // 不同文件 -> 自动添加数字后缀
      destPath = await addSuffixToFilename(destPath);
    } else {
      // 同一文件 -> 提示跳过
      return;
    }
  }

  // 创建目标目录结构
  if (!(await IOUtils.exists(destDir))) {
    // 从最深的父目录开始向上创建
    const create = [destDir];
    let parent = PathUtils.parent(destDir);
    while (parent && !(await IOUtils.exists(parent))) {
      create.push(parent);
      parent = PathUtils.parent(parent);
    }
    await Promise.all(
      create.reverse().map(async (f) => await Zotero.File.createDirectoryIfMissingAsync(f))
    );
  }

  // 移动文件
  await IOUtils.move(sourcePath, destPath);

  // 更新 Zotero 链接
  const json = attItem.toJSON();
  json.linkMode = "linked_file";
  json.path = destPath;
  delete json.filename;
  const newAttItem = new Zotero.Item("attachment");
  newAttItem.libraryID = attItem.libraryID;
  newAttItem.fromJSON(json);
  await newAttItem.saveTx();

  // 异步迁移子项后删除旧条目
  window.setTimeout(async () => {
    await transferItem(attItem, newAttItem);
    removeEmptyFolder(PathUtils.parent(sourcePath) as string);
    await attItem.eraseTx();
  });
  return newAttItem;
}
```

关键设计点：
- **仅处理链接附件**（`attachType == "linking"`），存储附件不由此管线处理
- **MD5 冲突检测**：目标已存在时用 MD5 判断是否同一文件
- **子目录支持**：`subfolderFormat` 支持 `{{collection}}` 等变量构建多级目录
- **原子性**：先创建新附件条目，再异步迁移子项（标注、笔记、标签），最后删除旧条目
- **空目录清理**：移动后递归清理空文件夹

### 3.5 transferItem() —— 附件迁移

```typescript
async function transferItem(originalItem: Zotero.Item, targetItem: Zotero.Item) {
  // 迁移子项（标注、笔记等）
  await Zotero.DB.executeTransaction(async function () {
    await Zotero.Items.moveChildItems(originalItem, targetItem);
  });
  // 迁移关系
  await Zotero.Relations.copyObjectSubjectRelations(originalItem, targetItem);
  // 迁移全文索引
  await Zotero.DB.executeTransaction(async function () {
    await Zotero.Fulltext.transferItemIndex(originalItem, targetItem);
  });
  // 迁移标签
  targetItem.setTags(originalItem.getTags());
  // 迁移笔记内容
  targetItem.setNote(originalItem.getNote());
  await targetItem.saveTx();
}
```

文件移动后，旧附件条目被删除、新条目被创建。此函数确保所有关联数据（标注、关系、索引、标签、笔记）正确迁移到新条目。

## 4. 自动识别模式

### 4.1 RecognizeDocument 集成

```typescript
if (item.isImportedAttachment() && (await item.fileExists())) {
  await Zotero.RecognizeDocument.recognizeItems([item]);
}
```

当附件通过导入方式添加且文件存在时，自动调用 Zotero 的 `RecognizeDocument` 进行文献元数据识别。这是 Zotero 7 内置的 PDF 元数据提取功能。

### 4.2 附加新文件后自动识别

```typescript
const attItem = await Zotero.Attachments.importFromFile({ file: path, ...options });
showAttachmentItem(attItem);
if (!attItem.parentItemID) {
  Zotero.RecognizeDocument.recognizeItems([attItem]);
}
```

通过"附加新文件"操作导入的顶层附件（无父条目），自动触发识别。有父条目的附件（已关联到文献条目）不需要此步骤。

## 5. 子目录路径构建

### 5.1 subfolderFormat 变量替换

```typescript
export function getSubfolderPath(item: Zotero.Item) {
  let subfolder = "";
  const subfolderFormat = getPref("subfolderFormat") as string;
  if (subfolderFormat.length > 0) {
    subfolder = subfolderFormat
      .split(/(?<=\}\})\/(?=\{\{)/)  // 按 {{...}}/{{...}} 分割，保留变量标记
      .map((formatString: string) => {
        if (formatString == "{{collection}}") {
          return getCollectionPathsOfItem(item);
        } else {
          return getValidFolderName(
            Zotero.Attachments.getFileBaseNameFromItem(item, formatString)
          );
        }
      })
      .join(addon.data.folderSep);  // Windows: \, macOS/Linux: /
  }
  return subfolder;
}
```

支持 `{{...}}` 格式的变量模板，按 `/` 分割（但不在变量内部切割）。特殊变量 `{{collection}}` 直接使用分类路径。

### 5.2 Collection 路径选择守卫

```typescript
let selectedCollection: Zotero.Collection | undefined;  // 模块级变量

function getCollectionPathsOfItem(item: Zotero.Item) {
  const itemCollections = item.getCollections().map(getCollectionPath);
  if (selectedCollection) {
    // 如果用户在操作前选中了某个分类，优先使用分类路径
    const preferredCollection = [selectedCollection.id].map(getCollectionPath)[0];
    const isExist = itemCollections.find(i => i == preferredCollection);
    if (isExist) { return preferredCollection; }
  } else {
    return itemCollections[0];
  }
  // 降级：如果条目不属于选中的分类，返回第一个分类路径
}
```

**关键设计**：`selectedCollection` 在菜单操作前捕获（`selectedCollection = ZoteroPane.getSelectedCollection()`），用于防止异步移动过程中因分类切换导致的路径计算错误。

### 5.3 文件夹名合法性清理

```typescript
function getValidFolderName(folderName: string): string {
  folderName = folderName.replace(/[\/\\:*?"<>|]/g, "");  // 非法字符
  folderName = folderName.replace(/[\r\n\t]+/g, " ");      // 换行/制表符
  folderName = folderName.replace(/[\u2000-\u200A]/g, " "); // 各种空格
  folderName = folderName.replace(/[\u200B-\u200E]/g, "");  // 零宽字符
  folderName = folderName.normalize();                       // NFC 规范化
  folderName = folderName.replace(/[\u2068\u2069]/g, "");   // 双向隔离符
  folderName = folderName.replace(/^\./, "");               // 隐藏文件
  if (!folderName || folderName == "." || folderName == "..") {
    folderName = "_";
  }
  return folderName;
}
```

修改自 Zotero 官方的 `File.getValidFileName`，确保文件夹名在目标 OS 上合法。

## 6. 匹配附件模式

### 6.1 模糊匹配（matchAttachment）

```typescript
async function matchAttachment() {
  // 1. 获取选中的条目（按标题长度排序，短的优先）
  const items = ZoteroPane.getSelectedItems()
    .filter((i) => i.isTopLevelItem() && i.isRegularItem())
    .sort((a, b) => getPlainTitle(a).length - getPlainTitle(b).length);

  // 2. 扫描源目录中的 PDF/CAJ 文件
  const sourceDir = await checkDir("sourceDir", "source path");
  let files: OS.File.Entry[] = [];
  await Zotero.File.iterateDirectory(sourceDir, async function (child) {
    if (!child.isDir && /\.(caj|pdf)$/i.test(child.name)) {
      files.push(child);
    }
  });

  // 3. 可选：从 PDF 元数据/最大字体文本提取标题
  const readPDFTitle = getPref("readPDFtitle") as string;
  for (const item of items) {
    const itemtitle = getPlainTitle(item);
    let iniDistance = Infinity;
    let matchedFile: OS.File.Entry | undefined = undefined;

    for (const file of files) {
      let filename = file.name.replace(/\..+?$/, "");
      // 尝试读取 PDF 元数据...
      const distance = comparison.metricLcs.distance(
        itemtitle.toLowerCase(), filename.toLowerCase()
      );
      if (distance <= iniDistance) {
        iniDistance = distance;
        matchedFile = file;
      }
    }

    // 4. 匹配成功 -> 导入 -> 识别 -> 删除源文件
    if (matchedFile) {
      const attItem = await Zotero.Attachments.importFromFile({
        file: matchedFile.path, libraryID: item.libraryID, parentItemID: item.id,
      });
      showAttachmentItem(attItem);
      if (!attItem.parentItemID) {
        Zotero.RecognizeDocument.recognizeItems([attItem]);
      }
      removeFile(matchedFile.path);
      files = files.filter((file) => file !== matchedFile);  // 防止重复匹配
    }
  }
}
```

使用 `string-comparison` 库的 `metricLcs`（最长公共子序列距离）进行标题到文件名的模糊匹配。

### 6.2 精确匹配（matchAttangerAttachment）

```typescript
async function matchAttangerAttachment() {
  // 基于附件已有的 baseName（由 attanger 生成规则）直接定位文件
  const attachmentBaseName = Zotero.Attachments.getFileBaseNameFromItem(item);
  for (const ext of fileTypeList) {
    const fullpath = PathUtils.joinRelative(realRoot, `${attachmentBaseName}.${ext}`);
    if (file.exists() && !existAttachments.includes(basename)) {
      const attItem = await Zotero.Attachments.importFromFile({ ... });
    }
  }
}
```

基于 attanger 自身的命名规则进行精确匹配，不依赖模糊比较。

## 7. UI 模式

### 7.1 右键菜单注册

```typescript
ztoolkit.Menu.register("item", {
  tag: "menu",
  id: "attanger-menu",
  label: "Attanger",
  icon: addon.data.icons.favicon,
  children: [
    {
      tag: "menuitem",
      label: getString("attach-new-file"),
      icon: addon.data.icons.attachNewFile,
      getVisibility: () => {
        const items = ZoteroPane.getSelectedItems();
        return items.length == 1 && items[0].isTopLevelItem() && items[0].isRegularItem();
      },
      commandListener: async () => { await attachNewFileCallback(); },
    },
    // ... 更多菜单项
  ]
});
```

使用 `getVisibility` 动态控制菜单项可见性，根据当前选中项的类型和数量。

### 7.2 动态子菜单（打开方式）

```typescript
const fileHandlerArr = JSON.parse(
  (Zotero.Prefs.get(`${config.addonRef}.openUsing`) as string) || "[]"
);

ztoolkit.Menu.register("item", {
  tag: "menu",
  getVisibility: () => getAttachmentItems(false).length > 0,
  label: getString("open-using"),
  children: [
    { tag: "menuitem", label: "Zotero", commandListener: () => openUsing("", "pdf") },
    { tag: "menuitem", label: "System", commandListener: () => openUsing("system", "pdf") },
    ...fileHandlerArr.map((fileHandler) => ({
      tag: "menuitem",
      label: fileHandler.split(/(?:\\|\/)/).slice(-1)[0],
      commandListener: async (ev: MouseEvent) => {
        if (ev.button == 2) { /* 右键删除 */ }
        else { openUsing(fileHandler, "pdf"); }
      },
    })),
    { tag: "menuitem", label: getString("choose-other-app"), /* 选择应用 */ },
  ]
});
```

用户可自定义文件打开程序，右键菜单项可删除（右键点击触发删除）。

### 7.3 ProgressWindow 通知

```typescript
function showAttachmentItem(attItem: Zotero.Item) {
  const popupWin = new ztoolkit.ProgressWindow("Attanger", {
    closeTime: -1,
    closeOtherProgressWindows: true,
  });

  // 显示父条目
  if (attItem && attItem.isTopLevelItem()) {
    popupWin.createLine({
      text: ZoteroPane.getSelectedCollection().name,
      icon: addon.data.icons.collection,
    }).show();
  } else {
    popupWin.createLine({
      text: attItem.parentItem.getField("title"),
      icon: attItem.parentItem.getImageSrc(),
    }).show();
  }

  // 显示附件信息
  popupWin.createLine({
    text: attItem.getField("title"),
    icon: attItem.getImageSrc().replace("pdflink", "pdf-link"),
  });

  // 等待 DOM 渲染后调整样式
  waitUntil(() => lines?.[1]?._hbox, () => {
    hbox.style.opacity = "1";
    hbox.style.marginLeft = "2em";
  }, 10);
  popupWin.startCloseTimer(3000);
}
```

使用 `waitUntil` 等待 ProgressWindow 的 DOM 元素渲染后再修改样式，避免 `undefined` 访问。

### 7.4 偏好设置 UI

```typescript
// 目录选择器：FilePicker
doc.querySelector("#choose-source-dir")?.addEventListener("command", async () => {
  const fp = new window.FilePicker();
  fp.init(window, "Select Source Directory", fp.modeGetFolder);
  if ((await fp.show()) != fp.returnOK) return;
  setPref("sourceDir", PathUtils.normalize(fp.file));
});

// 快捷键录入
doc.querySelectorAll(".shortcut").forEach((inputNode: HTMLInputElement) => {
  listenShortcut(inputNode, (shortcut: string) => {
    Zotero.Prefs.set(inputNode.getAttribute("preference"), shortcut, true);
  });
});
```

### 7.5 快捷键注册

```typescript
export function registerShortcut(value: string, callback: Function, type: "prefKey" | "key" = "prefKey") {
  let shortcutString = (type == "prefKey"
    ? Zotero.Prefs.get(`${config.addonRef}.${value}`) as string
    : value
  ).replace(/\s\+\s/g, ",").toLowerCase();
  shortcutString = shortcutString.replace("ctrl", "control");

  ztoolkit.Keyboard.register(async (ev, options) => {
    const _shortcutString = shortcutString.slice(0, -1) + shortcutString.slice(-1)[0].toUpperCase();
    if (options.keyboard?.equals(shortcutString) || options.keyboard?.equals(_shortcutString)) {
      callback();
    }
  });
}
```

从偏好读取快捷键字符串，转换为 `ztoolkit.Keyboard` 的格式，注册全局键盘监听。

## 8. 插件生命周期

```
onStartup()
  -> 等待 Zotero 初始化完成 (initializationPromise + unlockPromise + uiReadyPromise)
  -> initLocale()
  -> Zotero.PreferencePanes.register()（注册偏好面板）
  -> onMainWindowLoad()
     -> createZToolkit()
     -> new Menu()  // 注册 notifier + 菜单 + 快捷键

onShutdown()
  -> ztoolkit.unregisterAll()
  -> 关闭对话框窗口
  -> Zotero.Notifier.unregisterObserver(notifierID)
  -> addon.data.alive = false
  -> delete Zotero[config.addonInstance]
```

## 9. 与 REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md 对比

| 维度 | attanger | duplicate workflow (zoplicate) |
|---|---|---|
| **核心关注** | 附件文件操作（移动/重命名/识别） | 条目元数据合并（去重/合并） |
| **Notifier 事件** | `item` + `add` | 不依赖 notifier，手动触发 |
| **匹配策略** | 文件名模糊匹配（metricLcs）+ 精确匹配 | 6 阶段级联消除（dc:replaces → DOI → ISBN → 标题 → 作者 → 年份） |
| **批量操作** | 遍历选中条目逐个处理 | 暂停/恢复/回退状态机 |
| **冲突处理** | MD5 比较 + 数字后缀 | Master 选择策略（4 种） |
| **数据迁移** | transferItem（标注/关系/索引/标签/笔记） | Zotero.Items.merge（宿主内置） |
| **自动化程度** | notifier 自动触发 + 偏好驱动 | 手动触发 |
| **文件操作** | IOUtils.move/rename、路径映射 | 无（不操作文件系统） |

## 10. 可借鉴的架构模式

### 10.1 可借鉴的模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **Notifier + setTimeout 异步管线** | 需要监听 Zotero 事件且不阻塞主线程 | 低 —— `window.setTimeout` 包裹异步函数即可 |
| **偏好驱动的自动化控制** | 通过偏好开关控制自动/手动模式 | 低 —— `getPref` 判断即可 |
| **跳过规则（Regex 列表）** | 需要排除特定文件名的场景 | 低 —— 逗号分隔的正则列表 + `some()` 遍历 |
| **Source → Target 路径映射** | 链接附件管理、文件归档管线 | 中 —— 需要处理子目录变量替换 |
| **Collection 选择守卫** | 异步操作中防止分类切换导致的路径错乱 | 低 —— 模块级变量捕获操作前状态 |
| **文件 MD5 冲突检测 + 数字后缀** | 目标目录已存在同名文件的场景 | 低 —— MD5 比较 + 自增后缀 |
| **transferItem 数据迁移** | 替换附件条目后保留所有关联数据 | 中 —— 涉及多个宿主 API 组合 |
| **ProgressWindow + waitUntil DOM 等待** | 需要等待异步渲染后再修改 UI 样式 | 低 —— `waitUntil` 轮询即可 |
| **自动 RecognizeDocument** | 导入附件时自动提取元数据 | 低 —— 一行 `Zotero.RecognizeDocument.recognizeItems()` |
| **空目录递归清理** | 文件移动后清理残留空文件夹 | 低 —— 递归检查 + `nsIFile.remove()` |
| **subfolderFormat 变量模板** | 支持用户自定义目录结构 | 中 —— 需要解析 `{{...}}` 模板 |
| **动态菜单可见性** | 根据选中项类型动态显示/隐藏菜单 | 低 —— `getVisibility` 回调即可 |
| **打开方式动态子菜单** | 用户可自定义文件打开程序 | 低 —— JSON 存储路径 + 右键删除 |

### 10.2 与当前模板的结合点

- 如果模板需要**附件自动化管理**（导入后自动重命名、移动到指定目录），可直接复用 notifier + renameFile + moveFile 管线
- 如果模板需要**文件匹配导入**（根据文献标题在目录中查找对应 PDF），可复用 `matchAttachment` 的模糊匹配逻辑
- 如果模板需要**用户可配置的目录结构**，可复用 `subfolderFormat` 变量模板系统
- 如果模板需要**快捷键自定义**，可复用 `registerShortcut` + `listenShortcut` 模式

## 11. 不可直接搬运的部分

| 内容 | 原因 | 处理方式 |
|---|---|---|
| `Zotero.RecognizeDocument.recognizeItems()` | Zotero 7 内置 API | 仅在确认目标 Zotero 版本支持时使用 |
| `ztoolkit.ProgressWindow` / `ztoolkit.Menu` / `ztoolkit.Keyboard` | 依赖 zotero-plugin-toolkit | 替换为模板自己的 UI 方案 |
| `IOUtils.move` / `IOUtils.exists` | Zotero 7 新版 IO API | 按目标 Zotero 版本选择 `IOUtils` 或 `OS.File` |
| `PathUtils.joinRelative` / `PathUtils.split` | Zotero 7 新版 Path API | 按宿主版本选择正确的路径 API |
| `attItem.renameAttachmentFile()` | Zotero 宿主附件 API | 只在确认宿主 API 存在时使用 |
| `string-comparison` 库 | 外部 npm 依赖 | 可选择保留或替换为其他字符串比较方案 |
| PDF 元数据提取（`getPDFData`） | 依赖 `Zotero.PDFWorker` 内部方法 | 非核心功能，可按需裁剪 |
| `openUsing` 文件处理器管理 | 涉及 `fileHandler.*` 偏好和 `ZoteroPane.viewAttachment` | 属于独立功能模块，可按需移植 |
| `removeEmptyFolder` 中的 `nsIFile` 迭代 | 依赖 XPCOM `nsIFile` API | 可改用 `IOUtils` 或 `OS.File` 的现代 API |

## 12. 源文件统计

| 类别 | 数量 |
|---|---|
| TypeScript 源文件 | 11 |
| 核心业务文件 | 1（`modules/menu.ts`，约 1345 行） |
| 辅助工具文件 | 6（prefs、shortcut、locale、wait、window、ztoolkit） |
| 生命周期文件 | 2（hooks.ts、addon.ts） |
| 入口文件 | 1（index.ts） |
| 类型声明 | 1（typings/global.d.ts） |
