#!/bin/bash

# ToolsBox 构建产物验证脚本
# 用于验证构建产物是否完整

set -e

BUILD_DIR="build/toolsbox"
ERRORS=0

echo "=== ToolsBox 构建产物验证 ==="
echo ""

# 检查必需文件
echo "检查必需文件..."
REQUIRED_FILES=(
    "manifest.json"
    "bootstrap.js"
    "prefs.js"
    "content/scripts/toolsbox.js"
    "content/preferences.xhtml"
    "content/preferences.js"
    "locale/en-US/main.ftl"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$BUILD_DIR/$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file (缺失)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "检查 manifest.json..."

# 验证 manifest.json
if command -v jq &> /dev/null; then
    NAME=$(jq -r '.name' "$BUILD_DIR/manifest.json")
    VERSION=$(jq -r '.version' "$BUILD_DIR/manifest.json")
    ID=$(jq -r '.applications.zotero.id' "$BUILD_DIR/manifest.json")
    
    echo "  名称: $NAME"
    echo "  版本: $VERSION"
    echo "  ID: $ID"
    
    if [ "$NAME" = "ToolsBox" ] && [ "$VERSION" = "0.1.0" ]; then
        echo "✅ manifest.json 有效"
    else
        echo "❌ manifest.json 内容不符合预期"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "⚠️  jq 未安装,跳过 manifest.json 验证"
fi

echo ""
echo "检查构建大小..."

# 检查构建产物大小
BUNDLE_SIZE=$(wc -c < "$BUILD_DIR/content/scripts/toolsbox.js" 2>/dev/null || echo "0")
echo "  Bundle 大小: $BUNDLE_SIZE bytes"

if [ "$BUNDLE_SIZE" -gt 100000 ]; then
    echo "✅ Bundle 大小正常 (>100KB)"
else
    echo "⚠️  Bundle 可能不完整 (<100KB)"
fi

echo ""
echo "检查 FTL locale..."

# 检查 locale 文件
for locale in "en-US" "zh-CN" "zh-TW"; do
    if [ -f "$BUILD_DIR/locale/$locale/main.ftl" ]; then
        LINES=$(wc -l < "$BUILD_DIR/locale/$locale/main.ftl")
        echo "✅ locale/$locale/main.ftl ($LINES lines)"
    else
        echo "❌ locale/$locale/main.ftl 缺失"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "=== 验证结果 ==="

if [ "$ERRORS" -eq 0 ]; then
    echo "✅ 所有检查通过!"
    echo ""
    echo "构建产物可以安装到 Zotero 7:"
    echo "  1. 打开 Zotero 7"
    echo "  2. Tools → Developer → Run JavaScript"
    echo "  3. 执行: Zotero.AddonManager.installAddonFromPath('$(pwd)/$BUILD_DIR')"
    exit 0
else
    echo "❌ 发现 $ERRORS 个错误"
    exit 1
fi
