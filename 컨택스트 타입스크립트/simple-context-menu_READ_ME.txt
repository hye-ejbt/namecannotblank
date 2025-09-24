import { SimpleContextMenu, MenuItem } from "./simple-context-menu";

// 메뉴 DOM 컨테이너
const ctxEl = document.getElementById("ctx")!;
const menu = new SimpleContextMenu<{ name: string }>(ctxEl);

const items: (MenuItem<{ name: string }> | "sep")[] = [
  { id: "open", label: "열기", action: (c) => console.log("열기", c) },
  {
    id: "new",
    label: "새로 만들기",
    children: [
      { id: "file", label: "파일", action: (c) => console.log("파일", c) },
      { id: "folder", label: "폴더", action: (c) => console.log("폴더", c) },
      "sep",
      {
        id: "tpl",
        label: "템플릿",
        children: [
          { id: "doc", label: "문서", action: (c) => console.log("문서", c) },
          { id: "sheet", label: "시트", action: (c) => console.log("시트", c) },
        ],
      },
    ],
  },
  "sep",
  { id: "delete", label: "삭제", action: (c) => console.log("삭제", c) },
];

menu.setItems(items);

// 타깃 요소에서 열기
const target = document.getElementById("target")!;
target.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  menu.open(e.clientX, e.clientY, { name: "demo" });
});
target.addEventListener("keydown", (e) => {
  if (e.shiftKey && e.key === "F10") {
    const r = target.getBoundingClientRect();
    menu.open(r.left + 12, r.top + 12, { name: "demo" });
  }
});
