import { useEffect, useRef } from "react";

/**
 * Kéo chuột để cuộn (pan) viewport của một phần tử overflow-auto.
 * - Nhấn giữ + kéo → cuộn theo chuột (giống kéo bảng/ảnh lớn).
 * - Kéo vượt ngưỡng threshold sẽ KHÔNG kích hoạt click (tránh mở popup khi kéo).
 * - Click thường (không kéo) vẫn hoạt động bình thường.
 */
export function useDragToScroll(ref, { threshold = 5 } = {}) {
    const dragRef = useRef(null); // { startX, startY, scrollLeft, scrollTop, dragging }
    const movedRef = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                scrollLeft: el.scrollLeft,
                scrollTop: el.scrollTop,
                dragging: false,
            };
            movedRef.current = false;
        };

        const onMouseMove = (e) => {
            const s = dragRef.current;
            if (!s) return;
            const dx = e.clientX - s.startX;
            const dy = e.clientY - s.startY;
            if (!s.dragging && Math.hypot(dx, dy) > threshold) {
                s.dragging = true;
                el.style.cursor = "grabbing";
                document.body.style.userSelect = "none";
            }
            if (s.dragging) {
                movedRef.current = true;
                el.scrollLeft = s.scrollLeft - dx;
                el.scrollTop = s.scrollTop - dy;
            }
        };

        const onMouseUp = () => {
            const s = dragRef.current;
            if (!s) return;
            if (s.dragging) {
                el.style.cursor = "";
                document.body.style.userSelect = "";
            }
            dragRef.current = null;
        };

        const onClickCapture = (e) => {
            // Nếu vừa kéo → chặn click (không mở popup)
            if (movedRef.current) {
                movedRef.current = false;
                e.preventDefault();
                e.stopPropagation();
            }
        };

        el.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        el.addEventListener("click", onClickCapture, true);

        return () => {
            el.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            el.removeEventListener("click", onClickCapture, true);
            el.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [ref, threshold]);
}
