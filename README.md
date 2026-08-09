# 經絡製圖室 Meridian Studio

以 Three.js、Vite 與 Vanilla JavaScript 製作的瀏覽器 3D 經脈編輯器。所有模型與標註只在本機瀏覽器處理。

## 功能

- 載入或拖放 MakeHuman／Blender 匯出的二進位 GLB，並自動置中、縮放
- OrbitControls 旋轉、平移與縮放
- 在網格表面逐點繪製經脈路徑
- 從 `src/data/points-data.json` 穴位目錄搜尋並放置穴位，記錄名稱、國際代碼與側別
- 編輯、刪除、Undo／Redo 及鍵盤快捷鍵
- 依 JSON Schema 驗證、匯入與匯出標註
- GitHub Actions 部署至 GitHub Pages

## 開發

```bash
npm install
npm run dev
```

執行測試與正式建置：

```bash
npm test
npm run build
```

## 操作

1. 按「載入 GLB」或將 `.glb` 拖入畫布；未載入時可使用內建示範人體。
2. 「經脈」工具在人體表面逐點建立路徑，按 Enter 或「完成路徑」完成。
3. 在左側目錄選擇穴位與側別，再用「穴位」工具點擊表面。
4. 從右側物件清單選取標註並修改屬性。Delete 刪除，Ctrl/⌘+Z 復原。
5. 「驗證」檢查目前文件；「匯出」下載可再次匯入的 JSON。

GLB 本身不會嵌入匯出的標註 JSON；再次編輯時應先載入相同模型。模型在載入時會正規化至三個場景單位高，因此標註座標可在同一模型上重現。
