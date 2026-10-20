import type { ReactNode } from "react";
import { useUiScale } from "./useUiScale";

/**
 * UI 缩放外壳：布局按 1/scale 占位，再整体放大。
 * 这样绝对定位的子元素还是按"逻辑视口"排版，视觉上正好铺满窗口。
 */
export function UiShell({ children }: { children: ReactNode }) {
  const scale = useUiScale();
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      {children}
    </div>
  );
}