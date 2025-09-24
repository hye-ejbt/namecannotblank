// simple-context-menu.ts

/** 메뉴 컨텍스트 타입(원하는 구조로 제네릭 지정 가능) */
export type Ctx = Record<string, unknown>;

/** 메뉴 항목 인터페이스 */
export interface MenuItem<TCtx = Ctx> {
  id?: string;
  label?: string;
  icon?: string;            // 간단히 텍스트/이모지로 표기. 필요 시 SVG 문자열로도 사용 가능
  accel?: string;
  disabled?: boolean | ((ctx: TCtx) => boolean);
  action?: (ctx: TCtx) => void;
  children?: (MenuItem<TCtx> | "sep")[];
}

/** 엘리먼트 생성 유틸 */
type Attrs<T extends HTMLElement> = Partial<{
  // 표준 속성
  class: string;
  role: string;
  tabindex: string | number;
  "aria-disabled": string;
  "aria-expanded": string;
  "data-has-sub": string;
  text: string;
  innerHTML: string;
  // 위치
  style: string;
  // 이벤트
  onclick: (e: MouseEvent) => void;
  onpointerdown: (e: PointerEvent) => void;
}> & Record<string, string | number | ((e: Event) => void)>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs<HTMLElementTagNameMap[K]> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on") && typeof v === "function") {
      // @ts-expect-error - 이벤트 핸들러 동적 바인딩
      node[k] = v;
    } else if (k === "text") {
      node.textContent = String(v);
    } else if (k === "innerHTML") {
      node.innerHTML = String(v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export class SimpleContextMenu<TCtx = Ctx> {
  /** 동시에 여러 인스턴스가 떠 있을 때 서로 닫아주기 위한 레지스트리 */
  private static registry = new Set<SimpleContextMenu<any>>();

  private root: HTMLElement;
  private items: (MenuItem<TCtx> | "sep")[] = [];
  private ctx!: TCtx;
  private boundOutside: (e: Event) => void;

  static closeAllExcept(target: SimpleContextMenu<any>) {
    for (const m of SimpleContextMenu.registry) {
      if (m !== target) m.close();
    }
  }

  constructor(root: HTMLElement) {
    this.root = root;
    this.boundOutside = (e: Event) => {
      if (!this.root.contains(e.target as Node)) this.close();
    };
    SimpleContextMenu.registry.add(this);
  }

  setItems(items: (MenuItem<TCtx> | "sep")[]) {
    this.items = items;
    return this;
  }

  open(x: number, y: number, ctx: TCtx extends never ? any : TCtx) {
    SimpleContextMenu.closeAllExcept(this);
    this.ctx = ctx as TCtx;
    this.render();
    this.place(x, y);
    this.root.dataset.open = "true";
    document.addEventListener("pointerdown", this.boundOutside as any, { capture: true });
    document.addEventListener("keydown", this as any);
    // 첫 포커스 이동
    const first = this.root.querySelector<HTMLButtonElement>(".item:not([aria-disabled='true'])");
    first?.focus();
  }

  close() {
    if (this.root.dataset.open !== "true") return;
    this.root.dataset.open = "false";
    this.root.innerHTML = "";
    document.removeEventListener("pointerdown", this.boundOutside as any, { capture: true } as any);
    document.removeEventListener("keydown", this as any);
  }

  private place(x: number, y: number) {
    // 일단 표시해서 사이즈 측정
    this.root.style.left = "-9999px";
    this.root.style.top = "-9999px";
    this.root.style.display = "block";
    const r = this.root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + r.width > vw - 8) left = Math.max(8, vw - r.width - 8);
    if (top + r.height > vh - 8) top = Math.max(8, vh - r.height - 8);
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  /** 키보드 내비게이션 핸들러 */
  handleEvent(e: KeyboardEvent) {
    if (e.type !== "keydown") return;
    const focusable = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>(".item:not([aria-disabled='true'])")
    );
    const idx = focusable.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === "Escape") {
      this.close();
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      (focusable[idx + 1] || focusable[0])?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowUp") {
      (focusable[idx - 1] || focusable.at(-1))?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowRight") {
      const cur = document.activeElement as HTMLButtonElement | null;
      if (cur?.dataset.hasSub === "1") {
        cur.setAttribute("aria-expanded", "true");
        cur.nextElementSibling
          ?.querySelector<HTMLButtonElement>(".item:not([aria-disabled='true'])")
          ?.focus();
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      const sub = (document.activeElement as HTMLElement | null)?.closest(".submenu");
      const trigger = sub?.previousElementSibling as HTMLButtonElement | null;
      if (trigger) {
        trigger.focus();
        trigger.setAttribute("aria-expanded", "false");
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      (document.activeElement as HTMLButtonElement | null)?.click();
      e.preventDefault();
    }
  }

  /** 모든 펼친 서브메뉴 접기 */
  private collapseAll(from: HTMLElement = this.root) {
    from
      .querySelectorAll<HTMLButtonElement>(".item[aria-expanded='true']")
      .forEach((b) => b.setAttribute("aria-expanded", "false"));
  }

  private render() {
    this.root.innerHTML = "";
    const wrap = el("div");
    this.renderItems(this.items, wrap);
    this.root.appendChild(wrap);
  }

  private renderItems(items: (MenuItem<TCtx> | "sep")[], container: HTMLElement) {
    for (const it of items) {
      if (it === "sep") {
        container.appendChild(el("div", { class: "sep" }));
        continue;
      }
      const isDisabled =
        typeof it.disabled === "function" ? !!it.disabled(this.ctx) : !!it.disabled;
      const hasSub = Array.isArray(it.children) && it.children.length > 0;

      const btn = el(
        "button",
        {
          class: "item",
          role: "menuitem",
          "aria-disabled": String(isDisabled),
          tabindex: isDisabled ? "-1" : "0",
          ...(hasSub ? { "data-has-sub": "1", "aria-expanded": "false" } : {}),
          onpointerdown: (e: PointerEvent) => e.preventDefault(), // 포커스 유지
          onclick: () => {
            if (isDisabled) return;
            if (hasSub) {
              // 같은 레벨의 다른 서브메뉴 닫기
              btn.parentElement
                ?.querySelectorAll<HTMLButtonElement>(".item[aria-expanded='true']")
                .forEach((b) => {
                  if (b !== btn) b.setAttribute("aria-expanded", "false");
                });
              const next = btn.getAttribute("aria-expanded") === "true" ? "false" : "true";
              btn.setAttribute("aria-expanded", next);
              return;
            }
            // 일반 항목: 서브메뉴 전부 접고 액션, 닫기
            this.collapseAll();
            it.action?.(this.ctx);
            this.close();
          },
        },
        it.icon ? el("span", { text: it.icon }) : null,
        el("span", { text: it.label ?? "" }),
        hasSub ? el("span", { class: "right", text: "▶" }) : null
      );

      container.appendChild(btn);

      if (hasSub) {
        const sub = el("div", { class: "submenu", role: "menu" });
        this.renderItems(it.children!, sub);
        container.appendChild(sub);
      }
    }
  }
}
