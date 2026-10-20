import { useEffect, useState } from "react";
import { uiScale } from "../render/camera.ts";

/**
 * HUD 缩放：跟窗口高度走。
 * 用 CSS zoom 而不是 transform —— zoom 会参与布局，
 * 绝对定位的 HUD 元素不用重新算坐标。
 */
export function useUiScale(): number {
  const [scale, setScale] = useState(() => uiScale(window.innerHeight));

  useEffect(() => {
    const onResize = () => setScale(uiScale(window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return scale;
}
