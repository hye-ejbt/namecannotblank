import { useState, useRef, useEffect, useCallback } from "react";

// ── Sample Data ──
const initialData = [
  { key: "1", name: "김철수", age: 32, department: "개발팀", position: "시니어", email: "cs.kim@example.com" },
  { key: "2", name: "이영희", age: 28, department: "디자인팀", position: "주니어", email: "yh.lee@example.com" },
  { key: "3", name: "박민수", age: 35, department: "기획팀", position: "팀장", email: "ms.park@example.com" },
  { key: "4", name: "정수진", age: 30, department: "개발팀", position: "미들", email: "sj.jung@example.com" },
  { key: "5", name: "최동현", age: 27, department: "QA팀", position: "주니어", email: "dh.choi@example.com" },
  { key: "6", name: "한지민", age: 33, department: "디자인팀", position: "시니어", email: "jm.han@example.com" },
  { key: "7", name: "오세훈", age: 29, department: "개발팀", position: "미들", email: "sh.oh@example.com" },
  { key: "8", name: "강예린", age: 31, department: "마케팅팀", position: "팀장", email: "yr.kang@example.com" },
];

// ── Context Menu ──
function ContextMenu({ x, y, onEdit, onCopy, onReset, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      let left = x, top = y;
      if (x + rect.width > window.innerWidth) left = x - rect.width;
      if (y + rect.height > window.innerHeight) top = y - rect.height;
      setPos({ left, top });
    }
  }, [x, y]);

  const items = [
    { icon: "✏️", label: "셀 편집", action: onEdit },
    { icon: "📋", label: "값 복사", action: onCopy },
    { icon: "↩️", label: "초기값 복원", action: onReset },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[180px] rounded-lg overflow-hidden"
      style={{
        left: pos.left,
        top: pos.top,
        background: "rgba(30, 30, 36, 0.96)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <div className="px-3 py-2 text-[11px] tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        셀 작업
      </div>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors duration-100"
          style={{ color: "rgba(255,255,255,0.88)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span className="text-base">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Inline Editor ──
function InlineEditor({ value, onSave, onCancel, cellRect }) {
  const [val, setVal] = useState(value ?? "");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") onSave(val);
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="fixed z-[9998]" style={{ left: cellRect.left - 1, top: cellRect.top - 1, width: cellRect.width + 2, height: cellRect.height + 2 }}>
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onSave(val)}
        className="w-full h-full px-3 text-sm outline-none"
        style={{
          background: "#fffbe6",
          border: "2px solid #faad14",
          borderRadius: 4,
          color: "#1a1a1a",
          boxShadow: "0 0 0 3px rgba(250,173,20,0.15), 0 4px 12px rgba(0,0,0,0.1)",
        }}
      />
    </div>
  );
}

// ── Toast ──
function Toast({ message, visible }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300"
      style={{
        background: "rgba(30,30,36,0.92)",
        color: "#fff",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        opacity: visible ? 1 : 0,
        transform: `translate(-50%, ${visible ? 0 : 12}px)`,
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}

// ── Main App ──
export default function EditableTable() {
  const [data, setData] = useState(initialData);
  const [editHistory, setEditHistory] = useState({});
  const [contextMenu, setContextMenu] = useState(null); // { x, y, rowKey, colKey }
  const [editing, setEditing] = useState(null); // { rowKey, colKey, cellRect }
  const [toast, setToast] = useState({ message: "", visible: false });

  const showToast = useCallback((msg) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 1800);
  }, []);

  // Right-click handler
  const handleContextMenu = useCallback((e, rowKey, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const cell = e.currentTarget;
    setContextMenu({ x: e.clientX, y: e.clientY, rowKey, colKey, cellRect: cell.getBoundingClientRect() });
    setEditing(null);
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  // Edit
  const startEdit = useCallback(() => {
    if (!contextMenu) return;
    setEditing({ rowKey: contextMenu.rowKey, colKey: contextMenu.colKey, cellRect: contextMenu.cellRect });
    setContextMenu(null);
  }, [contextMenu]);

  const saveEdit = useCallback(
    (newVal) => {
      if (!editing) return;
      const { rowKey, colKey } = editing;
      setData((prev) =>
        prev.map((row) => {
          if (row.key !== rowKey) return row;
          const histKey = `${rowKey}-${colKey}`;
          if (!editHistory[histKey]) {
            setEditHistory((h) => ({ ...h, [histKey]: row[colKey] }));
          }
          return { ...row, [colKey]: colKey === "age" ? Number(newVal) || newVal : newVal };
        })
      );
      setEditing(null);
      showToast("✓ 셀이 수정되었습니다");
    },
    [editing, editHistory, showToast]
  );

  // Copy
  const copyValue = useCallback(() => {
    if (!contextMenu) return;
    const row = data.find((r) => r.key === contextMenu.rowKey);
    if (row) {
      navigator.clipboard?.writeText(String(row[contextMenu.colKey])).catch(() => {});
      showToast("📋 클립보드에 복사됨");
    }
    setContextMenu(null);
  }, [contextMenu, data, showToast]);

  // Reset
  const resetValue = useCallback(() => {
    if (!contextMenu) return;
    const histKey = `${contextMenu.rowKey}-${contextMenu.colKey}`;
    const original = editHistory[histKey];
    if (original !== undefined) {
      setData((prev) =>
        prev.map((row) => (row.key === contextMenu.rowKey ? { ...row, [contextMenu.colKey]: original } : row))
      );
      setEditHistory((h) => {
        const next = { ...h };
        delete next[histKey];
        return next;
      });
      showToast("↩️ 초기값으로 복원됨");
    } else {
      showToast("변경 이력 없음");
    }
    setContextMenu(null);
  }, [contextMenu, editHistory, showToast]);

  // Column definitions
  const columns = [
    { key: "name", title: "이름", width: "15%" },
    { key: "age", title: "나이", width: "10%" },
    { key: "department", title: "부서", width: "20%" },
    { key: "position", title: "직급", width: "15%" },
    { key: "email", title: "이메일", width: "40%" },
  ];

  const isEdited = (rowKey, colKey) => editHistory[`${rowKey}-${colKey}`] !== undefined;

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)", fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#1a1a2e", letterSpacing: "-0.02em" }}>
            직원 관리 테이블
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#6b7280" }}>
            셀을 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: "rgba(0,0,0,0.06)" }}>우클릭</span> 하여 편집할 수 있습니다
          </p>
        </div>

        {/* Table Card */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.05)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: "#fafbfc", borderBottom: "2px solid #e5e7eb" }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider select-none"
                    style={{ color: "#6b7280", width: col.width }}
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIdx) => (
                <tr
                  key={row.key}
                  className="transition-colors duration-100"
                  style={{ borderBottom: "1px solid #f0f0f0" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {columns.map((col) => {
                    const edited = isEdited(row.key, col.key);
                    const isCurrentlyEditing = editing?.rowKey === row.key && editing?.colKey === col.key;

                    return (
                      <td
                        key={col.key}
                        className="px-4 py-3 text-sm cursor-context-menu select-none relative"
                        style={{
                          color: edited ? "#d97706" : "#1f2937",
                          fontWeight: edited ? 500 : 400,
                          background: isCurrentlyEditing ? "rgba(250,173,20,0.06)" : undefined,
                        }}
                        onContextMenu={(e) => handleContextMenu(e, row.key, col.key)}
                      >
                        <span className="flex items-center gap-1.5">
                          {String(row[col.key])}
                          {edited && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: "#f59e0b" }}
                              title={`원래 값: ${editHistory[`${row.key}-${col.key}`]}`}
                            />
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edit count badge */}
        {Object.keys(editHistory).length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs" style={{ color: "#6b7280" }}>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.1)", color: "#d97706" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />
              {Object.keys(editHistory).length}개 셀 수정됨
            </span>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={startEdit}
          onCopy={copyValue}
          onReset={resetValue}
          onClose={closeMenu}
        />
      )}

      {/* Inline Editor */}
      {editing && (
        <InlineEditor
          value={String(data.find((r) => r.key === editing.rowKey)?.[editing.colKey] ?? "")}
          cellRect={editing.cellRect}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Toast */}
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
